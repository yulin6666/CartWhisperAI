import { getApiKey } from "../utils/shopConfig.server";
import { getRecommendations, healthCheck, BACKEND_URL } from "../utils/backendApi.server";
import { authenticate } from "../shopify.server";
import { getPlanFeatures } from "../utils/billing.server";

/**
 * App Proxy 处理器
 * 处理来自商店前端通过 Shopify App Proxy 的请求
 *
 * 路径格式: /apps/chat-proxy/recommendations?product_id=xxx
 * Shopify 会将请求转发到: /api/proxy/recommendations?product_id=xxx
 */
export async function loader({ request }) {
  // 验证 Shopify App Proxy 签名
  const { liquid, session } = await authenticate.public.appProxy(request);

  const url = new URL(request.url);
  const path = url.pathname.replace("/api/proxy", "");

  // 动态 CORS origin
  const origin = request.headers.get("Origin") || "";
  const allowedOrigin = (origin.endsWith(".myshopify.com") || origin.endsWith(".shopify.com"))
    ? origin
    : undefined;

  const headers = {
    "Content-Type": "application/json",
    ...(allowedOrigin && { "Access-Control-Allow-Origin": allowedOrigin }),
  };

  // 处理推荐请求: /recommendations
  if (path === "/recommendations" || path.startsWith("/recommendations")) {
    return handleRecommendations(request, headers, session);
  }

  // 处理追踪请求: /tracking/impression 和 /tracking/click
  if (path === "/tracking/impression" || path === "/tracking/click") {
    return handleTracking(request, path, headers);
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
          backend: { status: "error" }
        }),
        { status: 200, headers }
      );
    }
  }

  return new Response(
    JSON.stringify({ error: "Not found" }),
    { status: 404, headers }
  );
}

/**
 * 处理推荐请求
 */
async function handleRecommendations(request, headers, session) {
  try {
    const url = new URL(request.url);

    const productId = url.searchParams.get("product_id");
    const shop = session?.shop || url.searchParams.get("shop");

    if (!productId) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing product_id parameter" }),
        { status: 400, headers }
      );
    }

    // Validate product_id format (must be numeric Shopify product ID)
    if (!/^\d+$/.test(productId)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid product_id format" }),
        { status: 400, headers }
      );
    }

    if (!shop) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing shop parameter" }),
        { status: 400, headers }
      );
    }

    // 获取订阅计划并限制推荐数量
    const planFeatures = await getPlanFeatures(shop);
    const maxRecommendations = planFeatures.recommendationsPerProduct || 1;
    const showWatermark = planFeatures.showWatermark !== false;

    const limit = Math.min(
      Math.max(parseInt(url.searchParams.get("limit") || "3", 10) || 3, 1),
      maxRecommendations
    );

    // 获取 API Key
    let apiKey;
    try {
      apiKey = await getApiKey(shop);
    } catch (error) {
      throw new Error("Failed to get API key");
    }

    // 从后端获取推荐
    let result;
    try {
      result = await getRecommendations(apiKey, productId, limit);
    } catch (error) {
      throw new Error("Failed to get recommendations");
    }

    // 格式化返回数据
    let formattedRecommendations = (result.recommendations || []).map((rec) => ({
      id: `gid://shopify/Product/${rec.id}`,
      numericId: rec.id,
      handle: rec.handle,
      title: rec.title,
      price: rec.price,
      image: rec.image,
      reasoning: rec.reason,
    }));

    // 确保不超过订阅计划允许的数量
    if (formattedRecommendations.length > maxRecommendations) {
      formattedRecommendations = formattedRecommendations.slice(0, maxRecommendations);
    }

    return new Response(
      JSON.stringify({
        success: true,
        productId,
        shop,
        count: formattedRecommendations.length,
        recommendations: formattedRecommendations,
        maxRecommendations,
        showWatermark,
        fromCache: result.fromCache || false,
        cacheWarning: result.cacheWarning,
      }),
      { status: 200, headers }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers }
    );
  }
}

/**
 * 处理追踪请求（转发到后端）
 */
async function handleTracking(request, path, headers) {
  try {
    const body = await request.text();

    const backendPath = path === "/tracking/impression"
      ? "/api/tracking/impression"
      : "/api/tracking/click";

    const backendResponse = await fetch(`${BACKEND_URL}${backendPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    const data = await backendResponse.json().catch(() => ({ success: true }));

    return new Response(
      JSON.stringify(data),
      { status: backendResponse.status, headers }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false }),
      { status: 500, headers }
    );
  }
}

// 处理 POST 请求
export async function action({ request }) {
  return loader({ request });
}
