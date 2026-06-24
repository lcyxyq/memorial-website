-- 在 Supabase SQL Editor 中執行此腳本
-- 為 photos 表新增 attendance 欄位
-- 用於記錄訪客是否親臨告別式

ALTER TABLE photos ADD COLUMN IF NOT EXISTS attendance TEXT DEFAULT '';

-- 驗證欄位是否已新增
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'photos';
