/**
 * 订阅支付回调路由
 * 用户完成支付后Shopify会重定向到这里
 */

import { redirect } from 'react-router';
import { authenticate } from '../shopify.server';
import { confirmSubscription } from '../utils/billing.server';

export async function loader({ request }) {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  try {
    // 确认订阅状态
    const confirmed = await confirmSubscription(admin, shop);

    if (confirmed) {
      // 订阅成功，重定向到Dashboard
      return redirect('/app?upgraded=true');
    } else {
      // 订阅未激活，重定向到Dashboard并显示错误
      return redirect('/app?upgrade_failed=true');
    }
  } catch (error) {
    console.error('[Billing Callback] Error:', error);
    return redirect('/app?upgrade_error=true');
  }
}

export default function BillingCallback() {
  return null;
}
