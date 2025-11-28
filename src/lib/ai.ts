/**
 * AI Service for chat and file modifications
 */

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface FileReference {
  path: string;
  name: string;
  content?: string;
}

export interface EditSuggestion {
  filePath: string;
  originalContent: string;
  newContent: string;
  description: string;
}

export interface AIConfig {
  provider: "anthropic" | "openai" | "moonshot" | "ollama";
  apiKey: string;
  model: string;
  baseUrl?: string;
}

// Default config - user will configure their own API key
const DEFAULT_CONFIG: AIConfig = {
  provider: "moonshot",
  apiKey: "",
  model: "kimi-k2-thinking",
};

let config: AIConfig = { ...DEFAULT_CONFIG };

export function setAIConfig(newConfig: Partial<AIConfig>) {
  config = { ...config, ...newConfig };
}

export function getAIConfig(): AIConfig {
  return { ...config };
}

// Parse @file references from message
export function parseFileReferences(message: string): string[] {
  const regex = /@\[([^\]]+)\]|@(\S+\.md)/g;
  const matches: string[] = [];
  let match;
  while ((match = regex.exec(message)) !== null) {
    matches.push(match[1] || match[2]);
  }
  return matches;
}

// Build system prompt for file editing
function buildSystemPrompt(files: FileReference[]): string {
  let prompt = `你是一个智能笔记助手，专门帮助用户编辑和改进 Markdown 笔记。

你的能力：
1. 理解和分析笔记内容
2. 根据用户需求修改笔记
3. 优化数学公式的表达
4. 改进文章结构和逻辑

当用户要求修改文件时，请使用以下格式输出修改：

<edit file="文件路径">
<description>修改说明</description>
<original>
原始内容（用于定位，必须与当前文件内容完全匹配）
</original>
<modified>
修改后的内容
</modified>
</edit>

重要说明：
- <original> 中的内容必须是文件的【当前实际内容】，不是之前建议修改的内容
- 请始终以下面提供的最新文件内容为准
- 忽略对话历史中之前的修改建议，用户可能已拒绝那些修改
- 如果有多处修改，可以使用多个 <edit> 块
`;

  if (files.length > 0) {
    prompt += "\n\n【当前文件的最新内容】（以此为准）：\n";
    for (const file of files) {
      prompt += `\n=== ${file.name} ===\n`;
      prompt += file.content || "(内容未加载)";
      prompt += "\n=== 文件结束 ===\n";
    }
  }

  return prompt;
}

// Parse AI response for edit suggestions
export function parseEditSuggestions(response: string): EditSuggestion[] {
  const suggestions: EditSuggestion[] = [];
  const editRegex = /<edit file="([^"]+)">([\s\S]*?)<\/edit>/g;
  
  let match;
  while ((match = editRegex.exec(response)) !== null) {
    const filePath = match[1];
    const content = match[2];
    
    const descMatch = content.match(/<description>([\s\S]*?)<\/description>/);
    const origMatch = content.match(/<original>([\s\S]*?)<\/original>/);
    const modMatch = content.match(/<modified>([\s\S]*?)<\/modified>/);
    
    if (origMatch && modMatch) {
      suggestions.push({
        filePath,
        originalContent: origMatch[1].trim(),
        newContent: modMatch[1].trim(),
        description: descMatch ? descMatch[1].trim() : "内容修改",
      });
    }
  }
  
  return suggestions;
}

// Chat response with token usage
export interface ChatResponse {
  content: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// Call AI API
export async function chat(
  messages: Message[],
  files: FileReference[] = []
): Promise<ChatResponse> {
  if (!config.apiKey) {
    throw new Error("请先配置 API Key");
  }

  const systemPrompt = buildSystemPrompt(files);
  
  if (config.provider === "anthropic") {
    return callAnthropic(systemPrompt, messages);
  } else if (config.provider === "openai") {
    return callOpenAI(systemPrompt, messages);
  } else if (config.provider === "moonshot") {
    return callMoonshot(systemPrompt, messages);
  } else {
    throw new Error(`不支持的 AI 提供商: ${config.provider}`);
  }
}

async function callAnthropic(systemPrompt: string, messages: Message[]): Promise<ChatResponse> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: messages.map((m) => ({
        role: m.role === "system" ? "user" : m.role,
        content: m.content,
      })),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API 错误: ${error}`);
  }

  const data = await response.json();
  return {
    content: data.content[0]?.text || "",
    usage: data.usage ? {
      prompt_tokens: data.usage.input_tokens || 0,
      completion_tokens: data.usage.output_tokens || 0,
      total_tokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0),
    } : undefined,
  };
}

async function callOpenAI(systemPrompt: string, messages: Message[]): Promise<ChatResponse> {
  const baseUrl = config.baseUrl || "https://api.openai.com/v1";
  
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API 错误: ${error}`);
  }

  const data = await response.json();
  return {
    content: data.choices[0]?.message?.content || "",
    usage: data.usage,
  };
}

// Moonshot (Kimi K2) API - OpenAI compatible
async function callMoonshot(systemPrompt: string, messages: Message[]): Promise<ChatResponse> {
  const baseUrl = config.baseUrl || "https://api.moonshot.cn/v1";
  const isThinkingModel = config.model.includes("thinking");
  
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
      // Thinking 模型需要 temperature=1.0 和更大的 max_tokens
      temperature: isThinkingModel ? 1.0 : 0.7,
      max_tokens: isThinkingModel ? 16000 : 4096,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    try {
      const errorJson = JSON.parse(errorText);
      const msg = errorJson.error?.message || errorText;
      // 服务器过载时给出更友好的提示
      if (errorJson.error?.type === "engine_overloaded_error") {
        throw new Error("服务器繁忙，请稍后重试或切换到其他模型（如 Kimi K2 Preview）");
      }
      throw new Error(`Moonshot API 错误: ${msg}`);
    } catch (e) {
      if (e instanceof Error && e.message.includes("服务器繁忙")) throw e;
      throw new Error(`Moonshot API 错误: ${errorText}`);
    }
  }

  const data = await response.json();
  const message = data.choices[0]?.message;
  
  // 处理 thinking 模型的 reasoning_content
  let content = "";
  if (message) {
    // 如果有思考过程，添加到输出
    if (message.reasoning_content) {
      content += `<thinking>\n${message.reasoning_content}\n</thinking>\n\n`;
    }
    content += message.content || "";
  }
  
  return {
    content,
    usage: data.usage,
  };
}

// Apply edit suggestion to content
export function applyEdit(content: string, suggestion: EditSuggestion): string {
  const originalContent = suggestion.originalContent;
  const newContent = suggestion.newContent;
  
  // Try exact match first
  if (content.includes(originalContent)) {
    console.log("[applyEdit] Exact match found");
    return content.replace(originalContent, newContent);
  }
  
  // Try normalized match (normalize whitespace)
  const normalizeWhitespace = (s: string) => s.replace(/\r\n/g, "\n").replace(/\t/g, "  ");
  const normalizedContent = normalizeWhitespace(content);
  const normalizedOriginal = normalizeWhitespace(originalContent);
  
  if (normalizedContent.includes(normalizedOriginal)) {
    console.log("[applyEdit] Normalized match found");
    // Find the position and replace
    const idx = normalizedContent.indexOf(normalizedOriginal);
    return content.substring(0, idx) + newContent + content.substring(idx + originalContent.length);
  }
  
  // Try line-by-line fuzzy match
  const contentLines = content.split("\n");
  const origLines = originalContent.trim().split("\n").map(l => l.trim());
  
  // Find the first line that matches
  let startIdx = -1;
  for (let i = 0; i < contentLines.length; i++) {
    if (contentLines[i].trim() === origLines[0]) {
      // Check if subsequent lines match
      let allMatch = true;
      for (let j = 0; j < origLines.length && i + j < contentLines.length; j++) {
        if (contentLines[i + j].trim() !== origLines[j]) {
          allMatch = false;
          break;
        }
      }
      if (allMatch) {
        startIdx = i;
        break;
      }
    }
  }
  
  if (startIdx !== -1) {
    console.log("[applyEdit] Fuzzy match found at line", startIdx);
    const before = contentLines.slice(0, startIdx).join("\n");
    const after = contentLines.slice(startIdx + origLines.length).join("\n");
    return (before ? before + "\n" : "") + newContent + (after ? "\n" + after : "");
  }
  
  // Last resort: try to find any significant overlap
  const firstOrigLine = origLines[0];
  if (firstOrigLine && firstOrigLine.length > 10) {
    for (let i = 0; i < contentLines.length; i++) {
      if (contentLines[i].includes(firstOrigLine.substring(0, Math.min(30, firstOrigLine.length)))) {
        console.log("[applyEdit] Partial match found at line", i);
        const before = contentLines.slice(0, i).join("\n");
        const after = contentLines.slice(i + origLines.length).join("\n");
        return (before ? before + "\n" : "") + newContent + (after ? "\n" + after : "");
      }
    }
  }
  
  // If still no match, insert at a reasonable position or append
  console.warn("[applyEdit] No match found, appending new content");
  return content + "\n\n<!-- AI 修改 -->\n" + newContent;
}
