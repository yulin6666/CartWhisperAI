# 🔍 CartWhisper AI 监控配置指南

本文档指导你配置 **UptimeRobot** 和 **Sentry**，实现后端服务的健康监控和错误追踪。

---

## 方案 6: UptimeRobot 监控配置（免费，15分钟）

### 📋 为什么需要监控？

- **实时了解服务状态**：第一时间知道后端服务是否宕机
- **历史数据统计**：查看服务可用性历史记录
- **自动告警通知**：服务故障时自动发送邮件/短信/Telegram通知
- **公开状态页面**：可选地为用户提供服务状态页面

---

## 🚀 UptimeRobot 设置步骤

### 步骤 1: 注册账号

1. 访问 [UptimeRobot](https://uptimerobot.com)
2. 点击 **Sign Up Free** 注册免费账号
3. 验证邮箱后登录

**免费版包含：**
- ✅ 50 个监控器
- ✅ 5 分钟检查间隔
- ✅ 邮件/短信/Telegram/Slack 告警
- ✅ 90 天历史数据

---

### 步骤 2: 创建监控器

#### 2.1 监控后端健康检查端点

1. 登录后点击 **+ Add New Monitor**
2. 配置如下：

| 字段 | 值 |
|------|-----|
| **Monitor Type** | HTTP(s) |
| **Friendly Name** | CartWhisper Backend Health |
| **URL (or IP)** | `https://cartwhisperaibackend-production.up.railway.app/api/health` |
| **Monitoring Interval** | 5 minutes (免费版) |
| **Monitor Timeout** | 30 seconds |
| **HTTP Method** | GET |

3. 点击 **Create Monitor**

#### 2.2 监控推荐 API（可选）

如果你想监控推荐功能是否正常：

1. 点击 **+ Add New Monitor**
2. 配置：

| 字段 | 值 |
|------|-----|
| **Monitor Type** | HTTP(s) |
| **Friendly Name** | CartWhisper Recommendations API |
| **URL** | `https://cartwhisperaibackend-production.up.railway.app/api/public/recommendations/YOUR_SHOP.myshopify.com/TEST_PRODUCT_ID` |
| **Monitoring Interval** | 5 minutes |

> **注意**：将 `YOUR_SHOP` 替换为你的测试商店，`TEST_PRODUCT_ID` 替换为任意存在的商品ID

---

### 步骤 3: 配置告警联系方式

#### 3.1 邮件告警（默认已启用）

- 服务故障时会自动发邮件到注册邮箱
- 可以在 **My Settings → Alert Contacts** 添加更多邮箱

#### 3.2 Telegram 告警（推荐）

1. 在 Telegram 搜索 `@UptimeRobot`
2. 发送 `/start` 命令
3. Bot 会回复一个验证码
4. 在 UptimeRobot 网站 → **My Settings → Alert Contacts**
5. 选择 **Add Alert Contact** → **Telegram**
6. 输入验证码
7. 选择这个联系方式作为监控器的告警接收方

#### 3.3 Slack 告警（团队协作）

1. 在 Slack 创建一个频道（如 `#alerts`）
2. 在 UptimeRobot → **My Settings → Alert Contacts**
3. 选择 **Add Alert Contact** → **Slack**
4. 按照提示授权 UptimeRobot 访问你的 Slack
5. 选择频道

---

### 步骤 4: 配置告警规则

在每个监控器的设置中：

1. 点击监控器名称进入详情页
2. 点击 **Edit**
3. 滚动到 **Alert Contacts To Notify** 部分
4. 勾选你想接收告警的联系方式

**建议告警设置：**
- ✅ 服务宕机时立即通知
- ✅ 服务恢复时也通知（防止遗漏）
- ⚠️ 不要设置太多联系方式，避免告警疲劳

---

### 步骤 5: 查看监控数据

#### 实时状态

在 Dashboard 可以看到：
- 🟢 **Up**: 服务正常
- 🔴 **Down**: 服务宕机
- 🟡 **Paused**: 监控暂停

#### 历史统计

点击监控器查看：
- **Uptime**: 可用性百分比（目标 > 99%）
- **Response Time**: 响应时间趋势
- **Downtime Events**: 宕机事件列表

---

### 步骤 6: 创建公开状态页面（可选）

如果你想让用户查看服务状态：

1. 点击 **Public Status Pages**
2. 点击 **Add Status Page**
3. 配置：
   - **Page Name**: CartWhisper Status
   - **Monitors**: 选择要显示的监控器
   - **Custom Domain**: 可选自定义域名
4. 保存后会得到一个公开链接，如：
   ```
   https://status.uptimerobot.com/YOUR_ID
   ```

---

## 📊 监控最佳实践

### 1. 合理的检查间隔

| 服务类型 | 建议间隔 | 说明 |
|---------|---------|------|
| 核心 API | 5 分钟 | 免费版最小值 |
| 次要服务 | 10-15 分钟 | 节省监控配额 |
| 静态页面 | 15-30 分钟 | 很少变化 |

### 2. 告警策略

```
告警触发条件: 连续 2 次检查失败（避免误报）
告警接收方:
  - 邮件（所有人）
  - Telegram/Slack（运维人员）
```

### 3. 监控指标

- **可用性目标**: ≥ 99.5% (SLA)
- **响应时间**: < 1000ms (P95)
- **故障恢复时间**: < 30 分钟

---

## 🔔 告警响应流程

当收到宕机告警时：

### 1. 确认问题
```bash
# 手动检查健康端点
curl https://cartwhisperaibackend-production.up.railway.app/api/health

# 检查 Railway 服务状态
# 登录 Railway Dashboard 查看日志
```

### 2. 检查依赖服务
- ✅ 数据库连接是否正常
- ✅ DeepSeek API 是否可用
- ✅ Railway 平台是否有故障

### 3. 临时措施
- 如果是暂时性故障，等待自动恢复
- 如果是配置问题，回滚到上一个稳定版本
- 如果是流量问题，考虑扩容

### 4. 长期改进
- 分析故障原因
- 更新监控规则
- 改进代码容错性

---

## 🛡️ 额外监控工具（可选）

### Sentry - 错误追踪（免费额度：5000 events/月）

1. 访问 [Sentry.io](https://sentry.io)
2. 创建项目选择 **Node.js**
3. 获取 DSN
4. 在后端项目中集成：

```javascript
// backend/index.js
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: "YOUR_SENTRY_DSN",
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1, // 10% 的请求追踪
});

// 在错误处理中使用
app.use((err, req, res, next) => {
  Sentry.captureException(err);
  res.status(500).json({ error: 'Internal server error' });
});
```

### Better Uptime - 更强大的监控（免费版：10 监控器）

- 优势：1 分钟检查间隔，更好看的 Dashboard
- 网址：[betterstack.com/better-uptime](https://betterstack.com/better-uptime)

---

## ✅ 验证清单

在完成配置后，请确认：

- [ ] UptimeRobot 已创建至少 1 个监控器
- [ ] 监控器状态显示为 🟢 **Up**
- [ ] 已配置至少 1 个告警联系方式
- [ ] 测试告警（可以暂停监控器触发宕机告警测试）
- [ ] 记录监控 Dashboard 链接到团队文档

---

## 📱 快速访问链接

| 服务 | 链接 | 用途 |
|------|------|------|
| **UptimeRobot Dashboard** | https://uptimerobot.com/dashboard | 查看所有监控器 |
| **后端健康检查** | https://cartwhisperaibackend-production.up.railway.app/api/health | 手动检查后端状态 |
| **Railway Dashboard** | https://railway.app | 查看部署日志 |

---

## 🎯 总结

完成 UptimeRobot 配置后，你将获得：

1. ✅ **7x24 小时监控** - 自动检查后端服务可用性
2. ✅ **实时告警** - 服务故障时第一时间通知
3. ✅ **历史数据** - 可用性统计和趋势分析
4. ✅ **安心部署** - 发布后自动验证服务正常

**预计时间**: 15 分钟
**成本**: 免费
**维护**: 无需维护，自动运行

---

**最后更新**: 2026-01-13
**维护者**: CartWhisper AI Team
