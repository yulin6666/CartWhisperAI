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
      // 同步计划状态到后端（修复前后端计划不一致的bug）
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
    upgraded,
    upgradeFailed,
    cancelled,
    isTestMode,
  } = useLoaderData();

  const planFetcher = useFetcher();
  const billingFetcher = useFetcher();
  const syncFetcher = useFetcher();
  const resetFetcher = useFetcher();
  const revalidator = useRevalidator();

  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('sourceProductId');
  const [activeTab, setActiveTab] = useState('overview');
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

  // Filter and sort recommendations
  const filteredRecommendations = recommendations.filter((rec) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      rec.sourceTitle.toLowerCase().includes(searchLower) ||
      rec.targetTitle.toLowerCase().includes(searchLower) ||
      rec.sourceProductId.includes(searchTerm) ||
      rec.targetProductId.includes(searchTerm)
    );
  });

  const sortedRecommendations = [...filteredRecommendations].sort((a, b) => {
    if (sortBy === 'sourceProductId') return a.sourceProductId.localeCompare(b.sourceProductId);
    if (sortBy === 'sourceTitle') return a.sourceTitle.localeCompare(b.sourceTitle);
    if (sortBy === 'targetTitle') return a.targetTitle.localeCompare(b.targetTitle);
    return 0;
  });

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '30px' }}>
        <div>
          <h1 style={{ marginBottom: '10px' }}>CartWhisper AI Dashboard</h1>
          <p style={{ color: '#666', marginBottom: '0' }}>
            Manage your product recommendations and monitor performance.
          </p>
        </div>
        {isTestMode && (
          <Link
            to="/app/test"
            style={{
              padding: '8px 16px',
              fontSize: '12px',
              backgroundColor: '#6c757d',
              color: 'white',
              borderRadius: '6px',
              textDecoration: 'none',
              fontWeight: '500',
              whiteSpace: 'nowrap',
            }}
            title="Test & Debug Console"
          >
            🧪 Test Console
          </Link>
        )}
      </div>

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

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: '0', marginBottom: '30px', borderBottom: '2px solid #e0e0e0' }}>
        {[
          { id: 'overview', label: 'Overview', icon: '📊' },
          { id: 'recommendations', label: 'Recommendations', icon: '🎯' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '12px 24px',
              fontSize: '14px',
              fontWeight: activeTab === tab.id ? 'bold' : 'normal',
              backgroundColor: activeTab === tab.id ? '#007bff' : 'transparent',
              color: activeTab === tab.id ? 'white' : '#666',
              border: 'none',
              borderRadius: '8px 8px 0 0',
              cursor: 'pointer',
              marginBottom: '-2px',
              borderBottom: activeTab === tab.id ? '2px solid #007bff' : '2px solid transparent',
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div>
          {/* Stats Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '30px' }}>
            <StatCard
              icon="📦"
              label="Products"
              value={syncStatus?.productCount || stats.products || 0}
              color="#1976d2"
              bgColor="#e3f2fd"
            />
            <StatCard
              icon="🎯"
              label="Recommendations"
              value={syncStatus?.recommendationCount || stats.recommendations || 0}
              color="#7b1fa2"
              bgColor="#f3e5f5"
            />
            <StatCard
              icon="⭐"
              label="Plan"
              value={currentPlan.toUpperCase()}
              color={isMax ? '#9c27b0' : (isPro ? '#f57c00' : '#388e3c')}
              bgColor={isMax ? '#f3e5f5' : (isPro ? '#fff3e0' : '#e8f5e9')}
              extra={
                <div style={{ marginTop: '8px' }}>
                  {!isPaid ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <button
                        onClick={() => handleUpgrade('PRO')}
                        disabled={billingFetcher.state === 'submitting'}
                        style={{
                          padding: '6px 16px',
                          fontSize: '12px',
                          backgroundColor: '#ff9800',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontWeight: 'bold',
                        }}
                      >
                        {billingFetcher.state === 'submitting' ? 'Processing...' : '⬆️ Upgrade to PRO'}
                      </button>
                      <button
                        onClick={() => handleUpgrade('MAX')}
                        disabled={billingFetcher.state === 'submitting'}
                        style={{
                          padding: '6px 16px',
                          fontSize: '12px',
                          backgroundColor: '#9c27b0',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontWeight: 'bold',
                        }}
                      >
                        {billingFetcher.state === 'submitting' ? 'Processing...' : '⬆️ Upgrade to MAX'}
                      </button>
                    </div>
                  ) : isPro ? (
                    <div>
                      <div style={{ fontSize: '11px', color: '#666' }}>
                        <div>✓ PRO features unlocked</div>
                        {subscription?.currentPeriodEnd && (
                          <div style={{ marginTop: '4px' }}>
                            Renews: {formatDate(subscription.currentPeriodEnd)}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                        <button
                          onClick={() => handleUpgrade('MAX')}
                          disabled={billingFetcher.state === 'submitting'}
                          style={{
                            padding: '4px 12px',
                            fontSize: '11px',
                            backgroundColor: '#9c27b0',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                          }}
                        >
                          ⬆️ Upgrade to MAX
                        </button>
                        {!subscription?.isTestMode && (
                          <button
                            onClick={handleCancelSubscription}
                            disabled={billingFetcher.state === 'submitting'}
                            style={{
                              padding: '4px 12px',
                              fontSize: '11px',
                              backgroundColor: '#dc3545',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontWeight: 'normal',
                            }}
                          >
                            Cancel Subscription
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: '11px', color: '#666' }}>
                        <div>✓ All features unlocked</div>
                        {subscription?.currentPeriodEnd && (
                          <div style={{ marginTop: '4px' }}>
                            Renews: {formatDate(subscription.currentPeriodEnd)}
                          </div>
                        )}
                      </div>
                      {!subscription?.isTestMode && (
                        <button
                          onClick={handleCancelSubscription}
                          disabled={billingFetcher.state === 'submitting'}
                          style={{
                            padding: '4px 12px',
                            fontSize: '11px',
                            backgroundColor: '#dc3545',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            marginTop: '6px',
                            fontWeight: 'normal',
                          }}
                        >
                          Cancel Subscription
                        </button>
                      )}
                    </div>
                  )}
                </div>
              }
            />
          </div>

          {/* Resync All Status */}
          {syncStatus?.refreshLimit && (
            <div style={{
              marginBottom: '20px',
              padding: '15px 20px',
              backgroundColor: syncStatus.refreshLimit.canRefresh ? '#d4edda' : (currentPlan === 'free' ? '#fff3e0' : '#fff3cd'),
              borderRadius: '8px',
              border: `1px solid ${syncStatus.refreshLimit.canRefresh ? '#c3e6cb' : (currentPlan === 'free' ? '#ffb74d' : '#ffc107')}`,
            }}>
              <span style={{ fontSize: '14px' }}>
                🔄 <strong>Resync All Limit:</strong> {syncStatus.refreshLimit.used}/{syncStatus.refreshLimit.limit} used this month
                {syncStatus.refreshLimit.limit === 0 ? (
                  <span style={{ marginLeft: '10px', color: '#e65100' }}>
                    🔒 Free plan: Upgrade to PRO for {planFeatures?.manualRefreshPerMonth || 4} resyncs/month
                  </span>
                ) : syncStatus.refreshLimit.canRefresh ? (
                  <span style={{ marginLeft: '10px', color: '#28a745' }}>
                    ✅ {syncStatus.refreshLimit.remaining} resync{syncStatus.refreshLimit.remaining !== 1 ? 's' : ''} remaining
                  </span>
                ) : (
                  <span style={{ marginLeft: '10px', color: '#856404' }}>
                    ⏰ Next resync: {formatDate(syncStatus.refreshLimit.nextRefreshAt)}
                  </span>
                )}
              </span>
            </div>
          )}

          {/* Quick Actions */}
          <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', marginBottom: '30px' }}>
            {/* Sync New Products Button */}
            <syncFetcher.Form method="post" action="/api/scan">
              <input type="hidden" name="mode" value="auto" />
              <button
                type="submit"
                disabled={isSyncing}
                style={{
                  padding: '12px 24px',
                  fontSize: '14px',
                  backgroundColor: isSyncing ? '#ccc' : '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: isSyncing ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                {isSyncing ? (
                  <>
                    <span>⏳</span> Syncing...
                  </>
                ) : (
                  <>🚀 {syncStatus?.initialSyncDone ? 'Sync New Products' : 'Initial Sync'}</>
                )}
              </button>
            </syncFetcher.Form>

            {/* Resync All Button */}
            {syncStatus?.initialSyncDone && (
              <syncFetcher.Form method="post" action="/api/scan">
                <input type="hidden" name="mode" value="refresh" />
                <button
                  type="submit"
                  disabled={isSyncing || !syncStatus?.refreshLimit?.canRefresh}
                  title={
                    !syncStatus?.refreshLimit?.canRefresh
                      ? (currentPlan === 'free'
                          ? 'Free plan: Upgrade to PRO to unlock Resync All'
                          : `Next resync: ${formatDate(syncStatus?.refreshLimit?.nextRefreshAt)}`)
                      : 'Regenerate all recommendations'
                  }
                  style={{
                    padding: '12px 24px',
                    fontSize: '14px',
                    backgroundColor: isSyncing || !syncStatus?.refreshLimit?.canRefresh ? '#ccc' : '#fd7e14',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: isSyncing || !syncStatus?.refreshLimit?.canRefresh ? 'not-allowed' : 'pointer',
                    fontWeight: 'bold',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  🔄 Resync All
                </button>
              </syncFetcher.Form>
            )}

            {/* Upgrade Link for Free Users */}
            {currentPlan === 'free' && (
              <Link
                to="/app/billing"
                style={{
                  padding: '12px 24px',
                  fontSize: '14px',
                  backgroundColor: '#ff9800',
                  color: 'white',
                  borderRadius: '6px',
                  textDecoration: 'none',
                  fontWeight: 'bold',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                ⬆️ Upgrade to PRO
              </Link>
            )}
          </div>

          {/* Sync Progress */}
          {isSyncing && (
            <div style={{ marginBottom: '30px' }}>
              <div style={{ marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#007bff' }}>Syncing in progress...</span>
                <span style={{ fontSize: '12px', color: '#999' }}>Please wait, this may take up to 30 minutes</span>
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
          {syncFetcher.data && (
            <div
              style={{
                marginBottom: '30px',
                padding: '20px',
                borderRadius: '8px',
                border: syncFetcher.data.success ? '2px solid #28a745' : syncFetcher.data.rateLimited ? '2px solid #ffc107' : '2px solid #dc3545',
                backgroundColor: syncFetcher.data.success ? '#d4edda' : syncFetcher.data.rateLimited ? '#fff3cd' : '#f8d7da',
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

          {/* Analytics Section - Moved from Analytics tab */}
          <h2 style={{ marginBottom: '20px', fontSize: '20px' }}>Analytics</h2>

          {/* Upgrade Banner for Free Users */}
          {!hasAdvancedAnalytics && (
            <div style={{ backgroundColor: '#fff3e0', borderRadius: '8px', padding: '20px', marginBottom: '30px', border: '1px solid #ffb74d', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: '0 0 8px 0', color: '#e65100', fontSize: '16px' }}>🔒 Unlock Advanced Analytics</h3>
                <p style={{ margin: 0, color: '#e65100', fontSize: '14px' }}>
                  Upgrade to PRO or MAX plan to access Click-through Rate, Top Recommendations, and Top Products analytics.
                </p>
              </div>
              <Link
                to="/app/billing"
                style={{
                  padding: '10px 24px',
                  backgroundColor: '#ff9800',
                  color: 'white',
                  borderRadius: '6px',
                  textDecoration: 'none',
                  fontWeight: 'bold',
                  fontSize: '14px',
                  whiteSpace: 'nowrap',
                  marginLeft: '20px',
                }}
              >
                Upgrade Now
              </Link>
            </div>
          )}

          {/* Summary Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '30px' }}>
            <StatCard
              icon="👁️"
              label="Total Impressions"
              value={(statistics?.summary?.totalImpressions || 0).toLocaleString()}
              color="#1976d2"
              bgColor="#e3f2fd"
            />
            <StatCard
              icon="👆"
              label="Total Clicks"
              value={(statistics?.summary?.totalClicks || 0).toLocaleString()}
              color="#388e3c"
              bgColor="#e8f5e9"
            />
            {/* CTR - Locked for Free Users */}
            <div style={{ position: 'relative' }}>
              <StatCard
                icon="📊"
                label="Click-through Rate"
                value={hasAdvancedAnalytics ? `${statistics?.summary?.ctr || 0}%` : '••••'}
                color="#f57c00"
                bgColor="#fff3e0"
              />
              {!hasAdvancedAnalytics && (
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backdropFilter: 'blur(4px)',
                  borderRadius: '12px',
                  pointerEvents: 'none',
                }} />
              )}
            </div>
            <StatCard
              icon="💰"
              label="Revenue Attribution"
              value="Coming Soon"
              color="#9e9e9e"
              bgColor="#f5f5f5"
            />
          </div>

          {/* No Data Message */}
          {(!statistics?.summary?.totalImpressions || statistics.summary.totalImpressions === 0) && (
            <div style={{ backgroundColor: '#e3f2fd', borderRadius: '8px', padding: '20px', marginBottom: '30px', border: '1px solid #90caf9' }}>
              <h3 style={{ margin: '0 0 10px 0', color: '#1565c0' }}>No Tracking Data Yet</h3>
              <p style={{ margin: 0, color: '#1565c0' }}>
                Once you integrate the tracking code into your storefront theme, you'll see impressions and clicks data here.
                See the integration guide below.
              </p>
            </div>
          )}

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
      )}

      {/* Recommendations Tab */}
      {activeTab === 'recommendations' && (
        <div>
          {/* Search and Sort */}
          <div style={{ marginBottom: '20px', display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>Search</label>
              <input
                type="text"
                placeholder="Search by product name or ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '6px',
                  border: '1px solid #ddd',
                  fontSize: '14px',
                }}
              />
            </div>
            <div style={{ minWidth: '200px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>Sort by</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '6px',
                  border: '1px solid #ddd',
                  fontSize: '14px',
                }}
              >
                <option value="sourceProductId">Source Product ID</option>
                <option value="sourceTitle">Source Product Title</option>
                <option value="targetTitle">Target Product Title</option>
              </select>
            </div>
          </div>

          {/* Recommendations Table */}
          {sortedRecommendations.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', backgroundColor: '#f5f5f5', borderRadius: '8px', color: '#999' }}>
              {recommendations.length === 0 ? (
                <>
                  <p style={{ fontSize: '16px', marginBottom: '10px' }}>No recommendations yet</p>
                  <p style={{ fontSize: '14px' }}>
                    Click "Sync New Products" button above to generate recommendations
                  </p>
                </>
              ) : (
                <p>No results match your search</p>
              )}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', borderRadius: '8px', overflow: 'hidden' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f5f5f5', borderBottom: '2px solid #ddd' }}>
                    <th style={{ padding: '15px', textAlign: 'left', fontWeight: 'bold', fontSize: '14px' }}>Source Product</th>
                    <th style={{ padding: '15px', textAlign: 'left', fontWeight: 'bold', fontSize: '14px' }}>Recommended Product</th>
                    <th style={{ padding: '15px', textAlign: 'left', fontWeight: 'bold', fontSize: '14px' }}>Reason</th>
                    <th style={{ padding: '15px', textAlign: 'center', fontWeight: 'bold', fontSize: '14px' }}>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRecommendations.map((rec, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #eee', backgroundColor: idx % 2 === 0 ? '#ffffff' : '#fafafa' }}>
                      <td style={{ padding: '12px 15px', fontSize: '14px' }}>
                        <ProductCell image={rec.sourceImage} title={rec.sourceTitle} id={rec.sourceProductId} />
                      </td>
                      <td style={{ padding: '12px 15px', fontSize: '14px' }}>
                        <ProductCell image={rec.targetImage} title={rec.targetTitle} id={rec.targetProductId} />
                      </td>
                      <td style={{ padding: '12px 15px', fontSize: '14px', color: '#666' }}>
                        <ReasonCell reason={rec.reason} />
                      </td>
                      <td style={{ padding: '12px 15px', fontSize: '12px', color: '#999', textAlign: 'center' }}>
                        {new Date(rec.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: '15px', fontSize: '12px', color: '#999', textAlign: 'right' }}>
                Showing {sortedRecommendations.length} of {recommendations.length} recommendations
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#ffebee', borderRadius: '8px', border: '1px solid #ef5350', color: '#c62828' }}>
          Error: {error}
        </div>
      )}
    </div>
  );
}

// Helper Components
function StatCard({ icon, label, value, color, bgColor, extra }) {
  return (
    <div style={{ padding: '20px', borderRadius: '12px', backgroundColor: bgColor, border: `1px solid ${color}22` }}>
      <div style={{ fontSize: '24px', marginBottom: '8px' }}>{icon}</div>
      <div style={{ fontSize: '14px', color: '#666', marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '28px', fontWeight: 'bold', color }}>{value}</div>
      {extra}
    </div>
  );
}

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

function ReasonCell({ reason }) {
  const parts = (reason || '—').split('|');
  // Display English only (parts[1]), fallback to parts[0] if no English
  const displayText = parts[1] || parts[0] || '—';
  return (
    <div>
      <div style={{ fontWeight: '500' }}>{displayText}</div>
    </div>
  );
}
