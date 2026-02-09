/**
 * GDPR Webhook: Customer Data Erasure
 *
 * 当客户请求删除其个人数据时触发（GDPR "被遗忘权"）
 * 必须在30天内删除客户的个人数据
 */

import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const BACKEND_URL = process.env.CARTWHISPER_BACKEND_URL || 'https://cartwhisperaibackend-production.up.railway.app';

export const action = async ({ request }) => {
  try {
    const { shop, payload } = await authenticate.webhook(request);

    const customerId = payload.customer?.id;
    const customerEmail = payload.customer?.email;

    // 1. 删除本地数据库中的客户个人数据
    try {
      // 删除包含该客户邮箱的会话数据
      if (customerEmail) {
        const deletedSessions = await prisma.session.deleteMany({
          where: {
            shop,
            email: customerEmail,
          },
        });
      }

      // 注意：ProductRecommendation 表不包含客户个人信息，无需删除
      // 如果未来添加了客户点击记录等表，需要在这里删除
    } catch (dbError) {
      // 继续执行后端清理，即使本地清理失败
    }

    // 2. 通知后端删除客户相关数据（如点击记录、统计数据等）
    try {
      if (customerId || customerEmail) {
        const backendResponse = await fetch(`${BACKEND_URL}/api/customers/redact`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            shop,
            customerId,
            customerEmail,
          }),
        });

        if (backendResponse.ok) {
        } else {
          const errorText = await backendResponse.text();
        }
      }
    } catch (backendError) {
      // 不抛出错误，因为本地数据已经删除
    }

    // 3. 记录删除操作（仅日志，不存储到数据库）

    return new Response(null, { status: 200 });
  } catch (error) {

    // Shopify webhook authentication errors should return 401
    // This includes HMAC validation failures
    return new Response(null, { status: 401 });
  }
};
