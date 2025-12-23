import { OpenAI } from 'openai';
import fs from 'fs';
import path from 'path';

/**
 * DeepSeek API 客户端初始化
 */
function getDeepSeekClient() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY environment variable is not set');
  }

  return new OpenAI({
    apiKey,
    baseURL: 'https://api.deepseek.com/v1',
  });
}

/**
 * 后处理相似商品：过滤价格和分类
 * @param {Object} products - 商品Map（id -> 商品信息）
 * @param {Object} similarities - 相似度结果
 * @returns {Object} - 过滤后的推荐结果
 */
export function postProcessSimilarities(products, similarities) {
  console.log('🔄 Post-processing similarities...');

  const productsMap = {};
  products.forEach(p => {
    productsMap[p.id] = p;
  });

  const processed = {};

  Object.entries(similarities).forEach(([productId, data]) => {
    const mainProduct = productsMap[productId];
    if (!mainProduct) {
      console.warn(`⚠️ Product not found: ${productId}`);
      return;
    }

    const mainPrice = parseFloat(mainProduct.variants[0]?.price || 0);
    const mainCategory = mainProduct.productType;

    console.log(`\n📦 Processing: ${mainProduct.title} (Price: ${mainPrice}, Category: ${mainCategory})`);

    // 过滤条件
    const candidates = data.similarProducts
      .map(sim => {
        const simProduct = productsMap[sim.id];
        if (!simProduct) return null;

        const simPrice = parseFloat(simProduct.variants[0]?.price || 0);
        const simCategory = simProduct.productType;

        return {
          ...sim,
          product: simProduct,
          price: simPrice,
          category: simCategory,
        };
      })
      .filter(item => {
        if (!item) return false;

        // 条件1: 剔除价格比A还贵的商品
        if (item.price > mainPrice) {
          console.log(`  ❌ ${item.title}: 价格过高 (${item.price} > ${mainPrice})`);
          return false;
        }

        // 条件2: 价格最多A的110%
        if (item.price > mainPrice * 1.1) {
          console.log(`  ❌ ${item.title}: 价格超过110% (${item.price} > ${mainPrice * 1.1})`);
          return false;
        }

        // 条件3: 剔除与A同类目的商品
        if (item.category === mainCategory) {
          console.log(`  ❌ ${item.title}: 同类目商品`);
          return false;
        }

        console.log(`  ✅ ${item.title}: 相似度 ${item.similarity}, 价格 ${item.price}, 分类 ${item.category}`);
        return true;
      })
      .slice(0, 5); // 保留最多5个

    // 如果候选商品少于3个，警告但仍然保存
    if (candidates.length < 3) {
      console.warn(`  ⚠️ Only ${candidates.length} candidates (need at least 3)`);
    }

    processed[productId] = {
      productId: mainProduct.id,
      productTitle: mainProduct.title,
      productPrice: mainPrice,
      productCategory: mainCategory,
      productImage: mainProduct.image,
      candidateCount: candidates.length,
      candidates: candidates.map(c => ({
        id: c.id,
        title: c.title,
        similarity: c.similarity,
        price: c.price,
        category: c.category,
        vendor: c.product.vendor,
        image: c.product.image,
      })),
    };
  });

  console.log('✅ Post-processing completed');
  return processed;
}

/**
 * 使用 DeepSeek 生成商品组合推荐理由
 * @param {Object} processedData - 后处理的推荐数据
 * @returns {Object} - 包含推荐理由的数据
 */
export async function generateRecommendationWithDeepSeek(processedData) {
  console.log('🤖 Generating recommendations with DeepSeek...');

  const client = getDeepSeekClient();
  const recommendations = {};

  // 处理每个商品的推荐
  for (const [productId, data] of Object.entries(processedData)) {
    if (data.candidates.length === 0) {
      console.warn(`⚠️ No candidates for ${data.productTitle}`);
      recommendations[productId] = {
        ...data,
        recommendation: '没有合适的推荐商品',
        reasoning: '候选商品不足',
      };
      continue;
    }

    // 构建 prompt
    const candidatesText = data.candidates
      .map((c, idx) => `${idx + 1}. ${c.title} (价格: ${c.price}, 分类: ${c.category}, 相似度: ${c.similarity})`)
      .join('\n');

    const prompt = `
根据以下商品和推荐候选，生成一个简洁的推荐理由（1-2句话）。

主商品: ${data.productTitle}
价格: ${data.productPrice}
分类: ${data.productCategory}

推荐候选商品:
${candidatesText}

请分析这些商品的共同特点，并给出为什么这些商品可以作为搭配或替代品的理由。
回复格式: 直接给出理由，不需要前缀。
`;

    try {
      console.log(`\n🔄 Generating recommendation for: ${data.productTitle}`);

      const response = await client.chat.completions.create({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0,
        max_tokens: 200,
      });

      const reasoning = response.choices[0]?.message?.content?.trim() || '无法生成推荐理由';
      console.log(`✅ Generated: ${reasoning.substring(0, 50)}...`);

      recommendations[productId] = {
        ...data,
        reasoning,
      };
    } catch (error) {
      console.error(`❌ Error generating recommendation for ${data.productTitle}:`, error.message);
      recommendations[productId] = {
        ...data,
        reasoning: `生成失败: ${error.message}`,
      };
    }
  }

  console.log('✅ All recommendations generated');
  return recommendations;
}

/**
 * 保存推荐结果到 JSON 文件
 */
export function saveRecommendations(recommendations) {
  const dataDir = path.join(process.cwd(), 'data');

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const filePath = path.join(dataDir, 'recommendations.json');
  fs.writeFileSync(filePath, JSON.stringify(recommendations, null, 2));
  console.log(`✅ Recommendations saved to ${filePath}`);
}

/**
 * 从文件读取推荐结果
 */
export function loadRecommendations() {
  const filePath = path.join(process.cwd(), 'data', 'recommendations.json');

  if (!fs.existsSync(filePath)) {
    return null;
  }

  const data = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(data);
}
