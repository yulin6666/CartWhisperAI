import { useLoaderData, Link } from 'react-router';
import { authenticate } from '../shopify.server';
import { BACKEND_URL } from '../utils/backendApi.server';
import { getApiKey } from '../utils/shopConfig.server';

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  let apiKey = null;
  try {
    apiKey = await getApiKey(shop);
  } catch (e) {
    // Not registered yet
  }

  return {
    shop,
    backendUrl: BACKEND_URL,
    isRegistered: !!apiKey,
    apiKey: apiKey ? `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}` : null,
  };
}

export default function RecommendationsPage() {
  const { shop, backendUrl, isRegistered, apiKey } = useLoaderData();

  if (!isRegistered) {
    return (
      <div style={{ maxWidth: '800px', margin: '40px auto', padding: '20px', textAlign: 'center' }}>
        <h1 style={{ color: '#f44336' }}>⚠️ Shop Not Registered</h1>
        <p style={{ color: '#666', marginTop: '10px' }}>
          Please first sync your products at{' '}
          <Link to="/app/scan" style={{ color: '#1a73e8' }}>
            /app/scan
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '20px' }}>
      <h1>📊 Product Recommendations</h1>
      <p style={{ color: '#666', marginBottom: '30px' }}>
        Your recommendations are stored in the CartWhisper AI backend. Use the API endpoints below to access them.
      </p>

      {/* 商店信息 */}
      <div
        style={{
          padding: '20px',
          marginBottom: '20px',
          borderRadius: '8px',
          backgroundColor: '#e7f3ff',
          border: '1px solid #b3d9ff',
        }}
      >
        <h3 style={{ margin: '0 0 15px 0' }}>🏪 Your Configuration</h3>
        <table style={{ width: '100%' }}>
          <tbody>
            <tr>
              <td style={{ padding: '8px 0', fontWeight: 'bold', width: '150px' }}>Shop:</td>
              <td style={{ padding: '8px 0' }}><code>{shop}</code></td>
            </tr>
            <tr>
              <td style={{ padding: '8px 0', fontWeight: 'bold' }}>API Key:</td>
              <td style={{ padding: '8px 0' }}><code>{apiKey}</code></td>
            </tr>
            <tr>
              <td style={{ padding: '8px 0', fontWeight: 'bold' }}>Backend URL:</td>
              <td style={{ padding: '8px 0' }}><code>{backendUrl}</code></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* API 端点 */}
      <div
        style={{
          padding: '20px',
          marginBottom: '20px',
          borderRadius: '8px',
          backgroundColor: '#f8f9fa',
          border: '1px solid #dee2e6',
        }}
      >
        <h3 style={{ margin: '0 0 15px 0' }}>🔌 API Endpoints</h3>

        <div style={{ marginBottom: '20px' }}>
          <h4 style={{ margin: '0 0 10px 0', color: '#28a745' }}>GET /api/recommendations/:productId</h4>
          <p style={{ margin: '0 0 10px 0', color: '#666', fontSize: '14px' }}>
            Get recommendations for a specific product.
          </p>
          <pre
            style={{
              backgroundColor: '#2d2d2d',
              color: '#f8f8f2',
              padding: '15px',
              borderRadius: '6px',
              overflow: 'auto',
              fontSize: '13px',
            }}
          >
{`curl -H "X-API-Key: YOUR_API_KEY" \\
  "${backendUrl}/api/recommendations/PRODUCT_ID?limit=3"`}
          </pre>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <h4 style={{ margin: '0 0 10px 0', color: '#28a745' }}>Response Example</h4>
          <pre
            style={{
              backgroundColor: '#2d2d2d',
              color: '#f8f8f2',
              padding: '15px',
              borderRadius: '6px',
              overflow: 'auto',
              fontSize: '13px',
            }}
          >
{`{
  "productId": "123456",
  "recommendations": [
    {
      "id": "789012",
      "handle": "product-handle",
      "title": "Recommended Product",
      "price": 59.99,
      "image": "https://cdn.shopify.com/...",
      "reason": "AI recommendation reason"
    }
  ]
}`}
          </pre>
        </div>
      </div>

      {/* Theme Extension 使用说明 */}
      <div
        style={{
          padding: '20px',
          marginBottom: '20px',
          borderRadius: '8px',
          backgroundColor: '#fff3cd',
          border: '1px solid #ffc107',
        }}
      >
        <h3 style={{ margin: '0 0 15px 0' }}>🎨 Theme App Extension</h3>
        <p style={{ margin: '0 0 10px 0', color: '#856404' }}>
          The Theme App Extension automatically fetches recommendations using the proxy endpoint:
        </p>
        <pre
          style={{
            backgroundColor: '#fff',
            padding: '10px',
            borderRadius: '4px',
            fontSize: '13px',
            color: '#333',
          }}
        >
{`/apps/chat-proxy/recommendations?product_id=PRODUCT_ID&shop=${shop}`}
        </pre>
      </div>

      {/* 操作按钮 */}
      <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
        <Link
          to="/app/scan"
          style={{
            padding: '14px 28px',
            fontSize: '16px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            textDecoration: 'none',
            fontWeight: 'bold',
          }}
        >
          🔄 Re-sync Products
        </Link>
        <a
          href={`${backendUrl}/api/health`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: '14px 28px',
            fontSize: '16px',
            backgroundColor: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            textDecoration: 'none',
            fontWeight: 'bold',
          }}
        >
          🔍 Check Backend Health
        </a>
      </div>
    </div>
  );
}
