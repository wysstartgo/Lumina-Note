/**
 * 消息解析器 - 解析 LLM 响应中的工具调用和完成标记
 * 支持多语言国际化
 */

import { ToolCall } from "../types";
import { getCurrentTranslations } from "@/stores/useLocaleStore";

export interface ParsedResponse {
  text: string;
  toolCalls: ToolCall[];
  isCompletion: boolean;
}

/**
 * 解析 LLM 响应
 * 支持 XML 格式的工具调用
 */
export function parseResponse(content: string): ParsedResponse {
  const toolCalls: ToolCall[] = [];
  let isCompletion = false;

  // 解析工具调用 - 匹配 XML 格式
  // 例如: <read_note><paths>["test.md"]</paths></read_note>
  const toolRegex = /<(\w+)>([\s\S]*?)<\/\1>/g;
  let match;

  while ((match = toolRegex.exec(content)) !== null) {
    const toolName = match[1];
    const toolContent = match[2];
    const raw = match[0];

    // 跳过非工具标签 (如 thinking, description 等)
    const nonToolTags = ["thinking", "description", "original", "modified", "edit"];
    if (nonToolTags.includes(toolName.toLowerCase())) {
      continue;
    }

    // 检查是否是 attempt_completion
    if (toolName === "attempt_completion") {
      isCompletion = true;
      const params = parseToolParams(toolContent);
      toolCalls.push({ name: toolName, params, raw });
      continue;
    }

    // 解析工具参数
    const params = parseToolParams(toolContent);
    
    // 只有包含参数的才是有效工具调用
    if (Object.keys(params).length > 0) {
      toolCalls.push({ name: toolName, params, raw });
    }
  }

  return {
    text: content,
    toolCalls,
    isCompletion,
  };
}

/**
 * 解析工具参数
 * 从 XML 内容中提取参数
 */
function parseToolParams(content: string): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  
  // 匹配参数标签 <paramName>value</paramName>
  const paramRegex = /<(\w+)>([\s\S]*?)<\/\1>/g;
  let match;

  while ((match = paramRegex.exec(content)) !== null) {
    const paramName = match[1];
    const paramValue = match[2].trim();

    // 尝试解析 JSON
    try {
      params[paramName] = JSON.parse(paramValue);
    } catch {
      // 不是 JSON，保持原始字符串
      params[paramName] = paramValue;
    }
  }

  return params;
}

/**
 * 格式化工具结果为消息
 * 对内容长度进行限制，避免请求体过大导致 HTTP/2 协议错误
 * 包含 params 签名用于前端精确匹配
 */
export function formatToolResult(toolCall: ToolCall, result: { success: boolean; content: string; error?: string }): string {
  const MAX_CONTENT_LENGTH = 8000; // 单个工具结果最大字符数

  let content = result.success ? result.content : (result.error || result.content);

  // 生成参数签名（用于前端精确匹配同名工具调用）
  const paramsSignature = toolCall.raw
    .replace(/\s+/g, " ")
    .slice(0, 100)
    .replace(/"/g, "&quot;");  // 转义引号

  if (content.length > MAX_CONTENT_LENGTH) {
    const t = getCurrentTranslations();
    const truncatedMsg = t.prompts.agent.messageParser.contentTruncated.replace('{length}', String(result.content.length));
    content = content.slice(0, MAX_CONTENT_LENGTH) + `\n\n${truncatedMsg}`;
  }

  const attributes = [`name="${toolCall.name}"`, `params="${paramsSignature}"`];
  const tagName = result.success ? "tool_result" : "tool_error";

  return `<${tagName} ${attributes.join(" ")}>
${content}
</${tagName}>`;
}

/**
 * 获取无工具使用的提示
 */
export function getNoToolUsedPrompt(): string {
  const t = getCurrentTranslations();
  return t.prompts.agent.messageParser.noToolUsed;
}
