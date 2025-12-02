/**
 * 自定义标题栏
 * 替代系统标题栏，支持主题颜色
 */

import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X, Copy } from "lucide-react";
import { useState, useEffect } from "react";

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    // 监听窗口最大化状态
    const checkMaximized = async () => {
      try {
        const maximized = await getCurrentWindow().isMaximized();
        setIsMaximized(maximized);
      } catch (e) {
        console.warn("Failed to check maximized state:", e);
      }
    };
    checkMaximized();

    // 监听窗口状态变化
    let unlistenFn: (() => void) | null = null;
    getCurrentWindow().onResized(() => {
      checkMaximized();
    }).then((fn) => {
      unlistenFn = fn;
    });

    return () => {
      unlistenFn?.();
    };
  }, []);

  const handleDragStart = (e: React.MouseEvent) => {
    // 只响应左键
    if (e.button !== 0) return;
    // 开始拖拽
    getCurrentWindow().startDragging();
  };

  const handleMinimize = async () => {
    try {
      await getCurrentWindow().minimize();
    } catch (e) {
      console.error("Failed to minimize:", e);
    }
  };

  const handleMaximize = async () => {
    try {
      await getCurrentWindow().toggleMaximize();
    } catch (e) {
      console.error("Failed to toggle maximize:", e);
    }
  };

  const handleClose = async () => {
    try {
      await getCurrentWindow().close();
    } catch (e) {
      console.error("Failed to close:", e);
    }
  };

  return (
    <div 
      className="h-8 flex items-center justify-between bg-muted border-b border-border select-none"
      onMouseDown={handleDragStart}
    >
      {/* 左侧：应用图标和标题 */}
      <div className="flex items-center gap-2 px-3">
        <img src="/lumina.svg" alt="Logo" className="w-4 h-4 pointer-events-none" />
        <span className="text-xs text-muted-foreground font-medium pointer-events-none">
          Lumina Note
        </span>
      </div>

      {/* 中间：拖拽区域 */}
      <div className="flex-1 h-full" />

      {/* 右侧：窗口控制按钮 */}
      <div className="flex items-center h-full" onMouseDown={(e) => e.stopPropagation()}>
        {/* 最小化 */}
        <button
          onClick={handleMinimize}
          className="h-full px-4 hover:bg-accent transition-colors flex items-center justify-center"
          title="最小化"
        >
          <Minus size={14} className="text-muted-foreground" />
        </button>

        {/* 最大化/还原 */}
        <button
          onClick={handleMaximize}
          className="h-full px-4 hover:bg-accent transition-colors flex items-center justify-center"
          title={isMaximized ? "还原" : "最大化"}
        >
          {isMaximized ? (
            <Copy size={12} className="text-muted-foreground" />
          ) : (
            <Square size={12} className="text-muted-foreground" />
          )}
        </button>

        {/* 关闭 */}
        <button
          onClick={handleClose}
          className="h-full px-4 hover:bg-red-500 hover:text-white transition-colors flex items-center justify-center"
          title="关闭"
        >
          <X size={14} className="text-muted-foreground hover:text-white" />
        </button>
      </div>
    </div>
  );
}
