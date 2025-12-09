/**
 * OpenAI Provider
 * 兼容所有 OpenAI API 格式的服务
 * 支持多模态输入（图片）
 */

import type { Message, MessageContent, LLMConfig, LLMOptions, LLMResponse, LLMProvider } from "../types";

// 转换消息内容为 OpenAI 格式
function convertContent(content: MessageContent): string | Array<{ type: string; text?: string; image_url?: { url: string } }> {
  // 纯文本直接返回
  if (typeof content === 'string') {
    return content;
  }
  
  // 多模态内容转换
  return content.map(item => {
    if (item.type === 'text') {
      return { type: 'text', text: item.text };
    } else if (item.type === 'image') {
      return {
        type: 'image_url',
        image_url: {
          url: `data:${item.source.mediaType};base64,${item.source.data}`
        }
      };
    }
    return { type: 'text', text: '' };
  });
}

export class OpenAIProvider implements LLMProvider {
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  async call(messages: Message[], options?: LLMOptions): Promise<LLMResponse> {
    const baseUrl = this.config.baseUrl || "https://api.openai.com/v1";
    const url = `${baseUrl}/chat/completions`;

    const requestBody = {
      model: this.config.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: convertContent(m.content),
      })),
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens || 4096,
      stream: false,
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: options?.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API 错误 (${response.status}): ${error}`);
    }

    const data = await response.json();

    // 兼容多种 API 响应格式
    const message = data.choices?.[0]?.message;
    const delta = data.choices?.[0]?.delta;
    
    const content = 
      message?.content ||
      delta?.content ||
      message?.text ||
      data.choices?.[0]?.text ||
      "";

    return {
      content,
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens || 0,
            completionTokens: data.usage.completion_tokens || 0,
            totalTokens: data.usage.total_tokens || 0,
          }
        : undefined,
    };
  }
}
