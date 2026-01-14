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
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const action = formData.get('action');

  try {
    if (action === 'upgrade') {
      // 创建Pro订阅
      const { confirmationUrl } = await createSubscription(admin, shop, 'PRO');

      // 重定向到Shopify支付确认页面
      return redirect(confirmationUrl);
    }

    if (action === 'toggle_test') {
      // 测试模式：切换计划
      if (process.env.NODE_ENV !== 'development') {
        return Response.json({ error: 'Test mode only available in development' }, { status: 403 });
      }

      const newPlan = await togglePlanTestMode(shop);
      return { success: true, newPlan };
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('[Billing] Action error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export default function Billing() {
  return null; // 这个路由主要用于处理action，不需要UI
}
