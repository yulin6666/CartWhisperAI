import { getRecommendationsByNumericId, getRecommendationsForProduct } from "../utils/recommendationSync.server";

/**
 * 公开的推荐API端点
 * 供Theme App Extension获取商品推荐
 *
 * GET /api/recommendations/:shop/:productId
 *
 * @param shop - 店铺域名 (例如: store-name.myshopify.com)
 * @param productId - 商品ID (可以是数字ID或完整GID)
 *
 * Query参数:
 * - limit: 返回推荐数量限制 (默认3)
 *
 * 返回格式:
 * {
 *   success: boolean,
 *   productId: string,
 *   recommendations: [
 *     {
 *       id: string,           // Shopify Product GID
 *       numericId: string,    // 数字ID，用于前端链接
 *       title: string,
 *       price: number,
 *       image: string,
 *       reasoning: string     // AI推荐理由
 *     }
 *   ]
 * }
 */
export async function loader({ params, request }) {
  // CORS 头，允许跨域请求
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  try {
    const { shop, productId } = params;

    if (!shop || !productId) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing shop or productId parameter" }),
        { status: 400, headers }
      );
    }

    // 解析query参数
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") || "3", 10);

    // 判断productId是数字ID还是GID
    let recommendations;
    if (productId.startsWith("gid://")) {
      recommendations = await getRecommendationsForProduct(shop, productId, limit);
    } else {
      recommendations = await getRecommendationsByNumericId(shop, productId, limit);
    }

    // 处理返回数据，添加数字ID便于前端使用
    const formattedRecommendations = recommendations.map((rec) => {
      // 从GID中提取数字ID
      const numericId = rec.id.replace("gid://shopify/Product/", "");
      return {
        id: rec.id,
        numericId,
        handle: rec.handle,
        title: rec.title,
        price: rec.price,
        category: rec.category,
        vendor: rec.vendor,
        image: rec.image,
        similarity: rec.similarity,
        reasoning: rec.reasoning,
      };
    });

    return new Response(
      JSON.stringify({
        success: true,
        productId,
        shop,
        count: formattedRecommendations.length,
        recommendations: formattedRecommendations,
      }),
      { status: 200, headers }
    );
  } catch (error) {
    console.error("Error fetching recommendations:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Failed to fetch recommendations" }),
      { status: 500, headers }
    );
  }
}

// 处理OPTIONS预检请求
export async function action({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  return new Response(
    JSON.stringify({ error: "Method not allowed" }),
    { status: 405, headers: { "Content-Type": "application/json" } }
  );
}
