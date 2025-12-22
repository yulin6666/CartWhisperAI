import { pipeline } from '@xenova/transformers';
import fs from 'fs';
import path from 'path';

// 缓存 embedding 模型
let embeddingPipeline = null;

/**
 * 初始化 embedding 模型
 * 使用 all-MiniLM-L6-v2 模型，小巧高效
 */
async function getEmbeddingPipeline() {
  if (!embeddingPipeline) {
    console.log('🔄 Loading embedding model...');
    embeddingPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    console.log('✅ Embedding model loaded');
  }
  return embeddingPipeline;
}

/**
 * 将商品转换为文本描述
 * 拼接 Title + Product Type + Tags
 */
function productToText(product) {
  const parts = [];

  if (product.title) {
    parts.push(product.title);
  }

  if (product.productType) {
    parts.push(product.productType);
  }

  // 处理 tags（可能是数组或字符串）
  if (product.tags) {
    if (Array.isArray(product.tags)) {
      parts.push(product.tags.join(' '));
    } else if (typeof product.tags === 'string') {
      parts.push(product.tags);
    }
  }

  // 添加 vendor 和 collections 作为额外信息
  if (product.vendor) {
    parts.push(product.vendor);
  }

  if (product.collections && Array.isArray(product.collections)) {
    parts.push(product.collections.join(' '));
  }

  return parts.join(' ').trim();
}

/**
 * 生成文本的向量表示
 */
async function generateEmbedding(text) {
  const pipe = await getEmbeddingPipeline();
  const output = await pipe(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

/**
 * 计算两个向量的余弦相似度
 */
function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (normA * normB);
}

/**
 * 为所有商品生成向量并计算相似商品
 * @param {Array} products - 商品数组
 * @param {number} topN - 返回最相似的 N 个商品
 * @returns {Object} - 每个商品ID对应的相似商品列表
 */
export async function calculateProductSimilarities(products, topN = 10) {
  console.log(`🔄 Calculating similarities for ${products.length} products...`);

  // Step 1: 为每个商品生成文本和向量
  console.log('📝 Generating text representations...');
  const productTexts = products.map(p => ({
    id: p.id,
    title: p.title,
    text: productToText(p)
  }));

  console.log('🧮 Generating embeddings...');
  const embeddings = [];
  for (let i = 0; i < productTexts.length; i++) {
    const embedding = await generateEmbedding(productTexts[i].text);
    embeddings.push({
      id: productTexts[i].id,
      title: productTexts[i].title,
      embedding
    });

    // 每处理 10 个商品输出一次进度
    if ((i + 1) % 10 === 0 || i === productTexts.length - 1) {
      console.log(`  Progress: ${i + 1}/${productTexts.length}`);
    }
  }

  // Step 2: 计算每个商品与其他商品的相似度
  console.log('🔍 Finding similar products...');
  const similarities = {};

  for (let i = 0; i < embeddings.length; i++) {
    const current = embeddings[i];
    const scores = [];

    for (let j = 0; j < embeddings.length; j++) {
      if (i === j) continue; // 跳过自己

      const other = embeddings[j];
      const similarity = cosineSimilarity(current.embedding, other.embedding);

      scores.push({
        id: other.id,
        title: other.title,
        similarity: Math.round(similarity * 10000) / 10000 // 保留4位小数
      });
    }

    // 按相似度降序排序，取 Top N
    scores.sort((a, b) => b.similarity - a.similarity);
    const topSimilar = scores.slice(0, topN);

    similarities[current.id] = {
      productId: current.id,
      productTitle: current.title,
      similarProducts: topSimilar
    };
  }

  console.log('✅ Similarity calculation completed');
  return similarities;
}

/**
 * 保存相似度结果到 JSON 文件
 */
export function saveSimilarities(similarities) {
  const dataDir = path.join(process.cwd(), 'data');

  // 确保 data 目录存在
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const filePath = path.join(dataDir, 'similarities.json');
  fs.writeFileSync(filePath, JSON.stringify(similarities, null, 2));
  console.log(`✅ Similarities saved to ${filePath}`);
}

/**
 * 从文件读取相似度结果
 */
export function loadSimilarities() {
  const filePath = path.join(process.cwd(), 'data', 'similarities.json');

  if (!fs.existsSync(filePath)) {
    return null;
  }

  const data = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(data);
}
