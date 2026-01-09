## SQL 脚本说明

### 新项目（推荐）
- 直接执行：`sql/init.sql`
  - 包含：表结构、函数（RPC）、Realtime publication、RLS 策略、必要索引

### 已有项目（旧版本已执行过）
- 可以直接再次执行：`sql/init.sql`
  - `init.sql` 里对关键字段做了 `ADD COLUMN IF NOT EXISTS`，并对 RLS/函数做了 `CREATE OR REPLACE` / `DROP POLICY IF EXISTS`，适合“补齐/修复”。

### legacy
- `sql/legacy/` 保留了历史脚本，主要用于对照；不建议在新项目里直接执行。
