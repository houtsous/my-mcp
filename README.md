# my-mcp

可发布的 MCP Server 集合。仓库采用“总仓库 → 独立 MCP”结构；每个 `mcps/<name>/` 都是可以单独发布到 GitHub、npm 和魔搭 MCP 广场的完整包。

## MCP 列表

| MCP | 用途 | 目录 |
| --- | --- | --- |
| `prompt-call` | 将 Markdown 提示词动态注册为 MCP 原生 Prompt，并负责参数声明、校验和注入 | `mcps/prompt-call/` |

## 目录结构

```text
.
├── AGENTS.md
└── mcps/
    └── prompt-call/
        ├── prompts/
        ├── src/
        ├── package.json
        └── README.md
```

## 开发

根目录不是 Node.js workspace，不安装共享依赖。进入具体 MCP 目录独立安装和运行：

```powershell
cd mcps/prompt-call
npm install
```

启动 `prompt-call`：

```powershell
npm start
```

`node_modules/` 不进入 Git，也不随 GitHub 或魔搭发布包上传；部署端根据 `package.json` 在自己的临时环境中安装。每个 MCP 保持独立，新增服务时不要把实现代码或专属依赖放到根目录或其他 MCP 目录。
