/**
 * 消息解析器 - 解析 LLM 响应中的工具调用和完成标记
 */

import { ToolCall } from "../types";

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
 */
export function formatToolResult(toolCall: ToolCall, result: { success: boolean; content: string; error?: string }): string {
  if (result.success) {
    return `<tool_result name="${toolCall.name}">
${result.content}
</tool_result>`;
  } else {
    return `<tool_error name="${toolCall.name}">
${result.error || result.content}
</tool_error>`;
  }
}

/**
 * 获取无工具使用的提示
 */
export function getNoToolUsedPrompt(): string {
  return `你的响应没有包含有效的工具调用。请使用 XML 格式调用工具来完成任务。

工具调用格式示例:
<read_note>
<paths>["笔记路径.md"]</paths>
</read_note>

如果任务已完成，请使用 attempt_completion 工具:
<attempt_completion>
<result>任务完成的描述</result>
</attempt_completion>`;
}
