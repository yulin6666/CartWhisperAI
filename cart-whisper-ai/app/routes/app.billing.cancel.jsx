/**
 * 取消订阅路由
 */

import { json, redirect } from 'react-router';
import { authenticate } from '../shopify.server';
import { cancelSubscription } from '../utils/billing.server';

export async function action({ request }) {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  try {
    await cancelSubscription(admin, shop);
    return redirect('/app?cancelled=true');
  } catch (error) {
    console.error('[Billing Cancel] Error:', error);
    return json({ error: error.message }, { status: 500 });
  }
}

export async function loader() {
  // 不允许GET请求
  return redirect('/app');
}

export default function BillingCancel() {
  return null;
}
