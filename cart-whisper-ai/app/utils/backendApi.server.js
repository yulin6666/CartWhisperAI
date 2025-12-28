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
 * @returns {Promise<{success: boolean, products: number, recommendations: number}>}
 */
export async function syncProducts(apiKey, products) {
  const response = await fetch(`${BACKEND_URL}/api/products/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify({ products }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Sync failed: ${response.status}`);
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

export { BACKEND_URL };
