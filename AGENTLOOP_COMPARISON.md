# AgentLoop 功能对比：原版本 vs 优化版本

## 📊 功能清单对比

### 公共 API（保持不变）

| 功能 | 原版本 | 优化版本 | 说明 |
|------|--------|---------|------|
| `setMessages()` | ✅ | ✅ | 设置消息历史 |
| `startTask()` | ✅ | ✅ | 启动 Agent 任务 |
| `abort()` | ✅ | ✅ | 中止任务 |
| `approveToolCall()` | ✅ | ✅ | 审批工具调用 |
| `continueLoop()` | ✅ | ✅ | 继续执行循环 |
| `addTimeoutHint()` | ✅ | ✅ | 添加超时提示 |
| `getState()` | ✅ | ✅ | 获取当前状态 |
| `on()` | ✅ | ✅ | 事件监听 |

---

## 🔧 私有方法对比

### 核心循环

| 方法 | 原版本 | 优化版本 | 变化 |
|------|--------|---------|------|
| `runLoop()` | ✅ 基础版 | ✅ 增强版 | **新增**：上下文窗口管理、网络重试、更好的错误分类 |

### LLM 调用

| 方法 | 原版本 | 优化版本 | 变化 |
|------|--------|---------|------|
| `callLLM()` | ✅ 简单调用 | ❌ 移除 | 被 `callLLMWithRetry()` 替代 |
| `callLLMWithRetry()` | ❌ 无 | ✅ **新增** | **新功能**：指数退避重试、网络错误识别 |

### 工具处理

| 方法 | 原版本 | 优化版本 | 变化 |
|------|--------|---------|------|
| `handleToolCalls()` | ✅ 基础版 | ✅ 增强版 | **新增**：工具执行超时、性能监控、更好的错误提示 |
| `executeTool()` | ✅ 简单执行 | ❌ 移除 | 被 `executeToolWithTimeout()` 替代 |
| `executeToolWithTimeout()` | ❌ 无 | ✅ **新增** | **新功能**：60s 超时保护、Promise.race() 竞态 |

### 审批流程

| 方法 | 原版本 | 优化版本 | 变化 |
|------|--------|---------|------|
| `requiresApproval()` | ✅ | ✅ | 无变化 |
| `waitForApproval()` | ✅ 无超时 | ❌ 移除 | 被 `waitForApprovalWithTimeout()` 替代 |
| `waitForApprovalWithTimeout()` | ❌ 无 | ✅ **新增** | **新功能**：5分钟超时自动拒绝 |
| `cleanupApproval()` | ❌ 无 | ✅ **新增** | **新功能**：统一的审批清理逻辑 |

### 上下文管理

| 方法 | 原版本 | 优化版本 | 变化 |
|------|--------|---------|------|
| `enrichContextWithRAG()` | ✅ 基础版 | ✅ 增强版 | **新增**：字符长度限制（4000 字符）、智能截断 |
| `manageContextWindow()` | ❌ 无 | ✅ **新增** | **新功能**：滑动窗口、防止 token 溢出 |
| `buildUserContent()` | ✅ 基础版 | ✅ 增强版 | **新增**：activeNoteContent 长度限制（15000 字符） |

### 响应解析

| 方法 | 原版本 | 优化版本 | 变化 |
|------|--------|---------|------|
| 响应解析逻辑 | ✅ 内联在 runLoop | ✅ 提取为方法 | **重构**：`parseLLMResponse()` 提高可读性 |
| `parseLLMResponse()` | ❌ 无 | ✅ **新增** | **新功能**：统一的 FC 和 XML 解析 |

### 错误处理

| 方法 | 原版本 | 优化版本 | 变化 |
|------|--------|---------|------|
| `handleError()` | ✅ 基础版 | ❌ 移除 | 被拆分为 `handleLoopError()` 和 `handleFatalError()` |
| `handleLoopError()` | ❌ 无 | ✅ **新增** | **新功能**：循环内错误处理、逻辑错误计数 |
| `handleFatalError()` | ❌ 无 | ✅ **新增** | **新功能**：致命错误处理、审批清理 |
| `handleNoToolResponse()` | ✅ 基础版 | ✅ 增强版 | **改进**：逻辑更清晰，但仍复杂 |

---

## 🎯 新增功能详解

### 1. 智能错误恢复 ⭐⭐⭐⭐⭐

**原版本**：
```typescript
// 所有错误一视同仁，最多重试 3 次
if (this.stateManager.getConsecutiveErrors() >= MAX_CONSECUTIVE_ERRORS) {
    this.stateManager.setStatus("error");
}
```

**优化版本**：
```typescript
// 区分网络错误和逻辑错误
const isNetworkError = error.message && (
    error.message.includes("timeout") || 
    error.message.includes("network") || 
    error.status === 429 || 
    error.status >= 500
);

if (isNetworkError && retries < CONFIG.MAX_NETWORK_RETRIES) {
    // 网络错误：指数退避重试 (2s, 4s, 8s)
    const delay = Math.pow(2, retries) * 1000;
    await new Promise(r => setTimeout(r, delay));
    continue;
}

// 逻辑错误：最多 3 次
if (this.stateManager.getConsecutiveErrors() >= CONFIG.MAX_CONSECUTIVE_LOGIC_ERRORS) {
    this.stateManager.setStatus("error");
}
```

**优势**：
- 网络超时自动重试，不浪费 Agent 的逻辑错误计数
- 指数退避避免频繁重试
- 更快地识别真正的逻辑问题

---

### 2. 工具执行超时保护 ⭐⭐⭐⭐

**原版本**：
```typescript
// 无超时保护，工具可能永久卡住
const result = await this.toolRegistry.execute(toolCall.name, toolCall.params, context);
```

**优化版本**：
```typescript
private async executeToolWithTimeout(toolCall: ToolCall, context: TaskContext): Promise<ToolResult> {
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
        const res = await this.toolRegistry.execute(...);
        clearTimeout(timeoutId!);
        return res;
      } catch (error) {
        clearTimeout(timeoutId!);
        return { success: false, content: "", error: error.message };
      }
    })();

    return Promise.race([executionPromise, timeoutPromise]);
}
```

**优势**：
- 60 秒超时保护，防止工具卡住
- 返回友好的超时错误信息
- Agent 可以根据超时提示调整策略

---

### 3. 审批超时自动拒绝 ⭐⭐⭐⭐

**原版本**：
```typescript
private waitForApproval(): Promise<boolean> {
    return new Promise((resolve) => {
      this.approvalResolver = resolve;
      // 无超时，可能永久等待
    });
}
```

**优化版本**：
```typescript
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
      }, CONFIG.APPROVAL_TIMEOUT);  // 5 分钟
    });
}
```

**优势**：
- 5 分钟无响应自动拒绝，避免 Agent 永久卡住
- 用户可以继续使用应用

---

### 4. 上下文滑动窗口 ⭐⭐⭐⭐

**原版本**：
```typescript
// 消息无限增长，最终导致 token 溢出
this.stateManager.addMessage({ role: "user", content: resultMsg });
```

**优化版本**：
```typescript
private manageContextWindow(messages: Message[]): Message[] {
    if (messages.length <= CONFIG.MAX_CONTEXT_MESSAGES) {
        return messages;
    }

    const systemMsg = messages[0];
    const taskMsg = messages[1]?.role === 'user' ? messages[1] : null;
    const keepCount = CONFIG.MAX_CONTEXT_MESSAGES - (taskMsg ? 2 : 1);
    const recentMessages = messages.slice(-keepCount);

    // 保留 System + Task + 最近 N 条
    return [systemMsg, ...(taskMsg ? [taskMsg] : []), ...recentMessages];
}
```

**优势**：
- 防止消息无限增长
- 保留关键的 System 和 Task 消息
- 避免 token 溢出导致 LLM 调用失败

---

### 5. RAG 内容长度限制 ⭐⭐⭐⭐

**原版本**：
```typescript
// RAG 结果可能很长，导致 token 溢出
const topResults = context.ragResults.slice(0, 3);
topResults.forEach((r, i) => {
    const preview = r.content.length > 600 ? r.content.slice(0, 600) + "..." : r.content;
    content += `\n\n### ${i + 1}. ${r.filePath}\n${preview}`;
});
```

**优化版本**：
```typescript
// 智能截断：基于总字符数限制
let currentChars = 0;
const validResults: RAGSearchResult[] = [];

for (const r of results) {
    if (!r.filePath || !r.content) continue;
    
    if (currentChars + r.content.length > CONFIG.RAG_MAX_CHARS) {
        const remaining = CONFIG.RAG_MAX_CHARS - currentChars;
        if (remaining > 200) {
            validResults.push({ ...r, content: r.content.slice(0, remaining) + "..." });
        }
        break;
    }

    validResults.push({ ...r, score: r.score || 0 });
    currentChars += r.content.length;
}
```

**优势**：
- 限制 RAG 总字符数为 4000
- 避免 RAG 内容占用过多 token
- 更精确的长度控制

---

### 6. 性能监控 ⭐⭐⭐

**原版本**：
```typescript
// 无性能监控
const response = await callLLM(messages, { signal: this.abortController?.signal, tools });
```

**优化版本**：
```typescript
console.time(`LLM-Req-${reqId}`);
const response = await callLLM(messages, {
  signal: this.abortController?.signal,
  tools,
}, configOverride);
console.timeEnd(`LLM-Req-${reqId}`);

// 工具执行耗时
const startTime = Date.now();
const result = await this.executeToolWithTimeout(toolCall, context);
const duration = Date.now() - startTime;
console.log(`[Agent] 工具 ${toolCall.name} 执行耗时: ${duration}ms`);
```

**优势**：
- 可以追踪 LLM 请求和工具执行的性能
- 便于性能优化和问题诊断

---

## 📈 配置常量对比

**原版本**：
```typescript
const MAX_CONSECUTIVE_ERRORS = 3;
```

**优化版本**：
```typescript
const CONFIG = {
  MAX_CONSECUTIVE_LOGIC_ERRORS: 3,    // 逻辑错误最大重试
  MAX_NETWORK_RETRIES: 3,              // 网络错误最大重试
  TOOL_EXECUTION_TIMEOUT: 60000,       // 工具执行超时 (ms)
  APPROVAL_TIMEOUT: 300000,            // 审批超时 (5分钟)
  MAX_CONTEXT_MESSAGES: 20,            // 滑动窗口消息数
  RAG_MAX_CHARS: 4000,                 // RAG 内容最大字符数
};
```

**优势**：
- 配置更细粒度
- 易于调整和维护
- 更清晰的意图

---

## ✅ 功能完整性检查

### 保留的功能（100% 兼容）
- ✅ 消息历史管理
- ✅ 工具调用和执行
- ✅ 用户审批流程
- ✅ RAG 自动注入
- ✅ Function Calling 和 XML 解析
- ✅ 事件系统
- ✅ 中止和继续机制

### 新增的功能
- ✅ 网络错误自动重试（指数退避）
- ✅ 工具执行超时保护
- ✅ 审批超时自动拒绝
- ✅ 上下文滑动窗口
- ✅ RAG 内容长度限制
- ✅ 性能监控
- ✅ 更细粒度的错误分类

### 没有移除的功能
- ✅ 所有公共 API 保持不变
- ✅ 所有业务逻辑保持不变
- ✅ 所有状态管理保持不变

---

## 🚨 风险评估

| 风险 | 严重程度 | 说明 |
|------|---------|------|
| 上下文窗口逻辑错误 | 🔴 严重 | 可能导致消息顺序混乱 |
| 工具超时竞态 | 🟡 中等 | 后台任务可能继续执行 |
| RAG 截断丢失信息 | 🟡 中等 | 简单字符截断可能切断句子 |
| 审批超时状态混乱 | 🟡 中等 | 超时后用户操作可能无效 |

---

## 📝 总结

**原版本**：
- 功能完整但基础
- 缺少容错机制
- 可能出现永久卡住的情况
- 无性能监控

**优化版本**：
- 功能完整 + 增强
- 智能错误恢复
- 多层超时保护
- 上下文管理
- 性能监控
- 但存在 4 个潜在问题需要修复

