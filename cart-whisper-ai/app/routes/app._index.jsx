import { useLoaderData, Link, useFetcher, useRevalidator } from 'react-router';
import { useState, useEffect } from 'react';
import { authenticate } from '../shopify.server';
import { BACKEND_URL, getSyncStatus, getStatistics } from '../utils/backendApi.server';
import { getApiKey } from '../utils/shopConfig.server';
import { getSubscription, getPlanFeatures, getCurrentPlan } from '../utils/billing.server';

export async function loader({ request }) {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);

  let apiKey = null;
  let recommendations = [];
  let stats = {};
  let syncStatus = null;
  let statistics = null;
  let error = null;
  let subscription = null;
  let planFeatures = null;
  let currentPlan = 'FREE';

  try {
    // 获取订阅信息
    subscription = await getSubscription(shop);
    planFeatures = await getPlanFeatures(shop);
    currentPlan = await getCurrentPlan(shop);

    apiKey = await getApiKey(shop, admin);

    if (apiKey) {
      // 同步计划状态到后端（仅在计划变更时执行，而不是每次页面加载）
      // 注释掉自动同步，改为仅在升级/降级时同步
      /*
      try {
        const planData = {
          plan: currentPlan.toLowerCase(),
          manualRefreshPerMonth: planFeatures?.manualRefreshPerMonth || 0,
          maxProducts: planFeatures?.maxProducts || 50,
          apiCallsPerDay: planFeatures?.apiCallsPerDay || 5000,
        };
        await fetch(`${BACKEND_URL}/api/shops/${shop}/plan`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(planData),
        });
        console.log('[Home] Synced plan to backend:', currentPlan, 'with features:', planData);
      } catch (e) {
        console.error('[Home] Failed to sync plan to backend:', e.message);
      }
      */

      // 获取同步状态（包含 API 使用量）
      const statusResult = await getSyncStatus(apiKey);
      syncStatus = statusResult.syncStatus;
      console.log('[Home] Full syncStatus from backend:', JSON.stringify(syncStatus, null, 2));

      // 获取所有推荐数据
      const res = await fetch(`${BACKEND_URL}/api/recommendations`, {
        headers: { 'X-API-Key': apiKey },
      });
      if (res.ok) {
        const data = await res.json();
        recommendations = data.recommendations || [];
        stats = data.stats || {};
      }

      // 获取统计数据
      try {
        const statsResult = await getStatistics(apiKey);
        statistics = statsResult.statistics;
      } catch (e) {
        console.log('[Home] Error getting statistics:', e.message);
      }
    }
  } catch (e) {
    error = e.message;
  }

  // Fetch global quota settings (test mode only)
  let globalQuota = null;
  if (process.env.NODE_ENV === 'development') {
    try {
      const quotaRes = await fetch(`${BACKEND_URL}/api/admin/global-quota`);
      if (quotaRes.ok) {
        globalQuota = await quotaRes.json();
      }
    } catch (e) {
      console.log('[Home] Error getting global quota:', e.message);
    }
  }

  return {
    shop,
    backendUrl: BACKEND_URL,
    isRegistered: !!apiKey,
    recommendations,
    stats,
    syncStatus,
    statistics,
    subscription,
    planFeatures,
    currentPlan,
    error,
    globalQuota,
    // 查询参数用于显示通知
    upgraded: url.searchParams.get('upgraded') === 'true',
    upgradeFailed: url.searchParams.get('upgrade_failed') === 'true',
    cancelled: url.searchParams.get('cancelled') === 'true',
    isTestMode: process.env.NODE_ENV === 'development',
  };
}

// Action: Handle reset API usage and reset refresh
export const action = async ({ request }) => {
  const formData = await request.formData();
  const actionType = formData.get('_action');
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  if (actionType === 'resetApiUsage') {
    try {
      const response = await fetch(`${BACKEND_URL}/api/shops/${shop}/plan`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiCallsToday: 0 }),
      });

      if (!response.ok) throw new Error('Failed to reset API usage');
      return { success: true, action: 'resetApiUsage' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  if (actionType === 'resetRefresh') {
    try {
      const response = await fetch(`${BACKEND_URL}/api/shops/${shop}/plan`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lastRefreshAt: null }),
      });

      if (!response.ok) {
        throw new Error('Failed to reset refresh time');
      }

      return { success: true, action: 'resetRefresh' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  if (actionType === 'updateGlobalQuota') {
    try {
      const dailyTokenQuota = parseInt(formData.get('dailyTokenQuota'));

      if (!dailyTokenQuota || dailyTokenQuota < 0) {
        return { success: false, error: 'Invalid quota value' };
      }

      const response = await fetch(`${BACKEND_URL}/api/admin/global-quota`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dailyTokenQuota }),
      });

      if (!response.ok) {
        throw new Error('Failed to update global quota');
      }

      return { success: true, action: 'updateGlobalQuota', dailyTokenQuota };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  return null;
};

export default function Index() {
  const {
    shop,
    backendUrl,
    isRegistered,
    recommendations,
    stats,
    syncStatus,
    statistics,
    subscription,
    planFeatures,
    currentPlan: loaderPlan,
    error,
    globalQuota,
    upgraded,
    upgradeFailed,
    cancelled,
    isTestMode,
  } = useLoaderData();

  const planFetcher = useFetcher();
  const billingFetcher = useFetcher();
  const syncFetcher = useFetcher();
  const resetFetcher = useFetcher();
  const quotaFetcher = useFetcher();
  const revalidator = useRevalidator();

  const [showNotification, setShowNotification] = useState(null);

  // Get current plan from subscription or loader
  const currentPlan = loaderPlan?.toLowerCase() || subscription?.plan || 'free';
  const isPro = currentPlan === 'pro' && subscription?.status === 'active';
  const isMax = currentPlan === 'max' && subscription?.status === 'active';
  const isPaid = (isPro || isMax) && subscription?.status === 'active';
  const hasAdvancedAnalytics = planFeatures?.analytics === 'advanced';
  const isSyncing = syncFetcher.state === 'submitting';
  const isResetting = resetFetcher.state === 'submitting';

  // Debug: Log key state (only once on initial render when syncStatus is available)
  if (syncStatus && typeof window !== 'undefined') {
    console.log('=== DEBUG: Resync All Button State ===');
    console.log('currentPlan:', currentPlan);
    console.log('syncStatus.refreshLimit.canRefresh:', syncStatus.refreshLimit?.canRefresh);
    console.log('syncStatus.refreshLimit:', syncStatus.refreshLimit);
    console.log('syncStatus.initialSyncDone:', syncStatus.initialSyncDone);
    console.log('syncStatus.lastRefreshAt:', syncStatus.lastRefreshAt);
    console.log('Button disabled?', !syncStatus?.refreshLimit?.canRefresh);
    console.log('======================================');
  }

  // Revalidate after action
  useEffect(() => {
    if (planFetcher.data?.success || resetFetcher.data?.success || syncFetcher.data?.success) {
      revalidator.revalidate();
    }
  }, [planFetcher.data, resetFetcher.data, syncFetcher.data]);

  // Revalidate after billing action (upgrade/downgrade)
  useEffect(() => {
    if (billingFetcher.state === 'idle' && billingFetcher.data) {
      // Billing action completed, reload data
      revalidator.revalidate();
    }
  }, [billingFetcher.state, billingFetcher.data]);

  // Show notifications and revalidate on upgrade
  useEffect(() => {
    if (upgraded) {
      setShowNotification({ type: 'success', message: 'Successfully upgraded to Pro Plan!' });
      // Force revalidate to get updated subscription data
      revalidator.revalidate();
    } else if (upgradeFailed) {
      setShowNotification({ type: 'error', message: 'Upgrade failed. Please try again.' });
    } else if (cancelled) {
      setShowNotification({ type: 'info', message: 'Subscription cancelled. You are now on the Free Plan.' });
      revalidator.revalidate();
    }
  }, [upgraded, upgradeFailed, cancelled]);

  // Format date helper
  const formatDate = (dateStr) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleDateString('zh-CN', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  const handleUpgrade = (plan = 'PRO') => {
    billingFetcher.submit(
      { action: 'upgrade', plan },
      { method: 'post', action: '/app/billing' }
    );
  };

  const handleCancelSubscription = () => {
    if (confirm('Are you sure you want to cancel your subscription? You will be downgraded to the Free Plan.')) {
      billingFetcher.submit(
        {},
        { method: 'post', action: '/app/billing/cancel' }
      );
    }
  };

  if (!isRegistered) {
    return (
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
        <h1 style={{ marginBottom: '10px' }}>Welcome to CartWhisper AI</h1>
        <p style={{ color: '#666', marginBottom: '30px' }}>
          Get started by syncing your products to generate AI-powered recommendations.
        </p>

        {/* Getting Started Card */}
        <div style={{
          padding: '30px',
          backgroundColor: '#e3f2fd',
          borderRadius: '12px',
          border: '2px solid #2196f3',
          marginBottom: '30px',
          textAlign: 'center',
        }}>
          <h2 style={{ color: '#1565c0', marginBottom: '15px' }}>🚀 Initial Setup</h2>
          <p style={{ color: '#1565c0', marginBottom: '20px', fontSize: '16px' }}>
            Click the button below to sync your Shopify products and start generating recommendations.
          </p>

          <syncFetcher.Form method="post" action="/api/scan">
            <input type="hidden" name="mode" value="auto" />
            <button
              type="submit"
              disabled={isSyncing}
              style={{
                padding: '16px 32px',
                fontSize: '16px',
                backgroundColor: isSyncing ? '#ccc' : '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: isSyncing ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              {isSyncing ? (
                <>
                  <span>⏳</span> Syncing...
                </>
              ) : (
                <>🚀 Start Initial Sync</>
              )}
            </button>
          </syncFetcher.Form>

          {/* Sync Progress */}
          {isSyncing && (
            <div style={{ marginTop: '20px', maxWidth: '600px', margin: '20px auto 0' }}>
              <div style={{ marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#007bff' }}>Syncing in progress...</span>
                <span style={{ fontSize: '12px', color: '#666' }}>This may take up to 30 minutes</span>
              </div>
              <div
                style={{
                  width: '100%',
                  height: '8px',
                  backgroundColor: '#e9ecef',
                  borderRadius: '4px',
                  overflow: 'hidden',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    background: 'linear-gradient(90deg, #007bff, #0056b3)',
                    borderRadius: '4px',
                    animation: 'pulse 2s ease-in-out infinite',
                    width: '100%',
                  }}
                >
                  <style>{`
                    @keyframes pulse {
                      0% { opacity: 0.6; }
                      50% { opacity: 1; }
                      100% { opacity: 0.6; }
                    }
                  `}</style>
                </div>
              </div>
            </div>
          )}

          {/* Sync Result */}
          {syncFetcher.data && syncFetcher.data.success && (
            <div
              style={{
                marginTop: '20px',
                padding: '20px',
                borderRadius: '8px',
                backgroundColor: '#d4edda',
                border: '2px solid #28a745',
              }}
            >
              <h3 style={{ color: '#155724', margin: '0 0 10px 0' }}>✅ Initial Sync Completed!</h3>
              <p style={{ color: '#155724', margin: '5px 0' }}>
                Successfully synced <strong>{syncFetcher.data.productsCount}</strong> products and generated <strong>{syncFetcher.data.recommendationsCount}</strong> recommendations.
              </p>
              <p style={{ color: '#155724', margin: '10px 0 0 0', fontSize: '14px' }}>
                The page will reload automatically...
              </p>
            </div>
          )}
        </div>

        {/* How it works section */}
        <div style={{
          padding: '20px',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          border: '1px solid #dee2e6',
        }}>
          <h3 style={{ margin: '0 0 15px 0' }}>ℹ️ How it works</h3>
          <ol style={{ margin: 0, paddingLeft: '20px', lineHeight: '1.8' }}>
            <li>Click "Start Initial Sync" to fetch all products from your Shopify store</li>
            <li>Products are sent to the CartWhisper AI backend</li>
            <li>AI analyzes products and generates personalized recommendations</li>
            <li>Recommendations are stored and can be displayed in your storefront</li>
          </ol>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#fafafa',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    }}>
      {/* Header */}
      <div style={{
        backgroundColor: 'white',
        borderBottom: '1px solid #e5e7eb',
        padding: '24px 0',
        marginBottom: '40px'
      }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{
                margin: '0 0 8px 0',
                fontSize: '28px',
                fontWeight: '600',
                color: '#111827',
                letterSpacing: '-0.02em'
              }}>
                CartWhisper AI
              </h1>
              <p style={{
                margin: 0,
                fontSize: '14px',
                color: '#6b7280',
                fontWeight: '400'
              }}>
                AI-powered product recommendations
              </p>
            </div>
            {isTestMode && (
              <Link
                to="/app/test"
                style={{
                  padding: '8px 16px',
                  fontSize: '13px',
                  backgroundColor: '#f3f4f6',
                  color: '#374151',
                  borderRadius: '6px',
                  textDecoration: 'none',
                  fontWeight: '500',
                  border: '1px solid #e5e7eb'
                }}
              >
                🧪 Test Console
              </Link>
            )}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 32px 60px' }}>

      {/* Notifications */}
      {showNotification && (
        <div
          style={{
            padding: '15px 20px',
            marginBottom: '20px',
            borderRadius: '8px',
            backgroundColor: showNotification.type === 'success' ? '#d4edda' : showNotification.type === 'error' ? '#f8d7da' : '#d1ecf1',
            color: showNotification.type === 'success' ? '#155724' : showNotification.type === 'error' ? '#721c24' : '#0c5460',
            border: `1px solid ${showNotification.type === 'success' ? '#c3e6cb' : showNotification.type === 'error' ? '#f5c6cb' : '#bee5eb'}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{showNotification.message}</span>
          <button
            onClick={() => setShowNotification(null)}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '18px',
              cursor: 'pointer',
              color: 'inherit',
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Purple Upgrade Banner - Free Users Only */}
      {currentPlan === 'free' && (
        <div style={{
          background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
          borderRadius: '16px',
          padding: '32px',
          marginBottom: '32px',
          color: 'white',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '24px',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          {/* Left: Main Message */}
          <div style={{ flex: '0 0 auto' }}>
            <div style={{
              display: 'inline-block',
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              padding: '4px 12px',
              borderRadius: '999px',
              fontSize: '12px',
              fontWeight: '600',
              marginBottom: '12px'
            }}>
              PRO PLAN FEATURE
            </div>
            <h2 style={{
              margin: '0 0 8px 0',
              fontSize: '28px',
              fontWeight: '700',
              letterSpacing: '-0.02em'
            }}>
              Unlock 3x More Sales
            </h2>
            <p style={{
              margin: 0,
              fontSize: '14px',
              opacity: 0.9
            }}>
              Upgrade to show more recommendations per product
            </p>
          </div>

          {/* Middle: Comparison */}
          <div style={{
            flex: '1 1 400px',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '16px',
            minWidth: '280px'
          }}>
            {/* Current FREE */}
            <div style={{
              backgroundColor: 'rgba(255, 255, 255, 0.15)',
              borderRadius: '12px',
              padding: '16px',
              backdropFilter: 'blur(10px)'
            }}>
              <div style={{
                fontSize: '11px',
                fontWeight: '600',
                opacity: 0.8,
                marginBottom: '12px',
                letterSpacing: '0.05em'
              }}>
                CURRENT (FREE)
              </div>
              <div style={{ fontSize: '13px', lineHeight: '1.8' }}>
                <div>❌ 50 Products Limit</div>
                <div>⚠️ 1 Rec / Product</div>
                <div>📊 Basic Analytics</div>
              </div>
            </div>

            {/* Upgrade to PRO */}
            <div style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '16px',
              color: '#7c3aed'
            }}>
              <div style={{
                fontSize: '11px',
                fontWeight: '600',
                marginBottom: '12px',
                letterSpacing: '0.05em'
              }}>
                UPGRADE TO PRO
              </div>
              <div style={{ fontSize: '13px', lineHeight: '1.8', fontWeight: '500' }}>
                <div>✅ 2,000 Products</div>
                <div>🚀 3 Recs / Product</div>
                <div>📊 Advanced Analytics</div>
              </div>
            </div>
          </div>

          {/* Right: Action Buttons */}
          <div style={{
            flex: '0 0 auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            minWidth: '200px'
          }}>
            <button
              onClick={() => handleUpgrade('PRO')}
              disabled={billingFetcher.state === 'submitting'}
              style={{
                padding: '14px 24px',
                fontSize: '15px',
                fontWeight: '600',
                backgroundColor: 'white',
                color: '#7c3aed',
                border: 'none',
                borderRadius: '10px',
                cursor: billingFetcher.state === 'submitting' ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                opacity: billingFetcher.state === 'submitting' ? 0.7 : 1
              }}
            >
              {billingFetcher.state === 'submitting' ? 'Processing...' : 'Upgrade to PRO →'}
            </button>
            <Link
              to="/app/billing?view=plans"
              style={{
                padding: '12px 24px',
                fontSize: '13px',
                fontWeight: '500',
                color: 'white',
                textAlign: 'center',
                textDecoration: 'none',
                borderRadius: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                transition: 'all 0.2s'
              }}
            >
              View MAX Plan (Unlimited)
            </Link>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div>
          {/* Stats Grid - Redesigned */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '20px',
            marginBottom: '32px'
          }}>
            {/* Card 1: Product Sync Limit */}
            <div style={{
              backgroundColor: 'white',
              borderRadius: '16px',
              padding: '24px',
              border: '1px solid #e5e7eb',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px'
              }}>
                <span style={{
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#6b7280'
                }}>
                  Product Sync Limit
                </span>
                {syncStatus?.productCount > (planFeatures?.maxProducts * 0.9) && planFeatures?.maxProducts !== Infinity && (
                  <span style={{
                    fontSize: '11px',
                    fontWeight: '600',
                    padding: '4px 8px',
                    borderRadius: '999px',
                    backgroundColor: '#fff7ed',
                    color: '#f97316',
                    border: '1px solid #fed7aa'
                  }}>
                    Near Limit
                  </span>
                )}
              </div>

              <h2 style={{
                margin: '0 0 16px 0',
                fontSize: '36px',
                fontWeight: '700',
                color: '#111827',
                lineHeight: '1'
              }}>
                {syncStatus?.productCount || 0}
                <span style={{
                  fontSize: '24px',
                  fontWeight: '400',
                  color: '#9ca3af',
                  marginLeft: '4px'
                }}>
                  / {planFeatures?.maxProducts === Infinity ? '∞' : planFeatures?.maxProducts || 50}
                </span>
              </h2>

              {/* Progress Bar */}
              <div style={{
                width: '100%',
                height: '8px',
                backgroundColor: '#f3f4f6',
                borderRadius: '999px',
                overflow: 'hidden',
                marginBottom: '12px'
              }}>
                <div style={{
                  height: '100%',
                  background: 'linear-gradient(90deg, #f97316, #fb923c)',
                  borderRadius: '999px',
                  width: `${Math.min(((syncStatus?.productCount || 0) / (planFeatures?.maxProducts || 50)) * 100, 100)}%`,
                  transition: 'width 0.3s ease'
                }} />
              </div>

              <p style={{
                margin: 0,
                fontSize: '13px',
                color: '#6b7280',
                lineHeight: '1.5'
              }}>
                {currentPlan === 'free'
                  ? 'Upgrade to sync up to 2,000 products.'
                  : currentPlan === 'pro'
                  ? 'PRO plan: Up to 2,000 products'
                  : 'MAX plan: Unlimited products'}
              </p>
            </div>

            {/* Card 2: Avg. Click-Through Rate */}
            <div style={{
              backgroundColor: 'white',
              borderRadius: '16px',
              padding: '24px',
              border: '1px solid #e5e7eb',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px'
              }}>
                <span style={{
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#6b7280'
                }}>
                  Avg. Click-Through Rate
                </span>
                <span style={{
                  fontSize: '13px',
                  fontWeight: '600',
                  color: '#10b981'
                }}>
                  +5.4%
                </span>
              </div>

              <h2 style={{
                margin: '0 0 16px 0',
                fontSize: '48px',
                fontWeight: '700',
                color: '#111827',
                lineHeight: '1'
              }}>
                {statistics?.summary?.ctr || 0}%
              </h2>

              <p style={{
                margin: 0,
                fontSize: '13px',
                color: '#6b7280',
                lineHeight: '1.5'
              }}>
                Based on active recommendations.
              </p>
            </div>

            {/* Card 3: Advanced Analytics (Locked for Free Users) */}
            {!hasAdvancedAnalytics ? (
              <div style={{
                backgroundColor: 'white',
                borderRadius: '16px',
                padding: '24px',
                border: '1px solid #e5e7eb',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                minHeight: '200px'
              }}>
                <div style={{
                  fontSize: '48px',
                  marginBottom: '16px',
                  color: '#1f2937'
                }}>
                  🔒
                </div>

                <h3 style={{
                  margin: '0 0 8px 0',
                  fontSize: '18px',
                  fontWeight: '600',
                  color: '#111827'
                }}>
                  Advanced Analytics
                </h3>

                <p style={{
                  margin: '0 0 20px 0',
                  fontSize: '13px',
                  color: '#6b7280',
                  lineHeight: '1.5'
                }}>
                  View detailed funnel & conversion data.
                </p>

                <button
                  onClick={() => handleUpgrade('PRO')}
                  disabled={billingFetcher.state === 'submitting'}
                  style={{
                    padding: '10px 20px',
                    fontSize: '14px',
                    fontWeight: '500',
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: billingFetcher.state === 'submitting' ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                    opacity: billingFetcher.state === 'submitting' ? 0.7 : 1
                  }}
                >
                  {billingFetcher.state === 'submitting' ? 'Processing...' : 'Unlock Pro'}
                </button>
              </div>
            ) : (
              <div style={{
                backgroundColor: 'white',
                borderRadius: '16px',
                padding: '24px',
                border: '1px solid #e5e7eb',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
              }}>
                <div style={{
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#6b7280',
                  marginBottom: '16px'
                }}>
                  Advanced Analytics
                </div>

                <h2 style={{
                  margin: '0 0 16px 0',
                  fontSize: '36px',
                  fontWeight: '700',
                  color: '#111827',
                  lineHeight: '1'
                }}>
                  {(statistics?.summary?.totalClicks || 0).toLocaleString()}
                </h2>

                <p style={{
                  margin: 0,
                  fontSize: '13px',
                  color: '#6b7280',
                  lineHeight: '1.5'
                }}>
                  Total clicks this month
                </p>
              </div>
            )}
          </div>

          {/* Active Products Section */}
          <div style={{ marginBottom: '40px' }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px'
            }}>
              <h2 style={{
                margin: 0,
                fontSize: '20px',
                fontWeight: '600',
                color: '#111827'
              }}>
                Active Products
              </h2>

              {syncStatus?.initialSyncDone && (
                <syncFetcher.Form method="post" action="/api/scan" style={{ display: 'inline' }}>
                  <input type="hidden" name="mode" value="refresh" />
                  <button
                    type="submit"
                    disabled={isSyncing || !syncStatus?.refreshLimit?.canRefresh}
                    title={
                      !syncStatus?.refreshLimit?.canRefresh
                        ? (currentPlan === 'free'
                            ? 'Upgrade to PRO to unlock Resync All'
                            : `Next resync: ${formatDate(syncStatus?.refreshLimit?.nextRefreshAt)}`)
                        : 'Regenerate all recommendations'
                    }
                    style={{
                      padding: '10px 20px',
                      fontSize: '14px',
                      fontWeight: '500',
                      backgroundColor: isSyncing || !syncStatus?.refreshLimit?.canRefresh ? '#e5e7eb' : '#111827',
                      color: isSyncing || !syncStatus?.refreshLimit?.canRefresh ? '#9ca3af' : 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: isSyncing || !syncStatus?.refreshLimit?.canRefresh ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    Resync ({syncStatus?.refreshLimit?.remaining || 0} left)
                  </button>
                </syncFetcher.Form>
              )}
            </div>

            {/* Products Grid */}
            {recommendations.length > 0 ? (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '16px'
              }}>
                {recommendations.slice(0, 10).map((rec, idx) => (
                  <div
                    key={idx}
                    style={{
                      backgroundColor: 'white',
                      borderRadius: '12px',
                      padding: '16px',
                      border: '1px solid #e5e7eb',
                      transition: 'all 0.2s'
                    }}
                  >
                    <ProductCell
                      image={rec.sourceImage}
                      title={rec.sourceTitle}
                      id={rec.sourceProductId}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div style={{
                backgroundColor: '#f9fafb',
                borderRadius: '12px',
                padding: '40px',
                textAlign: 'center',
                border: '1px solid #e5e7eb'
              }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📦</div>
                <p style={{
                  margin: 0,
                  fontSize: '14px',
                  color: '#6b7280'
                }}>
                  No products synced yet. Click "Sync New Products" to get started.
                </p>
              </div>
            )}
          </div>

          {/* Admin: Global Quota Settings (Test Mode Only) */}
          {isTestMode && globalQuota && (
            <div style={{
              marginBottom: '20px',
              padding: '20px',
              backgroundColor: '#fff9e6',
              borderRadius: '8px',
              border: '2px solid #ffc107',
            }}>
              <h3 style={{ margin: '0 0 15px 0', fontSize: '16px', color: '#856404' }}>
                🔧 Admin: Global Quota Settings
              </h3>
              <div style={{ marginBottom: '15px' }}>
                <div style={{ fontSize: '14px', color: '#666', marginBottom: '10px' }}>
                  <strong>Current Settings:</strong>
                </div>
                <div style={{ fontSize: '13px', color: '#666', marginLeft: '10px' }}>
                  • Daily Token Limit: <strong>{globalQuota.dailyTokenQuota?.toLocaleString()}</strong> tokens
                </div>
                <div style={{ fontSize: '13px', color: '#666', marginLeft: '10px' }}>
                  • Tokens Used Today: <strong>{globalQuota.tokensUsedToday?.toLocaleString()}</strong> tokens
                </div>
                <div style={{ fontSize: '13px', color: '#666', marginLeft: '10px' }}>
                  • Last Updated: <strong>{globalQuota.updatedAt ? new Date(globalQuota.updatedAt).toLocaleString() : 'N/A'}</strong>
                </div>
              </div>
              <quotaFetcher.Form method="post">
                <input type="hidden" name="_action" value="updateGlobalQuota" />
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '13px', color: '#666', display: 'block', marginBottom: '5px' }}>
                      New Daily Token Limit:
                    </label>
                    <input
                      type="number"
                      name="dailyTokenQuota"
                      defaultValue={globalQuota.dailyTokenQuota}
                      min="0"
                      step="1000"
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        fontSize: '14px',
                        border: '1px solid #ccc',
                        borderRadius: '4px',
                      }}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={quotaFetcher.state === 'submitting'}
                    style={{
                      padding: '8px 16px',
                      fontSize: '14px',
                      backgroundColor: quotaFetcher.state === 'submitting' ? '#ccc' : '#ffc107',
                      color: '#000',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: quotaFetcher.state === 'submitting' ? 'not-allowed' : 'pointer',
                      fontWeight: 'bold',
                    }}
                  >
                    {quotaFetcher.state === 'submitting' ? 'Updating...' : 'Update Quota'}
                  </button>
                </div>
              </quotaFetcher.Form>
              {quotaFetcher.data?.success && (
                <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#d4edda', color: '#155724', borderRadius: '4px', fontSize: '13px' }}>
                  ✅ Global quota updated successfully to {quotaFetcher.data.dailyTokenQuota?.toLocaleString()} tokens/day
                </div>
              )}
              {quotaFetcher.data?.error && (
                <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#f8d7da', color: '#721c24', borderRadius: '4px', fontSize: '13px' }}>
                  ❌ Error: {quotaFetcher.data.error}
                </div>
              )}
            </div>
          )}

          {/* Sync Progress - Redesigned */}
          {isSyncing && (
            <div style={{
              backgroundColor: 'white',
              borderRadius: '16px',
              padding: '24px',
              border: '1px solid #e5e7eb',
              marginBottom: '32px'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px'
              }}>
                <div style={{
                  fontSize: '15px',
                  fontWeight: '600',
                  color: '#111827',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span>⏳</span>
                  <span>Syncing in progress...</span>
                </div>
                <span style={{ fontSize: '12px', color: '#6b7280' }}>
                  This may take up to 30 minutes
                </span>
              </div>
              <div style={{
                width: '100%',
                height: '6px',
                backgroundColor: '#f3f4f6',
                borderRadius: '999px',
                overflow: 'hidden'
              }}>
                <div style={{
                  height: '100%',
                  background: 'linear-gradient(90deg, #111827, #374151)',
                  borderRadius: '999px',
                  animation: 'pulse 2s ease-in-out infinite',
                  width: '100%'
                }}>
                  <style>{`
                    @keyframes pulse {
                      0% { opacity: 0.6; }
                      50% { opacity: 1; }
                      100% { opacity: 0.6; }
                    }
                  `}</style>
                </div>
              </div>
            </div>
          )}

          {/* Sync Result */}
          {syncFetcher.data && (
            <div
              style={{
                marginBottom: '30px',
                padding: '20px',
                borderRadius: '8px',
                border: syncFetcher.data.success ? '2px solid #28a745' : syncFetcher.data.rateLimited ? '2px solid #ffc107' : syncFetcher.data.tokenQuotaExceeded ? '2px solid #ff9800' : '2px solid #dc3545',
                backgroundColor: syncFetcher.data.success ? '#d4edda' : syncFetcher.data.rateLimited ? '#fff3cd' : syncFetcher.data.tokenQuotaExceeded ? '#fff3e0' : '#f8d7da',
              }}
            >
              {syncFetcher.data.success ? (
                <>
                  <h3 style={{ color: '#155724', margin: '0 0 15px 0', fontSize: '18px' }}>
                    ✅ Sync Completed!
                  </h3>
                  <div style={{ color: '#155724', fontSize: '14px' }}>
                    <p style={{ margin: '5px 0' }}>
                      <strong>Products:</strong> {syncFetcher.data.productsCount}
                    </p>
                    <p style={{ margin: '5px 0' }}>
                      <strong>Recommendations:</strong> {syncFetcher.data.recommendationsCount}
                    </p>
                    <p style={{ margin: '5px 0' }}>
                      <strong>Duration:</strong> {syncFetcher.data.duration}
                    </p>
                  </div>
                </>
              ) : syncFetcher.data.rateLimited ? (
                <>
                  <h3 style={{ color: '#856404', margin: '0 0 10px 0' }}>⏰ Resync Rate Limited</h3>
                  <p style={{ color: '#856404', margin: '5px 0' }}>
                    You have reached your monthly resync limit.
                  </p>
                  <p style={{ color: '#856404', margin: '5px 0', fontSize: '14px' }}>
                    Next resync available: <strong>{formatDate(syncFetcher.data.nextRefreshAt)}</strong>
                  </p>
                </>
              ) : syncFetcher.data.tokenQuotaExceeded ? (
                <>
                  <h3 style={{ color: '#e65100', margin: '0 0 10px 0' }}>🎫 Daily Token Quota Exceeded</h3>
                  <p style={{ color: '#e65100', margin: '5px 0', fontSize: '15px' }}>
                    You have used all your free tokens for today. Please try again tomorrow.
                  </p>
                  <p style={{ color: '#e65100', margin: '10px 0 5px 0', fontSize: '14px' }}>
                    Quota resets at: <strong>{formatDate(syncFetcher.data.quotaResetDate)}</strong>
                  </p>
                  <p style={{ color: '#e65100', margin: '10px 0 0 0', fontSize: '13px' }}>
                    💡 Want unlimited tokens? Upgrade to PRO or MAX plan!
                  </p>
                </>
              ) : (
                <>
                  <h3 style={{ color: '#721c24', margin: '0 0 10px 0' }}>❌ Sync Failed</h3>
                  <p style={{ color: '#721c24', margin: '5px 0' }}>
                    {syncFetcher.data.error || 'Unknown error occurred'}
                  </p>
                </>
              )}
            </div>
          )}

          {/* Analytics Section - Redesigned */}
          <div style={{ marginBottom: '40px' }}>
            <h2 style={{
              fontSize: '18px',
              fontWeight: '600',
              color: '#111827',
              marginBottom: '16px',
              letterSpacing: '-0.01em'
            }}>
              Analytics
            </h2>

            {/* Summary Stats */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '16px',
              marginBottom: '24px'
            }}>
              {/* Total Impressions */}
              <div style={{
                backgroundColor: 'white',
                borderRadius: '12px',
                padding: '20px',
                border: '1px solid #e5e7eb'
              }}>
                <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px', fontWeight: '500' }}>
                  👁️ Total Impressions
                </div>
                <div style={{ fontSize: '28px', fontWeight: '600', color: '#111827' }}>
                  {(statistics?.summary?.totalImpressions || 0).toLocaleString()}
                </div>
              </div>

              {/* Total Clicks */}
              <div style={{
                backgroundColor: 'white',
                borderRadius: '12px',
                padding: '20px',
                border: '1px solid #e5e7eb'
              }}>
                <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px', fontWeight: '500' }}>
                  👆 Total Clicks
                </div>
                <div style={{ fontSize: '28px', fontWeight: '600', color: '#111827' }}>
                  {(statistics?.summary?.totalClicks || 0).toLocaleString()}
                </div>
              </div>

              {/* CTR - Locked for Free Users */}
              <div style={{ position: 'relative' }}>
                <div style={{
                  backgroundColor: 'white',
                  borderRadius: '12px',
                  padding: '20px',
                  border: '1px solid #e5e7eb',
                  opacity: hasAdvancedAnalytics ? 1 : 0.5
                }}>
                  <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px', fontWeight: '500' }}>
                    📊 Click-through Rate
                  </div>
                  <div style={{ fontSize: '28px', fontWeight: '600', color: '#111827' }}>
                    {hasAdvancedAnalytics ? `${statistics?.summary?.ctr || 0}%` : '••••'}
                  </div>
                </div>
                {!hasAdvancedAnalytics && (
                  <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    fontSize: '32px'
                  }}>
                    🔒
                  </div>
                )}
              </div>

              {/* Revenue Attribution */}
              <div style={{
                backgroundColor: 'white',
                borderRadius: '12px',
                padding: '20px',
                border: '1px solid #e5e7eb',
                opacity: 0.5
              }}>
                <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px', fontWeight: '500' }}>
                  💰 Revenue Attribution
                </div>
                <div style={{ fontSize: '20px', fontWeight: '600', color: '#9ca3af' }}>
                  Coming Soon
                </div>
              </div>
            </div>

            {/* No Data Message */}
            {(!statistics?.summary?.totalImpressions || statistics.summary.totalImpressions === 0) && (
              <div style={{
                backgroundColor: '#eff6ff',
                borderRadius: '12px',
                padding: '24px',
                border: '1px solid #bfdbfe'
              }}>
                <h3 style={{
                  margin: '0 0 8px 0',
                  color: '#1e40af',
                  fontSize: '15px',
                  fontWeight: '600'
                }}>
                  No Tracking Data Yet
                </h3>
                <p style={{
                  margin: 0,
                  color: '#3b82f6',
                  fontSize: '14px',
                  lineHeight: '1.6'
                }}>
                  Once you integrate the tracking code into your storefront theme, you'll see impressions and clicks data here.
                  See the integration guide below.
                </p>
              </div>
            )}
          </div>

          {/* Top Performing Recommendations */}
          {statistics?.topByClicks?.length > 0 && (
            <div style={{ marginBottom: '30px' }}>
              <h3 style={{ marginBottom: '15px' }}>Top Recommendations by Clicks</h3>
              <div style={{ overflowX: 'auto', filter: !hasAdvancedAnalytics ? 'blur(8px)' : 'none', pointerEvents: !hasAdvancedAnalytics ? 'none' : 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', borderRadius: '8px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f5f5f5', borderBottom: '2px solid #ddd' }}>
                      <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px' }}>Source Product</th>
                      <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px' }}>Recommended Product</th>
                      <th style={{ padding: '12px', textAlign: 'center', fontSize: '13px' }}>Impressions</th>
                      <th style={{ padding: '12px', textAlign: 'center', fontSize: '13px' }}>Clicks</th>
                      <th style={{ padding: '12px', textAlign: 'center', fontSize: '13px' }}>CTR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statistics.topByClicks.map((rec, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '10px 12px', fontSize: '13px' }}>{rec.sourceTitle}</td>
                        <td style={{ padding: '10px 12px', fontSize: '13px' }}>{rec.targetTitle}</td>
                        <td style={{ padding: '10px 12px', fontSize: '13px', textAlign: 'center' }}>{rec.impressions}</td>
                        <td style={{ padding: '10px 12px', fontSize: '13px', textAlign: 'center', fontWeight: 'bold', color: '#388e3c' }}>{rec.clicks}</td>
                        <td style={{ padding: '10px 12px', fontSize: '13px', textAlign: 'center' }}>{rec.ctr}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Top Source Products */}
          {statistics?.topSourceProducts?.length > 0 && (
            <div style={{ marginBottom: '30px' }}>
              <h3 style={{ marginBottom: '15px' }}>Top Products by Impressions</h3>
              <div style={{ overflowX: 'auto', filter: !hasAdvancedAnalytics ? 'blur(8px)' : 'none', pointerEvents: !hasAdvancedAnalytics ? 'none' : 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', borderRadius: '8px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f5f5f5', borderBottom: '2px solid #ddd' }}>
                      <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px' }}>Product</th>
                      <th style={{ padding: '12px', textAlign: 'center', fontSize: '13px' }}>Impressions</th>
                      <th style={{ padding: '12px', textAlign: 'center', fontSize: '13px' }}>Clicks</th>
                      <th style={{ padding: '12px', textAlign: 'center', fontSize: '13px' }}>CTR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statistics.topSourceProducts.map((product, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '10px 12px', fontSize: '13px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            {product.image && (
                              <img src={product.image} alt="" style={{ width: '32px', height: '32px', borderRadius: '4px', objectFit: 'cover' }} />
                            )}
                            {product.title}
                          </div>
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: '13px', textAlign: 'center', fontWeight: 'bold', color: '#1976d2' }}>{product.impressions}</td>
                        <td style={{ padding: '10px 12px', fontSize: '13px', textAlign: 'center' }}>{product.clicks}</td>
                        <td style={{ padding: '10px 12px', fontSize: '13px', textAlign: 'center' }}>{product.ctr}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Integration Info */}
          <div style={{ backgroundColor: '#e8f5e9', borderRadius: '8px', padding: '20px', marginTop: '20px', border: '1px solid #a5d6a7' }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#2e7d32' }}>Automatic Tracking</h3>
            <p style={{ color: '#2e7d32', margin: 0 }}>
              Tracking is built into the Cart Recommendations widget. When customers view recommendations or click "Add to Cart",
              impressions and clicks are automatically recorded. No additional integration needed!
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#ffebee', borderRadius: '8px', border: '1px solid #ef5350', color: '#c62828' }}>
          Error: {error}
        </div>
      )}
    </div>
  );
}

// Helper Components
function ProductCell({ image, title, id }) {
  return (
    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
      {image ? (
        <img src={image} alt={title} style={{ width: '50px', height: '50px', borderRadius: '4px', objectFit: 'cover', backgroundColor: '#f5f5f5' }} />
      ) : (
        <div style={{ width: '50px', height: '50px', borderRadius: '4px', backgroundColor: '#e9ecef', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: '24px' }}>
          📦
        </div>
      )}
      <div>
        <div style={{ fontWeight: '500', marginBottom: '4px' }}>{title}</div>
        <div style={{ fontSize: '12px', color: '#999' }}>ID: {id}</div>
      </div>
    </div>
  );
}
