import { useLoaderData } from 'react-router';
import fs from 'fs';
import path from 'path';

/**
 * 读取推荐数据和推荐文案
 */
export async function loader() {
  try {
    const filePath = path.join(process.cwd(), 'data', 'recommendations.json');
    const copiesPath = path.join(process.cwd(), 'data', 'recommendation-copies.json');
    const markdownPath = path.join(process.cwd(), 'data', 'RECOMMENDATIONS.md');

    if (!fs.existsSync(filePath)) {
      return {
        success: false,
        message: '还没有推荐数据，请先运行 Scan',
        recommendations: null,
      };
    }

    const data = fs.readFileSync(filePath, 'utf-8');
    const recommendations = JSON.parse(data);

    // 读取推荐文案
    let copies = null;
    if (fs.existsSync(copiesPath)) {
      try {
        const copiesData = fs.readFileSync(copiesPath, 'utf-8');
        copies = JSON.parse(copiesData);
      } catch (e) {
        console.warn('Error loading copies:', e);
      }
    }

    // 读取 Markdown 报告
    let markdownReport = null;
    if (fs.existsSync(markdownPath)) {
      try {
        markdownReport = fs.readFileSync(markdownPath, 'utf-8');
      } catch (e) {
        console.warn('Error loading markdown:', e);
      }
    }

    // 统计数据
    const totalProducts = Object.keys(recommendations).length;
    const recommendedProducts = Object.values(recommendations).filter(
      (r) => r.candidates && r.candidates.length > 0
    ).length;

    return {
      success: true,
      recommendations,
      copies,
      markdownReport,
      stats: {
        totalProducts,
        recommendedProducts,
        coverageRate: ((recommendedProducts / totalProducts) * 100).toFixed(1),
      },
    };
  } catch (error) {
    return {
      success: false,
      message: `Error loading recommendations: ${error.message}`,
      recommendations: null,
    };
  }
}

/**
 * 将推荐转换为 Markdown 表格
 */
function RecommendationTable({ product }) {
  if (!product.candidates || product.candidates.length === 0) {
    return (
      <div style={{ margin: '20px 0', padding: '10px', backgroundColor: '#fff3cd', borderRadius: '4px' }}>
        <p>⚠️ <strong>{product.productTitle}</strong> - 暂无合适的推荐商品</p>
      </div>
    );
  }

  return (
    <div style={{ margin: '20px 0' }}>
      <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', marginBottom: '15px' }}>
        {product.productImage?.url && (
          <img
            src={product.productImage.url}
            alt={product.productImage.altText || product.productTitle}
            style={{
              width: '120px',
              height: '120px',
              objectFit: 'cover',
              borderRadius: '8px',
              border: '2px solid #1a73e8',
              flexShrink: 0,
            }}
          />
        )}
        <div>
          <h3 style={{ color: '#1a73e8', marginBottom: '10px', marginTop: 0 }}>{product.productTitle}</h3>
          <p style={{ color: '#666', marginBottom: '10px', margin: '0 0 10px 0' }}>
            💰 原价: ¥{product.productPrice} | 📁 分类: {product.productCategory}
          </p>
        </div>
      </div>

      {product.reasoning && (
        <div
          style={{
            backgroundColor: '#e8f5e9',
            padding: '10px',
            borderRadius: '4px',
            marginBottom: '10px',
            borderLeft: '4px solid #4caf50',
          }}
        >
          <p style={{ margin: 0 }}>
            <strong>🤖 推荐理由：</strong> {product.reasoning}
          </p>
        </div>
      )}

      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          marginBottom: '20px',
          backgroundColor: '#f5f5f5',
        }}
      >
        <thead>
          <tr style={{ backgroundColor: '#1a73e8', color: 'white' }}>
            <th style={tableCellStyle}>图片</th>
            <th style={tableCellStyle}>推荐商品</th>
            <th style={tableCellStyle}>价格</th>
            <th style={tableCellStyle}>分类</th>
            <th style={tableCellStyle}>相似度</th>
          </tr>
        </thead>
        <tbody>
          {product.candidates.map((candidate, idx) => (
            <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#f9f9f9' : 'white' }}>
              <td style={tableCellStyle}>
                {candidate.image?.url ? (
                  <img
                    src={candidate.image.url}
                    alt={candidate.image.altText || candidate.title}
                    style={{
                      width: '80px',
                      height: '80px',
                      objectFit: 'cover',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: '80px',
                      height: '80px',
                      backgroundColor: '#e0e0e0',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      color: '#666',
                    }}
                  >
                    无图片
                  </div>
                )}
              </td>
              <td style={tableCellStyle}>{candidate.title}</td>
              <td style={tableCellStyle}>¥{candidate.price}</td>
              <td style={tableCellStyle}>{candidate.category}</td>
              <td style={tableCellStyle}>
                <span
                  style={{
                    display: 'inline-block',
                    backgroundColor: getSimilarityColor(candidate.similarity),
                    color: 'white',
                    padding: '4px 8px',
                    borderRadius: '4px',
                  }}
                >
                  {(candidate.similarity * 100).toFixed(1)}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * 根据相似度返回颜色
 */
function getSimilarityColor(similarity) {
  if (similarity >= 0.8) return '#4caf50'; // 绿色
  if (similarity >= 0.6) return '#2196f3'; // 蓝色
  if (similarity >= 0.4) return '#ff9800'; // 橙色
  return '#f44336'; // 红色
}

const tableCellStyle = {
  padding: '12px',
  textAlign: 'left',
  borderBottom: '1px solid #ddd',
  fontSize: '14px',
};

/**
 * 主推荐页面组件
 */
export default function RecommendationsPage() {
  const data = useLoaderData();

  if (!data.success) {
    return (
      <div
        style={{
          maxWidth: '1200px',
          margin: '40px auto',
          padding: '20px',
          textAlign: 'center',
        }}
      >
        <h1 style={{ color: '#f44336' }}>⚠️ {data.message}</h1>
        <p style={{ color: '#666', marginTop: '10px' }}>
          请先访问 <a href="/app/scan">/app/scan</a> 页面进行扫描
        </p>
      </div>
    );
  }

  const { recommendations, copies, markdownReport, stats } = data;
  const productEntries = Object.entries(recommendations);

  const handleDownloadMarkdown = () => {
    if (!markdownReport) return;
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(markdownReport));
    element.setAttribute('download', 'RECOMMENDATIONS.md');
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const handleCopyCopies = () => {
    if (!copies) return;
    const copiesText = Object.entries(copies)
      .map(([_, c]) => `${c.productTitle}\n${c.copy}`)
      .join('\n\n');
    navigator.clipboard.writeText(copiesText);
    alert('推荐文案已复制到剪贴板！');
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      {/* 头部统计 */}
      <div style={{ marginBottom: '30px' }}>
        <h1 style={{ color: '#1a73e8', marginBottom: '10px' }}>📊 商品推荐系统</h1>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '15px',
            marginBottom: '20px',
          }}
        >
          <StatCard title="总商品数" value={stats.totalProducts} />
          <StatCard title="已推荐商品" value={stats.recommendedProducts} />
          <StatCard title="覆盖率" value={`${stats.coverageRate}%`} />
        </div>

        <p style={{ color: '#666', fontSize: '14px' }}>
          💡 系统根据商品相似度、价格和分类智能推荐了 <strong>{stats.recommendedProducts}</strong> 个商品的配套产品。
        </p>
      </div>

      {/* 导出选项 */}
      <div
        style={{
          display: 'flex',
          gap: '10px',
          marginBottom: '30px',
          flexWrap: 'wrap',
        }}
      >
        <button
          onClick={handleDownloadMarkdown}
          style={{
            padding: '10px 20px',
            backgroundColor: '#2196f3',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 'bold',
          }}
        >
          📥 下载 Markdown 报告
        </button>
        <button
          onClick={handleCopyCopies}
          style={{
            padding: '10px 20px',
            backgroundColor: '#4caf50',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 'bold',
          }}
        >
          📋 复制推荐文案
        </button>
      </div>

      {/* 总体推荐语 */}
      <div
        style={{
          backgroundColor: '#e3f2fd',
          padding: '20px',
          borderRadius: '8px',
          marginBottom: '30px',
          borderLeft: '4px solid #1a73e8',
        }}
      >
        <h2 style={{ color: '#1a73e8', marginTop: 0 }}>✨ 推荐策略</h2>
        <ul style={{ color: '#333', lineHeight: '1.8' }}>
          <li>
            <strong>智能相似度匹配</strong> - 使用深度学习模型找出语义相关的商品
          </li>
          <li>
            <strong>价格优化</strong> - 推荐价格在原商品 90%-110% 范围内的商品，提高客户接受度
          </li>
          <li>
            <strong>分类差异</strong> - 优先推荐不同分类的商品，实现真正的交叉销售
          </li>
          <li>
            <strong>AI 推荐理由</strong> - 使用 DeepSeek 生成个性化的推荐文案
          </li>
        </ul>
      </div>

      {/* 商品推荐列表 */}
      <div>
        <h2 style={{ color: '#1a73e8', marginBottom: '20px' }}>🎯 推荐详情</h2>

        {productEntries.map(([productId, product]) => (
          <div key={productId}>
            <RecommendationTable product={product} />
            {copies && copies[productId] && (
              <div
                style={{
                  backgroundColor: '#fff8e1',
                  padding: '12px',
                  borderRadius: '4px',
                  marginBottom: '20px',
                  borderLeft: '4px solid #ffc107',
                  marginLeft: '20px',
                }}
              >
                <p style={{ margin: 0, color: '#333' }}>
                  <strong>💬 推荐文案：</strong> <em>"{copies[productId].copy}"</em>
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 底部提示 */}
      <div
        style={{
          marginTop: '40px',
          padding: '20px',
          backgroundColor: '#f0f0f0',
          borderRadius: '8px',
          textAlign: 'center',
          color: '#666',
        }}
      >
        <p>
          💾 数据保存于 <code>data/recommendations.json</code> | 📈 最后更新:{' '}
          {new Date().toLocaleString()}
        </p>
      </div>
    </div>
  );
}

/**
 * 统计卡片组件
 */
function StatCard({ title, value }) {
  return (
    <div
      style={{
        backgroundColor: 'white',
        padding: '20px',
        borderRadius: '8px',
        border: '1px solid #e0e0e0',
        textAlign: 'center',
      }}
    >
      <p style={{ margin: '0 0 10px 0', color: '#666', fontSize: '14px' }}>
        {title}
      </p>
      <p style={{ margin: 0, fontSize: '28px', color: '#1a73e8', fontWeight: 'bold' }}>
        {value}
      </p>
    </div>
  );
}
