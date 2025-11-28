/**
 * LLM Provider 统一接口
 */

import { Message, LLMResponse, LLMOptions } from "../types";
import { getAIConfig } from "@/lib/ai";

/**
 * 调用 LLM
 */
export async function callLLM(
  messages: Message[],
  options?: LLMOptions
): Promise<LLMResponse> {
  const config = getAIConfig();

  if (!config.apiKey) {
    throw new Error("请先配置 API Key");
  }

  switch (config.provider) {
    case "anthropic":
      return callAnthropic(messages, config, options);
    case "openai":
      return callOpenAI(messages, config, options);
    case "moonshot":
      return callMoonshot(messages, config, options);
    default:
      throw new Error(`不支持的 AI 提供商: ${config.provider}`);
  }
}

// ============ Anthropic ============

async function callAnthropic(
  messages: Message[],
  config: { apiKey: string; model: string },
  options?: LLMOptions
): Promise<LLMResponse> {
  // 分离 system 消息
  const systemMessage = messages.find((m) => m.role === "system");
  const chatMessages = messages.filter((m) => m.role !== "system");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: options?.maxTokens || 4096,
      system: systemMessage?.content || "",
      messages: chatMessages.map((m) => ({
        role: m.role,
        content: m.content,
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

// ============ OpenAI ============

async function callOpenAI(
  messages: Message[],
  config: { apiKey: string; model: string; baseUrl?: string },
  options?: LLMOptions
): Promise<LLMResponse> {
  const baseUrl = config.baseUrl || "https://api.openai.com/v1";

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: options?.temperature || 0.7,
      max_tokens: options?.maxTokens || 4096,
    }),
    signal: options?.signal,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API 错误: ${error}`);
  }

  const data = await response.json();
  return {
    content: data.choices[0]?.message?.content || "",
    usage: data.usage
      ? {
          promptTokens: data.usage.prompt_tokens || 0,
          completionTokens: data.usage.completion_tokens || 0,
          totalTokens: data.usage.total_tokens || 0,
        }
      : undefined,
  };
}

// ============ Moonshot (Kimi) ============

async function callMoonshot(
  messages: Message[],
  config: { apiKey: string; model: string; baseUrl?: string },
  options?: LLMOptions
): Promise<LLMResponse> {
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
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: isThinkingModel ? 1.0 : (options?.temperature || 0.7),
      max_tokens: isThinkingModel ? 16000 : (options?.maxTokens || 4096),
    }),
    signal: options?.signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.error?.type === "engine_overloaded_error") {
        throw new Error("服务器繁忙，请稍后重试");
      }
      throw new Error(`Moonshot API 错误: ${errorJson.error?.message || errorText}`);
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
    if (message.reasoning_content) {
      content += `<thinking>\n${message.reasoning_content}\n</thinking>\n\n`;
    }
    content += message.content || "";
  }

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
