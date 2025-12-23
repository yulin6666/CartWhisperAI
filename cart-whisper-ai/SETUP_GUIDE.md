# CartWhisper AI 推荐系统 - 部署指南

## 🎯 概述

CartWhisper AI 是一个基于 Shopify 的智能商品推荐系统，使用深度学习模型计算商品相似度，并利用 DeepSeek AI 生成个性化营销文案。

## ✨ 新增功能

### 1. AI 推荐文案生成
- 使用 DeepSeek API 为每个商品组合生成个性化营销文案
- 避免模板化的推荐语，提高转化率
- 支持降级处理：如果 API 调用失败，自动使用模板文案

### 2. 商品图片展示
- 在推荐表格中显示推荐商品图片（80×80px）
- 主商品区域显示原商品图片（120×120px）
- 图片无法加载时显示占位符

### 3. Token 优化
- 系统默认只对前 5 个商品生成推荐
- 大幅节约 DeepSeek API 调用成本
- 可在 `app/routes/api.scan.jsx` 中修改数字调整范围

## 🚀 快速开始

### 前提条件
- Node.js 20+ （推荐 22.12+）
- Shopify CLI 已安装
- DeepSeek API 账户（免费注册）

### 第 1 步：配置 DeepSeek API Key

1. **访问** [DeepSeek 平台](https://platform.deepseek.com/api_keys)
2. **注册/登录** 账户
3. **创建 API Key**
4. **配置项目**：编辑 `.env` 文件

```bash
# .env
DEEPSEEK_API_KEY=sk-your-api-key-here
```

⚠️ **重要**：`.env` 文件已在 `.gitignore` 中，不会上传到 Git

### 第 2 步：启动开发服务器

```bash
cd cart-whisper-ai
npm run dev
```

### 第 3 步：测试推荐功能

1. 访问 Shopify Admin 页面
2. 进入应用的 `/app/scan` 页面
3. 点击 **"🔍 Scan Now"** 按钮开始扫描
4. 等待扫描完成，查看日志输出
5. 点击 **"📊 View Recommendations"** 查看推荐结果

## 📊 数据流程

```
Shopify 商品数据
  ↓
[1] 获取商品（含图片）→ products.json
  ↓
[2] 计算相似度（前5个商品）
  ↓
[3] 后处理相似度（过滤价格/分类）
  ↓
[4] AI 文案生成（使用 DeepSeek）
  ↓
[5] 生成 Markdown 报告
  ↓
推荐数据 + 推荐文案 + 图片信息
```

## 🔧 配置选项

### 修改商品处理数量

编辑 `app/routes/api.scan.jsx` 第 144 行：

```javascript
// 当前：只处理前 5 个商品
const productsForRecommendation = products.slice(0, 5);

// 修改为处理前 10 个商品
const productsForRecommendation = products.slice(0, 10);

// 处理所有商品
const productsForRecommendation = products;
```

### 调整相似度阈值

编辑 `app/utils/productRecommendation.server.js` 第 72-74 行：

```javascript
// 当前：价格范围 0%-110%
if (item.price < mainPrice * 0.9 || item.price > mainPrice * 1.1) return false;

// 修改为 80%-120%
if (item.price < mainPrice * 0.8 || item.price > mainPrice * 1.2) return false;
```

## 📝 推荐数据结构

### 推荐数据文件 (`data/recommendations.json`)

```javascript
{
  "productId": "gid://shopify/Product/xxx",
  "productTitle": "商品名称",
  "productPrice": 99.95,
  "productCategory": "SHOES",
  "productImage": {
    "url": "https://...",
    "altText": "商品图片描述"
  },
  "candidates": [
    {
      "id": "gid://shopify/Product/yyy",
      "title": "推荐商品名称",
      "similarity": 0.795,      // 相似度（0-1）
      "price": 19.95,
      "category": "ACCESSORIES",
      "vendor": "品牌名称",
      "image": {
        "url": "https://...",
        "altText": "推荐商品图片描述"
      }
    }
  ]
}
```

### 推荐文案文件 (`data/recommendation-copies.json`)

```javascript
{
  "productTitle": "商品名称",
  "copy": "VANS运动鞋完美搭配，白色隐形袜让您运动更舒适，价格更划算！",  // AI生成
  "topCandidate": {
    "id": "gid://shopify/Product/yyy",
    "title": "推荐商品名称",
    "similarity": 0.795,
    "price": 19.95,
    "category": "ACCESSORIES",
    "vendor": "品牌名称"
  }
}
```

## 🔍 故障排除

### AI 文案未生成

**现象**：推荐文案仍为模板内容

**排查步骤**：
1. 检查 `.env` 中的 API Key 是否正确
2. 查看服务器日志，搜索 `⚠️ Failed to generate AI copy`
3. 确认 DeepSeek API 账户有可用额度
4. 重启开发服务器：`npm run dev`

### 图片不显示

**现象**：推荐表格中显示"无图片"占位符

**排查步骤**：
1. 检查 `data/recommendations.json` 是否包含 `image` 字段
2. 验证 Shopify 图片 URL 是否可访问
3. 检查浏览器控制台是否有跨域错误
4. 尝试清除缓存后刷新页面

### 扫描超时

**现象**：扫描过程中超时或卡死

**原因**：
- API 调用过多
- 网络连接不稳定
- 商品数量过多

**解决方案**：
- 减少处理的商品数量（参考配置选项）
- 检查网络连接
- 查看日志中是否有 API 错误

## 💰 成本估算

基于 DeepSeek API 价格（约 $0.14 per 1M input tokens）：

- **前 5 商品**：约 50-100 个输入 token
- **一次完整扫描成本**：< $0.001（几乎免费）

## 📈 性能优化建议

### 1. 缓存相似度计算结果
- 相似度计算耗时较长，可以缓存结果避免重复计算
- 修改 `productSimilarity.server.js`

### 2. 异步处理大量商品
- 如果需要处理超过 100 个商品，可以使用分批处理
- 防止内存溢出

### 3. 图片优化
- 考虑添加懒加载
- 考虑使用 Shopify CDN 压缩版本

## 🔐 安全注意事项

1. **API Key 保护**
   - 永远不要提交 `.env` 文件到 Git
   - 定期轮换 API Key
   - 使用环境变量而不是硬编码

2. **请求限流**
   - DeepSeek API 有限流限制
   - 生产环境需要添加重试机制
   - 考虑使用队列处理大量请求

3. **数据隐私**
   - 商品数据被发送到 DeepSeek API 进行文案生成
   - 确保符合数据隐私政策

## 📚 主要文件说明

| 文件 | 说明 |
|------|------|
| `app/routes/api.scan.jsx` | API 端点，触发扫描和推荐生成 |
| `app/routes/app.scan.jsx` | 扫描页面 UI |
| `app/routes/app.recommendations.jsx` | 推荐展示页面 UI |
| `app/utils/productSimilarity.server.js` | 相似度计算算法 |
| `app/utils/productRecommendation.server.js` | 推荐生成和过滤逻辑 |
| `app/utils/recommendationExport.server.js` | 文案生成和数据导出 |
| `.env` | 环境变量配置（不上传 Git） |

## 🤝 支持和反馈

如遇到问题，请检查：
1. 服务器日志输出
2. `data/` 目录下的 JSON 文件
3. 浏览器控制台错误
4. `.env` 文件配置

## 版本历史

### v1.1.0 （当前版本）
- ✨ 新增 AI 推荐文案生成
- 🖼️ 新增商品图片展示
- ⚡ 优化：仅处理前5个商品节约 token

### v1.0.0
- 初始版本

---

更新时间：2025-12-23
