/**
 * add_database_row 工具执行器
 * 添加数据库行（创建笔记并设置 frontmatter）
 */

import { ToolExecutor, ToolResult, ToolContext } from "../../types";
import { useDatabaseStore } from "@/stores/useDatabaseStore";
import type { CellValue } from "@/types/database";
import { toolMsg } from "./messages";

export const AddDatabaseRowTool: ToolExecutor = {
  name: "add_database_row",
  requiresApproval: true, // 写入操作需要审批

  async execute(
    params: Record<string, unknown>,
    _context: ToolContext
  ): Promise<ToolResult> {
    const dbId = params.database_id as string;
    const cellsRaw = params.cells as Record<string, unknown> | string | undefined;

    if (!dbId || typeof dbId !== "string") {
      return {
        success: false,
        content: "",
        error: `${toolMsg.invalidParams()}: database_id required`,
      };
    }

    try {
      const { loadDatabase, databases, addRow, listDatabases } = useDatabaseStore.getState();

      // 列出所有数据库供参考
      const allDbIds = await listDatabases();

      // 尝试加载数据库
      let db = databases[dbId];
      if (!db) {
        const loaded = await loadDatabase(dbId);
        if (!loaded) {
          return {
            success: false,
            content: "",
            error: `Database not found: ${dbId}\n\nAvailable: ${allDbIds.join(", ") || "none"}`,
          };
        }
        db = loaded;
      }

      if (!db) {
        return {
          success: false,
          content: "",
          error: `Database not found: ${dbId}\n\nAvailable: ${allDbIds.join(", ") || "none"}`,
        };
      }

      // 解析 cells 参数
      let cells: Record<string, CellValue> = {};
      if (cellsRaw) {
        if (typeof cellsRaw === "string") {
          try {
            cells = JSON.parse(cellsRaw);
          } catch {
            return {
              success: false,
              content: "",
              error: `${toolMsg.invalidParams()}: cells must be valid JSON`,
            };
          }
        } else {
          cells = cellsRaw as Record<string, CellValue>;
        }
      }

      // 将列名转换为列 ID，并处理 select/multi-select 值
      const cellsById: Record<string, CellValue> = {};
      for (const [key, value] of Object.entries(cells)) {
        // 尝试按名称查找列
        const column = db.columns.find(
          (c) => c.name === key || c.id === key
        );
        if (column) {
          // 对于 select/multi-select 类型，将选项名称转换为选项 ID
          if ((column.type === 'select' || column.type === 'multi-select') && column.options) {
            if (Array.isArray(value)) {
              // multi-select: 转换数组中的每个值
              cellsById[column.id] = value.map(v => {
                const option = column.options?.find(o => o.name === v || o.id === v);
                return option?.id || v;
              });
            } else {
              // select: 转换单个值
              const option = column.options.find(o => o.name === value || o.id === value);
              cellsById[column.id] = option?.id || value as CellValue;
            }
          } else {
            cellsById[column.id] = value as CellValue;
          }
        } else {
          console.warn(`Unknown column: ${key}`);
        }
      }

      // 添加行（会创建笔记并设置 frontmatter）
      const rowId = await addRow(dbId, cellsById);

      // 获取更新后的数据库
      const updatedDb = useDatabaseStore.getState().databases[dbId];
      const newRow = updatedDb?.rows.find((r) => r.id === rowId);

      // 构建反馈信息
      const columnsInfo = db.columns.map((c) => `${c.name} (${c.type})`).join(", ");
      const addedValues = Object.entries(cellsById)
        .map(([colId, val]) => {
          const col = db.columns.find((c) => c.id === colId);
          return col ? `${col.name}: ${val}` : null;
        })
        .filter(Boolean)
        .join(", ");

      return {
        success: true,
        content: `${toolMsg.database.rowAdded()} to "${db.name}".
        
**Row ID**: ${rowId}
**Note path**: ${newRow?.notePath || "unknown"}
**Values set**: ${addedValues || "none"}

**Available columns**: ${columnsInfo}`,
      };
    } catch (error) {
      return {
        success: false,
        content: "",
        error: `${toolMsg.failed()}: ${error instanceof Error ? error.message : "unknown error"}`,
      };
    }
  },
};
