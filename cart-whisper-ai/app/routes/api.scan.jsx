import { authenticate } from '../shopify.server';
import { saveProducts, saveScanLog } from '../utils/fileStorage.server';
import { calculateProductSimilarities, saveSimilarities } from '../utils/productSimilarity.server';
import { postProcessSimilarities, generateRecommendationWithDeepSeek, saveRecommendations } from '../utils/productRecommendation.server';
import { saveMarkdownReport, generateAllRecommendationCopies, saveCopies } from '../utils/recommendationExport.server';
import { createLogger } from '../utils/logger.server';

// GraphQL 查询获取所有产品
const PRODUCTS_QUERY = `
  query GetAllProducts($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      edges {
        node {
          id
          title
          handle
          status
          productType
          vendor
          tags
          description
          createdAt
          updatedAt
          images(first: 1) {
            edges {
              node {
                url
                altText
              }
            }
          }
          variants(first: 100) {
            edges {
              node {
                id
                title
                price
                sku
                barcode
                inventoryQuantity
              }
            }
          }
          collections(first: 10) {
            edges {
              node {
                title
              }
            }
          }
        }
        cursor
      }
      pageInfo {
        hasNextPage
      }
    }
  }
`;

// 递归获取所有产品
async function getAllProducts(admin) {
  const allProducts = [];
  let hasNextPage = true;
  let cursor = null;

  console.log('🔄 Fetching products...');

  while (hasNextPage) {
    let data;
    try {
      const response = await admin.graphql(PRODUCTS_QUERY, {
        variables: {
          first: 100,
          after: cursor,
        },
      });

      try {
        data = await response.json();
      } catch (parseError) {
        console.error('❌ Failed to parse response:', parseError);
        throw new Error(`Failed to parse GraphQL response: ${parseError.message}`);
      }

      if (data.errors) {
        console.error('❌ GraphQL errors:', data.errors);
        const errorMsg = data.errors.map(e => e.message).join(', ');
        throw new Error(`Failed to fetch products: ${errorMsg}`);
      }
    } catch (err) {
      console.error('❌ Error in products query:', err.message || err);
      throw err;
    }

    const products = data.data.products.edges.map((edge) => {
      const node = edge.node;
      return {
        id: node.id,
        title: node.title,
        handle: node.handle,
        status: node.status,
        productType: node.productType,
        vendor: node.vendor,
        tags: node.tags,
        description: node.description,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
        image: node.images.edges[0]?.node || null,
        variants: node.variants.edges.map((v) => v.node),
        collections: node.collections.edges.map((c) => c.node.title),
      };
    });

    allProducts.push(...products);
    console.log(`✅ Fetched ${products.length} products (total: ${allProducts.length})`);

    hasNextPage = data.data.products.pageInfo.hasNextPage;
    if (hasNextPage && data.data.products.edges.length > 0) {
      cursor = data.data.products.edges[data.data.products.edges.length - 1].cursor;
    }
  }

  return allProducts;
}


export async function action({ request }) {
  // 创建详细日志记录器
  const logger = createLogger('scan');

  try {
    logger.success('🔄 Starting scan...');
    const { admin } = await authenticate.admin(request);
    logger.success('✅ Authentication successful');

    const startTime = new Date();

    // 获取所有产品
    logger.info('📦 Fetching products...');
    const products = await getAllProducts(admin);
    logger.success(`✅ Got ${products.length} products`);
    logger.info(`   📝 Product list: ${products.map(p => p.title).join(', ')}`);

    // 保存到 JSON 文件
    saveProducts(products);

    // 计算所有商品的相似度（这样才能找到全库最好的推荐）
    logger.info('🔗 Calculating product similarities for ALL products...');
    const similarities = await calculateProductSimilarities(products, 10);
    saveSimilarities(similarities);
    logger.success('✅ Similarities calculated and saved');
    logger.info(`   📊 Found similarities for: ${Object.keys(similarities).length} products`);

    // 后处理相似度（过滤价格和分类）
    // 传入所有产品以便查找被推荐商品的完整信息
    logger.info('🔍 Post-processing similarities...');
    const processedData = postProcessSimilarities(products, similarities);

    // 为了节约 token，只对前 5 个商品生成 DeepSeek AI 推荐理由
    const productsForAI = Object.entries(processedData)
      .slice(0, 5)
      .reduce((acc, [key, value]) => {
        acc[key] = value;
        return acc;
      }, {});
    logger.warn(`⚡ ONLY sending top 5 products to DeepSeek API to save tokens...`);
    logger.info(`   📊 Will process: ${Object.values(productsForAI).map(p => p.productTitle).join(', ')}`);

    // 使用 DeepSeek 为前5个商品生成推荐理由（节约token）
    let recommendations = { ...processedData }; // 复制所有数据
    let recommendationError = null;

    if (process.env.DEEPSEEK_API_KEY) {
      try {
        logger.info('\n🤖 Generating recommendations with DeepSeek for top 5 products...');
        const aiRecommendations = await generateRecommendationWithDeepSeek(productsForAI);

        // 只用AI生成的推荐理由来更新前5个商品
        Object.assign(recommendations, aiRecommendations);

        saveRecommendations(recommendations);
        logger.success('✅ Recommendations generated and saved');
      } catch (err) {
        logger.error(`⚠️ Failed to generate recommendations: ${err.message}`);
        recommendationError = err.message;
        // 即使推荐失败也继续，保存已处理的数据
        saveRecommendations(recommendations);
      }
    } else {
      logger.warn('⚠️ DEEPSEEK_API_KEY not set, skipping AI recommendations');
      logger.info('   Saving recommendations without AI reasoning...');
      saveRecommendations(recommendations);
    }

    // 生成 Markdown 报告和推荐文案
    logger.info('\n📝 Generating Markdown report and recommendation copies...');
    saveMarkdownReport(recommendations);
    const copies = await generateAllRecommendationCopies(recommendations);
    saveCopies(copies);
    logger.success(`✅ Markdown report and copies generated`);
    logger.info(`   📊 Generated copies for ${Object.keys(copies).length} products`);

    const endTime = new Date();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    // 保存扫描日志
    const log = {
      timestamp: new Date().toISOString(),
      productsCount: products.length,
      similaritiesCount: Object.keys(similarities).length,
      processedCount: Object.keys(processedData).length,
      recommendationsGenerated: !!recommendations,
      recommendationError: recommendationError,
      copiesCount: Object.keys(copies).length,
      duration: `${duration}s`,
      status: 'success',
    };
    saveScanLog(log);

    // 保存详细日志
    const logFilePath = logger.save();
    logger.info(`\n📁 Log file: ${logFilePath}`);

    return {
      success: true,
      message: 'Scan completed successfully',
      productsCount: products.length,
      similaritiesCount: Object.keys(similarities).length,
      processedCount: Object.keys(processedData).length,
      copiesCount: Object.keys(copies).length,
      recommendationsGenerated: !!recommendations,
      duration: `${duration}s`,
      logFile: logFilePath,
    };
  } catch (error) {
    let errorMessage = 'Unknown error occurred';

    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    } else if (error?.message) {
      errorMessage = error.message;
    } else {
      errorMessage = String(error);
    }

    logger.error(`❌ Scan error: ${errorMessage}`);
    if (error?.stack) {
      logger.error(`Stack: ${error.stack}`);
    }

    // 保存详细日志
    try {
      logger.save();
    } catch (logError) {
      console.error('Failed to save log:', logError);
    }

    // 保存错误日志
    const log = {
      timestamp: new Date().toISOString(),
      status: 'failed',
      error: errorMessage,
    };
    saveScanLog(log);

    return {
      success: false,
      error: errorMessage,
    };
  }
}

export async function loader({ request }) {
  // 只允许 POST 请求
  if (request.method !== 'POST') {
    return {
      error: 'Method not allowed. Use POST to trigger the scan.',
    };
  }
}
