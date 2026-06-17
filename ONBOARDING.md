# MemoPalace Agent Onboarding

本文档面向**首次接触本仓库**的 Code Agent 或人类贡献者。先看 `AGENTS.md`（速查表：命令、文件路径、API 表），再看本文（**心智模型与工作流**）。

> 关系：`AGENTS.md` 是工作时的速查表；`ONBOARDING.md` 是入门时的导览图。两者配合使用。

---

## 1. 首次拉取后的初始化

```bash
git clone git@github.com:HakuCasey/memo-palace.git
cd memo-palace
git checkout dev

# 注意：有两个 package.json
cd src && npm install
cd web && npm install
cd ..

# 验证（顺序：lint -> typecheck -> test）
npm run lint        # 0 errors
npm run typecheck   # tsc --noEmit
npm test            # 169 tests passing

# 启动
npm run dev:server  # Fastify on :5678
npm run dev:web     # Vite on :5173 (代理 /api -> :5678)
# Windows 一键启动：
./memo_start.ps1

# 可选：导入种子数据
npx tsx tools/import-cases.ts

# 可选：装 CLI 全局命令
npm link            # 之后任意目录可执行 `memopalace search "xxx"`
```

**前置要求**：Node >= 20。Windows 上需要 VS Build Tools 才能编译 better-sqlite3 native 模块。

---

## 2. 项目是怎么跑起来的

**一句话**：给 Code Agent 用的“记忆宫殿”服务器。Agent 把调试经验、规范、技能存进来，下次遇到类似问题先检索宫殿。

### 三层记忆（Floor / Room 隐喻）

| Floor | 含义 | Room（type 字段） | 存储 |
|-------|------|-------------------|------|
| **Episodic** 情景层 | 发生过的事 | `debug_case`, `api_trap`, `config_trap`, `dev_note` | SQLite + FTS5 |
| **Semantic** 语义层 | 抽象出的知识 | `pattern`, `best_practice`, `dev_specification` | SQLite + FTS5 |
| **Procedural** 程序层 | 可执行步骤 | `skill`, `workflow` | **文件 JSON**（不入库） |

**演化方向**：Episodic（具体案例）→ Semantic（提炼模式）→ Procedural（沉淀流程）。这是 `services/evolver.ts` 的核心使命。

### 数据流水线（RFC-004 简化为 2 阶段）

```
assets/sources/<channel>/*.jsonl       (raw: huawei_forum / github / opencode_sessions / manual)
    | normalizer 阶段
assets/pipeline/normalizer/all.jsonl   (统一为 Candidate 格式)
    | filter 阶段（DB 规则引擎，可在 Web 配置）
assets/pipeline/filter/all.jsonl       (通过过滤的候选)
    | 用户在 Web Collection 页面手动确认
assets/pipeline/evolved/high_value.jsonl
    | POST /api/episodic
SQLite episodic 表
```

要点：

- 旧 4 阶段（normalize / filter / materialize / consolidate）已简化为 2 阶段，**materialize 由用户在 Web 驱动**。
- `.skiplist.json` 记录被忽略的 ID；`.errors/<stage>_error.jsonl` 记录失败项。
- in-process `node-cron` 调度（见 `services/pipeline/scheduler.ts`），同阶段不重叠（写一条 `status='skipped'` 而非排队）。

### 客户端架构

四种客户端共享 `clients/api-client.ts`：

- **CLI**（`memopalace search/upload/...`）：人手操作
- **MCP Server**：OpenCode/Claude Desktop 通过 stdio 调用（4 工具：search / upload / self_check / status）
- **Hook**：错误信号触发自动检索 + 建议
- **Web Console**：React SPA，直接命中 `/api/*`

---

## 3. 代码库导航（按“我想做 X”组织）

| 我想… | 看这里 |
|------|--------|
| 加一个 HTTP API | `src/server/routes/` 选个邻居复制；在 `src/server/index.ts` 注册路由 |
| 改数据库 schema | `src/server/db/schema.ts`（DDL + FTS5 + 触发器）。**FTS 表由触发器同步，不要直接写** |
| 加 pipeline 阶段 | `src/server/services/pipeline/stages/` 仿 `normalizer.ts` / `filter.ts`，到 `registry.ts` 注册 |
| 改前端页面 | `src/web/src/pages/{Memory,Collection,Evolution,Observation,Dashboard}.tsx` |
| 共享类型 | 服务端：`src/server/types.ts`；前端：`src/web/src/api.ts`（**两份必须同步**） |
| 加 CLI 子命令 | `src/clients/cli/commands/` 仿现有命令，到 `index.ts` 注册 |
| 加 MCP 工具 | `src/clients/mcp-server/tools.ts` |
| 加测试 | 与被测文件同目录的 `__tests__/`；用 `buildApp()` helper |
| 写 RFC | `docs/specs/rfc-XXX-name/` 下 `proposal.md → delta-design.md → delta-spec.md → tasks.md` |

---

## 4. 必须避开的 7 个坑

> 真实踩过的坑，按“易踩程度”排序。

1. **导入路径必须用 `.js`**（即使源文件是 `.ts`）

   ```ts
   import { foo } from "./bar.js";   // 正确
   import { foo } from "./bar.ts";   // 错（运行时报错）
   import { foo } from "./bar";      // 错
   ```

   原因：`"type": "module"` + Node ESM 解析规则。**这是最常见的错误**。

2. **JSON 列要手动 stringify/parse** — DB 中 `*_json` 列（trigger / resolution / context / tags / consolidation 等）存 JSON 字符串。route handler 已经处理，写自定义 SQL 时别忘记。

3. **不要直接写 FTS 表** — `episodic_fts` / `semantic_fts` 由 AFTER INSERT/UPDATE/DELETE 触发器自动同步，手动 INSERT 会破坏一致性。

4. **`episodic_type` / `semantic_type` 必填** — 漏填导致目录归档失败。值必须在白名单内（见 AGENTS.md “Key Constraints”）。

5. **两份 type 定义要同步** — `src/server/types.ts` 和 `src/web/src/api.ts` 是手动同步的。改一处必须改另一处。

6. **Web 有独立 `node_modules`** — `cd src && npm install` 不装前端依赖。前端必须在 `src/web/` 下单独 `npm install`。

7. **Pipeline normalizer 的 source-file filter 是模块级状态** — `setSourceFileFilter()` 每次 batch-run 后必须 reset 为 `null`。`routes/pipeline.ts` 已处理，自定义调用时注意。

---

## 5. 测试约定

- **框架**：Vitest（无配置文件，从 `package.json` 自动发现）
- **DB**：所有测试用 `:memory:` SQLite，无副作用，测试间无共享状态
- **Helper**：`buildApp()` 构造独立的 Fastify 实例 + 内存数据库
- **运行**：

  ```bash
  npm test                                          # 全部
  npx vitest run server/__tests__/e2e.test.ts       # 单文件
  npx vitest run -t "search across layers"          # 单 case
  npm run test:watch                                # watch
  ```

**TDD 建议**：加新 route 时先写测试（happy path + 1 个边界），再写实现。

---

## 6. 提交流程

1. **代码改完先验证**：`lint → typecheck → test`，全绿才提交。
2. **约定式提交**：`feat:` / `fix:` / `refactor:` / `docs:` / `test:` / `chore:`。中文 body 可以，subject 用英文短句。
3. **不要主动 commit**：除非用户明确要求。默认行为是改完文件**等待用户确认**。
4. **不要碰 `main`**：`main` 仅含 LICENSE，开发都在 `dev` 上。新功能从 `dev` 切 feature 分支。
5. **Push Scope**：`AGENTS.md` 的 “Push Scope (dev branch)” 节列出不该推的文件（已在 `.gitignore` 处理），新增大文件前先确认。

---

## 7. RFC / Spec 流程

新功能走 RFC，目录：`docs/specs/rfc-XXX-shortname/`

| 文件 | 作用 |
|------|------|
| `proposal.md` | 问题、动机、初步方案 |
| `delta-design.md` | 与现状的 diff（架构、API、数据模型） |
| `delta-spec.md` | 实现细节：精确到字段、状态机、错误码 |
| `tasks.md` | 拆成可独立提交的 task 清单 |

执行时：用 `subagent-driven-development` skill 把 tasks 派给子 agent，每个 task 独立验证。

---

## 8. 关键文件速查

| 文件 | 作用 |
|------|------|
| `AGENTS.md` | Agent 速查表（命令、约束、API 表、ID 模式） |
| `README.md` | 项目介绍、安装、快速上手 |
| `src/server/index.ts` | Fastify 入口，路由注册 |
| `src/server/db/schema.ts` | 全部 DDL（表 + FTS5 + 触发器） |
| `src/server/types.ts` | 服务端共享 TS 类型 |
| `src/web/src/api.ts` | 前端 TS 类型（与 server/types.ts 同步） |
| `src/clients/api-client.ts` | 统一 HTTP 客户端 |
| `src/server/services/pipeline/registry.ts` | Pipeline 阶段注册表 |
| `src/server/services/pipeline/scheduler.ts` | cron 调度器 |
| `src/server/services/pipeline/bootstrap.ts` | 默认过滤规则种子 |
| `src/eslint.config.js` | ESLint v10 flat config（当前较宽松，可逐步收紧） |

---

## 9. 完整任务示例：加一个新的 episodic_type

> 演示一次“扩展数据模型”的完整流程，新人走一遍就能上手。

1. **写 RFC**：`docs/specs/rfc-XXX-new-type/proposal.md`
2. **服务端类型**：`src/server/types.ts` 加白名单值
3. **DB 不用改**（`episodic_type` 列接受任意字符串，靠应用层校验）
4. **目录创建**：`src/memory/episodic/<new_type>/.gitkeep`
5. **前端类型**：`src/web/src/api.ts` 同步白名单
6. **前端 UI**：`src/web/src/components/memory/EpisodicToolbar.tsx` 加筛选项
7. **测试**：`src/server/routes/__tests__/episodic.test.ts` 加用例
8. **更新 `AGENTS.md`**：在 “Key Constraints” 节的 `episodic_type` 行追加新值
9. **验证**：`npm run lint && npm run typecheck && npm test`
10. **提交**：`git add . && git commit -m "feat: add <new_type> episodic memory type"`

---

## 10. 参考资料

- **GitHub**：https://github.com/HakuCasey/memo-palace（dev 分支）
- **OpenCode 文档**：https://opencode.ai/docs/
- **MCP 协议**：https://modelcontextprotocol.io/
- **Fastify**：https://fastify.dev/
- **better-sqlite3**：https://github.com/WiseLibs/better-sqlite3
- **Vitest**：https://vitest.dev/
