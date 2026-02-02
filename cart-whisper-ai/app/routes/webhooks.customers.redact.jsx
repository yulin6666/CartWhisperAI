/**
 * GDPR Webhook: Customer Data Erasure
 *
 * 当客户请求删除其个人数据时触发（GDPR "被遗忘权"）
 * 必须在30天内删除客户的个人数据
 */

import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  try {
    const { shop, payload } = await authenticate.webhook(request);

    console.log('[GDPR] Customer redaction request received:', {
      shop,
      customer: payload.customer,
      orders_to_redact: payload.orders_to_redact,
    });

    // TODO: 实现实际的数据删除逻辑
    // 1. 删除该客户的所有个人数据
    // 2. 匿名化或删除推荐点击记录中的客户信息
    // 3. 记录删除操作日志

    // 目前返回200 OK表示已收到请求
    return new Response(null, { status: 200 });
  } catch (error) {
    console.error('[GDPR] Customer redaction error:', error);
    return new Response(null, { status: 500 });
  }
};
