/**
 * 订阅管理路由
 * 处理订阅创建、升级、降级
 */

import { redirect } from 'react-router';
import { authenticate } from '../shopify.server';
import { createSubscription, getSubscription, togglePlanTestMode } from '../utils/billing.server';

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

      // 开发测试模式：直接更新数据库，跳过Shopify Billing API
      if (process.env.SHOPIFY_TEST_MODE === 'true') {
        console.log('[Billing] Test mode: Directly updating subscription in database');
        const { directUpgrade } = await import('../utils/billing.server.js');
        await directUpgrade(shop, plan);
        return redirect('/app?upgraded=true');
      }

      // 生产模式：创建真实的Shopify订阅
      const result = await createSubscription(admin, shop, plan);
      console.log('[Billing] Subscription created, confirmationUrl:', result.confirmationUrl);

      // 重定向到Shopify支付确认页面
      return redirect(result.confirmationUrl);
    }

    if (actionType === 'toggle_test') {
      // 测试模式：切换计划
      if (process.env.NODE_ENV !== 'development') {
        console.warn('[Billing] Test mode attempted outside development');
        return Response.json({ error: 'Test mode only available in development' }, { status: 403 });
      }

      console.log('[Billing] Toggling test plan for:', shop);
      const newPlan = await togglePlanTestMode(shop);
      console.log('[Billing] New plan:', newPlan);
      return { success: true, newPlan };
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
