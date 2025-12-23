import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';

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

/**
 * 使用 DeepSeek AI 生成个性化推荐文案
 */
async function generateAICopy(product) {
  if (!process.env.DEEPSEEK_API_KEY) {
    console.warn('⚠️ DEEPSEEK_API_KEY not set, falling back to template');
    return generateRecommendationCopy(product);
  }

  try {
    const client = new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: 'https://api.deepseek.com/v1',
    });

    const topCandidate = product.candidates[0];
    const prompt = `你是一个电商营销文案专家。请为以下商品组合生成一句简洁有吸引力的推荐文案（不超过30字）。

主商品：${product.productTitle}（¥${product.productPrice}）
推荐商品：${topCandidate?.title}（¥${topCandidate?.price}）
相似度：${(topCandidate?.similarity * 100).toFixed(0)}%
品牌：${topCandidate?.vendor}

要求：
1. 突出商品组合的价值和搭配理由
2. 语言简洁、自然、有吸引力
3. 不要使用"助您提升生活品质"等空泛表达
4. 可以突出价格优惠或品牌
5. 直接返回文案，不要任何前缀或解释`;

    const response = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 100,
    });

    const copy = response.choices[0]?.message?.content?.trim();
    if (copy) {
      console.log(`  ✅ Generated AI copy for: ${product.productTitle}`);
      return copy;
    }
  } catch (error) {
    console.warn(`⚠️ Failed to generate AI copy for ${product.productTitle}:`, error.message);
  }

  // 降级到模板生成
  return generateRecommendationCopy(product);
}

/**
 * 生成简单的推荐文案（模板）
 */
export function generateRecommendationCopy(product) {
  const templates = [
    `与您购买的${product.productTitle}完美搭配，${product.candidates[0]?.title}助您提升生活品质。`,
    `${product.productTitle}的理想配套产品：${product.candidates[0]?.title}，为您的购物体验加分。`,
    `选择${product.productTitle}的顾客也喜欢：${product.candidates[0]?.title}，相似度高达${(product.candidates[0]?.similarity * 100).toFixed(0)}%。`,
    `推荐组合：${product.productTitle} + ${product.candidates[0]?.title}，省钱更划算。`,
    `${product.productTitle}用户的热门选择：${product.candidates[0]?.title}，一起购买享优惠。`,
  ];

  return templates[Math.floor(Math.random() * templates.length)];
}

/**
 * 生成所有商品的推荐文案（使用 AI）
 */
export async function generateAllRecommendationCopies(recommendations) {
  const copies = {};

  // 使用 Promise.all 并行生成文案
  const entries = Object.entries(recommendations).filter(
    ([_, product]) => product.candidates && product.candidates.length > 0
  );

  console.log(`🤖 Starting to generate AI copies for ${entries.length} products...`);

  const copyPromises = entries.map(async ([productId, product]) => {
    const copy = await generateAICopy(product);
    return [productId, {
      productTitle: product.productTitle,
      copy: copy,
      topCandidate: product.candidates[0],
    }];
  });

  const results = await Promise.all(copyPromises);
  results.forEach(([productId, data]) => {
    copies[productId] = data;
  });

  console.log(`✅ Generated ${Object.keys(copies).length} AI-powered recommendation copies`);
  return copies;
}

/**
 * 保存推荐文案到 JSON 文件
 */
export function saveCopies(copies) {
  const dataDir = path.join(process.cwd(), 'data');

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const filePath = path.join(dataDir, 'recommendation-copies.json');
  fs.writeFileSync(filePath, JSON.stringify(copies, null, 2));
  console.log(`✅ Recommendation copies saved to ${filePath}`);
}
