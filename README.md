# MemoPalace

自演化的 Agent 记忆宫殿 — 为 OpenCode、Claude Code 等 Code Agent 提供记忆存储、检索、巩固和演化能力。

## 架构

```
┌─────────────────────────────────────┐
│  Code Agent (OpenCode)              │
│  ┌────────┐ ┌───────────┐ ┌─────┐  │
│  │  Hook  │ │ MCP Server│ │ CLI │  │
│  └───┬────┘ └─────┬─────┘ └──┬──┘  │
│      └─────────────┼──────────┘     │
│            Server API Client        │
└────────────────┬────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────┐
│  MemoPalace Server                  │
│  ┌──────────┐┌─────────┐┌────────┐ │
│  │ Retriever ││ Analyzer││ Evolver│ │
│  └────┬─────┘└────┬────┘└───┬────┘ │
│       └───────────┼────────┘       │
│       Memory Store (SQLite+FTS5)    │
│    ┌───────────────┐                │
│    │ Episodic Floor│  4 Rooms      │
│    │ Semantic Floor│  3 Rooms      │
│    │ Proc. Floor ──┘ (file-based)  │
│    └───────────────────────────────┘│
│       Web Console (React SPA)       │
└─────────────────────────────────────┘
```

## 记忆宫殿：Floors & Rooms

MemoPalace 采用"记忆宫殿"隐喻组织记忆：**三层 Floor（层），每层包含多个 Room（房间）**，构成 `Floor → Room` 二级分类体系。

### Floor 1: 情景记忆 (Episodic) — SQLite+FTS5

具体事件经历。每条情景记忆属于一个 Room：

| Room | 含义 | 说明 |
|------|------|------|
| `debug_case` | 调试案例 | 错误信号、根因分析、修复策略 |
| `api_trap` | API 陷阱 | 易误用的 API、参数约束 |
| `config_trap` | 配置陷阱 | 构建/部署/环境配置问题 |
| `dev_note` | 开发笔记 | 通用开发记录（字段约束宽松） |

### Floor 2: 语义记忆 (Semantic) — SQLite+FTS5

从情景记忆抽象出来的一般知识。每条语义记忆属于一个 Room：

| Room | 含义 | 说明 |
|------|------|------|
| `pattern` | 模式 | 跨案例归纳的通用模式 |
| `best_practice` | 最佳实践 | 经验总结的操作规范 |
| `dev_specification` | 开发规格 | 接口定义、设计规约 |

### Floor 3: 程序性记忆 (Procedural) — 文件存储

自动化的行为模式，存储为 JSON 文件（`memory/procedural/{room}/{id}.json`），不存入 SQLite：

| Room | 含义 | 说明 |
|------|------|------|
| `skill` | 技能 | 单一自动行为（如：错误搜索） |
| `workflow` | 工作流 | 编排多个 skill 的流程 |

### 演化路径

情景 → 语义 → 程序性（巩固/内化），反向可退化。Evolution 引擎自动扫描同码/同类情景记忆，生成合并建议。

## 快速开始

### 1. 安装依赖

```bash
cd src
npm install
cd web
npm install
```

### 2. 启动服务

**方式 A：一键启动（推荐）**

Windows 双击 `src/memo_start.bat`，或在 src 目录执行：

```bash
# PowerShell
powershell -ExecutionPolicy Bypass -File memo_start.ps1

# CMD
memo_start.bat
```

自动启动 API Server + Web Console，退出时自动清理进程。

**方式 B：手动启动**

```bash
# 终端 1：API Server（默认 http://localhost:5678）
cd src
npm run dev:server

# 终端 2：Web Console（http://localhost:5173，代理 /api → :5678）
cd src/web
npm run dev
```

环境变量：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `5678` | API Server 端口 |
| `MEMOPALACE_DB` | `memopalace.db` | SQLite 数据库文件路径 |

### 3. 安装 CLI（可选）

安装后可在任意目录直接使用 `memopalace` 命令：

```bash
cd src
npm link
```

卸载：

```bash
npm unlink -g memopalace
```

### 4. 导入现有数据

```bash
cd src
npx tsx tools/import-cases.ts
```

从 `src/assets/pipeline/evolved/high_value.jsonl` 导入 HarmonyOS 调试案例。

## CLI 使用

```bash
memopalace search "push token"                             # 全层检索
memopalace search "push" --layer episodic                  # 按 Floor 检索
memopalace search "null" --episodic-type debug_case        # 按 Room 筛选
memopalace search "api" --semantic-type pattern            # 语义 Room 筛选
memopalace upload <file>                                    # 上载情景记忆
memopalace upload <file> --episodic-type api_trap          # 指定 Room
memopalace self-check                                       # 自检（含 Floor/Room 统计）
memopalace status                                           # 服务器状态
memopalace config                                           # 查看/设置配置
```

未安装 CLI 时可用 `npx tsx clients/cli/index.ts` 替代（需在 src 目录下）。

CLI 连接的服务器地址按以下优先级查找：

1. 环境变量 `MEMOPALACE_URL`
2. 配置文件 `~/.memopalace/config.json` 中 `baseUrl` 字段
3. 默认值 `http://localhost:5678`

```bash
# 示例：修改服务器地址
memopalace config baseUrl http://192.168.1.100:5678
```

## Web Console

访问 `http://localhost:5173`，5 个页面：

- **总览 (Dashboard)** — 各 Floor 记忆条目数、Room 类型徽章、检索入口
- **记忆 (Memory)** — 按 Floor/Room 浏览、搜索、筛选三类记忆，手动创建语义/程序性记忆
- **采集 (Collection)** — 触发外部数据导入（支持 episodic_type 字段）
- **观测 (Observation)** — 服务器连通性、各 Floor 记忆统计及 Room 列表
- **演化 (Evolution)** — 触发分析、确认/拒绝演化任务、查看演化历史

## MCP Server

在 OpenCode 的 `opencode.json` 中注册：

```json
{
  "mcp": {
    "memopalace": {
      "type": "local",
      "command": "npx",
      "args": ["tsx", "src/clients/mcp-server/index.ts"],
      "env": {
        "MEMOPALACE_URL": "http://localhost:5678"
      }
    }
  }
}
```

暴露 4 个 tools：

| Tool | 说明 |
|------|------|
| `memopalace_search` | 跨 Floor 和 Room 检索，支持 episodic_type / semantic_type 筛选 |
| `memopalace_upload` | 上载情景记忆到指定 Room（debug_case, api_trap, config_trap, dev_note） |
| `memopalace_self_check` | 自检：DB 健康 + 各 Floor 记忆统计 |
| `memopalace_status` | 服务器状态：uptime + 各 Floor 记忆数量 + 待处理演化任务 |

## API

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/episodic` | POST/GET | 创建/列表情景记忆（需 `episodic_type`，GET 支持 `?episodic_type=` 筛选） |
| `/api/episodic/:id` | GET/PATCH | 获取/更新情景记忆 |
| `/api/semantic` | POST/GET | 创建/列表语义记忆（需 `semantic_type`，GET 支持 `?semantic_type=` 筛选） |
| `/api/semantic/:id` | GET/PATCH | 获取/更新语义记忆 |
| `/api/procedural` | POST/GET | 创建/列表程序性记忆（需 `procedural_type`，文件存储） |
| `/api/procedural/:id` | GET/PATCH/DELETE | 获取/更新/删除程序性记忆 |
| `/api/search` | POST | 统一检索 `{query, layer?, limit?, episodic_type?, semantic_type?}` |
| `/api/evolution/analyze` | POST | 触发分析 |
| `/api/evolution/tasks` | GET | 待确认演化任务 |
| `/api/evolution/tasks/:id/confirm` | POST | 确认执行 |
| `/api/evolution/tasks/:id/reject` | POST | 拒绝 |
| `/api/evolution/history` | GET | 演化历史 |
| `/api/status` | GET | 服务器状态 |
| `/api/self-check` | GET | 自检 |
| `/api/import` | POST | 导入数据（需 `episodic_type` 字段） |

## 演化规则（RFC-001）

| 规则 | 触发条件 | 产出 |
|------|----------|------|
| 同码合并 | 相同 error_code 的情景记忆 ≥3 条 | 合并为 semantic_type=pattern 的知识 |
| 同类合并 | 相同 category + fix_strategy ≥3 条 | 合并为语义记忆 |
| 孤立清理 | 情景记忆 status=open 且超过 30 天 | 建议归档 |

分析结果为 `pending` 状态，需在 Web Console 人工确认后执行。

## 测试

```bash
cd src
npm test            # 运行全部测试
npm run test:watch  # 监听模式
```

## 技术栈

- **语言：** TypeScript
- **服务器：** Fastify + SQLite (better-sqlite3) + FTS5
- **客户端：** Hook + MCP Server (@modelcontextprotocol/sdk) + CLI (commander)
- **Web Console：** React + Vite

## 目录结构

```
src/
  bin/              # CLI 全局命令入口 (memopalace.js)
  server/           # 服务端（Fastify + SQLite）
    db/             # 数据库连接和 Schema
    routes/         # API 路由
    services/       # Retriever, Analyzer, Evolver, Importer
    web/            # SPA 静态文件服务
  clients/
    api-client.ts   # 统一 HTTP 客户端
    cli/            # memopalace CLI
    mcp-server/     # MCP Server
    hook/           # Hook 事件处理器
  web/              # Web Console (React SPA)
  schemas/          # JSON Schema 定义
  tools/            # 开发工具脚本
  memory/
    episodic/       # 情景记忆 Floor
      debug_case/   #   调试案例 Room
      api_trap/     #   API 陷阱 Room
      config_trap/  #   配置陷阱 Room
      dev_note/     #   开发笔记 Room
    semantic/       # 语义记忆 Floor
      pattern/      #   模式 Room
      best_practice/ #  最佳实践 Room
      dev_specification/ # 开发规格 Room
    procedural/     # 程序性记忆 Floor（文件存储）
      skill/        #   技能 Room
      workflow/     #   工作流 Room
  assets/
    sources/        # 原始数据源
      expert_docs/  #   专家文档
      github/       #   GitHub issues
      huawei_forum/ #   华为论坛
      opencode_sessions/ # OpenCode 会话
    pipeline/       # 数据流水线
      evolved/      #   高价值筛选结果
        high_value.jsonl
      normalizer/   #   归一化中间态
      filter/       #   过滤中间态
```

## 协议依据

| 依赖 | 文档 |
|------|------|
| OpenCode MCP Server | https://opencode.ai/docs/mcp-servers/ |
| MCP stdio transport | https://modelcontextprotocol.io/specification/2025-06-18/basic/transports |
| Claude Code hooks | https://docs.anthropic.com/en/docs/claude-code/hooks |

## 文档

- [Floor/Room 架构设计](docs/superpowers/specs/2026-05-29-memory-room-restructure-design.md)
- [Floor/Room 实现计划](docs/superpowers/plans/2026-05-29-memory-room-restructure.md)
- [RFC-001 原始设计](docs/specs/RFC-001-init-proposal-apply/delta-design.md)（已被 Floor/Room 架构取代）
