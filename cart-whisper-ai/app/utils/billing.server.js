/**
 * Shopify Billing 工具函数
 * 处理订阅创建、检查、取消等操作
 */

import prisma from '../db.server';

// 计划配置
export const PLANS = {
  FREE: {
    name: 'Free Plan',
    price: 0,
    interval: 'ANNUAL',
    features: {
      maxProducts: 50,
      recommendationsPerProduct: 1,
      apiCallsPerDay: 5000,
      manualRefreshPerMonth: 1,
      editableReasons: false,
      analytics: true,
    },
  },
  PRO: {
    name: 'Pro Plan',
    price: 29.99,
    interval: 'EVERY_30_DAYS',
    trialDays: 7,
    features: {
      maxProducts: Infinity,
      recommendationsPerProduct: 2,
      apiCallsPerDay: 50000,
      manualRefreshPerMonth: 4,
      editableReasons: true,
      analytics: true,
      prioritySupport: true,
    },
  },
};

/**
 * 获取商店的订阅信息
 */
export async function getSubscription(shop) {
  let subscription = await prisma.subscription.findUnique({
    where: { shop },
  });

  // 如果没有订阅记录，创建免费版
  if (!subscription) {
    subscription = await prisma.subscription.create({
      data: {
        shop,
        plan: 'free',
        status: 'active',
      },
    });
  }

  return subscription;
}

/**
 * 检查商店是否有Pro订阅
 */
export async function hasProPlan(shop) {
  const subscription = await getSubscription(shop);
  return subscription.plan === 'pro' && subscription.status === 'active';
}

/**
 * 获取计划的功能限制
 */
export async function getPlanFeatures(shop) {
  const subscription = await getSubscription(shop);
  const isPro = subscription.plan === 'pro' && subscription.status === 'active';
  return isPro ? PLANS.PRO.features : PLANS.FREE.features;
}

/**
 * 创建Shopify订阅
 */
export async function createSubscription(admin, shop, plan = 'PRO') {
  const planConfig = PLANS[plan];

  if (!planConfig || plan === 'FREE') {
    throw new Error('Invalid plan');
  }

  // 创建订阅
  const response = await admin.graphql(
    `#graphql
      mutation AppSubscriptionCreate($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!, $trialDays: Int, $test: Boolean) {
        appSubscriptionCreate(
          name: $name
          lineItems: $lineItems
          returnUrl: $returnUrl
          trialDays: $trialDays
          test: $test
        ) {
          appSubscription {
            id
            status
            createdAt
          }
          confirmationUrl
          userErrors {
            field
            message
          }
        }
      }`,
    {
      variables: {
        name: planConfig.name,
        lineItems: [
          {
            plan: {
              appRecurringPricingDetails: {
                price: { amount: planConfig.price, currencyCode: 'USD' },
                interval: planConfig.interval,
              },
            },
          },
        ],
        returnUrl: `${process.env.SHOPIFY_APP_URL}/app/billing/callback`,
        trialDays: planConfig.trialDays || 0,
        test: process.env.NODE_ENV === 'development', // 开发环境使用测试模式
      },
    }
  );

  const result = await response.json();

  if (result.data.appSubscriptionCreate.userErrors.length > 0) {
    throw new Error(result.data.appSubscriptionCreate.userErrors[0].message);
  }

  const { appSubscription, confirmationUrl } = result.data.appSubscriptionCreate;

  // 保存订阅信息（待确认状态）
  await prisma.subscription.upsert({
    where: { shop },
    create: {
      shop,
      plan: plan.toLowerCase(),
      status: 'pending',
      shopifySubscriptionId: appSubscription.id,
      isTestMode: process.env.NODE_ENV === 'development',
    },
    update: {
      plan: plan.toLowerCase(),
      status: 'pending',
      shopifySubscriptionId: appSubscription.id,
      isTestMode: process.env.NODE_ENV === 'development',
    },
  });

  return { confirmationUrl, subscriptionId: appSubscription.id };
}

/**
 * 确认订阅（用户完成支付后）
 */
export async function confirmSubscription(admin, shop) {
  const subscription = await getSubscription(shop);

  if (!subscription.shopifySubscriptionId) {
    throw new Error('No pending subscription found');
  }

  // 查询Shopify订阅状态
  const response = await admin.graphql(
    `#graphql
      query {
        currentAppInstallation {
          activeSubscriptions {
            id
            name
            status
            createdAt
            currentPeriodEnd
            trialDays
          }
        }
      }`
  );

  const result = await response.json();
  const activeSubscriptions = result.data.currentAppInstallation.activeSubscriptions;

  const activeSubscription = activeSubscriptions.find(
    sub => sub.id === subscription.shopifySubscriptionId
  );

  if (activeSubscription && activeSubscription.status === 'ACTIVE') {
    // 更新订阅状态为激活
    await prisma.subscription.update({
      where: { shop },
      data: {
        status: 'active',
        currentPeriodStart: new Date(activeSubscription.createdAt),
        currentPeriodEnd: activeSubscription.currentPeriodEnd
          ? new Date(activeSubscription.currentPeriodEnd)
          : null,
      },
    });

    return true;
  }

  return false;
}

/**
 * 取消订阅
 */
export async function cancelSubscription(admin, shop) {
  const subscription = await getSubscription(shop);

  if (!subscription.shopifySubscriptionId) {
    throw new Error('No active subscription found');
  }

  // 取消Shopify订阅
  const response = await admin.graphql(
    `#graphql
      mutation AppSubscriptionCancel($id: ID!) {
        appSubscriptionCancel(id: $id) {
          appSubscription {
            id
            status
          }
          userErrors {
            field
            message
          }
        }
      }`,
    {
      variables: {
        id: subscription.shopifySubscriptionId,
      },
    }
  );

  const result = await response.json();

  if (result.data.appSubscriptionCancel.userErrors.length > 0) {
    throw new Error(result.data.appSubscriptionCancel.userErrors[0].message);
  }

  // 更新本地订阅状态
  await prisma.subscription.update({
    where: { shop },
    data: {
      plan: 'free',
      status: 'cancelled',
      cancelledAt: new Date(),
    },
  });

  return true;
}

/**
 * 测试模式：手动切换计划（仅开发环境）
 */
export async function togglePlanTestMode(shop) {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('Test mode only available in development');
  }

  const subscription = await getSubscription(shop);
  const newPlan = subscription.plan === 'pro' ? 'free' : 'pro';

  await prisma.subscription.update({
    where: { shop },
    data: {
      plan: newPlan,
      status: 'active',
      isTestMode: true,
    },
  });

  return newPlan;
}

/**
 * 检查功能是否可用
 */
export async function checkFeatureAccess(shop, feature) {
  const features = await getPlanFeatures(shop);
  return features[feature] !== undefined ? features[feature] : false;
}
