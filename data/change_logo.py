import os
import requests
from supabase import create_client, Client
from tqdm import tqdm
from dotenv import load_dotenv
# 加载环境变量
load_dotenv()
# ================= 配置 =================
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "") 
# 注意：这里建议用 Service Role Key (在 Project Settings -> API 里找 service_role secret)
# 因为我们要批量修改数据库，Service Role 可以绕过 RLS 权限限制，更方便。

BUCKET_NAME = "shop-logos"
# =======================================

# 初始化客户端
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def migrate_logos():
    print("开始获取所有店铺...")
    # 1. 获取所有带有 logo 的店铺
    # 假设你的高德图片是以 http 开头的，我们只处理没迁移过的
    response = supabase.table("shops").select("id, gaode_id, logo").ilike("logo", "http%").filter("logo", "not.ilike", "%supabase.co%").execute()
    shops = response.data

    print(f"找到 {len(shops)} 个店铺需要迁移图片。")

    for shop in tqdm(shops):
        old_url = shop['logo']
        shop_id = shop['id']
        gaode_id = shop['gaode_id']

        if not old_url or "supabase.co" in old_url:
            print(f"跳过: {shop_id} 已经是新链接或为空")
            continue

        try:
            # 2. 下载图片
            print(f"正在处理: {shop['name'] if 'name' in shop else shop_id} ...")
            img_data = requests.get(old_url, timeout=10).content
            
            # 3. 上传到 Supabase Storage
            # 我们用 gaode_id 作为文件名，这样不会重复，而且好找。假设都是 jpg/png
            # 高德图片通常没有后缀，我们默认存为 .jpg 即可，浏览器能识别
            file_path = f"{gaode_id}.jpg"
            
            # upload 方法: bucket名字, 文件路径, 文件二进制数据, content-type
            supabase.storage.from_(BUCKET_NAME).upload(
                path=file_path,
                file=img_data,
                file_options={"content-type": "image/jpeg", "upsert": "true"}
            )

            # 4. 获取新的公开链接
            new_public_url = supabase.storage.from_(BUCKET_NAME).get_public_url(file_path)

            # 5. 更新数据库
            supabase.table("shops").update({"logo": new_public_url}).eq("id", shop_id).execute()
            
            print(f"✅ 成功! 新链接: {new_public_url}")

        except Exception as e:
            print(f"❌ 失败 {shop_id}: {e}")

if __name__ == "__main__":
    migrate_logos()