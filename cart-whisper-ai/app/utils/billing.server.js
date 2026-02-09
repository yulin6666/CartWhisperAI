/**
 * Shopify Billing utility functions
 * Handles subscription creation, checking, cancellation, etc.
 */

import prisma from '../db.server';
import { getApiKey } from './shopConfig.server';

// Plan configuration
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
      analytics: 'basic', // Impressions and clicks only
      showWatermark: true, // Show watermark
    },
  },
  PRO: {
    name: 'Pro Plan',
    price: 19.99,
    interval: 'EVERY_30_DAYS',
    trialDays: 7,
    features: {
      maxProducts: 2000,
      recommendationsPerProduct: 3,
      apiCallsPerDay: 50000,
      manualRefreshPerMonth: 3,
      editableReasons: true,
      analytics: 'advanced', // Includes conversion rate and top recommendations
      prioritySupport: true,
      showWatermark: false, // No watermark
    },
  },
  MAX: {
    name: 'Max Plan',
    price: 49.99,
    interval: 'EVERY_30_DAYS',
    trialDays: 7,
    features: {
      maxProducts: Infinity,
      recommendationsPerProduct: 3,
      apiCallsPerDay: 100000,
      manualRefreshPerMonth: 10,
      editableReasons: true,
      analytics: 'advanced', // Includes conversion rate and top recommendations
      prioritySupport: true,
      premiumSupport: true,
      showWatermark: false, // No watermark
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
 * 检查商店是否有Max订阅
 */
export async function hasMaxPlan(shop) {
  const subscription = await getSubscription(shop);
  return subscription.plan === 'max' && subscription.status === 'active';
}

/**
 * 获取当前计划级别
 */
export async function getCurrentPlan(shop) {
  const subscription = await getSubscription(shop);
  if (subscription.status !== 'active') {
    return 'FREE';
  }
  return subscription.plan.toUpperCase();
}

/**
 * 检查是否有付费计划（PRO或MAX）
 */
export async function hasPaidPlan(shop) {
  const subscription = await getSubscription(shop);
  return (subscription.plan === 'pro' || subscription.plan === 'max') && subscription.status === 'active';
}

/**
 * 获取计划的功能限制
 */
export async function getPlanFeatures(shop) {
  const subscription = await getSubscription(shop);

  if (subscription.status !== 'active') {
    return PLANS.FREE.features;
  }

  const plan = subscription.plan.toUpperCase();
  return PLANS[plan]?.features || PLANS.FREE.features;
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
        returnUrl: `${process.env.SHOPIFY_APP_URL}/billing/callback?shop=${shop}`,
        trialDays: planConfig.trialDays || 0,
        // 生产环境必须设置 BILLING_TEST_MODE=false 以启用真实计费
        test: process.env.BILLING_TEST_MODE === 'true',
      },
    }
  );

  const result = await response.json();


  if (result.errors) {
    throw new Error(result.errors[0].message);
  }

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


  // 先尝试精确匹配
  let activeSubscription = activeSubscriptions.find(
    sub => sub.id === subscription.shopifySubscriptionId
  );

  if (activeSubscription) {
  } else {
    // 如果精确匹配失败，取最新的 ACTIVE 订阅（处理升级场景：Shopify 可能替换了订阅 ID）
    activeSubscription = activeSubscriptions.find(sub => sub.status === 'ACTIVE');
    if (activeSubscription) {
    } else {
    }
  }

  if (activeSubscription && activeSubscription.status === 'ACTIVE') {
    // 根据 Shopify 订阅的 name 来确定实际的 plan
    let confirmedPlan = subscription.plan;
    const subName = activeSubscription.name?.toLowerCase() || '';
    if (subName.includes('max')) {
      confirmedPlan = 'max';
    } else if (subName.includes('pro')) {
      confirmedPlan = 'pro';
    }

    // 更新订阅状态为激活
    await prisma.subscription.update({
      where: { shop },
      data: {
        plan: confirmedPlan,
        status: 'active',
        shopifySubscriptionId: activeSubscription.id,
        currentPeriodStart: new Date(activeSubscription.createdAt),
        currentPeriodEnd: activeSubscription.currentPeriodEnd
          ? new Date(activeSubscription.currentPeriodEnd)
          : null,
      },
    });

    // 验证 DB 写入
    const updatedSub = await prisma.subscription.findUnique({ where: { shop } });

    // Sync to backend PostgreSQL database
    try {
      const BACKEND_URL = process.env.CARTWHISPER_BACKEND_URL || 'https://cartwhisperaibackend-production.up.railway.app';
      const apiKey = await getApiKey(shop);
      const syncResponse = await fetch(`${BACKEND_URL}/api/shops/${shop}/plan`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify({
          plan: confirmedPlan,
          shopifySubscriptionId: activeSubscription.id,
          billingStatus: 'active',
          subscriptionStartedAt: new Date(activeSubscription.createdAt).toISOString(),
          subscriptionEndsAt: activeSubscription.currentPeriodEnd
            ? new Date(activeSubscription.currentPeriodEnd).toISOString()
            : null,
        }),
      });

    } catch (error) {
      // 不抛出错误，因为本地订阅已经成功
    }

    return true;
  }

  return false;
}

/**
 * 取消订阅
 */
export async function cancelSubscription(admin, shop) {
  const subscription = await getSubscription(shop);

  // 测试模式：直接降级，不调用Shopify API
  if (subscription.isTestMode || !subscription.shopifySubscriptionId) {
    await prisma.subscription.update({
      where: { shop },
      data: {
        plan: 'free',
        status: 'active',
        shopifySubscriptionId: null,
        cancelledAt: new Date(),
        isTestMode: subscription.isTestMode,
      },
    });

    // 同步到后端
    await syncPlanToBackend(shop, 'free');
    return true;
  }

  // 生产模式：取消Shopify订阅
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

  // 更新本地订阅状态：降级到 free，保持 active 状态，清除 shopifySubscriptionId
  await prisma.subscription.update({
    where: { shop },
    data: {
      plan: 'free',
      status: 'active',
      shopifySubscriptionId: null,
      cancelledAt: new Date(),
    },
  });


  // 同步到后端
  await syncPlanToBackend(shop, 'free');
  return true;
}

/**
 * 同步 plan 到后端 PostgreSQL
 */
async function syncPlanToBackend(shop, plan) {
  try {
    const BACKEND_URL = process.env.CARTWHISPER_BACKEND_URL || 'https://cartwhisperaibackend-production.up.railway.app';
    const apiKey = await getApiKey(shop);
    const syncResponse = await fetch(`${BACKEND_URL}/api/shops/${shop}/plan`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({
        plan,
        billingStatus: 'active',
      }),
    });

  } catch (error) {
  }
}

/**
 * 开发测试模式：直接升级到指定计划（跳过Shopify Billing API）
 * 用于应用未公开发布时的测试
 */
export async function directUpgrade(shop, plan = 'PRO') {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('directUpgrade is only available in development');
  }

  const planLower = plan.toLowerCase();
  const now = new Date();
  const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30天后

  await prisma.subscription.upsert({
    where: { shop },
    create: {
      shop,
      plan: planLower,
      status: 'active',
      isTestMode: true,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    },
    update: {
      plan: planLower,
      status: 'active',
      isTestMode: true,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    },
  });

  // Sync to backend PostgreSQL database
  try {
    const BACKEND_URL = process.env.CARTWHISPER_BACKEND_URL || 'https://cartwhisperaibackend-production.up.railway.app';
    const apiKey = await getApiKey(shop);
    const syncResponse = await fetch(`${BACKEND_URL}/api/shops/${shop}/plan`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({
        plan: planLower,
        billingStatus: 'active',
        subscriptionStartedAt: now.toISOString(),
        subscriptionEndsAt: periodEnd.toISOString(),
      }),
    });

  } catch (error) {
    // 不抛出错误，因为本地订阅已经成功
  }

  return planLower;
}

/**
 * 测试模式：手动切换计划（仅开发环境）
 * 循环切换：free -> pro -> max -> free
 */
export async function togglePlanTestMode(shop) {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('Test mode only available in development');
  }

  const subscription = await getSubscription(shop);
  let newPlan;

  // 循环切换计划
  if (subscription.plan === 'free') {
    newPlan = 'pro';
  } else if (subscription.plan === 'pro') {
    newPlan = 'max';
  } else {
    newPlan = 'free';
  }

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
