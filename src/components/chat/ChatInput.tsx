/**
 * 聊天输入框组件
 * 支持 @ 引用文件和 📎 按钮选择文件
 */

import React, { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import { useFileStore } from "@/stores/useFileStore";
import { useAIStore } from "@/stores/useAIStore";
import { Send, FileText, Folder, X, Loader2, Paperclip, Quote } from "lucide-react";
import { cn } from "@/lib/utils";

// 引用的文件
export interface ReferencedFile {
  path: string;
  name: string;
  isFolder: boolean;
}

export interface ChatInputRef {
  send: () => void;
  getReferencedFiles: () => ReferencedFile[];
}

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (message: string, files: ReferencedFile[]) => void;
  isLoading?: boolean;
  isStreaming?: boolean;
  onStop?: () => void;
  placeholder?: string;
  className?: string;
  rows?: number;
  hideSendButton?: boolean;
}

export const ChatInput = forwardRef<ChatInputRef, ChatInputProps>(({
  value,
  onChange,
  onSend,
  isLoading = false,
  isStreaming = false,
  onStop,
  placeholder = "输入消息... (@ 引用文件)",
  className,
  rows = 2,
  hideSendButton = false,
}, ref) => {
  const { fileTree } = useFileStore();
  const { textSelections, removeTextSelection, clearTextSelections } = useAIStore();
  const [showMention, setShowMention] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const [referencedFiles, setReferencedFiles] = useState<ReferencedFile[]>([]);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [filePickerQuery, setFilePickerQuery] = useState("");
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mentionRef = useRef<HTMLDivElement>(null);

  // 扁平化文件树
  const flattenFileTree = useCallback((entries: any[], result: ReferencedFile[] = []): ReferencedFile[] => {
    for (const entry of entries) {
      result.push({
        path: entry.path,
        name: entry.name,
        isFolder: entry.is_dir,
      });
      if (entry.is_dir && entry.children) {
        flattenFileTree(entry.children, result);
      }
    }
    return result;
  }, []);

  // 获取所有文件和文件夹
  const allFiles = React.useMemo(() => flattenFileTree(fileTree), [fileTree, flattenFileTree]);

  // 文件选择器过滤的文件
  const pickerFilteredFiles = React.useMemo(() => {
    if (!filePickerQuery) {
      return allFiles.slice(0, 20);
    }
    const query = filePickerQuery.toLowerCase();
    return allFiles
      .filter(f => f.name.toLowerCase().includes(query))
      .slice(0, 20);
  }, [allFiles, filePickerQuery]);

  // 过滤匹配的文件（@ 提及用）
  const filteredFiles = React.useMemo(() => {
    if (!mentionQuery) {
      // 显示快捷选项 + 最近文件
      return allFiles.slice(0, 10);
    }
    const query = mentionQuery.toLowerCase();
    return allFiles
      .filter(f => f.name.toLowerCase().includes(query))
      .slice(0, 10);
  }, [allFiles, mentionQuery]);

  // 处理输入变化
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    onChange(newValue);

    // 检测 @ 符号
    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = newValue.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@([^\s@]*)$/);

    if (atMatch) {
      setShowMention(true);
      setMentionQuery(atMatch[1]);
      setMentionIndex(0);
    } else {
      setShowMention(false);
      setMentionQuery("");
    }
  };

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMention) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex(i => Math.min(i + 1, filteredFiles.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex(i => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && filteredFiles.length > 0) {
        e.preventDefault();
        selectMention(filteredFiles[mentionIndex]);
      } else if (e.key === "Escape") {
        setShowMention(false);
      }
    } else if (e.key === "Enter" && !e.shiftKey && !isStreaming && !isLoading) {
      e.preventDefault();
      handleSend();
    }
  };

  // 选择提及的文件
  const selectMention = (file: ReferencedFile) => {
    if (!textareaRef.current) return;

    const cursorPos = textareaRef.current.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPos);
    const textAfterCursor = value.slice(cursorPos);
    
    // 找到 @ 符号位置
    const atMatch = textBeforeCursor.match(/@([^\s@]*)$/);
    if (!atMatch) return;

    const atPos = cursorPos - atMatch[0].length;
    const newValue = value.slice(0, atPos) + textAfterCursor;
    
    onChange(newValue);
    setShowMention(false);
    setMentionQuery("");

    // 添加到引用列表（避免重复）
    if (!referencedFiles.some(f => f.path === file.path)) {
      setReferencedFiles([...referencedFiles, file]);
    }

    // 聚焦回输入框
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  // 移除引用的文件
  const removeReference = (path: string) => {
    setReferencedFiles(files => files.filter(f => f.path !== path));
  };

  // 发送消息
  const handleSend = useCallback(() => {
    if (!value.trim() && referencedFiles.length === 0 && textSelections.length === 0) return;
    if (isLoading || isStreaming) return;
    
    // 构建带引用的消息
    let messageToSend = value.trim();
    if (textSelections.length > 0) {
      const quotedTexts = textSelections.map(sel => 
        `> 引用自 ${sel.source}:\n> ${sel.text.split('\n').join('\n> ')}`
      ).join('\n\n');
      messageToSend = quotedTexts + (messageToSend ? `\n\n${messageToSend}` : '');
    }
    
    onSend(messageToSend, referencedFiles);
    onChange("");
    setReferencedFiles([]);
    clearTextSelections();
  }, [value, referencedFiles, textSelections, isLoading, isStreaming, onSend, onChange, clearTextSelections]);

  // 暴露方法给父组件
  useImperativeHandle(ref, () => ({
    send: handleSend,
    getReferencedFiles: () => referencedFiles,
  }), [handleSend, referencedFiles]);

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (mentionRef.current && !mentionRef.current.contains(e.target as Node)) {
        setShowMention(false);
      }
      // 关闭文件选择器（检查是否点击在选择器外部）
      const target = e.target as HTMLElement;
      if (!target.closest('[data-file-picker]')) {
        setShowFilePicker(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div
      className={cn("relative", className)}
    >
      {/* 已引用的文件和文本片段标签 */}
      {(referencedFiles.length > 0 || textSelections.length > 0) && (
        <div className="flex flex-wrap gap-1 mb-2">
          {/* 文件引用 */}
          {referencedFiles.map(file => (
            <div
              key={file.path}
              className="flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded-md text-xs"
            >
              {file.isFolder ? <Folder size={12} /> : <FileText size={12} />}
              <span className="max-w-[120px] truncate">{file.name}</span>
              <button
                onClick={() => removeReference(file.path)}
                className="hover:bg-primary/20 rounded p-0.5"
              >
                <X size={10} />
              </button>
            </div>
          ))}
          {/* 文本片段引用 */}
          {textSelections.map(sel => (
            <div
              key={sel.id}
              className="flex items-center gap-1 px-2 py-1 bg-accent text-accent-foreground rounded-md text-xs max-w-[200px]"
              title={sel.text}
            >
              <Quote size={12} className="shrink-0" />
              <span className="truncate">{sel.text.slice(0, 30)}{sel.text.length > 30 ? '...' : ''}</span>
              <span className="text-muted-foreground shrink-0">({sel.source})</span>
              <button
                onClick={() => removeTextSelection(sel.id)}
                className="hover:bg-accent/80 rounded p-0.5 shrink-0"
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 输入区域 */}
      <div className="flex gap-2 relative">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={rows}
          className="flex-1 resize-none bg-transparent outline-none text-sm"
        />
        
        {/* 附加文件按钮 */}
        <div className="relative self-end" data-file-picker>
          <button
            onClick={() => setShowFilePicker(!showFilePicker)}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            title="附加文件 (或输入 @ 引用)"
          >
            <Paperclip size={16} />
          </button>
          
          {/* 文件选择下拉菜单 */}
          {showFilePicker && (
            <div className="absolute bottom-full right-0 mb-1 w-72 bg-background border border-border rounded-lg shadow-lg z-50">
              <div className="p-2 border-b border-border">
                <input
                  type="text"
                  value={filePickerQuery}
                  onChange={(e) => setFilePickerQuery(e.target.value)}
                  placeholder="搜索文件..."
                  className="w-full px-2 py-1.5 text-sm bg-muted/50 border border-border rounded outline-none focus:ring-1 focus:ring-primary/50"
                  autoFocus
                />
              </div>
              <div className="max-h-60 overflow-y-auto">
                {pickerFilteredFiles.length === 0 ? (
                  <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                    未找到匹配的文件
                  </div>
                ) : (
                  pickerFilteredFiles.map((file) => (
                    <button
                      key={file.path}
                      onClick={() => {
                        if (!referencedFiles.some(f => f.path === file.path)) {
                          setReferencedFiles([...referencedFiles, file]);
                        }
                        setShowFilePicker(false);
                        setFilePickerQuery("");
                      }}
                      className="w-full px-3 py-2 text-sm text-left flex items-center gap-2 hover:bg-accent transition-colors"
                    >
                      {file.isFolder ? (
                        <Folder size={14} className="text-yellow-500 shrink-0" />
                      ) : (
                        <FileText size={14} className="text-slate-500 shrink-0" />
                      )}
                      <span className="truncate">{file.name}</span>
                    </button>
                  ))
                )}
              </div>
              <div className="px-3 py-2 text-xs text-muted-foreground border-t border-border">
                共 {allFiles.length} 个文件
              </div>
            </div>
          )}
        </div>

        {!hideSendButton && (
          isStreaming ? (
            <button
              onClick={onStop}
              className="self-end bg-red-500 hover:bg-red-600 text-white rounded-lg p-2 transition-colors"
              title="停止生成"
            >
              <span className="block w-4 h-4 bg-white rounded-sm" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={(!value.trim() && referencedFiles.length === 0) || isLoading}
              className="self-end bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-lg p-2 transition-colors"
            >
              {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          )
        )}
      </div>

      {/* @ 提及下拉菜单 */}
      {showMention && (
        <div
          ref={mentionRef}
          className="absolute bottom-full left-0 mb-1 w-64 max-h-60 overflow-y-auto bg-background border border-border rounded-lg shadow-lg z-50"
        >
          {filteredFiles.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              未找到匹配的文件
            </div>
          ) : (
            filteredFiles.map((file, index) => (
              <button
                key={file.path}
                onClick={() => selectMention(file)}
                className={cn(
                  "w-full px-3 py-2 text-sm text-left flex items-center gap-2 hover:bg-accent transition-colors",
                  index === mentionIndex && "bg-accent"
                )}
              >
                {file.isFolder ? (
                  <Folder size={14} className="text-yellow-500 shrink-0" />
                ) : (
                  <FileText size={14} className="text-slate-500 shrink-0" />
                )}
                <span className="truncate">{file.name}</span>
              </button>
            ))
          )}
        </div>
      )}

    </div>
  );
});

ChatInput.displayName = 'ChatInput';
