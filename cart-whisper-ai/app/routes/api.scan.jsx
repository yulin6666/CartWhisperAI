import { authenticate } from '../shopify.server';
import { saveProducts, saveScanLog } from '../utils/fileStorage.server';

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

    const endTime = new Date();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    // 保存扫描日志
    const log = {
      timestamp: new Date().toISOString(),
      productsCount: products.length,
      duration: `${duration}s`,
      status: 'success',
    };
    saveScanLog(log);

    return {
      success: true,
      message: 'Scan completed successfully',
      productsCount: products.length,
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
