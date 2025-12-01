import { useState, useEffect, useCallback } from "react";
import { Document, Page } from "react-pdf";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface PDFThumbnailsProps {
  pdfData: Uint8Array | null;
  numPages: number;
  currentPage: number;
  onPageClick: (page: number) => void;
  collapsed?: boolean;
  onToggle?: () => void;
  className?: string;
}

export function PDFThumbnails({
  pdfData,
  numPages,
  currentPage,
  onPageClick,
  collapsed = false,
  onToggle,
  className,
}: PDFThumbnailsProps) {
  const [visibleRange, setVisibleRange] = useState({ start: 1, end: 10 });

  // 当前页变化时，确保当前页在可见范围内
  useEffect(() => {
    if (currentPage < visibleRange.start) {
      setVisibleRange({
        start: Math.max(1, currentPage - 2),
        end: Math.min(numPages, currentPage + 7),
      });
    } else if (currentPage > visibleRange.end) {
      setVisibleRange({
        start: Math.max(1, currentPage - 7),
        end: Math.min(numPages, currentPage + 2),
      });
    }
  }, [currentPage, numPages, visibleRange]);

  // 滚动到当前页
  const scrollToPage = useCallback((page: number) => {
    const element = document.getElementById(`pdf-thumb-${page}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

  useEffect(() => {
    scrollToPage(currentPage);
  }, [currentPage, scrollToPage]);

  if (collapsed) {
    return (
      <div className={cn("w-8 flex flex-col items-center py-2 border-r border-border bg-muted/30", className)}>
        <button
          onClick={onToggle}
          className="p-1 hover:bg-accent rounded transition-colors"
          title="展开缩略图"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    );
  }

  if (!pdfData) {
    return (
      <div className={cn("w-32 flex items-center justify-center border-r border-border bg-muted/30", className)}>
        <Loader2 className="animate-spin" size={16} />
      </div>
    );
  }

  return (
    <div className={cn("w-32 flex flex-col border-r border-border bg-muted/30", className)}>
      {/* 头部 */}
      <div className="h-8 flex items-center justify-between px-2 border-b border-border shrink-0">
        <span className="text-xs text-muted-foreground">缩略图</span>
        {onToggle && (
          <button
            onClick={onToggle}
            className="p-0.5 hover:bg-accent rounded transition-colors"
            title="收起缩略图"
          >
            <ChevronLeft size={14} />
          </button>
        )}
      </div>

      {/* 缩略图列表 */}
      <div className="flex-1 overflow-y-auto py-2 px-2 space-y-2">
        <Document
          file={{ data: pdfData }}
          loading={null}
          error={null}
        >
          {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
            <div
              key={pageNum}
              id={`pdf-thumb-${pageNum}`}
              onClick={() => onPageClick(pageNum)}
              className={cn(
                "cursor-pointer rounded overflow-hidden border-2 transition-all",
                currentPage === pageNum
                  ? "border-primary shadow-md"
                  : "border-transparent hover:border-primary/50"
              )}
            >
              <Page
                pageNumber={pageNum}
                width={100}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                loading={
                  <div className="w-[100px] h-[140px] flex items-center justify-center bg-muted">
                    <Loader2 className="animate-spin" size={12} />
                  </div>
                }
              />
              <div className="text-center text-xs py-1 bg-background/80">
                {pageNum}
              </div>
            </div>
          ))}
        </Document>
      </div>
    </div>
  );
}
