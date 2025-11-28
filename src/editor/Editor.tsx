import { useEffect, useMemo, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Typography from "@tiptap/extension-typography";
import { useFileStore } from "@/stores/useFileStore";
import { useUIStore, EditorMode } from "@/stores/useUIStore";
import { WikiLink } from "./extensions/WikiLink";
import { debounce, getFileName } from "@/lib/utils";
import { parseMarkdown, editorToMarkdown } from "@/lib/markdown";
import { ReadingView } from "./ReadingView";
import { LivePreview } from "./LivePreview";
import { 
  Sidebar, 
  MessageSquare, 
  BookOpen, 
  Eye, 
  Code2,
  Undo2,
  Redo2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { TabBar } from "@/components/TabBar";
import { cn } from "@/lib/utils";

const modeConfig: Record<EditorMode, { icon: React.ReactNode; label: string }> = {
  reading: { icon: <BookOpen size={14} />, label: "阅读" },
  live: { icon: <Eye size={14} />, label: "实时" },
  source: { icon: <Code2 size={14} />, label: "源码" },
};

export function Editor() {
  const {
    currentFile,
    currentContent,
    updateContent,
    save,
    isDirty,
    isSaving,
    isLoadingFile,
    undo,
    redo,
    canUndo,
    canRedo,
    undoStack,
    goBack,
    goForward,
    canGoBack,
    canGoForward,
  } = useFileStore();

  const { 
    toggleLeftSidebar, 
    toggleRightSidebar, 
    editorMode, 
    setEditorMode 
  } = useUIStore();

  // 全局键盘快捷键
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Alt + 左/右箭头: 导航历史
    if (e.altKey && e.key === "ArrowLeft") {
      e.preventDefault();
      goBack();
      return;
    }
    if (e.altKey && e.key === "ArrowRight") {
      e.preventDefault();
      goForward();
      return;
    }
    
    // 只在 live 模式下拦截默认的撤销/重做
    if (editorMode !== "live") return;
    
    if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      undo();
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
      e.preventDefault();
      redo();
    }
  }, [undo, redo, editorMode, goBack, goForward]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Debounced save (500ms after user stops typing)
  const debouncedSave = useMemo(
    () => debounce(() => save(), 500),
    [save]
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4, 5, 6],
        },
        codeBlock: {
          HTMLAttributes: {
            class: "code-block",
          },
        },
      }),
      Placeholder.configure({
        placeholder: "开始写作...",
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "editor-link",
        },
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Typography,
      WikiLink,
    ],
    content: "",
    editorProps: {
      attributes: {
        class: "tiptap",
      },
    },
    onUpdate: ({ editor }) => {
      // Convert editor HTML to Markdown for saving
      const html = editor.getHTML();
      const markdown = editorToMarkdown(html);
      updateContent(markdown);
      debouncedSave();
    },
  });

  // Update editor content when file changes
  useEffect(() => {
    if (editor && currentContent !== undefined && currentFile) {
      // Parse Markdown to HTML and set content
      const html = parseMarkdown(currentContent);
      editor.commands.setContent(html);
    }
  }, [editor, currentFile]); // Intentionally not including currentContent to avoid loops

  if (isLoadingFile) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-muted-foreground">加载中...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background transition-colors duration-300">
      {/* Tab Bar */}
      <TabBar />
      
      {/* Top Navigation Bar */}
      <div className="h-10 flex items-center px-4 justify-between select-none border-b border-border shrink-0">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <button
            onClick={toggleLeftSidebar}
            className="p-1 hover:bg-accent rounded transition-colors hover:text-foreground"
            title="切换侧边栏"
          >
            <Sidebar size={16} />
          </button>
          
          {/* Navigation buttons */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={goBack}
              disabled={!canGoBack()}
              className={cn(
                "p-1 rounded transition-colors",
                canGoBack()
                  ? "hover:bg-accent text-muted-foreground hover:text-foreground"
                  : "text-muted-foreground/30 cursor-not-allowed"
              )}
              title="返回 (Alt+←)"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={goForward}
              disabled={!canGoForward()}
              className={cn(
                "p-1 rounded transition-colors",
                canGoForward()
                  ? "hover:bg-accent text-muted-foreground hover:text-foreground"
                  : "text-muted-foreground/30 cursor-not-allowed"
              )}
              title="前进 (Alt+→)"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <span className="text-muted-foreground/50">/</span>
          <span className="text-foreground font-medium">
            {currentFile ? getFileName(currentFile) : "未命名"}
          </span>
          {isDirty && (
            <span className="w-2 h-2 rounded-full bg-orange-400" title="未保存更改" />
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Undo/Redo buttons */}
          {editorMode === "live" && (
            <div className="flex items-center gap-0.5 mr-1">
              <button
                onClick={undo}
                disabled={!canUndo()}
                className={cn(
                  "p-1.5 rounded transition-colors",
                  canUndo() 
                    ? "hover:bg-accent text-muted-foreground hover:text-foreground" 
                    : "text-muted-foreground/30 cursor-not-allowed"
                )}
                title={`撤销 (Ctrl+Z)${undoStack.length > 0 ? ` - ${undoStack[undoStack.length - 1]?.type === 'ai' ? 'AI修改' : '编辑'}` : ''}`}
              >
                <Undo2 size={14} />
              </button>
              <button
                onClick={redo}
                disabled={!canRedo()}
                className={cn(
                  "p-1.5 rounded transition-colors",
                  canRedo() 
                    ? "hover:bg-accent text-muted-foreground hover:text-foreground" 
                    : "text-muted-foreground/30 cursor-not-allowed"
                )}
                title="重做 (Ctrl+Y)"
              >
                <Redo2 size={14} />
              </button>
            </div>
          )}

          {/* Mode Switcher */}
          <div className="flex items-center bg-muted rounded-lg p-0.5 gap-0.5">
            {(Object.keys(modeConfig) as EditorMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setEditorMode(mode)}
                className={cn(
                  "mode-switcher-btn flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium",
                  editorMode === mode
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                )}
                title={modeConfig[mode].label}
              >
                {modeConfig[mode].icon}
                <span className="hidden sm:inline">{modeConfig[mode].label}</span>
              </button>
            ))}
          </div>

          <span className="text-xs text-muted-foreground">
            {isSaving ? "保存中..." : isDirty ? "已编辑" : "已保存"}
          </span>
          <button
            onClick={toggleRightSidebar}
            className="p-1 hover:bg-accent rounded transition-colors text-muted-foreground hover:text-foreground"
            title="切换 AI 面板"
          >
            <MessageSquare size={16} />
          </button>
        </div>
      </div>

      {/* Editor area - different modes */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-6 py-4 editor-mode-container">
          {editorMode === "reading" && (
            <div key="reading" className="editor-mode-content">
              <ReadingView content={currentContent} />
            </div>
          )}
          
          {editorMode === "live" && (
            <div key="live" className="editor-mode-content">
              <LivePreview 
                content={currentContent} 
                onChange={(newContent) => {
                  updateContent(newContent);
                  debouncedSave();
                }}
              />
            </div>
          )}
          
          {editorMode === "source" && (
            <div key="source" className="editor-mode-content">
              <EditorContent editor={editor} className="h-full" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
