/**
 * 工具定义汇总
 * 支持多语言国际化
 */

import { ToolDefinition } from "../../types";
import { getCurrentTranslations } from "@/stores/useLocaleStore";

/**
 * 获取本地化的工具定义
 */
function getLocalizedToolDef(toolName: string): { description: string; definition: string } {
  const t = getCurrentTranslations();
  const toolDef = t.prompts.tools[toolName as keyof typeof t.prompts.tools];
  return {
    description: toolDef?.description || toolName,
    definition: toolDef?.definition || `## ${toolName}`,
  };
}

// ============ read_note ============

export const readNoteDefinition: ToolDefinition = {
  name: "read_note",
  description: "读取笔记文件的内容",
  parameters: [
    {
      name: "path",
      type: "string",
      required: true,
      description: "要读取的笔记路径，相对于笔记库根目录",
    },
  ],
  definition: `## read_note
描述: 读取笔记文件的内容。返回带行号的内容，便于后续编辑时定位。

参数:
- path: (必需) 笔记路径，相对于笔记库根目录

用法:
<read_note>
<path>notes/daily/2024-01-15.md</path>
</read_note>

读取多个文件时，分别调用即可。

返回格式:
- 每行带行号，如 "1 | # 标题"
- 如果文件不存在会返回错误信息`,
};

// ============ edit_note ============

export const editNoteDefinition: ToolDefinition = {
  name: "edit_note",
  description: "对笔记进行精确的查找替换修改，可选重命名文件",
  parameters: [
    {
      name: "path",
      type: "string",
      required: true,
      description: "要编辑的笔记路径",
    },
    {
      name: "edits",
      type: "array",
      required: true,
      description: "编辑操作数组，每个操作包含 search 和 replace",
    },
    {
      name: "new_name",
      type: "string",
      required: false,
      description: "新文件名（可选），不包含路径",
    },
  ],
  definition: `## edit_note
描述: 对笔记进行精确的查找替换修改。使用 SEARCH/REPLACE 方式。可选择同时重命名文件。

参数:
- path: (必需) 要编辑的笔记路径，相对于笔记库根目录
- edits: (必需) 编辑操作数组，JSON 格式，每个操作包含:
  - search: 要查找的原始内容 (必须与文件内容完全匹配)
  - replace: 替换后的新内容
- new_name: (可选) 新文件名，不包含路径。**如果笔记内容发生本质性改变（如主题、标题、核心内容变化），应该提供新文件名以保持文件名与内容的一致性**

用法:
<edit_note>
<path>notes/daily/2024-01-15.md</path>
<edits>[
  {
    "search": "## 待办事项\\n- [ ] 任务1",
    "replace": "## 待办事项\\n- [x] 任务1"
  }
]</edits>
</edit_note>

内容本质改变时同时重命名:
<edit_note>
<path>notes/Python基础.md</path>
<edits>[
  {
    "search": "# Python基础\\n\\n这是关于Python的基础教程",
    "replace": "# Python高级编程\\n\\n这是关于Python高级特性的教程"
  }
]</edits>
<new_name>Python高级编程.md</new_name>
</edit_note>

重要:
- search 内容必须与文件中的内容完全一致（包括换行和空格）
- 可以进行多处修改，按顺序应用
- 修改前请先用 read_note 确认当前内容
- 如果 search 内容找不到，修改将失败
- new_name 不能包含路径分隔符，仅修改文件名
- **智能重命名**: 当修改一级标题(# 标题)或笔记主题发生本质性改变时，应提供 new_name 参数，使文件名与内容保持一致。例如标题从"项目规划"改为"项目总结"时，应将文件重命名为"项目总结.md"`,
};

// ============ create_note ============

export const createNoteDefinition: ToolDefinition = {
  name: "create_note",
  description: "创建新的笔记文件",
  parameters: [
    {
      name: "path",
      type: "string",
      required: true,
      description: "笔记路径",
    },
    {
      name: "content",
      type: "string",
      required: true,
      description: "笔记内容",
    },
  ],
  definition: `## create_note
描述: 创建新的笔记文件。仅用于创建不存在的文件。

参数:
- path: (必需) 笔记路径，相对于笔记库根目录
- content: (必需) 完整的笔记内容

用法:
<create_note>
<path>notes/new-note.md</path>
<content># 新笔记标题

这是笔记内容。

## 章节一

更多内容...</content>
</create_note>

重要:
- 仅用于创建新文件
- 会自动创建不存在的父目录
- 修改现有文件必须使用 edit_note，不要用 create_note 覆盖
- 如果你想修改文件，请用 edit_note 的 search/replace 方式`,
};

// ============ list_notes ============

export const listNotesDefinition: ToolDefinition = {
  name: "list_notes",
  description: "列出指定目录下的笔记文件",
  parameters: [
    {
      name: "directory",
      type: "string",
      required: false,
      description: "要列出的目录路径，默认为根目录",
    },
    {
      name: "recursive",
      type: "boolean",
      required: false,
      description: "是否递归列出子目录，默认 true",
    },
  ],
  definition: `## list_notes
描述: 列出指定目录下的笔记文件和子目录。

参数:
- directory: (可选) 目录路径，相对于笔记库根目录，默认为根目录
- recursive: (可选) 是否递归列出子目录内容，默认 true

用法:
<list_notes>
<directory>notes/daily</directory>
<recursive>true</recursive>
</list_notes>

返回格式:
- 文件列表，包含文件名和修改时间
- 子目录会以 "/" 结尾
- 按字母顺序排列`,
};

// ============ create_folder ============

export const createFolderDefinition: ToolDefinition = {
  name: "create_folder",
  description: "创建新目录",
  parameters: [
    {
      name: "path",
      type: "string",
      required: true,
      description: "要创建的目录路径",
    },
  ],
  definition: `## create_folder
描述: 创建新的目录文件夹。

参数:
- path: (必需) 目录路径，相对于笔记库根目录

用法:
<create_folder>
<path>notes/new-category</path>
</create_folder>

注意:
- 如果父目录不存在，会自动递归创建
- 如果目录已存在，会返回错误`,
};

// ============ move_file ============

export const moveFileDefinition: ToolDefinition = {
  name: "move_file",
  description: "移动文件或笔记到新目录",
  parameters: [
    {
      name: "from",
      type: "string",
      required: true,
      description: "源文件路径",
    },
    {
      name: "to",
      type: "string",
      required: true,
      description: "目标文件路径",
    },
  ],
  definition: `## move_file
描述: 移动文件或笔记到新目录。

参数:
- from: (必需) 源文件路径，相对于笔记库根目录
- to: (必需) 目标文件路径，相对于笔记库根目录

用法:
<move_file>
<from>notes/inbox/idea.md</from>
<to>notes/projects/new-project.md</to>
</move_file>

注意:
- 会自动创建目标目录（如果不存在）
- 如果目标文件已存在，操作将失败
- 仅用于移动文件位置，如需重命名请使用 rename_file`,
};

// ============ rename_file ============

export const renameFileDefinition: ToolDefinition = {
  name: "rename_file",
  description: "重命名文件、笔记或文件夹",
  parameters: [
    {
      name: "path",
      type: "string",
      required: true,
      description: "原文件/文件夹路径",
    },
    {
      name: "new_name",
      type: "string",
      required: true,
      description: "新名称（不含路径）",
    },
  ],
  definition: `## rename_file
描述: 重命名文件、笔记或文件夹（在同一目录下）。

参数:
- path: (必需) 原文件或文件夹路径，相对于笔记库根目录
- new_name: (必需) 新名称，不包含路径

用法:
<rename_file>
<path>notes/old-name.md</path>
<new_name>new-name.md</new_name>
</rename_file>

注意:
- 仅修改名称，不改变目录
- 如果新名称已存在，操作将失败`,
};

// ============ search_notes ============

export const searchNotesDefinition: ToolDefinition = {
  name: "search_notes",
  description: "语义搜索笔记库，基于内容相似性找到相关笔记",
  parameters: [
    {
      name: "query",
      type: "string",
      required: true,
      description: "搜索查询，用自然语言描述要找的内容",
    },
    {
      name: "directory",
      type: "string",
      required: false,
      description: "限定搜索范围的目录",
    },
    {
      name: "limit",
      type: "number",
      required: false,
      description: "返回结果数量，默认 10",
    },
  ],
  definition: `## search_notes
描述: 语义搜索笔记库。基于内容相似性找到相关笔记，而不是简单的关键词匹配。

参数:
- query: (必需) 搜索查询，用自然语言描述你要找的内容
- directory: (可选) 限定搜索范围的目录路径
- limit: (可选) 返回结果数量，默认 10

用法:
<search_notes>
<query>机器学习的反向传播算法</query>
<directory>notes/tech</directory>
<limit>5</limit>
</search_notes>

返回:
- 相关笔记列表，包含路径、相关度分数、相关片段
- 结果按相关度从高到低排序

适用场景:
- 查找与某个主题相关的笔记
- 发现笔记间的关联
- 基于描述找到具体内容`,
};

// ============ attempt_completion ============

export const attemptCompletionDefinition: ToolDefinition = {
  name: "attempt_completion",
  description: "标记任务完成并提供结果总结",
  parameters: [
    {
      name: "result",
      type: "string",
      required: true,
      description: "任务完成的结果描述或完整回复",
    },
  ],
  definition: `## attempt_completion
描述: 当任务完成时调用此工具。用于向用户报告最终结果。

参数:
- result: (必需) 最终回复内容

**调用前，先判断本次任务类型：**

1. **工具操作任务**（本次调用了 read_note/edit_note/create_note 等工具）
   → result 放操作摘要
   
   示例:
   <attempt_completion>
   <result>已完成以下操作：
   1. 读取了 daily/2024-01-15.md
   2. 修改了待办事项状态</result>
   </attempt_completion>

2. **问答/对话任务**（本次没有调用任何工具，只是回答用户问题）
   → result 放完整回复内容，所有要展示给用户的内容都必须在 result 标签内
   
   示例:
   <attempt_completion>
   <result>关于你的问题，我的回答是：
   
   这是完整的回复内容...
   
   ## 详细说明
   更多内容...</result>
   </attempt_completion>

重要:
- 只有在任务真正完成后才使用此工具
- **所有给用户看的内容必须放在 result 标签内**
- 不要在 attempt_completion 标签外面写回复内容
- 调用此工具后，Agent 循环将结束`,
};

// ============ read_cached_output ============

export const readCachedOutputDefinition: ToolDefinition = {
  name: "read_cached_output",
  description: "读取此前缓存的工具长输出全文",
  parameters: [
    {
      name: "id",
      type: "string",
      required: true,
      description: "cache_id（来自长输出摘要提示）",
    },
  ],
  definition: `## read_cached_output
描述: 读取此前缓存的工具长输出全文。

参数:
- id: (必需) cache_id，来自之前的长输出摘要提示

用法:
<read_cached_output>
<id>read_note-abc123</id>
</read_cached_output>

返回格式:
- 原始完整输出（未做摘要/截断）`,
};

// ============ delete_note ============

export const deleteNoteDefinition: ToolDefinition = {
  name: "delete_note",
  description: "删除指定的笔记文件",
  parameters: [
    {
      name: "path",
      type: "string",
      required: true,
      description: "要删除的笔记路径，相对于笔记库根目录",
    },
  ],
  definition: `## delete_note
描述: 永久删除指定的笔记文件。此操作不可撤销！

参数:
- path: (必需) 要删除的笔记路径，相对于笔记库根目录

用法:
<delete_note>
<path>notes/old-note.md</path>
</delete_note>

警告:
- 删除操作不可撤销
- 删除前请确认这是用户想要的
- 如果文件不存在会返回错误`,
};

// ============ grep_search ============

export const grepSearchDefinition: ToolDefinition = {
  name: "grep_search",
  description: "全文搜索笔记库，支持正则表达式",
  parameters: [
    {
      name: "query",
      type: "string",
      required: true,
      description: "搜索关键词或正则表达式",
    },
    {
      name: "directory",
      type: "string",
      required: false,
      description: "限定搜索范围的目录路径",
    },
    {
      name: "regex",
      type: "boolean",
      required: false,
      description: "是否启用正则表达式模式，默认 false",
    },
    {
      name: "case_sensitive",
      type: "boolean",
      required: false,
      description: "是否区分大小写，默认 false",
    },
    {
      name: "limit",
      type: "number",
      required: false,
      description: "返回结果数量上限，默认 50",
    },
  ],
  definition: `## grep_search
描述: 在笔记库中进行全文搜索，支持正则表达式。比 search_notes 更适合精确匹配。

参数:
- query: (必需) 搜索关键词或正则表达式
- directory: (可选) 限定搜索范围的目录路径
- regex: (可选) 是否启用正则表达式模式，默认 false
- case_sensitive: (可选) 是否区分大小写，默认 false
- limit: (可选) 返回结果数量上限，默认 50

用法:
<grep_search>
<query>TODO|FIXME</query>
<regex>true</regex>
<directory>notes/projects</directory>
</grep_search>

返回:
- 匹配的文件路径、行号和内容
- 按匹配顺序排列

适用场景:
- 查找特定关键词
- 使用正则表达式搜索模式
- 比语义搜索更精确的文本匹配`,
};

// ============ semantic_search ============

export const semanticSearchDefinition: ToolDefinition = {
  name: "semantic_search",
  description: "语义搜索笔记库，基于内容含义找到相关笔记",
  parameters: [
    {
      name: "query",
      type: "string",
      required: true,
      description: "搜索查询，用自然语言描述要找的内容",
    },
    {
      name: "directory",
      type: "string",
      required: false,
      description: "限定搜索范围的目录",
    },
    {
      name: "limit",
      type: "number",
      required: false,
      description: "返回结果数量，默认 10",
    },
    {
      name: "min_score",
      type: "number",
      required: false,
      description: "最低相似度分数 (0-1)，默认 0.3",
    },
  ],
  definition: `## semantic_search
描述: 使用 AI 嵌入进行语义搜索。理解查询含义，找到语义相关的内容。

参数:
- query: (必需) 自然语言查询，描述你想找的内容
- directory: (可选) 限定搜索范围的目录路径
- limit: (可选) 返回结果数量，默认 10
- min_score: (可选) 最低相似度分数 (0-1)，默认 0.3

用法:
<semantic_search>
<query>关于时间管理的技巧和方法</query>
<limit>5</limit>
<min_score>0.5</min_score>
</semantic_search>

返回:
- 相关笔记列表，包含路径、相似度、相关片段
- 结果按相似度从高到低排序

注意:
- 需要先在设置中配置 embedding API 并建立索引
- 与 grep_search 不同，这是基于语义而非关键词的搜索
- 适合模糊查询、概念搜索`,
};

// ============ query_database ============

export const queryDatabaseDefinition: ToolDefinition = {
  name: "query_database",
  description: "查询数据库结构和行数据",
  parameters: [
    {
      name: "database_id",
      type: "string",
      required: true,
      description: "数据库 ID",
    },
    {
      name: "filter_column",
      type: "string",
      required: false,
      description: "过滤列名",
    },
    {
      name: "filter_value",
      type: "string",
      required: false,
      description: "过滤值（模糊匹配）",
    },
    {
      name: "limit",
      type: "number",
      required: false,
      description: "返回行数上限，默认 20",
    },
  ],
  definition: `## query_database
描述: 查询数据库的列结构和行数据。会返回所有列名、类型和可选值。

参数:
- database_id: (必需) 数据库 ID
- filter_column: (可选) 按列名过滤
- filter_value: (可选) 过滤值（模糊匹配）
- limit: (可选) 返回行数上限，默认 20

用法:
<query_database>
<database_id>阅读</database_id>
</query_database>

返回示例:
数据库: **阅读** (ID: 阅读)

## 列结构
- **书名** (text)
- **作者** (text)
- **状态** (select): 可选值 [想读, 在读, 已读]
- **开始阅读** (date)

## 数据
| 书名 | 作者 | 状态 | 开始阅读 |
| --- | --- | --- | --- |
| 三体 | 刘慈欣 | 已读 | 2025-01-01 |

重要:
- 添加行前必须先用此工具查看列结构
- 列名必须完全匹配（如"开始阅读"而不是"开始阅读日期"）
- select/multi-select 列必须使用显示的可选值`,
};

// ============ add_database_row ============

export const addDatabaseRowDefinition: ToolDefinition = {
  name: "add_database_row",
  description: "向数据库添加新行（创建笔记）",
  parameters: [
    {
      name: "database_id",
      type: "string",
      required: true,
      description: "数据库 ID",
    },
    {
      name: "cells",
      type: "object",
      required: false,
      description: "单元格值，键为列名，值为对应内容",
    },
  ],
  definition: `## add_database_row
描述: 向数据库添加新行。这会创建一个新笔记，并在其 frontmatter 中设置数据。

参数:
- database_id: (必需) 数据库 ID
- cells: (可选) 单元格值，JSON 对象格式，键为列名

## 使用步骤（必须遵循）

1. **先用 query_database 查看数据库内容**（检查是否已存在相同记录）:
<query_database>
<database_id>阅读笔记</database_id>
</query_database>

2. **检查查询结果**:
   - 如果已存在相同记录（如同名书籍），告知用户而不是重复添加
   - 仔细阅读返回的"列结构"，了解每列的名称和可选值

3. **根据列结构添加新行**:
<add_database_row>
<database_id>阅读笔记</database_id>
<cells>{"书名": "百年孤独", "作者": "加西亚·马尔克斯", "状态": "在读", "开始阅读": "2024-12-03"}</cells>
</add_database_row>

## 重要规则

1. **列名必须使用 query_database 返回的精确名称**
   - 查看返回的"## 列结构"部分
   - 使用完全一致的列名

2. **select/multi-select 使用返回的可选值名称**
   - 查看"可选值 [...]"中的选项
   - 直接使用显示的选项名（系统会自动转换为 ID）
   
3. **date 列使用 YYYY-MM-DD 格式**

4. **禁止重复添加**: 如果数据中已存在相同记录，不要再添加`,
};

// ============ get_backlinks ============

export const getBacklinksDefinition: ToolDefinition = {
  name: "get_backlinks",
  description: "获取笔记的反向链接",
  parameters: [
    {
      name: "note_name",
      type: "string",
      required: true,
      description: "笔记名称（不含 .md 后缀）",
    },
    {
      name: "include_context",
      type: "boolean",
      required: false,
      description: "是否包含链接所在的上下文内容，默认 true",
    },
  ],
  definition: `## get_backlinks
描述: 获取链接到指定笔记的所有笔记（反向链接）。

参数:
- note_name: (必需) 笔记名称（不含 .md 后缀）
- include_context: (可选) 是否显示链接上下文，默认 true

用法:
<get_backlinks>
<note_name>项目计划</note_name>
<include_context>true</include_context>
</get_backlinks>

返回:
- 反向链接列表
- 每个链接的来源笔记、行号
- 包含链接的上下文行（如果启用）

适用场景:
- 了解笔记间的关系
- 发现知识网络
- 评估笔记的重要性`,
};

// ============ ask_user ============

export const askUserDefinition: ToolDefinition = {
  name: "ask_user",
  description: "向用户提问并等待回复",
  parameters: [
    {
      name: "question",
      type: "string",
      required: true,
      description: "要问用户的问题",
    },
    {
      name: "options",
      type: "array",
      required: false,
      description: "可选的选项列表",
    },
  ],
  definition: `## ask_user
描述: 当需要用户确认或提供更多信息时使用。Agent 会暂停等待用户回复。

参数:
- question: (必需) 要问用户的问题
- options: (可选) 提供选项供用户选择

用法:
<ask_user>
<question>你想删除这个笔记还是归档它？</question>
<options>["删除", "归档到 archive 目录", "取消操作"]</options>
</ask_user>

行为:
- 调用后 Agent 会暂停
- 等待用户在聊天中回复
- 用户回复后继续执行

适用场景:
- 需要用户确认危险操作
- 需要用户澄清需求
- 提供多个选择让用户决定`,
};

// ============ generate_flashcards ============

export const generateFlashcardsDefinition: ToolDefinition = {
  name: "generate_flashcards",
  description: "从笔记内容生成闪卡",
  parameters: [
    {
      name: "content",
      type: "string",
      required: true,
      description: "要生成闪卡的源内容",
    },
    {
      name: "source_note",
      type: "string",
      required: false,
      description: "来源笔记路径",
    },
    {
      name: "deck",
      type: "string",
      required: false,
      description: "目标牌组名称，默认 Default",
    },
    {
      name: "types",
      type: "array",
      required: false,
      description: "卡片类型：basic/cloze/basic-reversed/mcq/list",
    },
    {
      name: "count",
      type: "number",
      required: false,
      description: "生成数量，默认 5",
    },
  ],
  definition: `## generate_flashcards
描述: 从笔记内容生成闪卡。分析内容后会指导你调用 create_flashcard 创建具体卡片。

参数:
- content: (必需) 要生成闪卡的源内容
- source_note: (可选) 来源笔记路径，用于建立链接
- deck: (可选) 目标牌组名称，默认 "Default"
- types: (可选) 要生成的卡片类型数组，可选值:
  - basic: 问答卡（问题 → 答案）
  - cloze: 填空卡（使用 {{c1::答案}} 语法）
  - basic-reversed: 双向卡（自动生成反向卡）
  - mcq: 选择题
  - list: 列表题
- count: (可选) 生成数量，默认 5

用法:
<generate_flashcards>
<content>React Hooks 是 React 16.8 引入的新特性，让函数组件也能使用状态和生命周期。常用的 Hooks 包括：useState 管理状态、useEffect 处理副作用、useContext 访问上下文。</content>
<deck>编程学习</deck>
<types>["basic", "cloze"]</types>
<count>5</count>
</generate_flashcards>

工作流程:
1. 调用此工具分析内容
2. 根据返回的指导，多次调用 create_flashcard 创建卡片
3. 用 attempt_completion 报告结果`,
};

// ============ deep_search ============

export const deepSearchDefinition: ToolDefinition = {
  name: "deep_search",
  description: "深度搜索：搜索笔记并返回完整内容，一次获取所有信息",
  parameters: [
    {
      name: "query",
      type: "string",
      required: true,
      description: "搜索关键词或描述",
    },
    {
      name: "limit",
      type: "number",
      required: false,
      description: "返回笔记数量，默认 5",
    },
    {
      name: "include_content",
      type: "boolean",
      required: false,
      description: "是否包含笔记内容，默认 true",
    },
  ],
  definition: `## deep_search
描述: 深度搜索笔记库。与普通搜索不同，这个工具会一次性返回搜索结果和笔记内容。

**适用场景**:
- 需要分析多个笔记的内容
- "找关于 X 的笔记并总结"
- 需要对比多个笔记

**不适用场景**:
- 只需要知道有哪些笔记（用 grep_search）
- 需要精确控制读取哪些笔记（用 search + read_note）

参数:
- query: (必需) 搜索关键词或描述
- limit: (可选) 返回笔记数量，默认 5
- include_content: (可选) 是否包含笔记内容，默认 true

用法:
<deep_search>
<query>React Hooks</query>
<limit>3</limit>
</deep_search>

返回:
- 搜索结果列表（关键词匹配 + 语义匹配）
- 每个笔记的完整内容（截断到 2000 字符）

优势:
- 一次调用获取所有信息，无需多次往返
- 自动合并关键词搜索和语义搜索结果`,
};

// ============ create_flashcard ============

export const createFlashcardDefinition: ToolDefinition = {
  name: "create_flashcard",
  description: "创建一张闪卡",
  parameters: [
    {
      name: "type",
      type: "string",
      required: true,
      description: "卡片类型：basic/cloze/basic-reversed/mcq/list",
    },
    {
      name: "deck",
      type: "string",
      required: false,
      description: "牌组名称",
    },
    {
      name: "front",
      type: "string",
      required: false,
      description: "问题/正面（basic/basic-reversed）",
    },
    {
      name: "back",
      type: "string",
      required: false,
      description: "答案/背面（basic/basic-reversed）",
    },
    {
      name: "text",
      type: "string",
      required: false,
      description: "填空文本（cloze），使用 {{c1::答案}} 格式",
    },
    {
      name: "question",
      type: "string",
      required: false,
      description: "问题（mcq/list）",
    },
    {
      name: "options",
      type: "array",
      required: false,
      description: "选项列表（mcq）",
    },
    {
      name: "answer",
      type: "number",
      required: false,
      description: "正确答案索引（mcq）",
    },
    {
      name: "items",
      type: "array",
      required: false,
      description: "列表项（list）",
    },
  ],
  definition: `## create_flashcard
描述: 创建一张闪卡。卡片会保存为 Markdown 文件到 Flashcards 目录。

参数:
- type: (必需) 卡片类型
- deck: (可选) 牌组名称，默认 "Default"
- 根据类型需要不同参数:

**basic / basic-reversed 类型:**
- front: 问题/正面
- back: 答案/背面

**cloze 类型:**
- text: 包含 {{c1::答案}} 格式的文本

**mcq 类型:**
- question: 问题
- options: 选项数组
- answer: 正确答案索引 (0-based)

**list 类型:**
- question: 问题
- items: 列表项数组
- ordered: 是否需要按顺序

用法示例:

问答卡:
<create_flashcard>
<type>basic</type>
<deck>编程学习</deck>
<front>React Hooks 是什么时候引入的？</front>
<back>React 16.8</back>
</create_flashcard>

填空卡:
<create_flashcard>
<type>cloze</type>
<deck>编程学习</deck>
<text>{{c1::useState}} 用于在函数组件中管理状态</text>
</create_flashcard>

选择题:
<create_flashcard>
<type>mcq</type>
<question>以下哪个不是 React Hook？</question>
<options>["useState", "useEffect", "useClass", "useContext"]</options>
<answer>2</answer>
</create_flashcard>`,
};

// ============ 导出所有定义 ============

// 基础工具定义（保留参数结构）
const baseToolDefinitions: ToolDefinition[] = [
  readNoteDefinition,
  editNoteDefinition,
  createNoteDefinition,
  listNotesDefinition,
  createFolderDefinition,
  moveFileDefinition,
  renameFileDefinition,
  searchNotesDefinition,
  attemptCompletionDefinition,
  readCachedOutputDefinition,
  deleteNoteDefinition,
  grepSearchDefinition,
  semanticSearchDefinition,
  queryDatabaseDefinition,
  addDatabaseRowDefinition,
  getBacklinksDefinition,
  generateFlashcardsDefinition,
  createFlashcardDefinition,
  deepSearchDefinition,
];

/**
 * 获取所有工具定义（动态本地化）
 * description 和 definition 会根据当前语言动态返回
 */
export function getAllToolDefinitions(): ToolDefinition[] {
  return baseToolDefinitions.map(tool => {
    const localized = getLocalizedToolDef(tool.name);
    return {
      ...tool,
      description: localized.description,
      definition: localized.definition,
    };
  });
}

export function getToolDefinition(name: string): ToolDefinition | undefined {
  return getAllToolDefinitions().find((t) => t.name === name);
}
