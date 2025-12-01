import { useState, useMemo } from "react";
import { Document, Page } from "react-pdf";
import { Grid3X3, List, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PDFOutline } from "./PDFOutline";

type SidebarTab = "thumbnails" | "outline";

interface PDFSidebarProps {
  pdfData: Uint8Array | null;
  numPages: number;
  currentPage: number;
  onPageClick: (page: number) => void;
  collapsed?: boolean;
  onToggle?: () => void;
  className?: string;
}

export function PDFSidebar({
  pdfData,
  numPages,
  currentPage,
  onPageClick,
  collapsed = false,
  onToggle,
  className,
}: PDFSidebarProps) {
  const [activeTab, setActiveTab] = useState<SidebarTab>("thumbnails");

  if (collapsed) {
    return (
      <div className={cn("w-10 flex flex-col items-center py-2 border-r border-border bg-muted/30 gap-2", className)}>
        <button
          onClick={onToggle}
          className="p-1.5 hover:bg-accent rounded transition-colors"
          title="展开侧边栏"
        >
          <ChevronRight size={16} />
        </button>
        <div className="w-6 h-px bg-border" />
        <button
          onClick={() => { onToggle?.(); setActiveTab("thumbnails"); }}
          className={cn(
            "p-1.5 rounded transition-colors",
            activeTab === "thumbnails" ? "bg-accent" : "hover:bg-accent"
          )}
          title="缩略图"
        >
          <Grid3X3 size={14} />
        </button>
        <button
          onClick={() => { onToggle?.(); setActiveTab("outline"); }}
          className={cn(
            "p-1.5 rounded transition-colors",
            activeTab === "outline" ? "bg-accent" : "hover:bg-accent"
          )}
          title="目录"
        >
          <List size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className={cn("w-48 flex flex-col border-r border-border bg-muted/30", className)}>
      {/* 头部：标签切换 + 折叠按钮 */}
      <div className="h-9 flex items-center justify-between px-2 border-b border-border shrink-0">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab("thumbnails")}
            className={cn(
              "px-2 py-1 text-xs rounded transition-colors",
              activeTab === "thumbnails"
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
            )}
          >
            <Grid3X3 size={12} className="inline mr-1" />
            缩略图
          </button>
          <button
            onClick={() => setActiveTab("outline")}
            className={cn(
              "px-2 py-1 text-xs rounded transition-colors",
              activeTab === "outline"
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
            )}
          >
            <List size={12} className="inline mr-1" />
            目录
          </button>
        </div>
        {onToggle && (
          <button
            onClick={onToggle}
            className="p-1 hover:bg-accent rounded transition-colors"
            title="收起侧边栏"
          >
            <ChevronLeft size={14} />
          </button>
        )}
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "thumbnails" ? (
          <ThumbnailsContent
            pdfData={pdfData}
            numPages={numPages}
            currentPage={currentPage}
            onPageClick={onPageClick}
          />
        ) : (
          <PDFOutline
            pdfData={pdfData}
            onPageClick={onPageClick}
            className="h-full overflow-y-auto"
          />
        )}
      </div>
    </div>
  );
}

// 缩略图内容（渲染真实的 PDF 页面缩略图）
function ThumbnailsContent({
  pdfData,
  numPages,
  currentPage,
  onPageClick,
}: {
  pdfData: Uint8Array | null;
  numPages: number;
  currentPage: number;
  onPageClick: (page: number) => void;
}) {
  if (!pdfData || numPages === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        <Loader2 className="animate-spin mr-2" size={14} />
        加载中...
      </div>
    );
  }

  // 创建独立副本避免 ArrayBuffer detached
  const pdfDataCopy = useMemo(() => {
    const buffer = new ArrayBuffer(pdfData.byteLength);
    const copy = new Uint8Array(buffer);
    copy.set(pdfData);
    return copy;
  }, [pdfData]);

  return (
    <div className="h-full overflow-y-auto py-2 px-2">
      <Document
        file={{ data: pdfDataCopy }}
        loading={null}
        error={null}
      >
        <div className="space-y-2">
          {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
            <div
              key={pageNum}
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
                width={160}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                loading={
                  <div className="w-[160px] h-[200px] flex items-center justify-center bg-muted">
                    <Loader2 className="animate-spin" size={14} />
                  </div>
                }
                className="bg-white"
              />
              <div className="text-center text-xs py-1 bg-background/80">
                {pageNum}
              </div>
            </div>
          ))}
        </div>
      </Document>
    </div>
  );
}
