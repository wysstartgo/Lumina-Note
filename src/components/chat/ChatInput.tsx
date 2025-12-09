/**
 * 聊天输入框组件
 * 支持 @ 引用文件和 📎 按钮选择文件
 */

import React, { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import { useFileStore } from "@/stores/useFileStore";
import { useAIStore } from "@/stores/useAIStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { Send, FileText, Folder, X, Loader2, Paperclip, Quote, Image as ImageIcon, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// 引用的文件
export interface ReferencedFile {
  path: string;
  name: string;
  isFolder: boolean;
}

// 附加的图片
export interface AttachedImage {
  id: string;
  data: string; // base64
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  preview: string; // data URL for preview
}

export interface ChatInputRef {
  send: () => void;
  getReferencedFiles: () => ReferencedFile[];
  getAttachedImages: () => AttachedImage[];
}

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (message: string, files: ReferencedFile[], images?: AttachedImage[]) => void;
  isLoading?: boolean;
  isStreaming?: boolean;
  onStop?: () => void;
  placeholder?: string;
  className?: string;
  rows?: number;
  hideSendButton?: boolean;
  supportsVision?: boolean; // 当前模型是否支持图片
}

export const ChatInput = forwardRef<ChatInputRef, ChatInputProps>(({
  value,
  onChange,
  onSend,
  isLoading = false,
  isStreaming = false,
  onStop,
  placeholder,
  className,
  rows = 2,
  hideSendButton = false,
  supportsVision = true,
}, ref) => {
  const { t } = useLocaleStore();
  const { fileTree } = useFileStore();
  const defaultPlaceholder = placeholder || t.ai.inputPlaceholder;
  const { textSelections, removeTextSelection, clearTextSelections } = useAIStore();
  const [showMention, setShowMention] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const [referencedFiles, setReferencedFiles] = useState<ReferencedFile[]>([]);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [filePickerQuery, setFilePickerQuery] = useState("");
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mentionRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // 处理图片粘贴
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          processImageFile(file);
        }
        break;
      }
    }
  }, []);

  // 处理图片文件
  const processImageFile = useCallback((file: File) => {
    if (!supportsVision) {
      console.warn('当前模型不支持图片输入');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const base64 = dataUrl.split(',')[1];
      const mediaType = file.type as AttachedImage['mediaType'];
      
      const newImage: AttachedImage = {
        id: `img_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        data: base64,
        mediaType,
        preview: dataUrl,
      };
      
      setAttachedImages(prev => [...prev, newImage]);
    };
    reader.readAsDataURL(file);
  }, [supportsVision]);

  // 处理图片选择
  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (const file of files) {
      if (file.type.startsWith('image/')) {
        processImageFile(file);
      }
    }
    // 清空 input 以便重复选择同一文件
    e.target.value = '';
  }, [processImageFile]);

  // 移除附加的图片
  const removeImage = useCallback((id: string) => {
    setAttachedImages(prev => prev.filter(img => img.id !== id));
  }, []);

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
    if (!value.trim() && referencedFiles.length === 0 && textSelections.length === 0 && attachedImages.length === 0) return;
    if (isLoading || isStreaming) return;
    
    // 构建带引用的消息
    let messageToSend = value.trim();
    if (textSelections.length > 0) {
      const quotedTexts = textSelections.map(sel => 
        `> ${t.ai.quoteFrom} ${sel.source}:\n> ${sel.text.split('\n').join('\n> ')}`
      ).join('\n\n');
      messageToSend = quotedTexts + (messageToSend ? `\n\n${messageToSend}` : '');
    }
    
    onSend(messageToSend, referencedFiles, attachedImages.length > 0 ? attachedImages : undefined);
    onChange("");
    setReferencedFiles([]);
    setAttachedImages([]);
    clearTextSelections();
  }, [value, referencedFiles, textSelections, attachedImages, isLoading, isStreaming, onSend, onChange, clearTextSelections]);

  // 暴露方法给父组件
  useImperativeHandle(ref, () => ({
    send: handleSend,
    getReferencedFiles: () => referencedFiles,
    getAttachedImages: () => attachedImages,
  }), [handleSend, referencedFiles, attachedImages]);

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
      {/* 已引用的文件、文本片段和图片标签 */}
      {(referencedFiles.length > 0 || textSelections.length > 0 || attachedImages.length > 0) && (
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
          {/* 图片引用 */}
          {attachedImages.map(img => (
            <div
              key={img.id}
              className="relative group"
            >
              <img
                src={img.preview}
                alt="attached"
                className="h-16 w-16 object-cover rounded-md border border-border"
              />
              <button
                onClick={() => removeImage(img.id)}
                className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
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
          onPaste={handlePaste}
          placeholder={defaultPlaceholder}
          rows={rows}
          className="flex-1 resize-none bg-transparent outline-none text-sm"
        />
        
        {/* 附加图片按钮 */}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          multiple
          className="hidden"
          onChange={handleImageSelect}
        />
        <button
          onClick={() => imageInputRef.current?.click()}
          className={cn(
            "self-end p-2 rounded-lg transition-colors",
            supportsVision
              ? "text-muted-foreground hover:text-foreground hover:bg-muted"
              : "text-muted-foreground/50 cursor-not-allowed"
          )}
          title={supportsVision ? (t.ai.attachImage || '添加图片') : (t.ai.modelNoVision || '当前模型不支持图片')}
          disabled={!supportsVision}
        >
          {supportsVision ? (
            <ImageIcon size={16} />
          ) : (
            <div className="relative">
              <ImageIcon size={16} />
              <AlertCircle size={8} className="absolute -bottom-0.5 -right-0.5 text-yellow-500" />
            </div>
          )}
        </button>

        {/* 附加文件按钮 */}
        <div className="relative self-end" data-file-picker>
          <button
            onClick={() => setShowFilePicker(!showFilePicker)}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            title={t.ai.attachFile}
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
                  placeholder={t.ai.searchFiles}
                  className="w-full px-2 py-1.5 text-sm bg-muted/50 border border-border rounded outline-none focus:ring-1 focus:ring-primary/50"
                  autoFocus
                />
              </div>
              <div className="max-h-60 overflow-y-auto">
                {pickerFilteredFiles.length === 0 ? (
                  <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                    {t.ai.noFilesFound}
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
                {t.ai.totalFiles.replace('{count}', String(allFiles.length))}
              </div>
            </div>
          )}
        </div>

        {!hideSendButton && (
          isStreaming ? (
            <button
              onClick={onStop}
              className="self-end bg-red-500 hover:bg-red-600 text-white rounded-lg p-2 transition-colors"
              title={t.ai.stopGenerate}
            >
              <span className="block w-4 h-4 bg-white rounded-sm" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={(!value.trim() && referencedFiles.length === 0 && attachedImages.length === 0) || isLoading}
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
              {t.ai.noFilesFound}
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
