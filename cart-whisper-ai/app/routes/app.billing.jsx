/**
 * 订阅管理路由
 * 处理订阅创建、升级、降级
 */

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

  try {
    const { admin, session } = await authenticate.admin(request);
    const shop = session.shop;
    const formData = await request.formData();
    const actionType = formData.get('action');


    if (actionType === 'upgrade') {
      const plan = formData.get('plan') || 'PRO';

      try {
      const result = await createSubscription(admin, shop, plan);

        if (!result.confirmationUrl) {
          throw new Error('No confirmation URL returned from Shopify');
        }

        return Response.json({
          confirmationUrl: result.confirmationUrl
        });
      } catch (subscriptionError) {
        throw subscriptionError;
      }
    }

    if (actionType === 'downgrade') {
      const targetPlan = formData.get('targetPlan') || 'FREE';

      try {
        if (targetPlan.toUpperCase() === 'FREE') {
          await cancelSubscription(admin, shop);
          return Response.json({ success: true, newPlan: 'free' });
        }

        // MAX → PRO: 取消当前订阅，创建新的 PRO 订阅
        await cancelSubscription(admin, shop);
        const result = await createSubscription(admin, shop, targetPlan.toUpperCase());

        if (!result.confirmationUrl) {
          throw new Error('No confirmation URL returned from Shopify');
        }

        return Response.json({ confirmationUrl: result.confirmationUrl });
      } catch (downgradeError) {
        return Response.json({ error: 'Downgrade failed' }, { status: 500 });
      }
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return Response.json({
      error: 'Internal server error',
    }, { status: 500 });
  }
}

export default function Billing() {
  return null; // 这个路由主要用于处理action，不需要UI
}
