/**
 * 推荐缓存管理模块（降级方案）
 * 当后端服务不可用时，使用缓存的推荐结果
 */

// 简单的内存缓存（生产环境建议用 Redis）
const cache = new Map();
const CACHE_TTL = 3600000; // 1小时

/**
 * 生成缓存键
 */
function getCacheKey(productId, limit) {
  return `${productId}:${limit}`;
}

/**
 * 获取缓存的推荐
 * @param {string} productId - 商品ID
 * @param {number} limit - 推荐数量
 * @returns {Array|null} 缓存的推荐数组或null
 */
export function getCachedRecommendations(productId, limit = 3) {
  const key = getCacheKey(productId, limit);
  const cached = cache.get(key);

  if (!cached) {
    console.log(`[Cache] No cache found for product ${productId}`);
    return null;
  }

  // 检查是否过期
  const age = Date.now() - cached.timestamp;
  if (age > CACHE_TTL) {
    console.log(`[Cache] Cache expired for product ${productId} (age: ${Math.round(age/1000)}s)`);
    cache.delete(key);
    return null;
  }

  console.log(`[Cache] Cache hit for product ${productId} (age: ${Math.round(age/1000)}s)`);
  return cached.data;
}

/**
 * 设置推荐缓存
 * @param {string} productId - 商品ID
 * @param {number} limit - 推荐数量
 * @param {Array} recommendations - 推荐数组
 */
export function setCachedRecommendations(productId, limit, recommendations) {
  const key = getCacheKey(productId, limit);
  cache.set(key, {
    data: recommendations,
    timestamp: Date.now(),
  });
  console.log(`[Cache] Cached ${recommendations.length} recommendations for product ${productId}`);
}

/**
 * 清除特定商品的缓存
 * @param {string} productId - 商品ID
 */
export function clearCacheForProduct(productId) {
  let cleared = 0;
  for (const key of cache.keys()) {
    if (key.startsWith(`${productId}:`)) {
      cache.delete(key);
      cleared++;
    }
  }
  console.log(`[Cache] Cleared ${cleared} cache entries for product ${productId}`);
}

/**
 * 清除所有缓存
 */
export function clearAllCache() {
  const size = cache.size;
  cache.clear();
  console.log(`[Cache] Cleared all ${size} cache entries`);
}

/**
 * 获取缓存统计
 */
export function getCacheStats() {
  const now = Date.now();
  let valid = 0;
  let expired = 0;

  for (const [key, value] of cache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      expired++;
    } else {
      valid++;
    }
  }

  return {
    total: cache.size,
    valid,
    expired,
    ttlSeconds: CACHE_TTL / 1000,
  };
}

/**
 * 清理过期缓存（定期任务）
 */
function cleanupExpiredCache() {
  const now = Date.now();
  let cleaned = 0;

  for (const [key, value] of cache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      cache.delete(key);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`[Cache] Cleanup removed ${cleaned} expired entries`);
  }
}

// 每10分钟清理一次过期缓存
setInterval(cleanupExpiredCache, 600000);

console.log('[Cache] Recommendation cache initialized (TTL: 1 hour)');
