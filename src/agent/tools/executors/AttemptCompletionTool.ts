/**
 * attempt_completion 工具执行器
 */

import { ToolExecutor, ToolResult, ToolContext } from "../../types";

export const AttemptCompletionTool: ToolExecutor = {
  name: "attempt_completion",
  requiresApproval: false, // 完成标记，不需要审批

  async execute(
    params: Record<string, unknown>,
    _context: ToolContext
  ): Promise<ToolResult> {
    const result = params.result as string;

    if (!result) {
      return {
        success: false,
        content: "",
        error: "参数错误: 缺少 result 参数",
      };
    }

    return {
      success: true,
      content: `任务完成:\n${result}`,
    };
  },
};
