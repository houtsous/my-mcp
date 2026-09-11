# my-mcp 开发约定

## 仓库结构

- 本仓库是多个 MCP Server 的聚合仓库。
- 每个 MCP 必须位于 `mcps/<mcp-name>/`，拥有独立的 `package.json`、`README.md` 和源码，并可脱离根目录单独发布。
- 根目录只放聚合级说明和通用开发约定，不设置 Node.js workspace，不安装共享依赖，也不承载某个 MCP 的业务实现。

## prompt-call 职责

`mcps/prompt-call` 是用户会话与 Markdown 提示词之间的调用桥梁。

- `prompts/` 中每个 Prompt 必须使用 `prompts/<prompt-name>/<prompt-name>.md` 的同名目录结构；每个子目录动态注册为一个 MCP 原生 Prompt，目录名和 Markdown 文件名（不含扩展名）都必须与 `call` 一致。
- MCP 原生请求中的 Prompt `name` 对应统一信封中的 `call`；`arguments.data` 对应 `data`。
- 服务内部统一使用 `{ data: unknown, call: string }` 表示一次调用。
- JSON 示例定义一条输入的数据结构；`data` 可以是单条值，也可以是由该结构组成的数组。单条用户指令组装为单值，多条独立指令按原顺序组装为数组。
- `data` 由 AI 客户端根据用户会话组装；MCP Server 不运行模型，不自行推断自然语言意图。
- 如果目标文件包含“接收输入”或“接受输入”章节，并在其后提供 `JSON` 小节和 JSON 代码块，服务必须读取该对象作为输入范式。
- 输入范式用于向客户端公开参数说明，并校验单条 `data`（或数组中的每一项）的顶层结构、字段名和基础 JSON 类型。
- 示例对象中的字段表示允许字段，不代表全部字段无条件必填；复杂条件和字段语义继续由 Prompt 正文约束。
- 没有输入范式的 Prompt 按无参数 Prompt 注册，不应要求用户提供 `data`。
- 服务只负责发现、描述、校验、加载和注入 Prompt，不执行 Prompt 中描述的业务操作。

## 内容边界

- 可选私有默认值文件固定为 `mcps/prompt-call/default-setting.json`，使用 `{ common: object, prompt_items: Record<string, object> }` 结构；`common` 对所有 Prompt 可见，`prompt_items[call]` 只对对应 Prompt 可见。该文件必须被 Git 忽略，缺失时不设置默认值。
- Prompt 内容的唯一运行时来源是 `mcps/prompt-call/prompts/`。
- 不得在源码中硬编码具体 Prompt 名称、业务字段或服务器参数。
- 不得把密码、Token、私钥或其他秘密写入仓库。
- 标准输出仅用于 MCP 协议消息；诊断信息只能写入标准错误。
