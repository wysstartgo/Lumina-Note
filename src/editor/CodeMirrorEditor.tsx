import { parseMarkdown } from "@/lib/markdown";
import { useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from "react";
import { useFileStore } from "@/stores/useFileStore";
import { useAIStore } from "@/stores/useAIStore";
import { useSplitStore } from "@/stores/useSplitStore";
import { useUIStore } from "@/stores/useUIStore";
import { parseLuminaLink } from "@/lib/annotations";
import { EditorState, StateField, StateEffect, Compartment, Facet } from "@codemirror/state";
import {
  EditorView,
  keymap,
  Decoration,
  DecorationSet,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { syntaxTree } from "@codemirror/language";
import katex from "katex";
import { common, createLowlight } from "lowlight";

// Initialize lowlight with common languages
const lowlight = createLowlight(common);

/** 编辑器视图模式 */
export type ViewMode = 'reading' | 'live' | 'source';

// ============ 1. 核心架构：Compartments & Facets ============

// Compartments: 用于在不销毁 View 的情况下动态切换配置
const viewModeCompartment = new Compartment();  // 管理 Widget 和 模式特定的插件
const readOnlyCompartment = new Compartment();  // 管理只读状态
const themeCompartment = new Compartment();     // 管理主题 (预留)

// Facet: 控制 Widget 的交互行为
// Reading 模式 -> false (永远渲染 Widget)
// Live 模式 -> true (选中时塌缩回源码)
const collapseOnSelectionFacet = Facet.define<boolean, boolean>({
  combine: values => values[0] ?? false
});

// ============ 2. 全局状态管理 ============

// 鼠标拖拽状态：用于防止拖拽选择时 Widget 频繁闪烁
const setMouseSelecting = StateEffect.define<boolean>();
const mouseSelectingField = StateField.define<boolean>({
  create: () => false,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setMouseSelecting)) return effect.value;
    }
    return value;
  },
});

interface CodeMirrorEditorProps {
  content: string;
  onChange: (content: string) => void;
  className?: string;
  isDark?: boolean; // 保留接口定义以兼容父组件传参，但在内部解构时会忽略
  viewMode?: ViewMode;
  /** @deprecated 使用 viewMode 代替 */
  livePreview?: boolean;
}

export interface CodeMirrorEditorRef {
  getScrollLine: () => number;
  scrollToLine: (line: number) => void;
}

// ============ 3. 样式定义 (CSS 变量) ============
const editorTheme = EditorView.theme({
  "&": { backgroundColor: "transparent", fontSize: "16px", height: "100%" },
  ".cm-content": { fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", padding: "16px 0", caretColor: "hsl(var(--primary))" },
  ".cm-line": { padding: "0 16px", paddingLeft: "16px", lineHeight: "1.75", position: "relative" },
  ".cm-cursor": { borderLeftColor: "hsl(var(--primary))", borderLeftWidth: "2px" },
  ".cm-selectionBackground": { backgroundColor: "rgba(147, 197, 253, 0.35) !important" },
  "&.cm-focused .cm-selectionBackground": { backgroundColor: "rgba(147, 197, 253, 0.45) !important" },
  "& ::selection": { backgroundColor: "rgba(147, 197, 253, 0.45) !important" },
  ".cm-gutters": { display: "none" },
  // Headers
  ".cm-header-1": { fontSize: "2em", fontWeight: "700", lineHeight: "1.3", color: "hsl(var(--md-heading, var(--foreground)))" },
  ".cm-header-2": { fontSize: "1.5em", fontWeight: "600", lineHeight: "1.4", color: "hsl(var(--md-heading, var(--foreground)))" },
  ".cm-header-3": { fontSize: "1.25em", fontWeight: "600", lineHeight: "1.5", color: "hsl(var(--md-heading, var(--foreground)))" },
  ".cm-header-4": { fontSize: "1.1em", fontWeight: "600", color: "hsl(var(--md-heading, var(--foreground)))" },
  ".cm-header-5, .cm-header-6": { fontWeight: "600", color: "hsl(var(--md-heading, var(--foreground)))" },
  ".cm-line.cm-heading-line": { paddingLeft: "0 !important", marginLeft: "16px" },
  // Base Syntax
  ".cm-strong": { fontWeight: "700", color: "hsl(var(--md-bold, var(--foreground)))" },
  ".cm-emphasis": { fontStyle: "italic", color: "hsl(var(--md-italic, var(--foreground)))" },
  ".cm-strikethrough": { textDecoration: "line-through" },
  ".cm-link": { color: "hsl(var(--md-link, var(--primary)))", textDecoration: "underline" },
  ".cm-url": { color: "hsl(var(--muted-foreground))" },
  ".cm-wikilink": { color: "hsl(var(--primary))", textDecoration: "underline", cursor: "text", borderRadius: "2px", transition: "background-color 0.15s ease", "&:hover": { backgroundColor: "hsl(var(--primary) / 0.1)" } },
  // Code
  ".cm-code, .cm-inline-code": { backgroundColor: "hsl(var(--md-code-bg, var(--muted)))", color: "hsl(var(--md-code, var(--foreground)))", padding: "2px 4px", borderRadius: "3px", fontFamily: "'JetBrains Mono', 'Fira Code', monospace" },
  ".cm-codeblock": { backgroundColor: "hsl(var(--md-code-block-bg, var(--muted)))", color: "hsl(var(--md-code-block, var(--foreground)))" },
  ".cm-quote": { color: "hsl(var(--md-blockquote, var(--muted-foreground)))", fontStyle: "italic" },
  ".cm-list-bullet, .cm-list-number": { color: "hsl(var(--md-list-marker, var(--primary)))" },
  // Formatting Tokens (Hidden/Visible)
  ".cm-formatting": { color: "hsl(var(--muted-foreground) / 0.6)" },
  ".cm-formatting-hanging": { position: "absolute", right: "100%", marginRight: "8px", color: "hsl(var(--muted-foreground) / 0.6)", fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: "0.9em", userSelect: "none", pointerEvents: "none", whiteSpace: "nowrap" },
  ".cm-formatting-inline": { display: "inline-flex", alignItems: "center", justifyContent: "center", overflow: "hidden", whiteSpace: "nowrap", verticalAlign: "baseline", color: "hsl(var(--muted-foreground) / 0.6)", fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: "0.85em", maxWidth: "0", opacity: "0", transition: "max-width 0.25s cubic-bezier(0.2, 0, 0.2, 1), opacity 0.2s ease-out" },
  ".cm-formatting-inline-visible": { maxWidth: "4ch", opacity: "1", margin: "0 1px" },
  ".cm-formatting-hidden": { display: "none" },
  ".cm-tag, .cm-hashtag": { color: "hsl(var(--md-tag, var(--primary)))" },
  ".cm-hr": { color: "hsl(var(--md-hr, var(--border)))" },
  // Math
  ".cm-math-inline": { display: "inline-block", verticalAlign: "middle" },
  ".cm-math-block": { display: "block", textAlign: "center", padding: "0.5em 0", overflow: "auto" },
  ".cm-math-error": { color: "hsl(0 70% 50%)", fontFamily: "monospace" },
  // Voice
  ".cm-voice-preview": { color: "hsl(var(--muted-foreground))", opacity: 0.8, fontStyle: "italic" },
});

// ============ 4. Widgets 实现 (确保 eq 方法正确) ============

class MathWidget extends WidgetType {
  constructor(readonly formula: string, readonly displayMode: boolean) { super(); }
  eq(other: MathWidget) { return other.formula === this.formula && other.displayMode === this.displayMode; }
  toDOM() {
    const container = document.createElement("span");
    container.className = this.displayMode ? "cm-math-block" : "cm-math-inline";
    try {
      katex.render(this.formula, container, { displayMode: this.displayMode, throwOnError: false, trust: true, strict: false });
    } catch (e) { container.textContent = this.formula; container.className += " cm-math-error"; }
    return container;
  }
  ignoreEvent() { return false; }
}

class TableWidget extends WidgetType {
  constructor(readonly markdown: string) { super(); }
  eq(other: TableWidget) { return other.markdown === this.markdown; }
  toDOM() {
    const container = document.createElement("div");
    container.className = "cm-table-widget reading-view prose max-w-none";
    container.innerHTML = parseMarkdown(this.markdown);
    return container;
  }
  ignoreEvent() { return true; } // 阻止光标进入 Widget 内部 DOM
}

class CodeBlockWidget extends WidgetType {
  constructor(readonly code: string, readonly language: string) { super(); }
  eq(other: CodeBlockWidget) { return other.code === this.code && other.language === this.language; }
  toDOM() {
    const container = document.createElement("div");
    container.className = "cm-code-block-widget relative group";
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.className = "hljs";
    if (this.language) code.classList.add(`language-${this.language}`);
    
    // 使用 lowlight 同步高亮 (Widget 缓存机制保证性能)
    let highlighted = false;
    if (this.language) {
      try {
        if (lowlight.registered(this.language)) {
          const tree = lowlight.highlight(this.language, this.code);
          this.hastToDOM(tree.children, code);
          highlighted = true;
        }
      } catch (e) { console.warn("Highlight error:", e); }
    }
    if (!highlighted) code.textContent = this.code;
    
    pre.appendChild(code);
    container.appendChild(pre);
    if (this.language) {
      const label = document.createElement("div");
      label.className = "absolute top-1 right-2 text-xs text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity select-none pointer-events-none font-sans";
      label.textContent = this.language;
      container.appendChild(label);
    }
    return container;
  }
  hastToDOM(nodes: any[], parent: HTMLElement) {
    for (const node of nodes) {
      if (node.type === 'text') parent.appendChild(document.createTextNode(node.value));
      else if (node.type === 'element') {
        const el = document.createElement(node.tagName);
        if (node.properties?.className) el.className = node.properties.className.join(' ');
        if (node.children) this.hastToDOM(node.children, el);
        parent.appendChild(el);
      }
    }
  }
  ignoreEvent() { return false; }
}

class HangingMarkWidget extends WidgetType {
  constructor(readonly mark: string) { super(); }
  eq(other: HangingMarkWidget) { return other.mark === this.mark; }
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-formatting-hanging";
    span.textContent = this.mark;
    return span;
  }
  ignoreEvent() { return true; }
}

class CalloutIconWidget extends WidgetType {
  constructor(readonly icon: string) { super(); }
  eq(other: CalloutIconWidget) { return other.icon === this.icon; }
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-callout-icon";
    span.textContent = this.icon;
    span.style.cssText = "margin-right: 6px; font-size: 1.1em;";
    return span;
  }
  ignoreEvent() { return true; }
}

class VoicePreviewWidget extends WidgetType {
  constructor(readonly text: string) { super(); }
  eq(other: VoicePreviewWidget) { return other.text === this.text; }
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-voice-preview";
    span.textContent = this.text;
    return span;
  }
  ignoreEvent() { return true; }
}

// ============ 5. StateFields (使用 Facet 控制渲染逻辑) ============

// 核心逻辑：判断当前区域是否需要显示源码
const shouldShowSource = (state: EditorState, from: number, to: number): boolean => {
  // 1. 检查 Facet 配置 (Reading=false, Live=true)
  const shouldCollapse = state.facet(collapseOnSelectionFacet);
  if (!shouldCollapse) return false; // Reading 模式：始终渲染 Widget

  // 2. 拖拽时保持渲染
  if (state.field(mouseSelectingField, false)) return false;

  // 3. 检查光标重叠 (Live 模式)
  for (const range of state.selection.ranges) {
    if (range.from <= to && range.to >= from) return true;
  }
  return false;
};

// WikiLink 始终显示
const wikiLinkStateField = StateField.define<DecorationSet>({
  create: buildWikiLinkDecorations,
  update(deco, tr) { return tr.docChanged ? buildWikiLinkDecorations(tr.state) : deco.map(tr.changes); },
  provide: f => EditorView.decorations.from(f),
});
function buildWikiLinkDecorations(state: EditorState): DecorationSet {
  const decorations: any[] = [];
  const wikiLinkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  let match;
  while ((match = wikiLinkRegex.exec(state.doc.toString())) !== null) {
    decorations.push(Decoration.mark({ class: "cm-wikilink", attributes: { "data-wikilink": match[1].trim() } }).range(match.index, match.index + match[0].length));
  }
  return Decoration.set(decorations);
}

const codeBlockStateField = StateField.define<DecorationSet>({
  create: buildCodeBlockDecorations,
  update(deco, tr) {
    // 性能优化：只有在文档变动、选择变动或配置重载时才重新计算
    // 修复：tr.reconfigured
    if (tr.docChanged || tr.selection || tr.reconfigured || tr.effects.some(e => e.is(setMouseSelecting))) {
      return buildCodeBlockDecorations(tr.state);
    }
    return deco.map(tr.changes);
  },
  provide: f => EditorView.decorations.from(f),
});
function buildCodeBlockDecorations(state: EditorState): DecorationSet {
  const decorations: any[] = [];
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name === "FencedCode") {
        if (shouldShowSource(state, node.from, node.to)) return;
        
        const text = state.doc.sliceString(node.from, node.to);
        const lines = text.split('\n');
        if (lines.length < 2) return;
        const language = lines[0].replace(/^\s*`{3,}/, "").trim();
        const codeLines = lines.slice(1);
        const lastLine = codeLines[codeLines.length - 1];
        if (lastLine && /^\s*`{3,}\s*$/.test(lastLine)) codeLines.pop();
        
        decorations.push(Decoration.replace({ widget: new CodeBlockWidget(codeLines.join('\n'), language), block: true }).range(node.from, node.to));
      }
    },
  });
  return Decoration.set(decorations);
}

const tableStateField = StateField.define<DecorationSet>({
  create: buildTableDecorations,
  update(deco, tr) {
    // 修复：tr.reconfigured
    if (tr.docChanged || tr.selection || tr.reconfigured || tr.effects.some(e => e.is(setMouseSelecting))) return buildTableDecorations(tr.state);
    return deco.map(tr.changes);
  },
  provide: f => EditorView.decorations.from(f),
});
function buildTableDecorations(state: EditorState): DecorationSet {
  const decorations: any[] = [];
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name === "Table") {
        if (shouldShowSource(state, node.from, node.to)) return;
        decorations.push(Decoration.replace({ widget: new TableWidget(state.doc.sliceString(node.from, node.to)), block: true }).range(node.from, node.to));
      }
    },
  });
  return Decoration.set(decorations);
}

const mathStateField = StateField.define<DecorationSet>({
  create: buildMathDecorations,
  update(deco, tr) {
    // 修复：tr.reconfigured
    if (tr.docChanged || tr.selection || tr.reconfigured || tr.effects.some(e => e.is(setMouseSelecting))) return buildMathDecorations(tr.state);
    return deco.map(tr.changes);
  },
  provide: f => EditorView.decorations.from(f),
});
function buildMathDecorations(state: EditorState): DecorationSet {
  try {
    const decorations: any[] = [];
    const doc = state.doc.toString();
    const processed: {from:number, to:number}[] = [];
    
    // Block $$...$$
    const blockRegex = /\$\$([\s\S]+?)\$\$/g;
    let match;
    while ((match = blockRegex.exec(doc)) !== null) {
      const from = match.index, to = from + match[0].length;
      processed.push({from, to});
      if (shouldShowSource(state, from, to)) continue;
      const fromLine = state.doc.lineAt(from), toLine = state.doc.lineAt(to);
      const isFullLine = from === fromLine.from && to === toLine.to;
      decorations.push(Decoration.replace({ widget: new MathWidget(match[1].trim(), true), block: isFullLine }).range(from, to));
    }

    // Inline $...$
    const inlineRegex = /(?<!\\|\$)\$(?!\$)((?:[^$\n]|\n(?!\n))+?)(?<!\\|\$)\$(?!\$)/g;
    while ((match = inlineRegex.exec(doc)) !== null) {
      const from = match.index, to = from + match[0].length;
      if (processed.some(p => from >= p.from && to <= p.to)) continue;
      if (shouldShowSource(state, from, to)) continue;
      const fromLine = state.doc.lineAt(from), toLine = state.doc.lineAt(to);
      const isFullLine = from === fromLine.from && to === toLine.to;
      if (fromLine.number !== toLine.number && !isFullLine) continue;
      decorations.push(Decoration.replace({ widget: new MathWidget(match[1].trim(), isFullLine), block: isFullLine }).range(from, to));
    }
    return Decoration.set(decorations.sort((a,b)=>a.from-b.from), true);
  } catch { return Decoration.none; }
}

const calloutStateField = StateField.define<DecorationSet>({
  create: buildCalloutDecorations,
  update(deco, tr) { return (tr.docChanged || tr.selection) ? buildCalloutDecorations(tr.state) : deco.map(tr.changes); },
  provide: f => EditorView.decorations.from(f),
});
const CALLOUT_COLORS: Record<string, string> = { note: "blue", abstract: "blue", info: "blue", tip: "green", success: "green", question: "yellow", warning: "yellow", danger: "red", failure: "red", bug: "red", example: "purple", quote: "gray", summary: "blue" };
const CALLOUT_ICONS: Record<string, string> = { note: "📝", abstract: "📄", summary: "📄", info: "ℹ️", tip: "💡", hint: "💡", success: "✅", check: "✅", done: "✅", question: "❓", help: "❓", faq: "❓", warning: "⚠️", caution: "⚠️", attention: "⚠️", danger: "🔴", error: "❌", failure: "❌", fail: "❌", missing: "❌", bug: "🐛", example: "📋", quote: "💬", cite: "💬" };
function buildCalloutDecorations(state: EditorState): DecorationSet {
  const decorations: any[] = [];
  const doc = state.doc;
  let lineNo = 1;
  while (lineNo <= doc.lines) {
    const line = doc.line(lineNo);
    const match = line.text.match(/^>\s*\[!([^\]]+)\]/);
    if (!match) { lineNo++; continue; }
    const rawType = match[1].trim();
    const type = rawType.toLowerCase();
    const isEmojiType = !/^\w+$/.test(rawType);
    const color = isEmojiType ? "blue" : (CALLOUT_COLORS[type] || "gray");
    const icon = isEmojiType ? rawType : (CALLOUT_ICONS[type] || "📝");
    
    const calloutLines = [{from: line.from}];
    let nextLineNo = lineNo + 1;
    while (nextLineNo <= doc.lines) {
      const nextLine = doc.line(nextLineNo);
      if (/^>\s*/.test(nextLine.text) || nextLine.text.trim() === "") { calloutLines.push({from: nextLine.from}); nextLineNo++; } else break;
    }
    calloutLines.forEach((l, idx) => {
      let cls = `callout callout-${color}`;
      if (idx === 0) {
        cls += " callout-first";
        const headerMatch = doc.line(lineNo).text.match(/^(>\s*)(\[![^\]]+\])(\s*)/);
        if (headerMatch) {
            const start = line.from + headerMatch[1].length;
            decorations.push(Decoration.replace({ widget: new CalloutIconWidget(icon) }).range(start, start + headerMatch[2].length));
        }
      }
      if (idx === calloutLines.length - 1) cls += " callout-last";
      decorations.push(Decoration.line({ class: cls }).range(l.from));
    });
    lineNo = nextLineNo;
  }
  return Decoration.set(decorations.sort((a,b)=>a.from-b.from), true);
}

// ============ 6. Plugins (隐藏 Token) ============

const readingModePlugin = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) { this.decorations = this.build(view.state); }
  update(u: ViewUpdate) {
    // 修复：ViewUpdate 没有 reconfigured 属性，需要从 transactions 中检查
    const reconfigured = u.transactions.some(tr => tr.reconfigured);
    if (u.docChanged || reconfigured) {
        this.decorations = this.build(u.state); 
    }
  }
  build(state: EditorState) {
    const d: any[] = [];
    syntaxTree(state).iterate({
      enter: (node) => {
        if (["HeaderMark", "EmphasisMark", "StrikethroughMark", "CodeMark", "ListMark", "QuoteMark"].includes(node.name)) {
          this.hide(state, node.from, node.to, d);
        }
      }
    });
    return Decoration.set(d, true);
  }
  hide(state: EditorState, from: number, to: number, d: any[]) {
    if (from >= to || state.doc.sliceString(from, to).includes('\n')) return;
    d.push(Decoration.mark({ class: "cm-formatting-hidden" }).range(from, to));
  }
}, { decorations: v => v.decorations });

const livePreviewPlugin = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) {
    this.decorations = this.build(view);
    view.contentDOM.addEventListener('mousedown', () => view.dispatch({ effects: setMouseSelecting.of(true) }));
    document.addEventListener('mouseup', () => { if(view.state.field(mouseSelectingField, false)) view.dispatch({ effects: setMouseSelecting.of(false) }); });
  }
  update(u: ViewUpdate) {
    // 修复：ViewUpdate 没有 reconfigured 属性，需要从 transactions 中检查
    const reconfigured = u.transactions.some(tr => tr.reconfigured);
    // 只有相关变化才重建
    if (u.docChanged || u.selectionSet || reconfigured || u.transactions.some(tr => tr.effects.some(e => e.is(setMouseSelecting)))) {
      this.decorations = this.build(u.view);
    }
  }
  build(view: EditorView) {
    const d: any[] = [];
    const { state } = view;
    const activeLines = new Set<number>();
    for(const r of state.selection.ranges) {
      const start = state.doc.lineAt(r.from).number, end = state.doc.lineAt(r.to).number;
      for(let l=start; l<=end; l++) activeLines.add(l);
    }
    const lineHanging = new Map<number, boolean>();
    
    syntaxTree(state).iterate({
      enter: (node) => {
        if (!["HeaderMark", "EmphasisMark", "StrikethroughMark", "CodeMark", "ListMark", "QuoteMark"].includes(node.name)) return;
        const line = state.doc.lineAt(node.from).number;
        const isActive = activeLines.has(line);
        const isBlock = ["HeaderMark", "ListMark", "QuoteMark"].includes(node.name);
        
        if (isBlock) {
          if (isActive && !lineHanging.has(line)) {
            lineHanging.set(line, true);
            d.push(Decoration.widget({ widget: new HangingMarkWidget(state.doc.sliceString(node.from, node.to)), side: -1 }).range(node.from));
          }
          this.hide(state, node.from, node.to, d);
        } else {
          if (node.from >= node.to || state.doc.lineAt(node.from).number !== state.doc.lineAt(node.to).number) return;
          const cls = isActive ? "cm-formatting-inline cm-formatting-inline-visible" : "cm-formatting-inline";
          d.push(Decoration.mark({ class: cls }).range(node.from, node.to));
        }
      }
    });
    return Decoration.set(d.sort((a,b)=>a.from-b.from), true);
  }
  hide(state: EditorState, from: number, to: number, d: any[]) {
    if (from >= to || state.doc.sliceString(from, to).includes('\n')) return;
    d.push(Decoration.mark({ class: "cm-formatting-hidden" }).range(from, to));
  }
}, { decorations: v => v.decorations });

// Markdown Style
const markdownStylePlugin = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) { this.decorations = this.build(view); }
  update(u: ViewUpdate) { if (u.docChanged || u.viewportChanged) this.decorations = this.build(u.view); }
  build(view: EditorView) {
    const d: any[] = [];
    syntaxTree(view.state).iterate({
      enter: (node) => {
        const type = node.name;
        const map: Record<string, string> = { 
          "ATXHeading1": "cm-header-1", "ATXHeading2": "cm-header-2", "ATXHeading3": "cm-header-3", "ATXHeading4": "cm-header-4", 
          "StrongEmphasis": "cm-strong", "Emphasis": "cm-emphasis", "Strikethrough": "cm-strikethrough", "InlineCode": "cm-code", "Link": "cm-link", "URL": "cm-url" 
        };
        // Header 5/6 fallback to 4
        if (type.startsWith("ATXHeading")) {
          const cls = map[type] || "cm-header-4";
          d.push(Decoration.mark({ class: cls }).range(node.from, node.to));
          d.push(Decoration.line({ class: "cm-heading-line" }).range(node.from));
        } else if (map[type]) {
          d.push(Decoration.mark({ class: map[type] }).range(node.from, node.to));
        }
      }
    });
    return Decoration.set(d, true);
  }
}, { decorations: v => v.decorations });

// Voice Preview
const setVoicePreview = StateEffect.define<{ from: number; text: string }>();
const clearVoicePreview = StateEffect.define<null | void>();
const voicePreviewField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(val, tr) {
    let deco = val;
    for (const e of tr.effects) {
      if (e.is(setVoicePreview)) deco = e.value.text ? Decoration.set([Decoration.widget({ widget: new VoicePreviewWidget(e.value.text), side: 1 }).range(e.value.from)]) : Decoration.none;
      if (e.is(clearVoicePreview)) deco = Decoration.none;
    }
    return tr.docChanged && deco !== Decoration.none ? deco.map(tr.changes) : deco;
  },
  provide: f => EditorView.decorations.from(f),
});

// ============ 7. React 组件 ============

export const CodeMirrorEditor = forwardRef<CodeMirrorEditorRef, CodeMirrorEditorProps>(
  function CodeMirrorEditor({ content, onChange, className = "", viewMode, livePreview }, ref) {
    
    // 兼容逻辑
    const effectiveMode: ViewMode = viewMode ?? (livePreview === false ? 'source' : 'live');
    const isReadOnly = effectiveMode === 'reading';

    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const isExternalChange = useRef(false);
    const lastInternalContent = useRef<string>(content);

    const { openVideoNoteTab, openPDFTab, fileTree, openFile } = useFileStore();
    const { openSecondaryPdf } = useSplitStore();
    const { setSplitView } = useUIStore();

    // 根据模式加载不同插件 (Source模式下卸载重型Widget)
    const getModeExtensions = useCallback((mode: ViewMode) => {
      const widgets = [mathStateField, tableStateField, codeBlockStateField, calloutStateField];
      switch (mode) {
        case 'reading': return [collapseOnSelectionFacet.of(false), readingModePlugin, ...widgets];
        case 'live': return [collapseOnSelectionFacet.of(true), livePreviewPlugin, ...widgets];
        case 'source': default: return [calloutStateField]; // Source 模式只保留 Callout 颜色条，卸载其他
      }
    }, []);

    useImperativeHandle(ref, () => ({
      getScrollLine: () => {
        const view = viewRef.current;
        if (!view) return 1;
        const pos = view.lineBlockAtHeight(view.scrollDOM.scrollTop).from;
        return view.state.doc.lineAt(pos).number;
      },
      scrollToLine: (line: number) => {
        const view = viewRef.current;
        if (!view) return;
        const target = Math.min(Math.max(1, line), view.state.doc.lines);
        view.dispatch({ effects: EditorView.scrollIntoView(view.state.doc.line(target).from, { y: "start" }) });
      }
    }), []);

    // 1. 初始化 EditorView (只执行一次)
    useEffect(() => {
      if (!containerRef.current) return;

      const state = EditorState.create({
        doc: content,
        extensions: [
          // 隔舱配置
          viewModeCompartment.of(getModeExtensions(effectiveMode)),
          readOnlyCompartment.of(EditorState.readOnly.of(isReadOnly)),
          themeCompartment.of([]),
          // 基础功能
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown({ base: markdownLanguage }),
          EditorView.lineWrapping,
          editorTheme,
          // 状态
          mouseSelectingField,
          wikiLinkStateField,
          voicePreviewField,
          markdownStylePlugin,
          
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !isExternalChange.current) {
              const newContent = update.state.doc.toString();
              lastInternalContent.current = newContent;
              onChange(newContent);
            }
          }),
        ],
      });

      const view = new EditorView({ state, parent: containerRef.current });
      viewRef.current = view;

      return () => { view.destroy(); viewRef.current = null; };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); 

    // 2. 模式切换 (使用 reconfigure 而非重建)
    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      
      view.dispatch({
        effects: [
          viewModeCompartment.reconfigure(getModeExtensions(effectiveMode)),
          readOnlyCompartment.reconfigure(EditorState.readOnly.of(isReadOnly))
        ]
      });
    }, [effectiveMode, isReadOnly, getModeExtensions]);

    // 3. 外部内容同步
    useEffect(() => {
      const view = viewRef.current;
      if (!view || content === lastInternalContent.current) return;
      const current = view.state.doc.toString();
      if (current !== content) {
        isExternalChange.current = true;
        const sel = view.state.selection.main.head;
        view.dispatch({ changes: { from: 0, to: current.length, insert: content }, selection: { anchor: Math.min(sel, content.length) } });
        lastInternalContent.current = content;
        isExternalChange.current = false;
      }
    }, [content]);

    // 4. 事件监听 (Click, Voice, AI) - 绑定到 ContentDOM
    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;

      const handleClicks = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        const link = target.closest('a[href]');
        
        // Lumina PDF
        if (link?.getAttribute('href')?.startsWith('lumina://pdf')) {
          e.preventDefault(); e.stopPropagation();
          const parsed = parseLuminaLink(link.getAttribute('href')!);
          if (parsed?.file) (e.ctrlKey || e.metaKey) ? (setSplitView(true), openSecondaryPdf(parsed.file, parsed.page||1, parsed.id)) : openPDFTab(parsed.file);
          return;
        }

        // WikiLink
        const wikiEl = target.closest(".cm-wikilink");
        if (wikiEl && (e.ctrlKey || e.metaKey)) {
          e.preventDefault(); e.stopPropagation();
          const name = wikiEl.getAttribute("data-wikilink");
          if (name) {
            // 简单遍历查找逻辑
            const find = (arr: any[]): string|null => { for(const i of arr) { if(!i.is_dir && i.name.replace(".md","").toLowerCase() === name.toLowerCase()) return i.path; if(i.is_dir) { const r = find(i.children); if(r) return r; } } return null; };
            const path = find(fileTree);
            path ? openFile(path) : console.log(`Not found: ${name}`);
          }
          return;
        }

        // Bilibili
        if (e.ctrlKey || e.metaKey) {
           if (link) {
             const h = link.getAttribute('href')!;
             if (h.includes('bilibili') || h.includes('b23.tv')) { e.preventDefault(); e.stopPropagation(); openVideoNoteTab(h); return; }
           }
           // Scan text for link
           const pos = view.posAtCoords({x: e.clientX, y: e.clientY});
           if (pos !== null) {
              const txt = view.state.doc.sliceString(Math.max(0, pos-100), Math.min(view.state.doc.length, pos+100));
              const m = /(https?:\/\/)?(www\.)?(bilibili\.com\/video\/[A-Za-z0-9]+|b23\.tv\/[A-Za-z0-9]+)/.exec(txt);
              if (m && pos >= Math.max(0, pos-100)+m.index && pos <= Math.max(0, pos-100)+m.index+m[0].length) {
                 e.preventDefault(); e.stopPropagation(); openVideoNoteTab(m[0].startsWith('http') ? m[0] : 'https://'+m[0]);
              }
           }
        }
      };

      view.contentDOM.addEventListener('click', handleClicks);
      return () => view.contentDOM.removeEventListener('click', handleClicks);
    }, [fileTree, openFile, openPDFTab, openSecondaryPdf, openVideoNoteTab, setSplitView]);

    // Voice & AI Handlers
    useEffect(() => {
      const onVoiceInt = (e: any) => viewRef.current?.dispatch({ effects: e.detail?.text ? setVoicePreview.of({from: viewRef.current.state.selection.main.head, text: e.detail.text}) : clearVoicePreview.of(null) });
      const onVoiceFin = (e: any) => { if(e.detail?.text && viewRef.current) { const p = viewRef.current.state.selection.main.head; viewRef.current.dispatch({ changes: {from:p, to:p, insert:e.detail.text}, selection: {anchor: p+e.detail.text.length}, effects: clearVoicePreview.of(null) }); }};
      const onAi = (e: any) => {
         if(!viewRef.current || !e.detail?.text) return;
         const {mode, text, description} = e.detail;
         const s = viewRef.current.state, doc = s.doc.toString(), sel = s.selection.main;
         let mod = doc;
         if (mode==="replace_selection") mod = doc.slice(0, sel.from)+text+doc.slice(sel.to);
         else if (mode==="append_callout") mod = doc.slice(0, sel.to)+text+doc.slice(sel.to);
         if (mod !== doc) {
            const f = useFileStore.getState().currentFile;
            if(f) useAIStore.getState().setPendingDiff({ fileName: f.split('/').pop()!, filePath: f, original: doc, modified: mod, description: description||"AI Edit" });
         }
      };
      const onSum = (e: any) => { if(viewRef.current && e.detail?.callout) { const p = viewRef.current.state.selection.main.to; viewRef.current.dispatch({ changes: {from:p, to:p, insert:e.detail.callout}, selection:{anchor:p+e.detail.callout.length} }); }};
      
      window.addEventListener("voice-input-interim", onVoiceInt);
      window.addEventListener("voice-input-final", onVoiceFin);
      window.addEventListener("selection-ai-edit", onAi);
      window.addEventListener("insert-summary-callout", onSum);
      return () => {
        window.removeEventListener("voice-input-interim", onVoiceInt);
        window.removeEventListener("voice-input-final", onVoiceFin);
        window.removeEventListener("selection-ai-edit", onAi);
        window.removeEventListener("insert-summary-callout", onSum);
      };
    }, []);

    return <div ref={containerRef} className={`codemirror-wrapper h-full overflow-auto ${className}`} />;
  }
);

export default CodeMirrorEditor;