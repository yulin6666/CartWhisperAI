# CartWhisperAI 回归测试用例

**版本**: 1.0
**创建日期**: 2026-02-05
**测试范围**: 前端 + 后端 + Shopify 扩展

---

## 📋 测试优先级定义

- **P0 (Critical)**: 核心功能，影响主流程，必须通过
- **P1 (High)**: 重要功能，影响用户体验，应该通过
- **P2 (Medium)**: 次要功能，不影响核心流程
- **P3 (Low)**: 边缘场景，优化项

---

## 🎯 测试环境准备

### 前置条件
- [ ] Shopify 开发商店账号
- [ ] 后端服务运行正常 (Railway)
- [ ] 前端应用已部署
- [ ] 测试用产品数据（至少 100 个产品）
- [ ] 三个测试账号（FREE/PRO/MAX 计划）

### 环境变量检查
```bash
# 后端
DATABASE_URL=postgresql://...
DEEPSEEK_API_KEY=sk-...
PORT=3000

# 前端
SHOPIFY_API_KEY=xxx
SHOPIFY_API_SECRET=xxx
CARTWHISPER_BACKEND_URL=https://...
```

---

## 1️⃣ 应用安装与注册模块

### TC-001: 首次安装应用 (P0)
**前置条件**: 全新 Shopify 商店
**测试步骤**:
1. 在 Shopify App Store 搜索 CartWhisperAI
2. 点击 "Add app"
3. 授权应用权限（read_products, write_products）
4. 等待重定向到应用主页

**预期结果**:
- ✅ 成功安装，无报错
- ✅ 自动注册商店到后端（调用 `/api/shops/register`）
- ✅ 生成唯一 API Key
- ✅ 显示 "Initial Setup" 提示
- ✅ 默认计划为 FREE

**测试数据**:
- 商店域名: `test-store-001.myshopify.com`

---

### TC-002: 重复安装应用 (P1)
**前置条件**: 已安装过应用的商店
**测试步骤**:
1. 卸载应用
2. 重新安装应用
3. 检查数据是否保留

**预期结果**:
- ✅ 可以重新安装
- ✅ API Key 保持不变（或生成新的）
- ✅ 历史推荐数据清空
- ✅ 订阅状态重置为 FREE

---

## 2️⃣ 产品同步模块

### TC-003: 首次全量同步 - FREE 计划 (P0)
**前置条件**:
- 新安装的应用
- 商店有 100 个产品
- FREE 计划（限制 50 个产品）

**测试步骤**:
1. 点击 "Start Initial Sync" 按钮
2. 观察同步进度
3. 等待同步完成（最多 30 分钟）
4. 刷新页面查看结果

**预期结果**:
- ✅ 只同步前 50 个产品
- ✅ 显示警告: "Your store has 100 products, but FREE plan only supports 50"
- ✅ 后端成功接收产品数据
- ✅ AI 生成推荐（每个产品 1 个推荐）
- ✅ 同步状态更新为 "completed"
- ✅ `initialSyncDone` 标记为 true
- ✅ Token 使用量正确记录

**验证点**:
```sql
-- 后端数据库检查
SELECT COUNT(*) FROM products WHERE shop_id = ?;  -- 应该 = 50
SELECT COUNT(*) FROM recommendations WHERE shop_id = ?;  -- 应该 ≈ 50
SELECT tokens_used_today FROM shops WHERE id = ?;  -- 应该 > 0
```

---

### TC-004: 首次全量同步 - PRO 计划 (P0)