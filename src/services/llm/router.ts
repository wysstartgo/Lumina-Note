import { Message, Intent, LLMConfig } from "./types";
import { createProvider } from "./factory";
import { getLLMConfig } from "./config";

export class IntentRouter {
  /**
   * 分析用户意图
   */
  async route(message: string, history: Message[] = []): Promise<Intent> {
    const config = getLLMConfig();
    
    // 如果未启用路由，默认返回 chat
    if (!config.routing?.enabled) {
      return { type: "chat", confidence: 1.0, reasoning: "Routing disabled" };
    }

    try {
      // 准备路由使用的配置
      // 使用专门的 intent 配置，如果未配置则回退到主配置
      const routerConfig: Partial<LLMConfig> = config.routing.intentProvider ? {
        provider: config.routing.intentProvider,
        apiKey: config.routing.intentApiKey || config.apiKey,
        model: config.routing.intentModel,
        customModelId: config.routing.intentCustomModelId,
        baseUrl: config.routing.intentBaseUrl,
      } : {};

      const provider = createProvider(routerConfig);

      // 构建 Prompt
      const systemPrompt = `你是一个意图分类器。分析用户的请求并将其归类为以下意图之一：

1. "chat": 闲聊、简单问题、问候。
2. "search": 询问查找笔记中的信息、搜索特定主题。
3. "create": 请求创建新笔记、撰写文章、生成大纲。
4. "edit": 请求修改、重写、修复、格式化现有文本/笔记，或向现有笔记写入新内容。
5. "organize": 请求整理笔记、创建文件夹、移动文件或清理。
6. "complex": 多步骤任务、编码、推理或需要深度分析的请求。

仅输出 JSON：{"type": "intent_type", "confidence": 0.0-1.0, "reasoning": "简短说明"}`;

      const messages: Message[] = [
        { role: "system", content: systemPrompt },
        // 仅使用最近的几条消息作为上下文
        ...history.slice(-3),
        { role: "user", content: message }
      ];

      const response = await provider.call(messages, { temperature: 0.1 });
      
      // 解析 JSON
      const content = response.content.replace(/```json\n?|\n?```/g, "").trim();
      const result = JSON.parse(content) as Intent;
      
      return {
        type: result.type || "chat",
        confidence: result.confidence || 0.5,
        reasoning: result.reasoning || "Parsed from LLM"
      };

    } catch (error) {
      console.error("[IntentRouter] Routing failed:", error);
      // 降级处理
      return { type: "chat", confidence: 0, reasoning: "Routing failed, fallback to chat" };
    }
  }
}

export const intentRouter = new IntentRouter();
