/**
 * 读取已缓存的工具长输出
 */

import { getCachedToolOutput } from "@/agent/core/ToolOutputCache";
import { ToolExecutor, ToolResult } from "../../types";
import { toolMsg } from "./messages";

export const ReadCachedOutputTool: ToolExecutor = {
  name: "read_cached_output",
  requiresApproval: false,
  async execute(params): Promise<ToolResult> {
    const id = typeof params.id === "string" ? params.id.trim() : "";

    if (!id) {
      return {
        success: false,
        content: "",
        error: `${toolMsg.invalidParams()}: id required`,
      };
    }

    const cached = getCachedToolOutput(id);

    if (!cached) {
      return {
        success: false,
        content: "",
        error: `Cache not found: id=${id}`,
      };
    }

    return {
      success: true,
      content: cached.content,
    };
  },
};
