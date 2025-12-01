import { useState, useCallback } from "react";
import { PDFToolbar } from "./PDFToolbar";
import { PDFCanvas } from "./PDFCanvas";
import { usePDFStore } from "@/stores/usePDFStore";
import { cn } from "@/lib/utils";
import { FileText } from "lucide-react";

interface PDFViewerProps {
  filePath: string;
  className?: string;
}

export function PDFViewer({ filePath, className }: PDFViewerProps) {
  const [numPages, setNumPages] = useState(0);
  const { currentPage, scale, setCurrentPage, setScale } = usePDFStore();

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
      />

      {/* PDF 渲染区域 */}
      <PDFCanvas
        filePath={filePath}
        currentPage={currentPage}
        scale={scale}
        onDocumentLoad={handleDocumentLoad}
        onPageChange={handlePageChange}
        className="flex-1"
      />
    </div>
  );
}
