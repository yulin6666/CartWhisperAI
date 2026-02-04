/**
 * 订阅支付回调路由
 * 用户完成支付后Shopify会重定向到这里
 */

import { sessionStorage } from '../shopify.server';
import { confirmSubscription } from '../utils/billing.server';
import shopify from '../shopify.server';

export async function loader({ request }) {
  const url = new URL(request.url);
  const shop = url.searchParams.get('shop');
  const chargeId = url.searchParams.get('charge_id');

  console.log('[Billing Callback] Received callback:', { shop, chargeId, url: url.toString() });

  if (!shop) {
    console.error('[Billing Callback] No shop parameter in callback URL');
    return new Response(getRedirectHTML(null, 'error'), {
      headers: { 'Content-Type': 'text/html' },
    });
  }

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
    const admin = new shopify.clients.Graphql({ session });

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
    console.error('[Billing Callback] Error stack:', error.stack);
    // 即使出错，也返回 HTML 页面重定向
    return new Response(getRedirectHTML(shop, 'error'), {
      headers: { 'Content-Type': 'text/html' },
    });
  }
}

function getRedirectHTML(shop, status) {
  const message = status === 'success'
    ? 'Subscription confirmed! Redirecting...'
    : status === 'failed'
    ? 'Subscription not confirmed. Redirecting...'
    : 'Processing subscription. Redirecting...';

  const redirectUrl = shop
    ? `https://${shop}/admin/apps`
    : '/app';

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Processing Subscription</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: #f6f6f7;
          }
          .container {
            text-align: center;
            padding: 40px;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          }
          .spinner {
            border: 3px solid #f3f3f3;
            border-top: 3px solid #5c6ac4;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 0 auto 20px;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          h2 {
            color: #202223;
            margin: 0 0 10px;
          }
          p {
            color: #6d7175;
            margin: 0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="spinner"></div>
          <h2>${message}</h2>
          <p>Please wait...</p>
        </div>
        <script>
          // 等待1秒后重定向，让用户看到确认消息
          setTimeout(function() {
            window.top.location.href = '${redirectUrl}';
          }, 1000);
        </script>
      </body>
    </html>
  `;
}

export default function BillingCallback() {
  return null;
}
