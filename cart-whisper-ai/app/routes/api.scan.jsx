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


  while (hasNextPage) {
    const response = await admin.graphql(PRODUCTS_QUERY, {
      variables: {
        first: 100,
        after: cursor,
      },
    });

    const data = await response.json();

    if (data.errors) {
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


    // 1. Shopify 认证
    const { admin, session } = await authenticate.admin(request);
    const shop = session.shop;

    // 2. 获取 API Key（首次会自动注册）
    const apiKey = await getApiKey(shop, admin);

    // 3. 从 Shopify 获取所有商品
    let products = await getAllProducts(admin);

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

    let partialSync = false;
    let originalProductCount = products.length;

    if (maxProducts !== Infinity && products.length > maxProducts) {
      products = products.slice(0, maxProducts);
      partialSync = true;
    }

    // 4. 异步同步到后端（不等待完成）

    // 立即返回，不等待同步完成
    // 在后台触发同步（fire and forget）
    syncProducts(apiKey, products, mode).then(syncResult => {
    }).catch(error => {
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    return {
      success: true,
      async: true,
      message: partialSync
        ? `Syncing ${maxProducts} of ${originalProductCount} products in background. Please refresh in 30 minutes.`
        : 'Sync started in background. Please refresh in 30 minutes to see results.',
      mode: mode,
      productsCount: products.length,
      duration: `${duration}s`,
      partialSync: partialSync,
      limitExceeded: partialSync,
      currentPlan: currentPlan,
      maxProducts: maxProducts,
      actualProducts: originalProductCount,
      upgradeRequired: partialSync,
      estimatedCompletionTime: '30 minutes',
    };
  } catch (error) {

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
      error: 'Sync failed. Please try again.',
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
