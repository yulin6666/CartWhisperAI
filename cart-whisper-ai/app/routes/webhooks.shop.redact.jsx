/**
 * GDPR Webhook: Shop Data Erasure
 *
 * 当商店卸载App后48小时触发
 * 必须删除该商店的所有数据
 */

import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const BACKEND_URL = process.env.CARTWHISPER_BACKEND_URL || 'https://cartwhisperaibackend-production.up.railway.app';

export const action = async ({ request }) => {
  try {
    const { shop, payload } = await authenticate.webhook(request);

    // 1. 删除本地数据库中的商店数据
    try {
      // 删除会话数据
      const deletedSessions = await prisma.session.deleteMany({
        where: { shop },
      });

      // 删除订阅信息
      const deletedSubscriptions = await prisma.subscription.deleteMany({
        where: { shop },
      });

      // 删除产品推荐数据
      const deletedRecommendations = await prisma.productRecommendation.deleteMany({
        where: { shop },
      });
    } catch (dbError) {
      // 继续执行后端清理，即使本地清理失败
    }

    // 2. 删除后端数据库中的商店数据
    try {
      const backendResponse = await fetch(`${BACKEND_URL}/api/shops/${shop}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (backendResponse.ok) {
      } else {
        const errorText = await backendResponse.text();
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
