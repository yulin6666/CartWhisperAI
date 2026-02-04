/**
 * 订阅支付回调路由
 * 用户完成支付后Shopify会重定向到这里
 */

import { redirect } from 'react-router';
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
    return redirect('/app?upgrade_error=true');
  }

  try {
    // 从 sessionStorage 中获取 offline session
    const sessionId = shopify.session.getOfflineId(shop);
    const session = await sessionStorage.loadSession(sessionId);

    if (!session) {
      console.error('[Billing Callback] No session found for shop:', shop);
      // 重定向到 auth 路由，重新建立 session
      return redirect(`/auth?shop=${shop}`);
    }

    console.log('[Billing Callback] Found session for shop:', shop);

    // 使用 session 创建 admin API 客户端
    const admin = new shopify.clients.Graphql({ session });

    // 确认订阅状态
    const confirmed = await confirmSubscription(admin, shop);

    if (confirmed) {
      console.log('[Billing Callback] Subscription confirmed, redirecting to app');
      // 重定向到 Shopify Admin 的 App 页面
      return redirect(`https://${shop}/admin/apps?upgraded=true`);
    } else {
      console.log('[Billing Callback] Subscription not confirmed');
      return redirect(`https://${shop}/admin/apps?upgrade_failed=true`);
    }
  } catch (error) {
    console.error('[Billing Callback] Error:', error);
    return redirect(`https://${shop}/admin/apps?upgrade_error=true`);
  }
}

export default function BillingCallback() {
  return null;
}
