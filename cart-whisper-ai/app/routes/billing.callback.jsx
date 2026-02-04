/**
 * 订阅支付回调路由
 * 用户完成支付后Shopify会重定向到这里
 */

// import { sessionStorage } from '../shopify.server';
// import { confirmSubscription } from '../utils/billing.server';
// import shopify from '../shopify.server';
// import { restResources } from "@shopify/shopify-api/rest/admin/2025-01";

export async function loader({ request }) {
  const url = new URL(request.url);
  const shop = url.searchParams.get('shop');
  const chargeId = url.searchParams.get('charge_id');

  console.log('[Billing Callback] Received callback:', { shop, chargeId, url: url.toString() });

  // 先直接返回 HTML 测试
  if (!shop) {
    console.error('[Billing Callback] No shop parameter in callback URL');
    return new Response(getRedirectHTML(null, 'error'), {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  console.log('[Billing Callback] Returning test HTML');
  return new Response(getRedirectHTML(shop, 'success'), {
    headers: { 'Content-Type': 'text/html' },
  });

  /* 暂时注释掉，先测试 HTML 是否能正常显示
  try {
    // 从 sessionStorage 中获取 offline session
    // Offline session ID 格式：offline_{shop}
    const sessionId = `offline_${shop}`;
    console.log('[Billing Callback] Looking for session:', sessionId);

    const session = await sessionStorage.loadSession(sessionId);

    if (!session) {
      console.error('[Billing Callback] No session found for shop:', shop);
      // 如果没有 session，返回 HTML 页面重定向到 Shopify Admin
      return new Response(getRedirectHTML(shop, 'no_session'), {
        headers: { 'Content-Type': 'text/html' },
      });
    }

    console.log('[Billing Callback] Found session for shop:', shop);

    // 使用 session 创建 admin API 客户端
    const admin = new shopify.clients.Graphql({
      session,
      apiVersion: '2025-01'
    });

    console.log('[Billing Callback] Created GraphQL client');

    // 确认订阅状态
    console.log('[Billing Callback] Confirming subscription...');
    const confirmed = await confirmSubscription(admin, shop);

    if (confirmed) {
      console.log('[Billing Callback] Subscription confirmed');
      return new Response(getRedirectHTML(shop, 'success'), {
        headers: { 'Content-Type': 'text/html' },
      });
    } else {
      console.log('[Billing Callback] Subscription not confirmed');
      return new Response(getRedirectHTML(shop, 'failed'), {
        headers: { 'Content-Type': 'text/html' },
      });
    }
  } catch (error) {
    console.error('[Billing Callback] Error:', error);
    console.error('[Billing Callback] Error message:', error.message);
    console.error('[Billing Callback] Error stack:', error.stack);
    // 即使出错，也返回 HTML 页面重定向
    return new Response(getRedirectHTML(shop, 'error'), {
      headers: { 'Content-Type': 'text/html' },
    });
  }
  */
}

function getRedirectHTML(shop, status) {
  const message = status === 'success'
    ? 'Subscription confirmed!'
    : status === 'failed'
    ? 'Subscription not confirmed'
    : 'Processing subscription...';

  const redirectUrl = shop
    ? `https://${shop}/admin/apps`
    : '/app';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Processing</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: #fafafa;
    }
    .container {
      text-align: center;
    }
    .spinner {
      border: 2px solid #e0e0e0;
      border-top: 2px solid #5c6ac4;
      border-radius: 50%;
      width: 32px;
      height: 32px;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 16px;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    h2 {
      color: #202223;
      margin: 0;
      font-size: 16px;
      font-weight: 500;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner"></div>
    <h2>${message}</h2>
  </div>
  <script>
    setTimeout(function() {
      try {
        window.top.location.href = '${redirectUrl}';
      } catch (e) {
        window.location.href = '${redirectUrl}';
      }
    }, 1500);
  </script>
</body>
</html>`;
}

// 不需要 default export，因为我们在 loader 中直接返回 HTML Response
