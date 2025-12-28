import { getApiKey } from "../utils/shopConfig.server";
import { getRecommendations, healthCheck } from "../utils/backendApi.server";

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

  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };

  // 详细日志
  console.log("=".repeat(60));
  console.log("[App Proxy] INCOMING REQUEST");
  console.log("[App Proxy] Full URL:", request.url);
  console.log("[App Proxy] Method:", request.method);
  console.log("[App Proxy] Path:", path);
  console.log("[App Proxy] Query params:", Object.fromEntries(url.searchParams));
  console.log("=".repeat(60));

  // 处理推荐请求: /recommendations
  if (path === "/recommendations" || path.startsWith("/recommendations")) {
    return handleRecommendations(request, headers);
  }

  // 健康检查
  if (path === "/health" || path === "") {
    try {
      const backendHealth = await healthCheck();
      return new Response(
        JSON.stringify({
          status: "ok",
          service: "CartWhisperAI",
          backend: backendHealth
        }),
        { status: 200, headers }
      );
    } catch (error) {
      return new Response(
        JSON.stringify({
          status: "ok",
          service: "CartWhisperAI",
          backend: { status: "error", message: error.message }
        }),
        { status: 200, headers }
      );
    }
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

    const productId = url.searchParams.get("product_id");
    const shop = url.searchParams.get("shop");
    const limit = parseInt(url.searchParams.get("limit") || "3", 10);

    console.log("[App Proxy] Recommendations request:", { productId, shop, limit });

    if (!productId) {
      console.error("[App Proxy] Missing product_id");
      return new Response(
        JSON.stringify({ success: false, error: "Missing product_id parameter" }),
        { status: 400, headers }
      );
    }

    if (!shop) {
      console.error("[App Proxy] Missing shop");
      return new Response(
        JSON.stringify({ success: false, error: "Missing shop parameter" }),
        { status: 400, headers }
      );
    }

    // 获取 API Key
    console.log("[App Proxy] Getting API key for shop:", shop);
    let apiKey;
    try {
      apiKey = await getApiKey(shop);
      console.log("[App Proxy] API key obtained successfully");
    } catch (error) {
      console.error("[App Proxy] Failed to get API key:", error.message, error.stack);
      throw new Error(`Failed to get API key: ${error.message}`);
    }

    // 从后端获取推荐
    console.log("[App Proxy] Fetching recommendations from backend...");
    let result;
    try {
      result = await getRecommendations(apiKey, productId, limit);
      console.log("[App Proxy] Backend response:", result);
    } catch (error) {
      console.error("[App Proxy] Failed to get recommendations from backend:", error.message, error.stack);
      throw new Error(`Failed to get recommendations: ${error.message}`);
    }

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
    console.error("[App Proxy] Error:", error.message);
    console.error("[App Proxy] Stack trace:", error.stack);
    return new Response(
      JSON.stringify({ success: false, error: error.message, stack: error.stack }),
      { status: 500, headers }
    );
  }
}

// 处理 POST 请求
export async function action({ request }) {
  return loader({ request });
}
