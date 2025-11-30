import { useState, useRef, useCallback, useMemo } from "react";
import { useDatabaseStore } from "@/stores/useDatabaseStore";
import { useUIStore } from "@/stores/useUIStore";
import { useSplitStore } from "@/stores/useSplitStore";
import { DatabaseCell } from "./cells/DatabaseCell";
import { ColumnHeader } from "./ColumnHeader";
import { Plus, MoreHorizontal, Trash2, Copy, FileText } from "lucide-react";

interface TableViewProps {
  dbId: string;
}

export function TableView({ dbId }: TableViewProps) {
  const {
    databases,
    addRow,
    addColumn,
    deleteRow,
    duplicateRow,
    editingCell,
    setEditingCell,
    getFilteredSortedRows,
  } = useDatabaseStore();
  
  const db = databases[dbId];
  const rows = useMemo(() => getFilteredSortedRows(dbId), [dbId, getFilteredSortedRows, db?.rows, db?.views]);
  
  // 分栏视图
  const { splitView, toggleSplitView } = useUIStore();
  const { openSecondaryFile } = useSplitStore();
  
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [rowMenuOpen, setRowMenuOpen] = useState<string | null>(null);
  const [, setDraggedColumn] = useState<string | null>(null);
  
  const tableRef = useRef<HTMLDivElement>(null);
  
  const handleAddColumn = useCallback(() => {
    addColumn(dbId, { name: '新列', type: 'text' });
  }, [dbId, addColumn]);
  
  const handleCellClick = useCallback((rowId: string, columnId: string) => {
    setEditingCell({ rowId, columnId });
  }, [setEditingCell]);
  
  const handleCellBlur = useCallback(() => {
    setEditingCell(null);
  }, [setEditingCell]);
  
  // 在分栏中打开笔记
  const handleOpenInSplit = useCallback((notePath: string) => {
    if (!splitView) {
      toggleSplitView();
    }
    openSecondaryFile(notePath);
  }, [splitView, toggleSplitView, openSecondaryFile]);
  
  if (!db) return null;
  
  const columns = db.columns;
  
  return (
    <div className="h-full overflow-auto" ref={tableRef}>
      <table className="w-full border-collapse min-w-max">
        {/* 表头 */}
        <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
          <tr>
            {/* 行操作列 */}
            <th className="w-10 p-0 border-b border-r border-border" />
            
            {columns.map((column) => (
              <ColumnHeader
                key={column.id}
                dbId={dbId}
                column={column}
                onDragStart={() => setDraggedColumn(column.id)}
                onDragEnd={() => setDraggedColumn(null)}
              />
            ))}
            
            {/* 新增列按钮 */}
            <th className="w-10 p-0 border-b border-border">
              <button
                onClick={handleAddColumn}
                className="w-full h-9 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </th>
          </tr>
        </thead>
        
        {/* 表体 */}
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr
              key={row.id}
              className={`group ${hoveredRow === row.id ? 'bg-accent/50' : ''}`}
              onMouseEnter={() => setHoveredRow(row.id)}
              onMouseLeave={() => setHoveredRow(null)}
            >
              {/* 行操作 */}
              <td className="w-10 p-0 border-b border-r border-border relative">
                <div className="flex items-center justify-center h-9">
                  {hoveredRow === row.id ? (
                    <div className="relative">
                      <button
                        onClick={() => setRowMenuOpen(rowMenuOpen === row.id ? null : row.id)}
                        className="p-1 rounded hover:bg-accent"
                      >
                        <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                      </button>
                      
                      {rowMenuOpen === row.id && (
                        <div className="absolute left-0 top-full mt-1 bg-popover border border-border rounded-md shadow-lg py-1 min-w-[120px] z-50">
                          <button
                            onClick={() => {
                              duplicateRow(dbId, row.id);
                              setRowMenuOpen(null);
                            }}
                            className="flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-accent"
                          >
                            <Copy className="w-4 h-4" /> 复制
                          </button>
                          <button
                            onClick={() => {
                              deleteRow(dbId, row.id);
                              setRowMenuOpen(null);
                            }}
                            className="flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-accent text-red-500"
                          >
                            <Trash2 className="w-4 h-4" /> 删除
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">{rowIndex + 1}</span>
                  )}
                </div>
              </td>
              
              {/* 数据单元格 */}
              {columns.map((column, colIndex) => (
                <td
                  key={column.id}
                  className={`p-0 border-b border-r border-border ${
                    editingCell?.rowId === row.id && editingCell?.columnId === column.id
                      ? 'ring-2 ring-primary ring-inset'
                      : ''
                  }`}
                  style={{ width: column.width || 180, minWidth: 100 }}
                  onClick={() => handleCellClick(row.id, column.id)}
                >
                  <div className="flex items-center">
                    <div className="flex-1">
                      <DatabaseCell
                        dbId={dbId}
                        column={column}
                        rowId={row.id}
                        value={row.cells[column.id]}
                        isEditing={editingCell?.rowId === row.id && editingCell?.columnId === column.id}
                        onBlur={handleCellBlur}
                      />
                    </div>
                    {/* 第一列显示打开笔记按钮 */}
                    {colIndex === 0 && hoveredRow === row.id && row.notePath && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenInSplit(row.notePath);
                        }}
                        className="p-1 mr-1 rounded hover:bg-accent text-muted-foreground hover:text-primary transition-colors"
                        title="在分栏中打开笔记"
                      >
                        <FileText className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              ))}
              
              {/* 空列占位 */}
              <td className="w-10 border-b border-border" />
            </tr>
          ))}
          
          {/* 新增行按钮 */}
          <tr>
            <td colSpan={columns.length + 2} className="p-0">
              <button
                onClick={() => addRow(dbId)}
                className="w-full h-9 flex items-center gap-2 px-4 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <Plus className="w-4 h-4" />
                新建
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
