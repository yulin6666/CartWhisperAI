import { getApiKey } from "../utils/shopConfig.server";
import { getRecommendations } from "../utils/backendApi.server";

/**
 * 公开的推荐API端点
 * 供Theme App Extension获取商品推荐
 *
 * GET /api/recommendations/:shop/:productId
 */
export async function loader({ params, request }) {
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

    // 解析 query 参数
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") || "3", 10);

    // 获取 API Key
    const apiKey = await getApiKey(shop);

    // 从后端获取推荐
    // 处理 productId：如果是 GID 格式，提取数字 ID
    let numericProductId = productId;
    if (productId.startsWith("gid://")) {
      numericProductId = productId.replace("gid://shopify/Product/", "");
    }

    const result = await getRecommendations(apiKey, numericProductId, limit);

    // 格式化返回数据
    const formattedRecommendations = (result.recommendations || []).map((rec) => ({
      id: `gid://shopify/Product/${rec.id}`,
      numericId: rec.id,
      handle: rec.handle,
      title: rec.title,
      price: rec.price,
      image: rec.image,
      reasoning: rec.reason,
    }));

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
      JSON.stringify({ success: false, error: error.message || "Failed to fetch recommendations" }),
      { status: 500, headers }
    );
  }
}

// 处理 OPTIONS 预检请求
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
