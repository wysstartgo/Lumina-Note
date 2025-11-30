/**
 * LLM Service 统一入口
 */

// 类型导出
export type {
  Message,
  LLMConfig,
  LLMOptions,
  LLMResponse,
  LLMUsage,
  LLMProvider,
  LLMProviderType,
  ProviderMeta,
  ModelMeta,
  StreamChunk,
  LLMStream,
} from "./types";

// Provider 注册表
export { PROVIDER_REGISTRY } from "./types";

// 配置管理
export { getLLMConfig, setLLMConfig, resetLLMConfig } from "./config";

// Providers
export { 
  AnthropicProvider, 
  OpenAIProvider,
  GeminiProvider,
  MoonshotProvider,
  DeepSeekProvider,
  GroqProvider,
  OpenRouterProvider,
  OllamaProvider,
} from "./providers";

// ============ 统一调用接口 ============

import type { Message, LLMOptions, LLMResponse, LLMProvider, LLMStream } from "./types";
import { getLLMConfig } from "./config";
import { 
  AnthropicProvider, 
  OpenAIProvider,
  GeminiProvider,
  MoonshotProvider,
  DeepSeekProvider,
  GroqProvider,
  OpenRouterProvider,
  OllamaProvider,
} from "./providers";

/**
 * 根据当前配置创建 Provider 实例
 */
export function createProvider(): LLMProvider {
  const rawConfig = getLLMConfig();

  // Ollama 不需要 API Key
  if (!rawConfig.apiKey && rawConfig.provider !== "ollama") {
    throw new Error("请先配置 API Key");
  }

  // 处理自定义模型：当 model === "custom" 时使用 customModelId
  const config = {
    ...rawConfig,
    model: rawConfig.model === "custom" && rawConfig.customModelId 
      ? rawConfig.customModelId 
      : rawConfig.model,
  };

  switch (config.provider) {
    case "anthropic":
      return new AnthropicProvider(config);
    case "openai":
      return new OpenAIProvider(config);
    case "gemini":
      return new GeminiProvider(config);
    case "moonshot":
      return new MoonshotProvider(config);
    case "deepseek":
      return new DeepSeekProvider(config);
    case "groq":
      return new GroqProvider(config);
    case "openrouter":
      return new OpenRouterProvider(config);
    case "ollama":
      return new OllamaProvider(config);
    default:
      throw new Error(`不支持的 AI 提供商: ${config.provider}`);
  }
}

/**
 * 调用 LLM (统一入口)
 */
export async function callLLM(
  messages: Message[],
  options?: LLMOptions
): Promise<LLMResponse> {
  const provider = createProvider();
  return provider.call(messages, options);
}

/**
 * 流式调用 LLM (统一入口)
 * 返回 AsyncGenerator，逐块 yield 内容
 */
export async function* callLLMStream(
  messages: Message[],
  options?: LLMOptions
): LLMStream {
  const provider = createProvider();
  
  // 检查 Provider 是否支持流式
  if (!provider.stream) {
    // 降级：不支持流式的 Provider 一次性返回
    const response = await provider.call(messages, options);
    yield { type: "text", text: response.content };
    if (response.usage) {
      yield {
        type: "usage",
        inputTokens: response.usage.promptTokens,
        outputTokens: response.usage.completionTokens,
        totalTokens: response.usage.totalTokens,
      };
    }
    return;
  }
  
  // 使用 Provider 的流式方法
  yield* provider.stream(messages, options);
}
