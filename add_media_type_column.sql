-- 新增 media_type 欄位，區分圖片和影片
-- 預設值 'image'，現有照片自動視為圖片
ALTER TABLE photos ADD COLUMN IF NOT EXISTS media_type TEXT DEFAULT 'image';
