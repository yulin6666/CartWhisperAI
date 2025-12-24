import { getRecommendationsByNumericId } from "../utils/recommendationSync.server";

/**
 * App Proxy 处理器
 * 处理来自商店前端通过 Shopify App Proxy 的请求
 *
 * 路径格式: /apps/chat-proxy/recommendations?product_id=xxx
 * Shopify 会将请求转发到: /api/proxy/recommendations?product_id=xxx
 */
export async function loader({ request }) {
  const url = new URL(request.url);
  const path = url.pathname.replace("/api/proxy", "");

  // CORS 和响应头
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };

  console.log("[App Proxy] Request path:", path);
  console.log("[App Proxy] Full URL:", url.toString());

  // 处理推荐请求: /recommendations
  if (path === "/recommendations" || path.startsWith("/recommendations")) {
    return handleRecommendations(request, headers);
  }

  // 健康检查
  if (path === "/health" || path === "") {
    return new Response(
      JSON.stringify({ status: "ok", service: "CartWhisperAI" }),
      { status: 200, headers }
    );
  }

  return new Response(
    JSON.stringify({ error: "Not found", path }),
    { status: 404, headers }
  );
}

/**
 * 处理推荐请求
 */
async function handleRecommendations(request, headers) {
  try {
    const url = new URL(request.url);

    // 从查询参数获取数据
    const productId = url.searchParams.get("product_id");
    const shop = url.searchParams.get("shop");
    const limit = parseInt(url.searchParams.get("limit") || "3", 10);

    console.log("[App Proxy] Recommendations request:", { productId, shop, limit });

    if (!productId) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing product_id parameter" }),
        { status: 400, headers }
      );
    }

    if (!shop) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing shop parameter" }),
        { status: 400, headers }
      );
    }

    // 获取推荐
    const recommendations = await getRecommendationsByNumericId(shop, productId, limit);

    // 格式化返回数据
    const formattedRecommendations = recommendations.map((rec) => {
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

    console.log("[App Proxy] Found", formattedRecommendations.length, "recommendations");

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
    console.error("[App Proxy] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers }
    );
  }
}

// 处理 POST 请求 (部分主题可能用 POST)
export async function action({ request }) {
  return loader({ request });
}
