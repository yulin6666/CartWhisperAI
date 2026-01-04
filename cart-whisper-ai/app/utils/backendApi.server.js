/**
 * CartWhisper 后端 API 客户端
 * 所有与后端的通信都通过这个模块
 */

// 后端 API 配置
const BACKEND_URL = process.env.CARTWHISPER_BACKEND_URL || 'https://cartwhisperaibackend-production.up.railway.app';

/**
 * 注册商店并获取 API Key
 * @param {string} domain - 商店域名
 * @returns {Promise<{success: boolean, apiKey: string, isNew: boolean}>}
 */
export async function registerShop(domain) {
  const response = await fetch(`${BACKEND_URL}/api/shops/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ domain }),
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
 * 获取商品推荐
 * @param {string} apiKey - API Key
 * @param {string} productId - 商品ID
 * @param {number} limit - 返回数量
 * @returns {Promise<{productId: string, recommendations: Array}>}
 */
export async function getRecommendations(apiKey, productId, limit = 3) {
  const url = `${BACKEND_URL}/api/recommendations/${productId}?limit=${limit}`;
  console.log('[BackendAPI] Fetching recommendations from:', url);
  console.log('[BackendAPI] Using API key:', apiKey?.slice(0, 10) + '...');

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-API-Key': apiKey,
      },
    });

    console.log('[BackendAPI] Response status:', response.status);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error('[BackendAPI] Error response:', error);
      throw new Error(error.error || `Get recommendations failed: ${response.status}`);
    }

    const data = await response.json();
    console.log('[BackendAPI] Got recommendations:', data.recommendations?.length || 0);
    return data;
  } catch (error) {
    console.error('[BackendAPI] Error in getRecommendations:', error.message);
    console.error('[BackendAPI] Stack:', error.stack);
    throw error;
  }
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
