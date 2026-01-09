import sqlite3
import psycopg2
from psycopg2.extras import execute_values
import json
import os
# ================= 配置区域 =================
# 1. 你的本地 SQLite 文件路径 (例如 'data.db')
SQLITE_PATH = 'shops.sqlite3' 

# 2. Supabase 数据库连接字符串 (URI)
# 记得替换密码，且保留双引号
SUPABASE_URL = os.getenv("SUPABASE_URI", "")
# ===========================================

def migrate_data():
    # --- 1. 连接 SQLite ---
    print("正在连接 SQLite...")
    try:
        sqlite_conn = sqlite3.connect(SQLITE_PATH)
        sqlite_cursor = sqlite_conn.cursor()
    except Exception as e:
        print(f"SQLite 连接失败: {e}")
        return

    # 读取数据
    # 注意：这里我们按顺序读取，方便后面处理
    print("正在读取 SQLite 数据...")
    sqlite_cursor.execute("""
        SELECT gaode_id, name, latitude, longitude, rating, avg_price, tag, logo, deepinfo
        FROM shops
    """)
    sqlite_rows = sqlite_cursor.fetchall()
    print(f"读取到 {len(sqlite_rows)} 条数据。")

    # --- 2. 数据清洗与格式化 ---
    print("正在清洗数据...")
    clean_data = []
    
    for row in sqlite_rows:
        (gaode_id, name, lat, lng, rating, avg_price, tag, logo, deepinfo) = row

        # 过滤无效坐标
        if lat is None or lng is None:
            continue
        
        # 处理 deepinfo (JSON)
        # 确保它是有效的 JSON 格式，如果 SQLite 里存的是空字符串，设为 None
        final_deepinfo = None
        if deepinfo:
            try:
                # 尝试解析一下，确保格式正确，然后再转回字符串传给 Postgres
                # 如果 deepinfo 本身已经是 dict 字符串，这步验证很重要
                if isinstance(deepinfo, str):
                    json.loads(deepinfo) # 验证 JSON 格式
                    final_deepinfo = deepinfo
                else:
                    final_deepinfo = json.dumps(deepinfo)
            except:
                final_deepinfo = '{}' # 格式错误时给个空对象

        # 整理成元组
        # 注意顺序要和下面的 SQL INSERT 对应
        # 这里的 lat/lng 会在 SQL template 里处理
        clean_data.append((
            gaode_id, name, lng, lat, rating, avg_price, tag, logo, final_deepinfo
        ))

    # --- 3. 连接 Supabase (PostgreSQL) ---
    print("正在连接 Supabase...")
    try:
        pg_conn = psycopg2.connect(SUPABASE_URL)
        pg_cursor = pg_conn.cursor()
    except Exception as e:
        print(f"Supabase 连接失败: {e}")
        return

    # --- 4. 批量插入 ---
    print("开始写入 Supabase (这可能需要几秒钟)...")
    
    insert_query = """
        INSERT INTO shops (
            gaode_id, name, location, rating, avg_price, tag, logo, deepinfo
        ) VALUES %s
        ON CONFLICT (gaode_id) DO NOTHING
    """
    
    # 使用 execute_values 进行高效批量插入
    # 关键点：ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography
    # ST_MakePoint 的参数顺序必须是 (经度 Longitude, 纬度 Latitude)
    # 所以下面 template 里的 %s 顺序对应 clean_data 里的 (..., lng, lat, ...)
    try:
        execute_values(
            pg_cursor,
            insert_query,
            clean_data,
            template="""
            (
                %s, %s, 
                ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography, 
                %s, %s, %s, %s, %s
            )
            """
        )
        pg_conn.commit()
        print("✅ 迁移成功！")
        
    except Exception as e:
        pg_conn.rollback()
        print(f"❌ 插入失败: {e}")
        
    finally:
        sqlite_conn.close()
        pg_conn.close()

if __name__ == "__main__":
    migrate_data()