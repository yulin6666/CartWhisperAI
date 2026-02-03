/**
 * GDPR Webhook: Shop Data Erasure
 *
 * 当商店卸载App后48小时触发
 * 必须删除该商店的所有数据
 */

import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  try {
    const { shop, payload } = await authenticate.webhook(request);

    console.log('[GDPR] Shop redaction request received:', {
      shop,
      shop_id: payload.shop_id,
      shop_domain: payload.shop_domain,
    });

    // TODO: 实现实际的商店数据删除逻辑
    // 1. 删除该商店的所有产品数据
    // 2. 删除该商店的所有推荐数据
    // 3. 删除该商店的订阅信息
    // 4. 删除该商店的统计数据
    // 5. 记录删除操作日志

    // 目前返回200 OK表示已收到请求
    return new Response(null, { status: 200 });
  } catch (error) {
    console.error('[GDPR] Shop redaction error:', error);

    // Shopify webhook authentication errors should return 401
    // This includes HMAC validation failures
    return new Response(null, { status: 401 });
  }
};
