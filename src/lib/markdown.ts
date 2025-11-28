import { Marked, Renderer } from "marked";
import markedKatex from "marked-katex-extension";
import TurndownService from "turndown";

// Callout type icons and colors
const calloutTypes: Record<string, { icon: string; color: string }> = {
  note: { icon: "📝", color: "blue" },
  abstract: { icon: "📄", color: "blue" },
  tip: { icon: "💡", color: "green" },
  warning: { icon: "⚠️", color: "yellow" },
  danger: { icon: "🔴", color: "red" },
  example: { icon: "📋", color: "purple" },
  info: { icon: "ℹ️", color: "blue" },
  question: { icon: "❓", color: "yellow" },
  success: { icon: "✅", color: "green" },
  failure: { icon: "❌", color: "red" },
  bug: { icon: "🐛", color: "red" },
  quote: { icon: "💬", color: "gray" },
};

// Custom renderer for Obsidian-style callouts
const renderer = new Renderer();

renderer.blockquote = function (quote: string | { text: string }) {
  try {
    const text = typeof quote === "string" ? quote : (quote?.text || "");
    // Match Obsidian callout syntax: > [!type] Title
    const calloutMatch = text.match(/^\s*\[!(\w+)\]\s*(.*)$/m);
    
    if (calloutMatch) {
      const type = calloutMatch[1].toLowerCase();
      const title = calloutMatch[2] || type.charAt(0).toUpperCase() + type.slice(1);
      const config = calloutTypes[type] || calloutTypes.note;
      
      // Remove the callout header from content and parse remaining content
      const content = text.replace(/^\s*\[!\w+\].*$/m, "").trim();
      
      return `
        <div class="callout callout-${type} callout-${config.color}">
          <div class="callout-title">
            <span class="callout-icon">${config.icon}</span>
            <span class="callout-title-text">${title}</span>
          </div>
          <div class="callout-content">${content}</div>
        </div>
      `;
    }
    
    // Default blockquote rendering
    return `<blockquote>${text}</blockquote>`;
  } catch (e) {
    // Fallback for any errors
    const text = typeof quote === "string" ? quote : (quote?.text || String(quote));
    return `<blockquote>${text}</blockquote>`;
  }
};

// Create a configured marked instance with KaTeX support
const markedInstance = new Marked({
  gfm: true,
  breaks: true,
  renderer,
});

// Add KaTeX extension for math rendering - must be added AFTER renderer
markedInstance.use(
  markedKatex({
    throwOnError: false,
    output: "htmlAndMathml",
  })
);

// Configure turndown for HTML to Markdown conversion
const turndownService = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});

// Add task list support
turndownService.addRule("taskListItem", {
  filter: (node: Node) => {
    const el = node as HTMLElement;
    return (
      el.nodeName === "LI" &&
      el.parentNode?.nodeName === "UL" &&
      el.querySelector?.('input[type="checkbox"]') !== null
    );
  },
  replacement: (content: string, node: Node) => {
    const el = node as HTMLElement;
    const checkbox = el.querySelector?.('input[type="checkbox"]');
    const checked = checkbox?.hasAttribute("checked") ? "x" : " ";
    const text = content.replace(/^\s*\[.\]\s*/, "").trim();
    return `- [${checked}] ${text}\n`;
  },
});

// Add WikiLink support
turndownService.addRule("wikiLink", {
  filter: (node: Node) => {
    const el = node as HTMLElement;
    return (
      el.nodeName === "SPAN" &&
      el.hasAttribute?.("data-wikilink")
    );
  },
  replacement: (content: string) => {
    return `[[${content}]]`;
  },
});

// Keep KaTeX math blocks (inline)
turndownService.addRule("katexInline", {
  filter: (node: Node) => {
    const el = node as HTMLElement;
    return (
      el.nodeName === "SPAN" &&
      el.classList?.contains("katex")
    );
  },
  replacement: (_content: string, node: Node) => {
    const el = node as HTMLElement;
    const annotation = el.querySelector("annotation");
    if (annotation) {
      return `$${annotation.textContent}$`;
    }
    return "";
  },
});

// Keep KaTeX math blocks (display/block)
turndownService.addRule("katexBlock", {
  filter: (node: Node) => {
    const el = node as HTMLElement;
    return (
      el.nodeName === "DIV" &&
      el.classList?.contains("katex-display")
    );
  },
  replacement: (_content: string, node: Node) => {
    const el = node as HTMLElement;
    const annotation = el.querySelector("annotation");
    if (annotation) {
      return `\n$$${annotation.textContent}$$\n`;
    }
    return "";
  },
});

/**
 * Preprocess markdown to fix math formula detection issues
 * and convert WikiLinks to clickable links
 */
function preprocessMarkdown(markdown: string): string {
  let result = markdown;
  
  // First, protect block math by replacing $$ temporarily
  const blockMathPlaceholder = "⟦BLOCK_MATH_";
  const blockMaths: string[] = [];
  result = result.replace(/\$\$([\s\S]*?)\$\$/g, (match) => {
    blockMaths.push(match);
    return blockMathPlaceholder + (blockMaths.length - 1) + "⟧";
  });
  
  // Convert [[WikiLinks]] to HTML spans with data attribute
  // Supports [[link]] and [[link|display text]]
  result = result.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, link, display) => {
    const displayText = display || link;
    const linkName = link.trim();
    return `<span class="wikilink" data-wikilink="${linkName}">${displayText}</span>`;
  });
  
  // Simple approach: add spaces around inline math $...$ when adjacent to CJK/punctuation
  // This regex matches $...$ (inline math)
  const inlineMathRegex = /\$([^$\n]+?)\$/g;
  
  // Replace each inline math with a spaced version
  result = result.replace(inlineMathRegex, (_match, content) => {
    return ` $${content}$ `;
  });
  
  // Clean up multiple spaces
  result = result.replace(/  +/g, " ");
  
  // Restore block math
  blockMaths.forEach((math, i) => {
    result = result.replace(blockMathPlaceholder + i + "⟧", math);
  });
  
  return result;
}

/**
 * Parse Markdown to HTML
 */
export function parseMarkdown(markdown: string): string {
  try {
    if (!markdown) return "";
    // Preprocess to fix math formula detection
    const processed = preprocessMarkdown(markdown);
    const result = markedInstance.parse(processed);
    return typeof result === "string" ? result : "";
  } catch (error) {
    console.error("Markdown parse error:", error);
    return markdown; // Return raw text as fallback
  }
}

/**
 * Convert HTML to Markdown
 */
export function htmlToMarkdown(html: string): string {
  try {
    if (!html) return "";
    return turndownService.turndown(html);
  } catch (error) {
    console.error("HTML to Markdown error:", error);
    return "";
  }
}

/**
 * Convert editor JSON/HTML content to Markdown
 */
export function editorToMarkdown(html: string): string {
  try {
    // Handle empty content
    if (!html || html === "<p></p>") {
      return "";
    }
    return htmlToMarkdown(html);
  } catch (error) {
    console.error("Editor to Markdown error:", error);
    return "";
  }
}
