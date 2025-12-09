/**
 * query_database 工具执行器
 * 查询数据库行
 */

import { ToolExecutor, ToolResult, ToolContext } from "../../types";
import { useDatabaseStore } from "@/stores/useDatabaseStore";
import type { DatabaseColumn, CellValue } from "@/types/database";
import { toolMsg } from "./messages";

// 格式化单元格值为字符串
function formatCellValue(value: CellValue, column: DatabaseColumn): string {
  if (value === null || value === undefined) return "-";

  switch (column.type) {
    case "checkbox":
      return value ? "✓" : "✗";
    case "select":
    case "multi-select":
      if (Array.isArray(value)) {
        const optionNames = value.map((id) => {
          const option = column.options?.find((o) => o.id === id);
          return option?.name || id;
        });
        return optionNames.join(", ");
      }
      const option = column.options?.find((o) => o.id === value);
      return option?.name || String(value);
    case "date":
      if (typeof value === "object" && "start" in value) {
        return value.end ? `${value.start} ~ ${value.end}` : value.start;
      }
      return String(value);
    case "number":
      return String(value);
    default:
      return String(value);
  }
}

export const QueryDatabaseTool: ToolExecutor = {
  name: "query_database",
  requiresApproval: false, // 只读操作

  async execute(
    params: Record<string, unknown>,
    _context: ToolContext
  ): Promise<ToolResult> {
    const dbId = params.database_id as string;
    const filterColumn = params.filter_column as string | undefined;
    const filterValue = params.filter_value as string | undefined;
    const limit = (params.limit as number) || 20;

    if (!dbId || typeof dbId !== "string") {
      return {
        success: false,
        content: "",
        error: `${toolMsg.invalidParams()}: database_id required`,
      };
    }

    try {
      const { loadDatabase, databases, listDatabases } = useDatabaseStore.getState();

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

      // 获取行数据
      let rows = db.rows || [];

      // 应用过滤器
      if (filterColumn && filterValue) {
        const column = db.columns.find(
          (c) => c.name === filterColumn || c.id === filterColumn
        );
        if (column) {
          rows = rows.filter((row) => {
            const cellValue = row.cells[column.id];
            if (cellValue === null || cellValue === undefined) return false;
            const strValue = formatCellValue(cellValue, column);
            return strValue.toLowerCase().includes(filterValue.toLowerCase());
          });
        }
      }

      // 限制结果数量
      const displayRows = rows.slice(0, limit);

      // 构建列结构说明（帮助 LLM 理解字段名和可选值）
      const columnSchema = db.columns.map((col) => {
        let desc = `- **${col.name}** (${col.type})`;
        if (col.type === 'select' || col.type === 'multi-select') {
          const optionNames = col.options?.map(o => o.name) || [];
          if (optionNames.length > 0) {
            desc += `: options [${optionNames.join(', ')}]`;
          }
        }
        return desc;
      }).join('\n');

      if (displayRows.length === 0) {
        return {
          success: true,
          content: `Database: **${db.name}** (ID: ${dbId})\n\n## Columns\n${columnSchema}\n\nNo data rows.`,
        };
      }

      // 格式化为表格
      const headers = db.columns.map((c) => c.name);
      const headerRow = "| " + headers.join(" | ") + " |";
      const separatorRow = "| " + headers.map(() => "---").join(" | ") + " |";

      const dataRows = displayRows.map((row) => {
        const cells = db.columns.map((col) => {
          const value = row.cells[col.id];
          return formatCellValue(value, col);
        });
        return "| " + cells.join(" | ") + " |";
      });

      const table = [headerRow, separatorRow, ...dataRows].join("\n");

      const truncatedNote =
        rows.length > limit
          ? `\n\n(Showing ${limit} of ${rows.length} rows)`
          : "";

      return {
        success: true,
        content: `Database: **${db.name}** (ID: ${dbId})\n\n## Columns\n${columnSchema}\n\n## Data\n${table}${truncatedNote}`,
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
