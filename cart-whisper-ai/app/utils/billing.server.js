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
      analytics: 'basic', // 只有曝光和点击数
      showWatermark: true, // 显示水印
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
      analytics: 'advanced', // 包含转化率和Top推荐
      prioritySupport: true,
      showWatermark: false, // 不显示水印
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
      analytics: 'advanced', // 包含转化率和Top推荐
      prioritySupport: true,
      premiumSupport: true,
      showWatermark: false, // 不显示水印
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
  console.log('[createSubscription] Starting for plan:', plan, 'shop:', shop);

  const planConfig = PLANS[plan];

  if (!planConfig || plan === 'FREE') {
    console.error('[createSubscription] Invalid plan:', plan);
    throw new Error('Invalid plan');
  }

  console.log('[createSubscription] Plan config:', planConfig);
  console.log('[createSubscription] Return URL:', `${process.env.SHOPIFY_APP_URL}/app/billing/callback`);

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
        returnUrl: `${process.env.SHOPIFY_APP_URL}/app/billing/callback?shop=${shop}`,
        trialDays: planConfig.trialDays || 0,
        test: true, // 暂时总是使用测试模式，等应用通过审核后再改为：process.env.NODE_ENV !== 'production'
      },
    }
  );

  const result = await response.json();

  console.log('[createSubscription] GraphQL response:', JSON.stringify(result, null, 2));

  if (result.errors) {
    console.error('[createSubscription] GraphQL errors:', result.errors);
    throw new Error(result.errors[0].message);
  }

  if (result.data.appSubscriptionCreate.userErrors.length > 0) {
    console.error('[createSubscription] User errors:', result.data.appSubscriptionCreate.userErrors);
    throw new Error(result.data.appSubscriptionCreate.userErrors[0].message);
  }

  const { appSubscription, confirmationUrl } = result.data.appSubscriptionCreate;
  console.log('[createSubscription] Confirmation URL:', confirmationUrl);

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

    // 同步到后端 PostgreSQL 数据库
    try {
      const BACKEND_URL = process.env.CARTWHISPER_BACKEND_URL || 'https://cartwhisperaibackend-production.up.railway.app';
      const syncResponse = await fetch(`${BACKEND_URL}/api/shops/${shop}/plan`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          plan: subscription.plan,
          shopifySubscriptionId: subscription.shopifySubscriptionId,
          billingStatus: 'active',
          subscriptionStartedAt: new Date(activeSubscription.createdAt).toISOString(),
          subscriptionEndsAt: activeSubscription.currentPeriodEnd
            ? new Date(activeSubscription.currentPeriodEnd).toISOString()
            : null,
        }),
      });

      if (!syncResponse.ok) {
        console.error('[confirmSubscription] Failed to sync to backend:', await syncResponse.text());
      } else {
        console.log('[confirmSubscription] Successfully synced plan to backend');
      }
    } catch (error) {
      console.error('[confirmSubscription] Error syncing to backend:', error);
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
    console.log('[cancelSubscription] Test mode or no Shopify subscription - direct downgrade');
    await prisma.subscription.update({
      where: { shop },
      data: {
        plan: 'free',
        status: 'active', // 保持active状态，只是降级到free
        cancelledAt: new Date(),
        isTestMode: subscription.isTestMode, // 保持测试模式标记
      },
    });
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
 * 开发测试模式：直接升级到指定计划（跳过Shopify Billing API）
 * 用于应用未公开发布时的测试
 */
export async function directUpgrade(shop, plan = 'PRO') {
  console.log('[directUpgrade] Upgrading shop:', shop, 'to plan:', plan);

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

  // 同步到后端 PostgreSQL 数据库
  try {
    const BACKEND_URL = process.env.CARTWHISPER_BACKEND_URL || 'https://cartwhisperaibackend-production.up.railway.app';
    const syncResponse = await fetch(`${BACKEND_URL}/api/shops/${shop}/plan`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        plan: planLower,
        billingStatus: 'active',
        subscriptionStartedAt: now.toISOString(),
        subscriptionEndsAt: periodEnd.toISOString(),
      }),
    });

    if (!syncResponse.ok) {
      console.error('[directUpgrade] Failed to sync to backend:', await syncResponse.text());
    } else {
      console.log('[directUpgrade] Successfully synced plan to backend');
    }
  } catch (error) {
    console.error('[directUpgrade] Error syncing to backend:', error);
    // 不抛出错误，因为本地订阅已经成功
  }

  console.log('[directUpgrade] Successfully upgraded to:', planLower);
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
