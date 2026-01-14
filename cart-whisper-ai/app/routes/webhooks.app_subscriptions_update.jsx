/**
 * APP_SUBSCRIPTIONS_UPDATE Webhook
 * 当订阅状态变化时Shopify会调用这个webhook
 */

import { authenticate } from '../shopify.server';
import prisma from '../db.server';

export async function action({ request }) {
  try {
    const { shop, payload } = await authenticate.webhook(request);

    console.log('[Webhook] APP_SUBSCRIPTIONS_UPDATE received for shop:', shop);
    console.log('[Webhook] Payload:', JSON.stringify(payload, null, 2));

    const { app_subscription } = payload;

    if (!app_subscription) {
      console.error('[Webhook] No app_subscription in payload');
      return new Response('OK', { status: 200 });
    }

    // 更新订阅状态
    const subscription = await prisma.subscription.findUnique({
      where: { shop },
    });

    if (!subscription) {
      console.log('[Webhook] No subscription found for shop, creating new one');
      await prisma.subscription.create({
        data: {
          shop,
          plan: app_subscription.status === 'ACTIVE' ? 'pro' : 'free',
          status: app_subscription.status.toLowerCase(),
          shopifySubscriptionId: app_subscription.admin_graphql_api_id,
        },
      });
    } else {
      console.log('[Webhook] Updating existing subscription');

      // 根据订阅状态更新计划
      let newPlan = subscription.plan;
      let newStatus = app_subscription.status.toLowerCase();

      if (app_subscription.status === 'ACTIVE') {
        newPlan = 'pro';
        newStatus = 'active';
      } else if (app_subscription.status === 'CANCELLED' || app_subscription.status === 'EXPIRED') {
        newPlan = 'free';
        newStatus = app_subscription.status.toLowerCase();
      }

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

    console.log('[Webhook] Subscription updated successfully');
    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('[Webhook] Error processing APP_SUBSCRIPTIONS_UPDATE:', error);
    return new Response('Error', { status: 500 });
  }
}
