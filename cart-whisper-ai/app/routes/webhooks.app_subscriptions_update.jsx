/**
 * APP_SUBSCRIPTIONS_UPDATE Webhook
 * 当订阅状态变化时Shopify会调用这个webhook
 */

import { authenticate } from '../shopify.server';
import prisma from '../db.server';

/**
 * 根据 Shopify 订阅信息推断实际 plan
 */
function detectPlanFromSubscription(appSubscription) {
  const name = (appSubscription.name || '').toLowerCase();
  const price = parseFloat(appSubscription.price || '0');

  if (name.includes('max') || price >= 49) {
    return 'max';
  }
  if (name.includes('pro') || price >= 19) {
    return 'pro';
  }
  return 'pro'; // 默认付费计划为 pro
}

export async function action({ request }) {
  try {
    const { shop, payload } = await authenticate.webhook(request);

    console.log('[BILLING] webhook | APP_SUBSCRIPTIONS_UPDATE for shop:', shop);
    console.log('[BILLING] webhook | payload:', JSON.stringify(payload, null, 2));

    const { app_subscription } = payload;

    if (!app_subscription) {
      console.error('[BILLING] webhook | No app_subscription in payload');
      return new Response('OK', { status: 200 });
    }

    const subscription = await prisma.subscription.findUnique({
      where: { shop },
    });

    if (!subscription) {
      console.log('[BILLING] webhook | No subscription found, creating new one');
      const detectedPlan = app_subscription.status === 'ACTIVE'
        ? detectPlanFromSubscription(app_subscription)
        : 'free';
      await prisma.subscription.create({
        data: {
          shop,
          plan: detectedPlan,
          status: app_subscription.status.toLowerCase(),
          shopifySubscriptionId: app_subscription.admin_graphql_api_id,
        },
      });
      console.log('[BILLING] webhook | Created: plan=%s status=%s', detectedPlan, app_subscription.status);
    } else {
      let newPlan = subscription.plan;
      let newStatus = app_subscription.status.toLowerCase();

      if (app_subscription.status === 'ACTIVE') {
        // 根据订阅名称和价格推断 plan，而不是硬编码 pro
        newPlan = detectPlanFromSubscription(app_subscription);
        newStatus = 'active';
      } else if (app_subscription.status === 'CANCELLED' || app_subscription.status === 'EXPIRED') {
        // 只有当被取消的订阅 ID 和当前 DB 中的一致时，才降级到 free
        // 避免升级时旧订阅的 CANCELLED webhook 覆盖新订阅
        if (app_subscription.admin_graphql_api_id === subscription.shopifySubscriptionId) {
          newPlan = 'free';
        } else {
          console.log('[BILLING] webhook | CANCELLED for old subscription %s, current is %s — skipping downgrade',
            app_subscription.admin_graphql_api_id, subscription.shopifySubscriptionId);
          return new Response('OK', { status: 200 });
        }
      }

      console.log('[BILLING] webhook | Updating: plan=%s→%s status=%s→%s shopifyId=%s',
        subscription.plan, newPlan, subscription.status, newStatus, app_subscription.admin_graphql_api_id);

      await prisma.subscription.update({
        where: { shop },
        data: {
          plan: newPlan,
          status: newStatus,
          shopifySubscriptionId: app_subscription.admin_graphql_api_id,
          cancelledAt: app_subscription.status === 'CANCELLED' ? new Date() : null,
        },
      });
    }

    console.log('[BILLING] webhook | Done');
    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('[BILLING] webhook | Error:', error);
    return new Response('Unauthorized', { status: 401 });
  }
}
