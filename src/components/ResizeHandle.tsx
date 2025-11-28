import { useCallback, useEffect, useState, useRef } from "react";
import { cn } from "@/lib/utils";

interface ResizeHandleProps {
  direction: "left" | "right";
  onResize: (delta: number) => void;
  onDoubleClick?: () => void;
  className?: string;
}

export function ResizeHandle({
  direction,
  onResize,
  onDoubleClick,
  className,
}: ResizeHandleProps) {
  const [isDragging, setIsDragging] = useState(false);
  const rafRef = useRef<number | null>(null);
  const lastXRef = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      lastXRef.current = e.clientX;
      setIsDragging(true);
      
      // 拖动时禁用侧边栏的过渡动画
      document.body.classList.add("resizing");
    },
    []
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      // 使用 requestAnimationFrame 节流
      if (rafRef.current) return;
      
      rafRef.current = requestAnimationFrame(() => {
        const delta = e.clientX - lastXRef.current;
        lastXRef.current = e.clientX;

        if (delta !== 0) {
          // Invert delta for right-side handles
          onResize(direction === "right" ? -delta : delta);
        }
        
        rafRef.current = null;
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      lastXRef.current = 0;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      // 恢复过渡动画
      document.body.classList.remove("resizing");
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    // Change cursor globally while dragging
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [isDragging, direction, onResize]);

  return (
    <div
      className={cn(
        "group relative w-1 hover:w-1 flex-shrink-0 cursor-col-resize transition-all duration-150",
        isDragging && "w-1",
        className
      )}
      onMouseDown={handleMouseDown}
      onDoubleClick={onDoubleClick}
    >
      {/* Visual indicator */}
      <div
        className={cn(
          "absolute inset-y-0 left-1/2 -translate-x-1/2 w-[3px] rounded-full transition-all duration-200",
          "bg-transparent group-hover:bg-primary/30",
          isDragging && "bg-primary/50 w-[3px]"
        )}
      />
      
      {/* Hover area - larger hit target */}
      <div className="absolute inset-y-0 -left-1 -right-1" />
    </div>
  );
}
