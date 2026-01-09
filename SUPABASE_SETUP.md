# Supabase 迁移完成指南

## ✅ 已完成的改动

### 1. 安装依赖
- ✅ 安装了 `@supabase/supabase-js@2.90.0`

### 2. 创建的文件
- ✅ `frontend/services/supabaseClient.ts` - Supabase 客户端初始化
- ✅ `frontend/services/supabaseApi.ts` - API 服务层（替换 mockDb）
- ✅ `frontend/.env.local` - 环境变量配置文件

### 3. 修改的文件
- ✅ `frontend/App.tsx` - 更新导入语句和实时订阅逻辑
- ✅ `frontend/types.ts` - 更新 Shop 接口注释

### 4. 功能升级
- ✅ **轮询 → 实时订阅**: 从每 2 秒轮询改为使用 Supabase Realtime
- ✅ **localStorage → PostgreSQL**: 数据存储从本地迁移到云端数据库

## 🔧 接下来需要做的事

### 步骤 1: 创建 Supabase 项目

1. 访问 [https://supabase.com](https://supabase.com)
2. 创建新项目（选择免费的即可）
3. 记录以下信息：
   - Project URL
   - anon public key

### 步骤 2: 配置数据库

在 Supabase Dashboard 中：

1. 打开 **SQL Editor**
2. 执行项目根目录的 `sql.sql` 文件中的所有 SQL
   - 如果你之前已经执行过 `sql.sql`，但发现“解散房间”不生效，请再单独执行一次 `vote_rooms_update_policy.sql`（补齐 `vote_rooms` 的 UPDATE RLS 策略）
3. 确认看到以下输出：
   - ✅ Extension `postgis` 已安装
   - ✅ 3 个表已创建：`shops`, `vote_rooms`, `vote_records`
   - ✅ 函数 `get_nearby_shops` 已创建
   - ✅ Realtime 已启用

### 步骤 3: 导入餐厅数据（可选）

**选项 A: 手动插入测试数据**

在 SQL Editor 中执行：
```sql
INSERT INTO shops (name, location, rating, avg_price, tag, logo)
VALUES
  ('麦当劳 (科兴店)', ST_Point(113.937, 22.543)::geography, 4.5, 35, '快餐;汉堡', 'https://picsum.photos/200/200?random=1'),
  ('海底捞火锅 (科兴店)', ST_Point(113.938, 22.544)::geography, 4.9, 120, '火锅;服务好', 'https://picsum.photos/200/200?random=2'),
  ('太二酸菜鱼', ST_Point(113.936, 22.542)::geography, 4.7, 80, '川菜;酸菜鱼', 'https://picsum.photos/200/200?random=3'),
  ('喜茶 (HEYTEA)', ST_Point(113.935, 22.543)::geography, 4.8, 25, '奶茶;甜品', 'https://picsum.photos/200/200?random=4'),
  ('沙县小吃', ST_Point(113.939, 22.545)::geography, 3.8, 18, '快餐;小吃', 'https://picsum.photos/200/200?random=5');
```

**选项 B: 从高德地图 API 批量导入**

参考 README.md 中的"数据导入"章节。

### 步骤 4: 配置环境变量

编辑 `frontend/.env.local`，填入你的 Supabase 信息：

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### 步骤 5: 启动应用

```bash
cd frontend
pnpm install  # 如果还没安装依赖
pnpm run dev
```

应用将在 `http://localhost:5173` 启动。

## 🔐 登录/注册（Supabase Auth）

前端已在“我的”页集成 Supabase 邮箱+密码登录/注册。

在 Supabase Dashboard 中建议确认：
- Authentication → Providers → Email：开启 Email provider
- Authentication → Settings：关闭邮箱确认（Confirm email），这样注册后可直接登录/获取 session

另外本项目已去掉匿名访问（RLS 仅允许登录用户访问数据），并增加了“邮箱后缀白名单”：
- 前端：通过 `VITE_ALLOWED_EMAIL_SUFFIX` 限制（见 `frontend/.env.local`）
- 数据库：`sql.sql` 中创建了 `allowed_email_suffixes` 表作为白名单（请把默认的 `@example.com` 改成你的后缀）

## 🧪 测试功能

### 1. 测试附近餐厅
- 打开主页
- 应该能看到从数据库加载的餐厅列表
- 餐厅应该按距离排序

### 2. 测试创建投票房间
- 进入"投票"标签页
- 选择 2-5 个餐厅
- 点击"发起投票"
- 应该生成房间号并跳转到房间页面

### 3. 测试投票功能
- 在房间页面点击某个餐厅进行投票
- 应该看到"投票成功"的提示
- 投票数应该实时更新

### 4. 测试实时更新
- 打开两个浏览器窗口，进入同一个房间
- 在一个窗口投票
- 另一个窗口应该立即看到更新（不需要刷新）

### 5. 测试防刷票
- 尝试在同一房间给不同餐厅投票
- 应该只保留最后一次投票（之前的投票被替换）

## 🐛 常见问题排查

### 问题 1: "Missing Supabase environment variables"
**解决**: 检查 `frontend/.env.local` 是否配置正确，确保有两个变量。

### 问题 2: "Error fetching nearby shops"
**解决**:
- 检查 Supabase SQL Editor 中是否执行了 `sql.sql`
- 确认 `shops` 表中有数据
- 检查 RLS 策略是否允许 SELECT

### 问题 3: 投票后没有实时更新
**解决**:
- 在 Supabase Dashboard → Database → Replication 中
- 确认 `vote_records` 表已启用 Realtime
- 检查浏览器控制台是否有 WebSocket 连接错误

### 问题 4: 投票时出现 "duplicate key value violates unique constraint"
**说明**: 这是正常的，说明防刷票机制在工作。

## 📊 数据库监控

在 Supabase Dashboard 中可以查看：

1. **Table Editor** - 查看所有表的数据
2. **SQL Editor** - 执行自定义查询
3. **Database → Logs** - 查看数据库操作日志
4. **Database → Metrics** - 查看性能指标

## 🚀 生产环境部署建议

### 1. 环境变量
在部署平台（Vercel/Netlify）设置：
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### 2. 安全加固
在 Supabase SQL Editor 中执行：
```sql
-- 限制创建房间频率（需要额外的表记录创建时间）
-- 添加房间过期机制
-- 启用 Supabase Auth 要求用户登录
```

### 3. 性能优化
- 为 `shops` 表添加更多索引（如按 tag、rating）
- 启用 Supabase Edge Functions 缓存
- 考虑使用 CDN 加速图片加载

## 📝 代码对比

### 之前（Mock DB）
```typescript
// 轮询房间数据
useEffect(() => {
  const interval = setInterval(async () => {
    const room = await api.getRoom(code);
    setRoomData(room);
  }, 2000);
  return () => clearInterval(interval);
}, [code]);
```

### 现在（Supabase Realtime）
```typescript
// 实时订阅房间数据
useEffect(() => {
  const unsubscribe = api.subscribeToRoomVotes(code, (room) => {
    setRoomData(room);
  });
  return () => unsubscribe();
}, [code]);
```

## 🎉 迁移完成！

现在你的应用已经完全迁移到 Supabase，享受：
- ✅ 真实的数据库存储
- ✅ 实时数据同步
- ✅ 更好的可扩展性
- ✅ 生产就绪的基础设施

有任何问题，参考主 README.md 或查看 Supabase 官方文档。
