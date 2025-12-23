import { useFetcher, useLoaderData, Link } from 'react-router';
import { useState, useEffect } from 'react';
import { authenticate } from '../shopify.server';
import { loadProducts, loadOrders, getDataDir } from '../utils/fileStorage.server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  const products = loadProducts();
  const orders = loadOrders();

  // 获取扫描日志
  const logsFile = join(getDataDir(), 'scan-logs.json');
  let logs = [];
  if (existsSync(logsFile)) {
    try {
      logs = JSON.parse(readFileSync(logsFile, 'utf8'));
    } catch (e) {
      console.error('Error loading logs:', e);
    }
  }
  const lastLog = logs[logs.length - 1] || null;

  return {
    productsCount: products.length,
    ordersCount: orders.length,
    lastLog,
    dataDir: getDataDir(),
    productsPreview: products.slice(0, 10),
    ordersPreview: orders.slice(0, 10),
  };
};

export default function ScanPage() {
  const { productsCount, ordersCount, lastLog, dataDir, productsPreview, ordersPreview } = useLoaderData();
  const fetcher = useFetcher();
  const isScanning = fetcher.state === 'submitting';
  const [showDetailedLog, setShowDetailedLog] = useState(false);
  const [detailedLog, setDetailedLog] = useState(null);
  const [logLoading, setLogLoading] = useState(false);

  // 当扫描完成时获取详细日志
  useEffect(() => {
    if (fetcher.data?.success && showDetailedLog) {
      fetchDetailedLog();
    }
  }, [fetcher.data?.success, showDetailedLog]);

  // 获取详细日志
  const fetchDetailedLog = async () => {
    try {
      setLogLoading(true);
      const response = await fetch('/api/logs?action=latest');
      const data = await response.json();
      if (data.latest) {
        setDetailedLog(data.latest);
      }
    } catch (error) {
      console.error('Failed to fetch log:', error);
    } finally {
      setLogLoading(false);
    }
  };

  // Log fetcher data for debugging
  if (fetcher.data) {
    console.log('🔍 Fetcher data:', fetcher.data);
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
      <h1>📊 Product & Order Scanner</h1>

      {/* 统计信息 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '20px',
          marginBottom: '30px',
        }}
      >
        <div
          style={{
            padding: '20px',
            backgroundColor: '#f0f0f0',
            borderRadius: '8px',
            border: '1px solid #ddd',
          }}
        >
          <h2 style={{ margin: '0 0 10px 0' }}>📦 Products</h2>
          <p style={{ margin: 0, fontSize: '24px', fontWeight: 'bold' }}>{productsCount}</p>
          <p style={{ margin: '5px 0 0 0', color: '#666', fontSize: '14px' }}>Total products synced</p>
        </div>

        <div
          style={{
            padding: '20px',
            backgroundColor: '#f0f0f0',
            borderRadius: '8px',
            border: '1px solid #ddd',
          }}
        >
          <h2 style={{ margin: '0 0 10px 0' }}>🛒 Orders</h2>
          <p style={{ margin: 0, fontSize: '24px', fontWeight: 'bold' }}>{ordersCount}</p>
          <p style={{ margin: '5px 0 0 0', color: '#666', fontSize: '14px' }}>Total orders synced</p>
        </div>
      </div>

      {/* 扫描按钮 */}
      <div style={{ marginBottom: '30px', display: 'flex', gap: '10px' }}>
        <fetcher.Form method="post" action="/api/scan">
          <button
            type="submit"
            disabled={isScanning}
            style={{
              padding: '12px 24px',
              fontSize: '16px',
              backgroundColor: isScanning ? '#ccc' : '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: isScanning ? 'not-allowed' : 'pointer',
              fontWeight: 'bold',
            }}
          >
            {isScanning ? '🔄 Scanning...' : '🔍 Scan Now'}
          </button>
        </fetcher.Form>

        <Link
          to="/app/recommendations"
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            backgroundColor: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            textDecoration: 'none',
            fontWeight: 'bold',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          📊 View Recommendations
        </Link>
      </div>

      {/* 扫描结果 */}
      {fetcher.data && (
        <div
          style={{
            padding: '15px',
            marginBottom: '20px',
            borderRadius: '6px',
            border: fetcher.data.success
              ? '2px solid #28a745'
              : '2px solid #dc3545',
            backgroundColor: fetcher.data.success ? '#d4edda' : '#f8d7da',
          }}
        >
          {fetcher.data.success ? (
            <>
              <h3 style={{ color: '#155724', margin: '0 0 10px 0' }}>✅ Scan Successful!</h3>
              <p style={{ color: '#155724', margin: '5px 0' }}>
                📦 Products: <strong>{fetcher.data.productsCount}</strong>
              </p>
              <p style={{ color: '#155724', margin: '5px 0' }}>
                🛒 Orders: <strong>{fetcher.data.ordersCount}</strong>
              </p>
              <p style={{ color: '#155724', margin: '5px 0' }}>
                ⏱️ Duration: <strong>{fetcher.data.duration}</strong>
              </p>
              <button
                onClick={() => setShowDetailedLog(!showDetailedLog)}
                style={{
                  marginTop: '10px',
                  padding: '8px 16px',
                  backgroundColor: '#155724',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold',
                }}
              >
                {showDetailedLog ? '🔽 Hide' : '📋 View'} Detailed Log
              </button>
            </>
          ) : (
            <>
              <h3 style={{ color: '#721c24', margin: '0 0 10px 0' }}>❌ Scan Failed</h3>
              <p style={{ color: '#721c24', margin: '5px 0' }}>
                Error: <strong>{fetcher.data.error || 'No error details available'}</strong>
              </p>
              {fetcher.data.error && (
                <p style={{ color: '#721c24', margin: '5px 0', fontSize: '12px' }}>
                  Check the browser console or server logs for more details.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* 详细日志 */}
      {showDetailedLog && (
        <div
          style={{
            padding: '15px',
            marginBottom: '20px',
            borderRadius: '6px',
            border: '2px solid #007bff',
            backgroundColor: '#f8f9fa',
          }}
        >
          <h3 style={{ margin: '0 0 10px 0', color: '#0056b3' }}>📋 Detailed Scan Log</h3>
          {logLoading ? (
            <p style={{ color: '#666', fontStyle: 'italic' }}>Loading log...</p>
          ) : detailedLog ? (
            <>
              <p style={{ margin: '5px 0', color: '#666', fontSize: '12px' }}>
                📁 File: <strong>{detailedLog.name}</strong> | 📊 Size: <strong>{(detailedLog.size / 1024).toFixed(2)} KB</strong>
              </p>
              <div
                style={{
                  backgroundColor: '#fff',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  padding: '10px',
                  maxHeight: '500px',
                  overflowY: 'auto',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  lineHeight: '1.5',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {detailedLog.content}
              </div>
              <button
                onClick={() => {
                  const element = document.createElement('a');
                  element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(detailedLog.content));
                  element.setAttribute('download', detailedLog.name);
                  element.style.display = 'none';
                  document.body.appendChild(element);
                  element.click();
                  document.body.removeChild(element);
                }}
                style={{
                  marginTop: '10px',
                  padding: '8px 16px',
                  backgroundColor: '#0056b3',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold',
                }}
              >
                💾 Download Log
              </button>
            </>
          ) : (
            <p style={{ color: '#666', fontStyle: 'italic' }}>No log available. Run a scan first.</p>
          )}
        </div>
      )}

      {/* 最后扫描信息 */}
      {lastLog && (
        <div
          style={{
            padding: '15px',
            backgroundColor: '#fff3cd',
            border: '1px solid #ffc107',
            borderRadius: '6px',
            marginBottom: '20px',
          }}
        >
          <h3 style={{ margin: '0 0 10px 0' }}>📝 Last Scan</h3>
          <p style={{ margin: '5px 0' }}>
            <strong>Status:</strong> {lastLog.status === 'success' ? '✅ Success' : '❌ Failed'}
          </p>
          <p style={{ margin: '5px 0' }}>
            <strong>Time:</strong> {new Date(lastLog.timestamp).toLocaleString()}
          </p>
          {lastLog.status === 'success' && (
            <>
              <p style={{ margin: '5px 0' }}>
                <strong>Products:</strong> {lastLog.productsCount}
              </p>
              <p style={{ margin: '5px 0' }}>
                <strong>Orders:</strong> {lastLog.ordersCount}
              </p>
              <p style={{ margin: '5px 0' }}>
                <strong>Duration:</strong> {lastLog.duration}
              </p>
            </>
          )}
          {lastLog.error && (
            <p style={{ margin: '5px 0', color: 'red' }}>
              <strong>Error:</strong> {lastLog.error}
            </p>
          )}
        </div>
      )}

      {/* 数据信息 */}
      <div
        style={{
          padding: '15px',
          backgroundColor: '#e7f3ff',
          border: '1px solid #b3d9ff',
          borderRadius: '6px',
          marginBottom: '20px',
        }}
      >
        <h3 style={{ margin: '0 0 10px 0' }}>ℹ️ Data Storage</h3>
        <p style={{ margin: '5px 0', fontSize: '14px' }}>
          <strong>Location:</strong> <code>{dataDir}</code>
        </p>
        <p style={{ margin: '5px 0', fontSize: '14px' }}>
          <strong>Files:</strong>
        </p>
        <ul style={{ margin: '5px 0 0 20px', fontSize: '14px' }}>
          <li>
            <code>products.json</code> - All products ({productsCount} items)
          </li>
          <li>
            <code>orders.json</code> - All orders ({ordersCount} items)
          </li>
          <li>
            <code>scan-logs.json</code> - Scan history
          </li>
        </ul>
      </div>

      {/* 产品列表预览 */}
      {productsCount > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <h2>📦 Products Preview (First 10)</h2>
          <ProductPreview products={productsPreview} />
        </div>
      )}

      {/* 订单列表预览 */}
      {ordersCount > 0 && (
        <div>
          <h2>🛒 Orders Preview (First 10)</h2>
          <OrderPreview orders={ordersPreview} />
        </div>
      )}
    </div>
  );
}

function ProductPreview({ products }) {
  return (
    <table
      style={{
        width: '100%',
        borderCollapse: 'collapse',
        marginTop: '10px',
      }}
    >
      <thead>
        <tr style={{ backgroundColor: '#f0f0f0', borderBottom: '2px solid #ddd' }}>
          <th style={{ padding: '10px', textAlign: 'left' }}>Title</th>
          <th style={{ padding: '10px', textAlign: 'left' }}>Type</th>
          <th style={{ padding: '10px', textAlign: 'left' }}>Vendor</th>
          <th style={{ padding: '10px', textAlign: 'left' }}>Variants</th>
        </tr>
      </thead>
      <tbody>
        {products.map((product) => (
          <tr key={product.id} style={{ borderBottom: '1px solid #eee' }}>
            <td style={{ padding: '10px' }}>{product.title}</td>
            <td style={{ padding: '10px' }}>{product.productType || '-'}</td>
            <td style={{ padding: '10px' }}>{product.vendor || '-'}</td>
            <td style={{ padding: '10px' }}>{product.variants?.length || 0}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function OrderPreview({ orders }) {
  return (
    <table
      style={{
        width: '100%',
        borderCollapse: 'collapse',
        marginTop: '10px',
      }}
    >
      <thead>
        <tr style={{ backgroundColor: '#f0f0f0', borderBottom: '2px solid #ddd' }}>
          <th style={{ padding: '10px', textAlign: 'left' }}>Order Name</th>
          <th style={{ padding: '10px', textAlign: 'left' }}>Email</th>
          <th style={{ padding: '10px', textAlign: 'right' }}>Total</th>
          <th style={{ padding: '10px', textAlign: 'left' }}>Financial</th>
          <th style={{ padding: '10px', textAlign: 'left' }}>Fulfillment</th>
          <th style={{ padding: '10px', textAlign: 'left' }}>Date</th>
        </tr>
      </thead>
      <tbody>
        {orders.map((order) => (
          <tr key={order.id} style={{ borderBottom: '1px solid #eee' }}>
            <td style={{ padding: '10px' }}>{order.name}</td>
            <td style={{ padding: '10px' }}>{order.email}</td>
            <td style={{ padding: '10px', textAlign: 'right' }}>
              ${order.totalPrice} {order.currency}
            </td>
            <td style={{ padding: '10px' }}>{order.displayFinancialStatus || 'N/A'}</td>
            <td style={{ padding: '10px' }}>{order.displayFulfillmentStatus || 'N/A'}</td>
            <td style={{ padding: '10px' }}>
              {new Date(order.createdAt).toLocaleDateString()}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
