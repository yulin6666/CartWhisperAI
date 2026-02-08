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
  console.log('[BILLING] action | method:', request.method);

  try {
    const { admin, session } = await authenticate.admin(request);
    const shop = session.shop;
    const formData = await request.formData();
    const actionType = formData.get('action');

    console.log('[BILLING] action | type:', actionType, '| shop:', shop);

    if (actionType === 'upgrade') {
      const plan = formData.get('plan') || 'PRO';
      console.log('[BILLING] action | upgrade to plan:', plan);

      try {
      const result = await createSubscription(admin, shop, plan);
      console.log('[BILLING] action | confirmationUrl:', result.confirmationUrl);

        if (!result.confirmationUrl) {
          throw new Error('No confirmation URL returned from Shopify');
        }

        return Response.json({
          confirmationUrl: result.confirmationUrl
        });
      } catch (subscriptionError) {
        console.error('[BILLING] action | upgrade failed:', subscriptionError.message);
        throw subscriptionError;
      }
    }

    if (actionType === 'downgrade') {
      const targetPlan = formData.get('targetPlan') || 'FREE';
      console.log('[BILLING] action | downgrade to:', targetPlan);

      try {
        if (targetPlan.toUpperCase() === 'FREE') {
          await cancelSubscription(admin, shop);
          console.log('[BILLING] action | downgrade to FREE success');
          return Response.json({ success: true, newPlan: 'free' });
        }

        // MAX → PRO: 取消当前订阅，创建新的 PRO 订阅
        console.log('[BILLING] action | downgrade MAX→PRO: cancelling current, creating PRO subscription');
        await cancelSubscription(admin, shop);
        const result = await createSubscription(admin, shop, targetPlan.toUpperCase());
        console.log('[BILLING] action | downgrade MAX→PRO: confirmationUrl:', result.confirmationUrl);

        if (!result.confirmationUrl) {
          throw new Error('No confirmation URL returned from Shopify');
        }

        return Response.json({ confirmationUrl: result.confirmationUrl });
      } catch (downgradeError) {
        console.error('[BILLING] action | downgrade failed:', downgradeError.message);
        return Response.json({ error: downgradeError.message }, { status: 500 });
      }
    }

    console.warn('[BILLING] action | unknown action:', actionType);
    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('[BILLING] action | ERROR:', error.message);
    return Response.json({
      error: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

export default function Billing() {
  return null; // 这个路由主要用于处理action，不需要UI
}
