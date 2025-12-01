import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { readFile } from "@tauri-apps/plugin-fs";

// 配置 PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// 引入 react-pdf 样式
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

interface PDFCanvasProps {
  filePath: string;
  currentPage: number;
  scale: number;
  onDocumentLoad?: (numPages: number) => void;
  onPageChange?: (page: number) => void;
  className?: string;
}

export function PDFCanvas({
  filePath,
  currentPage,
  scale,
  onDocumentLoad,
  onPageChange,
  className,
}: PDFCanvasProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [pdfData, setPdfData] = useState<Uint8Array | null>(null);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  // 使用 Tauri fs 插件读取 PDF 文件
  useEffect(() => {
    let cancelled = false;

    const loadPdf = async () => {
      if (filePath.startsWith("http")) {
        // 网络 URL 直接使用
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const data = await readFile(filePath);
        if (!cancelled) {
          // 复制数据以避免 ArrayBuffer detached 错误
          const copiedData = new Uint8Array(data);
          setPdfData(copiedData);
          setLoading(false);
        }
      } catch (err) {
        console.error("Failed to read PDF file:", err);
        if (!cancelled) {
          setError(`读取文件失败: ${err}`);
          setLoading(false);
        }
      }
    };

    loadPdf();
    return () => { cancelled = true; };
  }, [filePath]);

  // 处理文档加载
  const handleDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setError(null);
    onDocumentLoad?.(numPages);
  }, [onDocumentLoad]);

  // 处理加载错误
  const handleDocumentLoadError = useCallback((err: Error) => {
    console.error("PDF load error:", err);
    setError(`加载失败: ${err.message}`);
  }, []);

  // 键盘导航
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!onPageChange) return;
      
      if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        if (currentPage > 1) onPageChange(currentPage - 1);
      } else if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        if (currentPage < numPages) onPageChange(currentPage + 1);
      } else if (e.key === "Home") {
        e.preventDefault();
        onPageChange(1);
      } else if (e.key === "End") {
        e.preventDefault();
        onPageChange(numPages);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentPage, numPages, onPageChange]);

  // 准备 PDF 数据源（使用 useMemo 避免不必要的重渲染）
  const pdfSource = useMemo(() => {
    if (filePath.startsWith("http")) {
      return filePath;
    }
    return pdfData ? { data: pdfData } : null;
  }, [filePath, pdfData]);

  if (error) {
    return (
      <div className={cn("flex-1 flex items-center justify-center", className)}>
        <div className="text-center text-destructive">
          <p className="text-lg font-medium">PDF 加载失败</p>
          <p className="text-sm text-muted-foreground mt-1">{error}</p>
          <p className="text-xs text-muted-foreground mt-2">{filePath}</p>
        </div>
      </div>
    );
  }

  // 正在加载文件
  if (loading || !pdfSource) {
    return (
      <div className={cn("flex-1 flex items-center justify-center", className)}>
        <Loader2 className="animate-spin mr-2" />
        <span>读取文件...</span>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className={cn(
        "flex-1 overflow-auto bg-muted/30",
        className
      )}
    >
      <Document
        file={pdfSource}
        onLoadSuccess={handleDocumentLoadSuccess}
        onLoadError={handleDocumentLoadError}
        loading={
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin mr-2" />
            <span>解析 PDF...</span>
          </div>
        }
        className="flex flex-col items-center py-4"
      >
        <div className="shadow-lg">
          <Page
            pageNumber={currentPage}
            scale={scale}
            loading={
              <div className="flex items-center justify-center py-10">
                <Loader2 className="animate-spin" size={20} />
              </div>
            }
            className="bg-white"
          />
        </div>
      </Document>
    </div>
  );
}
