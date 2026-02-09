/**
 * 订阅支付回调路由
 * 用户完成支付后Shopify会重定向到这里
 */

import shopify from '../shopify.server';
import { confirmSubscription } from '../utils/billing.server';

export async function loader({ request }) {
  const url = new URL(request.url);
  const shop = url.searchParams.get('shop');

  // 验证 shop 参数格式，防止 XSS
  if (!shop || !/^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/.test(shop)) {
    return new Response(getRedirectHTML(null, 'error'), {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  try {
    const { admin } = await shopify.unauthenticated.admin(shop);
    await confirmSubscription(admin, shop);

    return new Response(getRedirectHTML(shop, 'success'), {
      headers: { 'Content-Type': 'text/html' },
    });
  } catch (error) {
    return new Response(getRedirectHTML(shop, 'error'), {
      headers: { 'Content-Type': 'text/html' },
    });
  }
}

function getRedirectHTML(shop, status) {
  const message = status === 'success'
    ? 'Subscription confirmed!'
    : status === 'error'
    ? 'Something went wrong. Please try again.'
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
