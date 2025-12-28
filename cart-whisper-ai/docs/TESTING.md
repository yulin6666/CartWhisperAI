# CartWhisper AI 测试指南

## 前置条件

1. **后端已部署** - Railway 后端正在运行
   - URL: `https://cartwhisperaibackend-production.up.railway.app`
   - 健康检查: `curl https://cartwhisperaibackend-production.up.railway.app/api/health`

2. **Shopify Partner 账号** - 已创建开发商店

3. **Node.js 环境** - 建议 v20+

---

## 第一步：启动本地开发服务器

```bash
# 进入项目目录
cd /Users/linofficemac/Documents/AI/CartWhisperAI/cart-whisper-ai

# 安装依赖（如果还没安装）
npm install

# 启动开发服务器
npm run dev
```

启动后会看到类似输出：
```
> dev
> shopify app dev

╭─ success ─────────────────────────────────────────────────────────────╮
│                                                                        │
│  cart-whisper-ai is running                                           │
│                                                                        │
│  • Press `p` to open your app in the browser                          │
│  • Press `g` to open GraphiQL                                         │
│  • Press `q` to quit                                                  │
│                                                                        │
╰────────────────────────────────────────────────────────────────────────╯
```

---

## 第二步：打开 Shopify 后台

### 方法 1：通过终端快捷键
在运行 `npm run dev` 的终端中，按 `p` 键，会自动打开浏览器并跳转到 Shopify 后台的应用页面。

### 方法 2：手动访问
1. 打开浏览器，访问你的 Shopify 开发商店后台：
   ```
   https://admin.shopify.com/store/你的商店名
   ```

2. 在左侧菜单找到 **Apps（应用）**

3. 点击 **CartWhisper AI**（或你的应用名称）

---

## 第三步：测试同步功能

### 进入 Scan 页面

1. 打开应用后，在应用内导航到 **Scan** 页面
   - 或直接访问：`/app/scan`

2. 你会看到：
   - **Backend Status**: 显示后端连接状态（应该是绿色 🟢 Connected）
   - **Shop**: 你的商店域名
   - **Registration**: 注册状态

### 点击 Sync Products

1. 确保 Backend Status 显示 **Connected**

2. 点击蓝色按钮 **🚀 Sync Products**

3. 等待同步完成（会显示 ⏳ Syncing...）

4. 成功后会显示：
   - ✅ Sync Completed!
   - Products Synced: X（同步的商品数量）
   - Recommendations: X（生成的推荐数量）
   - Duration: X.XXs（耗时）

---

## 第四步：验证推荐数据

### 在应用内查看
点击绿色按钮 **📊 View Recommendations** 查看 API 使用说明和配置信息。

### 通过 API 测试
```bash
# 替换为你的实际 API Key
API_KEY="cw_your_api_key"

# 获取某个商品的推荐（替换 PRODUCT_ID）
curl -H "X-API-Key: $API_KEY" \
  "https://cartwhisperaibackend-production.up.railway.app/api/recommendations/PRODUCT_ID"
```

### 在 Railway 数据库中查看
1. 打开 Railway 控制台
2. 进入 PostgreSQL → Database → Data
3. 查看 Product 和 Recommendation 表

---

## 常见问题

### Q: Backend Status 显示 Disconnected
**原因**: 后端服务未运行或网络问题

**解决方案**:
1. 检查 Railway 后端是否正常运行
2. 访问 `https://cartwhisperaibackend-production.up.railway.app/api/health` 确认
3. 检查 Railway 部署日志

### Q: Sync 失败，显示 "Registration failed"
**原因**: 后端没有自动注册接口

**解决方案**:
需要先在后端添加商店注册接口，或手动在数据库中创建 Shop 记录：
```sql
INSERT INTO "Shop" (id, domain, "apiKey", "createdAt")
VALUES ('shop_xxx', 'your-store.myshopify.com', 'cw_your_key', NOW());
```

### Q: Sync 成功但 Recommendations 为 0
**原因**:
1. 商品数量太少（需要至少 2 个商品）
2. DeepSeek API Key 未配置

**解决方案**:
1. 确保商店至少有 2 个以上商品
2. 在 Railway 环境变量中配置 `DEEPSEEK_API_KEY`

### Q: 无法打开应用
**原因**: Shopify CLI 未正确连接

**解决方案**:
```bash
# 重新登录
shopify auth logout
shopify auth login

# 重新启动
npm run dev
```

---

## 数据流说明

```
┌─────────────────────────────────────────────────────────────────┐
│                        测试流程                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. npm run dev                                                 │
│     ↓                                                           │
│  2. 打开 Shopify 后台 → Apps → CartWhisper AI                   │
│     ↓                                                           │
│  3. 进入 Scan 页面                                               │
│     ↓                                                           │
│  4. 点击 "Sync Products"                                        │
│     ↓                                                           │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  前端 (本地)                                             │   │
│  │  • 通过 Shopify GraphQL 获取所有商品                      │   │
│  │  • 获取/注册 API Key                                     │   │
│  │  • 调用后端 POST /api/products/sync                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│     ↓                                                           │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  后端 (Railway)                                          │   │
│  │  • 接收商品数据                                           │   │
│  │  • 存入 PostgreSQL                                       │   │
│  │  • 调用 DeepSeek AI 生成推荐                              │   │
│  │  • 存储推荐关系                                           │   │
│  └─────────────────────────────────────────────────────────┘   │
│     ↓                                                           │
│  5. 返回同步结果                                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 完整测试清单

- [ ] 后端健康检查通过
- [ ] 本地开发服务器启动成功
- [ ] 能够打开 Shopify 应用
- [ ] Backend Status 显示 Connected
- [ ] 点击 Sync Products 成功
- [ ] 返回正确的商品数量
- [ ] 返回推荐数量 > 0
- [ ] API 查询推荐数据成功
- [ ] 数据库中有正确的记录

---

## 联系方式

如有问题，请检查：
1. Railway 后端日志
2. 浏览器开发者工具 Console
3. 终端 `npm run dev` 的输出
