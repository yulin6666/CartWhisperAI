import { useLoaderData, Link } from 'react-router';
import { useState } from 'react';
import { authenticate } from '../shopify.server';
import { BACKEND_URL } from '../utils/backendApi.server';
import { getApiKey } from '../utils/shopConfig.server';

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  let apiKey = null;
  let recommendations = [];
  let stats = {};
  let error = null;

  try {
    apiKey = await getApiKey(shop);

    // 获取所有推荐数据
    if (apiKey) {
      const res = await fetch(`${BACKEND_URL}/api/recommendations`, {
        headers: { 'X-API-Key': apiKey },
      });
      if (res.ok) {
        const data = await res.json();
        recommendations = data.recommendations || [];
        stats = data.stats || {};
      } else {
        error = 'Failed to fetch recommendations';
      }
    }
  } catch (e) {
    // Not registered yet
  }

  return {
    shop,
    backendUrl: BACKEND_URL,
    isRegistered: !!apiKey,
    apiKey: apiKey ? `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}` : null,
    recommendations,
    stats,
    error,
  };
}

export default function RecommendationsPage() {
  const { shop, backendUrl, isRegistered, apiKey, recommendations, stats, error } = useLoaderData();
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('sourceProductId');

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

  // 过滤推荐
  const filteredRecommendations = recommendations.filter((rec) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      rec.sourceTitle.toLowerCase().includes(searchLower) ||
      rec.targetTitle.toLowerCase().includes(searchLower) ||
      rec.sourceProductId.includes(searchTerm) ||
      rec.targetProductId.includes(searchTerm)
    );
  });

  // 排序推荐
  const sortedRecommendations = [...filteredRecommendations].sort((a, b) => {
    if (sortBy === 'sourceProductId') {
      return a.sourceProductId.localeCompare(b.sourceProductId);
    } else if (sortBy === 'sourceTitle') {
      return a.sourceTitle.localeCompare(b.sourceTitle);
    } else if (sortBy === 'targetTitle') {
      return a.targetTitle.localeCompare(b.targetTitle);
    }
    return 0;
  });

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
      <h1>📊 Product Recommendations</h1>

      {/* 统计信息 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '30px' }}>
        <div
          style={{
            padding: '20px',
            borderRadius: '8px',
            backgroundColor: '#e3f2fd',
            border: '1px solid #90caf9',
          }}
        >
          <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>Total Products</div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#1976d2' }}>{stats.products || 0}</div>
        </div>
        <div
          style={{
            padding: '20px',
            borderRadius: '8px',
            backgroundColor: '#f3e5f5',
            border: '1px solid #ce93d8',
          }}
        >
          <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>Total Recommendations</div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#7b1fa2' }}>{stats.recommendations || 0}</div>
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: '15px',
            marginBottom: '20px',
            borderRadius: '8px',
            backgroundColor: '#ffebee',
            border: '1px solid #ef5350',
            color: '#c62828',
          }}
        >
          ⚠️ {error}
        </div>
      )}

      {/* 搜索和排序 */}
      <div style={{ marginBottom: '20px', display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>
            Search
          </label>
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
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>
            Sort by
          </label>
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

      {/* 推荐列表 */}
      {sortedRecommendations.length === 0 ? (
        <div
          style={{
            padding: '40px',
            textAlign: 'center',
            backgroundColor: '#f5f5f5',
            borderRadius: '8px',
            color: '#999',
          }}
        >
          {recommendations.length === 0 ? (
            <>
              <p style={{ fontSize: '16px', marginBottom: '10px' }}>No recommendations yet</p>
              <p style={{ fontSize: '14px' }}>
                Sync products at{' '}
                <Link to="/app/scan" style={{ color: '#1a73e8' }}>
                  /app/scan
                </Link>{' '}
                to generate recommendations
              </p>
            </>
          ) : (
            <p>No results match your search</p>
          )}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              backgroundColor: 'white',
              borderRadius: '8px',
              overflow: 'hidden',
            }}
          >
            <thead>
              <tr style={{ backgroundColor: '#f5f5f5', borderBottom: '2px solid #ddd' }}>
                <th style={{ padding: '15px', textAlign: 'left', fontWeight: 'bold', fontSize: '14px' }}>
                  Source Product
                </th>
                <th style={{ padding: '15px', textAlign: 'left', fontWeight: 'bold', fontSize: '14px' }}>
                  Recommended Product
                </th>
                <th style={{ padding: '15px', textAlign: 'left', fontWeight: 'bold', fontSize: '14px' }}>
                  Reason
                </th>
                <th style={{ padding: '15px', textAlign: 'left', fontWeight: 'bold', fontSize: '14px' }}>
                  Created
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedRecommendations.map((rec, idx) => (
                <tr
                  key={idx}
                  style={{
                    borderBottom: '1px solid #eee',
                    backgroundColor: idx % 2 === 0 ? '#ffffff' : '#fafafa',
                  }}
                >
                  <td style={{ padding: '12px 15px', fontSize: '14px' }}>
                    <div style={{ fontWeight: '500' }}>{rec.sourceTitle}</div>
                    <div style={{ fontSize: '12px', color: '#999' }}>ID: {rec.sourceProductId}</div>
                  </td>
                  <td style={{ padding: '12px 15px', fontSize: '14px' }}>
                    <div style={{ fontWeight: '500' }}>{rec.targetTitle}</div>
                    <div style={{ fontSize: '12px', color: '#999' }}>ID: {rec.targetProductId}</div>
                  </td>
                  <td style={{ padding: '12px 15px', fontSize: '14px', color: '#666' }}>
                    {(() => {
                      const parts = (rec.reason || '—').split('|');
                      return (
                        <div>
                          <div style={{ fontWeight: '500', marginBottom: '4px' }}>
                            {parts[0] || '—'}
                          </div>
                          {parts[1] && (
                            <div style={{ fontSize: '12px', color: '#999', fontStyle: 'italic' }}>
                              {parts[1]}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  <td style={{ padding: '12px 15px', fontSize: '12px', color: '#999' }}>
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

      {/* 操作按钮 */}
      <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', marginTop: '30px' }}>
        <Link
          to="/app/scan"
          style={{
            padding: '12px 24px',
            fontSize: '14px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            textDecoration: 'none',
            fontWeight: 'bold',
            cursor: 'pointer',
          }}
        >
          🔄 Re-sync Products
        </Link>
        <a
          href={`${backendUrl}/api/health`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: '12px 24px',
            fontSize: '14px',
            backgroundColor: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            textDecoration: 'none',
            fontWeight: 'bold',
            cursor: 'pointer',
          }}
        >
          🔍 Check Backend Health
        </a>
      </div>
    </div>
  );
}
