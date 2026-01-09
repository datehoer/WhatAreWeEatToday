import sqlite3
import psycopg2
from psycopg2.extras import execute_values
import json
import re # 引入正则处理逗号
import os
# ================= 配置区域 =================
# 1. 你的本地 SQLite 文件路径
SQLITE_PATH = 'shops.sqlite3' 

# 2. Supabase 数据库连接字符串 (URI)
# 注意：确保 deepinfo 列在 Supabase 里已经是 JSONB 类型
SUPABASE_URL = os.getenv("SUPABASE_URI", "")
# ===========================================

def update_deepinfo_only():
    # --- 1. 连接 SQLite ---
    print("正在连接 SQLite...")
    try:
        sqlite_conn = sqlite3.connect(SQLITE_PATH)
        sqlite_cursor = sqlite_conn.cursor()
    except Exception as e:
        print(f"SQLite 连接失败: {e}")
        return

    # 只读取 gaode_id 和 deepinfo，因为我们要根据 ID 更新内容
    print("正在读取 SQLite 数据...")
    sqlite_cursor.execute("SELECT gaode_id, deepinfo FROM shops")
    sqlite_rows = sqlite_cursor.fetchall()
    print(f"读取到 {len(sqlite_rows)} 条数据。")

    # --- 2. 数据清洗 (字符串 -> JSON Array) ---
    print("正在清洗 deepinfo 格式...")
    update_data = []
    
    for row in sqlite_rows:
        (gaode_id, deepinfo) = row
        
        final_deepinfo_str = '[]' # 默认空数组

        if deepinfo:
            # 情况 A: 已经是 JSON 字符串 (以 [ 或 { 开头)
            if isinstance(deepinfo, str) and (deepinfo.strip().startswith('[') or deepinfo.strip().startswith('{')):
                # 尝试验证一下格式
                try:
                    json.loads(deepinfo)
                    final_deepinfo_str = deepinfo
                except:
                    # 解析失败，当作普通字符串处理
                    final_deepinfo_str = json.dumps([deepinfo], ensure_ascii=False)
            
            # 情况 B: 是逗号分隔的字符串 (例如: "排骨,米饭, 汤")
            else:
                # 使用正则同时支持 中文逗号(，) 和 英文逗号(,) 分割
                # 并且过滤掉空的项
                items = [x.strip() for x in re.split(r'[,，]', str(deepinfo)) if x.strip()]
                
                if items:
                    # 转成 JSON 数组字符串，ensure_ascii=False 保证中文显示正常
                    final_deepinfo_str = json.dumps(items, ensure_ascii=False)
                else:
                    final_deepinfo_str = '[]'
        
        # 将准备好的数据加入列表： (gaode_id, deepinfo_json_string)
        update_data.append((gaode_id, final_deepinfo_str))

    # --- 3. 连接 Supabase ---
    print("正在连接 Supabase...")
    try:
        pg_conn = psycopg2.connect(SUPABASE_URL)
        pg_cursor = pg_conn.cursor()
    except Exception as e:
        print(f"Supabase 连接失败: {e}")
        return

    # --- 4. 批量更新 (Bulk Update) ---
    print(f"准备更新 {len(update_data)} 条数据的 deepinfo...")
    
    # 这是一个非常高效的批量更新 SQL
    # 逻辑：创建一个临时的数据表 (VALUES)，然后用它来更新主表 shops
    # ::jsonb 确保把我们的字符串强转为 JSONB 类型
    update_query = """
        UPDATE shops AS s
        SET deepinfo = v.new_deepinfo::jsonb
        FROM (VALUES %s) AS v(gaode_id, new_deepinfo)
        WHERE s.gaode_id = v.gaode_id;
    """
    
    try:
        execute_values(
            pg_cursor,
            update_query,
            update_data,
            template=None, # 这里不需要额外 template，直接用元组
            page_size=1000
        )
        pg_conn.commit()
        print("✅ 更新成功！Deepinfo 已修复为 JSON 数组格式。")
        
    except Exception as e:
        pg_conn.rollback()
        print(f"❌ 更新失败: {e}")
        
    finally:
        sqlite_conn.close()
        pg_conn.close()

if __name__ == "__main__":
    update_deepinfo_only()