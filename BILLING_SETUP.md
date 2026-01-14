# Shopify Billing 集成指南

## 概述

CartWhisper AI 现在支持通过 Shopify Billing API 实现 Free 和 Pro 两个版本的订阅管理。

## 功能特性

### Free Plan (免费版)
- ✅ 最多 50 个产品
- ✅ 每个产品 1 个推荐
- ✅ 每天 5,000 次 API 调用
- ✅ 每月 1 次手动刷新
- ✅ 基础分析功能

### Pro Plan ($29.99/月)
- ✅ 无限产品
- ✅ 每个产品 2 个推荐
- ✅ 每天 50,000 次 API 调用
- ✅ 每月 4 次手动刷新
- ✅ 可编辑推荐理由
- ✅ 优先支持
- ✅ 7 天免费试用

## 部署步骤

### 1. 运行数据库迁移

```bash
cd cart-whisper-ai
npx prisma migrate dev --name add_subscription_model
```

如果生产环境，使用：
```bash
npx prisma migrate deploy
```

### 2. 更新 Shopify App 配置

webhook 已经在 `shopify.app.toml` 中配置好了：
```toml
[[webhooks.subscriptions]]
topics = [ "app_subscriptions/update" ]
uri = "/webhooks/app_subscriptions_update"
```

部署后，Shopify 会自动注册这个 webhook。

### 3. 测试模式（开发环境）

在开发环境中，你可以使用测试模式来切换 Free 和 Pro 版本，无需真实支付：

1. 在 Dashboard 的 Plan 卡片中，会显示一个 "🧪 Test: Switch to Pro/Free" 按钮
2. 点击按钮即可在两个版本之间切换
3. 测试模式的订阅会标记为 `isTestMode: true`

**注意：** 测试按钮仅在 `NODE_ENV=development` 时显示。

### 4. 生产环境

在生产环境中：
- 用户点击 "⬆️ Upgrade to Pro" 按钮
- 系统会创建 Shopify 订阅并重定向到支付页面
- 用户完成支付后，Shopify 会重定向回 `/app/billing/callback`
- 系统确认订阅状态并更新数据库
- Dashboard 显示升级成功通知

## 文件结构

```
cart-whisper-ai/
├── app/
│   ├── utils/
│   │   └── billing.server.js          # Billing 工具函数和配置
│   └── routes/
│       ├── app._index.jsx             # Dashboard (已更新显示订阅信息)
│       ├── app.billing.jsx            # 订阅创建和测试切换
│       ├── app.billing.callback.jsx   # 支付回调处理
│       ├── app.billing.cancel.jsx     # 取消订阅
│       └── webhooks.app_subscriptions_update.jsx  # 订阅状态 webhook
├── prisma/
│   └── schema.prisma                  # 数据库 schema (新增 Subscription 模型)
└── shopify.app.toml                   # Shopify 配置 (新增 webhook)
```

## API 端点

### 订阅管理
- `POST /app/billing` - 创建订阅或测试切换
  - `action=upgrade` - 升级到 Pro
  - `action=toggle_test` - 测试模式切换 (仅开发环境)
- `GET /app/billing/callback` - 支付完成回调
- `POST /app/billing/cancel` - 取消订阅

### Webhook
- `POST /webhooks/app_subscriptions_update` - 订阅状态变化通知

## 数据库模型

```prisma
model Subscription {
  id                    String    @id @default(cuid())
  shop                  String    @unique
  plan                  String    @default("free")  // free, pro
  status                String    @default("active") // active, cancelled, expired
  shopifySubscriptionId String?   @unique
  shopifyChargeId       String?
  isTestMode            Boolean   @default(false)
  currentPeriodStart    DateTime?
  currentPeriodEnd      DateTime?
  trialEndsAt           DateTime?
  cancelledAt           DateTime?
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt
}
```

## 使用示例

### 检查用户订阅状态

```javascript
import { getSubscription, hasProPlan, getPlanFeatures } from '../utils/billing.server';

// 获取订阅信息
const subscription = await getSubscription(shop);
console.log(subscription.plan); // 'free' or 'pro'

// 检查是否是 Pro 用户
const isPro = await hasProPlan(shop);

// 获取计划功能限制
const features = await getPlanFeatures(shop);
console.log(features.maxProducts); // 50 or Infinity
```

### 创建订阅

```javascript
import { createSubscription } from '../utils/billing.server';

const { confirmationUrl } = await createSubscription(admin, shop, 'PRO');
// 重定向用户到 confirmationUrl 完成支付
```

### 取消订阅

```javascript
import { cancelSubscription } from '../utils/billing.server';

await cancelSubscription(admin, shop);
// 用户降级到 Free Plan
```

## 测试流程

### 开发环境测试

1. 启动开发服务器：
   ```bash
   npm run dev
   ```

2. 访问 Dashboard，查看 Plan 卡片

3. 点击 "🧪 Test: Switch to Pro" 按钮

4. 验证：
   - Plan 显示变为 "PRO"
   - 显示 "(Test Mode)" 标记
   - 功能限制已更新

5. 再次点击切换回 Free

### 生产环境测试

1. 部署到生产环境

2. 安装 App 到测试商店

3. 点击 "⬆️ Upgrade to Pro" 按钮

4. 在 Shopify 支付页面完成测试支付（使用 Shopify 的测试模式）

5. 验证：
   - 重定向回 Dashboard
   - 显示升级成功通知
   - Plan 显示为 "PRO"
   - 显示续费日期

## 注意事项

1. **测试模式 vs 生产模式**
   - 开发环境 (`NODE_ENV=development`) 会自动使用 Shopify 测试模式，不会真实扣费
   - 生产环境会创建真实的订阅

2. **Webhook 延迟**
   - 订阅状态变化后，Shopify 会发送 webhook
   - 可能有几秒延迟，系统会自动更新

3. **向后兼容**
   - 现有用户会自动创建为 Free Plan
   - 不影响现有功能

4. **订阅状态**
   - `active` - 订阅激活
   - `pending` - 等待支付确认
   - `cancelled` - 已取消
   - `expired` - 已过期

## 故障排查

### 问题：升级按钮点击后没有反应
- 检查浏览器控制台是否有错误
- 确认 Shopify Admin API 权限正确
- 查看服务器日志

### 问题：支付完成后没有升级
- 检查 `/app/billing/callback` 路由是否正常
- 查看 Shopify Admin 中的订阅状态
- 检查数据库中的 Subscription 记录

### 问题：Webhook 没有触发
- 在 Shopify Admin 中检查 webhook 配置
- 查看 webhook 日志
- 确认 webhook URL 可访问

## 下一步

1. ✅ 运行数据库迁移
2. ✅ 测试开发环境的切换功能
3. ✅ 部署到生产环境
4. ✅ 在测试商店中测试完整的支付流程
5. ✅ 监控 webhook 和订阅状态

## 支持

如有问题，请查看：
- Shopify Billing API 文档: https://shopify.dev/docs/apps/billing
- Shopify Webhook 文档: https://shopify.dev/docs/apps/webhooks
