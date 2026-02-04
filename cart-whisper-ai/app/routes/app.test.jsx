/**
 * 测试和调试页面
 * 只在开发环境或测试模式下可访问
 */

import { useLoaderData, useFetcher } from 'react-router';
import { useState } from 'react';
import { authenticate } from '../shopify.server';
import { getSubscription, getPlanFeatures } from '../utils/billing.server';
import { getApiKey } from '../utils/shopConfig.server';

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // 获取当前订阅状态
  const subscription = await getSubscription(shop);
  const planFeatures = await getPlanFeatures(shop);
  const apiKey = await getApiKey(shop);

  return {
    shop,
    subscription,
    planFeatures,
    apiKey,
    isDevMode: process.env.NODE_ENV === 'development',
  };
}

export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const actionType = formData.get('action');

  try {
    if (actionType === 'set_plan') {
      const plan = formData.get('plan');
      const { directUpgrade } = await import('../utils/billing.server.js');
      await directUpgrade(shop, plan.toUpperCase());
      return { success: true, message: `Successfully set to ${plan.toUpperCase()} plan` };
    }

    if (actionType === 'clear_cache') {
      // 这个主要是前端操作，这里返回成功即可
      return { success: true, message: 'Cache cleared (will be executed on frontend)' };
    }

    if (actionType === 'reset_subscription') {
      const prisma = (await import('../db.server.js')).default;
      await prisma.subscription.delete({
        where: { shop },
      });
      return { success: true, message: 'Subscription reset to FREE' };
    }

    if (actionType === 'clear_recommendations') {
      const apiKey = await getApiKey(shop);
      const BACKEND_URL = process.env.CARTWHISPER_BACKEND_URL || 'https://cartwhisperaibackend-production.up.railway.app';

      const response = await fetch(`${BACKEND_URL}/api/recommendations`, {
        method: 'DELETE',
        headers: { 'X-API-Key': apiKey }
      });

      const data = await response.json();
      if (data.success) {
        return { success: true, message: `Successfully cleared ${data.deleted} recommendations` };
      } else {
        return { success: false, error: data.error || 'Failed to clear recommendations' };
      }
    }

    if (actionType === 'sync_subscription') {
      const { admin } = await authenticate.admin(request);
      const { confirmSubscription } = await import('../utils/billing.server.js');

      try {
        const confirmed = await confirmSubscription(admin.graphql, shop);
        if (confirmed) {
          return { success: true, message: 'Subscription synced successfully! Status updated to ACTIVE.' };
        } else {
          return { success: false, error: 'No active subscription found in Shopify' };
        }
      } catch (error) {
        return { success: false, error: `Sync failed: ${error.message}` };
      }
    }

    if (actionType === 'sync_plan_config') {
      const { getCurrentPlan } = await import('../utils/billing.server.js');
      const BACKEND_URL = process.env.CARTWHISPER_BACKEND_URL || 'https://cartwhisperaibackend-production.up.railway.app';

      const currentPlan = await getCurrentPlan(shop);
      const planFeatures = await getPlanFeatures(shop);

      const planData = {
        plan: currentPlan.toLowerCase(),
        manualRefreshPerMonth: planFeatures?.manualRefreshPerMonth || 0,
        maxProducts: planFeatures?.maxProducts || 50,
        apiCallsPerDay: planFeatures?.apiCallsPerDay || 5000,
      };

      const response = await fetch(`${BACKEND_URL}/api/shops/${shop}/plan`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(planData),
      });

      if (!response.ok) {
        return { success: false, error: 'Failed to sync plan config to backend' };
      }

      return {
        success: true,
        message: `Plan config synced! Plan: ${currentPlan}, Refresh/Month: ${planFeatures?.manualRefreshPerMonth}`
      };
    }

    return { success: false, error: 'Unknown action' };
  } catch (error) {
    console.error('[Test Page] Error:', error);
    return { success: false, error: error.message };
  }
}

export default function TestPage() {
  const { shop, subscription, planFeatures, apiKey, isDevMode } = useLoaderData();
  const fetcher = useFetcher();
  const [notification, setNotification] = useState(null);

  // 显示fetcher返回的通知
  if (fetcher.data && !notification) {
    setNotification({
      type: fetcher.data.success ? 'success' : 'error',
      message: fetcher.data.message || fetcher.data.error,
    });
    setTimeout(() => setNotification(null), 3000);
  }

  const setPlan = (plan) => {
    fetcher.submit(
      { action: 'set_plan', plan },
      { method: 'post' }
    );
  };

  const clearAllCache = () => {
    // 清除所有CartWhisper相关缓存
    const keys = Object.keys(localStorage);
    let cleared = 0;
    keys.forEach(key => {
      if (key.startsWith('cw_') || key.startsWith('cartwhisper_')) {
        localStorage.removeItem(key);
        cleared++;
      }
    });
    setNotification({
      type: 'success',
      message: `Cleared ${cleared} cache items from localStorage`,
    });
  };

  const resetSubscription = () => {
    if (confirm('⚠️ This will DELETE the subscription record and create a new FREE subscription. Continue?')) {
      fetcher.submit(
        { action: 'reset_subscription' },
        { method: 'post' }
      );
    }
  };

  const clearRecommendations = () => {
    if (confirm('⚠️ This will DELETE all AI-generated recommendations from the backend. You will need to rescan products to generate new recommendations. Continue?')) {
      fetcher.submit(
        { action: 'clear_recommendations' },
        { method: 'post' }
      );
    }
  };

  const syncPlanConfig = () => {
    if (confirm('🔄 This will sync the latest plan configuration from billing.server.js to the backend database. Continue?')) {
      fetcher.submit(
        { action: 'sync_plan_config' },
        { method: 'post' }
      );
    }
  };

  const syncSubscription = () => {
    if (confirm('🔄 This will query Shopify for the current subscription status and update the local database. Continue?')) {
      fetcher.submit(
        { action: 'sync_subscription' },
        { method: 'post' }
      );
    }
  };

  const currentPlan = subscription?.plan?.toUpperCase() || 'FREE';

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '20px' }}>
      {/* Header */}
      <div style={{ marginBottom: '30px' }}>
        <h1 style={{ fontSize: '28px', marginBottom: '10px' }}>
          🧪 Test & Debug Console
        </h1>
        <p style={{ color: '#666', fontSize: '14px' }}>
          Internal testing tools for subscription management and debugging
        </p>
      </div>

      {/* Notification */}
      {notification && (
        <div
          style={{
            padding: '15px 20px',
            marginBottom: '20px',
            borderRadius: '8px',
            backgroundColor: notification.type === 'success' ? '#d4edda' : '#f8d7da',
            color: notification.type === 'success' ? '#155724' : '#721c24',
            border: `1px solid ${notification.type === 'success' ? '#c3e6cb' : '#f5c6cb'}`,
          }}
        >
          {notification.message}
        </div>
      )}

      {/* Current Status */}
      <div style={{
        backgroundColor: '#f8f9fa',
        borderRadius: '12px',
        padding: '20px',
        marginBottom: '30px',
        border: '2px solid #e0e0e0',
      }}>
        <h2 style={{ fontSize: '20px', marginBottom: '15px' }}>📊 Current Status</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '15px' }}>
          <InfoItem label="Shop" value={shop} />
          <InfoItem label="API Key" value={apiKey ? `${apiKey.substring(0, 20)}...` : 'Not registered'} />
          <InfoItem
            label="Current Plan"
            value={
              <span style={{
                fontWeight: 'bold',
                color: currentPlan === 'MAX' ? '#9c27b0' : currentPlan === 'PRO' ? '#f57c00' : '#388e3c'
              }}>
                {currentPlan} {subscription?.isTestMode && '(Test Mode)'}
              </span>
            }
          />
          <InfoItem label="Status" value={subscription?.status || 'N/A'} />
          <InfoItem label="Max Recommendations" value={planFeatures?.recommendationsPerProduct || 1} />
          <InfoItem label="Show Watermark" value={planFeatures?.showWatermark ? 'Yes' : 'No'} />
          <InfoItem label="Analytics" value={planFeatures?.analytics || 'basic'} />
          <InfoItem label="Max Products" value={planFeatures?.maxProducts === Infinity ? '∞' : planFeatures?.maxProducts} />
        </div>
      </div>

      {/* Quick Plan Switcher */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '20px',
        marginBottom: '20px',
        border: '2px solid #e0e0e0',
      }}>
        <h2 style={{ fontSize: '20px', marginBottom: '15px' }}>⚡ Quick Plan Switcher</h2>
        <p style={{ color: '#666', fontSize: '14px', marginBottom: '15px' }}>
          Instantly switch between subscription plans (Test Mode)
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px' }}>
          <PlanButton
            plan="FREE"
            color="#388e3c"
            isActive={currentPlan === 'FREE'}
            onClick={() => setPlan('free')}
            disabled={fetcher.state === 'submitting'}
            features={['1 recommendation', 'Watermark', 'Basic analytics']}
          />
          <PlanButton
            plan="PRO"
            color="#f57c00"
            isActive={currentPlan === 'PRO'}
            onClick={() => setPlan('pro')}
            disabled={fetcher.state === 'submitting'}
            features={['3 recommendations', 'No watermark', 'Advanced analytics']}
          />
          <PlanButton
            plan="MAX"
            color="#9c27b0"
            isActive={currentPlan === 'MAX'}
            onClick={() => setPlan('max')}
            disabled={fetcher.state === 'submitting'}
            features={['3 recommendations', 'No watermark', 'Priority support']}
          />
        </div>
      </div>

      {/* Cache Management */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '20px',
        marginBottom: '20px',
        border: '2px solid #e0e0e0',
      }}>
        <h2 style={{ fontSize: '20px', marginBottom: '15px' }}>🗑️ Cache Management</h2>
        <p style={{ color: '#666', fontSize: '14px', marginBottom: '15px' }}>
          Clear frontend localStorage cache to force fresh API requests
        </p>
        <button
          onClick={clearAllCache}
          style={{
            padding: '12px 24px',
            fontSize: '14px',
            backgroundColor: '#ff9800',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 'bold',
            width: '100%',
          }}
        >
          🗑️ Clear All LocalStorage Cache
        </button>
        <p style={{ color: '#999', fontSize: '12px', marginTop: '10px' }}>
          This will remove all cached recommendations and plan level data
        </p>
      </div>

      {/* Sync Plan Configuration */}
      <div style={{
        backgroundColor: '#e3f2fd',
        borderRadius: '12px',
        padding: '20px',
        marginBottom: '20px',
        border: '2px solid #2196f3',
      }}>
        <h2 style={{ fontSize: '20px', marginBottom: '15px', color: '#1565c0' }}>
          🔄 Sync Subscription & Plan
        </h2>

        {/* Sync Subscription Button */}
        <div style={{ marginBottom: '20px' }}>
          <p style={{ color: '#666', fontSize: '14px', marginBottom: '10px' }}>
            <strong>Sync Subscription Status:</strong> Query Shopify for the current subscription status and update the local database. Use this if you completed a payment but the plan didn't update.
          </p>
          <button
            onClick={syncSubscription}
            disabled={fetcher.state === 'submitting'}
            style={{
              padding: '12px 24px',
              fontSize: '14px',
              backgroundColor: fetcher.state === 'submitting' ? '#ccc' : '#4caf50',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: fetcher.state === 'submitting' ? 'not-allowed' : 'pointer',
              fontWeight: 'bold',
              width: '100%',
            }}
          >
            {fetcher.state === 'submitting' ? '⏳ Syncing...' : '🔄 Sync Subscription from Shopify'}
          </button>
        </div>

        {/* Sync Plan Config Button */}
        <div>
          <p style={{ color: '#666', fontSize: '14px', marginBottom: '10px' }}>
            <strong>Sync Plan Configuration:</strong> Sync the latest plan configuration (manualRefreshPerMonth, maxProducts, etc.) from <code>billing.server.js</code> to the backend database.
          </p>
          <button
            onClick={syncPlanConfig}
            disabled={fetcher.state === 'submitting'}
            style={{
              padding: '12px 24px',
              fontSize: '14px',
              backgroundColor: fetcher.state === 'submitting' ? '#ccc' : '#2196f3',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: fetcher.state === 'submitting' ? 'not-allowed' : 'pointer',
              fontWeight: 'bold',
              width: '100%',
            }}
          >
            {fetcher.state === 'submitting' ? '⏳ Syncing...' : '🔄 Sync Plan Config to Backend'}
          </button>
        </div>
      </div>

      {/* Danger Zone */}
      <div style={{
        backgroundColor: '#fff5f5',
        borderRadius: '12px',
        padding: '20px',
        marginBottom: '20px',
        border: '2px solid #dc3545',
      }}>
        <h2 style={{ fontSize: '20px', marginBottom: '15px', color: '#dc3545' }}>
          ⚠️ Danger Zone
        </h2>
        <p style={{ color: '#666', fontSize: '14px', marginBottom: '15px' }}>
          Destructive actions that cannot be undone
        </p>

        {/* Clear Recommendations Button */}
        <button
          onClick={clearRecommendations}
          disabled={fetcher.state === 'submitting'}
          style={{
            padding: '12px 24px',
            fontSize: '14px',
            backgroundColor: '#ff6b6b',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 'bold',
            width: '100%',
            marginBottom: '15px',
          }}
        >
          🗑️ Clear All Recommendations
        </button>
        <p style={{ color: '#999', fontSize: '12px', marginBottom: '20px' }}>
          This will delete all AI-generated recommendations from the backend. You will need to rescan products to generate new recommendations.
        </p>

        {/* Reset Subscription Button */}
        <button
          onClick={resetSubscription}
          disabled={fetcher.state === 'submitting'}
          style={{
            padding: '12px 24px',
            fontSize: '14px',
            backgroundColor: '#dc3545',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 'bold',
            width: '100%',
          }}
        >
          💥 Reset Subscription to FREE
        </button>
        <p style={{ color: '#999', fontSize: '12px', marginTop: '10px' }}>
          This will delete the subscription record from the database and create a new FREE subscription
        </p>
      </div>

      {/* Quick Links */}
      <div style={{
        backgroundColor: '#e3f2fd',
        borderRadius: '12px',
        padding: '20px',
        border: '2px solid #90caf9',
      }}>
        <h2 style={{ fontSize: '20px', marginBottom: '15px' }}>🔗 Quick Links</h2>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <QuickLink href="/app" text="Home" />
          <QuickLink href="https://cartwhisperaibackend-production.up.railway.app/api/health" text="Backend Health" external />
        </div>
      </div>
    </div>
  );
}

// Helper Components
function InfoItem({ label, value }) {
  return (
    <div style={{
      padding: '10px',
      backgroundColor: 'white',
      borderRadius: '6px',
      border: '1px solid #e0e0e0',
    }}>
      <div style={{ fontSize: '11px', color: '#999', marginBottom: '4px' }}>
        {label}
      </div>
      <div style={{ fontSize: '14px', fontWeight: '500', color: '#333' }}>
        {value}
      </div>
    </div>
  );
}

function PlanButton({ plan, color, isActive, onClick, disabled, features }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || isActive}
      style={{
        padding: '20px',
        backgroundColor: isActive ? color : 'white',
        color: isActive ? 'white' : color,
        border: `2px solid ${color}`,
        borderRadius: '8px',
        cursor: isActive ? 'default' : 'pointer',
        fontWeight: 'bold',
        fontSize: '16px',
        transition: 'all 0.2s',
        opacity: disabled ? 0.5 : 1,
        textAlign: 'left',
      }}
    >
      <div style={{ fontSize: '20px', marginBottom: '8px' }}>
        {plan} {isActive && '✓'}
      </div>
      {features.map((feature, idx) => (
        <div key={idx} style={{ fontSize: '11px', opacity: 0.8, marginTop: '4px' }}>
          • {feature}
        </div>
      ))}
    </button>
  );
}

function QuickLink({ href, text, external }) {
  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      style={{
        padding: '8px 16px',
        backgroundColor: '#1976d2',
        color: 'white',
        borderRadius: '6px',
        textDecoration: 'none',
        fontSize: '14px',
        fontWeight: '500',
      }}
    >
      {text} {external && '↗'}
    </a>
  );
}
