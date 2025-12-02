/**
 * 设置面板
 * 在屏幕中央显示的模态框
 * 带有 iOS 18 风格液态玻璃 + 雨滴效果
 */

import { useUIStore } from "@/stores/useUIStore";
import { useAIStore } from "@/stores/useAIStore";
import { OFFICIAL_THEMES } from "@/lib/themes";
import { X, Check } from "lucide-react";
import { LiquidGlassEffect } from "../effects/LiquidGlassEffect";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { themeId, setThemeId, editorMode, setEditorMode } = useUIStore();
  const { config } = useAIStore();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 背景遮罩 - 液态玻璃效果 */}
      <div 
        className="absolute inset-0 bg-black/30 backdrop-blur-xl"
        onClick={onClose}
        style={{
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
        }}
      >
        {/* 雨滴效果层 */}
        <LiquidGlassEffect />
      </div>
      
      {/* 设置面板 - 液态玻璃风格 */}
      <div 
        className="relative w-[600px] max-h-[80vh] rounded-2xl shadow-2xl overflow-hidden border border-white/20"
        style={{
          background: "linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)",
          backdropFilter: "blur(40px) saturate(150%)",
          WebkitBackdropFilter: "blur(40px) saturate(150%)",
          boxShadow: `
            0 8px 32px rgba(0, 0, 0, 0.3),
            inset 0 1px 0 rgba(255, 255, 255, 0.2),
            inset 0 -1px 0 rgba(0, 0, 0, 0.1)
          `,
        }}
      >
        {/* 顶部高光 */}
        <div 
          className="absolute inset-x-0 top-0 h-px"
          style={{
            background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)",
          }}
        />
        {/* 标题栏 - 液态玻璃风格 */}
        <div 
          className="relative flex items-center justify-between px-6 py-4"
          style={{
            borderBottom: "1px solid rgba(255,255,255,0.1)",
            background: "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, transparent 100%)",
          }}
        >
          <h2 className="text-lg font-semibold text-foreground/90">设置</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full transition-all hover:scale-110"
            style={{
              background: "rgba(255,255,255,0.1)",
              backdropFilter: "blur(10px)",
            }}
          >
            <X size={18} className="text-foreground/70" />
          </button>
        </div>

        {/* 设置内容 - 带内容区域液态效果 */}
        <div 
          className="p-6 space-y-8 overflow-y-auto max-h-[calc(80vh-60px)]"
          style={{
            background: "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.05) 100%)",
          }}
        >
          {/* 主题设置 */}
          <section className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              主题
            </h3>
            <p className="text-sm text-muted-foreground">选择界面配色方案，每套主题自动适配浅色/深色模式</p>
            
            {/* 主题网格 */}
            <div className="grid grid-cols-3 gap-3">
              {OFFICIAL_THEMES.map((theme) => (
                <button
                  key={theme.id}
                  onClick={() => setThemeId(theme.id)}
                  className={`relative p-3 rounded-xl transition-all text-left ${
                    themeId === theme.id
                      ? "ring-2 ring-primary"
                      : "hover:scale-[1.02]"
                  }`}
                  style={{
                    background: themeId === theme.id 
                      ? "rgba(var(--primary-rgb), 0.15)" 
                      : "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    backdropFilter: "blur(10px)",
                    boxShadow: themeId === theme.id 
                      ? "0 4px 20px rgba(var(--primary-rgb), 0.2)" 
                      : "0 2px 10px rgba(0,0,0,0.1)",
                  }}
                >
                  {/* 颜色预览 */}
                  <div className="flex gap-1 mb-2">
                    <div 
                      className="w-4 h-4 rounded-full border border-border"
                      style={{ backgroundColor: `hsl(${theme.light.primary})` }}
                    />
                    <div 
                      className="w-4 h-4 rounded-full border border-border"
                      style={{ backgroundColor: `hsl(${theme.dark.primary})` }}
                    />
                  </div>
                  
                  {/* 主题名称 */}
                  <p className="font-medium text-sm">{theme.name}</p>
                  <p className="text-xs text-muted-foreground">{theme.description}</p>
                  
                  {/* 选中标记 */}
                  {themeId === theme.id && (
                    <div className="absolute top-2 right-2">
                      <Check size={16} className="text-primary" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </section>

          {/* 编辑器设置 */}
          <section className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              编辑器
            </h3>
            
            {/* 编辑模式 */}
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-medium">默认编辑模式</p>
                <p className="text-sm text-muted-foreground">打开文件时的默认视图</p>
              </div>
              <select
                value={editorMode}
                onChange={(e) => setEditorMode(e.target.value as any)}
                className="px-3 py-1.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                style={{
                  background: "rgba(255,255,255,0.1)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  backdropFilter: "blur(10px)",
                }}
              >
                <option value="live">实时预览</option>
                <option value="source">源码模式</option>
                <option value="reading">阅读模式</option>
              </select>
            </div>
          </section>

          {/* AI 设置预览 */}
          <section className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              AI 助手
            </h3>
            
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-medium">当前模型</p>
                <p className="text-sm text-muted-foreground">在右侧面板中配置更多选项</p>
              </div>
              <span 
                className="text-sm text-foreground/70 px-3 py-1.5 rounded-lg"
                style={{
                  background: "rgba(255,255,255,0.1)",
                  border: "1px solid rgba(255,255,255,0.1)",
                }}
              >
                {config.model || "未配置"}
              </span>
            </div>
          </section>

          {/* 关于 */}
          <section className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              关于
            </h3>
            
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-medium">Lumina Note</p>
                <p className="text-sm text-muted-foreground">本地优先的 AI 驱动笔记应用</p>
              </div>
              <span className="text-sm text-muted-foreground">
                v0.1.0
              </span>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
