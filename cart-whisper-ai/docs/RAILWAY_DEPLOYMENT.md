# CartWhisper AI - Railway 部署指南

## 概述

本文档介绍如何将 CartWhisper AI 从本地开发环境部署到 Railway 云平台。

---

## 部署架构对比

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              本地开发环境                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Shopify 商店  ──▶  Cloudflare Tunnel  ──▶  localhost:3000                │
│                      (临时 URL，经常变化)       (本地服务器)                  │
│                                                                             │
│   数据库: SQLite (prisma/dev.sqlite)                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

                                    ▼

┌─────────────────────────────────────────────────────────────────────────────┐
│                              Railway 生产环境                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Shopify 商店  ──▶  Railway 固定 URL  ──▶  Railway 服务器                  │
│                      (如: cart-whisper.up.railway.app)                      │
│                                                                             │
│   数据库: PostgreSQL (Railway 提供)                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 第一步：准备工作

### 1.1 注册 Railway 账号

访问 [railway.app](https://railway.app) 注册账号（可用 GitHub 登录）。

### 1.2 安装 Railway CLI（可选）

```bash
npm install -g @railway/cli
railway login
```

---

## 第二步：数据库迁移（SQLite → PostgreSQL）

Railway 推荐使用 PostgreSQL，需要修改 Prisma 配置。

### 2.1 修改 prisma/schema.prisma

```prisma
// 修改前 (SQLite)
datasource db {
  provider = "sqlite"
  url      = "file:dev.sqlite"
}

// 修改后 (PostgreSQL)
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

### 2.2 完整的 schema.prisma

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Session {
  id            String    @id
  shop          String
  state         String
  isOnline      Boolean   @default(false)
  scope         String?
  expires       DateTime?
  accessToken   String
  userId        BigInt?
  firstName     String?
  lastName      String?
  email         String?
  accountOwner  Boolean   @default(false)
  locale        String?
  collaborator  Boolean?  @default(false)
  emailVerified Boolean?  @default(false)
  refreshToken        String?
  refreshTokenExpires DateTime?
}

model ProductRecommendation {
  id                      String    @id @default(cuid())
  shop                    String

  sourceProductId         String
  sourceProductTitle      String
  sourceProductPrice      Float
  sourceProductCategory   String?
  sourceProductImage      String?

  recommendedProductId      String
  recommendedProductHandle  String?
  recommendedProductTitle   String
  recommendedProductPrice   Float
  recommendedProductCategory String?
  recommendedProductVendor  String?
  recommendedProductImage   String?

  similarity              Float
  reasoning               String?
  priority                Int       @default(0)
  isActive                Boolean   @default(true)

  createdAt               DateTime  @default(now())
  updatedAt               DateTime  @updatedAt

  @@index([shop, sourceProductId])
  @@index([shop, isActive])
  @@unique([shop, sourceProductId, recommendedProductId])
}
```

---

## 第三步：创建 Railway 项目

### 3.1 通过 Web 界面创建

1. 登录 [railway.app](https://railway.app)
2. 点击 **New Project**
3. 选择 **Deploy from GitHub repo**
4. 授权并选择 `cart-whisper-ai` 仓库

### 3.2 添加 PostgreSQL 数据库

1. 在项目中点击 **+ New**
2. 选择 **Database** → **Add PostgreSQL**
3. Railway 会自动创建数据库并设置 `DATABASE_URL` 环境变量

---

## 第四步：配置环境变量

在 Railway 项目设置中添加以下环境变量：

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| `DATABASE_URL` | PostgreSQL 连接字符串 | Railway 自动设置 |
| `SHOPIFY_API_KEY` | Shopify App API Key | `e95aeb94d3693728...` |
| `SHOPIFY_API_SECRET` | Shopify App Secret | `xxx` |
| `SCOPES` | API 权限范围 | `write_products,read_products,read_orders` |
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥 | `sk-xxx` |
| `NODE_ENV` | 运行环境 | `production` |

### 环境变量设置方式

**方式1: Railway Web 界面**
1. 进入项目 → Variables 标签
2. 点击 **+ New Variable** 添加

**方式2: Railway CLI**
```bash
railway variables set SHOPIFY_API_KEY=xxx
railway variables set SHOPIFY_API_SECRET=xxx
railway variables set DEEPSEEK_API_KEY=xxx
```

---

## 第五步：修改代码配置

### 5.1 添加 Procfile（可选）

在项目根目录创建 `Procfile`：

```
web: npm run start
```

### 5.2 修改 package.json

确保有以下脚本：

```json
{
  "scripts": {
    "build": "remix vite:build",
    "start": "remix-serve ./build/server/index.js",
    "dev": "shopify app dev",
    "prisma:migrate": "prisma migrate deploy",
    "prisma:generate": "prisma generate",
    "postinstall": "prisma generate"
  }
}
```

### 5.3 创建 railway.json 配置文件

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm run build && npm run prisma:migrate"
  },
  "deploy": {
    "startCommand": "npm run start",
    "healthcheckPath": "/",
    "healthcheckTimeout": 100,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

---

## 第六步：更新 Shopify 应用配置

### 6.1 获取 Railway 域名

部署成功后，Railway 会分配一个域名，如：
```
https://cart-whisper-ai-production.up.railway.app
```

你也可以在 Railway 设置中配置自定义域名。

### 6.2 修改 shopify.app.toml

```toml
client_id = "e95aeb94d3693728c99a07cf63cfe74f"
name = "CartWhisperAI"
application_url = "https://cart-whisper-ai-production.up.railway.app"
embedded = true

[build]
automatically_update_urls_on_dev = true
include_config_on_deploy = true

[webhooks]
api_version = "2024-04"

[access_scopes]
scopes = "write_products,read_products,read_orders,read_customers"

[auth]
redirect_urls = [
  "https://cart-whisper-ai-production.up.railway.app/api/auth"
]

[app_proxy]
url = "https://cart-whisper-ai-production.up.railway.app/api/proxy"
subpath = "chat-proxy"
prefix = "apps"
```

### 6.3 更新 Shopify Partner Dashboard

1. 登录 [Shopify Partner Dashboard](https://partners.shopify.com)
2. 进入 Apps → CartWhisperAI → Configuration
3. 更新以下 URL：
   - **App URL**: `https://cart-whisper-ai-production.up.railway.app`
   - **Allowed redirection URL(s)**: `https://cart-whisper-ai-production.up.railway.app/api/auth`
   - **App Proxy URL**: `https://cart-whisper-ai-production.up.railway.app/api/proxy`

---

## 第七步：部署流程

### 7.1 推送代码到 GitHub

```bash
git add .
git commit -m "Configure for Railway deployment"
git push origin main
```

### 7.2 Railway 自动部署

Railway 会自动检测 GitHub 推送并开始部署：

```
┌─────────────────────────────────────────────────────────────────┐
│                      Railway 部署流程                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   1. 检测到 Git 推送                                             │
│              ↓                                                  │
│   2. 安装依赖 (npm install)                                      │
│              ↓                                                  │
│   3. 生成 Prisma Client (prisma generate)                       │
│              ↓                                                  │
│   4. 构建应用 (npm run build)                                    │
│              ↓                                                  │
│   5. 运行数据库迁移 (prisma migrate deploy)                       │
│              ↓                                                  │
│   6. 启动服务器 (npm run start)                                  │
│              ↓                                                  │
│   7. 健康检查通过，部署完成 ✓                                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 7.3 手动部署（使用 CLI）

```bash
railway up
```

---

## 第八步：数据迁移

### 8.1 导出本地数据

```bash
# 导出 SQLite 数据为 SQL
sqlite3 prisma/dev.sqlite ".dump ProductRecommendation" > recommendations_backup.sql
```

### 8.2 转换为 PostgreSQL 格式

SQLite 和 PostgreSQL 语法有差异，需要手动调整或使用迁移工具。

### 8.3 导入到 Railway PostgreSQL

```bash
# 获取 Railway 数据库连接信息
railway connect postgres

# 或使用 psql 直接连接
psql $DATABASE_URL < recommendations_backup.sql
```

### 8.4 重新扫描商品（推荐）

更简单的方式是在生产环境重新运行商品扫描：

1. 安装应用到商店
2. 进入应用管理后台
3. 运行商品扫描，重新生成推荐数据

---

## 第九步：验证部署

### 9.1 检查应用状态

访问 Railway 域名，确认应用正常运行：
```
https://cart-whisper-ai-production.up.railway.app
```

### 9.2 测试 API 端点

```bash
# 测试健康检查
curl https://cart-whisper-ai-production.up.railway.app/api/proxy/health

# 测试推荐 API
curl "https://cart-whisper-ai-production.up.railway.app/api/proxy/recommendations?product_id=123&shop=your-store.myshopify.com"
```

### 9.3 测试 App Proxy

在商店前端测试：
```
https://your-store.myshopify.com/apps/chat-proxy/recommendations?product_id=123
```

---

## 常见问题

### Q1: 部署失败，提示 Prisma 错误？

**解决方案**:
```bash
# 确保 postinstall 脚本存在
"postinstall": "prisma generate"

# 手动生成 Prisma Client
railway run npx prisma generate
```

### Q2: 数据库连接失败？

**解决方案**:
1. 确认 `DATABASE_URL` 环境变量已设置
2. 检查 PostgreSQL 服务是否运行
3. 查看 Railway 日志排查问题

### Q3: App Proxy 返回 404？

**解决方案**:
1. 确认 `shopify.app.toml` 中的 URL 正确
2. 重新部署应用到 Shopify: `shopify app deploy`
3. 检查 Shopify Partner Dashboard 中的 App Proxy 配置

### Q4: 商店前端 CORS 错误？

**解决方案**:
使用 App Proxy 而不是直接 API 调用：
- Theme Editor 的 API URL 字段留空
- 前端会自动使用 `/apps/chat-proxy/...` 路径

---

## 费用估算

Railway 定价（2024年）：

| 资源 | 免费额度 | 超出后费用 |
|------|----------|------------|
| 计算 | $5/月 | $0.000231/GB-hour |
| 内存 | 512MB | $0.000231/GB-hour |
| PostgreSQL | 1GB | $0.000231/GB-hour |
| 网络 | 100GB | $0.10/GB |

对于小型商店，免费额度通常足够。

---

## 部署检查清单

- [ ] 修改 `prisma/schema.prisma` 为 PostgreSQL
- [ ] 创建 Railway 项目
- [ ] 添加 PostgreSQL 数据库
- [ ] 配置所有环境变量
- [ ] 创建 `railway.json` 配置文件
- [ ] 更新 `shopify.app.toml` 中的 URL
- [ ] 更新 Shopify Partner Dashboard 配置
- [ ] 推送代码触发部署
- [ ] 验证 API 端点正常
- [ ] 验证 App Proxy 正常
- [ ] 在商店测试完整流程

---

## 相关链接

- [Railway 文档](https://docs.railway.app)
- [Prisma PostgreSQL 指南](https://www.prisma.io/docs/concepts/database-connectors/postgresql)
- [Shopify App Proxy 文档](https://shopify.dev/docs/apps/online-store/app-proxies)
