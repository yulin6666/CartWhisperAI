/**
 * 批量添加商品到Shopify商店
 * 使用方法: node scripts/add-products.js
 */

import { authenticate } from '../app/shopify.server.js';

// 商品模板数据 - 50个不同类别的商品
const PRODUCT_TEMPLATES = [
  // 运动鞋系列 (10个)
  { title: 'Nike Air Max 270', type: 'Shoes', vendor: 'Nike', price: '150.00', tags: ['shoes', 'sneakers', 'running'] },
  { title: 'Adidas Ultraboost 22', type: 'Shoes', vendor: 'Adidas', price: '180.00', tags: ['shoes', 'sneakers', 'running'] },
  { title: 'Puma RS-X', type: 'Shoes', vendor: 'Puma', price: '110.00', tags: ['shoes', 'sneakers', 'casual'] },
  { title: 'New Balance 574', type: 'Shoes', vendor: 'New Balance', price: '80.00', tags: ['shoes', 'sneakers', 'classic'] },
  { title: 'Converse Chuck Taylor', type: 'Shoes', vendor: 'Converse', price: '60.00', tags: ['shoes', 'sneakers', 'casual'] },
  { title: 'Vans Old Skool', type: 'Shoes', vendor: 'Vans', price: '65.00', tags: ['shoes', 'sneakers', 'skate'] },
  { title: 'Reebok Classic Leather', type: 'Shoes', vendor: 'Reebok', price: '75.00', tags: ['shoes', 'sneakers', 'retro'] },
  { title: 'ASICS Gel-Kayano', type: 'Shoes', vendor: 'ASICS', price: '160.00', tags: ['shoes', 'sneakers', 'running'] },
  { title: 'Under Armour HOVR', type: 'Shoes', vendor: 'Under Armour', price: '120.00', tags: ['shoes', 'sneakers', 'training'] },
  { title: 'Skechers Go Walk', type: 'Shoes', vendor: 'Skechers', price: '70.00', tags: ['shoes', 'sneakers', 'comfort'] },

  // 服装系列 (15个)
  { title: 'Nike Dri-FIT T-Shirt', type: 'Apparel', vendor: 'Nike', price: '35.00', tags: ['clothing', 'shirt', 'sports'] },
  { title: 'Adidas Trefoil Hoodie', type: 'Apparel', vendor: 'Adidas', price: '70.00', tags: ['clothing', 'hoodie', 'casual'] },
  { title: 'Puma Essential Joggers', type: 'Apparel', vendor: 'Puma', price: '50.00', tags: ['clothing', 'pants', 'casual'] },
  { title: 'Champion Reverse Weave Sweatshirt', type: 'Apparel', vendor: 'Champion', price: '60.00', tags: ['clothing', 'sweatshirt', 'streetwear'] },
  { title: 'The North Face Fleece Jacket', type: 'Apparel', vendor: 'The North Face', price: '120.00', tags: ['clothing', 'jacket', 'outdoor'] },
  { title: 'Patagonia Down Vest', type: 'Apparel', vendor: 'Patagonia', price: '150.00', tags: ['clothing', 'vest', 'outdoor'] },
  { title: 'Levi\'s 501 Original Jeans', type: 'Apparel', vendor: 'Levi\'s', price: '90.00', tags: ['clothing', 'jeans', 'denim'] },
  { title: 'Carhartt Work Pants', type: 'Apparel', vendor: 'Carhartt', price: '65.00', tags: ['clothing', 'pants', 'workwear'] },
  { title: 'Columbia Windbreaker', type: 'Apparel', vendor: 'Columbia', price: '80.00', tags: ['clothing', 'jacket', 'outdoor'] },
  { title: 'Under Armour Compression Shirt', type: 'Apparel', vendor: 'Under Armour', price: '45.00', tags: ['clothing', 'shirt', 'sports'] },
  { title: 'Hanes ComfortBlend Hoodie', type: 'Apparel', vendor: 'Hanes', price: '30.00', tags: ['clothing', 'hoodie', 'basic'] },
  { title: 'Gildan Heavy Cotton T-Shirt', type: 'Apparel', vendor: 'Gildan', price: '15.00', tags: ['clothing', 'shirt', 'basic'] },
  { title: 'Dickies Work Shirt', type: 'Apparel', vendor: 'Dickies', price: '40.00', tags: ['clothing', 'shirt', 'workwear'] },
  { title: 'Wrangler Cargo Shorts', type: 'Apparel', vendor: 'Wrangler', price: '35.00', tags: ['clothing', 'shorts', 'casual'] },
  { title: 'Lee Relaxed Fit Jeans', type: 'Apparel', vendor: 'Lee', price: '55.00', tags: ['clothing', 'jeans', 'denim'] },

  // 配件系列 (15个)
  { title: 'Nike Swoosh Headband', type: 'Accessories', vendor: 'Nike', price: '12.00', tags: ['accessories', 'headband', 'sports'] },
  { title: 'Adidas Originals Cap', type: 'Accessories', vendor: 'Adidas', price: '25.00', tags: ['accessories', 'hat', 'casual'] },
  { title: 'Puma Training Gloves', type: 'Accessories', vendor: 'Puma', price: '20.00', tags: ['accessories', 'gloves', 'training'] },
  { title: 'Under Armour Gym Bag', type: 'Accessories', vendor: 'Under Armour', price: '45.00', tags: ['accessories', 'bag', 'gym'] },
  { title: 'New Era 59FIFTY Cap', type: 'Accessories', vendor: 'New Era', price: '35.00', tags: ['accessories', 'hat', 'streetwear'] },
  { title: 'Oakley Sunglasses', type: 'Accessories', vendor: 'Oakley', price: '150.00', tags: ['accessories', 'sunglasses', 'sports'] },
  { title: 'Ray-Ban Aviator', type: 'Accessories', vendor: 'Ray-Ban', price: '180.00', tags: ['accessories', 'sunglasses', 'classic'] },
  { title: 'Timex Weekender Watch', type: 'Accessories', vendor: 'Timex', price: '50.00', tags: ['accessories', 'watch', 'casual'] },
  { title: 'Casio G-Shock Watch', type: 'Accessories', vendor: 'Casio', price: '120.00', tags: ['accessories', 'watch', 'sports'] },
  { title: 'Fossil Leather Wallet', type: 'Accessories', vendor: 'Fossil', price: '40.00', tags: ['accessories', 'wallet', 'leather'] },
  { title: 'Herschel Supply Backpack', type: 'Accessories', vendor: 'Herschel', price: '80.00', tags: ['accessories', 'backpack', 'casual'] },
  { title: 'JanSport Classic Backpack', type: 'Accessories', vendor: 'JanSport', price: '45.00', tags: ['accessories', 'backpack', 'school'] },
  { title: 'Stance Crew Socks', type: 'Accessories', vendor: 'Stance', price: '15.00', tags: ['accessories', 'socks', 'casual'] },
  { title: 'Nike Elite Socks', type: 'Accessories', vendor: 'Nike', price: '18.00', tags: ['accessories', 'socks', 'sports'] },
  { title: 'Buff Multifunctional Headwear', type: 'Accessories', vendor: 'Buff', price: '22.00', tags: ['accessories', 'headwear', 'outdoor'] },

  // 运动装备系列 (10个)
  { title: 'Wilson Basketball', type: 'Sports Equipment', vendor: 'Wilson', price: '30.00', tags: ['sports', 'basketball', 'equipment'] },
  { title: 'Spalding NBA Official Ball', type: 'Sports Equipment', vendor: 'Spalding', price: '120.00', tags: ['sports', 'basketball', 'official'] },
  { title: 'Nike Soccer Ball', type: 'Sports Equipment', vendor: 'Nike', price: '25.00', tags: ['sports', 'soccer', 'equipment'] },
  { title: 'Adidas Tango Football', type: 'Sports Equipment', vendor: 'Adidas', price: '35.00', tags: ['sports', 'soccer', 'equipment'] },
  { title: 'Rawlings Baseball Glove', type: 'Sports Equipment', vendor: 'Rawlings', price: '80.00', tags: ['sports', 'baseball', 'glove'] },
  { title: 'Louisville Slugger Bat', type: 'Sports Equipment', vendor: 'Louisville Slugger', price: '60.00', tags: ['sports', 'baseball', 'bat'] },
  { title: 'Yonex Badminton Racket', type: 'Sports Equipment', vendor: 'Yonex', price: '90.00', tags: ['sports', 'badminton', 'racket'] },
  { title: 'Wilson Tennis Racket', type: 'Sports Equipment', vendor: 'Wilson', price: '150.00', tags: ['sports', 'tennis', 'racket'] },
  { title: 'Mikasa Volleyball', type: 'Sports Equipment', vendor: 'Mikasa', price: '40.00', tags: ['sports', 'volleyball', 'equipment'] },
  { title: 'TRX Suspension Trainer', type: 'Sports Equipment', vendor: 'TRX', price: '180.00', tags: ['sports', 'training', 'fitness'] },
];

// GraphQL Mutation 创建商品
const CREATE_PRODUCT_MUTATION = `
  mutation CreateProduct($input: ProductInput!) {
    productCreate(input: $input) {
      product {
        id
        title
        handle
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

async function createProduct(admin, productData) {
  const input = {
    title: productData.title,
    productType: productData.type,
    vendor: productData.vendor,
    tags: productData.tags,
    status: 'ACTIVE',
    variants: [
      {
        price: productData.price,
        inventoryPolicy: 'CONTINUE',
        inventoryManagement: 'SHOPIFY',
      }
    ],
  };

  try {
    const response = await admin.graphql(CREATE_PRODUCT_MUTATION, {
      variables: { input },
    });

    const result = await response.json();

    if (result.data?.productCreate?.userErrors?.length > 0) {
      console.error(`❌ Error creating ${productData.title}:`, result.data.productCreate.userErrors);
      return null;
    }

    return result.data?.productCreate?.product;
  } catch (error) {
    console.error(`❌ Failed to create ${productData.title}:`, error.message);
    return null;
  }
}

async function main() {
  console.log('🚀 Starting bulk product creation...\n');

  // 这里需要手动提供 shop 和 accessToken
  // 在实际使用时，您需要从环境变量或配置文件中获取
  const shop = process.env.SHOPIFY_SHOP || 'your-shop.myshopify.com';
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

  if (!accessToken) {
    console.error('❌ Error: SHOPIFY_ACCESS_TOKEN environment variable is required');
    console.log('\nUsage:');
    console.log('  SHOPIFY_SHOP=your-shop.myshopify.com SHOPIFY_ACCESS_TOKEN=your-token node scripts/add-products.js');
    process.exit(1);
  }

  // 创建简单的 admin 对象
  const admin = {
    graphql: async (query, options) => {
      const response = await fetch(`https://${shop}/admin/api/2024-01/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
        },
        body: JSON.stringify({
          query,
          variables: options?.variables,
        }),
      });

      return {
        json: async () => response.json(),
      };
    },
  };

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < PRODUCT_TEMPLATES.length; i++) {
    const productData = PRODUCT_TEMPLATES[i];
    console.log(`[${i + 1}/${PRODUCT_TEMPLATES.length}] Creating: ${productData.title}...`);

    const product = await createProduct(admin, productData);

    if (product) {
      console.log(`✅ Created: ${product.title} (ID: ${product.id})\n`);
      successCount++;
    } else {
      console.log(`❌ Failed to create: ${productData.title}\n`);
      failCount++;
    }

    // 添加延迟以避免速率限制
    if (i < PRODUCT_TEMPLATES.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.log('\n📊 Summary:');
  console.log(`✅ Successfully created: ${successCount} products`);
  console.log(`❌ Failed: ${failCount} products`);
  console.log(`📦 Total: ${PRODUCT_TEMPLATES.length} products`);
}

main().catch(console.error);
