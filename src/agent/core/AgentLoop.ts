/**
 * Agent 主循环
 * 
 * 负责：
 * 1. 管理 Agent 生命周期
 * 2. 协调 LLM 调用和工具执行
 * 3. 处理用户审批流程
 */

import { 
  Message, 
  TaskContext, 
  ToolCall, 
  ToolResult,
  AgentEventHandler,
  AgentEventType,
  LLMResponse
} from "../types";
import { StateManager } from "./StateManager";
import { parseResponse, formatToolResult, getNoToolUsedPrompt } from "./MessageParser";
import { PromptBuilder } from "../prompts/PromptBuilder";
import { ToolRegistry } from "../tools/ToolRegistry";
import { callLLM } from "../providers";

const MAX_CONSECUTIVE_ERRORS = 3;

export class AgentLoop {
  private stateManager: StateManager;
  private promptBuilder: PromptBuilder;
  private toolRegistry: ToolRegistry;
  private abortController: AbortController | null = null;
  private approvalResolver: ((approved: boolean) => void) | null = null;

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
  async startTask(userMessage: string, context: TaskContext): Promise<void> {
    // 保存现有消息（不重置）
    const existingMessages = this.stateManager.getMessages();
    const hasHistory = existingMessages.length > 1; // 除了 system 消息外还有其他消息
    
    // 重置状态但保留消息历史
    this.stateManager.setStatus("running");
    this.stateManager.setTask(userMessage);
    this.stateManager.resetErrors();
    this.abortController = new AbortController();

    // 构建消息
    const systemPrompt = this.promptBuilder.build(context);
    const userContent = this.buildUserContent(userMessage, context);

    if (hasHistory) {
      // 保留历史，更新 system prompt，添加新用户消息
      const newMessages = existingMessages.map((msg, i) => 
        i === 0 && msg.role === "system" 
          ? { role: "system" as const, content: systemPrompt }
          : msg
      );
      newMessages.push({ role: "user", content: userContent });
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
      if (error instanceof Error && error.name === "AbortError") {
        this.stateManager.setStatus("aborted");
      } else {
        this.stateManager.setStatus("error");
        this.stateManager.setError(error instanceof Error ? error.message : "未知错误");
      }
    }
  }

  /**
   * 中止当前任务
   */
  abort(): void {
    this.abortController?.abort();
    this.stateManager.setStatus("aborted");
    
    // 如果正在等待审批，拒绝
    if (this.approvalResolver) {
      this.approvalResolver(false);
      this.approvalResolver = null;
    }
  }

  /**
   * 审批工具调用
   */
  approveToolCall(approved: boolean): void {
    if (this.approvalResolver) {
      this.approvalResolver(approved);
      this.approvalResolver = null;
    }
  }

  /**
   * 获取当前状态
   */
  getState() {
    return this.stateManager.getState();
  }

  /**
   * 事件监听
   */
  on(event: AgentEventType, handler: AgentEventHandler): () => void {
    return this.stateManager.on(event, handler);
  }

  // ============ 私有方法 ============

  /**
   * Agent 主循环
   */
  private async runLoop(context: TaskContext): Promise<void> {
    while (
      this.stateManager.getStatus() === "running" && 
      !this.abortController?.signal.aborted
    ) {
      try {
        // 1. 调用 LLM
        const messages = this.stateManager.getMessages();
        const response = await this.callLLM(messages);

        // 2. 解析响应
        const parsedResponse = parseResponse(response.content);

        // 3. 添加 assistant 消息
        this.stateManager.addMessage({
          role: "assistant",
          content: response.content,
        });

        // 4. 处理工具调用
        if (parsedResponse.toolCalls.length > 0) {
          // 检查是否包含 attempt_completion
          const hasCompletion = parsedResponse.toolCalls.some(
            (tc) => tc.name === "attempt_completion"
          );

          await this.handleToolCalls(parsedResponse.toolCalls, context);

          // 如果调用了 attempt_completion，任务完成，退出循环
          if (hasCompletion || parsedResponse.isCompletion) {
            this.stateManager.setStatus("completed");
            break;
          }
        } else if (parsedResponse.isCompletion) {
          // 任务完成（无工具调用但有完成标记）
          this.stateManager.setStatus("completed");
          break;
        } else {
          // 没有工具调用也没有完成标记
          this.stateManager.incrementErrors();
          
          if (this.stateManager.getConsecutiveErrors() >= MAX_CONSECUTIVE_ERRORS) {
            this.stateManager.setStatus("error");
            this.stateManager.setError("Agent 未能正确使用工具");
            break;
          }

          // 提示 LLM 使用工具
          this.stateManager.addMessage({
            role: "user",
            content: getNoToolUsedPrompt(),
          });
        }
      } catch (error) {
        this.handleError(error);
        
        if (this.stateManager.getStatus() === "error") {
          break;
        }
      }
    }
  }

  /**
   * 调用 LLM
   */
  private async callLLM(messages: Message[]): Promise<LLMResponse> {
    return callLLM(messages, {
      signal: this.abortController?.signal,
    });
  }

  /**
   * 处理工具调用
   */
  private async handleToolCalls(toolCalls: ToolCall[], context: TaskContext): Promise<void> {
    for (const toolCall of toolCalls) {
      // 检查是否被中止
      if (this.abortController?.signal.aborted) {
        break;
      }

      // 检查是否需要用户审批
      if (this.requiresApproval(toolCall)) {
        this.stateManager.setStatus("waiting_approval");
        this.stateManager.setPendingTool(toolCall);

        // 等待用户审批
        const approved = await this.waitForApproval();
        
        if (!approved) {
          this.stateManager.addMessage({
            role: "user",
            content: `用户拒绝了工具调用: ${toolCall.name}。请尝试其他方式或询问用户需求。`,
          });
          this.stateManager.setStatus("running");
          continue;
        }
      }

      // 执行工具
      const result = await this.executeTool(toolCall, context);

      // 将结果添加到消息
      this.stateManager.addMessage({
        role: "user",
        content: formatToolResult(toolCall, result),
      });

      this.stateManager.resetErrors();
    }

    this.stateManager.setStatus("running");
    this.stateManager.setPendingTool(null);
  }

  /**
   * 判断工具是否需要用户审批
   */
  private requiresApproval(toolCall: ToolCall): boolean {
    return this.toolRegistry.requiresApproval(toolCall.name);
  }

  /**
   * 等待用户审批
   */
  private waitForApproval(): Promise<boolean> {
    return new Promise((resolve) => {
      this.approvalResolver = resolve;
    });
  }

  /**
   * 执行工具
   */
  private async executeTool(toolCall: ToolCall, context: TaskContext): Promise<ToolResult> {
    try {
      return await this.toolRegistry.execute(toolCall.name, toolCall.params, {
        workspacePath: context.workspacePath,
        activeNotePath: context.activeNote,
      });
    } catch (error) {
      return {
        success: false,
        content: "",
        error: error instanceof Error ? error.message : "工具执行失败",
      };
    }
  }

  /**
   * 构建用户消息内容
   */
  private buildUserContent(message: string, context: TaskContext): string {
    let content = `<task>\n${message}\n</task>`;

    // 如果有当前打开的笔记，添加其内容
    if (context.activeNote && context.activeNoteContent) {
      content += `\n\n<current_note path="${context.activeNote}">\n${context.activeNoteContent}\n</current_note>`;
    }

    return content;
  }

  /**
   * 处理错误
   */
  private handleError(error: unknown): void {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        this.stateManager.setStatus("aborted");
        return;
      }
      
      this.stateManager.incrementErrors();
      
      if (this.stateManager.getConsecutiveErrors() >= MAX_CONSECUTIVE_ERRORS) {
        this.stateManager.setStatus("error");
        this.stateManager.setError(error.message);
      } else {
        // 添加错误信息让 LLM 重试
        this.stateManager.addMessage({
          role: "user",
          content: `发生错误: ${error.message}。请重试。`,
        });
      }
    }
  }
}

// 导出单例
let agentLoop: AgentLoop | null = null;

export function getAgentLoop(): AgentLoop {
  if (!agentLoop) {
    agentLoop = new AgentLoop();
  }
  return agentLoop;
}

export function resetAgentLoop(): void {
  agentLoop = null;
}
