/**
 * Anthropic (Claude) Provider
 * 支持多模态输入（图片）
 */

import type { Message, MessageContent, LLMConfig, LLMOptions, LLMResponse, LLMProvider } from "../types";

// 转换消息内容为 Anthropic 格式
function convertContent(content: MessageContent): string | Array<{ type: string; text?: string; source?: { type: string; media_type: string; data: string } }> {
  // 纯文本直接返回
  if (typeof content === 'string') {
    return content;
  }
  
  // 多模态内容转换为 Anthropic 格式
  return content.map(item => {
    if (item.type === 'text') {
      return { type: 'text', text: item.text };
    } else if (item.type === 'image') {
      return {
        type: 'image',
        source: {
          type: 'base64',
          media_type: item.source.mediaType,
          data: item.source.data
        }
      };
    }
    return { type: 'text', text: '' };
  });
}

// 提取 system 消息的纯文本内容
function getSystemText(content: MessageContent): string {
  if (typeof content === 'string') {
    return content;
  }
  // 多模态内容中提取文本
  return content
    .filter(item => item.type === 'text')
    .map(item => (item as { type: 'text'; text: string }).text)
    .join('\n');
}

export class AnthropicProvider implements LLMProvider {
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  async call(messages: Message[], options?: LLMOptions): Promise<LLMResponse> {
    // 分离 system 消息 (Anthropic 要求 system 单独传)
    const systemMessage = messages.find((m) => m.role === "system");
    const chatMessages = messages.filter((m) => m.role !== "system");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: options?.maxTokens || 4096,
        system: systemMessage ? getSystemText(systemMessage.content) : "",
        messages: chatMessages.map((m) => ({
          role: m.role,
          content: convertContent(m.content),
        })),
      }),
      signal: options?.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API 错误: ${error}`);
    }

    const data = await response.json();
    return {
      content: data.content[0]?.text || "",
      usage: data.usage
        ? {
            promptTokens: data.usage.input_tokens || 0,
            completionTokens: data.usage.output_tokens || 0,
            totalTokens:
              (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0),
          }
        : undefined,
    };
  }
}
