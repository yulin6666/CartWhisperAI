/**
 * 订阅管理路由
 * 处理订阅创建、升级、降级
 */

import { redirect } from 'react-router';
import { authenticate } from '../shopify.server';
import { createSubscription, getSubscription, cancelSubscription } from '../utils/billing.server';

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
      // 创建 Shopify 订阅
      const result = await createSubscription(admin, shop, plan);
      console.log('[Billing] Subscription created, confirmationUrl:', result.confirmationUrl);

        if (!result.confirmationUrl) {
          throw new Error('No confirmation URL returned from Shopify');
        }

        // 返回 confirmationUrl 给前端，由前端使用 App Bridge 跳转
        console.log('[Billing] Returning confirmationUrl to frontend:', result.confirmationUrl);
        return Response.json({
          confirmationUrl: result.confirmationUrl
        });
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

    if (actionType === 'downgrade') {
      const targetPlan = formData.get('targetPlan') || 'FREE';
      console.log('[Billing] Downgrading to plan:', targetPlan);

      try {
        if (targetPlan.toUpperCase() === 'FREE') {
          // 降级到 FREE = 取消订阅
          await cancelSubscription(admin, shop);
          console.log('[Billing] Successfully downgraded to FREE');
          return Response.json({ success: true, newPlan: 'free' });
        }

        // 未来支持 MAX -> PRO 降级（需要取消当前订阅并创建新订阅）
        console.warn('[Billing] Downgrade to non-FREE plan not yet supported');
        return Response.json({ error: 'Downgrade to this plan is not yet supported' }, { status: 400 });
      } catch (downgradeError) {
        console.error('[Billing] Downgrade failed:', downgradeError);
        return Response.json({ error: downgradeError.message }, { status: 500 });
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
