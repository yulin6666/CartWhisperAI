import { useFetcher, useLoaderData, Link } from 'react-router';
import { useState } from 'react';
import { authenticate } from '../shopify.server';
import { healthCheck, BACKEND_URL } from '../utils/backendApi.server';
import { getApiKey } from '../utils/shopConfig.server';

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // 检查后端状态
  let backendStatus = { status: 'unknown' };
  let apiKey = null;

  try {
    backendStatus = await healthCheck();
  } catch (e) {
    backendStatus = { status: 'error', message: e.message };
  }

  // 尝试获取 API Key（如果已注册）
  try {
    apiKey = await getApiKey(shop);
  } catch (e) {
    // 尚未注册，首次扫描时会自动注册
  }

  return {
    shop,
    backendUrl: BACKEND_URL,
    backendStatus,
    isRegistered: !!apiKey,
  };
};

export default function ScanPage() {
  const { shop, backendUrl, backendStatus, isRegistered } = useLoaderData();
  const fetcher = useFetcher();
  const isScanning = fetcher.state === 'submitting';
  const [showDetails, setShowDetails] = useState(false);

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

      {/* 扫描按钮 */}
      <div style={{ marginBottom: '30px', display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
        <fetcher.Form method="post" action="/api/scan">
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
              <>🚀 Sync Products</>
            )}
          </button>
        </fetcher.Form>

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

      {/* 扫描结果 */}
      {fetcher.data && (
        <div
          style={{
            padding: '20px',
            marginBottom: '20px',
            borderRadius: '8px',
            border: fetcher.data.success ? '2px solid #28a745' : '2px solid #dc3545',
            backgroundColor: fetcher.data.success ? '#d4edda' : '#f8d7da',
          }}
        >
          {fetcher.data.success ? (
            <>
              <h3 style={{ color: '#155724', margin: '0 0 15px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span>✅</span> Sync Completed!
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px' }}>
                <div style={{ backgroundColor: 'rgba(255,255,255,0.5)', padding: '12px', borderRadius: '6px' }}>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#155724' }}>
                    {fetcher.data.productsCount}
                  </div>
                  <div style={{ fontSize: '12px', color: '#666' }}>Products Synced</div>
                </div>
                <div style={{ backgroundColor: 'rgba(255,255,255,0.5)', padding: '12px', borderRadius: '6px' }}>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#155724' }}>
                    {fetcher.data.recommendationsCount}
                  </div>
                  <div style={{ fontSize: '12px', color: '#666' }}>Recommendations</div>
                </div>
                <div style={{ backgroundColor: 'rgba(255,255,255,0.5)', padding: '12px', borderRadius: '6px' }}>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#155724' }}>
                    {fetcher.data.duration}
                  </div>
                  <div style={{ fontSize: '12px', color: '#666' }}>Duration</div>
                </div>
              </div>
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
