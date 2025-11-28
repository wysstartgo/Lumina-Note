# Roo-Code Agent 实现分析

## 1. 整体架构

Roo-Code 是一个 VSCode 扩展，核心 Agent 功能基于以下组件：

- **[Task.ts](cci:7://file:///D:/Desktop/Lumina%20Note/Roo-Code/src/core/task/Task.ts:0:0-0:0)** (~4000行) - Agent 主循环和状态管理
- **[prompts/](cci:7://file:///D:/Desktop/Lumina%20Note/Roo-Code/src/core/prompts:0:0-0:0)** - System Prompt 构建系统
- **[tools/](cci:7://file:///D:/Desktop/Lumina%20Note/Roo-Code/src/core/tools:0:0-0:0)** - 工具定义和执行
- **[assistant-message/](cci:7://file:///D:/Desktop/Lumina%20Note/Roo-Code/src/core/assistant-message:0:0-0:0)** - LLM 响应解析

---

## 2. System Prompt 结构

System Prompt 在 [system.ts](cci:7://file:///D:/Desktop/Lumina%20Note/Roo-Code/src/core/prompts/system.ts:0:0-0:0) 中组装，由多个 sections 拼接而成：

```ts
@D:\Desktop\Lumina Note\Roo-Code\src\core\prompts\system.ts#119:143
const basePrompt = `${roleDefinition}

${markdownFormattingSection()}

${getSharedToolUseSection(effectiveProtocol)}${toolsCatalog}

${getToolUseGuidelinesSection(codeIndexManager, effectiveProtocol)}

${mcpServersSection}

${getCapabilitiesSection(...)}

${modesSection}

${getRulesSection(...)}

${getSystemInfoSection(cwd)}

${getObjectiveSection(codeIndexManager, experiments)}

${await addCustomInstructions(...)}`
```

### 2.1 角色定义 (Role Definition)

每个 Mode 都有专属的角色定义，例如 **Code 模式**：

```ts
@D:\Desktop\Lumina Note\Roo-Code\packages\types\src\mode.ts#150:158
{
    slug: "code",
    name: "💻 Code",
    roleDefinition:
        "You are Roo, a highly skilled software engineer with extensive knowledge in many programming languages, frameworks, design patterns, and best practices.",
    groups: ["read", "edit", "browser", "command", "mcp"],
}
```

### 2.2 工具使用指南 (Tool Use)

```ts
@D:\Desktop\Lumina Note\Roo-Code\src\core\prompts\sections\tool-use.ts#12:28
return `====

TOOL USE

You have access to a set of tools that are executed upon the user's approval. You must use exactly one tool per message, and every assistant message must include a tool call. You use tools step-by-step to accomplish a given task, with each tool use informed by the result of the previous tool use.

# Tool Use Formatting

Tool uses are formatted using XML-style tags. The tool name itself becomes the XML tag name. Each parameter is enclosed within its own set of tags. Here's the structure:

<actual_tool_name>
<parameter1_name>value1</parameter1_name>
<parameter2_name>value2</parameter2_name>
...
</actual_tool_name>

Always use the actual tool name as the XML tag name for proper parsing and execution.`
```

### 2.3 目标 (Objective)

```ts
@D:\Desktop\Lumina Note\Roo-Code\src\core\prompts\sections\objective.ts#17:27
return `====

OBJECTIVE

You accomplish a given task iteratively, breaking it down into clear steps and working through them methodically.

1. Analyze the user's task and set clear, achievable goals to accomplish it. Prioritize these goals in a logical order.
2. Work through these goals sequentially, utilizing available tools one at a time as necessary. Each goal should correspond to a distinct step in your problem-solving process. You will be informed on the work completed and what's remaining as you go.
3. Remember, you have extensive capabilities with access to a wide range of tools that can be used in powerful and clever ways as necessary to accomplish each goal. Before calling a tool, do some analysis. ${codebaseSearchInstruction}analyze the file structure provided in environment_details to gain context and insights for proceeding effectively. Next, think about which of the provided tools is the most relevant tool to accomplish the user's task...
4. Once you've completed the user's task, you must use the attempt_completion tool to present the result of the task to the user.
5. The user may provide feedback, which you can use to make improvements and try again...`
```

### 2.4 关键规则 (Rules)

```ts
@D:\Desktop\Lumina Note\Roo-Code\src\core\prompts\sections\rules.ts#135:181
return `====

RULES

- The project base directory is: ${cwd.toPosix()}
- All file paths must be relative to this directory...
- You cannot \`cd\` into a different directory to complete a task...
- Do not ask for more information than necessary...
- Your goal is to try to accomplish the user's task, NOT engage in a back and forth conversation.
- NEVER end attempt_completion result with a question...
- You are STRICTLY FORBIDDEN from starting your messages with "Great", "Certainly", "Okay", "Sure". You should NOT be conversational in your responses...
- It is critical you wait for the user's response after each tool use, in order to confirm the success of the tool use...`
```

---

## 3. Agent 循环实现

核心循环在 [Task.ts](cci:7://file:///D:/Desktop/Lumina%20Note/Roo-Code/src/core/task/Task.ts:0:0-0:0) 的 [initiateTaskLoop](cci:1://file:///D:/Desktop/Lumina%20Note/Roo-Code/src/core/task/Task.ts:2020:1-2056:2) 方法：

```ts
@D:\Desktop\Lumina Note\Roo-Code\src\core\task\Task.ts#2021:2056
private async initiateTaskLoop(userContent: Anthropic.Messages.ContentBlockParam[]): Promise<void> {
    // Kicks off the checkpoints initialization process in the background.
    getCheckpointService(this)

    let nextUserContent = userContent
    let includeFileDetails = true

    this.emit(RooCodeEventName.TaskStarted)

    while (!this.abort) {
        const didEndLoop = await this.recursivelyMakeClineRequests(nextUserContent, includeFileDetails)
        includeFileDetails = false // We only need file details the first time.

        // The way this agentic loop works is that cline will be given a
        // task that he then calls tools to complete. Unless there's an
        // attempt_completion call, we keep responding back to him with his
        // tool's responses until he either attempt_completion or does not
        // use anymore tools. If he does not use anymore tools, we ask him
        // to consider if he's completed the task...

        if (didEndLoop) {
            break
        } else {
            // No tools used - prompt to continue
            nextUserContent = [{ type: "text", text: formatResponse.noToolsUsed(toolProtocol) }]
            this.consecutiveMistakeCount++
        }
    }
}
```

### 流式处理

Agent 使用流式处理 LLM 响应，支持两种协议：
- **XML Protocol**: 使用 XML 标签解析工具调用
- **Native Protocol**: 使用原生 tool_call 机制（如 OpenAI 函数调用）

```ts
@D:\Desktop\Lumina Note\Roo-Code\src\core\task\Task.ts#2344:2537
switch (chunk.type) {
    case "reasoning": { ... }
    case "usage": { ... }
    case "tool_call_partial": {
        // 处理流式工具调用
        const events = NativeToolCallParser.processRawChunk({...})
        for (const event of events) {
            if (event.type === "tool_call_start") { ... }
            else if (event.type === "tool_call_delta") { ... }
            else if (event.type === "tool_call_end") { ... }
        }
    }
    case "text": {
        // XML协议：解析文本中的工具调用
        if (shouldUseXmlParser && this.assistantMessageParser) {
            this.assistantMessageContent = this.assistantMessageParser.processChunk(chunk.text)
        }
        // Native协议：纯文本处理
        else { ... }
    }
}
```

---

## 4. 工具定义示例

### execute_command

```ts
@D:\Desktop\Lumina Note\Roo-Code\src\core\prompts\tools\execute-command.ts#4:24
return `## execute_command
Description: Request to execute a CLI command on the system. Use this when you need to perform system operations or run specific commands to accomplish any step in the user's task. You must tailor your command to the user's system and provide a clear explanation of what the command does...
Parameters:
- command: (required) The CLI command to execute...
- cwd: (optional) The working directory to execute the command in (default: ${args.cwd})
Usage:
<execute_command>
<command>Your command here</command>
<cwd>Working directory path (optional)</cwd>
</execute_command>

Example: Requesting to execute npm run dev
<execute_command>
<command>npm run dev</command>
</execute_command>`
```

### read_file (支持多文件读取)

```ts
@D:\Desktop\Lumina Note\Roo-Code\src\core\prompts\tools\read-file.ts#7:26
return `## read_file
Description: Request to read the contents of ${isMultipleReadsEnabled ? "one or more files" : "a file"}. The tool outputs line-numbered content (e.g. "1 | const x = 1") for easy reference when creating diffs or discussing code.${args.partialReadsEnabled ? " Use line ranges to efficiently read specific portions of large files." : ""} Supports text extraction from PDF and DOCX files...

**IMPORTANT: You can read a maximum of ${maxConcurrentReads} files in a single request.**

Parameters:
- args: Contains one or more file elements, where each file contains:
  - path: (required) File path (relative to workspace directory ${args.cwd})
  - line_range: (optional) One or more line range elements in format "start-end"

Usage:
<read_file>
<args>
  <file>
    <path>path/to/file</path>
    <line_range>start-end</line_range>
  </file>
</args>
</read_file>`
```

---

## 5. Mode 系统

Roo-Code 实现了多模式系统，每个 Mode 有不同的角色定义和工具权限：

| Mode | 角色 | 工具组 |
|------|------|--------|
| **Architect** | 技术领导者/规划者 | read, edit(仅.md), browser, mcp |
| **Code** | 高级软件工程师 | read, edit, browser, command, mcp |
| **Ask** | 技术助手 | read, browser, mcp |
| **Debug** | 调试专家 | read, edit, browser, command, mcp |
| **Orchestrator** | 工作流协调者 | (无工具，只做任务委派) |

---

## 6. Prompt 工程关键技巧

1. **强制工具使用**: "You must use exactly one tool per message, and every assistant message must include a tool call"

2. **禁止闲聊**: "You are STRICTLY FORBIDDEN from starting your messages with 'Great', 'Certainly', 'Okay', 'Sure'"

3. **等待确认**: "It is critical you wait for the user's response after each tool use"

4. **错误恢复**: 当没有使用工具时，自动提示 [noToolsUsed](cci:1://file:///D:/Desktop/Lumina%20Note/Roo-Code/src/core/prompts/responses.ts:64:1-77:2) 错误并增加 `consecutiveMistakeCount`

5. **上下文注入**: 每次请求都会附加 `environment_details`，包含文件结构、活动终端等信息

6. **迭代式工作**: "Work through these goals sequentially, utilizing available tools one at a time"

---

## 总结

Roo-Code 的 Agent 实现核心是：
1. **System Prompt 模块化组装** - 角色定义 + 能力 + 规则 + 工具描述 + 目标
2. **While 循环驱动** - 持续调用 LLM 直到 [attempt_completion](cci:1://file:///D:/Desktop/Lumina%20Note/Roo-Code/src/core/prompts/tools/index.ts:48:1-48:68) 或用户中断
3. **工具结果反馈** - 每次工具执行后将结果作为下一轮 user message
4. **多 Mode 支持** - 不同场景使用不同角色定义和工具集


# Roo-Code RAG 实现分析

## 1. 架构概览

```
code-index/
├── manager.ts           # 单例管理器 - 对外 API
├── orchestrator.ts      # 索引流程编排
├── search-service.ts    # 语义搜索服务
├── config-manager.ts    # 配置管理
├── cache-manager.ts     # 文件哈希缓存（增量索引）
├── embedders/           # Embedding 提供商
│   ├── openai.ts
│   ├── openai-compatible.ts
│   ├── ollama.ts
│   ├── bedrock.ts
│   ├── gemini.ts
│   └── mistral.ts
├── vector-store/        # 向量存储
│   └── qdrant-client.ts  # Qdrant 向量数据库
└── processors/          # 代码处理器
    ├── scanner.ts       # 目录扫描
    └── file-watcher.ts  # 文件变更监听
```

## 2. 核心组件

### 2.1 Embedding 生成

支持多种 Embedding 提供商：

```ts
@D:\Desktop\Lumina Note\Roo-Code\src\services\code-index\embedders\openai.ts#50:126
async createEmbeddings(texts: string[], model?: string): Promise<EmbeddingResponse> {
    const modelToUse = model || this.defaultModelId  // 默认: text-embedding-3-small

    // 分批处理 + Token 限制
    while (remainingTexts.length > 0) {
        // 每批不超过 MAX_BATCH_TOKENS
        const currentBatch: string[] = []
        // ...
        const batchResult = await this._embedBatchWithRetries(currentBatch, modelToUse)
        allEmbeddings.push(...batchResult.embeddings)
    }

    return { embeddings: allEmbeddings, usage }
}
```

### 2.2 向量存储 (Qdrant)

```ts
@D:\Desktop\Lumina Note\Roo-Code\src\services\code-index\vector-store\qdrant-client.ts#13:84
export class QdrantVectorStore implements IVectorStore {
    private readonly vectorSize!: number
    private readonly DISTANCE_METRIC = "Cosine"  // 余弦相似度
    private client: QdrantClient

    constructor(workspacePath: string, url: string, vectorSize: number, apiKey?: string) {
        // 根据 workspace 生成 collection 名称
        const hash = createHash("sha256").update(workspacePath).digest("hex")
        this.collectionName = `ws-${hash.substring(0, 16)}`
        // ...
    }

    async initialize(): Promise<boolean> {
        // 创建 collection，使用 HNSW 索引
        await this.client.createCollection(this.collectionName, {
            vectors: {
                size: this.vectorSize,
                distance: this.DISTANCE_METRIC,
                on_disk: true,  // 支持大规模数据
            },
            hnsw_config: {
                m: 64,           // HNSW 图度数
                ef_construct: 512,
                on_disk: true,
            },
        })
    }
}
```

### 2.3 语义搜索

```ts
@D:\Desktop\Lumina Note\Roo-Code\src\services\code-index\search-service.ts#29:59
public async searchIndex(query: string, directoryPrefix?: string): Promise<VectorStoreSearchResult[]> {
    const minScore = this.configManager.currentSearchMinScore
    const maxResults = this.configManager.currentSearchMaxResults

    // 1. 生成查询向量
    const embeddingResponse = await this.embedder.createEmbeddings([query])
    const vector = embeddingResponse?.embeddings[0]

    // 2. 向量搜索
    const results = await this.vectorStore.search(vector, normalizedPrefix, minScore, maxResults)
    return results
}
```

### 2.4 索引流程编排

```ts
@D:\Desktop\Lumina Note\Roo-Code\src\services\code-index\orchestrator.ts#97:283
public async startIndexing(): Promise<void> {
    // 1. 初始化向量存储
    const collectionCreated = await this.vectorStore.initialize()

    // 2. 检查是否已有索引
    const hasExistingData = await this.vectorStore.hasIndexedData()

    if (hasExistingData && !collectionCreated) {
        // 增量扫描 - 只处理新增/变更文件
        await this.scanner.scanDirectory(this.workspacePath, ...)
    } else {
        // 全量扫描
        await this.scanner.scanDirectory(this.workspacePath, ...)
    }

    // 3. 启动文件监听器
    await this._startWatcher()
}
```

## 3. Agent 集成 - [codebase_search](cci:1://file:///D:/Desktop/Lumina%20Note/Roo-Code/src/core/prompts/tools/index.ts:51:1-51:62) 工具

```ts
@D:\Desktop\Lumina Note\Roo-Code\src\core\tools\CodebaseSearchTool.ts#67:91
try {
    const manager = CodeIndexManager.getInstance(context)

    // 调用 RAG 搜索
    const searchResults: VectorStoreSearchResult[] = await manager.searchIndex(query, directoryPrefix)

    // 返回给 LLM 的结果格式
    jsonResult.results.push({
        filePath: relativePath,
        score: result.score,
        startLine: result.payload.startLine,
        endLine: result.payload.endLine,
        codeChunk: result.payload.codeChunk.trim(),
    })
}
```

## 4. RAG 流程总结

```
┌─────────────────────────────────────────────────────────────┐
│                      索引阶段                                 │
├─────────────────────────────────────────────────────────────┤
│  代码文件 → 分块 → Embedding 生成 → 存入 Qdrant              │
│  (scanner)   (processor)  (embedder)    (vector-store)       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                      查询阶段                                 │
├─────────────────────────────────────────────────────────────┤
│  用户查询 → Query Embedding → 向量相似搜索 → 返回代码片段    │
│                  (embedder)      (qdrant)                    │
└─────────────────────────────────────────────────────────────┘
```

## 5. 配置要求

- **Embedding 服务**: OpenAI / Ollama / Bedrock / Gemini / Mistral
- **向量数据库**: Qdrant (默认 `http://localhost:6333`)
- **存储格式**: 每个代码块存储 `filePath`, `startLine`, `endLine`, `codeChunk`

---

这是一个生产级的 RAG 实现，支持：
- **增量索引** (通过文件哈希缓存)
- **实时更新** (文件监听器)
- **多 Embedding 提供商**
- **可配置的搜索参数** (minScore, maxResults)