import prisma from "../db.server";

/**
 * 将推荐数据同步到数据库
 * @param {string} shop - 店铺域名
 * @param {Object} recommendations - 推荐数据对象
 * @param {Object} logger - 可选的日志记录器
 * @returns {Object} 同步结果统计
 */
export async function syncRecommendationsToDatabase(shop, recommendations, logger = null) {
  const log = (msg) => logger?.info?.(msg) || console.log(msg);
  const logError = (msg) => logger?.error?.(msg) || console.error(msg);

  log(`开始同步推荐数据到数据库，店铺: ${shop}`);

  let created = 0;
  let updated = 0;
  let deleted = 0;
  let errors = 0;

  try {
    // 首先标记所有现有推荐为非活跃（软删除）
    const deactivateResult = await prisma.productRecommendation.updateMany({
      where: { shop },
      data: { isActive: false }
    });
    log(`已将 ${deactivateResult.count} 条现有推荐标记为非活跃`);

    // 遍历所有推荐数据
    for (const [productId, recommendation] of Object.entries(recommendations)) {
      if (!recommendation.candidates || recommendation.candidates.length === 0) {
        continue; // 跳过没有推荐的商品
      }

      // 为每个候选商品创建推荐记录
      for (let i = 0; i < recommendation.candidates.length; i++) {
        const candidate = recommendation.candidates[i];
        const priority = recommendation.candidates.length - i; // 第一个候选优先级最高

        try {
          // 使用upsert确保数据唯一性
          await prisma.productRecommendation.upsert({
            where: {
              shop_sourceProductId_recommendedProductId: {
                shop,
                sourceProductId: recommendation.productId,
                recommendedProductId: candidate.id
              }
            },
            update: {
              sourceProductTitle: recommendation.productTitle,
              sourceProductPrice: recommendation.productPrice,
              sourceProductCategory: recommendation.productCategory || null,
              sourceProductImage: recommendation.productImage?.url || null,
              recommendedProductHandle: candidate.handle || null,
              recommendedProductTitle: candidate.title,
              recommendedProductPrice: candidate.price,
              recommendedProductCategory: candidate.category || null,
              recommendedProductVendor: candidate.vendor || null,
              recommendedProductImage: candidate.image?.url || null,
              similarity: candidate.similarity,
              reasoning: recommendation.reasoning || null,
              priority,
              isActive: true,
              updatedAt: new Date()
            },
            create: {
              shop,
              sourceProductId: recommendation.productId,
              sourceProductTitle: recommendation.productTitle,
              sourceProductPrice: recommendation.productPrice,
              sourceProductCategory: recommendation.productCategory || null,
              sourceProductImage: recommendation.productImage?.url || null,
              recommendedProductId: candidate.id,
              recommendedProductHandle: candidate.handle || null,
              recommendedProductTitle: candidate.title,
              recommendedProductPrice: candidate.price,
              recommendedProductCategory: candidate.category || null,
              recommendedProductVendor: candidate.vendor || null,
              recommendedProductImage: candidate.image?.url || null,
              similarity: candidate.similarity,
              reasoning: recommendation.reasoning || null,
              priority,
              isActive: true
            }
          });
          created++;
        } catch (err) {
          logError(`同步推荐失败: ${recommendation.productId} -> ${candidate.id}: ${err.message}`);
          errors++;
        }
      }
    }

    // 统计实际删除的（非活跃的）记录数
    const inactiveCount = await prisma.productRecommendation.count({
      where: { shop, isActive: false }
    });
    deleted = inactiveCount;

    // 可选：物理删除非活跃记录
    // await prisma.productRecommendation.deleteMany({
    //   where: { shop, isActive: false }
    // });

    log(`同步完成: 创建/更新 ${created} 条, 非活跃 ${deleted} 条, 错误 ${errors} 条`);

    return {
      success: true,
      created,
      updated,
      deleted,
      errors,
      total: created
    };
  } catch (error) {
    logError(`同步推荐数据失败: ${error.message}`);
    return {
      success: false,
      error: error.message,
      created,
      updated,
      deleted,
      errors
    };
  }
}

/**
 * 获取某个商品的推荐列表
 * @param {string} shop - 店铺域名
 * @param {string} productId - 商品ID（Shopify GID）
 * @param {number} limit - 返回数量限制
 * @returns {Array} 推荐商品列表
 */
export async function getRecommendationsForProduct(shop, productId, limit = 3) {
  try {
    const recommendations = await prisma.productRecommendation.findMany({
      where: {
        shop,
        sourceProductId: productId,
        isActive: true
      },
      orderBy: [
        { priority: 'desc' },
        { similarity: 'desc' }
      ],
      take: limit
    });

    return recommendations.map(rec => ({
      id: rec.recommendedProductId,
      handle: rec.recommendedProductHandle,
      title: rec.recommendedProductTitle,
      price: rec.recommendedProductPrice,
      category: rec.recommendedProductCategory,
      vendor: rec.recommendedProductVendor,
      image: rec.recommendedProductImage,
      similarity: rec.similarity,
      reasoning: rec.reasoning
    }));
  } catch (error) {
    console.error(`获取推荐失败: ${error.message}`);
    return [];
  }
}

/**
 * 根据商品Handle或数字ID获取推荐
 * 这是给Theme App Extension使用的，因为前端可能没有GID
 * @param {string} shop - 店铺域名
 * @param {string} numericId - 商品数字ID
 * @param {number} limit - 返回数量限制
 */
export async function getRecommendationsByNumericId(shop, numericId, limit = 3) {
  const gid = `gid://shopify/Product/${numericId}`;
  return getRecommendationsForProduct(shop, gid, limit);
}

/**
 * 获取店铺的推荐统计信息
 * @param {string} shop - 店铺域名
 */
export async function getRecommendationStats(shop) {
  const totalRecommendations = await prisma.productRecommendation.count({
    where: { shop, isActive: true }
  });

  const productsWithRecommendations = await prisma.productRecommendation.groupBy({
    by: ['sourceProductId'],
    where: { shop, isActive: true }
  });

  return {
    totalRecommendations,
    productsWithRecommendations: productsWithRecommendations.length
  };
}
