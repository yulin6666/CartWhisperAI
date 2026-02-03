/**
 * 订阅管理路由
 * 处理订阅创建、升级、降级
 */

import { redirect } from 'react-router';
import { authenticate } from '../shopify.server';
import { createSubscription, getSubscription } from '../utils/billing.server';

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const subscription = await getSubscription(shop);

  return {
    subscription,
    isTestMode: process.env.NODE_ENV === 'development',
  };
}

export async function action({ request }) {
  console.log('[Billing] Received request:', request.method, request.url);

  try {
    const { admin, session } = await authenticate.admin(request);
    const shop = session.shop;
    const formData = await request.formData();
    const actionType = formData.get('action');

    console.log('[Billing] Action:', actionType, 'Shop:', shop);

    if (actionType === 'upgrade') {
      // 获取要升级的计划（PRO或MAX）
      const plan = formData.get('plan') || 'PRO';
      console.log('[Billing] Creating subscription for plan:', plan);

      try {
        // 创建Shopify订阅（测试模式下会设置test: true，不会真实扣费但会显示确认页面）
        const result = await createSubscription(admin, shop, plan);
        console.log('[Billing] Subscription created successfully');
        console.log('[Billing] Confirmation URL:', result.confirmationUrl);
        console.log('[Billing] Subscription ID:', result.subscriptionId);

        if (!result.confirmationUrl) {
          throw new Error('No confirmation URL returned from Shopify');
        }

        // 重定向到Shopify支付确认页面
        console.log('[Billing] Redirecting to:', result.confirmationUrl);
        return redirect(result.confirmationUrl);
      } catch (subscriptionError) {
        console.error('[Billing] Subscription creation failed:', subscriptionError);
        console.error('[Billing] Error details:', {
          message: subscriptionError.message,
          stack: subscriptionError.stack,
          name: subscriptionError.name
        });
        throw subscriptionError;
      }
    }


    console.warn('[Billing] Invalid action:', actionType);
    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('[Billing] Action error:', error.message);
    console.error('[Billing] Stack:', error.stack);
    console.error('[Billing] Full error:', JSON.stringify(error, null, 2));
    return Response.json({
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

export default function Billing() {
  return null; // 这个路由主要用于处理action，不需要UI
}
