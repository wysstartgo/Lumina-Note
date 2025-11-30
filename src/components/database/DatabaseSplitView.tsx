import { useCallback, useEffect } from "react";
import { useUIStore } from "@/stores/useUIStore";
import { useSplitStore } from "@/stores/useSplitStore";
import { DatabaseView } from "./DatabaseView";
import { CodeMirrorEditor } from "@/editor/CodeMirrorEditor";
import { ReadingView } from "@/editor/ReadingView";
import { getFileName, cn } from "@/lib/utils";
import { X, Columns, Rows, FileText, Loader2, Save } from "lucide-react";

interface DatabaseSplitViewProps {
  dbId: string;
}

export function DatabaseSplitView({ dbId }: DatabaseSplitViewProps) {
  const {
    splitDirection,
    setSplitDirection,
    toggleSplitView,
    editorMode,
  } = useUIStore();

  const {
    secondaryFile,
    secondaryContent,
    secondaryIsDirty,
    isLoadingSecondary,
    updateSecondaryContent,
    saveSecondary,
    closeSecondary,
  } = useSplitStore();

  const handleContentChange = useCallback((content: string) => {
    updateSecondaryContent(content);
  }, [updateSecondaryContent]);

  // Ctrl+S 保存快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        if (secondaryIsDirty) {
          e.preventDefault();
          saveSecondary();
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [secondaryIsDirty, saveSecondary]);

  const isHorizontal = splitDirection === "horizontal";

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Split toolbar */}
      <div className="h-8 flex items-center px-2 gap-1 border-b border-border bg-background shrink-0">
        <button
          onClick={() => setSplitDirection(isHorizontal ? "vertical" : "horizontal")}
          className={cn(
            "p-1.5 rounded transition-colors",
            "hover:bg-accent text-muted-foreground hover:text-foreground"
          )}
          title={isHorizontal ? "垂直分屏" : "水平分屏"}
        >
          {isHorizontal ? <Rows size={14} /> : <Columns size={14} />}
        </button>
        <button
          onClick={toggleSplitView}
          className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          title="关闭分屏"
        >
          <X size={14} />
        </button>
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground">
          数据库 + 笔记
        </span>
      </div>

      {/* Split panes */}
      <div className={cn(
        "flex-1 flex overflow-hidden",
        isHorizontal ? "flex-row" : "flex-col"
      )}>
        {/* Database pane (left) */}
        <div className={cn(
          "flex flex-col overflow-hidden",
          isHorizontal ? "flex-1 min-w-[300px]" : "flex-1 min-h-[200px]"
        )}>
          <DatabaseView dbId={dbId} className="flex-1" />
        </div>

        {/* Divider */}
        <div className={cn(
          "bg-border shrink-0",
          isHorizontal ? "w-px" : "h-px"
        )} />

        {/* Note editor pane (right) */}
        <div className={cn(
          "flex flex-col overflow-hidden",
          isHorizontal ? "flex-1 min-w-[300px]" : "flex-1 min-h-[200px]"
        )}>
          {isLoadingSecondary ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="animate-spin text-muted-foreground" />
            </div>
          ) : secondaryFile ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* File header */}
              <div className="h-8 flex items-center px-3 gap-2 border-b border-border bg-muted/30 shrink-0">
                <FileText size={14} className="text-muted-foreground" />
                <span className="text-sm truncate flex-1">
                  {getFileName(secondaryFile)}
                </span>
                {secondaryIsDirty && (
                  <button
                    onClick={saveSecondary}
                    className="p-1 rounded hover:bg-accent text-primary hover:text-primary"
                    title="保存 (Ctrl+S)"
                  >
                    <Save size={14} />
                  </button>
                )}
                <button
                  onClick={closeSecondary}
                  className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                  title="关闭"
                >
                  <X size={14} />
                </button>
              </div>
              
              {/* Editor */}
              <div className="flex-1 overflow-hidden">
                {editorMode === "reading" ? (
                  <ReadingView content={secondaryContent} />
                ) : (
                  <CodeMirrorEditor
                    content={secondaryContent}
                    onChange={handleContentChange}
                  />
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
              <FileText size={32} className="opacity-30 mb-2" />
              <p className="text-sm">点击数据库行中的 📄 按钮</p>
              <p className="text-xs opacity-70">在这里打开对应的笔记</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
