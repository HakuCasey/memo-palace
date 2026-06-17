# MemoPalace 排障指南

## 1. 启动报错 `no such column: episodic_type`

**现象**：`npm run dev:server` 启动失败，报 SQLite 错误 `no such column: episodic_type`

**原因**：旧版 `memopalace.db` 文件中的表结构不含 `episodic_type` / `semantic_type` 列，`CREATE TABLE IF NOT EXISTS` 不会给已存在的表添加新列。通常是因为之前的 `tsx watch` 进程未优雅退出 —— Windows 下 `tsx watch` 会派生多个子 node 进程，Ctrl+C 有时无法清理全部子进程，仍在占用 db 文件锁。

**两个易踩的坑**：
1. **不止一个 node 进程**：端口可能已释放，但子进程仍持有 db 文件锁。需查所有 node 进程并按启动时间筛选。
2. **PowerShell 通配符**：`Remove-Item -LiteralPath "memopalace.db*"` 中的 `*` 不会被展开（`-LiteralPath` 把字符串当字面量）。必须用 `-Path` 或显式列出所有文件。

**解决**：

```powershell
# 1. 列出所有 node 进程，按启动时间排序
Get-Process node -ErrorAction SilentlyContinue |
    Select-Object Id, StartTime, @{n='WS(MB)';e={[math]::Round($_.WorkingSet64/1MB,1)}} |
    Sort-Object StartTime

# 2. 停掉早于今天的所有 node 进程（替换为实际 PID 列表）
Stop-Process -Id <PID1>, <PID2>, <PID3> -Force

# 3. 删除 db 文件（注意：用 -Path 显式列出，不要用 -LiteralPath 带 *）
Remove-Item -Path "memopalace.db", "memopalace.db-shm", "memopalace.db-wal" -Force

# 4. 重启
npm run dev:server
```

**预防**：退出终端前按 `Ctrl+C` 后再用 `Get-Process node` 确认无残留；或使用 `memo_start.bat` 一键脚本（自带清理逻辑）。

---

## 2. 测试不稳定失败（平行运行竞争条件）

**现象**：`npm test` 偶尔出现 procedural 相关测试失败，单独运行 `npx vitest run -t "procedural"` 却通过

**原因**：7 个测试文件共享 `memory/procedural/` 磁盘目录，vitest 默认平行运行测试文件导致文件竞争

**解决**：已修复（v0.1.0）— 每个测试文件使用 `fs.mkdtempSync()` 创建独立临时目录

**临时绕过**：
```bash
npx vitest run --fileParallelism false
```

---

## 3. Web Console 创建记忆报错

**现象**：在 Memory 页面创建 Semantic/Procedural 记忆时报 500 错误

**原因**：旧版 Web Console 前端未传 `semantic_type` / `procedural_type` 字段（已修复 v0.1.0）

---

## 4. `npm install` 后 node_modules 不完整

**现象**：`npm run dev:server` 报 `Cannot find module 'better-sqlite3'`

**原因**：项目有两个 `package.json`，需要分别在 `src/` 和 `src/web/` 下运行 `npm install`

**解决**：
```bash
cd src && npm install
cd web && npm install
```

---

## 5. 端口 5678 被占用

```powershell
# 查看占用
Get-NetTCPConnection -LocalPort 5678

# 换端口启动
$env:PORT=5679; npm run dev:server
```
