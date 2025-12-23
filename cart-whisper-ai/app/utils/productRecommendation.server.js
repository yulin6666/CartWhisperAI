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
 * @param {Object} logger - 日志记录器对象
 * @returns {Object} - 包含推荐理由的数据
 */
export async function generateRecommendationWithDeepSeek(processedData, logger = console) {
  logger.info('🤖 Generating recommendations with DeepSeek...');

  const client = getDeepSeekClient();
  const recommendations = {};

  // 处理每个商品的推荐
  for (const [productId, data] of Object.entries(processedData)) {
    if (data.candidates.length === 0) {
      logger.warn(`⚠️ No candidates for ${data.productTitle}`);
      recommendations[productId] = {
        ...data,
        recommendation: '没有合适的推荐商品',
        reasoning: '候选商品不足',
      };
      continue;
    }

    // 构建 prompt
    const candidatesText = data.candidates
      .map((c, idx) => `${idx + 1}. ${c.title} (Price: $${c.price}, Category: ${c.category}, Similarity: ${(c.similarity * 100).toFixed(1)}%)`)
      .join('\n');

    const prompt = `
Analyze the following product and recommendations, then provide a brief recommendation reason (1-2 sentences) in English.

Main Product: ${data.productTitle}
Price: $${data.productPrice}
Category: ${data.productCategory}

Recommended Candidates:
${candidatesText}

Analyze the common characteristics of these products and explain why they work well as complementary or alternative products.
Response format: Provide only the reasoning, no prefix or explanation needed.
`;

    // 打印详细信息到日志
    logger.info(`\n========================================`);
    logger.info(`📦 Main Product: ${data.productTitle}`);
    logger.info(`💰 Price: $${data.productPrice}`);
    logger.info(`📁 Category: ${data.productCategory}`);
    logger.info(`\n🎯 Recommended Candidates:`);
    data.candidates.forEach((c, idx) => {
      logger.info(`   ${idx + 1}. ${c.title}`);
      logger.info(`      Price: $${c.price} | Category: ${c.category} | Similarity: ${(c.similarity * 100).toFixed(1)}%`);
    });
    logger.info(`========================================`);

    try {
      logger.info(`\n🔄 Generating recommendation for: ${data.productTitle}`);

      // 打印 Prompt
      logger.info(`\n📝 DeepSeek Prompt:`);
      logger.info(`---`);
      logger.info(prompt);
      logger.info(`---`);

      // 发送请求到 DeepSeek
      logger.info(`\n📤 Sending request to DeepSeek API...`);
      logger.info(`   Model: deepseek-chat`);
      logger.info(`   Temperature: 0`);
      logger.info(`   Max Tokens: 200`);

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

      // 打印完整响应信息
      logger.info(`\n📥 DeepSeek API Response:`);
      logger.info(`   Model: ${response.model}`);
      logger.info(`   Created: ${response.created}`);
      logger.info(`   Usage:`);
      logger.info(`     - Prompt Tokens: ${response.usage?.prompt_tokens}`);
      logger.info(`     - Completion Tokens: ${response.usage?.completion_tokens}`);
      logger.info(`     - Total Tokens: ${response.usage?.total_tokens}`);
      logger.info(`   Finish Reason: ${response.choices[0]?.finish_reason}`);

      const reasoning = response.choices[0]?.message?.content?.trim() || 'Failed to generate reasoning';
      logger.info(`\n✅ Generated Reasoning:`);
      logger.info(`   "${reasoning}"`);
      logger.info(`========================================`);

      recommendations[productId] = {
        ...data,
        reasoning,
      };
    } catch (error) {
      logger.error(`\n❌ Error generating recommendation for ${data.productTitle}:`);
      logger.error(`   Message: ${error.message}`);
      if (error.response) {
        logger.error(`   Status: ${error.response.status}`);
        logger.error(`   Data: ${JSON.stringify(error.response.data)}`);
      }
      logger.info(`========================================`);
      recommendations[productId] = {
        ...data,
        reasoning: `Failed to generate: ${error.message}`,
      };
    }
  }

  logger.info('✅ All recommendations generated');
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
