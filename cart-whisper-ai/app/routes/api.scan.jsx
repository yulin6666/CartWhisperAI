import { authenticate } from '../shopify.server';
import { getApiKey } from '../utils/shopConfig.server';
import { syncProducts } from '../utils/backendApi.server';
import { getPlanFeatures, getCurrentPlan } from '../utils/billing.server';

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

  console.log('🔄 Fetching products from Shopify...');

  while (hasNextPage) {
    const response = await admin.graphql(PRODUCTS_QUERY, {
      variables: {
        first: 100,
        after: cursor,
      },
    });

    const data = await response.json();

    if (data.errors) {
      console.error('❌ GraphQL errors:', data.errors);
      throw new Error(`Failed to fetch products: ${data.errors.map(e => e.message).join(', ')}`);
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
        // 取第一个 variant 的价格作为商品价格
        price: node.variants.edges[0]?.node?.price || '0',
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
  const startTime = Date.now();

  try {
    // Get mode from request body (if sent as JSON) or default to 'auto'
    let mode = 'auto';
    try {
      const formData = await request.formData();
      mode = formData.get('mode') || 'auto';
    } catch {
      // If not form data, that's fine, use default
    }

    console.log(`🔄 Starting scan (mode: ${mode})...`);

    // 1. Shopify 认证
    const { admin, session } = await authenticate.admin(request);
    const shop = session.shop;
    console.log(`✅ Authenticated: ${shop}`);

    // 2. 获取 API Key（首次会自动注册）
    console.log('🔑 Getting API key...');
    const apiKey = await getApiKey(shop);
    console.log('✅ API key ready');

    // 3. 从 Shopify 获取所有商品
    console.log('📦 Fetching products from Shopify...');
    const products = await getAllProducts(admin);
    console.log(`✅ Got ${products.length} products`);

    if (products.length === 0) {
      return {
        success: true,
        message: 'No products found',
        mode: 'none',
        productsCount: 0,
        recommendationsCount: 0,
      };
    }

    // 3.5 检查商品数量限制
    const planFeatures = await getPlanFeatures(shop);
    const currentPlan = await getCurrentPlan(shop);
    const maxProducts = planFeatures.maxProducts;

    if (maxProducts !== Infinity && products.length > maxProducts) {
      console.log(`⚠️ Product limit exceeded: ${products.length} > ${maxProducts} (${currentPlan} plan)`);
      return {
        success: false,
        error: `Product limit exceeded. Your ${currentPlan} plan allows up to ${maxProducts} products, but you have ${products.length} products.`,
        limitExceeded: true,
        currentPlan: currentPlan,
        maxProducts: maxProducts,
        actualProducts: products.length,
        upgradeRequired: true,
      };
    }

    // 4. 同步到后端（使用指定的模式）
    console.log(`🚀 Syncing to backend (mode: ${mode})...`);
    const syncResult = await syncProducts(apiKey, products, mode);
    console.log(`✅ Sync complete: mode=${syncResult.mode}, ${syncResult.products} products, ${syncResult.newRecommendations} new recommendations (total: ${syncResult.totalRecommendations})`);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    return {
      success: true,
      message: 'Scan completed successfully',
      mode: syncResult.mode,
      productsCount: syncResult.products,
      recommendationsCount: syncResult.totalRecommendations || syncResult.recommendations,
      newRecommendationsCount: syncResult.newRecommendations,
      duration: `${duration}s`,
      canRefresh: syncResult.canRefresh,
      nextRefreshAt: syncResult.nextRefreshAt,
    };
  } catch (error) {
    console.error('❌ Scan error:', error);

    // Parse rate limit error
    const errorParts = (error.message || '').split('|');
    if (errorParts.length === 3 && errorParts[0].includes('rate limit')) {
      return {
        success: false,
        error: errorParts[0],
        rateLimited: true,
        nextRefreshAt: errorParts[1],
        daysRemaining: parseInt(errorParts[2]),
      };
    }

    return {
      success: false,
      error: error.message || 'Unknown error',
    };
  }
}

export async function loader({ request }) {
  if (request.method !== 'POST') {
    return {
      error: 'Method not allowed. Use POST to trigger the scan.',
    };
  }
}
