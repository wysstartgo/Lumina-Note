/**
 * System Prompt 构建器
 * 
 * 模块化组装 System Prompt
 */

import { TaskContext, AgentMode, ToolDefinition } from "../types";
import { getAllToolDefinitions } from "../tools/definitions";
import { MODES } from "../modes";

export class PromptBuilder {
  private mode: AgentMode;
  private tools: ToolDefinition[];

  constructor(mode?: AgentMode) {
    this.mode = mode || MODES.editor;
    this.tools = getAllToolDefinitions().filter(
      (tool) => this.mode.tools.includes(tool.name)
    );
  }

  /**
   * 构建完整的 System Prompt
   */
  build(context: TaskContext): string {
    const mode = context.mode || this.mode;
    
    return `${this.getRoleDefinition(mode)}

${this.getToolUseSection()}

${this.getToolsCatalog()}

${this.getCapabilitiesSection()}

${this.getRulesSection(context)}

${this.getContextSection(context)}

${this.getObjectiveSection()}`;
  }

  /**
   * 设置模式
   */
  setMode(mode: AgentMode): void {
    this.mode = mode;
    this.tools = getAllToolDefinitions().filter(
      (tool) => mode.tools.includes(tool.name)
    );
  }

  // ============ Prompt 各部分 ============

  private getRoleDefinition(mode: AgentMode): string {
    return `你是 Lumina，一个专业的智能笔记助手。

${mode.roleDefinition}

你的专长：
- 深入理解笔记内容和结构
- 优化 Markdown 格式和排版
- 整理和重构笔记组织
- 发现笔记间的关联
- 批量处理和迁移笔记内容`;
  }

  private getToolUseSection(): string {
    return `====

TOOL USE

你可以使用一组工具来完成用户的任务。每条消息中可以包含一个或多个工具调用。
你需要逐步使用工具，每次工具调用都基于上一次的结果。

# 工具调用格式

使用 XML 标签格式调用工具：

<tool_name>
<param1>value1</param1>
<param2>value2</param2>
</tool_name>

示例 - 读取笔记:
<read_note>
<paths>["notes/daily/2024-01-15.md"]</paths>
</read_note>

示例 - 编辑笔记:
<edit_note>
<path>notes/daily/2024-01-15.md</path>
<edits>[{"search": "原内容", "replace": "新内容"}]</edits>
</edit_note>

# 重要规则

1. 请始终使用实际的工具名称作为 XML 标签名
2. 参数值如果是数组或对象，使用 JSON 格式
3. 每次工具调用后等待结果，再决定下一步
4. 完成任务后必须使用 attempt_completion 工具`;
  }

  private getToolsCatalog(): string {
    return `====

TOOLS

${this.tools.map((tool) => tool.definition).join("\n\n")}`;
  }

  private getCapabilitiesSection(): string {
    return `====

CAPABILITIES

你可以：
1. 读取笔记库中的任意 Markdown 文件
2. 创建新的笔记文件
3. 编辑现有笔记（精确的查找替换）
4. 列出目录结构和文件
5. 完成任务并提供总结

你不能：
1. 访问笔记库之外的文件
2. 执行系统命令
3. 访问网络资源
4. 修改非 Markdown 文件`;
  }

  private getRulesSection(context: TaskContext): string {
    return `====

RULES

1. 笔记库根目录是: ${context.workspacePath}
2. 所有文件路径必须相对于此目录
3. 修改文件前必须先读取确认当前内容
4. 不要询问不必要的信息，直接根据上下文行动
5. 你的目标是完成任务，而不是进行对话
6. 完成任务后必须使用 attempt_completion 工具
7. 禁止以 "好的"、"当然"、"没问题" 等寒暄开头
8. 每次工具调用后必须等待结果确认
9. 如果遇到错误，尝试其他方法而不是放弃
10. 保持输出简洁，避免冗长解释`;
  }

  private getContextSection(context: TaskContext): string {
    let section = `====

CONTEXT

笔记库路径: ${context.workspacePath}
当前打开的笔记: ${context.activeNote || "无"}`;

    if (context.fileTree) {
      section += `

笔记目录结构:
${context.fileTree}`;
    }

    if (context.recentNotes && context.recentNotes.length > 0) {
      section += `

最近编辑的笔记:
${context.recentNotes.map((n) => `- ${n}`).join("\n")}`;
    }

    return section;
  }

  private getObjectiveSection(): string {
    return `====

OBJECTIVE

根据用户的请求，使用可用的工具来完成任务。完成后使用 attempt_completion 工具报告结果。

现在，请等待用户的任务指令。`;
  }
}
