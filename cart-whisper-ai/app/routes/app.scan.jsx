import { useFetcher, useLoaderData, Link, useRevalidator } from 'react-router';
import { useState, useEffect } from 'react';
import { authenticate } from '../shopify.server';
import { healthCheck, getSyncStatus, BACKEND_URL } from '../utils/backendApi.server';
import { getApiKey } from '../utils/shopConfig.server';

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // 检查后端状态
  let backendStatus = { status: 'unknown' };
  let apiKey = null;
  let syncStatus = null;

  try {
    backendStatus = await healthCheck();
  } catch (e) {
    backendStatus = { status: 'error', message: e.message };
  }

  // 尝试获取 API Key（如果已注册）
  try {
    apiKey = await getApiKey(shop);

    // 获取同步状态
    if (apiKey) {
      const statusResult = await getSyncStatus(apiKey);
      syncStatus = statusResult.syncStatus;
    }
  } catch (e) {
    // 尚未注册，首次扫描时会自动注册
    console.log('[Scan] Error getting sync status:', e.message);
  }

  return {
    shop,
    backendUrl: BACKEND_URL,
    backendStatus,
    isRegistered: !!apiKey,
    syncStatus,
  };
};

// Action: Handle plan toggle and reset refresh
export const action = async ({ request }) => {
  const formData = await request.formData();
  const actionType = formData.get('_action');
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  if (actionType === 'togglePlan') {
    const currentPlan = formData.get('currentPlan');
    const newPlan = currentPlan === 'pro' ? 'free' : 'pro';

    try {
      const response = await fetch(`${BACKEND_URL}/api/shops/${shop}/plan`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: newPlan }),
      });

      if (!response.ok) {
        throw new Error('Failed to update plan');
      }

      return { success: true, newPlan, action: 'togglePlan' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  if (actionType === 'resetRefresh') {
    try {
      // Reset lastRefreshAt to null via backend API
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

  if (actionType === 'resetApiUsage') {
    try {
      // Reset API usage count via backend API
      const response = await fetch(`${BACKEND_URL}/api/shops/${shop}/plan`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiCallsToday: 0 }),
      });

      if (!response.ok) {
        throw new Error('Failed to reset API usage');
      }

      return { success: true, action: 'resetApiUsage' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  return null;
};

export default function ScanPage() {
  const { shop, backendUrl, backendStatus, isRegistered, syncStatus } = useLoaderData();
  const fetcher = useFetcher();
  const planFetcher = useFetcher();
  const revalidator = useRevalidator();
  const isScanning = fetcher.state === 'submitting';
  const isTogglingPlan = planFetcher.state === 'submitting';
  const [showDetails, setShowDetails] = useState(false);

  // Get current plan (use planFetcher result if available, otherwise use loader data)
  const currentPlan = planFetcher.data?.newPlan || syncStatus?.plan || 'free';

  // Revalidate after plan toggle to refresh sync status
  useEffect(() => {
    if (planFetcher.data?.success) {
      revalidator.revalidate();
    }
  }, [planFetcher.data]);

  // Format date helper
  const formatDate = (dateStr) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleDateString('zh-CN', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '20px' }}>
      <h1>🔄 Product Sync</h1>
      <p style={{ color: '#666', marginBottom: '30px' }}>
        Sync your Shopify products to CartWhisper AI backend and generate recommendations.
      </p>

      {/* 后端状态 */}
      <div
        style={{
          padding: '15px 20px',
          marginBottom: '20px',
          borderRadius: '8px',
          backgroundColor: backendStatus.status === 'ok' ? '#d4edda' : '#f8d7da',
          border: `1px solid ${backendStatus.status === 'ok' ? '#c3e6cb' : '#f5c6cb'}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '20px' }}>
            {backendStatus.status === 'ok' ? '🟢' : '🔴'}
          </span>
          <div>
            <strong>Backend Status:</strong> {backendStatus.status === 'ok' ? 'Connected' : 'Disconnected'}
            {backendStatus.ai !== undefined && (
              <span style={{ marginLeft: '15px', color: '#666' }}>
                | AI: {backendStatus.ai ? '✅ Enabled' : '⚠️ Disabled'}
              </span>
            )}
          </div>
        </div>
        <p style={{ margin: '8px 0 0 30px', fontSize: '12px', color: '#666' }}>
          {backendUrl}
        </p>
      </div>

      {/* 商店信息 */}
      <div
        style={{
          padding: '15px 20px',
          marginBottom: '20px',
          borderRadius: '8px',
          backgroundColor: '#e7f3ff',
          border: '1px solid #b3d9ff',
        }}
      >
        <p style={{ margin: 0 }}>
          <strong>Shop:</strong> {shop}
          <span style={{ marginLeft: '15px', color: '#666' }}>
            | Registration: {isRegistered ? '✅ Registered' : '⏳ Will register on first sync'}
          </span>
        </p>
      </div>

      {/* 同步状态 */}
      {syncStatus && (
        <div
          style={{
            padding: '15px 20px',
            marginBottom: '20px',
            borderRadius: '8px',
            backgroundColor: '#f8f9fa',
            border: '1px solid #dee2e6',
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px' }}>
            <div>
              <div style={{ fontSize: '12px', color: '#666' }}>Products</div>
              <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{syncStatus.productCount}</div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#666' }}>Recommendations</div>
              <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{syncStatus.recommendationCount}</div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#666' }}>Last Refresh</div>
              <div style={{ fontSize: '14px', fontWeight: 'bold' }}>{formatDate(syncStatus.lastRefreshAt)}</div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#666' }}>Plan</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '14px', fontWeight: 'bold', textTransform: 'uppercase' }}>
                  {currentPlan === 'pro' ? '⭐ Pro' : '🆓 Free'}
                </span>
                <planFetcher.Form method="post">
                  <input type="hidden" name="_action" value="togglePlan" />
                  <input type="hidden" name="currentPlan" value={currentPlan} />
                  <button
                    type="submit"
                    disabled={isTogglingPlan}
                    style={{
                      padding: '4px 8px',
                      fontSize: '11px',
                      backgroundColor: currentPlan === 'pro' ? '#dc3545' : '#28a745',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: isTogglingPlan ? 'wait' : 'pointer',
                      opacity: isTogglingPlan ? 0.7 : 1,
                    }}
                    title={`Switch to ${currentPlan === 'pro' ? 'Free' : 'Pro'} (for testing)`}
                  >
                    {isTogglingPlan ? '...' : currentPlan === 'pro' ? '↓ Free' : '↑ Pro'}
                  </button>
                </planFetcher.Form>
              </div>
            </div>
          </div>
          {!syncStatus.canRefresh && syncStatus.nextRefreshAt && (
            <div style={{ marginTop: '10px', padding: '8px 12px', backgroundColor: '#fff3cd', borderRadius: '4px', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>
                ⏰ Next refresh available: {formatDate(syncStatus.nextRefreshAt)}
                {syncStatus.daysUntilRefresh && ` (${syncStatus.daysUntilRefresh} days)`}
              </span>
              <planFetcher.Form method="post" style={{ marginLeft: '10px' }}>
                <input type="hidden" name="_action" value="resetRefresh" />
                <button
                  type="submit"
                  disabled={isTogglingPlan}
                  style={{
                    padding: '4px 8px',
                    fontSize: '11px',
                    backgroundColor: '#6c757d',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                  title="Reset refresh time (for testing)"
                >
                  🔓 Reset
                </button>
              </planFetcher.Form>
            </div>
          )}

          {/* API 使用量 */}
          {syncStatus.apiUsage && (
            <div style={{ marginTop: '15px', padding: '12px', backgroundColor: '#f0f0f0', borderRadius: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 'bold' }}>📊 API Usage (Today)</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', color: '#666' }}>
                    {syncStatus.apiUsage.used.toLocaleString()} / {syncStatus.apiUsage.limit.toLocaleString()}
                  </span>
                  <planFetcher.Form method="post">
                    <input type="hidden" name="_action" value="resetApiUsage" />
                    <button
                      type="submit"
                      disabled={isTogglingPlan}
                      style={{
                        padding: '2px 6px',
                        fontSize: '10px',
                        backgroundColor: '#6c757d',
                        color: 'white',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer',
                      }}
                      title="Reset API usage (for testing)"
                    >
                      Reset
                    </button>
                  </planFetcher.Form>
                </div>
              </div>
              {/* Progress bar */}
              <div style={{ height: '8px', backgroundColor: '#ddd', borderRadius: '4px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${syncStatus.apiUsage.percentage}%`,
                    height: '100%',
                    backgroundColor: syncStatus.apiUsage.percentage > 80 ? '#dc3545' : syncStatus.apiUsage.percentage > 50 ? '#ffc107' : '#28a745',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '11px', color: '#666' }}>
                <span>{syncStatus.apiUsage.percentage}% used</span>
                <span>{syncStatus.apiUsage.remaining.toLocaleString()} remaining</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 扫描按钮 */}
      <div style={{ marginBottom: '30px', display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
        {/* 智能同步按钮（默认，增量） */}
        <fetcher.Form method="post" action="/api/scan">
          <input type="hidden" name="mode" value="auto" />
          <button
            type="submit"
            disabled={isScanning || backendStatus.status !== 'ok'}
            style={{
              padding: '14px 28px',
              fontSize: '16px',
              backgroundColor: isScanning ? '#ccc' : backendStatus.status !== 'ok' ? '#999' : '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: isScanning || backendStatus.status !== 'ok' ? 'not-allowed' : 'pointer',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {isScanning ? (
              <>
                <span className="spinner">⏳</span> Syncing...
              </>
            ) : (
              <>🚀 {syncStatus?.initialSyncDone ? 'Sync New Products' : 'Initial Sync'}</>
            )}
          </button>
        </fetcher.Form>

        {/* 强制刷新按钮 */}
        {syncStatus?.initialSyncDone && (
          <fetcher.Form method="post" action="/api/scan">
            <input type="hidden" name="mode" value="refresh" />
            <button
              type="submit"
              disabled={isScanning || backendStatus.status !== 'ok' || !syncStatus?.canRefresh}
              title={!syncStatus?.canRefresh ? `Next refresh: ${formatDate(syncStatus?.nextRefreshAt)}` : 'Regenerate all recommendations'}
              style={{
                padding: '14px 28px',
                fontSize: '16px',
                backgroundColor: isScanning || !syncStatus?.canRefresh ? '#ccc' : '#fd7e14',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: isScanning || !syncStatus?.canRefresh ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              🔄 Force Refresh
            </button>
          </fetcher.Form>
        )}

        <Link
          to="/app/recommendations"
          style={{
            padding: '14px 28px',
            fontSize: '16px',
            backgroundColor: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            textDecoration: 'none',
            fontWeight: 'bold',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          📊 View Recommendations
        </Link>
      </div>

      {/* 扫描进度条 */}
      {isScanning && (
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

      {/* 扫描结果 */}
      {fetcher.data && (
        <div
          style={{
            padding: '20px',
            marginBottom: '20px',
            borderRadius: '8px',
            border: fetcher.data.success ? '2px solid #28a745' : fetcher.data.rateLimited ? '2px solid #ffc107' : '2px solid #dc3545',
            backgroundColor: fetcher.data.success ? '#d4edda' : fetcher.data.rateLimited ? '#fff3cd' : '#f8d7da',
          }}
        >
          {fetcher.data.success ? (
            <>
              <h3 style={{ color: '#155724', margin: '0 0 20px 0', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '20px' }}>
                <span style={{ fontSize: '28px' }}>✅</span> Sync Completed!
                <span style={{ fontSize: '12px', backgroundColor: '#28a745', color: 'white', padding: '4px 8px', borderRadius: '4px', marginLeft: 'auto' }}>
                  Mode: {fetcher.data.mode || 'auto'}
                </span>
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '15px' }}>
                <div style={{ backgroundColor: 'rgba(255,255,255,0.7)', padding: '16px', borderRadius: '8px', textAlign: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                  <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#155724', marginBottom: '8px' }}>
                    📦
                  </div>
                  <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#155724' }}>
                    {fetcher.data.productsCount}
                  </div>
                  <div style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>Products</div>
                </div>
                <div style={{ backgroundColor: 'rgba(255,255,255,0.7)', padding: '16px', borderRadius: '8px', textAlign: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                  <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#155724', marginBottom: '8px' }}>
                    ✨
                  </div>
                  <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#155724' }}>
                    {fetcher.data.newRecommendationsCount || 0}
                  </div>
                  <div style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>New Recommendations</div>
                </div>
                <div style={{ backgroundColor: 'rgba(255,255,255,0.7)', padding: '16px', borderRadius: '8px', textAlign: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                  <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#155724', marginBottom: '8px' }}>
                    ⭐
                  </div>
                  <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#155724' }}>
                    {fetcher.data.recommendationsCount}
                  </div>
                  <div style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>Total Recommendations</div>
                </div>
                <div style={{ backgroundColor: 'rgba(255,255,255,0.7)', padding: '16px', borderRadius: '8px', textAlign: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                  <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#155724', marginBottom: '8px' }}>
                    ⏱️
                  </div>
                  <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#155724' }}>
                    {fetcher.data.duration}
                  </div>
                  <div style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>Duration</div>
                </div>
              </div>
            </>
          ) : fetcher.data.rateLimited ? (
            <>
              <h3 style={{ color: '#856404', margin: '0 0 10px 0' }}>⏰ Refresh Rate Limited</h3>
              <p style={{ color: '#856404', margin: '5px 0' }}>
                You can only force refresh once per {syncStatus?.plan === 'pro' ? 'week' : 'month'}.
              </p>
              <p style={{ color: '#856404', margin: '5px 0', fontSize: '14px' }}>
                Next refresh available: <strong>{formatDate(fetcher.data.nextRefreshAt)}</strong>
                {fetcher.data.daysRemaining && ` (${fetcher.data.daysRemaining} days)`}
              </p>
              <p style={{ color: '#666', margin: '10px 0 0 0', fontSize: '13px' }}>
                Tip: You can still use "Sync New Products" to add new products incrementally.
              </p>
            </>
          ) : (
            <>
              <h3 style={{ color: '#721c24', margin: '0 0 10px 0' }}>❌ Sync Failed</h3>
              <p style={{ color: '#721c24', margin: '5px 0' }}>
                {fetcher.data.error || 'Unknown error occurred'}
              </p>
            </>
          )}
        </div>
      )}

      {/* 说明 */}
      <div
        style={{
          padding: '20px',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          border: '1px solid #dee2e6',
        }}
      >
        <h3 style={{ margin: '0 0 15px 0' }}>ℹ️ How it works</h3>
        <ol style={{ margin: 0, paddingLeft: '20px', lineHeight: '1.8' }}>
          <li>Click <strong>"Sync Products"</strong> to fetch all products from your Shopify store</li>
          <li>Products are sent to the CartWhisper AI backend</li>
          <li>AI analyzes products and generates personalized recommendations</li>
          <li>Recommendations are stored and can be displayed in your storefront</li>
        </ol>

        <button
          onClick={() => setShowDetails(!showDetails)}
          style={{
            marginTop: '15px',
            padding: '8px 16px',
            backgroundColor: 'transparent',
            color: '#007bff',
            border: '1px solid #007bff',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          {showDetails ? '🔼 Hide' : '🔽 Show'} Technical Details
        </button>

        {showDetails && (
          <div style={{ marginTop: '15px', padding: '15px', backgroundColor: '#fff', borderRadius: '6px', border: '1px solid #ddd' }}>
            <h4 style={{ margin: '0 0 10px 0' }}>API Endpoints</h4>
            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', fontFamily: 'monospace' }}>
              <li>POST /api/products/sync - Sync products</li>
              <li>GET /api/recommendations/:productId - Get recommendations</li>
              <li>GET /api/health - Backend health check</li>
            </ul>

            <h4 style={{ margin: '15px 0 10px 0' }}>Data Flow</h4>
            <pre style={{ margin: 0, fontSize: '12px', backgroundColor: '#f5f5f5', padding: '10px', borderRadius: '4px', overflow: 'auto' }}>
{`Shopify Store
     ↓ (GraphQL)
CartWhisper Plugin
     ↓ (REST API)
CartWhisper Backend (Railway)
     ↓
PostgreSQL + DeepSeek AI`}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
