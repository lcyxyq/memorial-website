# 缅怀纪念网站

庄重典雅的殡仪与会人员信息网站 — 分享回忆、上传生活照、留言祝福。

---

## 🚀 5 分钟部署

### 第 1 步：注册 Supabase（免费）

1. 打开 **https://supabase.com**
2. 点击 **Start your project** → 用 **GitHub 账号** 一键登录（无需单独注册）
3. 点击 **New Project**
   - Name：`memorial`（随意）
   - Database Password：设一个密码（记住，后面不用管）
   - Region：选离你最近的（如 Northeast Asia）
4. 等待约 1 分钟，项目创建完成

### 第 2 步：一键建表

1. 进入项目后，点左侧 **SQL Editor**
2. 把下面这段 SQL **整体粘贴**进去，点 **Run**：

```sql
-- 照片表
CREATE TABLE photos (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT NOT NULL,
  relation    TEXT DEFAULT '',
  message     TEXT DEFAULT '',
  photo_desc  TEXT DEFAULT '',
  photo_url   TEXT NOT NULL,
  storage_path TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 留言表
CREATE TABLE comments (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  photo_id   BIGINT REFERENCES photos(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  text       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 开放读写（公开网站，所有人可读可写）
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "photos_public_select" ON photos FOR SELECT USING (true);
CREATE POLICY "photos_public_insert" ON photos FOR INSERT WITH CHECK (true);
CREATE POLICY "comments_public_select" ON comments FOR SELECT USING (true);
CREATE POLICY "comments_public_insert" ON comments FOR INSERT WITH CHECK (true);

-- 创建存储桶（存图片）
INSERT INTO storage.buckets (id, name, public)
VALUES ('photos', 'photos', true);

-- 存储桶开放上传
CREATE POLICY "photos_upload" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'photos');

CREATE POLICY "photos_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'photos');
```

### 第 3 步：填入配置

1. 点左侧 **Settings** → **API**
2. 复制 **Project URL** 和 **anon public** key
3. 打开 `js/supabase-config.js`，粘贴替换：

```javascript
const SUPABASE_URL = 'https://xxxxx.supabase.co';   // ← 你的 Project URL
const SUPABASE_KEY = 'eyJhbGci...';                   // ← 你的 anon key
```

### 第 4 步：部署到 GitHub Pages

1. GitHub 创建仓库（如 `memorial-website`）
2. 上传所有文件
3. Settings → Pages → Branch 选 `main` → Save
4. 1-2 分钟后访问 `https://你的用户名.github.io/memorial-website/`

---

## 文件结构

```
memorial-website/
├── index.html               # 照片墙主页
├── register.html            # 登记上传页面
├── css/
│   └── style.css            # 样式
├── js/
│   ├── supabase-config.js   # ← 填你的 Supabase 密钥
│   └── app.js               # 核心逻辑
└── README.md
```

## Supabase 免费额度

| 资源 | 免费额度 |
|------|---------|
| 数据库 | 500 MB |
| 文件存储 | 1 GB |
| API 请求 | 无限（5 万次/月按量计费阈值前免费） |
| 带宽 | 5 GB/月 |

> 纪念网站流量不大，免费额度完全够用。

## 定制

- **颜色**：改 `css/style.css` 里的 `--accent-color` 等变量
- **标题**：改 HTML 里 `<title>` 和 `.logo`
- **关系选项**：改 `register.html` 里 `<select id="relation">`

---

**永远怀念 · 永远铭记**
