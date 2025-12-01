import { useState, useCallback, useEffect, useMemo } from "react";
import { PDFToolbar } from "./PDFToolbar";
import { PDFCanvas } from "./PDFCanvas";
import { PDFSidebar } from "./PDFSidebar";
import { PDFSearch } from "./PDFSearch";
import { usePDFStore } from "@/stores/usePDFStore";
import { cn } from "@/lib/utils";
import { FileText, Loader2 } from "lucide-react";
import { readFile } from "@tauri-apps/plugin-fs";

interface PDFViewerProps {
  filePath: string;
  className?: string;
}

export function PDFViewer({ filePath, className }: PDFViewerProps) {
  const [numPages, setNumPages] = useState(0);
  const [pdfData, setPdfData] = useState<Uint8Array | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showThumbnails, setShowThumbnails] = useState(true);
  const { currentPage, scale, setCurrentPage, setScale } = usePDFStore();

  // 加载 PDF 文件
  useEffect(() => {
    let cancelled = false;

    const loadPdf = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await readFile(filePath);
        if (!cancelled) {
          // 创建持久化的数据副本
          const buffer = new ArrayBuffer(data.byteLength);
          const copiedData = new Uint8Array(buffer);
          copiedData.set(data);
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

  const handleDocumentLoad = useCallback((pages: number) => {
    setNumPages(pages);
    // 重置到第一页
    setCurrentPage(1);
  }, [setCurrentPage]);

  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, [setCurrentPage]);

  const handleScaleChange = useCallback((newScale: number) => {
    setScale(newScale);
  }, [setScale]);

  // 为不同组件创建独立的数据副本，避免 ArrayBuffer detached 错误
  const pdfDataForSearch = useMemo(() => {
    if (!pdfData) return null;
    const copy = new Uint8Array(pdfData.byteLength);
    copy.set(pdfData);
    return copy;
  }, [pdfData]);

  const pdfDataForSidebar = useMemo(() => {
    if (!pdfData) return null;
    const copy = new Uint8Array(pdfData.byteLength);
    copy.set(pdfData);
    return copy;
  }, [pdfData]);

  const pdfDataForCanvas = useMemo(() => {
    if (!pdfData) return null;
    const copy = new Uint8Array(pdfData.byteLength);
    copy.set(pdfData);
    return copy;
  }, [pdfData]);

  // 加载中状态
  if (loading) {
    return (
      <div className={cn("flex flex-col h-full", className)}>
        <div className="h-9 flex items-center px-3 gap-2 border-b border-border bg-muted/30 shrink-0">
          <FileText size={14} className="text-red-500" />
          <span className="text-sm font-medium truncate">
            {filePath.split(/[\/\\]/).pop() || "PDF"}
          </span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="animate-spin mr-2" />
          <span>读取文件...</span>
        </div>
      </div>
    );
  }

  // 错误状态
  if (error) {
    return (
      <div className={cn("flex flex-col h-full", className)}>
        <div className="h-9 flex items-center px-3 gap-2 border-b border-border bg-muted/30 shrink-0">
          <FileText size={14} className="text-red-500" />
          <span className="text-sm font-medium truncate">
            {filePath.split(/[\/\\]/).pop() || "PDF"}
          </span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-destructive">
            <p className="text-lg font-medium">PDF 加载失败</p>
            <p className="text-sm text-muted-foreground mt-1">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* 文件名标题 */}
      <div className="h-9 flex items-center px-3 gap-2 border-b border-border bg-muted/30 shrink-0">
        <FileText size={14} className="text-red-500" />
        <span className="text-sm font-medium truncate">
          {filePath.split(/[\/\\]/).pop() || "PDF"}
        </span>
      </div>

      {/* 工具栏 */}
      <PDFToolbar
        currentPage={currentPage}
        totalPages={numPages}
        scale={scale}
        onPageChange={handlePageChange}
        onScaleChange={handleScaleChange}
        searchSlot={
          <PDFSearch
            pdfData={pdfDataForSearch}
            onNavigate={handlePageChange}
          />
        }
      />

      {/* 主内容区：缩略图 + PDF 渲染 */}
      <div className="flex-1 flex overflow-hidden">
        {/* PDF 侧边栏（缩略图 + 目录） */}
        <PDFSidebar
          pdfData={pdfDataForSidebar}
          numPages={numPages}
          currentPage={currentPage}
          onPageClick={handlePageChange}
          collapsed={!showThumbnails}
          onToggle={() => setShowThumbnails(!showThumbnails)}
        />

        {/* PDF 渲染区域 */}
        <PDFCanvas
          pdfData={pdfDataForCanvas}
          filePath={filePath}
          currentPage={currentPage}
          scale={scale}
          onDocumentLoad={handleDocumentLoad}
          onPageChange={handlePageChange}
          className="flex-1"
        />
      </div>
    </div>
  );
}
