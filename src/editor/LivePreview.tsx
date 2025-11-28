import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { parseMarkdown } from "@/lib/markdown";

interface LivePreviewProps {
  content: string;
  onChange: (content: string) => void;
  className?: string;
}

interface LineInfo {
  type: "normal" | "math-marker" | "math-block";
  blockId: number | null;
}

// 统一样式：确保编辑态和预览态完全一致
function getLineStyle(text: string): string {
  if (!text) return "text-base leading-7";
  const trimmed = text.trim();

  // Headers - 使用固定行高避免跳动
  if (trimmed.startsWith("# ")) return "text-2xl font-bold leading-tight";
  if (trimmed.startsWith("## ")) return "text-xl font-semibold leading-tight";
  if (trimmed.startsWith("### ")) return "text-lg font-semibold leading-snug";
  if (trimmed.startsWith("#### ")) return "text-base font-semibold leading-7";

  // 统一使用 leading-7 保证行高一致
  return "text-base leading-7";
}

// 解析行类型
function parseLineTypes(lines: string[]): LineInfo[] {
  let inMathBlock = false;
  let blockIdCounter = 0;
  let currentBlockId: number | null = null;

  return lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed === "$$") {
      if (!inMathBlock) {
        inMathBlock = true;
        currentBlockId = blockIdCounter++;
      } else {
        const id = currentBlockId;
        inMathBlock = false;
        currentBlockId = null;
        return { type: "math-marker" as const, blockId: id };
      }
      return { type: "math-marker" as const, blockId: currentBlockId };
    }
    return {
      type: inMathBlock ? ("math-block" as const) : ("normal" as const),
      blockId: inMathBlock ? currentBlockId : null,
    };
  });
}

// 渲染单行预览
function LinePreview({ text, type, className }: { text: string; type: string; className: string }) {
  if (!text && type !== "math-block") return <div className="h-7" />;

  // 公式块内容 - 使用 KaTeX 渲染
  if (type === "math-block") {
    const html = parseMarkdown(`$$${text}$$`);
    return <div className="text-center py-2" dangerouslySetInnerHTML={{ __html: html }} />;
  }

  // $$ 标记行 - 隐藏
  if (type === "math-marker") {
    return <div className="h-0 overflow-hidden" />;
  }

  // 普通行 - 渲染 markdown
  const html = parseMarkdown(text);
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

// 格式化函数：在选中文本周围添加标记
function wrapSelection(
  textarea: HTMLTextAreaElement,
  prefix: string,
  suffix: string,
  onChange: (value: string) => void
) {
  const { selectionStart, selectionEnd, value } = textarea;
  const selectedText = value.substring(selectionStart, selectionEnd);
  
  // 检查是否已经有这个格式，如果有则移除
  const beforeStart = value.substring(Math.max(0, selectionStart - prefix.length), selectionStart);
  const afterEnd = value.substring(selectionEnd, selectionEnd + suffix.length);
  
  if (beforeStart === prefix && afterEnd === suffix) {
    // 移除格式
    const newValue = 
      value.substring(0, selectionStart - prefix.length) +
      selectedText +
      value.substring(selectionEnd + suffix.length);
    onChange(newValue);
    
    // 调整光标位置
    requestAnimationFrame(() => {
      textarea.setSelectionRange(
        selectionStart - prefix.length,
        selectionEnd - prefix.length
      );
    });
  } else {
    // 添加格式
    const newValue =
      value.substring(0, selectionStart) +
      prefix +
      selectedText +
      suffix +
      value.substring(selectionEnd);
    onChange(newValue);
    
    // 调整光标位置
    requestAnimationFrame(() => {
      if (selectedText) {
        textarea.setSelectionRange(
          selectionStart + prefix.length,
          selectionEnd + prefix.length
        );
      } else {
        // 没有选中文本时，光标放在标记中间
        textarea.setSelectionRange(
          selectionStart + prefix.length,
          selectionStart + prefix.length
        );
      }
    });
  }
}

// 在行首添加或切换前缀
function toggleLinePrefix(
  textarea: HTMLTextAreaElement,
  prefix: string,
  onChange: (value: string) => void
) {
  const { value, selectionStart } = textarea;
  
  // 找到当前行的起始位置
  const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
  const currentLine = value.substring(lineStart);
  
  if (currentLine.startsWith(prefix)) {
    // 移除前缀
    const newValue = value.substring(0, lineStart) + currentLine.substring(prefix.length);
    onChange(newValue);
    requestAnimationFrame(() => {
      textarea.setSelectionRange(selectionStart - prefix.length, selectionStart - prefix.length);
    });
  } else {
    // 添加前缀
    const newValue = value.substring(0, lineStart) + prefix + value.substring(lineStart);
    onChange(newValue);
    requestAnimationFrame(() => {
      textarea.setSelectionRange(selectionStart + prefix.length, selectionStart + prefix.length);
    });
  }
}

// 自动调整高度的 textarea
function AutoResizeTextarea({
  value,
  onChange,
  onBlur,
  onBackspaceAtStart,
  autoFocus,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  onBackspaceAtStart?: () => void;
  autoFocus?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = ref.current.scrollHeight + "px";
    }
  }, []);

  useEffect(() => {
    adjustHeight();
    if (autoFocus && ref.current) {
      ref.current.setSelectionRange(ref.current.value.length, ref.current.value.length);
      ref.current.focus();
    }
  }, [value, autoFocus, adjustHeight]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = ref.current;
    if (!textarea) return;
    
    const isCtrl = e.ctrlKey || e.metaKey;
    
    if (e.key === "Escape") {
      onBlur();
      return;
    }
    
    // 在行首按 Backspace 时，合并到上一行
    if (e.key === "Backspace") {
      const { selectionStart } = textarea;
      if (selectionStart === 0 && onBackspaceAtStart) {
        e.preventDefault();
        onBackspaceAtStart();
        return;
      }
    }
    
    // 格式化快捷键
    if (isCtrl) {
      switch (e.key.toLowerCase()) {
        case "b": // 粗体
          e.preventDefault();
          wrapSelection(textarea, "**", "**", onChange);
          break;
        case "i": // 斜体
          e.preventDefault();
          wrapSelection(textarea, "*", "*", onChange);
          break;
        case "u": // 下划线（使用 HTML）
          e.preventDefault();
          wrapSelection(textarea, "<u>", "</u>", onChange);
          break;
        case "k": // 链接
          e.preventDefault();
          wrapSelection(textarea, "[", "](url)", onChange);
          break;
        case "`": // 行内代码
          e.preventDefault();
          wrapSelection(textarea, "`", "`", onChange);
          break;
        case "e": // 行内数学公式
          e.preventDefault();
          wrapSelection(textarea, "$", "$", onChange);
          break;
      }
      
      // Ctrl+Shift combinations
      if (e.shiftKey) {
        switch (e.key.toLowerCase()) {
          case "x": // 删除线
            e.preventDefault();
            wrapSelection(textarea, "~~", "~~", onChange);
            break;
          case "h": // 高亮
            e.preventDefault();
            wrapSelection(textarea, "==", "==", onChange);
            break;
        }
      }
    }
    
    // Alt 快捷键 - 行级格式
    if (e.altKey && !isCtrl) {
      switch (e.key) {
        case "1": // H1
          e.preventDefault();
          toggleLinePrefix(textarea, "# ", onChange);
          break;
        case "2": // H2
          e.preventDefault();
          toggleLinePrefix(textarea, "## ", onChange);
          break;
        case "3": // H3
          e.preventDefault();
          toggleLinePrefix(textarea, "### ", onChange);
          break;
        case "4": // H4
          e.preventDefault();
          toggleLinePrefix(textarea, "#### ", onChange);
          break;
      }
    }
  }, [onBlur, onBackspaceAtStart, onChange]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => {
        onChange(e.target.value);
        adjustHeight();
      }}
      onBlur={onBlur}
      onKeyDown={handleKeyDown}
      className={`w-full bg-transparent resize-none outline-none overflow-hidden block p-0 m-0 ${className}`}
      rows={1}
      spellCheck={false}
    />
  );
}

export function LivePreview({ content, onChange, className = "" }: LivePreviewProps) {
  const [activeLineIndex, setActiveLineIndex] = useState<number | null>(null);

  const lines = useMemo(() => content.split("\n"), [content]);
  const lineTypes = useMemo(() => parseLineTypes(lines), [lines]);

  const handleLineChange = useCallback(
    (index: number, newValue: string) => {
      const newLines = [...lines];
      
      // 如果新值包含换行符，说明用户按了回车，需要拆分成多行
      if (newValue.includes("\n")) {
        const splitLines = newValue.split("\n");
        // 替换当前行并插入新行
        newLines.splice(index, 1, ...splitLines);
        onChange(newLines.join("\n"));
        // 移动光标到新创建的行
        setActiveLineIndex(index + splitLines.length - 1);
      } else {
        newLines[index] = newValue;
        onChange(newLines.join("\n"));
      }
    },
    [lines, onChange]
  );

  const handleBlur = useCallback(() => {
    setActiveLineIndex(null);
  }, []);

  // 在行首按 Backspace 时，合并到上一行
  const handleBackspaceAtStart = useCallback(
    (index: number) => {
      if (index <= 0) return;
      
      const newLines = [...lines];
      const currentLine = newLines[index];
      const prevLine = newLines[index - 1];
      
      // 合并当前行到上一行
      newLines[index - 1] = prevLine + currentLine;
      newLines.splice(index, 1);
      
      onChange(newLines.join("\n"));
      setActiveLineIndex(index - 1);
    },
    [lines, onChange]
  );

  return (
    <div className={`live-preview ${className}`}>
      {lines.map((line, index) => {
        const isActive = activeLineIndex === index;
        const info = lineTypes[index];
        const isMathPart = info.type === "math-block" || info.type === "math-marker";
        const baseStyle = getLineStyle(line);

        return (
          <div
            key={index}
            className="group relative min-h-[28px]"
            onClick={(e) => {
              e.stopPropagation();
              setActiveLineIndex(index);
            }}
          >
            {/* 普通行：原地替换 */}
            {!isMathPart && (
              isActive ? (
                <AutoResizeTextarea
                  value={line}
                  onChange={(val) => handleLineChange(index, val)}
                  onBlur={handleBlur}
                  onBackspaceAtStart={() => handleBackspaceAtStart(index)}
                  autoFocus
                  className={`${baseStyle} text-foreground`}
                />
              ) : (
                <div className="cursor-text">
                  <LinePreview text={line} type={info.type} className={baseStyle} />
                </div>
              )
            )}

            {/* 公式行：源码在上方悬浮，预览在下方 */}
            {isMathPart && (
              <div className="relative">
                {/* 源码编辑区 */}
                {isActive && (
                  <div className="relative mb-2 z-10 animate-in slide-in-from-top-2 duration-150">
                    <div className="absolute -left-3 top-0 bottom-0 w-1 bg-primary rounded-full" />
                    <div className="bg-muted/80 border border-border rounded-lg p-2 shadow-md ml-1">
                      <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1 block select-none">
                        LaTeX
                      </span>
                      <AutoResizeTextarea
                        value={line}
                        onChange={(val) => handleLineChange(index, val)}
                        onBlur={() => {}} // 公式编辑不自动关闭
                        onBackspaceAtStart={() => handleBackspaceAtStart(index)}
                        autoFocus
                        className="font-mono text-sm text-foreground leading-relaxed"
                      />
                    </div>
                  </div>
                )}

                {/* 预览区：始终显示 */}
                <div className={`transition-opacity duration-150 ${isActive ? "opacity-40" : "opacity-100"}`}>
                  <LinePreview text={line} type={info.type} className={baseStyle} />
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* 底部点击区域 */}
      <div
        className="h-32 cursor-text"
        onClick={() => {
          onChange(content + "\n");
          setActiveLineIndex(lines.length);
        }}
      />
    </div>
  );
}
