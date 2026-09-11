# prompt-call

把 `prompts/` 中的 Markdown 文件动态注册为 MCP 原生 Prompt。文件名（不含 `.md`）是 Prompt 的调用名。

## 调用模型

逻辑输入统一表示为：

```ts
{
  call: string;
  data: unknown | unknown[];
}
```

在 MCP 原生协议中，`call` 使用 `prompts/get.params.name` 表达，`data` 使用 `prompts/get.params.arguments.data` 表达。由于 MCP Prompt 参数在线路上是字符串，`data` 传输时使用 JSON 字符串。

JSON 示例描述一条输入的数据结构。用户只表达一条指令时，`data` 使用单值；表达多条独立指令时，`data` 使用同结构数组，并保持用户语句顺序。

例如：

```json
{
  "name": "local-env-manage",
  "arguments": {
    "data": "{\"key\":\"download_root\",\"fun\":\"\",\"value\":\"F:/downloads\",\"opt\":\"update\"}"
  }
}
```

## 参数发现

如果 Markdown 包含以下约定，服务会提取第一个 JSON 代码块作为参数范式：

````markdown
## 接收输入

### JSON

```json
{
  "key": "example"
}
```
````

`接受输入` 也受支持。范式会出现在 `data` 参数的说明中，并用于以下校验：

- 顶层和嵌套 JSON 基础类型；
- 对象允许的字段；
- 数组元素类型（示例数组非空时）。

示例字段不自动视为全部必填。条件必填、枚举和业务规则仍由 Prompt 正文说明。

没有上述输入范式的文件会注册为无参数 Prompt。

## 运行

在仓库根目录执行：

```powershell
npm install
npm start
```

Codex 本地配置示例：

```toml
[mcp_servers.prompt_call]
command = "node"
args = ["E:/my-mcp/mcps/prompt-call/src/index.js"]
enabled = true
```

发布到 npm 后，客户端也可以通过 `npx -y prompt-call-mcp` 启动。`node_modules/` 不属于发布内容，部署端根据 `package.json` 安装依赖。

修改 Prompt 正文会在下一次调用时生效；新增、删除文件或改变参数范式后需要重启 MCP Server，以刷新 `prompts/list` 元数据。
