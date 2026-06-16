/**
 * 缅怀纪念网站 - 主逻辑（Supabase 版）
 * 后端：Supabase（国外免费 BaaS，GitHub 一键注册）
 */

// ========================================
// 数据管理模块
// ========================================

class DataManager {
    constructor() {
        this.sb = supabaseClient;
    }

    // ── 照片 ──

    async getAllPhotos(skip = 0, limit = 20) {
        const { data, error } = await this.sb
            .from('photos')
            .select('*, comments(count)')
            .order('created_at', { ascending: false })
            .range(skip, skip + limit - 1);
        if (error) throw error;
        return data.map(this._photoRow);
    }

    async getPhotoCount() {
        const { count, error } = await this.sb
            .from('photos')
            .select('*', { count: 'exact', head: true });
        if (error) throw error;
        return count;
    }

    async getPhotoById(id) {
        const { data, error } = await this.sb
            .from('photos')
            .select('*, comments(count)')
            .eq('id', id)
            .single();
        if (error) throw error;
        return this._photoRow(data);
    }

    async getPhotosByComments(skip = 0, limit = 20) {
        // 先查所有照片的留言数再排序（Supabase 没有 join count sort，用 RPC 或两步）
        const { data, error } = await this.sb
            .from('photos')
            .select('*, comments(count)')
            .order('created_at', { ascending: false });
        if (error) throw error;
        const sorted = data
            .map(this._photoRow)
            .sort((a, b) => (b.commentCount || 0) - (a.commentCount || 0));
        return sorted.slice(skip, skip + limit);
    }

    async addPhoto(photoData, imageFile) {
        // 1. 压缩图片
        const blob = await compressImage(imageFile, 1200, 0.85);
        const ext = imageFile.name.split('.').pop() || 'jpg';
        const filePath = `memorial/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

        // 2. 上传到 Supabase Storage
        const { error: uploadErr } = await this.sb
            .storage
            .from('photos')
            .upload(filePath, blob, { contentType: 'image/jpeg', upsert: false });
        if (uploadErr) throw uploadErr;

        // 3. 获取公开 URL
        const { data: urlData } = this.sb.storage.from('photos').getPublicUrl(filePath);
        const photoUrl = urlData.publicUrl;

        // 4. 写入 photos 表
        const { data, error } = await this.sb
            .from('photos')
            .insert([{
                name: photoData.name,
                relation: photoData.relation || '',
                message: photoData.message || '',
                photo_desc: photoData.photoDesc || '',
                photo_url: photoUrl,
                storage_path: filePath
            }])
            .select()
            .single();
        if (error) throw error;
        return this._photoRow(data);
    }

    async addMultiplePhotos(photoData, imageFiles, onProgress) {
        const results = [];
        for (let i = 0; i < imageFiles.length; i++) {
            if (onProgress) onProgress(i + 1, imageFiles.length);
            const r = await this.addPhoto(photoData, imageFiles[i]);
            results.push(r);
        }
        return results;
    }

    async updatePhoto(id, updates) {
        const { data, error } = await this.sb
            .from('photos')
            .update({
                name: updates.name,
                relation: updates.relation || '',
                message: updates.message || '',
                photo_desc: updates.photoDesc || ''
            })
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return this._photoRow(data);
    }

    async deletePhoto(id) {
        // 1. 先查出 storage_path
        const { data: photo, error: findErr } = await this.sb
            .from('photos')
            .select('storage_path')
            .eq('id', id)
            .single();
        if (findErr) throw findErr;

        // 2. 删除存储文件
        if (photo && photo.storage_path) {
            await this.sb.storage.from('photos').remove([photo.storage_path]);
        }

        // 3. 删除关联留言
        await this.sb.from('comments').delete().eq('photo_id', id);

        // 4. 删除照片记录
        const { error } = await this.sb.from('photos').delete().eq('id', id);
        if (error) throw error;
    }

    // ── 留言 ──

    async addComment(photoId, commentData) {
        const { data, error } = await this.sb
            .from('comments')
            .insert([{
                photo_id: photoId,
                name: commentData.name,
                text: commentData.text
            }])
            .select()
            .single();
        if (error) throw error;
        return {
            id: data.id,
            name: data.name,
            text: data.text,
            timestamp: data.created_at
        };
    }

    async getComments(photoId) {
        const { data, error } = await this.sb
            .from('comments')
            .select('*')
            .eq('photo_id', photoId)
            .order('created_at', { ascending: true });
        if (error) throw error;
        return data.map(c => ({
            id: c.id,
            name: c.name,
            text: c.text,
            timestamp: c.created_at
        }));
    }

    // ── 辅助 ──

    _photoRow(row) {
        const commentCount = row.comments
            ? (Array.isArray(row.comments) ? row.comments.length : (row.comments[0]?.count ?? 0))
            : 0;
        return {
            id: row.id,
            name: row.name || '',
            relation: row.relation || '',
            message: row.message || '',
            photoDesc: row.photo_desc || '',
            photoUrl: row.photo_url || '',
            commentCount,
            timestamp: row.created_at
        };
    }
}

const dataManager = new DataManager();

// ========================================
// 图片压缩
// ========================================

function compressImage(file, maxWidth = 800, quality = 0.8) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let w = img.width, h = img.height;
                if (w > maxWidth) { h = (h * maxWidth) / w; w = maxWidth; }
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                canvas.toBlob(blob => resolve(blob), 'image/jpeg', quality);
            };
            img.onerror = reject;
        };
        reader.onerror = reject;
    });
}

// ========================================
// 照片墙
// ========================================

class PhotoWall {
    constructor() {
        this.container = document.getElementById('photoWall');
        this.loadMoreBtn = document.getElementById('loadMore');
        this.pageSize = 20;
        this.skip = 0;
        this.allPhotos = [];
        this.loading = false;
        this.filter = 'all';

        if (this.loadMoreBtn) {
            this.loadMoreBtn.addEventListener('click', () => this.loadMore());
        }
        this.init();
    }

    async init() { await this.load(); }

    async load() {
        if (!this.container || this.loading) return;
        this.loading = true;
        try {
            let photos;
            if (this.filter === 'most-comments') {
                photos = await dataManager.getPhotosByComments(this.skip, this.pageSize);
            } else {
                photos = await dataManager.getAllPhotos(this.skip, this.pageSize);
            }
            this.allPhotos = this.allPhotos.concat(photos);
            this.render();

            const total = await dataManager.getPhotoCount();
            if (this.loadMoreBtn) {
                this.loadMoreBtn.style.display = this.allPhotos.length >= total ? 'none' : 'block';
            }
        } catch (err) {
            console.error('加载失败:', err);
            this.container.innerHTML = `
                <div class="no-photos" style="text-align:center;padding:3rem;">
                    <i class="fas fa-exclamation-triangle" style="font-size:3rem;opacity:.3;color:#e74c3c;margin-bottom:1rem;"></i>
                    <h3 style="opacity:.7;">加载失败</h3>
                    <p style="opacity:.5;margin-top:.5rem;">请检查 Supabase 配置</p>
                    <button onclick="location.reload()" style="margin-top:1rem;padding:.8rem 2rem;background:var(--accent-color);color:#fff;border:none;border-radius:25px;cursor:pointer;">重新加载</button>
                </div>`;
        } finally {
            this.loading = false;
        }
    }

    render() {
        if (!this.container) return;
        this.container.innerHTML = '';

        if (!this.allPhotos.length) {
            this.container.innerHTML = `
                <div class="no-photos" style="text-align:center;padding:3rem;">
                    <i class="fas fa-images" style="font-size:4rem;opacity:.3;margin-bottom:1rem;"></i>
                    <h3 style="opacity:.7;">还没有回忆分享</h3>
                    <p style="opacity:.5;margin-top:.5rem;">成为第一个分享回忆的人吧</p>
                    <a href="register.html" style="display:inline-block;margin-top:1rem;padding:.8rem 2rem;background:var(--accent-color);color:#fff;text-decoration:none;border-radius:25px;">立即分享</a>
                </div>`;
            return;
        }
        this.allPhotos.forEach(p => this.container.appendChild(this._card(p)));
    }

    _card(photo) {
        const el = document.createElement('div');
        el.className = 'photo-card';
        const timeAgo = this._timeAgo(photo.timestamp);
        const name = esc(photo.name);
        el.innerHTML = `
            <img src="${photo.photoUrl}" alt="${name}" loading="lazy"
                 onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iIzJjM2U1MCIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBkeT0iLjNlbSIgZmlsbD0iI2VjZjBmMSIgZm9udC1mYW1pbHk9InNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMjAiIHRleHQtYW5jaG9yPSJtaWRkbGUiPuWbvueJh+WKoOi9veWksei0pTwvdGV4dD48L3N2Zz4='">
            <div class="photo-info">
                <h4><i class="fas fa-user"></i> ${name}</h4>
                ${photo.relation ? `<p><i class="fas fa-heart"></i> ${esc(photo.relation)}</p>` : ''}
                ${photo.photoDesc ? `<p class="photo-desc-preview"><i class="fas fa-image"></i> ${esc(photo.photoDesc).slice(0,60)}${photo.photoDesc.length>60?'...':''}</p>` : ''}
                ${photo.message ? `<p class="photo-message">${esc(photo.message).slice(0,50)}${photo.message.length>50?'...':''}</p>` : ''}
                <div class="photo-meta">
                    <span><i class="far fa-clock"></i> ${timeAgo}</span>
                    <span><i class="far fa-comment"></i> ${photo.commentCount||0} 条留言</span>
                </div>
                <button class="btn-comment"><i class="far fa-comment"></i> 留言</button>
            </div>`;
        // 图片点击打开详情弹窗
        el.querySelector('img').addEventListener('click', () => openDetailModal(photo.id));
        el.querySelector('.btn-comment').addEventListener('click', () => openCommentModal(photo.id));
        return el;
    }

    _timeAgo(ts) {
        if (!ts) return '';
        const diff = Math.floor((Date.now() - new Date(ts)) / 1000);
        if (diff < 60) return '刚刚';
        if (diff < 3600) return `${Math.floor(diff/60)} 分钟前`;
        if (diff < 86400) return `${Math.floor(diff/3600)} 小时前`;
        if (diff < 604800) return `${Math.floor(diff/86400)} 天前`;
        return new Date(ts).toLocaleDateString('zh-CN');
    }

    loadMore() { this.skip += this.pageSize; this.load(); }

    async refresh() { this.allPhotos = []; this.skip = 0; await this.load(); }

    async setFilter(f) { this.filter = f; this.allPhotos = []; this.skip = 0; await this.load(); }
}

function esc(t) { if (!t) return ''; const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

// ========================================
// 照片详情弹窗
// ========================================

let currentDetailPhotoId = null;

async function openDetailModal(photoId) {
    currentDetailPhotoId = photoId;
    const modal = document.getElementById('detailModal');
    const editWrap = document.getElementById('editFormWrap');
    const deleteWrap = document.getElementById('deleteConfirmWrap');

    // 重置状态
    editWrap.style.display = 'none';
    deleteWrap.style.display = 'none';

    try {
        const photo = await dataManager.getPhotoById(photoId);
        if (!photo) return;

        // 填充图片
        document.getElementById('detailPhotoImg').src = photo.photoUrl;
        document.getElementById('detailPhotoImg').onerror = function() { this.style.display = 'none'; };

        // 填充信息
        const timeStr = photo.timestamp ? new Date(photo.timestamp).toLocaleString('zh-CN') : '';
        document.getElementById('detailInfo').innerHTML = `
            <h4 class="detail-name"><i class="fas fa-user"></i> ${esc(photo.name)}</h4>
            ${photo.relation ? `<p class="detail-relation"><i class="fas fa-heart"></i> ${esc(photo.relation)}</p>` : ''}
            ${photo.photoDesc ? `<div class="detail-desc"><i class="fas fa-image"></i> <span>${esc(photo.photoDesc)}</span></div>` : ''}
            ${photo.message ? `<div class="detail-message"><i class="fas fa-comment"></i> <span>${esc(photo.message)}</span></div>` : ''}
            <div class="detail-meta">
                <span><i class="far fa-clock"></i> ${timeStr}</span>
                <span><i class="far fa-comment"></i> ${photo.commentCount || 0} 条留言</span>
            </div>`;

        modal.classList.add('active');
    } catch (e) { console.error(e); alert('加载照片详情失败'); }
}

function closeDetailModal() {
    document.getElementById('detailModal').classList.remove('active');
    currentDetailPhotoId = null;
}

// 编辑按钮
document.addEventListener('click', e => {
    if (e.target.closest('#btnEditPhoto')) {
        if (!currentDetailPhotoId) return;
        dataManager.getPhotoById(currentDetailPhotoId).then(photo => {
            if (!photo) return;
            document.getElementById('editName').value = photo.name || '';
            document.getElementById('editRelation').value = photo.relation || '';
            document.getElementById('editMessage').value = photo.message || '';
            document.getElementById('editPhotoDesc').value = photo.photoDesc || '';
            document.getElementById('editFormWrap').style.display = 'block';
            document.getElementById('deleteConfirmWrap').style.display = 'none';
        });
    }
});

// 取消编辑
document.addEventListener('click', e => {
    if (e.target.closest('#btnCancelEdit')) {
        document.getElementById('editFormWrap').style.display = 'none';
    }
});

// 保存编辑
document.addEventListener('submit', async e => {
    if (e.target.id !== 'editForm') return;
    e.preventDefault();
    if (!currentDetailPhotoId) return;

    const btn = e.target.querySelector('.btn-save');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 保存中...';

    try {
        await dataManager.updatePhoto(currentDetailPhotoId, {
            name: document.getElementById('editName').value.trim(),
            relation: document.getElementById('editRelation').value,
            message: document.getElementById('editMessage').value.trim(),
            photoDesc: document.getElementById('editPhotoDesc').value.trim()
        });
        document.getElementById('editFormWrap').style.display = 'none';
        // 刷新详情弹窗
        await openDetailModal(currentDetailPhotoId);
        // 刷新照片墙
        if (window.photoWall) await window.photoWall.refresh();
    } catch (err) {
        console.error(err);
        alert('保存失败：' + (err.message || '请重试'));
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check"></i> 保存';
    }
});

// 删除按钮
document.addEventListener('click', e => {
    if (e.target.closest('#btnDeletePhoto')) {
        document.getElementById('deleteConfirmWrap').style.display = 'block';
        document.getElementById('editFormWrap').style.display = 'none';
    }
});

// 取消删除
document.addEventListener('click', e => {
    if (e.target.closest('#btnCancelDelete')) {
        document.getElementById('deleteConfirmWrap').style.display = 'none';
    }
});

// 确认删除
document.addEventListener('click', async e => {
    if (e.target.closest('#btnConfirmDelete')) {
        const btn = e.target.closest('#btnConfirmDelete');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 删除中...';

        try {
            await dataManager.deletePhoto(currentDetailPhotoId);
            closeDetailModal();
            if (window.photoWall) await window.photoWall.refresh();
        } catch (err) {
            console.error(err);
            alert('删除失败：' + (err.message || '请重试'));
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-trash-alt"></i> 确认删除';
        }
    }
});

// 从详情弹窗打开留言
document.addEventListener('click', e => {
    if (e.target.closest('#btnOpenComment')) {
        closeDetailModal();
        if (currentDetailPhotoId) openCommentModal(currentDetailPhotoId);
    }
});

// 关闭详情弹窗
document.addEventListener('click', e => {
    if (e.target.closest('#closeDetailModal')) closeDetailModal();
});
document.addEventListener('click', e => {
    const modal = document.getElementById('detailModal');
    if (e.target === modal) closeDetailModal();
});

// ========================================
// 留言弹窗
// ========================================

let currentPhotoId = null;

async function openCommentModal(photoId) {
    currentPhotoId = photoId;
    const modal = document.getElementById('commentModal');
    try {
        const photo = await dataManager.getPhotoById(photoId);
        if (!photo) return;
        document.getElementById('modalPhotoPreview').innerHTML = `<img src="${photo.photoUrl}" alt="" onerror="this.style.display='none'">`;
        document.getElementById('commentsList').innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i></div>';
        modal.classList.add('active');
        await renderComments(photoId);
    } catch (e) { console.error(e); alert('加载失败'); }
}

function closeCommentModal() {
    document.getElementById('commentModal').classList.remove('active');
    currentPhotoId = null;
}

async function renderComments(photoId) {
    const list = document.getElementById('commentsList');
    try {
        const comments = await dataManager.getComments(photoId);
        if (!comments.length) { list.innerHTML = '<p style="text-align:center;opacity:.6;">还没有留言</p>'; return; }
        list.innerHTML = comments.map(c => `
            <div class="comment-item">
                <div class="comment-author"><i class="fas fa-user"></i> ${esc(c.name)}</div>
                <div class="comment-text">${esc(c.text)}</div>
                <div class="comment-time"><i class="far fa-clock"></i> ${new Date(c.timestamp).toLocaleString('zh-CN')}</div>
            </div>`).join('');
    } catch { list.innerHTML = '<p style="text-align:center;color:#e74c3c;">加载留言失败</p>'; }
}

// ========================================
// 上传表单
// ========================================

class UploadForm {
    constructor() {
        this.form = document.getElementById('registerForm');
        this.photoInput = document.getElementById('photoInput');
        this.uploadArea = document.getElementById('uploadArea');
        this.previewGrid = document.getElementById('previewGrid');
        this.files = [];
        if (!this.form) return;
        this._bind();
    }

    _bind() {
        // 点击上传
        this.uploadArea.addEventListener('click', () => this.photoInput.click());

        // 拖拽
        this.uploadArea.addEventListener('dragover', e => {
            e.preventDefault();
            this.uploadArea.style.borderColor = 'var(--accent-color)';
        });
        this.uploadArea.addEventListener('dragleave', () => {
            this.uploadArea.style.borderColor = 'var(--border-color)';
        });
        this.uploadArea.addEventListener('drop', e => {
            e.preventDefault();
            this.uploadArea.style.borderColor = 'var(--border-color)';
            const imgs = [...e.dataTransfer.files].filter(f => f.type.startsWith('image/'));
            this.files.push(...imgs);
            this._preview();
        });

        // 文件选择
        this.photoInput.addEventListener('change', e => {
            this.files.push(...e.target.files);
            this._preview();
        });

        // 提交
        this.form.addEventListener('submit', e => { e.preventDefault(); this._submit(); });
    }

    _preview() {
        this.previewGrid.innerHTML = '';
        this.files.forEach((f, i) => {
            const reader = new FileReader();
            reader.onload = e => {
                const d = document.createElement('div');
                d.className = 'preview-item';
                d.innerHTML = `<img src="${e.target.result}" alt="预览"><button type="button" class="remove-btn" data-i="${i}"><i class="fas fa-times"></i></button>`;
                this.previewGrid.appendChild(d);
                d.querySelector('.remove-btn').addEventListener('click', ev => {
                    ev.stopPropagation();
                    this.files.splice(parseInt(ev.target.closest('.remove-btn').dataset.i), 1);
                    this._preview();
                });
            };
            reader.readAsDataURL(f);
        });
    }

    async _submit() {
        if (!this.files.length) { alert('请至少上传一张照片'); return; }
        const name = document.getElementById('name').value.trim();
        if (!name) { alert('请填写姓名'); return; }

        const relation = document.getElementById('relation').value;
        const message = document.getElementById('message').value.trim();
        const photoDesc = document.getElementById('photoDesc').value.trim();

        const btn = document.getElementById('submitBtn');
        const bar = document.getElementById('uploadProgress');
        const fill = document.getElementById('progressFill');
        const txt = document.getElementById('progressText');

        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 上传中...';
        bar.style.display = 'block';
        fill.style.width = '0%';

        try {
            await dataManager.addMultiplePhotos(
                { name, relation, message, photoDesc },
                this.files,
                (cur, total) => {
                    fill.style.width = Math.round(cur / total * 100) + '%';
                    txt.textContent = `正在上传第 ${cur}/${total} 张照片...`;
                }
            );
            fill.style.width = '100%';
            txt.textContent = '上传完成！';
            setTimeout(() => {
                this.form.style.display = 'none';
                document.getElementById('successMessage').style.display = 'block';
            }, 500);
        } catch (err) {
            console.error(err);
            alert('上传失败：' + (err.message || '请重试'));
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-paper-plane"></i> 提交回忆';
            bar.style.display = 'none';
        }
    }
}

// ========================================
// 初始化
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    // 检查 Supabase 是否正确初始化
    if (typeof supabaseClient === 'undefined') {
        console.error('Supabase 客户端未初始化');
        console.log('window.supabase 类型:', typeof window.supabase);
        console.log('window.supabase 值:', window.supabase);
        const wall = document.getElementById('photoWall');
        const errMsg = `Supabase SDK 加载失败 (window.supabase 类型: ${typeof window.supabase})，请刷新页面重试`;
        if (wall) {
            wall.innerHTML = `
                <div class="no-photos" style="text-align:center;padding:3rem;">
                    <i class="fas fa-exclamation-triangle" style="font-size:3rem;opacity:.3;color:#e74c3c;margin-bottom:1rem;"></i>
                    <h3 style="opacity:.7;">系统初始化失败</h3>
                    <p style="opacity:.5;margin-top:.5rem;">${errMsg}</p>
                    <button onclick="location.reload()" style="margin-top:1rem;padding:.8rem 2rem;background:var(--accent-color);color:#fff;border:none;border-radius:25px;cursor:pointer;">重新加载</button>
                </div>`;
        }
        return;
    }

    if (document.getElementById('photoWall')) window.photoWall = new PhotoWall();
    if (document.getElementById('registerForm')) new UploadForm();

    // 筛选
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (window.photoWall) {
                const f = btn.dataset.filter;
                await window.photoWall.setFilter(f === 'recent' ? 'all' : f);
            }
        });
    });

    // 留言提交
    const commentForm = document.getElementById('commentForm');
    if (commentForm) {
        commentForm.addEventListener('submit', async e => {
            e.preventDefault();
            const name = document.getElementById('commentName').value.trim();
            const text = document.getElementById('commentText').value.trim();
            if (!name || !text) { alert('请填写完整信息'); return; }
            const btn = commentForm.querySelector('.btn-submit');
            btn.disabled = true; btn.textContent = '发送中...';
            try {
                await dataManager.addComment(currentPhotoId, { name, text });
                commentForm.reset();
                await renderComments(currentPhotoId);
                if (window.photoWall) await window.photoWall.refresh();
            } catch (err) { console.error(err); alert('留言失败'); }
            finally { btn.disabled = false; btn.textContent = '发送祝福'; }
        });
    }

    // 关闭弹窗
    const closeBtn = document.querySelector('.close-modal');
    if (closeBtn) closeBtn.addEventListener('click', closeCommentModal);
    const modal = document.getElementById('commentModal');
    if (modal) modal.addEventListener('click', e => { if (e.target === modal) closeCommentModal(); });

    // ========================================
    // 分享功能初始化
    // ========================================
    initShareFeature();
});

// ========================================
// 分享功能
// ========================================

function initShareFeature() {
    const shareFab = document.getElementById('shareFab');
    const shareModal = document.getElementById('shareModal');
    const closeShareModal = document.getElementById('closeShareModal');
    const shareLinkInput = document.getElementById('shareLinkInput');
    const btnCopyLink = document.getElementById('btnCopyLink');
    const btnShareWechat = document.getElementById('btnShareWechat');
    const btnShareWeibo = document.getElementById('btnShareWeibo');
    const btnShareQQ = document.getElementById('btnShareQQ');

    if (!shareFab || !shareModal) return;

    // 获取当前页面URL
    const currentUrl = window.location.href;

    // 设置分享链接
    if (shareLinkInput) {
        shareLinkInput.value = currentUrl;
    }

    // 生成二维码
    function generateQRCode() {
        const qrcodeContainer = document.getElementById('shareQrcode');
        if (!qrcodeContainer) return;

        // 清空容器
        qrcodeContainer.innerHTML = '';

        // 检查 QRCode 是否可用
        if (typeof QRCode === 'undefined') {
            qrcodeContainer.innerHTML = '<p style="color:#666;">二维码生成库加载失败</p>';
            return;
        }

        // 生成二维码
        try {
            new QRCode(qrcodeContainer, {
                text: currentUrl,
                width: 200,
                height: 200,
                colorDark: '#000000',
                colorLight: '#ffffff',
                correctLevel: 3  // 3=H, 2=Q, 1=M, 0=L
            });
        } catch (err) {
            console.error('生成二维码失败:', err);
            qrcodeContainer.innerHTML = '<p style="color:#666;">生成二维码失败</p>';
        }
    }

    // 打开分享弹窗
    shareFab.addEventListener('click', () => {
        shareModal.classList.add('active');
        // 生成二维码
        setTimeout(() => {
            generateQRCode();
        }, 100);
    });

    // 关闭分享弹窗
    if (closeShareModal) {
        closeShareModal.addEventListener('click', () => {
            shareModal.classList.remove('active');
        });
    }

    // 点击弹窗背景关闭
    shareModal.addEventListener('click', (e) => {
        if (e.target === shareModal) {
            shareModal.classList.remove('active');
        }
    });

    // 复制链接
    if (btnCopyLink) {
        btnCopyLink.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(currentUrl);
                btnCopyLink.innerHTML = '<i class="fas fa-check"></i> 已复制';
                btnCopyLink.classList.add('copied');
                setTimeout(() => {
                    btnCopyLink.innerHTML = '<i class="fas fa-copy"></i> 复制链接';
                    btnCopyLink.classList.remove('copied');
                }, 2000);
            } catch (err) {
                // 降级方案
                shareLinkInput.select();
                document.execCommand('copy');
                btnCopyLink.innerHTML = '<i class="fas fa-check"></i> 已复制';
                btnCopyLink.classList.add('copied');
                setTimeout(() => {
                    btnCopyLink.innerHTML = '<i class="fas fa-copy"></i> 复制链接';
                    btnCopyLink.classList.remove('copied');
                }, 2000);
            }
        });
    }

    // 微信分享（打开微信网页版或显示提示）
    if (btnShareWechat) {
        btnShareWechat.addEventListener('click', () => {
            // 在移动设备上，可以尝试调用微信分享API
            // 这里提供一个通用方案：复制链接并提示用户
            alert('请截图保存二维码，或复制链接后打开微信分享');
        });
    }

    // 微博分享
    if (btnShareWeibo) {
        btnShareWeibo.addEventListener('click', () => {
            const weiboUrl = `https://service.weibo.com/share/share.php?url=${encodeURIComponent(currentUrl)}&title=${encodeURIComponent('缅怀纪念 - 永远的回忆')}`;
            window.open(weiboUrl, '_blank', 'width=600,height=400');
        });
    }

    // QQ分享
    if (btnShareQQ) {
        btnShareQQ.addEventListener('click', () => {
            const qqUrl = `https://connect.qq.com/widget/shareqq/index.html?url=${encodeURIComponent(currentUrl)}&title=${encodeURIComponent('缅怀纪念 - 永远的回忆')}`;
            window.open(qqUrl, '_blank', 'width=600,height=400');
        });
    }
}
