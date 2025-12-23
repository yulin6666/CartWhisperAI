# 🚀 快速开始（5分钟）

## 1️⃣ 配置 API Key（2 分钟）

```bash
# 打开 .env 文件，找到这一行：
DEEPSEEK_API_KEY=sk-your-api-key-here

# 替换为你的真实 API Key（从 https://platform.deepseek.com/api_keys 获取）
DEEPSEEK_API_KEY=sk-c62c4cde8fe747faa4d919780339295f
```

## 2️⃣ 启动开发服务器（1 分钟）

```bash
cd cart-whisper-ai
npm run dev
```

## 3️⃣ 运行扫描（2 分钟）

1. 打开应用首页
2. 进入 **Scan** 页面
3. 点击 **🔍 Scan Now** 按钮
4. 等待扫描完成（会输出日志）

## 4️⃣ 查看推荐（立即）

1. 点击 **📊 View Recommendations** 按钮
2. 查看：
   - ✅ 商品图片（表格第一列）
   - ✅ AI 生成的推荐文案（每个商品下方）
   - ✅ 推荐商品详情

---

## 📊 本次改进内容

| 功能 | 改进 | 效果 |
|------|------|------|
| 推荐文案 | 从模板 → AI 生成 | 个性化、有吸引力 |
| 商品图片 | 无 → 显示缩略图 | 视觉更直观 |
| Token 成本 | 处理所有商品 → 前5个 | 节约 95% 成本 |

---

## 🔍 验证成功标志

扫描完成后，查看日志应该看到：

```
✅ Got xxx products
⚡ Processing top 5 products for recommendations (saving tokens)...
📊 Will process: [商品1, 商品2, 商品3, 商品4, 商品5]
🔗 Calculating product similarities...
✅ Similarities calculated and saved
🤖 Starting to generate AI copies for 5 products...
✅ Generated AI copy for: [商品1]
✅ Generated AI copy for: [商品2]
...
✅ Generated 5 AI-powered recommendation copies
```

---

## 💡 前 5 个商品限制说明

系统默认只处理前 5 个商品，节约 API 成本：

- **相似度计算**：只计算前 5 个商品的相似度
- **AI 文案生成**：为前 5 个商品生成推荐文案
- **推荐展示**：显示这 5 个商品的推荐

**如果需要修改**：编辑 `app/routes/api.scan.jsx` 第 144 行
```javascript
// 处理前 10 个商品
const productsForRecommendation = products.slice(0, 10);

// 处理所有商品
const productsForRecommendation = products;
```

---

## ❓ 常见问题

**Q: AI 文案还是模板内容？**
A: 检查 `.env` 中的 API Key 是否正确，或查看服务器日志中的错误

**Q: 推荐图片不显示？**
A: 正常现象 - 如果 Shopify 产品没有图片，会显示"无图片"占位符

**Q: API 成本如何？**
A: 极低！处理 5 个商品大约 0.01 元人民币

**Q: 可以处理更多商品吗？**
A: 可以，修改配置即可，但会增加 API 成本和处理时间

---

## 🆘 遇到问题？

1. **检查日志**：查看服务器输出中的错误信息
2. **检查 API Key**：确保 `.env` 配置正确
3. **重启服务器**：有时修改 `.env` 需要重启 `npm run dev`
4. **清除数据**：删除 `data/` 目录重新扫描

---

祝您使用愉快！ 🎉
