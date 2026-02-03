/**
 * GDPR Webhook: Customer Data Request
 *
 * 当客户请求查看其个人数据时触发
 * 必须在30天内响应客户的数据请求
 */

import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  try {
    const { shop, payload } = await authenticate.webhook(request);

    console.log('[GDPR] Customer data request received:', {
      shop,
      customer: payload.customer,
      orders_requested: payload.orders_requested,
    });

    // TODO: 实现实际的数据导出逻辑
    // 1. 收集该客户的所有数据（订单、推荐点击记录等）
    // 2. 生成数据报告
    // 3. 通过邮件发送给客户

    // 目前返回200 OK表示已收到请求
    return new Response(null, { status: 200 });
  } catch (error) {
    console.error('[GDPR] Customer data request error:', error);

    // Shopify webhook authentication errors should return 401
    // This includes HMAC validation failures
    return new Response(null, { status: 401 });
  }
};
