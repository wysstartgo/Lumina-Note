# Agent 编辑实时预览 - 开发文档

> **版本**: 1.0  
> **创建日期**: 2025-11-29  
> **状态**: 待开发  
> **预计工时**: 3-4 天

---

## 1. 功能概述

### 1.1 目标

当 Agent 执行 `edit_note` 工具修改笔记时，用户能够：
1. **自动看到目标文件** - 编辑器自动切换到被修改的文件
2. **实时观看修改过程** - 类似"有人在打字"的动画效果
3. **清晰识别变更内容** - 修改的行/内容有高亮标记

### 1.2 参考效果

- **Cursor AI**: 编辑时有逐字出现的动画，完成后变更处有绿色/红色标记
- **GitHub Copilot**: 灰色预览 → 接受后变为正常颜色

### 1.3 技术方案

采用 **假流式（回放）** 方案：
```
Agent 完成编辑 → 计算 diff → 动画播放变更 → 高亮保持
```

**选择理由**：
- 不需要改造 Agent 核心循环
- 动画节奏可控，用户体验稳定
- 实现复杂度相对较低

---

## 2. 现有代码参考

> ⚠️ **重要**：开发前必须阅读此章节，了解现有实现，避免冗余修改或找不到正确位置。

### 2.1 EditNoteTool.ts（需修改）

**位置**: `src/agent/tools/executors/EditNoteTool.ts`

**当前完整代码**:

```typescript
/**
 * edit_note 工具执行器
 */

import { ToolExecutor, ToolResult, ToolContext } from "../../types";
import { readFile, writeFile } from "@/lib/tauri";
import { join } from "@/lib/path";

interface EditOperation {
  search: string;
  replace: string;
}

export const EditNoteTool: ToolExecutor = {
  name: "edit_note",
  requiresApproval: true, // 写操作，需要审批

  async execute(
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const path = params.path as string;
    const edits = params.edits as EditOperation[];

    if (!path) {
      return {
        success: false,
        content: "",
        error: "参数错误: 缺少 path 参数",
      };
    }

    if (!Array.isArray(edits) || edits.length === 0) {
      return {
        success: false,
        content: "",
        error: "参数错误: edits 必须是非空数组",
      };
    }

    try {
      const fullPath = join(context.workspacePath, path);
      let content = await readFile(fullPath);
      // ============================================
      // 🆕 修改点1: 在此处保存 oldContent
      // const oldContent = content;
      // ============================================

      const appliedEdits: string[] = [];
      const failedEdits: string[] = [];

      for (let i = 0; i < edits.length; i++) {
        const edit = edits[i];

        if (!edit.search || edit.replace === undefined) {
          failedEdits.push(`编辑 ${i + 1}: 缺少 search 或 replace`);
          continue;
        }

        // 尝试精确匹配
        if (content.includes(edit.search)) {
          content = content.replace(edit.search, edit.replace);
          appliedEdits.push(`编辑 ${i + 1}: 成功`);
        } else {
          // 尝试规范化空白后匹配
          const normalizedContent = content.replace(/\r\n/g, "\n");
          const normalizedSearch = edit.search.replace(/\r\n/g, "\n");

          if (normalizedContent.includes(normalizedSearch)) {
            content = normalizedContent.replace(normalizedSearch, edit.replace);
            appliedEdits.push(`编辑 ${i + 1}: 成功 (规范化匹配)`);
          } else {
            failedEdits.push(
              `编辑 ${i + 1}: 未找到匹配内容。请确保 search 内容与文件完全一致。`
            );
          }
        }
      }

      if (appliedEdits.length > 0) {
        // 写入文件
        await writeFile(fullPath, content);
        
        // ============================================
        // 🆕 修改点2: 写入后触发实时预览
        // const { setPendingEdit } = useEditorStore.getState();
        // const { openFile } = useFileStore.getState();
        // 
        // // 自动打开文件
        // await openFile(fullPath);
        // 
        // // 设置待播放的编辑
        // setPendingEdit({
        //   path: fullPath,
        //   oldContent,
        //   newContent: content,
        // });
        // ============================================

        const summary = [
          `文件: ${path}`,
          `成功应用: ${appliedEdits.length} 处修改`,
          ...appliedEdits,
        ];

        if (failedEdits.length > 0) {
          summary.push(`失败: ${failedEdits.length} 处`, ...failedEdits);
        }

        return {
          success: true,
          content: summary.join("\n"),
        };
      } else {
        return {
          success: false,
          content: "",
          error: `所有编辑都失败了:\n${failedEdits.join("\n")}`,
        };
      }
    } catch (error) {
      return {
        success: false,
        content: "",
        error: `编辑文件失败: ${error instanceof Error ? error.message : "未知错误"}`,
      };
    }
  },
};
```

### 2.2 CodeMirrorEditor.tsx（需修改）

**位置**: `src/editor/CodeMirrorEditor.tsx`

**关键结构**:

```typescript
// 第 1-16 行：导入
import { useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import { EditorState } from "@codemirror/state";
import {
  EditorView,
  keymap,
  Decoration,
  DecorationSet,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view";
// ...

// 第 18-25 行：Props 接口
interface CodeMirrorEditorProps {
  content: string;
  onChange: (content: string) => void;
  className?: string;
  isDark?: boolean;
  livePreview?: boolean;
}

// 第 27-31 行：暴露给父组件的方法
export interface CodeMirrorEditorRef {
  getScrollLine: () => number;
  scrollToLine: (line: number) => void;
  // 🆕 修改点: 可添加 getView() 获取 EditorView 实例
}

// 第 106-139 行：MathWidget 类（参考现有 Widget 实现）
class MathWidget extends WidgetType {
  // ... 可参考此实现创建动画光标 Widget
}

// 第 142-238 行：mathPlugin（参考现有 ViewPlugin 模式）
const mathPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    
    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view);
    }
    
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.buildDecorations(update.view);
      }
    }
    
    buildDecorations(view: EditorView): DecorationSet {
      // ... 构建装饰
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);

// 第 393-463 行：主组件
export const CodeMirrorEditor = forwardRef<CodeMirrorEditorRef, CodeMirrorEditorProps>(
  function CodeMirrorEditor({ content, onChange, className = "", isDark = false, livePreview = true }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  // ...
  
  // 第 435-450 行：创建编辑器的 extensions 数组
  // 🆕 修改点: 在此处添加 agentEditState 和 agentEditTheme
  const state = EditorState.create({
    doc: content,
    extensions: [
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      markdown({ base: markdownLanguage }),
      lightTheme,
      isDark ? oneDark : [],
      ...(livePreview ? [livePreviewPlugin, mathPlugin] : []),
      markdownStylePlugin,
      updateListener,
      EditorView.lineWrapping,
      // 🆕 添加: agentEditState, agentEditTheme
    ],
  });
  
  // 第 465-496 行：同步外部内容变化
  // 🆕 修改点: 需要在这里集成动画触发逻辑
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    
    if (content === lastInternalContent.current) {
      return;
    }
    
    const currentContent = view.state.doc.toString();
    if (currentContent !== content) {
      // ... 现有的内容同步逻辑
    }
  }, [content]);
  
  // 🆕 新增: 监听 pendingEdit 变化，触发动画
  // useEffect(() => { ... }, [pendingEdit?.id]);
});
```

### 2.3 useFileStore.ts（可能需修改）

**位置**: `src/stores/useFileStore.ts`

**关键方法**:

```typescript
// 第 152-224 行：openFile 方法
openFile: async (path: string, addToHistory: boolean = true) => {
  // ... 
  // 🆕 注意: 此方法已经能正确打开文件并更新编辑器
  // EditNoteTool 可以直接调用此方法
  set({ 
    tabs: newTabs,
    activeTabIndex: newTabIndex,
    currentFile: path,
    currentContent: content, 
    isDirty: false, 
    // ...
  });
};

// 第 516-559 行：updateContent 方法
updateContent: (content: string, source: "user" | "ai" = "user", description?: string) => {
  // ...
  // 🆕 注意: AI 编辑时会自动创建撤销点
  if (source === "ai") {
    const entry: HistoryEntry = {
      content: currentContent,
      type: "ai",
      timestamp: now,
      description: description || "AI 修改",
    };
    set({ 
      currentContent: content, 
      isDirty: true,
      undoStack: [...undoStack, entry],
      redoStack: [],
    });
  }
};
```

### 2.4 现有扩展目录

**位置**: `src/editor/extensions/`

```
src/editor/extensions/
└── livePreview.ts    # 现有：实时预览扩展（已废弃，逻辑已合并到 CodeMirrorEditor.tsx）

🆕 新增:
└── agentEdit.ts      # Agent 编辑动画扩展
```

### 2.5 关键依赖关系图

```
                    ┌─────────────────────┐
                    │   AgentLoop.ts      │
                    │  (调用工具执行器)    │
                    └──────────┬──────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────┐
│                  EditNoteTool.ts                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ 1. 读取文件 (readFile)                               │ │
│  │ 2. 应用编辑 (search/replace)                         │ │
│  │ 3. 写入文件 (writeFile)                              │ │
│  │ 4. 🆕 触发预览:                                      │ │
│  │    - useFileStore.openFile(path)                     │ │
│  │    - useEditorStore.setPendingEdit({...})            │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
                               │
              ┌────────────────┴────────────────┐
              │                                 │
              ▼                                 ▼
┌─────────────────────────┐       ┌─────────────────────────┐
│    useFileStore.ts      │       │   useEditorStore.ts     │
│  - openFile()           │       │   🆕 新建                │
│  - currentFile          │       │  - pendingEdit          │
│  - currentContent       │       │  - animationState       │
└────────────┬────────────┘       └────────────┬────────────┘
             │                                  │
             └──────────────┬───────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────┐
│               CodeMirrorEditor.tsx                        │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ 监听 pendingEdit 变化                                │ │
│  │ → 创建 AgentEditAnimator                            │ │
│  │ → 播放动画 (逐字插入 + 滚动跟随)                     │ │
│  │ → 完成后显示高亮 (Decoration)                        │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  extensions:                                              │
│  - agentEditState (StateField)                           │
│  - agentEditTheme (样式)                                  │
└──────────────────────────────────────────────────────────┘
```

---

## 3. 技术架构

### 3.1 模块划分

```
src/
├── editor/
│   ├── CodeMirrorEditor.tsx      # 主编辑器（需修改）
│   └── extensions/
│       ├── livePreview.ts        # 现有：实时预览扩展
│       └── agentEdit.ts          # 🆕 Agent 编辑动画扩展
├── agent/
│   └── tools/
│       └── executors/
│           └── EditNoteTool.ts   # 编辑工具（需修改）
├── stores/
│   └── useEditorStore.ts         # 🆕 编辑器状态 Store
└── lib/
    └── diffUtils.ts              # 🆕 Diff 计算工具
```

### 3.2 数据流

```
┌─────────────────────────────────────────────────────────────────┐
│                        Agent 执行 edit_note                      │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  EditNoteTool.execute()                                          │
│  1. 读取原始内容 (oldContent)                                     │
│  2. 应用编辑得到新内容 (newContent)                                │
│  3. 触发实时预览事件                                              │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  useEditorStore                                                   │
│  - pendingEdit: { path, oldContent, newContent, changes }        │
│  - animationState: 'idle' | 'playing' | 'completed'              │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  CodeMirrorEditor                                                 │
│  1. 检测到 pendingEdit 变化                                       │
│  2. 自动切换到目标文件                                            │
│  3. 播放动画：逐步应用 changes                                    │
│  4. 完成后显示高亮                                                │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 依赖库

| 库 | 版本 | 用途 |
|---|------|------|
| `diff` | ^5.1.0 | 计算文本差异 |
| `@codemirror/view` | 现有 | Decoration API |
| `@codemirror/state` | 现有 | StateEffect/StateField |

---

## 4. 详细设计

### 4.1 useEditorStore（新增）

```typescript
// src/stores/useEditorStore.ts

import { create } from "zustand";
import { diffLines, Change } from "diff";

interface PendingEdit {
  id: string;              // 唯一标识（用于去重）
  path: string;            // 目标文件路径
  oldContent: string;      // 原始内容
  newContent: string;      // 新内容
  changes: Change[];       // diff 结果
  timestamp: number;       // 触发时间
}

interface EditorState {
  // 待播放的编辑
  pendingEdit: PendingEdit | null;
  
  // 动画状态
  animationState: "idle" | "playing" | "completed";
  animationProgress: number; // 0-100
  
  // 高亮状态
  highlightedRanges: Array<{
    from: number;
    to: number;
    type: "added" | "removed" | "modified";
  }>;
  highlightExpireAt: number | null;
  
  // Actions
  setPendingEdit: (edit: Omit<PendingEdit, "id" | "changes" | "timestamp">) => void;
  startAnimation: () => void;
  updateProgress: (progress: number) => void;
  completeAnimation: () => void;
  clearHighlight: () => void;
  reset: () => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  pendingEdit: null,
  animationState: "idle",
  animationProgress: 0,
  highlightedRanges: [],
  highlightExpireAt: null,

  setPendingEdit: ({ path, oldContent, newContent }) => {
    const changes = diffLines(oldContent, newContent);
    set({
      pendingEdit: {
        id: `${path}-${Date.now()}`,
        path,
        oldContent,
        newContent,
        changes,
        timestamp: Date.now(),
      },
      animationState: "idle",
      animationProgress: 0,
    });
  },

  startAnimation: () => {
    set({ animationState: "playing" });
  },

  updateProgress: (progress) => {
    set({ animationProgress: progress });
  },

  completeAnimation: () => {
    set({
      animationState: "completed",
      animationProgress: 100,
      highlightExpireAt: Date.now() + 5000, // 5秒后清除高亮
    });
  },

  clearHighlight: () => {
    set({
      highlightedRanges: [],
      highlightExpireAt: null,
    });
  },

  reset: () => {
    set({
      pendingEdit: null,
      animationState: "idle",
      animationProgress: 0,
      highlightedRanges: [],
      highlightExpireAt: null,
    });
  },
}));
```

### 4.2 EditNoteTool 修改

```typescript
// src/agent/tools/executors/EditNoteTool.ts（修改）

import { useEditorStore } from "@/stores/useEditorStore";
import { useFileStore } from "@/stores/useFileStore";

export class EditNoteTool {
  async execute(params: EditNoteParams): Promise<ToolResult> {
    const { path, edits } = params;
    
    // 1. 读取原始内容
    const oldContent = await readFile(path);
    
    // 2. 应用编辑
    let newContent = oldContent;
    for (const edit of edits) {
      newContent = newContent.replace(edit.search, edit.replace);
    }
    
    // 3. 写入文件
    await writeFile(path, newContent);
    
    // 4. 🆕 触发实时预览
    const { setPendingEdit } = useEditorStore.getState();
    const { openFile } = useFileStore.getState();
    
    // 自动打开目标文件
    await openFile(path);
    
    // 设置待播放的编辑
    setPendingEdit({
      path,
      oldContent,
      newContent,
    });
    
    return {
      success: true,
      message: `成功编辑 ${path}`,
    };
  }
}
```

### 4.3 CodeMirror Agent 编辑扩展

```typescript
// src/editor/extensions/agentEdit.ts

import {
  EditorView,
  Decoration,
  DecorationSet,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
import {
  StateField,
  StateEffect,
  Range,
} from "@codemirror/state";
import { Change } from "diff";

// ==================== Effects ====================

// 开始动画播放
export const startAgentEdit = StateEffect.define<{
  changes: Change[];
  targetContent: string;
}>();

// 更新动画进度（追加内容）
export const updateAgentEdit = StateEffect.define<{
  content: string;
  position: number;
}>();

// 完成动画，设置高亮
export const completeAgentEdit = StateEffect.define<{
  highlights: Array<{ from: number; to: number; type: "added" | "modified" }>;
}>();

// 清除所有状态
export const clearAgentEdit = StateEffect.define<void>();

// ==================== Decorations ====================

// 添加内容的高亮样式
const addedHighlight = Decoration.mark({
  class: "cm-agent-added",
  attributes: { title: "Agent 添加" },
});

// 修改内容的高亮样式
const modifiedHighlight = Decoration.mark({
  class: "cm-agent-modified",
  attributes: { title: "Agent 修改" },
});

// 正在输入的光标动画
const typingCursor = Decoration.widget({
  widget: new (class extends WidgetType {
    toDOM() {
      const cursor = document.createElement("span");
      cursor.className = "cm-agent-cursor";
      cursor.textContent = "▌";
      return cursor;
    }
  })(),
  side: 1,
});

// ==================== State Field ====================

interface AgentEditState {
  isPlaying: boolean;
  highlights: DecorationSet;
  cursorPos: number | null;
}

export const agentEditState = StateField.define<AgentEditState>({
  create() {
    return {
      isPlaying: false,
      highlights: Decoration.none,
      cursorPos: null,
    };
  },
  
  update(state, tr) {
    let { isPlaying, highlights, cursorPos } = state;
    
    for (const effect of tr.effects) {
      if (effect.is(startAgentEdit)) {
        isPlaying = true;
        cursorPos = 0;
        highlights = Decoration.none;
      }
      
      if (effect.is(completeAgentEdit)) {
        isPlaying = false;
        cursorPos = null;
        
        // 构建高亮 decorations
        const ranges: Range<Decoration>[] = [];
        for (const h of effect.value.highlights) {
          const deco = h.type === "added" ? addedHighlight : modifiedHighlight;
          ranges.push(deco.range(h.from, h.to));
        }
        highlights = Decoration.set(ranges, true);
      }
      
      if (effect.is(clearAgentEdit)) {
        isPlaying = false;
        cursorPos = null;
        highlights = Decoration.none;
      }
    }
    
    // 映射位置（处理文档变化）
    if (tr.docChanged) {
      highlights = highlights.map(tr.changes);
    }
    
    return { isPlaying, highlights, cursorPos };
  },
  
  provide: (field) =>
    EditorView.decorations.from(field, (state) => state.highlights),
});

// ==================== CSS 样式 ====================

export const agentEditTheme = EditorView.baseTheme({
  ".cm-agent-added": {
    backgroundColor: "rgba(34, 197, 94, 0.2)", // green-500/20
    borderBottom: "2px solid rgb(34, 197, 94)",
  },
  ".cm-agent-modified": {
    backgroundColor: "rgba(234, 179, 8, 0.2)", // yellow-500/20
    borderBottom: "2px solid rgb(234, 179, 8)",
  },
  ".cm-agent-cursor": {
    color: "rgb(59, 130, 246)", // blue-500
    animation: "cm-agent-blink 0.5s infinite",
    fontWeight: "bold",
  },
  "@keyframes cm-agent-blink": {
    "0%, 100%": { opacity: "1" },
    "50%": { opacity: "0" },
  },
});

// ==================== 动画控制器 ====================

export class AgentEditAnimator {
  private view: EditorView;
  private abortController: AbortController | null = null;
  
  constructor(view: EditorView) {
    this.view = view;
  }
  
  /**
   * 播放编辑动画
   */
  async playAnimation(
    oldContent: string,
    newContent: string,
    changes: Change[],
    options: {
      charDelay?: number;      // 每字符延迟（ms）
      lineDelay?: number;      // 每行延迟（ms）
      onProgress?: (progress: number) => void;
    } = {}
  ): Promise<void> {
    const { charDelay = 15, lineDelay = 50, onProgress } = options;
    
    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    
    // 1. 通知开始
    this.view.dispatch({
      effects: startAgentEdit.of({ changes, targetContent: newContent }),
    });
    
    // 2. 计算动画步骤
    const steps = this.calculateSteps(oldContent, newContent, changes);
    const totalSteps = steps.length;
    
    // 3. 逐步执行
    for (let i = 0; i < steps.length; i++) {
      if (signal.aborted) break;
      
      const step = steps[i];
      await this.executeStep(step);
      
      // 延迟
      const delay = step.type === "newline" ? lineDelay : charDelay;
      await this.sleep(delay, signal);
      
      // 进度回调
      onProgress?.(Math.round(((i + 1) / totalSteps) * 100));
    }
    
    // 4. 完成，设置高亮
    const highlights = this.calculateHighlights(changes, newContent);
    this.view.dispatch({
      effects: completeAgentEdit.of({ highlights }),
    });
  }
  
  /**
   * 中止动画
   */
  abort(): void {
    this.abortController?.abort();
  }
  
  /**
   * 清除高亮
   */
  clearHighlights(): void {
    this.view.dispatch({
      effects: clearAgentEdit.of(),
    });
  }
  
  // ========== 私有方法 ==========
  
  private calculateSteps(
    oldContent: string,
    newContent: string,
    changes: Change[]
  ): AnimationStep[] {
    const steps: AnimationStep[] = [];
    
    // 简化版：直接用新内容逐字播放添加的部分
    let position = 0;
    
    for (const change of changes) {
      if (change.added) {
        // 添加的内容：逐字动画
        for (const char of change.value) {
          steps.push({
            type: char === "\n" ? "newline" : "insert",
            position,
            char,
          });
          position++;
        }
      } else if (!change.removed) {
        // 未变化的内容：跳过
        position += change.value.length;
      }
      // removed 的内容已经在 diff 时处理，不需要动画
    }
    
    return steps;
  }
  
  private async executeStep(step: AnimationStep): Promise<void> {
    // 实际的插入操作由外部完成（内容已经写入文件）
    // 这里只需要更新光标位置动画
    
    // 滚动到当前位置
    this.view.dispatch({
      effects: EditorView.scrollIntoView(step.position, { y: "center" }),
    });
  }
  
  private calculateHighlights(
    changes: Change[],
    newContent: string
  ): Array<{ from: number; to: number; type: "added" | "modified" }> {
    const highlights: Array<{ from: number; to: number; type: "added" | "modified" }> = [];
    let position = 0;
    
    for (const change of changes) {
      if (change.added) {
        highlights.push({
          from: position,
          to: position + change.value.length,
          type: "added",
        });
        position += change.value.length;
      } else if (!change.removed) {
        position += change.value.length;
      }
    }
    
    return highlights;
  }
  
  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(resolve, ms);
      signal?.addEventListener("abort", () => {
        clearTimeout(timeout);
        reject(new Error("Aborted"));
      });
    });
  }
}

interface AnimationStep {
  type: "insert" | "newline" | "delete";
  position: number;
  char?: string;
}
```

### 4.4 CodeMirrorEditor 集成

```typescript
// src/editor/CodeMirrorEditor.tsx（修改部分）

import { useEditorStore } from "@/stores/useEditorStore";
import { agentEditState, agentEditTheme, AgentEditAnimator } from "./extensions/agentEdit";

export function CodeMirrorEditor({ ... }) {
  const animatorRef = useRef<AgentEditAnimator | null>(null);
  
  const {
    pendingEdit,
    animationState,
    startAnimation,
    updateProgress,
    completeAnimation,
  } = useEditorStore();
  
  // 添加 Agent 编辑扩展
  const extensions = useMemo(() => [
    // ... 现有扩展
    agentEditState,
    agentEditTheme,
  ], []);
  
  // 监听 pendingEdit 变化，触发动画
  useEffect(() => {
    if (!pendingEdit || !editorRef.current || animationState !== "idle") return;
    
    // 确保是当前文件
    if (pendingEdit.path !== currentFile) return;
    
    const animator = new AgentEditAnimator(editorRef.current);
    animatorRef.current = animator;
    
    startAnimation();
    
    animator.playAnimation(
      pendingEdit.oldContent,
      pendingEdit.newContent,
      pendingEdit.changes,
      {
        charDelay: 15,
        lineDelay: 50,
        onProgress: updateProgress,
      }
    ).then(() => {
      completeAnimation();
    }).catch((err) => {
      if (err.message !== "Aborted") {
        console.error("Agent edit animation error:", err);
      }
    });
    
    return () => {
      animator.abort();
    };
  }, [pendingEdit?.id, currentFile]);
  
  // 高亮自动过期
  useEffect(() => {
    const { highlightExpireAt, clearHighlight } = useEditorStore.getState();
    
    if (highlightExpireAt) {
      const delay = highlightExpireAt - Date.now();
      if (delay > 0) {
        const timer = setTimeout(() => {
          clearHighlight();
          animatorRef.current?.clearHighlights();
        }, delay);
        return () => clearTimeout(timer);
      }
    }
  }, [animationState]);
  
  // ...
}
```

---

## 5. 开发计划

### 5.1 阶段划分

| 阶段 | 任务 | 工时 | 产出 |
|------|------|------|------|
| **Phase 1** | 基础架构 | 0.5 天 | useEditorStore + 类型定义 |
| **Phase 2** | 自动聚焦 | 0.5 天 | EditNoteTool 触发文件切换 |
| **Phase 3** | Diff 计算 | 0.5 天 | diffUtils + 变更分析 |
| **Phase 4** | 高亮系统 | 1 天 | CodeMirror Decoration |
| **Phase 5** | 动画播放 | 1 天 | AgentEditAnimator |
| **Phase 6** | 集成测试 | 0.5 天 | 端到端测试 |

### 5.2 详细任务清单

#### Phase 1: 基础架构（0.5 天）

- [ ] 创建 `src/stores/useEditorStore.ts`
- [ ] 定义 `PendingEdit` 和 `EditorState` 接口
- [ ] 实现基础 actions

#### Phase 2: 自动聚焦（0.5 天）

- [ ] 修改 `EditNoteTool.execute()`
- [ ] 在工具执行后调用 `openFile(path)`
- [ ] 测试文件切换是否正常

#### Phase 3: Diff 计算（0.5 天）

- [ ] 安装 `diff` 依赖
- [ ] 创建 `src/lib/diffUtils.ts`
- [ ] 实现 `calculateChanges()` 函数
- [ ] 单元测试 diff 结果

#### Phase 4: 高亮系统（1 天）

- [ ] 创建 `src/editor/extensions/agentEdit.ts`
- [ ] 实现 StateEffect 和 StateField
- [ ] 实现 Decoration 样式
- [ ] 添加 CSS 动画

#### Phase 5: 动画播放（1 天）

- [ ] 实现 `AgentEditAnimator` 类
- [ ] 实现逐字/逐行动画
- [ ] 实现滚动跟随
- [ ] 实现中止功能

#### Phase 6: 集成测试（0.5 天）

- [ ] 端到端测试 Agent 编辑流程
- [ ] 测试多文件编辑
- [ ] 测试中止和错误处理
- [ ] 性能测试（大文件）

---

## 6. 开发规范

### 6.1 代码规范

```typescript
// ✅ 正确：使用明确的类型
interface PendingEdit {
  id: string;
  path: string;
  // ...
}

// ❌ 错误：使用 any
const edit: any = { ... };

// ✅ 正确：使用 const 断言
const ANIMATION_CONFIG = {
  charDelay: 15,
  lineDelay: 50,
} as const;

// ✅ 正确：错误处理
try {
  await animator.playAnimation(...);
} catch (err) {
  if (err.message !== "Aborted") {
    console.error("Animation error:", err);
  }
}
```

### 6.2 状态管理规范

```typescript
// ✅ 使用 Zustand getState() 在组件外访问
const { setPendingEdit } = useEditorStore.getState();

// ✅ 使用 subscribe 监听变化
useEditorStore.subscribe(
  (state) => state.pendingEdit,
  (pendingEdit) => { /* 处理 */ }
);

// ❌ 不要在渲染中直接调用 getState()
// 使用 hook: const pendingEdit = useEditorStore(s => s.pendingEdit);
```

### 6.3 CodeMirror 扩展规范

```typescript
// ✅ 使用 StateEffect 触发变化
view.dispatch({
  effects: completeAgentEdit.of({ highlights }),
});

// ❌ 不要直接修改 state
// state.highlights = newHighlights; // 错误！

// ✅ 在 update 中处理 effects
update(state, tr) {
  for (const effect of tr.effects) {
    if (effect.is(completeAgentEdit)) {
      // 处理
    }
  }
}
```

### 6.4 动画规范

```typescript
// ✅ 支持中止
const signal = this.abortController.signal;
if (signal.aborted) break;

// ✅ 使用 requestAnimationFrame 优化
requestAnimationFrame(() => {
  this.view.dispatch({ ... });
});

// ✅ 限制动画时长（避免卡死）
const MAX_ANIMATION_TIME = 10000; // 10秒
setTimeout(() => this.abort(), MAX_ANIMATION_TIME);
```

---

## 7. 测试方案

### 7.1 单元测试

```typescript
// __tests__/diffUtils.test.ts

import { calculateChanges } from "@/lib/diffUtils";

describe("calculateChanges", () => {
  test("检测添加的行", () => {
    const old = "line1\nline2";
    const new_ = "line1\nline2\nline3";
    const changes = calculateChanges(old, new_);
    
    expect(changes).toContainEqual({
      type: "added",
      value: "line3\n",
    });
  });
  
  test("检测删除的行", () => {
    const old = "line1\nline2\nline3";
    const new_ = "line1\nline3";
    const changes = calculateChanges(old, new_);
    
    expect(changes).toContainEqual({
      type: "removed",
      value: "line2\n",
    });
  });
  
  test("检测修改的行", () => {
    const old = "line1\nold content\nline3";
    const new_ = "line1\nnew content\nline3";
    const changes = calculateChanges(old, new_);
    
    expect(changes.some(c => c.removed && c.value.includes("old"))).toBe(true);
    expect(changes.some(c => c.added && c.value.includes("new"))).toBe(true);
  });
});
```

### 7.2 集成测试

```typescript
// __tests__/agentEdit.integration.test.ts

import { render, waitFor } from "@testing-library/react";
import { CodeMirrorEditor } from "@/editor/CodeMirrorEditor";
import { useEditorStore } from "@/stores/useEditorStore";

describe("Agent Edit Animation", () => {
  test("触发编辑后显示高亮", async () => {
    render(<CodeMirrorEditor content="original" />);
    
    // 模拟 Agent 编辑
    useEditorStore.getState().setPendingEdit({
      path: "test.md",
      oldContent: "original",
      newContent: "original\nnew line",
    });
    
    // 等待动画完成
    await waitFor(() => {
      expect(useEditorStore.getState().animationState).toBe("completed");
    }, { timeout: 5000 });
    
    // 检查高亮
    const highlights = document.querySelectorAll(".cm-agent-added");
    expect(highlights.length).toBeGreaterThan(0);
  });
  
  test("5秒后高亮自动消失", async () => {
    // ... 类似上面，但等待 5 秒后检查
  });
});
```

### 7.3 手动测试检查清单

| 场景 | 预期结果 | 检查项 |
|------|----------|--------|
| Agent 编辑当前文件 | 动画播放 + 高亮 | ✅/❌ |
| Agent 编辑其他文件 | 自动切换 + 动画 | ✅/❌ |
| 动画进行中用户编辑 | 动画中止 | ✅/❌ |
| 动画进行中切换文件 | 动画中止 | ✅/❌ |
| 大文件编辑（>1000行）| 动画流畅 | ✅/❌ |
| 多次连续编辑 | 队列顺序执行 | ✅/❌ |
| 5秒后高亮消失 | 自动清除 | ✅/❌ |

---

## 8. 预期结果

### 8.1 用户体验

1. **自动聚焦**
   - Agent 编辑时，编辑器自动切换到目标文件
   - 无需用户手动查找

2. **动画效果**
   - 新增内容逐字出现（约 15ms/字符）
   - 换行时略微停顿（约 50ms）
   - 滚动自动跟随到当前编辑位置

3. **变更高亮**
   - 添加的内容：绿色底色 + 绿色下划线
   - 修改的内容：黄色底色 + 黄色下划线
   - 5秒后高亮自动淡出消失

### 8.2 性能指标

| 指标 | 目标值 |
|------|--------|
| 动画启动延迟 | < 100ms |
| 帧率 | 稳定 60fps |
| 1000行文件动画 | < 5秒 |
| 内存增长 | < 10MB |

### 8.3 视觉效果示意

```
编辑前：
┌─────────────────────────────────┐
│ # 我的笔记                       │
│                                 │
│ 这是一段内容。                   │
│                                 │
└─────────────────────────────────┘

动画中（光标闪烁）：
┌─────────────────────────────────┐
│ # 我的笔记                       │
│                                 │
│ 这是一段内容。                   │
│ 这是新添加的▌                    │  ← 光标闪烁
│                                 │
└─────────────────────────────────┘

完成后（高亮显示）：
┌─────────────────────────────────┐
│ # 我的笔记                       │
│                                 │
│ 这是一段内容。                   │
│ ██████████████████████████████  │  ← 绿色高亮
│ 这是新添加的内容。               │
│ ██████████████████████████████  │
│                                 │
└─────────────────────────────────┘
```

---

## 9. 风险与应对

| 风险 | 影响 | 应对措施 |
|------|------|----------|
| 大文件动画卡顿 | 用户体验差 | 限制动画时长，超过阈值直接显示结果 |
| 用户编辑冲突 | 数据不一致 | 检测用户输入时立即中止动画 |
| diff 计算不准确 | 高亮位置错误 | 使用行级 diff，避免字符级复杂度 |
| 多编辑器实例 | 状态同步问题 | 使用文件路径作为 key 隔离状态 |

---

## 10. 后续扩展

- **差异对比视图**：侧边显示 before/after 对比
- **撤销支持**：一键撤销 Agent 的编辑
- **编辑历史**：记录所有 Agent 编辑，支持回溯
- **协作提示**：多人协作时显示谁在编辑

---

## 11. 参考资料

- [CodeMirror Decoration 文档](https://codemirror.net/docs/ref/#view.Decoration)
- [diff 库文档](https://github.com/kpdecker/jsdiff)
- [Cursor AI 编辑效果参考](https://cursor.sh)
- [Zustand 文档](https://docs.pmnd.rs/zustand)
