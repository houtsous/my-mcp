# prompt-call

将 Markdown 文件注册为 MCP 原生 Prompt，在用户会话与提示词之间提供统一调用桥梁。

## Prompt 目录结构

每个 Prompt 使用一个同名目录，并在目录内放置同名 Markdown 文件：

```text
prompts/
├── local-env-manage/
│   └── local-env-manage.md
├── server-maintenance-rule/
│   └── server-maintenance-rule.md
└── server-maintenance-summary/
    └── server-maintenance-summary.md
```

目录名、Markdown 文件名（不含扩展名）和 Prompt 的 `call` 应保持一致。新增 Prompt 时创建新的同名目录，不要把 Markdown 文件直接放在 `prompts/` 根目录。

## 在对话中调用

用户不需要手工编写 MCP 协议请求。只要在对话中明确指定 MCP Server、Prompt 名称和 `data` 参数，客户端 Agent 会负责将请求转换为原生 MCP Prompt 调用。

### 推荐提示词模板

```text
调用 prompt-call 的【Prompt 名称】，将下面的 JSON 作为 data 参数传入：

【JSON 数据】
```

### 单条参数示例

```text
调用 prompt-call 的 local-env-manage，将下面的 JSON 作为 data 参数传入：

{
  "key": "download_root",
  "fun": "",
  "value": "F:/downloads",
  "opt": "update"
}
```

### 多条参数示例

一次表达多条独立指令时，把同结构对象组成数组，并保持指令的先后顺序：

```text
调用 prompt-call 的 local-env-manage，将下面的数组作为 data 参数传入：

[
  {
    "key": "download_root",
    "fun": "",
    "value": "F:/downloads",
    "opt": "update"
  },
  {
    "key": "model_root",
    "fun": "",
    "value": "E:/models",
    "opt": "create"
  }
]
```

### 统一信封格式

也可以在对话中直接使用以下结构：

```json
{
  "call": "local-env-manage",
  "data": {
    "key": "download_root",
    "fun": "",
    "value": "F:/downloads",
    "opt": "update"
  }
}
```

其中：

- `call` 表示需要调用的 Prompt。
- `data` 表示从用户会话中整理出的参数，可以是单个值，也可以是数组。
- `call` 不会作为 Prompt 参数传入，而是由客户端 Agent 转换成 MCP Prompt 名称。

客户端最终产生的原生 MCP 请求大致如下：

```json
{
  "name": "local-env-manage",
  "arguments": {
    "data": "{\"key\":\"download_root\",\"fun\":\"\",\"value\":\"F:/downloads\",\"opt\":\"update\"}"
  }
}
```

### 注意事项

- `prompt-call.local-env-manage` 可以作为对话中的简写，但它不是 MCP 协议里的正式 Prompt 名称。
- 推荐明确写成“调用 `prompt-call` 的 `local-env-manage`”。
- 输入必须是合法 JSON，字段名和字符串值必须使用双引号。
- MCP Server 不会直接收到完整的用户对话，只会收到客户端 Agent 根据对话组装出的 Prompt 名称和参数。
- Prompt 支持哪些参数，以对应 Markdown 文件中“接收输入/接受输入 → JSON”所声明的参数范式为准。
