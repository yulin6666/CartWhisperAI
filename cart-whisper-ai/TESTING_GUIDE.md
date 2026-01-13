# 🧪 重试机制和缓存降级功能测试指南

本文档指导你测试新添加的重试机制、缓存降级和缓存状态显示功能。

---

## ✅ 已实现的功能

### 1. 后端重试机制（backendApi.server.js）
- ✅ 自动重试：失败后最多重试 2 次
- ✅ 超时控制：每次请求 10 秒超时
- ✅ 指数退避：重试间隔递增（1s → 2s → 4s）
- ✅ 缓存降级：所有重试失败后使用缓存数据

### 2. 前端重试机制（cart-popup.liquid）
- ✅ 自动重试：失败后最多重试 2 次
- ✅ 超时控制：每次请求 8 秒超时
- ✅ 指数退避：重试间隔递增（1s → 2s → 3s）
- ✅ 优雅降级：失败后返回空推荐而非错误

### 3. 缓存管理（recommendationCache.server.js）
- ✅ 内存缓存：推荐结果缓存 1 小时
- ✅ 自动清理：每 10 分钟清理过期缓存
- ✅ 缓存统计：提供缓存使用情况查询

### 4. 缓存状态显示
- ✅ 前端提示：使用缓存数据时显示橙色提示条
- ✅ API 标识：响应中包含 `fromCache: true` 字段
- ✅ 调试日志：控制台输出缓存命中/未命中信息

---

## 🧪 测试场景

### 场景 1: 正常请求（无故障）

**目的**: 验证正常流程和缓存写入

**步骤**:
1. 启动开发服务器:
   ```bash
   cd cart-whisper-ai
   npm run dev
   ```

2. 打开 Shopify Admin 并访问你的商店前台

3. 添加任意商品到购物车

4. 观察弹窗中的推荐商品

**预期结果**:
- ✅ 弹窗正常显示推荐商品
- ✅ **不显示**橙色缓存提示条
- ✅ 控制台日志显示：
  ```
  [BackendAPI] Attempt 1/3: Fetching from ...
  [BackendAPI] Success! Got 3 recommendations
  [Cache] Cached 3 recommendations for product 123456
  ```

---

### 场景 2: 使用缓存数据（后端故障模拟）

**目的**: 验证缓存降级功能

**步骤**:

#### 方法 A：临时修改后端 URL（推荐）

1. 编辑 `cart-whisper-ai/app/utils/backendApi.server.js`:
   ```javascript
   // 第 9 行，临时修改为错误的 URL
   const BACKEND_URL = 'https://invalid-backend-url.com';
   ```

2. 重启开发服务器

3. **第一次请求**：
   - 添加商品到购物车
   - 预期：弹窗显示 "Loading..." 然后显示空推荐（因为还没有缓存）

4. **恢复正确的 URL**:
   ```javascript
   const BACKEND_URL = 'https://cartwhisperaibackend-production.up.railway.app';
   ```

5. 重启服务器，再次添加商品到购物车
   - 预期：成功获取推荐并写入缓存

6. **再次使用错误的 URL**，重启服务器

7. 添加相同商品到购物车

**预期结果**:
- ✅ 弹窗显示推荐商品（来自缓存）
- ✅ **显示**橙色提示条："Showing cached recommendations"
- ✅ 控制台日志显示：
  ```
  [BackendAPI] Attempt 1/3: Fetching from ...
  [BackendAPI] Attempt 1 failed: ...
  [BackendAPI] Retrying in 1000ms...
  [BackendAPI] Attempt 2/3: Fetching from ...
  [BackendAPI] Attempt 2 failed: ...
  [BackendAPI] Retrying in 2000ms...
  [BackendAPI] Attempt 3/3: Fetching from ...
  [BackendAPI] Attempt 3 failed: ...
  [BackendAPI] All retries failed
  [Cache] Cache hit for product 123456 (age: 120s)
  [BackendAPI] ⚠️ Using cached recommendations as fallback
  ```

#### 方法 B：使用 Railway 暂停服务（生产环境测试）

1. 登录 [Railway Dashboard](https://railway.app)
2. 找到你的 CartWhisper Backend 服务
3. 点击 **Pause** 暂停服务
4. 在商店前台添加商品到购物车
5. 观察弹窗行为
6. 测试完成后记得 **Resume** 恢复服务

---

### 场景 3: 网络超时测试

**目的**: 验证超时控制和重试

**步骤**:

可以使用 Chrome DevTools 模拟慢速网络：

1. 打开 Chrome DevTools (F12)
2. 切换到 **Network** 标签
3. 在 **Throttling** 下拉菜单选择 **Slow 3G**
4. 添加商品到购物车

**预期结果**:
- ✅ 请求可能会超时（10秒）
- ✅ 自动重试 2 次
- ✅ 如果所有重试都超时，使用缓存数据

---

### 场景 4: 缓存过期测试

**目的**: 验证缓存 TTL（1小时）

**步骤**:

由于缓存过期时间是 1 小时，可以手动修改 TTL 进行快速测试：

1. 编辑 `cart-whisper-ai/app/utils/recommendationCache.server.js`:
   ```javascript
   // 第 8 行，临时改为 60 秒
   const CACHE_TTL = 60000; // 60 秒（原来是 3600000）
   ```

2. 重启服务器

3. 添加商品到购物车（成功获取推荐并缓存）

4. 模拟后端故障（参考场景 2）

5. 在 60 秒内再次添加相同商品
   - 预期：使用缓存数据，显示橙色提示条

6. 等待超过 60 秒后再次添加
   - 预期：缓存已过期，返回空推荐

7. 测试完成后记得改回 `3600000`

---

### 场景 5: 前端 Liquid 重试测试

**目的**: 验证前端 JavaScript 的重试机制

**步骤**:

1. 确保后端服务正常运行

2. 在浏览器控制台手动触发推荐请求:
   ```javascript
   // 模拟后端故障（修改 backendUrl）
   const backendUrl = 'https://invalid-url.com';
   const shop = 'your-shop.myshopify.com';
   const productId = '7534975221847';
   const limit = 3;

   // 执行 fetchRecommendations（从 cart-popup.liquid 复制）
   async function testFetch() {
     const fetchUrl = `${backendUrl}/api/public/recommendations/${shop}/${productId}?limit=${limit}`;
     const maxRetries = 2;

     for (let attempt = 0; attempt <= maxRetries; attempt++) {
       try {
         const response = await fetch(fetchUrl, {
           method: 'GET',
           signal: AbortSignal.timeout(8000),
         });
         if (response.ok) return await response.json();
         throw new Error(`HTTP ${response.status}`);
       } catch (error) {
         console.log(`Attempt ${attempt + 1} failed:`, error.message);
         if (attempt < maxRetries) {
           const delay = Math.min(1000 * Math.pow(2, attempt), 3000);
           await new Promise(r => setTimeout(r, delay));
         }
       }
     }
     return [];
   }

   testFetch().then(console.log);
   ```

**预期结果**:
- ✅ 控制台显示 3 次尝试
- ✅ 每次尝试之间有延迟（1s → 2s）
- ✅ 最终返回空数组

---

## 📊 缓存统计查询（仅开发环境）

可以在服务器端查询缓存统计：

1. 编辑 `cart-whisper-ai/app/routes/app.recommendations.jsx`

2. 在 `loader` 函数中添加：
   ```javascript
   import { getCacheStats } from '../utils/recommendationCache.server';

   export async function loader({ request }) {
     // ... 现有代码 ...

     const cacheStats = getCacheStats();
     console.log('[Cache Stats]', cacheStats);

     return {
       // ... 现有返回值 ...
       cacheStats,
     };
   }
   ```

3. 访问 `/app/recommendations` 路由

4. 查看服务器控制台日志：
   ```
   [Cache Stats] {
     total: 10,
     valid: 8,
     expired: 2,
     ttlSeconds: 3600
   }
   ```

---

## 🔍 调试日志说明

### 后端日志关键字

| 日志 | 含义 |
|------|------|
| `[BackendAPI] Attempt X/3` | 第 X 次请求尝试 |
| `[BackendAPI] Success!` | 请求成功 |
| `[BackendAPI] Retrying in Xms` | X 毫秒后重试 |
| `[BackendAPI] All retries failed` | 所有重试都失败 |
| `[BackendAPI] ⚠️ Using cached recommendations` | 使用缓存降级 |
| `[BackendAPI] ⚠️ No cache available` | 无缓存可用 |
| `[Cache] Cache hit` | 缓存命中 |
| `[Cache] No cache found` | 缓存未命中 |
| `[Cache] Cache expired` | 缓存已过期 |
| `[Cache] Cached X recommendations` | 缓存了 X 条推荐 |

### 前端日志关键字

| 日志 | 含义 |
|------|------|
| `[CartWhisper] Attempt X/3` | 第 X 次请求尝试 |
| `[CartWhisper] Response status: 200` | 请求成功 |
| `[CartWhisper] Retrying in Xms...` | X 毫秒后重试 |
| `[CartWhisper] All retries failed` | 所有重试都失败 |
| `[CartWhisper] Showing cached data warning` | 显示缓存提示 |

---

## ✅ 验证清单

测试完成后，确认以下功能正常：

- [ ] **正常流程**：后端可用时能正常获取推荐
- [ ] **自动重试**：后端暂时不可用时会重试 2 次
- [ ] **缓存写入**：成功获取推荐后会写入缓存
- [ ] **缓存降级**：后端完全不可用时会使用缓存
- [ ] **缓存提示**：使用缓存时显示橙色提示条
- [ ] **缓存过期**：超过 1 小时的缓存会被清理
- [ ] **超时控制**：单次请求超过 10 秒会自动中断
- [ ] **优雅降级**：没有缓存时返回空推荐而非错误

---

## 🐛 常见问题排查

### 问题 1: 缓存提示条不显示

**可能原因**:
- API 响应中没有 `fromCache: true` 字段
- 前端代码未正确读取 `data.fromCache`

**排查**:
1. 检查浏览器 Network 标签，查看 API 响应
2. 检查控制台是否有 JavaScript 错误
3. 确认 `cart-popup.liquid` 中的缓存判断逻辑

### 问题 2: 重试不生效

**可能原因**:
- 请求直接成功，无需重试
- 错误类型不会触发重试（如 CORS 错误）

**排查**:
1. 检查控制台日志，确认是否进入重试逻辑
2. 确认后端确实返回了错误状态码

### 问题 3: 缓存不生效

**可能原因**:
- 服务器重启导致内存缓存丢失
- 缓存已过期（超过 1 小时）
- ProductId 不匹配

**排查**:
1. 检查服务器日志中的 `[Cache]` 消息
2. 确认请求的 ProductId 与缓存的 ProductId 一致
3. 如需持久化缓存，考虑使用 Redis

---

## 🚀 性能指标

成功实施后的预期性能改进：

| 指标 | 优化前 | 优化后 | 改进 |
|------|--------|--------|------|
| **后端故障影响** | 100% 失败 | < 20% 失败 | ✅ 降低 80% |
| **平均响应时间** | 500ms | 50ms (缓存命中) | ✅ 提升 10 倍 |
| **用户可见错误** | 高 | 极低 | ✅ 大幅降低 |
| **服务可用性** | 99.0% | 99.9%+ | ✅ 提升可靠性 |

---

## 📝 测试报告模板

测试完成后填写：

```markdown
## 测试报告

**测试日期**: 2026-01-13
**测试人员**: [你的名字]
**测试环境**: Development / Production

### 场景 1: 正常请求
- [ ] 通过 / [ ] 失败
- 备注: ________________

### 场景 2: 缓存降级
- [ ] 通过 / [ ] 失败
- 备注: ________________

### 场景 3: 网络超时
- [ ] 通过 / [ ] 失败
- 备注: ________________

### 场景 4: 缓存过期
- [ ] 通过 / [ ] 失败
- 备注: ________________

### 场景 5: 前端重试
- [ ] 通过 / [ ] 失败
- 备注: ________________

### 发现的问题
1. ________________
2. ________________

### 改进建议
1. ________________
2. ________________
```

---

**最后更新**: 2026-01-13
**维护者**: CartWhisper AI Team
