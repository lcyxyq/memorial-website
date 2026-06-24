"""
上传遗像到 Supabase Storage 并写入 photos 表（遗像置顶记录）
使用 requests 直接调用 Supabase REST API，无需 SDK
"""
import requests
import os
import json

SUPABASE_URL = "https://avxhoefkilkvsimiitaf.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2eGhvZWZraWxrdnNpbWlpdGFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1NjUyODcsImV4cCI6MjA5NzE0MTI4N30.PWlRkfR1uWOmE11bQi5jPIS3jvk8G115rtdGruMCmn0"

PORTRAIT_PATH = r"C:\Users\Administrator\WorkBuddy\2026-06-15-22-40-03\memorial-website\portrait.jpg"
STORAGE_PATH = "memorial/portrait_official.jpg"

HEADERS_AUTH = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}"
}

def upload_portrait():
    # 1. 上传到 Storage
    with open(PORTRAIT_PATH, "rb") as f:
        img_bytes = f.read()

    upload_url = f"{SUPABASE_URL}/storage/v1/object/photos/{STORAGE_PATH}"
    headers = {**HEADERS_AUTH, "Content-Type": "image/jpeg"}
    
    print("正在上传遗像到 Supabase Storage...")
    r = requests.post(upload_url, headers=headers, data=img_bytes)
    
    if r.status_code not in (200, 201):
        # 若已存在则用 PUT 更新
        r2 = requests.put(upload_url, headers=headers, data=img_bytes)
        if r2.status_code not in (200, 201):
            print(f"上传失败: {r2.status_code} {r2.text}")
            return
        print(f"已更新已有文件: {r2.status_code}")
    else:
        print(f"上传成功: {r.status_code}")

    # 2. 获取公开 URL
    public_url = f"{SUPABASE_URL}/storage/v1/object/public/photos/{STORAGE_PATH}"
    print(f"公开URL: {public_url}")

    # 3. 检查是否已有该 storage_path 的记录
    check_url = f"{SUPABASE_URL}/rest/v1/photos?storage_path=eq.{STORAGE_PATH}&select=id"
    headers_json = {**HEADERS_AUTH, "Content-Type": "application/json"}
    rc = requests.get(check_url, headers=headers_json)
    existing = rc.json() if rc.status_code == 200 else []
    
    if existing:
        print(f"记录已存在，id={existing[0]['id']}，跳过写入")
        return

    # 4. 写入 photos 表
    insert_url = f"{SUPABASE_URL}/rest/v1/photos"
    payload = {
        "name": "家屬",
        "relation": "家人",
        "message": "願父親在天之靈安息，我們永遠愛您、懷念您。",
        "photo_desc": "顯考李公諱宗文老先生遺像 — 民國四十二年二月十九日至民國一百一十四年六月十一日，享壽七十二歲。",
        "photo_url": public_url,
        "storage_path": STORAGE_PATH
    }
    
    ri = requests.post(insert_url, headers={**headers_json, "Prefer": "return=representation"},
                       json=payload)
    
    if ri.status_code in (200, 201):
        data = ri.json()
        rec_id = data[0]['id'] if isinstance(data, list) else data.get('id')
        print(f"记录写入成功，id={rec_id}")
    else:
        print(f"写入失败: {ri.status_code} {ri.text}")

if __name__ == "__main__":
    upload_portrait()
