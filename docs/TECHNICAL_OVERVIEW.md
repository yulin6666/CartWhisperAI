# CartWhisper AI - 技术文档

## 系统概述

CartWhisper AI 是一个 Shopify 应用，通过 AI 技术为购物车中的商品提供智能推荐，提升转化率和客单价。

---

## 系统架构流程图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Shopify 商店前端                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────┐    点击 Add to Cart    ┌──────────────────────┐          │
│   │  商品页面    │ ───────────────────▶  │  Theme App Extension  │          │
│   └─────────────┘                        │  (cart-popup.liquid)  │          │
│                                          └──────────┬───────────┘          │
│                                                     │                       │
│                                          拦截 fetch /cart/add               │
│                                                     │                       │
│                                                     ▼                       │
│                                          ┌──────────────────────┐          │
│                                          │   获取 product_id     │          │
│                                          └──────────┬───────────┘          │
│                                                     │                       │
└─────────────────────────────────────────────────────┼───────────────────────┘
                                                      │
                    ┌─────────────────────────────────┼─────────────────────────────────┐
                    │                                 │                                 │
                    ▼                                 ▼                                 │
        ┌───────────────────────┐       ┌───────────────────────┐                      │
        │  方式1: App Proxy     │       │  方式2: 直接 API       │                      │
        │  /apps/chat-proxy/    │       │  /api/recommendations/ │                      │
        │  recommendations      │       │  {shop}/{productId}    │                      │
        └───────────┬───────────┘       └───────────┬───────────┘                      │
                    │                               │                                   │
                    └───────────────┬───────────────┘                                   │
                                    │                                                   │
                                    ▼                                                   │
┌───────────────────────────────────────────────────────────────────────────────────────┤
│                              CartWhisper AI 后端 (Remix)                              │
├───────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                       │
│   ┌─────────────────────┐      ┌─────────────────────┐      ┌───────────────────┐   │
│   │  api.proxy.$.jsx    │      │ api.recommendations │      │ recommendationSync │   │
│   │  (App Proxy 路由)   │ ───▶ │  .$shop.$productId  │ ───▶ │    .server.js     │   │
│   └─────────────────────┘      └─────────────────────┘      └─────────┬─────────┘   │
│                                                                       │             │
│                                                                       ▼             │
│                                                             ┌───────────────────┐   │
│                                                             │   Prisma ORM      │   │
│                                                             │   (SQLite DB)     │   │
│                                                             └─────────┬─────────┘   │
│                                                                       │             │
│                                                                       ▼             │
│                                                             ┌───────────────────┐   │
│                                                             │ ProductRecommend- │   │
│                                                             │     ation 表      │   │
│                                                             └───────────────────┘   │
│                                                                                       │
└───────────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ 返回推荐数据
                                    ▼
┌───────────────────────────────────────────────────────────────────────────────────────┐
│                              Shopify 商店前端                                          │
├───────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                       │
│   ┌─────────────────────────────────────────────────────────────────────────────┐   │
│   │                           推荐弹窗 (Popup)                                    │   │
│   │  ┌─────────────────────────────────────────────────────────────────────┐   │   │
│   │  │  ✓ Added to cart!                                            [X]   │   │   │
│   │  │                                                                     │   │   │
│   │  │  ┌───────┐  These socks are a practical and style-matching        │   │   │
│   │  │  │ 图片  │  accessory for the shoes...                            │   │   │
│   │  │  └───────┘  VANS SOCKS 3 PACK                                     │   │   │
│   │  │             $19.95                              [Add]              │   │   │
│   │  │                                                                     │   │   │
│   │  │  [Continue Shopping]              [View Cart]                      │   │   │
│   │  └─────────────────────────────────────────────────────────────────────┘   │   │
│   └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                       │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 数据同步流程图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           商品扫描与推荐生成流程                              │
└─────────────────────────────────────────────────────────────────────────────┘

     ┌──────────────┐
     │ 管理后台触发  │
     │   商品扫描    │
     └──────┬───────┘
            │
            ▼
┌───────────────────────┐
│  Shopify Admin API    │
│  获取所有商品数据      │
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐      ┌───────────────────────┐
│  Xenova Transformers  │      │     商品向量化         │
│  生成商品 Embedding   │ ───▶ │  存储到 similarities   │
└───────────────────────┘      │       .json           │
                               └───────────┬───────────┘
                                           │
                                           ▼
                               ┌───────────────────────┐
                               │    向量相似度计算      │
                               │  找出最相似的商品      │
                               └───────────┬───────────┘
                                           │
                                           ▼
                               ┌───────────────────────┐
                               │    DeepSeek API       │
                               │  生成推荐理由文案      │
                               └───────────┬───────────┘
                                           │
                                           ▼
                               ┌───────────────────────┐
                               │  syncRecommendations  │
                               │    ToDatabase()       │
                               └───────────┬───────────┘
                                           │
                                           ▼
                               ┌───────────────────────┐
                               │  ProductRecommendation│
                               │        数据库表        │
                               └───────────────────────┘
```

---

## 核心技术栈

| 层级 | 技术 | 用途 |
|------|------|------|
| **前端** | Shopify Theme App Extension | 商店前端展示推荐弹窗 |
| **后端** | Remix (React Router 7) | 应用服务器框架 |
| **数据库** | SQLite + Prisma ORM | 数据持久化 |
| **AI - 向量化** | Xenova Transformers | 商品文本向量化 |
| **AI - 文案** | DeepSeek API | 生成推荐理由 |
| **部署** | Cloudflare Tunnel | 开发环境隧道 |
| **代理** | Shopify App Proxy | 跨域请求代理 |

---

## 数据库设计

### ProductRecommendation 表

```prisma
model ProductRecommendation {
  id                      String    @id @default(cuid())
  shop                    String    // 店铺域名

  // 源商品信息 (商品A - 用户加入购物车的商品)
  sourceProductId         String    // Shopify Product GID
  sourceProductTitle      String
  sourceProductPrice      Float
  sourceProductCategory   String?
  sourceProductImage      String?

  // 推荐商品信息 (商品B - 要推荐的商品)
  recommendedProductId      String
  recommendedProductHandle  String?   // 商品 handle，用于前端链接
  recommendedProductTitle   String
  recommendedProductPrice   Float
  recommendedProductCategory String?
  recommendedProductVendor  String?
  recommendedProductImage   String?

  // 推荐信息
  similarity              Float     // 相似度分数 0-1
  reasoning               String?   // AI生成的推荐理由
  priority                Int       @default(0)

  // 状态
  isActive                Boolean   @default(true)
  createdAt               DateTime  @default(now())
  updatedAt               DateTime  @updatedAt

  // 索引
  @@index([shop, sourceProductId])
  @@index([shop, isActive])
  @@unique([shop, sourceProductId, recommendedProductId])
}
```

---

## API 端点

### 1. App Proxy 端点（推荐使用）

**路径**: `/apps/chat-proxy/recommendations`

**请求方式**: GET

**参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| product_id | string | 是 | 商品数字ID |
| shop | string | 是 | 店铺域名 |
| limit | number | 否 | 返回数量，默认3 |

**示例请求**:
```
GET /apps/chat-proxy/recommendations?product_id=7534975221847&shop=store.myshopify.com&limit=3
```

**响应**:
```json
{
  "success": true,
  "productId": "7534975221847",
  "shop": "store.myshopify.com",
  "count": 1,
  "recommendations": [
    {
      "id": "gid://shopify/Product/7534976106583",
      "numericId": "7534976106583",
      "handle": "vans-socks-3-pack-white",
      "title": "VANS SOCKS 3 PACK WHITE",
      "price": 19.95,
      "category": "ACCESSORIES",
      "vendor": "VANS",
      "image": "https://cdn.shopify.com/...",
      "similarity": 0.795,
      "reasoning": "These socks are a practical accessory..."
    }
  ]
}
```

### 2. 直接 API 端点

**路径**: `/api/recommendations/{shop}/{productId}`

**请求方式**: GET

**CORS**: 已启用

---

## Theme App Extension

### 文件结构

```
extensions/cart-recommendations/
├── blocks/
│   ├── cart-popup.liquid      # 购物车弹窗组件
│   └── cart-recommendations.liquid  # 购物车页面推荐组件
└── shopify.extension.toml     # 扩展配置
```

### cart-popup.liquid 核心逻辑

```javascript
// 1. 拦截 fetch 请求
const originalFetch = window.fetch;
window.fetch = async function(...args) {
  const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;

  if (url.includes('/cart/add')) {
    // 检测到添加购物车
    const response = await originalFetch.apply(this, args);
    const data = await response.clone().json();
    const productId = data.items?.[0]?.product_id;

    if (productId) {
      showPopup(productId);
    }
    return response;
  }

  return originalFetch.apply(this, args);
};

// 2. 显示推荐弹窗
async function showPopup(productId) {
  const recommendations = await fetchRecommendations(productId);
  renderRecommendations(recommendations);
  popup.classList.add('active');
}

// 3. 添加推荐商品到购物车
window.cartWhisperPopupAdd = async function(button, handle) {
  const product = await fetch(`/products/${handle}.js`).then(r => r.json());
  const variantId = product.variants[0]?.id;

  await fetch('/cart/add.js', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [{ id: variantId, quantity: 1 }] })
  });
};
```

---

## 配置文件

### shopify.app.toml

```toml
client_id = "e95aeb94d3693728c99a07cf63cfe74f"
name = "CartWhisperAI"
embedded = true

[app_proxy]
url = "https://your-app.fly.dev/api/proxy"
subpath = "chat-proxy"
prefix = "apps"

[access_scopes]
scopes = "write_products,read_products,read_orders,read_customers"
```

---

## 开发环境设置

### 启动开发服务器

```bash
npm run dev
```

### 环境变量

```env
SHOPIFY_API_KEY=xxx
SHOPIFY_API_SECRET=xxx
DEEPSEEK_API_KEY=xxx
```

---

## 关键技术点

### 1. Fetch 拦截器

通过重写 `window.fetch` 来拦截所有网络请求，检测 `/cart/add` 请求以触发推荐弹窗。

### 2. App Proxy vs 直接 API

| 特性 | App Proxy | 直接 API |
|------|-----------|----------|
| CORS | 无需处理 | 需要设置 CORS 头 |
| 认证 | Shopify 自动验证 | 无 |
| 域名 | 使用商店域名 | 使用应用域名 |
| 推荐 | ✅ 生产环境推荐 | 开发测试用 |

### 3. 商品 Handle vs Numeric ID

- **Numeric ID**: `7534976106583` - 用于 API 查询
- **Handle**: `vans-socks-3-pack` - 用于前端 URL 和 `.js` 端点
- **GID**: `gid://shopify/Product/7534976106583` - Shopify 内部 ID

Shopify 的 `/products/{id}.js` 端点只接受 handle，不接受 numeric ID。

### 4. 向量相似度计算

使用 Xenova Transformers 将商品标题和描述转换为向量，计算余弦相似度找出最相关的商品。

```javascript
// 伪代码
const embedding1 = await model.embed(product1.title + product1.description);
const embedding2 = await model.embed(product2.title + product2.description);
const similarity = cosineSimilarity(embedding1, embedding2);
```

### 5. AI 推荐理由生成

使用 DeepSeek API 根据商品信息生成个性化推荐理由：

```javascript
const prompt = `
商品A: ${sourceProduct.title}
商品B: ${recommendedProduct.title}
请生成一句简短的推荐理由，说明为什么购买A的用户也会喜欢B。
`;
const reasoning = await deepseek.chat(prompt);
```

---

## 常见问题

### Q: 弹窗不显示？
1. 检查 Theme Editor 中 App Embed 是否启用
2. 检查 Console 是否有 `[CartWhisper]` 日志
3. 确认 fetch 拦截器已安装

### Q: API 返回空数组？
1. 检查 shop 名称是否正确
2. 确认数据库中有该商品的推荐数据
3. 运行商品扫描生成推荐

### Q: Add 按钮不工作？
1. 检查推荐商品是否有 handle
2. 确认商品在商店中存在
3. 查看 Console 错误信息

---

## 版本历史

| 版本 | 日期 | 更新内容 |
|------|------|----------|
| 1.0.0 | 2024-12-24 | 初始版本，完成基本推荐功能 |
