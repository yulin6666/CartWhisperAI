import { useLoaderData, Link, useFetcher, useRevalidator } from 'react-router';
import { useState, useEffect, useMemo } from 'react';
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
  const isSyncing = syncFetcher.state === 'submitting';

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

  // Group recommendations by source product
  const groupedProducts = useMemo(() => {
    const groups = {};

    recommendations.forEach(rec => {
      if (!groups[rec.sourceProductId]) {
        groups[rec.sourceProductId] = {
          product: {
            id: rec.sourceProductId,
            title: rec.sourceTitle,
            image: rec.sourceImage
          },
          recommendations: []
        };
      }

      groups[rec.sourceProductId].recommendations.push({
        id: rec.targetProductId,
        title: rec.targetTitle,
        image: rec.targetImage,
        reason: rec.reason?.split('|')[0] || 'Related Product', // Extract main reason
        reasonDetail: rec.reason?.split('|')[1] || '' // Optional detail
      });
    });

    // Limit recommendations per product based on plan
    Object.keys(groups).forEach(key => {
      const limit = planFeatures?.recommendationsPerProduct || 1;
      groups[key].recommendations = groups[key].recommendations.slice(0, limit);
    });

    return Object.values(groups);
  }, [recommendations, planFeatures]);

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
        padding: '16px 0'
      }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {/* Left: Logo + Title */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                backgroundColor: '#7c3aed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: '24px',
                fontWeight: 'bold'
              }}>
                C
              </div>
              <h1 style={{
                margin: 0,
                fontSize: '24px',
                fontWeight: '700',
                color: '#111827'
              }}>
                CartWhisper <span style={{ color: '#4f46e5' }}>AI</span>
              </h1>
            </div>

            {/* Right: Plan badge + Avatar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              {currentPlan === 'free' && (
                <div style={{
                  padding: '8px 16px',
                  backgroundColor: '#f3f4f6',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#6b7280'
                }}>
                  FREE PLAN
                </div>
              )}
              {currentPlan === 'pro' && (
                <div style={{
                  padding: '8px 16px',
                  backgroundColor: '#e0e7ff',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#4f46e5'
                }}>
                  PRO PLAN
                </div>
              )}
              {currentPlan === 'max' && (
                <div style={{
                  padding: '8px 16px',
                  backgroundColor: '#f3e8ff',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#7c3aed'
                }}>
                  MAX PLAN
                </div>
              )}
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: '#e5e7eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px'
              }}>
                👤
              </div>
            </div>
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

      {/* Plan-Specific Banner/Usage Card */}
      {currentPlan === 'free' && (
        <div style={{
          background: 'linear-gradient(135deg, #7c3aed 0%, #9f7aea 100%)',
          borderRadius: '20px',
          padding: '48px',
          marginBottom: '40px',
          color: 'white',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px'
        }}>
          {/* Row 1: Title and Button */}
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '32px'
          }}>
            {/* Left: Title */}
            <h2 style={{
              margin: 0,
              fontSize: '36px',
              fontWeight: '700',
              lineHeight: '1.2',
              flex: '1 1 auto'
            }}>
              Unlock Your Store's Full Revenue Potential
            </h2>

            {/* Right: Action Buttons */}
            <div style={{
              flex: '0 0 auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              alignItems: 'flex-end'
            }}>
              <button
                onClick={() => handleUpgrade('PRO')}
                disabled={billingFetcher.state === 'submitting'}
                style={{
                  padding: '16px 32px',
                  fontSize: '16px',
                  fontWeight: '600',
                  backgroundColor: 'white',
                  color: '#7c3aed',
                  border: 'none',
                  borderRadius: '12px',
                  cursor: billingFetcher.state === 'submitting' ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                {billingFetcher.state === 'submitting' ? 'Processing...' : (
                  <>Upgrade to PRO <span>⚡</span></>
                )}
              </button>
              <Link
                to="/app/billing?view=plans"
                style={{
                  fontSize: '14px',
                  color: 'white',
                  textDecoration: 'none',
                  opacity: 0.9
                }}
              >
                Need unlimited scale? View MAX Plan →
              </Link>
            </div>
          </div>

          {/* Row 2: Three features in one line */}
          <div style={{
            display: 'flex',
            gap: '48px',
            fontSize: '18px',
            fontWeight: '500'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '20px' }}>✓</span>
              <span>Sync 2,000 Products</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '20px' }}>✓</span>
              <span>3 Recommendations / Popup</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '20px' }}>✓</span>
              <span>no watermark</span>
            </div>
          </div>
        </div>
      )}

      {/* PRO Plan Usage Card */}
      {currentPlan === 'pro' && (
        <div style={{
          backgroundColor: 'white',
          borderRadius: '16px',
          padding: '32px',
          marginBottom: '40px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '24px'
          }}>
            <h2 style={{
              margin: 0,
              fontSize: '20px',
              fontWeight: '600',
              color: '#111827'
            }}>
              Pro Plan Usage
            </h2>
            <div style={{
              fontSize: '16px',
              fontWeight: '600',
              color: '#6b7280'
            }}>
              {syncStatus?.productCount || 0} / {planFeatures?.maxProducts?.toLocaleString() || '2,000'} Products
            </div>
          </div>

          {/* Progress Bar */}
          <div style={{
            width: '100%',
            height: '8px',
            backgroundColor: '#f3f4f6',
            borderRadius: '999px',
            overflow: 'hidden',
            marginBottom: '16px'
          }}>
            <div style={{
              height: '100%',
              backgroundColor: '#4f46e5',
              borderRadius: '999px',
              width: `${Math.min(((syncStatus?.productCount || 0) / (planFeatures?.maxProducts || 2000)) * 100, 100)}%`,
              transition: 'width 0.3s ease'
            }} />
          </div>

          {/* Upgrade Link */}
          <div style={{ textAlign: 'right' }}>
            <Link
              to="/app/billing?view=plans"
              style={{
                fontSize: '14px',
                color: '#4f46e5',
                textDecoration: 'none',
                fontWeight: '500'
              }}
            >
              Need more capacity? Upgrade to MAX (Unlimited) →
            </Link>
          </div>
        </div>
      )}

      {/* MAX Plan Usage Card */}
      {currentPlan === 'max' && (
        <div style={{
          backgroundColor: 'white',
          borderRadius: '16px',
          padding: '32px',
          marginBottom: '40px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '24px'
          }}>
            <h2 style={{
              margin: 0,
              fontSize: '20px',
              fontWeight: '600',
              color: '#111827'
            }}>
              MAX Plan Usage
            </h2>
            <div style={{
              fontSize: '16px',
              fontWeight: '600',
              color: '#6b7280'
            }}>
              {syncStatus?.productCount?.toLocaleString() || 0} / ∞ Products
            </div>
          </div>

          {/* Progress Bar (always shows some progress for visual feedback) */}
          <div style={{
            width: '100%',
            height: '8px',
            backgroundColor: '#f3f4f6',
            borderRadius: '999px',
            overflow: 'hidden'
          }}>
            <div style={{
              height: '100%',
              backgroundColor: '#7c3aed',
              borderRadius: '999px',
              width: '30%',
              transition: 'width 0.3s ease'
            }} />
          </div>
        </div>
      )}

      {/* Main Content */}
      <div>
          {/* Stats Grid - Three Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '24px',
            marginBottom: '48px'
          }}>
            {/* Card 1: Recommendations */}
            <div style={{
              backgroundColor: 'white',
              borderRadius: '16px',
              padding: '32px',
              border: '1px solid #e5e7eb',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}>
              <div style={{
                fontSize: '16px',
                fontWeight: '500',
                color: '#6b7280',
                marginBottom: '24px'
              }}>
                Recommendations
              </div>
              <div style={{
                fontSize: '64px',
                fontWeight: '700',
                color: '#111827',
                lineHeight: '1'
              }}>
                {(syncStatus?.recommendationCount || recommendations.length || 0).toLocaleString()}
              </div>
            </div>

            {/* Card 2: Total Clicks */}
            <div style={{
              backgroundColor: 'white',
              borderRadius: '16px',
              padding: '32px',
              border: '1px solid #e5e7eb',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '24px'
              }}>
                <span style={{
                  fontSize: '16px',
                  fontWeight: '500',
                  color: '#6b7280'
                }}>
                  Total Clicks
                </span>
                <span style={{
                  fontSize: '12px',
                  fontWeight: '700',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  backgroundColor: '#dcfce7',
                  color: '#10b981',
                  letterSpacing: '0.05em'
                }}>
                  LIVE
                </span>
              </div>
              <div style={{
                fontSize: '64px',
                fontWeight: '700',
                color: '#111827',
                lineHeight: '1',
                marginBottom: '12px'
              }}>
                {(statistics?.summary?.totalClicks || 0).toLocaleString()}
              </div>
              <p style={{
                margin: 0,
                fontSize: '14px',
                color: '#9ca3af'
              }}>
                Users clicked Recommendations
              </p>
            </div>

            {/* Card 3: Avg. Click-Through Rate */}
            <div style={{
              backgroundColor: 'white',
              borderRadius: '16px',
              padding: '32px',
              border: '1px solid #e5e7eb',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}>
              <div style={{
                fontSize: '16px',
                fontWeight: '500',
                color: '#6b7280',
                marginBottom: '24px'
              }}>
                Avg. Click-Through Rate
              </div>
              <div style={{
                fontSize: '64px',
                fontWeight: '700',
                color: '#111827',
                lineHeight: '1'
              }}>
                {statistics?.summary?.ctr || 0}%
              </div>
            </div>
          </div>

          {/* Synced Products Section */}
          <div style={{ marginBottom: '40px' }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <h2 style={{
                  margin: 0,
                  fontSize: '20px',
                  fontWeight: '600',
                  color: '#111827'
                }}>
                  Synced Products
                </h2>
                {currentPlan === 'free' && (
                  <span style={{
                    fontSize: '13px',
                    fontWeight: '600',
                    padding: '4px 12px',
                    borderRadius: '6px',
                    backgroundColor: '#fff7ed',
                    color: '#f97316'
                  }}>
                    Limit: {syncStatus?.productCount || 0} / {planFeatures?.maxProducts || 50}
                  </span>
                )}
              </div>

              <syncFetcher.Form method="post" action="/api/scan" style={{ display: 'inline' }}>
                <input type="hidden" name="mode" value={syncStatus?.initialSyncDone ? 'refresh' : 'auto'} />
                <button
                  type="submit"
                  disabled={isSyncing || (syncStatus?.initialSyncDone && !syncStatus?.refreshLimit?.canRefresh)}
                  title={
                    syncStatus?.initialSyncDone && !syncStatus?.refreshLimit?.canRefresh
                      ? (currentPlan === 'free'
                          ? 'Upgrade to PRO to unlock Resync All'
                          : `Next resync: ${formatDate(syncStatus?.refreshLimit?.nextRefreshAt)}`)
                      : (syncStatus?.initialSyncDone ? 'Regenerate all recommendations' : 'Start initial sync')
                  }
                  style={{
                    padding: '10px 20px',
                    fontSize: '14px',
                    fontWeight: '500',
                    backgroundColor: isSyncing || (syncStatus?.initialSyncDone && !syncStatus?.refreshLimit?.canRefresh) ? '#e5e7eb' : '#111827',
                    color: isSyncing || (syncStatus?.initialSyncDone && !syncStatus?.refreshLimit?.canRefresh) ? '#9ca3af' : 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: isSyncing || (syncStatus?.initialSyncDone && !syncStatus?.refreshLimit?.canRefresh) ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  {syncStatus?.initialSyncDone
                    ? `Resync (${syncStatus?.refreshLimit?.remaining || 0} left)`
                    : (isSyncing ? 'Syncing...' : 'Start Sync')
                  }
                </button>
              </syncFetcher.Form>
            </div>

            {/* Products Display */}
            {groupedProducts.length > 0 ? (
              currentPlan === 'free' ? (
                // FREE Plan: Table Layout
                <div style={{
                  backgroundColor: 'white',
                  borderRadius: '12px',
                  border: '1px solid #e5e7eb',
                  overflow: 'hidden'
                }}>
                  <table style={{
                    width: '100%',
                    borderCollapse: 'collapse'
                  }}>
                    <thead>
                      <tr style={{
                        backgroundColor: '#f9fafb',
                        borderBottom: '1px solid #e5e7eb'
                      }}>
                        <th style={{
                          padding: '16px',
                          textAlign: 'left',
                          fontSize: '12px',
                          fontWeight: '700',
                          color: '#6b7280',
                          letterSpacing: '0.05em',
                          textTransform: 'uppercase'
                        }}>
                          TRIGGER PRODUCT
                        </th>
                        <th style={{
                          padding: '16px',
                          textAlign: 'left',
                          fontSize: '12px',
                          fontWeight: '700',
                          color: '#6b7280',
                          letterSpacing: '0.05em',
                          textTransform: 'uppercase'
                        }}>
                          RECOMMENDATIONS
                        </th>
                        <th style={{
                          padding: '16px',
                          textAlign: 'center',
                          fontSize: '12px',
                          fontWeight: '700',
                          color: '#6b7280',
                          letterSpacing: '0.05em',
                          textTransform: 'uppercase',
                          width: '120px'
                        }}>
                          STATUS
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupedProducts.slice(0, 10).map((group, idx) => (
                        <tr
                          key={idx}
                          style={{
                            borderBottom: idx < groupedProducts.length - 1 ? '1px solid #e5e7eb' : 'none'
                          }}
                        >
                          {/* Trigger Product */}
                          <td style={{ padding: '16px', verticalAlign: 'top' }}>
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                              {group.product.image ? (
                                <img
                                  src={group.product.image}
                                  alt={group.product.title}
                                  style={{
                                    width: '50px',
                                    height: '50px',
                                    borderRadius: '6px',
                                    objectFit: 'cover',
                                    backgroundColor: '#f5f5f5'
                                  }}
                                />
                              ) : (
                                <div style={{
                                  width: '50px',
                                  height: '50px',
                                  borderRadius: '6px',
                                  backgroundColor: '#e9ecef',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '24px'
                                }}>
                                  📦
                                </div>
                              )}
                              <div>
                                <div style={{
                                  fontWeight: '500',
                                  color: '#111827',
                                  marginBottom: '4px',
                                  fontSize: '14px'
                                }}>
                                  {group.product.title}
                                </div>
                                <div style={{
                                  fontSize: '12px',
                                  color: '#9ca3af'
                                }}>
                                  ID: {group.product.id}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Recommendations */}
                          <td style={{ padding: '16px', verticalAlign: 'top' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {group.recommendations.map((rec, recIdx) => (
                                <div
                                  key={recIdx}
                                  style={{
                                    position: 'relative',
                                    padding: '12px',
                                    backgroundColor: recIdx === 0 ? '#f0fdf4' : '#f9fafb',
                                    borderRadius: '8px',
                                    borderLeft: recIdx === 0 ? '3px solid #10b981' : '3px solid transparent',
                                    fontSize: '13px'
                                  }}
                                >
                                  <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                                    {/* Recommendation Image */}
                                    {rec.image ? (
                                      <img
                                        src={rec.image}
                                        alt={rec.title}
                                        style={{
                                          width: '50px',
                                          height: '50px',
                                          borderRadius: '6px',
                                          objectFit: 'cover',
                                          backgroundColor: '#f5f5f5',
                                          flexShrink: 0
                                        }}
                                      />
                                    ) : (
                                      <div style={{
                                        width: '50px',
                                        height: '50px',
                                        borderRadius: '6px',
                                        backgroundColor: '#e9ecef',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '24px',
                                        flexShrink: 0
                                      }}>
                                        📦
                                      </div>
                                    )}

                                    {/* Recommendation Text */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{
                                        fontWeight: '500',
                                        color: '#111827',
                                        marginBottom: '4px'
                                      }}>
                                        {rec.title}
                                      </div>
                                      <div style={{
                                        fontSize: '12px',
                                        color: '#6b7280'
                                      }}>
                                        {rec.reason}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Lock Overlay for 2nd and 3rd recommendations */}
                                  {recIdx > 0 && (
                                    <div style={{
                                      position: 'absolute',
                                      top: 0,
                                      left: 0,
                                      right: 0,
                                      bottom: 0,
                                      backgroundColor: 'rgba(0, 0, 0, 0.5)',
                                      borderRadius: '8px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      backdropFilter: 'blur(2px)',
                                      cursor: 'not-allowed'
                                    }}>
                                      {recIdx === 1 && (
                                        <div style={{
                                          backgroundColor: 'rgba(55, 65, 81, 0.95)',
                                          color: 'white',
                                          padding: '8px 16px',
                                          borderRadius: '6px',
                                          fontSize: '12px',
                                          fontWeight: '600',
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '6px',
                                          whiteSpace: 'nowrap'
                                        }}>
                                          <span style={{ fontSize: '14px' }}>🔒</span>
                                          Upgrade to unlock these 2 items
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </td>

                          {/* Status */}
                          <td style={{ padding: '16px', textAlign: 'center', verticalAlign: 'top' }}>
                            <span style={{
                              display: 'inline-block',
                              padding: '6px 12px',
                              borderRadius: '6px',
                              backgroundColor: '#dcfce7',
                              color: '#10b981',
                              fontSize: '12px',
                              fontWeight: '600'
                            }}>
                              Active
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                // PRO/MAX Plans: Card Layout
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px'
                }}>
                  {groupedProducts.slice(0, 10).map((group, idx) => (
                    <div
                      key={idx}
                      style={{
                        backgroundColor: 'white',
                        borderRadius: '12px',
                        padding: '24px',
                        border: '1px solid #e5e7eb',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                      }}
                    >
                      {/* Product Header */}
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        marginBottom: '20px',
                        paddingBottom: '20px',
                        borderBottom: '1px solid #e5e7eb'
                      }}>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                          {group.product.image ? (
                            <img
                              src={group.product.image}
                              alt={group.product.title}
                              style={{
                                width: '60px',
                                height: '60px',
                                borderRadius: '8px',
                                objectFit: 'cover',
                                backgroundColor: '#f5f5f5'
                              }}
                            />
                          ) : (
                            <div style={{
                              width: '60px',
                              height: '60px',
                              borderRadius: '8px',
                              backgroundColor: '#e9ecef',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '28px'
                            }}>
                              📦
                            </div>
                          )}
                          <div>
                            <div style={{
                              fontWeight: '600',
                              color: '#111827',
                              marginBottom: '4px',
                              fontSize: '16px'
                            }}>
                              {group.product.title}
                            </div>
                            <div style={{
                              fontSize: '13px',
                              color: '#9ca3af'
                            }}>
                              ID: {group.product.id}
                            </div>
                          </div>
                        </div>
                        <span style={{
                          padding: '6px 12px',
                          borderRadius: '6px',
                          backgroundColor: '#dcfce7',
                          color: '#10b981',
                          fontSize: '12px',
                          fontWeight: '600'
                        }}>
                          Active
                        </span>
                      </div>

                      {/* Recommendations Row */}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${group.recommendations.length}, 1fr)`,
                        gap: '12px'
                      }}>
                        {group.recommendations.map((rec, recIdx) => (
                          <div
                            key={recIdx}
                            style={{
                              padding: '16px',
                              backgroundColor: '#f9fafb',
                              borderRadius: '8px',
                              border: '1px solid #e5e7eb'
                            }}
                          >
                            {recIdx === 0 && (
                              <div style={{
                                fontSize: '20px',
                                marginBottom: '8px'
                              }}>
                                ✨
                              </div>
                            )}
                            <div style={{
                              fontWeight: '600',
                              color: '#111827',
                              marginBottom: '6px',
                              fontSize: '14px'
                            }}>
                              {rec.title}
                            </div>
                            <div style={{
                              fontSize: '12px',
                              color: '#6b7280'
                            }}>
                              {rec.reason}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )
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
                  No products synced yet. Click "Resync" to get started.
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
