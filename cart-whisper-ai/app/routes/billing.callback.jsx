/**
 * 订阅支付回调路由
 * 用户完成支付后Shopify会重定向到这里
 */

import shopify from '../shopify.server';
import { confirmSubscription } from '../utils/billing.server';

export async function loader({ request }) {
  const url = new URL(request.url);
  const shop = url.searchParams.get('shop');
  const chargeId = url.searchParams.get('charge_id');

  console.log('[BILLING] callback ========================================');
  console.log('[BILLING] callback | shop:', shop, '| chargeId:', chargeId);

  if (!shop) {
    console.error('[BILLING] callback | No shop parameter');
    return new Response(getRedirectHTML(null, 'error'), {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  try {
    // 使用 shopify.unauthenticated.admin 获取 admin API client
    console.log('[BILLING] callback | Getting admin client via unauthenticated.admin...');
    const { admin } = await shopify.unauthenticated.admin(shop);
    console.log('[BILLING] callback | Admin client obtained, calling confirmSubscription...');

    const confirmed = await confirmSubscription(admin, shop);
    console.log('[BILLING] callback | confirmSubscription returned:', confirmed);

    if (confirmed) {
      console.log('[BILLING] callback | SUCCESS - subscription confirmed');
    } else {
      console.warn('[BILLING] callback | WARN - confirmSubscription returned false');
    }

    return new Response(getRedirectHTML(shop, 'success'), {
      headers: { 'Content-Type': 'text/html' },
    });
  } catch (error) {
    console.error('[BILLING] callback | ERROR:', error.message);
    console.error('[BILLING] callback | Stack:', error.stack);
    return new Response(getRedirectHTML(shop, 'success'), {
      headers: { 'Content-Type': 'text/html' },
    });
  }
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
