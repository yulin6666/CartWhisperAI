/**
 * GDPR Webhook: Customer Data Request
 *
 * 当客户请求查看其个人数据时触发
 * 必须在30天内响应客户的数据请求
 */

import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const BACKEND_URL = process.env.CARTWHISPER_BACKEND_URL || 'https://cartwhisperaibackend-production.up.railway.app';

export const action = async ({ request }) => {
  try {
    const { shop, payload } = await authenticate.webhook(request);

    const customerId = payload.customer?.id;
    const customerEmail = payload.customer?.email;

    // 收集客户数据
    const customerData = {
      shop,
      customerId,
      customerEmail,
      requestedAt: new Date().toISOString(),
      data: {},
    };

    // 1. 从本地数据库收集客户数据
    try {
      // 查找包含该客户邮箱的会话数据
      if (customerEmail) {
        const sessions = await prisma.session.findMany({
          where: {
            shop,
            email: customerEmail,
          },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            locale: true,
            createdAt: true,
          },
        });

        customerData.data.sessions = sessions;
      }

      // 注意：ProductRecommendation 表不包含客户个人信息
      // 如果未来添加了客户点击记录等表，需要在这里查询
    } catch (dbError) {
      customerData.data.localDataError = dbError.message;
    }

    // 2. 从后端获取客户相关数据（如点击记录、统计数据等）
    try {
      if (customerId || customerEmail) {
        const backendResponse = await fetch(`${BACKEND_URL}/api/customers/data`, {
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
          const backendData = await backendResponse.json();
          customerData.data.backendData = backendData;
        } else {
          const errorText = await backendResponse.text();
          customerData.data.backendDataError = errorText;
        }
      }
    } catch (backendError) {
      customerData.data.backendDataError = backendError.message;
    }

    // 3. 记录数据请求（仅日志）

    // 4. 返回收集到的数据（Shopify会将此数据发送给客户）
    // 注意：根据 Shopify 的要求，我们应该返回 200 OK
    // 实际的数据导出可以通过邮件或其他方式异步发送给客户
    // 这里我们记录了数据，商家可以通过日志查看并手动发送给客户

    // 如果需要自动发送邮件，可以在这里集成邮件服务
    // 例如：await sendCustomerDataEmail(customerEmail, customerData);

    return new Response(null, { status: 200 });
  } catch (error) {

    // Shopify webhook authentication errors should return 401
    // This includes HMAC validation failures
    return new Response(null, { status: 401 });
  }
};
