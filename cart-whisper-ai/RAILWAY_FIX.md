# 🔧 Railway 数据库连接修复指南

## 问题诊断

**症状**：
- CartWhisperAI 服务状态：❌ Crashed（4小时前）
- Postgres-Kcbi 数据库：✅ Online
- 错误信息：`Can't reach database server at 'postgres-kcbi.railway.internal:5432'`

**根本原因**：
DATABASE_URL 缺少 SSL 连接参数 `?sslmode=require`

---

## 修复步骤

### 步骤 1：打开 Railway Dashboard

1. 访问 [railway.app](https://railway.app)
2. 登录你的账号
3. 选择 CartWhisper 项目

### 步骤 2：修改 DATABASE_URL

1. **点击 CartWhisperAI 服务**（不是数据库）
2. **点击 Variables 标签**
3. **找到 DATABASE_URL 变量**

   当前值：
   ```
   postgresql://postgres:rd0ecLxywbNRPVJtYRCeuBUC0RwVmuTW@postgres-kcbi.railway.internal:5432/railway
   ```

4. **点击 Edit 按钮**

5. **修改为（在末尾添加 `?sslmode=require`）**：
   ```
   postgresql://postgres:rd0ecLxywbNRPVJtYRCeuBUC0RwVmuTW@postgres-kcbi.railway.internal:5432/railway?sslmode=require
   ```

6. **点击 Save 保存**

### 步骤 3：重启服务

Railway 会自动重新部署。如果没有：

1. 在 CartWhisperAI 服务页面
2. 点击右上角的 **⋮** (三个点)
3. 选择 **Restart**

### 步骤 4：验证修复

**等待 30-60 秒后**，检查以下内容：

#### 4.1 检查服务状态

在 Railway Dashboard：
- CartWhisperAI 状态应该从 ❌ **Crashed** 变为 ✅ **Active**

#### 4.2 检查部署日志

1. 点击 **Deployments** 标签
2. 点击最新的部署
3. 点击 **View Logs**
4. 查找以下日志：

**成功的日志应该包含**：
```
✅ Database connected successfully
✅ Server listening on port 3000
```

**不应该再出现**：
```
❌ P1001: Can't reach database server
❌ Error: connect ECONNREFUSED
```

#### 4.3 测试健康检查端点

在浏览器访问：
```
https://cartwhisperaibackend-production.up.railway.app/api/health
```

**预期返回**：
```json
{
  "status": "ok",
  "timestamp": "2026-01-13T...",
  "database": "connected"
}
```

---

## 验证清单

修复完成后，请确认：

- [ ] DATABASE_URL 已添加 `?sslmode=require` 参数
- [ ] CartWhisperAI 服务状态显示为 **Active**（绿色）
- [ ] 部署日志中没有数据库连接错误
- [ ] `/api/health` 端点返回正常
- [ ] Shopify 商店前台可以正常显示推荐弹窗

---

## 如果问题依然存在

### 方案 A：检查数据库连接字符串

确保 DATABASE_URL 格式正确：
```
postgresql://[用户名]:[密码]@[主机]:[端口]/[数据库]?sslmode=require
```

### 方案 B：重新生成 DATABASE_URL

1. 点击 **Postgres-Kcbi** 数据库服务
2. 点击 **Variables** 标签
3. 复制 **DATABASE_URL** 的值
4. 确保末尾有 `?sslmode=require`
5. 粘贴到 CartWhisperAI 服务的 DATABASE_URL 变量

### 方案 C：检查数据库服务

1. 点击 **Postgres-Kcbi** 数据库
2. 确认状态为 **Active**
3. 检查 **Deployments** 日志是否有错误

---

## 修复后的下一步

一旦服务恢复正常：

1. **按照 `TESTING_GUIDE.md` 测试重试和缓存功能**
   - 场景 1：正常请求
   - 场景 2：缓存降级测试
   - 场景 3：网络超时测试

2. **配置 UptimeRobot 监控**（可选）
   - 按照 `MONITORING_SETUP.md` 配置
   - 确保服务宕机时能及时收到通知

3. **性能监控**
   - 观察缓存命中率
   - 监控响应时间
   - 检查错误日志

---

## 常见问题

### Q1: 为什么需要 `?sslmode=require`？

Railway 的 PostgreSQL 数据库要求使用 SSL 加密连接。没有这个参数，Prisma 会尝试非加密连接，导致数据库拒绝连接。

### Q2: 修改后需要重新部署代码吗？

不需要。环境变量修改后，Railway 会自动重启服务。你的代码不需要任何改动。

### Q3: 如果忘记添加 `?` 怎么办？

必须使用 `?` 符号来添加查询参数。正确格式：
```
.../railway?sslmode=require
```

错误格式：
```
.../railway&sslmode=require  ❌
.../railway/sslmode=require  ❌
```

---

**最后更新**：2026-01-13
**预计修复时间**：5 分钟
