import { useMemo, useCallback, useEffect, useRef } from "react";
import { parseMarkdown } from "@/lib/markdown";
import { useFileStore } from "@/stores/useFileStore";
import { useSplitStore } from "@/stores/useSplitStore";
import { useUIStore } from "@/stores/useUIStore";
import { parseLuminaLink } from "@/lib/annotations";
import { readBinaryFileBase64 } from "@/lib/tauri";

interface ReadingViewProps {
  content: string;
  className?: string;
}

export function ReadingView({ content, className = "" }: ReadingViewProps) {
  const { fileTree, openFile, vaultPath } = useFileStore();
  const { openSecondaryPdf } = useSplitStore();
  const { setSplitView } = useUIStore();
  const containerRef = useRef<HTMLDivElement>(null);

  const html = useMemo(() => {
    return parseMarkdown(content);
  }, [content]);

  // 转换本地图片路径为 base64 data URL
  useEffect(() => {
    if (!containerRef.current || !vaultPath) return;
    
    const images = containerRef.current.querySelectorAll('img.markdown-image');
    images.forEach((imgEl) => {
      const img = imgEl as HTMLImageElement;
      const src = img.getAttribute('src');
      if (src && !src.startsWith('http') && !src.startsWith('data:')) {
        // 本地图片：使用 base64 加载
        const normalizedVaultPath = vaultPath.replace(/\\/g, '/');
        const normalizedSrc = src.replace(/\\/g, '/').replace(/^\.\//,'');
        const fullPath = normalizedSrc.startsWith('/') || /^[A-Za-z]:/.test(normalizedSrc)
          ? normalizedSrc
          : `${normalizedVaultPath}/${normalizedSrc}`;
        
        img.style.opacity = '0.5';
        const ext = fullPath.split('.').pop()?.toLowerCase() || 'png';
        const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 
                         ext === 'gif' ? 'image/gif' : 
                         ext === 'webp' ? 'image/webp' : 'image/png';
        
        readBinaryFileBase64(fullPath)
          .then(base64 => {
            img.src = `data:${mimeType};base64,${base64}`;
            img.style.opacity = '1';
          })
          .catch(err => {
            console.error('[ReadingView] 图片加载失败:', fullPath, err);
            img.alt = `图片加载失败: ${src}`;
            img.style.opacity = '1';
          });
      }
    });
  }, [html, vaultPath]);

  // Handle WikiLink, Tag, and Lumina link clicks
  const handleClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    
    // Handle lumina:// PDF links (Ctrl+Click to open in split view)
    if (target.tagName === 'A') {
      const href = target.getAttribute('href');
      if (href && href.startsWith('lumina://pdf')) {
        e.preventDefault();
        const parsed = parseLuminaLink(href);
        if (parsed && parsed.file) {
          if (e.ctrlKey || e.metaKey) {
            // Ctrl+Click: open in split view
            setSplitView(true);
            openSecondaryPdf(parsed.file, parsed.page || 1, parsed.id);
          } else {
            // Normal click: open in main view via fileStore
            const { openPDFTab } = useFileStore.getState();
            openPDFTab(parsed.file);
            // TODO: navigate to page and highlight annotation
          }
        }
        return;
      }
    }
    
    // Handle WikiLink clicks
    if (target.classList.contains("wikilink")) {
      e.preventDefault();
      const linkName = target.getAttribute("data-wikilink");
      if (linkName) {
        // Find the file in fileTree
        const findFile = (entries: typeof fileTree): string | null => {
          for (const entry of entries) {
            if (entry.is_dir && entry.children) {
              const found = findFile(entry.children);
              if (found) return found;
            } else if (!entry.is_dir) {
              const fileName = entry.name.replace(".md", "");
              if (fileName.toLowerCase() === linkName.toLowerCase()) {
                return entry.path;
              }
            }
          }
          return null;
        };
        
        const filePath = findFile(fileTree);
        if (filePath) {
          openFile(filePath);
        } else {
          console.log(`笔记不存在: ${linkName}`);
        }
      }
    }
    
    // Handle Tag clicks - dispatch event to show tag in sidebar
    if (target.classList.contains("tag")) {
      e.preventDefault();
      const tagName = target.getAttribute("data-tag");
      if (tagName) {
        // Dispatch custom event for the right panel to handle
        window.dispatchEvent(
          new CustomEvent("tag-clicked", { detail: { tag: tagName } })
        );
      }
    }
  }, [fileTree, openFile, openSecondaryPdf, setSplitView]);

  return (
    <div
      ref={containerRef}
      className={`reading-view prose prose-neutral dark:prose-invert max-w-none ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={handleClick}
    />
  );
}
