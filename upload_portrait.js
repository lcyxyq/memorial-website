/**
 * 上传遗像到 Supabase Storage 并写入 photos 表（置顶记录）
 */
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://avxhoefkilkvsimiitaf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2eGhvZWZraWxrdnNpbWlpdGFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1NjUyODcsImV4cCI6MjA5NzE0MTI4N30.PWlRkfR1uWOmE11bQi5jPIS3jvk8G115rtdGruMCmn0';

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

async function uploadPortrait() {
    const filePath = path.join(__dirname, 'portrait.jpg');
    const fileBuffer = fs.readFileSync(filePath);
    const storagePath = `memorial/portrait_${Date.now()}.jpg`;

    console.log('正在上传遗像...');
    const { error: uploadErr } = await sb.storage
        .from('photos')
        .upload(storagePath, fileBuffer, { contentType: 'image/jpeg', upsert: false });

    if (uploadErr) { console.error('上传失败:', uploadErr.message); process.exit(1); }

    const { data: urlData } = sb.storage.from('photos').getPublicUrl(storagePath);
    const photoUrl = urlData.publicUrl;
    console.log('上传成功，公开URL:', photoUrl);

    const { data, error } = await sb.from('photos').insert([{
        name: '家屬',
        relation: '家人',
        message: '願父親在天之靈安息，我們永遠愛您、懷念您。',
        photo_desc: '顯考李公諱宗文老先生遺像 — 民國四十二年二月十九日至民國一百一十四年六月十一日，享壽七十二歲。',
        photo_url: photoUrl,
        storage_path: storagePath
    }]).select().single();

    if (error) { console.error('寫入記錄失敗:', error.message); process.exit(1); }
    console.log('照片記錄寫入成功，id:', data.id);
}

uploadPortrait().catch(console.error);
