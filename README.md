# 今天吃什么 - 投票系统

一个帮助团队/朋友快速决策午餐的投票应用，基于 Supabase + React 构建。

## 项目概述

这是一个美食投票应用，用户可以：
- 📍 查看附近的餐厅（基于地理位置）
- 🗳️ 创建投票房间，选择候选餐厅
- 🤝 邀请他人投票，实时查看结果
- 📊 根据投票结果决定去哪里吃

## 技术栈

### 后端
- **Supabase**: PostgreSQL 数据库 + 实时订阅 + 认证
- **PostGIS**: 地理位置查询和距离计算
- **SQL**: 数据库结构和函数定义

### 前端
- **React 18**: UI 框架
- **TypeScript**: 类型安全
- **Vite**: 构建工具
- **Tailwind CSS**: 样式框架
- **Supabase JS Client**: 与后端交互

## 数据库结构

### 1. shops 表 - 餐厅信息
```sql
CREATE TABLE shops (
    id BIGINT PRIMARY KEY,
    gaode_id TEXT UNIQUE,              -- 高德地图 ID
    name TEXT NOT NULL,                -- 餐厅名称
    location GEOGRAPHY(POINT, 4326),   -- 地理位置（经纬度）
    rating NUMERIC DEFAULT 0,          -- 评分 (0-5)
    avg_price NUMERIC,                 -- 人均价格
    tag TEXT,                          -- 标签 (如 "川菜;火锅")
    logo TEXT,                         -- 图片 URL
    deepinfo JSONB                     -- 额外详情（营业时间等）
);
```

**索引**: `location` 字段有 PostGIS 地理索引，用于高效的空间查询

### 2. vote_rooms 表 - 投票房间
```sql
CREATE TABLE vote_rooms (
    room_code TEXT PRIMARY KEY,        -- 房间号（如 "8848"）
    candidates JSONB NOT NULL,         -- 候选餐厅列表
    created_at TIMESTAMP WITH TIME ZONE
);
```

**candidates 字段结构**:
```json
[
  {
    "id": 1,
    "name": "麦当劳",
    "logo": "https://...",
    "vote_count": 0
  }
]
```

### 3. vote_records 表 - 投票记录
```sql
CREATE TABLE vote_records (
    id BIGINT PRIMARY KEY,
    room_code TEXT REFERENCES vote_rooms(room_code),
    shop_id BIGINT,                    -- 投给的餐厅 ID
    voter_id TEXT NOT NULL,            -- 投票人 ID（前端生成的 UUID）
    created_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(room_code, voter_id)        -- 每人每房间只能投一票
);
```

## 核心功能

### 1. 地理位置查询
使用 PostGIS 的 `get_nearby_shops` 函数：
```sql
SELECT * FROM get_nearby_shops(
    22.543,    -- 纬度
    113.937,   -- 经度
    2000,      -- 半径（米）
    50         -- 返回数量
);
```

### 2. 实时投票更新
通过 Supabase Realtime 监听 `vote_records` 表的变化：
```typescript
supabase
  .channel('room_votes')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'vote_records',
    filter: `room_code=eq.${roomCode}`
  }, (payload) => {
    // 实时更新投票结果
  })
  .subscribe()
```

### 3. 防刷票机制
- 前端生成 UUID 存储在 LocalStorage
- 数据库层面通过 `UNIQUE(room_code, voter_id)` 约束防止重复投票

## 前端数据流

### 当前状态（Mock DB）
```
App.tsx → mockDb.ts → localStorage
```

### 目标状态（Supabase）
```
App.tsx → supabaseClient.ts → Supabase API → PostgreSQL
```

## 需要的前端改动

### 1. 安装依赖
```bash
npm install @supabase/supabase-js
```

### 2. 环境变量配置
在 `.env.local` 中添加：
```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3. 创建 Supabase 客户端
创建 `frontend/services/supabaseClient.ts`：
```typescript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

### 4. 替换 API 调用
将 `frontend/services/mockDb.ts` 替换为 `supabaseApi.ts`，包含：

| 功能 | Mock DB | Supabase |
|------|---------|----------|
| 获取附近餐厅 | 返回静态数组 | 调用 `get_nearby_shops()` 函数 |
| 创建房间 | 写入 localStorage | `insert('vote_rooms')` |
| 获取房间 | 读取 localStorage | `select('vote_rooms')` |
| 投票 | 更新 localStorage | `insert('vote_records')` |
| 实时更新 | 轮询 | Realtime subscription |

### 5. 数据类型调整
修改 `frontend/types.ts`：
```typescript
// 调整前
export interface Shop {
  id: string;
  location: { lat: number; lng: number };
  tags: string[];
}

// 调整后（匹配数据库）
export interface Shop {
  id: number;              // BIGINT
  location?: {             // 可选，因为从数据库返回时不包含
    lat: number;
    lng: number;
  };
  tag: string;             // TEXT (如 "川菜;火锅")
  logo: string;            // 改名自 image_url
}
```

## 项目结构

```
food/
├── sql/                       # 数据库脚本（Supabase SQL Editor 执行）
│   ├── init.sql               # 初始化/修复一体脚本（推荐执行这个）
│   └── legacy/                # 历史脚本存档（不建议新项目直接执行）
├── data/                      # 餐厅数据（如需要导入）
├── frontend/
│   ├── App.tsx               # 主应用
│   ├── types.ts              # TypeScript 类型定义
│   ├── services/
│   │   ├── mockDb.ts         # 当前：Mock 数据服务
│   │   └── supabaseClient.ts # 新增：Supabase 客户端
│   └── components/
│       └── ShopCard.tsx      # 餐厅卡片组件
└── README.md                 # 本文档
```

## 下一步行动

### 阶段 1：数据库准备
- [ ] 在 Supabase 创建项目
- [ ] 执行 `sql/init.sql` 创建表/函数/RLS
- [ ] 导入餐厅数据（从 `data/` 目录或 API）
- [ ] 获取 Supabase URL 和 Anon Key

### 阶段 2：前端改造
- [ ] 安装 `@supabase/supabase-js`
- [ ] 创建 `supabaseClient.ts`
- [ ] 创建 `supabaseApi.ts` 替换 `mockDb.ts`
- [ ] 更新 `types.ts` 匹配数据库结构
- [ ] 在 `App.tsx` 中替换 API 调用

### 阶段 3：测试和优化
- [ ] 测试地理位置查询
- [ ] 测试投票创建和投票流程
- [ ] 测试实时更新功能
- [ ] 添加错误处理和加载状态

## 数据导入

### 方案 A：从高德地图 API
1. 使用高德地图 "搜索周边" API
2. 将结果转换为 shops 表格式
3. 使用脚本批量导入（推荐）：`python3 data/import_shops_to_supabase.py --input source.json`
   - 需要 `SUPABASE_SERVICE_ROLE_KEY`（或 `SUPABASE_KEY`）用于写入；`VITE_SUPABASE_URL` 会从 `frontend/.env.local` 自动读取
   - 先试跑：`python3 data/import_shops_to_supabase.py --input source.json --dry-run`
4. 或使用 Supabase Dashboard / CLI 批量导入

### 方案 B：手动导入
```sql
INSERT INTO shops (name, location, rating, avg_price, tag, logo)
VALUES
  ('麦当劳', ST_Point(113.937, 22.543)::geography, 4.5, 35, '快餐;汉堡', 'https://...'),
  ('海底捞', ST_Point(113.938, 22.544)::geography, 4.9, 120, '火锅', 'https://...');
```

## 部署

### 前端部署
```bash
cd frontend
npm run build
# 将 dist/ 目录部署到 Vercel/Netlify
```

### 环境变量
在部署平台设置：
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## 安全建议

当前 RLS 策略为 MVP 阶段的宽松策略。生产环境建议：

1. **启用 Supabase Auth**：用户需要登录才能投票
2. **限制创建房间频率**：防止滥用
3. **添加房间过期机制**：自动删除超过 24 小时的房间
4. **限制投票范围**：只允许同 IP/地理位置的用户投票

## 常见问题

**Q: 为什么 candidates 用 JSONB 而不是关联表？**
A: 为了简化查询，避免多表 JOIN。候选餐厅是快照，不需要频繁更新。

**Q: voter_id 为什么用前端生成而不是用户登录？**
A: MVP 阶段简化流程，避免强制登录。生产环境建议改用 Supabase Auth。

**Q: 如何处理数据库中的 GEOGRAPHY 类型？**
A: Supabase 会自动转换，查询时返回 `{ lat, lng }` 格式。

## License

MIT
