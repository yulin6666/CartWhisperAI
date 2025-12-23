import { authenticate } from '../shopify.server';
import { saveProducts, saveScanLog } from '../utils/fileStorage.server';
import { calculateProductSimilarities, saveSimilarities } from '../utils/productSimilarity.server';
import { postProcessSimilarities, generateRecommendationWithDeepSeek, saveRecommendations } from '../utils/productRecommendation.server';
import { saveMarkdownReport, generateAllRecommendationCopies, saveCopies } from '../utils/recommendationExport.server';

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
  try {
    console.log('🔄 Starting scan...');
    const { admin } = await authenticate.admin(request);
    console.log('✅ Authentication successful');

    const startTime = new Date();

    // 获取所有产品
    console.log('📦 Fetching products...');
    const products = await getAllProducts(admin);
    console.log(`✅ Got ${products.length} products`);

    // 保存到 JSON 文件
    saveProducts(products);

    // 计算所有商品的相似度（这样才能找到不同分类的推荐商品）
    console.log('🔗 Calculating product similarities...');
    const similarities = await calculateProductSimilarities(products, 10);
    saveSimilarities(similarities);
    console.log('✅ Similarities calculated and saved');

    // 为了节约 token，只对前 5 个商品生成推荐文案
    const productsForRecommendation = products.slice(0, 5);
    console.log(`\n⚡ Processing top 5 products for AI copy generation (saving tokens)...`);
    console.log(`   📊 Will process: ${productsForRecommendation.map(p => p.title).join(', ')}`);

    // 后处理相似度（过滤价格和分类）
    // 传入所有产品以便查找被推荐商品的完整信息
    console.log('\n🔍 Post-processing similarities...');
    const processedData = postProcessSimilarities(products, similarities);

    // 使用 DeepSeek 生成推荐理由
    let recommendations = null;
    let recommendationError = null;
    if (process.env.DEEPSEEK_API_KEY) {
      try {
        console.log('\n🤖 Generating recommendations with DeepSeek...');
        recommendations = await generateRecommendationWithDeepSeek(processedData);
        saveRecommendations(recommendations);
        console.log('✅ Recommendations generated and saved');
      } catch (err) {
        console.warn('⚠️ Failed to generate recommendations:', err.message);
        recommendationError = err.message;
        // 即使推荐失败也继续，保存已处理的数据
        saveRecommendations(processedData);
        recommendations = processedData;
      }
    } else {
      console.warn('⚠️ DEEPSEEK_API_KEY not set, skipping AI recommendations');
      console.log('   Saving post-processed data without AI reasoning...');
      saveRecommendations(processedData);
      recommendations = processedData;
    }

    // 生成 Markdown 报告和推荐文案
    console.log('\n📝 Generating Markdown report and recommendation copies...');
    saveMarkdownReport(recommendations);
    const copies = await generateAllRecommendationCopies(recommendations);
    saveCopies(copies);
    console.log('✅ Markdown report and copies generated');

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
      duration: `${duration}s`,
      status: 'success',
    };
    saveScanLog(log);

    return {
      success: true,
      message: 'Scan completed successfully',
      productsCount: products.length,
      similaritiesCount: Object.keys(similarities).length,
      processedCount: Object.keys(processedData).length,
      recommendationsGenerated: !!recommendations,
      duration: `${duration}s`,
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

    console.error('❌ Scan error:', error);
    console.error('Error message:', errorMessage);
    console.error('Error stack:', error?.stack);

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
