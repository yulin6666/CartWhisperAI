import fs from 'fs';
import path from 'path';

/**
 * 生成 Markdown 格式的推荐表格
 */
export function generateMarkdownTable(recommendations) {
  let markdown = `# 📊 商品推荐系统报告\n\n`;

  // 统计信息
  const totalProducts = Object.keys(recommendations).length;
  const recommendedProducts = Object.values(recommendations).filter(
    (r) => r.candidates && r.candidates.length > 0
  ).length;

  markdown += `## 📈 统计信息\n\n`;
  markdown += `- 📦 总商品数: **${totalProducts}**\n`;
  markdown += `- ✅ 已推荐商品: **${recommendedProducts}**\n`;
  markdown += `- 📊 覆盖率: **${((recommendedProducts / totalProducts) * 100).toFixed(1)}%**\n\n`;

  // 推荐策略
  markdown += `## ✨ 推荐策略\n\n`;
  markdown += `- 🧠 **智能相似度匹配** - 使用深度学习模型找出语义相关的商品\n`;
  markdown += `- 💰 **价格优化** - 推荐价格在原商品 90%-110% 范围内的商品\n`;
  markdown += `- 📁 **分类差异** - 优先推荐不同分类的商品，实现交叉销售\n`;
  markdown += `- 🤖 **AI 推荐理由** - 使用 DeepSeek 生成个性化推荐文案\n\n`;

  // 详细推荐
  markdown += `## 🎯 推荐详情\n\n`;

  Object.entries(recommendations).forEach(([productId, product]) => {
    markdown += `### ${product.productTitle}\n\n`;
    markdown += `| 属性 | 内容 |\n`;
    markdown += `|------|------|\n`;
    markdown += `| 原价 | ¥${product.productPrice} |\n`;
    markdown += `| 分类 | ${product.productCategory} |\n\n`;

    if (product.reasoning) {
      markdown += `**🤖 推荐理由:** ${product.reasoning}\n\n`;
    }

    if (!product.candidates || product.candidates.length === 0) {
      markdown += `⚠️ 暂无合适的推荐商品\n\n`;
    } else {
      markdown += `| 推荐商品 | 价格 | 分类 | 相似度 |\n`;
      markdown += `|---------|------|------|--------|\n`;

      product.candidates.forEach((candidate) => {
        const similarityPercent = (candidate.similarity * 100).toFixed(1);
        markdown += `| ${candidate.title} | ¥${candidate.price} | ${candidate.category} | ${similarityPercent}% |\n`;
      });

      markdown += `\n`;
    }
  });

  return markdown;
}

/**
 * 保存 Markdown 格式的推荐报告
 */
export function saveMarkdownReport(recommendations) {
  const markdown = generateMarkdownTable(recommendations);
  const dataDir = path.join(process.cwd(), 'data');

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const filePath = path.join(dataDir, 'RECOMMENDATIONS.md');
  fs.writeFileSync(filePath, markdown);
  console.log(`✅ Markdown report saved to ${filePath}`);

  return markdown;
}

