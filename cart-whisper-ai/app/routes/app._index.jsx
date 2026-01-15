import { useLoaderData, Link, useFetcher, useRevalidator } from 'react-router';
import { useState, useEffect } from 'react';
import { authenticate } from '../shopify.server';
import { BACKEND_URL, getSyncStatus, getStatistics } from '../utils/backendApi.server';
import { getApiKey } from '../utils/shopConfig.server';
import { getSubscription, getPlanFeatures } from '../utils/billing.server';

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
  let totalShopifyProducts = 0;
  let unsyncedProducts = [];

  try {
    // 获取订阅信息
    subscription = await getSubscription(shop);
    planFeatures = await getPlanFeatures(shop);

    apiKey = await getApiKey(shop);

    if (apiKey) {
      // 获取同步状态（包含 API 使用量）
      const statusResult = await getSyncStatus(apiKey);
      syncStatus = statusResult.syncStatus;

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
        console.log('[Dashboard] Error getting statistics:', e.message);
      }

      // 获取 Shopify 总商品数和未同步商品
      try {
        const PRODUCT_COUNT_QUERY = `
          query GetProductCount {
            productsCount {
              count
            }
            products(first: 10, query: "status:active", sortKey: CREATED_AT, reverse: true) {
              edges {
                node {
                  id
                  title
                  handle
                  images(first: 1) {
                    edges {
                      node {
                        url
                      }
                    }
                  }
                }
              }
            }
          }
        `;

        const response = await admin.graphql(PRODUCT_COUNT_QUERY);
        const data = await response.json();

        if (data.data) {
          totalShopifyProducts = data.data.productsCount?.count || 0;

          // 如果有未同步的商品，获取一些样本
          const syncedCount = syncStatus?.productCount || 0;
          const maxProducts = planFeatures?.maxProducts || 50;

          if (totalShopifyProducts > syncedCount && syncedCount >= maxProducts) {
            // 获取最新的商品作为未同步商品样本
            unsyncedProducts = data.data.products.edges.slice(0, 5).map(edge => ({
              id: edge.node.id,
              title: edge.node.title,
              handle: edge.node.handle,
              image: edge.node.images.edges[0]?.node?.url || null,
            }));
          }
        }
      } catch (e) {
        console.log('[Dashboard] Error getting product count:', e.message);
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
    totalShopifyProducts,
    unsyncedProducts,
    error,
    // 查询参数用于显示通知
    upgraded: url.searchParams.get('upgraded') === 'true',
    upgradeFailed: url.searchParams.get('upgrade_failed') === 'true',
    cancelled: url.searchParams.get('cancelled') === 'true',
    isTestMode: process.env.NODE_ENV === 'development',
  };
}

// Action: Handle reset API usage
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
    totalShopifyProducts,
    unsyncedProducts,
    error,
    upgraded,
    upgradeFailed,
    cancelled,
    isTestMode,
  } = useLoaderData();

  const planFetcher = useFetcher();
  const billingFetcher = useFetcher();
  const revalidator = useRevalidator();

  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('sourceProductId');
  const [activeTab, setActiveTab] = useState('overview');
  const [showNotification, setShowNotification] = useState(null);

  // Get current plan from subscription
  const currentPlan = subscription?.plan || 'free';
  const isPro = currentPlan === 'pro' && subscription?.status === 'active';
  const isMax = currentPlan === 'max' && subscription?.status === 'active';
  const isPaid = (isPro || isMax) && subscription?.status === 'active';
  const hasAdvancedAnalytics = planFeatures?.analytics === 'advanced';

  // Revalidate after action
  useEffect(() => {
    if (planFetcher.data?.success) {
      revalidator.revalidate();
    }
  }, [planFetcher.data]);

  // Show notifications
  useEffect(() => {
    if (upgraded) {
      setShowNotification({ type: 'success', message: 'Successfully upgraded to Pro Plan!' });
    } else if (upgradeFailed) {
      setShowNotification({ type: 'error', message: 'Upgrade failed. Please try again.' });
    } else if (cancelled) {
      setShowNotification({ type: 'info', message: 'Subscription cancelled. You are now on the Free Plan.' });
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

  const handleTestToggle = () => {
    billingFetcher.submit(
      { action: 'toggle_test' },
      { method: 'post', action: '/app/billing' }
    );
  };

  if (!isRegistered) {
    return (
      <div style={{ maxWidth: '800px', margin: '40px auto', padding: '20px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '28px', marginBottom: '20px' }}>Welcome to CartWhisper AI</h1>
        <p style={{ color: '#666', marginTop: '10px', fontSize: '16px', marginBottom: '30px' }}>
          AI-powered product recommendations to boost your sales
        </p>
        <div style={{ backgroundColor: '#f8f9fa', borderRadius: '12px', padding: '30px', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '20px', marginBottom: '15px' }}>Get Started</h2>
          <p style={{ color: '#666', marginBottom: '20px' }}>
            Sync your products to start generating AI-powered recommendations
          </p>
          <Link
            to="/app/scan"
            style={{
              display: 'inline-block',
              padding: '12px 30px',
              fontSize: '16px',
              backgroundColor: '#007bff',
              color: 'white',
              borderRadius: '8px',
              textDecoration: 'none',
              fontWeight: 'bold'
            }}
          >
            Sync Products Now
          </Link>
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
      <h1 style={{ marginBottom: '10px' }}>CartWhisper AI Dashboard</h1>
      <p style={{ color: '#666', marginBottom: '30px' }}>
        Manage your product recommendations and monitor performance.
      </p>

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
          { id: 'analytics', label: 'Analytics', icon: '📈' },
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
              value={
                <div>
                  <div style={{ fontSize: '28px', fontWeight: 'bold' }}>
                    {currentPlan.toUpperCase()}
                  </div>
                  {subscription?.isTestMode && (
                    <div style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>
                      (Test Mode)
                    </div>
                  )}
                </div>
              }
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
                          marginTop: '6px',
                          fontWeight: 'bold',
                        }}
                      >
                        ⬆️ Upgrade to MAX
                      </button>
                    </div>
                  ) : (
                    <div style={{ fontSize: '11px', color: '#666' }}>
                      <div>✓ All features unlocked</div>
                      {subscription?.currentPeriodEnd && (
                        <div style={{ marginTop: '4px' }}>
                          Renews: {formatDate(subscription.currentPeriodEnd)}
                        </div>
                      )}
                    </div>
                  )}
                  {isTestMode && (
                    <button
                      onClick={handleTestToggle}
                      disabled={billingFetcher.state === 'submitting'}
                      style={{
                        padding: '4px 12px',
                        fontSize: '10px',
                        backgroundColor: '#6c757d',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        marginTop: '6px',
                      }}
                    >
                      🧪 Test: Cycle Plan
                    </button>
                  )}
                </div>
              }
            />
            <StatCard
              icon="🔄"
              label="Last Refresh"
              value={syncStatus?.lastRefreshAt ? formatDate(syncStatus.lastRefreshAt).split(' ')[0] : 'Never'}
              color="#0097a7"
              bgColor="#e0f7fa"
            />
          </div>

          {/* Quick Actions */}
          <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
            <Link
              to="/app/scan"
              style={{
                padding: '12px 24px',
                fontSize: '14px',
                backgroundColor: '#007bff',
                color: 'white',
                borderRadius: '6px',
                textDecoration: 'none',
                fontWeight: 'bold',
              }}
            >
              Sync Products
            </Link>
            <button
              onClick={() => setActiveTab('recommendations')}
              style={{
                padding: '12px 24px',
                fontSize: '14px',
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
            >
              View Recommendations
            </button>
          </div>

          {/* Unsynced Products Section */}
          {unsyncedProducts.length > 0 && (
            <div style={{
              marginTop: '30px',
              backgroundColor: '#fff3e0',
              borderRadius: '12px',
              padding: '24px',
              border: '2px solid #ff9800',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                <div>
                  <h3 style={{ margin: '0 0 8px 0', color: '#e65100', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '24px' }}>📦</span>
                    Unsynced Products
                  </h3>
                  <p style={{ margin: 0, color: '#e65100', fontSize: '14px' }}>
                    You have {totalShopifyProducts - (syncStatus?.productCount || 0)} products that haven't been synced yet.
                    Upgrade to PRO or MAX to sync all your products and generate more recommendations!
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
                  ⬆️ Upgrade Now
                </Link>
              </div>

              {/* Sample Unsynced Products */}
              <div style={{ marginTop: '16px' }}>
                <h4 style={{ margin: '0 0 12px 0', color: '#e65100', fontSize: '14px', fontWeight: 'bold' }}>
                  Sample Unsynced Products:
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                  {unsyncedProducts.map((product, idx) => (
                    <div
                      key={idx}
                      style={{
                        backgroundColor: 'white',
                        borderRadius: '8px',
                        padding: '12px',
                        border: '1px solid #ffb74d',
                        display: 'flex',
                        gap: '12px',
                        alignItems: 'center',
                      }}
                    >
                      {product.image ? (
                        <img
                          src={product.image}
                          alt={product.title}
                          style={{
                            width: '50px',
                            height: '50px',
                            borderRadius: '6px',
                            objectFit: 'cover',
                            backgroundColor: '#f5f5f5',
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: '50px',
                            height: '50px',
                            borderRadius: '6px',
                            backgroundColor: '#f5f5f5',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '24px',
                          }}
                        >
                          📦
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: '500',
                            fontSize: '13px',
                            color: '#333',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={product.title}
                        >
                          {product.title}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <p style={{ margin: '12px 0 0 0', fontSize: '12px', color: '#666', fontStyle: 'italic' }}>
                  ...and {totalShopifyProducts - (syncStatus?.productCount || 0) - unsyncedProducts.length} more products
                </p>
              </div>
            </div>
          )}
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
                    Sync products at <Link to="/app/scan" style={{ color: '#1a73e8' }}>Sync Products</Link> to generate recommendations
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

      {/* Analytics Tab */}
      {activeTab === 'analytics' && (
        <div>
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
