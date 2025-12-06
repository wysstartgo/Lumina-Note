/**
 * Agent 主循环
 * 
 * 职责：
 * 1. 管理 Agent 生命周期
 * 2. 协调 LLM 调用和工具执行
 * 3. 处理用户审批流程
 * 
 * 修复说明 (Fix for Frontend Display):
 * - 修复了 attempt_completion 成功后多余的 User 消息导致前端无法显示 finalAnswer 的问题。
 * - 优化了上下文窗口算法，防止截断关键的最新消息。
 */

import {
  Message,
  TaskContext,
  ToolCall,
  ToolResult,
  AgentEventHandler,
  AgentEventType,
  LLMResponse,
  RAGSearchResult,
  LLMConfig
} from "../types";
import { StateManager } from "./StateManager";
import { parseResponse, formatToolResult, getNoToolUsedPrompt } from "./MessageParser";
import { PromptBuilder } from "../prompts/PromptBuilder";
import { ToolRegistry } from "../tools/ToolRegistry";
import { callLLM } from "../providers";
import { useRAGStore } from "@/stores/useRAGStore";
import { getToolSchemas } from "../tools/schemas";

// ============ 配置常量 ============
const CONFIG = {
  MAX_CONSECUTIVE_LOGIC_ERRORS: 3, // 逻辑错误（如参数错误）最大连续重试次数
  MAX_NETWORK_RETRIES: 3,          // 网络/系统错误最大重试次数
  TOOL_EXECUTION_TIMEOUT: 60000,   // 工具执行超时 (ms)
  APPROVAL_TIMEOUT: 300000,        // 审批超时 (5分钟)
  MAX_CONTEXT_MESSAGES: 40,        // 滑动窗口保留的消息数量（增大以保留更多历史）
  RAG_MAX_CHARS: 4000,             // RAG 注入内容最大字符数
};

export class AgentLoop {
  private stateManager: StateManager;
  private promptBuilder: PromptBuilder;
  private toolRegistry: ToolRegistry;
  private abortController: AbortController | null = null;
  
  // 审批相关
  private approvalResolver: ((approved: boolean) => void) | null = null;
  private approvalTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.stateManager = new StateManager();
    this.promptBuilder = new PromptBuilder();
    this.toolRegistry = new ToolRegistry();
  }

  // ============ 公共 API ============

  /**
   * 设置消息历史（用于恢复会话）
   */
  setMessages(messages: Message[]): void {
    this.stateManager.setMessages(messages);
  }

  /**
   * 启动 Agent 任务
   */
  async startTask(userMessage: string, context: TaskContext, configOverride?: Partial<LLMConfig>): Promise<void> {
    const existingMessages = this.stateManager.getMessages();
    const hasHistory = existingMessages.length > 1;

    // 初始化状态
    this.stateManager.setStatus("running");
    this.stateManager.setTask(userMessage);
    this.stateManager.resetErrors();
    this.stateManager.setLLMConfig(configOverride);
    this.abortController = new AbortController();

    // RAG 自动注入：搜索相关笔记 (带长度限制)
    const enrichedContext = await this.enrichContextWithRAG(userMessage, context);

    // 构建 Prompt
    const systemPrompt = this.promptBuilder.build(enrichedContext);
    const userContent = this.buildUserContent(userMessage, enrichedContext);

    if (hasHistory) {
      // 保留历史，更新 system prompt，添加新用户消息
      let newMessages = existingMessages.map((msg, i) =>
        i === 0 && msg.role === "system"
          ? { role: "system" as const, content: systemPrompt }
          : msg
      );
      newMessages.push({ role: "user", content: userContent });
      
      // 应用滑动窗口
      newMessages = this.manageContextWindow(newMessages);
      this.stateManager.setMessages(newMessages);
    } else {
      // 首次任务，初始化消息
      this.stateManager.setMessages([
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ]);
    }

    // 进入主循环
    try {
      await this.runLoop(context);
    } catch (error) {
      this.handleFatalError(error);
    }
  }

  /**
   * 中止当前任务
   */
  abort(): void {
    this.abortController?.abort();
    this.stateManager.setStatus("aborted");
    this.cleanupApproval(false); // 拒绝挂起的审批
  }

  /**
   * 审批工具调用
   */
  approveToolCall(approved: boolean): void {
    this.cleanupApproval(approved);
  }

  /**
   * 继续执行循环（用于超时重试）
   */
  async continueLoop(context: TaskContext, configOverride?: Partial<LLMConfig>): Promise<void> {
    this.abortController = new AbortController();
    this.stateManager.setLLMConfig(configOverride);
    this.stateManager.setStatus("running");

    try {
      await this.runLoop(context);
      if (this.stateManager.getStatus() === "running") {
        this.stateManager.setStatus("completed");
      }
    } catch (error) {
      this.handleFatalError(error);
    }
  }

  addTimeoutHint(hint: string): void {
    this.stateManager.addMessage({ role: "user", content: hint });
  }

  getState() {
    return this.stateManager.getState();
  }

  on(event: AgentEventType, handler: AgentEventHandler): () => void {
    return this.stateManager.on(event, handler);
  }

  // ============ 私有方法：主循环 ============

  private async runLoop(context: TaskContext): Promise<void> {
    while (
      this.stateManager.getStatus() === "running" &&
      !this.abortController?.signal.aborted
    ) {
      try {
        // 1. 上下文维护 (再次检查，确保循环中产生的新消息不会导致溢出)
        const currentMessages = this.manageContextWindow(this.stateManager.getMessages());
        if (currentMessages.length !== this.stateManager.getMessages().length) {
            this.stateManager.setMessages(currentMessages);
        }

        const toolNames = context.mode?.tools || [];

        // 2. 调用 LLM (带网络重试机制)
        const response = await this.callLLMWithRetry(currentMessages, toolNames);

        // 3. 解析响应 (统一 FC 和 XML)
        const { toolCalls, isCompletion, content, isFCMode } = this.parseLLMResponse(response);

        // 4. 构建 Assistant 消息
        // 如果是 FC 模式，我们将工具调用序列化为 XML 附加在后面，保持历史记录格式一致性
        let assistantContent = content;
        if (isFCMode && toolCalls.length > 0) {
          const toolCallsXml = toolCalls.map(tc => {
            const paramsXml = Object.entries(tc.params)
              .map(([key, value]) => `<${key}>${typeof value === 'object' ? JSON.stringify(value) : value}</${key}>`)
              .join('\n');
            return `<${tc.name}>\n${paramsXml}\n</${tc.name}>`;
          }).join('\n\n');
          
          // 避免重复追加
          if (!content.includes(`<${toolCalls[0].name}>`)) {
             assistantContent = content ? `${content}\n\n${toolCallsXml}` : toolCallsXml;
          }
        }

        this.stateManager.addMessage({
          role: "assistant",
          content: assistantContent,
        });

        // 5. 处理工具或结果
        if (toolCalls.length > 0) {
          await this.handleToolCalls(toolCalls, context);

          // handleToolCalls 内部如果执行了 attempt_completion，会将状态设为 completed
          // 此时应立即退出循环
          if (this.stateManager.getStatus() === "completed") {
            break;
          }
        } else if (isCompletion) {
          this.stateManager.setStatus("completed");
          break;
        } else {
          // 处理无工具调用的情况 (纯文本回复检查)
          const shouldStop = this.handleNoToolResponse(content, context);
          if (shouldStop) break;
        }
      } catch (error) {
        // 捕获循环内的非致命错误
        const fatal = this.handleLoopError(error);
        if (fatal) break;
      }
    }
  }

  // ============ 私有方法：LLM 调用与重试 ============

  private async callLLMWithRetry(messages: Message[], toolNames?: string[]): Promise<LLMResponse> {
    const configOverride = this.stateManager.getLLMConfig();
    const tools = toolNames ? getToolSchemas(toolNames) : undefined;
    let retries = 0;

    while (true) {
      try {
        this.stateManager.setLLMRequestStartTime(Date.now());
        this.stateManager.incrementLLMRequestCount();
        const reqId = this.stateManager.getLLMRequestCount();
        
        console.time(`LLM-Req-${reqId}`);
        const response = await callLLM(messages, {
          signal: this.abortController?.signal,
          tools,
        }, configOverride);
        console.timeEnd(`LLM-Req-${reqId}`);

        this.stateManager.setLLMRequestStartTime(null);
        return response;

      } catch (error: any) {
        this.stateManager.setLLMRequestStartTime(null);
        
        if (this.abortController?.signal.aborted || error.name === "AbortError") {
          throw error;
        }

        // 识别可重试的系统错误
        const isNetworkError = error.message && (
            error.message.includes("timeout") || 
            error.message.includes("network") || 
            error.message.includes("fetch failed") || 
            error.status === 429 || 
            error.status >= 500
        );

        if (isNetworkError && retries < CONFIG.MAX_NETWORK_RETRIES) {
            retries++;
            const delay = Math.pow(2, retries) * 1000;
            console.warn(`[Agent] LLM 网络错误，${delay}ms 后重试 (${retries}/${CONFIG.MAX_NETWORK_RETRIES}): ${error.message}`);
            await new Promise(r => setTimeout(r, delay));
            continue;
        }

        throw error;
      }
    }
  }

  // ============ 私有方法：工具处理 (FIXED) ============

  private async handleToolCalls(toolCalls: ToolCall[], context: TaskContext): Promise<void> {
    for (const toolCall of toolCalls) {
      if (this.abortController?.signal.aborted) break;

      // 1. 审批流程 (带超时)
      if (this.requiresApproval(toolCall)) {
        this.stateManager.setStatus("waiting_approval");
        this.stateManager.setPendingTool(toolCall);
        
        try {
            const approved = await this.waitForApprovalWithTimeout();
            if (!approved) {
                this.stateManager.addMessage({
                    role: "user",
                    content: `用户（或系统超时）拒绝了工具调用: ${toolCall.name}。\n请使用 <thinking> 分析原因并尝试替代方案。`,
                });
                this.stateManager.setStatus("running");
                continue; // 跳过此工具
            }
        } catch (e) {
            console.error("审批流程异常", e);
            continue;
        } finally {
            this.cleanupApproval(false);
        }
      }

      // 2. 执行工具 (带超时)
      const startTime = Date.now();
      const result = await this.executeToolWithTimeout(toolCall, context);
      const duration = Date.now() - startTime;
      
      console.log(`[Agent] 工具 ${toolCall.name} 执行耗时: ${duration}ms`);

      // 3. 特殊处理：Completion 结果 (关键修复)
      // 一旦 attempt_completion 成功，立即添加结果并返回，防止添加多余的 User 消息
      if (toolCall.name === "attempt_completion") {
        if (result.success) {
            const completionResult = typeof toolCall.params.result === 'string' 
                ? toolCall.params.result 
                : JSON.stringify(toolCall.params.result);
                
            // 务必使用 Assistant 角色，因为前端提取 finalAnswer 是从 Assistant 消息中提取的
            if (completionResult) {
                this.stateManager.addMessage({
                    role: "assistant",
                    content: `<attempt_completion_result>\n${completionResult}\n</attempt_completion_result>`,
                });
            }
            
            // 标记完成
            this.stateManager.setStatus("completed");
            
            // ⚠️ FIX: 直接返回，不执行下方添加 User 消息的代码
            // 这样前端看到的消息序列就是: [...Assistant(calls tool), Assistant(result)]
            // 而不是被 User 消息截断
            return; 
        }
        // 如果失败，则继续向下，执行标准的错误报告流程
      }

      // 4. 格式化常规工具结果与错误引导
      let resultMsg = formatToolResult(toolCall, result);
      
      if (!result.success) {
        const isTimeout = result.error?.includes("超时");
        resultMsg += `\n\n❌ 执行失败 (耗时 ${duration}ms)。\n错误信息: ${result.error}`;
        resultMsg += isTimeout
            ? `\n建议：操作可能过于耗时，请尝试减少处理的数据量或分步执行。`
            : `\n建议：请仔细检查参数格式和路径是否存在。必须使用 <thinking> 分析错误原因。`;
      }

      // 添加 User 消息（仅当不是成功的 attempt_completion 时执行到这里）
      this.stateManager.addMessage({ role: "user", content: resultMsg });

      // 只要尝试了工具调用，就重置逻辑错误计数
      if (result.success) {
        this.stateManager.resetErrors();
      }
    }

    this.stateManager.setStatus("running");
    this.stateManager.setPendingTool(null);
  }

  /**
   * 带超时熔断的工具执行
   */
  private async executeToolWithTimeout(toolCall: ToolCall, context: TaskContext): Promise<ToolResult> {
    let timeoutId: NodeJS.Timeout;
    
    const timeoutPromise = new Promise<ToolResult>((resolve) => {
      timeoutId = setTimeout(() => {
        resolve({
          success: false,
          content: "",
          error: `工具执行超时 (${CONFIG.TOOL_EXECUTION_TIMEOUT / 1000}秒)`,
        });
      }, CONFIG.TOOL_EXECUTION_TIMEOUT);
    });

    const executionPromise = (async () => {
      try {
        const res = await this.toolRegistry.execute(toolCall.name, toolCall.params, {
          workspacePath: context.workspacePath,
          activeNotePath: context.activeNote,
        });
        clearTimeout(timeoutId!);
        return res;
      } catch (error) {
        clearTimeout(timeoutId!);
        return {
          success: false,
          content: "",
          error: error instanceof Error ? error.message : "工具执行失败",
        };
      }
    })();

    return Promise.race([executionPromise, timeoutPromise]);
  }

  // ============ 私有方法：审批管理 ============

  private requiresApproval(toolCall: ToolCall): boolean {
    return this.toolRegistry.requiresApproval(toolCall.name);
  }

  private waitForApprovalWithTimeout(): Promise<boolean> {
    return new Promise((resolve) => {
      this.approvalResolver = resolve;
      
      this.approvalTimer = setTimeout(() => {
        if (this.approvalResolver) {
          console.warn("[Agent] 审批等待超时，自动拒绝");
          this.approvalResolver(false);
          this.approvalResolver = null;
          this.approvalTimer = null;
        }
      }, CONFIG.APPROVAL_TIMEOUT);
    });
  }

  private cleanupApproval(approved: boolean) {
    if (this.approvalTimer) {
      clearTimeout(this.approvalTimer);
      this.approvalTimer = null;
    }
    if (this.approvalResolver) {
      this.approvalResolver(approved);
      this.approvalResolver = null;
    }
  }

  // ============ 私有方法：上下文管理 ============

  /**
   * 智能滑动窗口
   * 策略：System(含历史摘要) + Task + 最近 N 条
   * 
   * 改进：截断时生成已执行工具的摘要，附加到 System Prompt 中
   * 这样不会破坏前端的轮次分组逻辑
   */
  private manageContextWindow(messages: Message[]): Message[] {
    if (messages.length <= CONFIG.MAX_CONTEXT_MESSAGES) {
      return messages;
    }

    const systemMsg = messages[0];
    // 假设第二条是用户最初的任务指令
    const taskMsg = messages[1]?.role === 'user' ? messages[1] : null;
    
    // 计算要保留的最近消息数量（预留 2 个位置：system + task）
    const keepCount = CONFIG.MAX_CONTEXT_MESSAGES - 2;
    const recentMessages = messages.slice(-keepCount);
    
    // 生成被截断消息的摘要
    const truncatedMessages = messages.slice(2, messages.length - keepCount);
    const toolSummary = this.summarizeTruncatedMessages(truncatedMessages);

    // 把历史摘要附加到 System Prompt 中（不插入新的 user 消息）
    const systemMsgWithSummary: Message = toolSummary
      ? {
          role: "system",
          content: `${systemMsg.content}\n\n====\n\n[历史操作记录 - 请勿重复执行以下已完成的操作]\n${toolSummary}`
        }
      : systemMsg;

    const newHistory: Message[] = [systemMsgWithSummary];
    
    if (taskMsg && !recentMessages.includes(taskMsg)) {
      newHistory.push(taskMsg);
    }

    console.log(`[Agent] 上下文修剪: ${messages.length} -> ${newHistory.length + recentMessages.length}，截断了 ${truncatedMessages.length} 条消息`);
    return [...newHistory, ...recentMessages];
  }

  /**
   * 生成被截断消息的摘要
   * 提取已执行的工具调用和关键文件路径
   */
  private summarizeTruncatedMessages(messages: Message[]): string {
    const toolCalls: Map<string, Set<string>> = new Map(); // toolName -> Set<paths>
    
    for (const msg of messages) {
      // 从 tool_result 中提取工具名和参数
      const resultMatches = msg.content.matchAll(/<tool_result name="([^"]+)"[^>]*>([\s\S]*?)<\/tool_result>/g);
      for (const match of resultMatches) {
        const toolName = match[1];
        if (!toolCalls.has(toolName)) {
          toolCalls.set(toolName, new Set());
        }
        
        // 尝试提取文件路径
        const pathMatch = match[0].match(/(?:文件|路径|目录)[：:]\s*([^\s\n<]+)/);
        if (pathMatch) {
          toolCalls.get(toolName)!.add(pathMatch[1]);
        }
      }
      
      // 从 assistant 消息中提取工具调用
      const toolMatches = msg.content.matchAll(/<(read_note|list_notes|edit_note|create_note|search_notes|grep_search)>/g);
      for (const match of toolMatches) {
        const toolName = match[1];
        if (!toolCalls.has(toolName)) {
          toolCalls.set(toolName, new Set());
        }
      }
    }
    
    if (toolCalls.size === 0) {
      return "";
    }
    
    // 生成摘要
    const lines: string[] = [];
    for (const [toolName, paths] of toolCalls) {
      if (paths.size > 0) {
        const pathList = [...paths].slice(0, 5).join(", ");
        const more = paths.size > 5 ? ` 等 ${paths.size} 个` : "";
        lines.push(`- ${toolName}: ${pathList}${more}`);
      } else {
        lines.push(`- ${toolName}: 已调用`);
      }
    }
    
    return lines.join("\n");
  }

  private async enrichContextWithRAG(userMessage: string, context: TaskContext): Promise<TaskContext> {
    if (userMessage.length < 5) return context;

    try {
      const ragStore = useRAGStore.getState();
      if (!ragStore.config.enabled || !ragStore.ragManager?.isInitialized()) return context;

      const results = await ragStore.ragManager.search(userMessage, { limit: 10 });
      if (results.length === 0) return context;

      // 智能截断：基于字符总数限制
      let currentChars = 0;
      const validResults: RAGSearchResult[] = [];

      for (const r of results) {
        if (!r.filePath || !r.content) continue;
        
        if (currentChars + r.content.length > CONFIG.RAG_MAX_CHARS) {
            // 如果还没满，尝试放入截断版
            const remaining = CONFIG.RAG_MAX_CHARS - currentChars;
            if (remaining > 200) {
                 validResults.push({ ...r, content: r.content.slice(0, remaining) + "..." });
            }
            break;
        }

        validResults.push({ ...r, score: r.score || 0 });
        currentChars += r.content.length;
      }

      return { ...context, ragResults: validResults };
    } catch (error) {
      console.error("[Agent] RAG 搜索失败:", error);
      return context;
    }
  }

  // ============ 辅助方法 ============

  private parseLLMResponse(response: LLMResponse) {
    let toolCalls: ToolCall[] = [];
    let isCompletion = false;
    let isFCMode = false;

    if (response.toolCalls && response.toolCalls.length > 0) {
      isFCMode = true;
      toolCalls = response.toolCalls.map(tc => ({
        name: tc.name,
        params: tc.arguments,
        raw: JSON.stringify(tc),
      }));
      isCompletion = toolCalls.some(tc => tc.name === "attempt_completion");
    } else {
      const parsed = parseResponse(response.content);
      toolCalls = parsed.toolCalls;
      isCompletion = parsed.isCompletion;
    }
    return { toolCalls, isCompletion, content: response.content, isFCMode };
  }

  private handleNoToolResponse(content: string, context: TaskContext): boolean {
    const cleanContent = content.replace(/<thinking>[\s\S]*?<\/thinking>/g, "").trim();
    const intent = context.intent;
    
    // 允许纯文本的情况
    if (intent === "chat") {
        this.stateManager.setStatus("completed");
        return true;
    }

    const isActionIntent = ["create", "edit", "organize"].includes(intent || "");
    const isQuestion = cleanContent.includes("?") || cleanContent.includes("？");
    const hasPotentialToolTag = /<[a-z]+(_[a-z]+)+/i.test(cleanContent);

    // 如果不是强制操作意图，或者是提问，允许通过
    if (!hasPotentialToolTag && cleanContent.length > 0) {
        if (isQuestion || (!isActionIntent)) {
            this.stateManager.setStatus("completed");
            return true;
        }
    }

    // 视为逻辑错误
    this.handleLoopError(new Error("Agent 未使用工具且不符合纯文本回复条件"));
    if (this.stateManager.getStatus() === "error") return true;

    this.stateManager.addMessage({ role: "user", content: getNoToolUsedPrompt() });
    return false;
  }

  private handleLoopError(error: unknown): boolean {
    if (error instanceof Error) {
        if (error.name === "AbortError") {
            this.stateManager.setStatus("aborted");
            return true;
        }
        
        // 记录逻辑错误
        this.stateManager.incrementErrors();
        if (this.stateManager.getConsecutiveErrors() >= CONFIG.MAX_CONSECUTIVE_LOGIC_ERRORS) {
            this.stateManager.setStatus("error");
            this.stateManager.setError(error.message);
            return true;
        } else {
            // 反馈给 Agent
            this.stateManager.addMessage({
                role: "user",
                content: `❌ 系统检测到异常: ${error.message}。\n请使用 <thinking> 标签分析原因并尝试修复。`
            });
            return false;
        }
    }
    return true;
  }

  private handleFatalError(error: unknown): void {
    if (error instanceof Error && error.name === "AbortError") {
      this.stateManager.setStatus("aborted");
    } else {
      this.stateManager.setStatus("error");
      this.stateManager.setError(error instanceof Error ? error.message : "未知错误");
    }
    this.cleanupApproval(false);
  }

  private buildUserContent(message: string, context: TaskContext): string {
    let content = `<task>\n${message}\n</task>`;
    if (context.activeNote && context.activeNoteContent) {
        const noteContent = context.activeNoteContent.length > 15000 
            ? context.activeNoteContent.slice(0, 15000) + "\n...(文件过长已截断)"
            : context.activeNoteContent;
        content += `\n\n<current_note path="${context.activeNote}">\n${noteContent}\n</current_note>`;
    }
    if (context.ragResults && context.ragResults.length > 0) {
      content += `\n\n<related_notes hint="相关参考资料">`;
      context.ragResults.forEach((r, i) => {
        content += `\n\n### ${i + 1}. ${r.filePath}\n${r.content}`;
      });
      content += `\n</related_notes>`;
    }
    return content;
  }
}

// 导出单例
let agentLoop: AgentLoop | null = null;
export function getAgentLoop(): AgentLoop {
  if (!agentLoop) agentLoop = new AgentLoop();
  return agentLoop;
}
export function resetAgentLoop(): void {
  agentLoop = null;
}