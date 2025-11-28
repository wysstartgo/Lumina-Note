import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useUIStore } from "@/stores/useUIStore";
import { useAIStore } from "@/stores/useAIStore";
import { useFileStore } from "@/stores/useFileStore";
import { EditSuggestion, applyEdit } from "@/lib/ai";
import {
  BrainCircuit,
  Send,
  AtSign,
  X,
  FileText,
  Settings,
  Trash2,
  Loader2,
  Hash,
  List,
} from "lucide-react";

// Edit suggestion card
function EditCard({ 
  edit, 
  onApply, 
  onReject 
}: { 
  edit: EditSuggestion; 
  onApply: () => void; 
  onReject: () => void;
}) {
  return (
    <div className="border border-border rounded-lg p-3 bg-muted/30 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-primary flex items-center gap-1">
          <FileText size={12} />
          {edit.filePath.split(/[/\\]/).pop()}
        </span>
        <div className="flex gap-1">
          <button
            onClick={onApply}
            className="px-2 py-1 rounded bg-primary/20 text-primary hover:bg-primary/30 transition-colors text-xs font-medium"
            title="预览修改"
          >
            预览
          </button>
          <button
            onClick={onReject}
            className="p-1 rounded bg-red-500/20 text-red-600 hover:bg-red-500/30 transition-colors"
            title="忽略"
          >
            <X size={14} />
          </button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{edit.description}</p>
      <div className="text-xs space-y-1">
        <div className="bg-red-500/10 text-red-600 p-2 rounded font-mono line-through">
          {edit.originalContent.slice(0, 100)}...
        </div>
        <div className="bg-green-500/10 text-green-600 p-2 rounded font-mono">
          {edit.newContent.slice(0, 100)}...
        </div>
      </div>
    </div>
  );
}

// Heading item in outline
interface HeadingItem {
  level: number;
  text: string;
  line: number;
}

// Parse markdown content for headings
function parseHeadings(content: string): HeadingItem[] {
  const lines = content.split("\n");
  const headings: HeadingItem[] = [];
  
  lines.forEach((line, index) => {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      headings.push({
        level: match[1].length,
        text: match[2].trim(),
        line: index + 1,
      });
    }
  });
  
  return headings;
}

// Outline view component
function OutlineView() {
  const { currentContent, currentFile } = useFileStore();
  const [expandedLevels, setExpandedLevels] = useState<Set<number>>(new Set([1, 2, 3]));
  
  const headings = useMemo(() => parseHeadings(currentContent), [currentContent]);
  
  const toggleLevel = useCallback((level: number) => {
    setExpandedLevels(prev => {
      const next = new Set(prev);
      if (next.has(level)) {
        next.delete(level);
      } else {
        next.add(level);
      }
      return next;
    });
  }, []);

  // Scroll to heading (broadcast event)
  const scrollToHeading = useCallback((line: number, text: string) => {
    // Dispatch custom event for editor to scroll to
    window.dispatchEvent(
      new CustomEvent("outline-scroll-to", { detail: { line, text } })
    );
  }, []);
  
  if (!currentFile) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-sm p-4">
        <List size={32} className="opacity-30 mb-2" />
        <p>打开笔记后显示大纲</p>
      </div>
    );
  }
  
  if (headings.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-sm p-4">
        <Hash size={32} className="opacity-30 mb-2" />
        <p>此笔记没有标题</p>
        <p className="text-xs opacity-70 mt-1">使用 # 创建标题</p>
      </div>
    );
  }
  
  // Build tree structure
  const minLevel = Math.min(...headings.map(h => h.level));
  
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-2 border-b border-border flex items-center justify-between">
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <List size={12} />
          {headings.length} 个标题
        </span>
        <div className="flex gap-0.5">
          {[1, 2, 3, 4, 5, 6].map(level => {
            const hasLevel = headings.some(h => h.level === level);
            if (!hasLevel) return null;
            return (
              <button
                key={level}
                onClick={() => toggleLevel(level)}
                className={`w-5 h-5 text-xs rounded transition-colors ${
                  expandedLevels.has(level)
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                }`}
                title={`切换 H${level}`}
              >
                {level}
              </button>
            );
          })}
        </div>
      </div>
      
      {/* Headings list */}
      <div className="flex-1 overflow-y-auto py-2">
        {headings.map((heading, idx) => {
          if (!expandedLevels.has(heading.level)) return null;
          
          const indent = (heading.level - minLevel) * 12;
          
          return (
            <button
              key={idx}
              onClick={() => scrollToHeading(heading.line, heading.text)}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors flex items-center gap-2 group"
              style={{ paddingLeft: 12 + indent }}
            >
              <span className="text-muted-foreground text-xs opacity-50 shrink-0 group-hover:opacity-100">
                H{heading.level}
              </span>
              <span className="truncate">{heading.text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function RightPanel() {
  const { rightPanelTab, setRightPanelTab } = useUIStore();
  const { 
    messages, 
    isLoading, 
    error, 
    referencedFiles,
    pendingEdits,
    config,
    tokenUsage,
    totalTokensUsed,
    sendMessage, 
    clearChat,
    addFileReference,
    removeFileReference,
    clearPendingEdits,
    setConfig,
    setPendingDiff,
  } = useAIStore();
  const { currentFile, currentContent, fileTree } = useFileStore();
  
  const [inputValue, setInputValue] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom (only within chat container, not affecting page)
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // Get current file info for AI context
  const currentFileInfo = useMemo(() => {
    if (!currentFile) return null;
    const name = currentFile.split(/[/\\]/).pop()?.replace(/\.md$/, "") || "";
    return {
      path: currentFile,
      name,
      content: currentContent,
    };
  }, [currentFile, currentContent]);

  // Handle send message
  const handleSend = useCallback(async () => {
    if (!inputValue.trim() || isLoading) return;
    
    const message = inputValue;
    setInputValue("");
    // Pass current file if no manual references added
    await sendMessage(message, currentFileInfo || undefined);
  }, [inputValue, isLoading, sendMessage, currentFileInfo]);

  // Handle key press
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Preview edit in diff view
  const handlePreviewEdit = useCallback((edit: EditSuggestion) => {
    console.log("[Preview] Edit:", edit);
    console.log("[Preview] currentFileInfo:", currentFileInfo);
    console.log("[Preview] referencedFiles:", referencedFiles);
    
    // Normalize file name for comparison
    const editFileName = edit.filePath.replace(/\.md$/, "").toLowerCase();
    
    // Find the file - first check referencedFiles
    let file = referencedFiles.find(f => {
      const refName = f.name.replace(/\.md$/, "").toLowerCase();
      return f.path.toLowerCase().includes(editFileName) || 
             refName.includes(editFileName) ||
             editFileName.includes(refName);
    });
    
    // If not found in referenced files, check current file (auto context)
    // This is the most common case when user doesn't manually add files
    if (!file && currentFileInfo) {
      const currentName = currentFileInfo.name.toLowerCase();
      if (
        currentFileInfo.path.toLowerCase().includes(editFileName) ||
        currentName.includes(editFileName) ||
        editFileName.includes(currentName) ||
        // Also try exact match without extension
        currentName === editFileName
      ) {
        file = currentFileInfo;
      }
    }
    
    // If still not found but we have current file, just use it (AI is likely modifying current file)
    if (!file && currentFileInfo && currentFileInfo.content) {
      console.log("[Preview] Using current file as fallback");
      file = currentFileInfo;
    }
    
    console.log("[Preview] Matched file:", file);
    
    if (file && file.content) {
      const newContent = applyEdit(file.content, edit);
      console.log("[Preview] Original length:", file.content.length);
      console.log("[Preview] Modified length:", newContent.length);
      
      // Set pending diff to show in main view
      setPendingDiff({
        fileName: file.name,
        filePath: file.path,
        original: file.content,
        modified: newContent,
        description: edit.description,
      });
      console.log("[Preview] setPendingDiff called");
    } else {
      console.error("[Preview] No file found or no content");
      alert("❌ 找不到要修改的文件");
    }
  }, [referencedFiles, currentFileInfo, setPendingDiff]);

  // Flatten file tree for picker
  const flattenFiles = (entries: typeof fileTree, result: {path: string; name: string}[] = []): {path: string; name: string}[] => {
    for (const entry of entries) {
      if (entry.is_dir && entry.children) {
        flattenFiles(entry.children, result);
      } else if (!entry.is_dir) {
        result.push({ path: entry.path, name: entry.name });
      }
    }
    return result;
  };

  const allFiles = flattenFiles(fileTree);

  return (
    <aside className="w-full h-full bg-background border-l border-border flex flex-col transition-colors duration-300">
      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setRightPanelTab("chat")}
          className={`flex-1 py-3 text-xs font-medium transition-colors ${
            rightPanelTab === "chat"
              ? "text-primary border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          对话
        </button>
        <button
          onClick={() => setRightPanelTab("outline")}
          className={`flex-1 py-3 text-xs font-medium transition-colors ${
            rightPanelTab === "outline"
              ? "text-primary border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          大纲
        </button>
      </div>

      {/* Chat Interface */}
      {rightPanelTab === "chat" && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="p-2 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <BrainCircuit size={12} />
                {config.apiKey ? "已连接" : "未配置"}
              </span>
              {totalTokensUsed > 0 && (
                <span className="text-xs text-muted-foreground/60">
                  {totalTokensUsed.toLocaleString()} tokens
                </span>
              )}
            </div>
            <div className="flex gap-1">
              <button
                onClick={clearChat}
                className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                title="清空对话"
              >
                <Trash2 size={14} />
              </button>
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                title="设置"
              >
                <Settings size={14} />
              </button>
            </div>
          </div>

          {/* Settings Panel */}
          {showSettings && (
            <div className="p-3 border-b border-border bg-muted/30 space-y-2">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">服务商</label>
                <select
                  value={config.provider}
                  onChange={(e) => {
                    const provider = e.target.value as "moonshot" | "anthropic" | "openai";
                    const defaultModels: Record<string, string> = {
                      moonshot: "kimi-k2-thinking",
                      anthropic: "claude-3-5-sonnet-20241022",
                      openai: "gpt-4-turbo-preview",
                    };
                    setConfig({ provider, model: defaultModels[provider] });
                  }}
                  className="w-full text-xs p-2 rounded border border-border bg-background"
                >
                  <option value="moonshot">Moonshot (Kimi K2)</option>
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="openai">OpenAI (GPT)</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">API Key</label>
                <input
                  type="password"
                  value={config.apiKey}
                  onChange={(e) => setConfig({ apiKey: e.target.value })}
                  placeholder={config.provider === "moonshot" ? "sk-..." : config.provider === "anthropic" ? "sk-ant-..." : "sk-..."}
                  className="w-full text-xs p-2 rounded border border-border bg-background"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">模型</label>
                <select
                  value={config.model}
                  onChange={(e) => setConfig({ model: e.target.value })}
                  className="w-full text-xs p-2 rounded border border-border bg-background"
                >
                  {config.provider === "moonshot" && (
                    <>
                      <option value="kimi-k2-thinking">Kimi K2 Thinking 🧠</option>
                      <option value="kimi-k2-0711-preview">Kimi K2 (Preview)</option>
                      <option value="moonshot-v1-128k">Moonshot v1 128K</option>
                      <option value="moonshot-v1-32k">Moonshot v1 32K</option>
                    </>
                  )}
                  {config.provider === "anthropic" && (
                    <>
                      <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
                      <option value="claude-3-opus-20240229">Claude 3 Opus</option>
                      <option value="claude-3-haiku-20240307">Claude 3 Haiku</option>
                    </>
                  )}
                  {config.provider === "openai" && (
                    <>
                      <option value="gpt-4-turbo-preview">GPT-4 Turbo</option>
                      <option value="gpt-4">GPT-4</option>
                      <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                    </>
                  )}
                </select>
              </div>
            </div>
          )}

          {/* Context indicator - shows which file(s) will be sent to AI */}
          <div className="p-2 border-b border-border">
            <div className="text-xs text-muted-foreground mb-1">上下文:</div>
            <div className="flex flex-wrap gap-1">
              {referencedFiles.length > 0 ? (
                // Show manually added files
                referencedFiles.map((file) => (
                  <span
                    key={file.path}
                    className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-1 rounded"
                  >
                    <FileText size={10} />
                    {file.name}
                    <button onClick={() => removeFileReference(file.path)}>
                      <X size={10} />
                    </button>
                  </span>
                ))
              ) : currentFileInfo ? (
                // Show current focused file (auto)
                <span className="inline-flex items-center gap-1 text-xs bg-muted text-muted-foreground px-2 py-1 rounded">
                  <FileText size={10} />
                  {currentFileInfo.name}
                  <span className="text-[10px] opacity-60">(自动)</span>
                </span>
              ) : (
                <span className="text-xs text-muted-foreground/60">无文件</span>
              )}
            </div>
          </div>

          {/* Chat History */}
          <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-3 space-y-3">
            {/* Welcome message */}
            {messages.length === 0 && (
              <div className="text-sm text-muted-foreground leading-relaxed">
                <p>你好！我可以帮你编辑笔记。</p>
                <p className="mt-2 text-xs opacity-70">当前笔记会自动作为上下文</p>
              </div>
            )}

            {/* Messages - Windsurf style */}
            {messages.map((msg, idx) => (
              <div key={idx} className={`${msg.role === "user" ? "flex justify-end" : ""}`}>
                {msg.role === "user" ? (
                  // User message - right aligned, blue background
                  <div className="max-w-[85%] bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-4 py-2.5 text-sm">
                    {msg.content}
                  </div>
                ) : (
                  // AI message - left aligned, simple text
                  <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                    {msg.content}
                  </div>
                )}
              </div>
            ))}

            {/* Pending edits */}
            {pendingEdits.length > 0 && (
              <div className="space-y-2 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <p className="text-xs font-semibold text-yellow-600 dark:text-yellow-400">
                  📝 待确认的修改 ({pendingEdits.length})
                </p>
                {pendingEdits.map((edit, idx) => (
                  <EditCard
                    key={idx}
                    edit={edit}
                    onApply={() => handlePreviewEdit(edit)}
                    onReject={clearPendingEdits}
                  />
                ))}
              </div>
            )}

            {/* Loading */}
            {isLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 size={14} className="animate-spin" />
                <span>思考中...</span>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="text-sm text-red-500 p-2 bg-red-500/10 rounded">
                {error}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* File Picker */}
          {showFilePicker && (
            <div className="absolute bottom-24 left-3 right-3 bg-background border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto z-10">
              {allFiles.map((file) => (
                <button
                  key={file.path}
                  onClick={() => {
                    addFileReference(file.path, file.name);
                    setShowFilePicker(false);
                  }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2"
                >
                  <FileText size={12} />
                  {file.name}
                </button>
              ))}
            </div>
          )}

          {/* Input Area */}
          <div className="p-3 border-t border-border">
            <div className="bg-muted/30 border border-border rounded-lg p-2 focus-within:ring-1 focus-within:ring-primary/50 transition-all">
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入消息..."
                className="w-full bg-transparent resize-none outline-none text-sm min-h-[60px] max-h-32 text-foreground placeholder-muted-foreground"
              />
              <div className="flex justify-between items-center mt-2">
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowFilePicker(!showFilePicker)}
                    className="text-muted-foreground hover:text-foreground transition-colors p-1"
                    title="引用文件"
                  >
                    <AtSign size={14} />
                  </button>
                  <span className="text-xs text-muted-foreground/60">
                    @ 添加文件
                  </span>
                </div>
                <button
                  onClick={handleSend}
                  disabled={!inputValue.trim() || isLoading}
                  className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded p-1.5 transition-colors"
                >
                  <Send size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Outline View */}
      {rightPanelTab === "outline" && <OutlineView />}
    </aside>
  );
}
