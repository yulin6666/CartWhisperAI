/**
 * CartWhisper 后端 API 客户端
 * 所有与后端的通信都通过这个模块
 */

import { getCachedRecommendations, setCachedRecommendations } from './recommendationCache.server.js';

// 后端 API 配置
const BACKEND_URL = process.env.CARTWHISPER_BACKEND_URL || 'https://cartwhisperaibackend-production.up.railway.app';

/**
 * 注册商店并获取 API Key
 * @param {string} domain - 商店域名
 * @param {string} planName - Shopify plan名称（可选）
 * @returns {Promise<{success: boolean, apiKey: string, isNew: boolean, isDevelopmentStore: boolean, isWhitelisted: boolean}>}
 */
export async function registerShop(domain, planName = null) {
  const response = await fetch(`${BACKEND_URL}/api/shops/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ domain, planName }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Registration failed: ${response.status}`);
  }

  return response.json();
}

/**
 * 同步商品到后端（会自动生成推荐）
 * @param {string} apiKey - API Key
 * @param {Array} products - 商品数组
 * @param {string} mode - 同步模式: 'auto' (默认), 'refresh' (强制刷新)
 * @returns {Promise<{success: boolean, mode: string, products: number, newRecommendations: number, totalRecommendations: number, canRefresh: boolean, nextRefreshAt: string}>}
 */
export async function syncProducts(apiKey, products, mode = 'auto') {
  // 设置 1800 秒（30分钟）超时
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1800000);

  try {
    const response = await fetch(`${BACKEND_URL}/api/products/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({ products, mode }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      // Include rate limit info if available
      if (error.nextRefreshAt) {
        throw new Error(`${error.error}|${error.nextRefreshAt}|${error.daysRemaining}`);
      }
      throw new Error(error.error || `Sync failed: ${response.status}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 获取商店同步状态
 * @param {string} apiKey - API Key
 * @returns {Promise<{syncStatus: {initialSyncDone: boolean, lastRefreshAt: string, productCount: number, recommendationCount: number, plan: string, canRefresh: boolean, nextRefreshAt: string, daysUntilRefresh: number}}>}
 */
export async function getSyncStatus(apiKey) {
  const response = await fetch(`${BACKEND_URL}/api/shops/sync-status`, {
    method: 'GET',
    headers: {
      'X-API-Key': apiKey,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Get sync status failed: ${response.status}`);
  }

  return response.json();
}

/**
 * 获取商品推荐（带重试和缓存降级）
 * @param {string} apiKey - API Key
 * @param {string} productId - 商品ID
 * @param {number} limit - 返回数量
 * @param {number} retries - 重试次数
 * @returns {Promise<{productId: string, recommendations: Array, fromCache?: boolean}>}
 */
export async function getRecommendations(apiKey, productId, limit = 3, retries = 2) {
  const url = `${BACKEND_URL}/api/recommendations/${productId}?limit=${limit}`;

  // 尝试从缓存获取
  const cached = getCachedRecommendations(productId, limit);

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时

    try {

      const response = await fetch(url, {
        method: 'GET',
        headers: { 'X-API-Key': apiKey },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      const data = await response.json();

      // 成功时更新缓存
      if (data.recommendations?.length > 0) {
        setCachedRecommendations(productId, limit, data.recommendations);
      }

      return { ...data, fromCache: false };

    } catch (error) {
      clearTimeout(timeoutId);

      const errorMsg = error.name === 'AbortError' ? 'Request timeout' : error.message;

      // 最后一次重试失败
      if (attempt === retries) {

        // 尝试使用缓存降级
        if (cached) {
          return {
            productId,
            recommendations: cached,
            fromCache: true,
            cacheWarning: 'Backend temporarily unavailable, showing cached results',
          };
        }

        // 没有缓存，返回空结果
        return {
          productId,
          recommendations: [],
          fromCache: false,
          error: 'Service temporarily unavailable',
        };
      }

      // 指数退避：等待后重试
      const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // 理论上不会到这里，但为了类型安全
  return { productId, recommendations: [], fromCache: false };
}

/**
 * 健康检查
 * @returns {Promise<{status: string, ai: boolean}>}
 */
export async function healthCheck() {
  const response = await fetch(`${BACKEND_URL}/api/health`);
  return response.json();
}

/**
 * 获取统计数据
 * @param {string} apiKey - API Key
 * @returns {Promise<{statistics: {summary: {totalImpressions, totalClicks, ctr}, topByCtr: Array, topByClicks: Array, topSourceProducts: Array}}>}
 */
export async function getStatistics(apiKey) {
  const response = await fetch(`${BACKEND_URL}/api/statistics`, {
    method: 'GET',
    headers: {
      'X-API-Key': apiKey,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Get statistics failed: ${response.status}`);
  }

  return response.json();
}

export { BACKEND_URL };
