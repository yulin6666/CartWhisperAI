import { useLoaderData, Link, useFetcher, useRevalidator } from 'react-router';
import { useState, useEffect, useMemo, memo, useCallback } from 'react';
import { authenticate } from '../shopify.server';
import styles from './app._index/styles.module.css';
import { BACKEND_URL, getSyncStatus, getStatistics } from '../utils/backendApi.server';
import { getApiKey } from '../utils/shopConfig.server';
import { getSubscription, getPlanFeatures, getCurrentPlan } from '../utils/billing.server';

export async function loader({ request }) {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);

  let apiKey = null;
  let recommendations = [];
  let stats = {};
  let syncStatus = null;
  let statistics = null;
  let error = null;
  let subscription = null;
  let planFeatures = null;
  let currentPlan = 'FREE';

  try {
    // 获取订阅信息
    subscription = await getSubscription(shop);
    planFeatures = await getPlanFeatures(shop);
    currentPlan = await getCurrentPlan(shop);

    apiKey = await getApiKey(shop, admin);

    if (apiKey) {
      // 同步计划状态到后端（仅在计划变更时执行，而不是每次页面加载）
      // 注释掉自动同步，改为仅在升级/降级时同步
      /*
      try {
        const planData = {
          plan: currentPlan.toLowerCase(),
          manualRefreshPerMonth: planFeatures?.manualRefreshPerMonth || 0,
          maxProducts: planFeatures?.maxProducts || 50,
          apiCallsPerDay: planFeatures?.apiCallsPerDay || 5000,
        };
        await fetch(`${BACKEND_URL}/api/shops/${shop}/plan`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(planData),
        });
        console.log('[Home] Synced plan to backend:', currentPlan, 'with features:', planData);
      } catch (e) {
        console.error('[Home] Failed to sync plan to backend:', e.message);
      }
      */

      // 获取同步状态（包含 API 使用量）
      const statusResult = await getSyncStatus(apiKey);
      syncStatus = statusResult.syncStatus;
      console.log('[Home] Full syncStatus from backend:', JSON.stringify(syncStatus, null, 2));

      // 获取所有推荐数据
      const res = await fetch(`${BACKEND_URL}/api/recommendations`, {
        headers: { 'X-API-Key': apiKey },
      });
      if (res.ok) {
        const data = await res.json();
        recommendations = data.recommendations || [];
        stats = data.stats || {};
      }

      // 获取统计数据
      try {
        const statsResult = await getStatistics(apiKey);
        statistics = statsResult.statistics;
      } catch (e) {
        console.log('[Home] Error getting statistics:', e.message);
      }
    }
  } catch (e) {
    error = e.message;
  }

  // Fetch global quota settings (test mode only)
  let globalQuota = null;
  if (process.env.NODE_ENV === 'development') {
    try {
      const quotaRes = await fetch(`${BACKEND_URL}/api/admin/global-quota`);
      if (quotaRes.ok) {
        globalQuota = await quotaRes.json();
      }
    } catch (e) {
      console.log('[Home] Error getting global quota:', e.message);
    }
  }

  return {
    shop,
    backendUrl: BACKEND_URL,
    isRegistered: !!apiKey,
    recommendations,
    stats,
    syncStatus,
    statistics,
    subscription,
    planFeatures,
    currentPlan,
    error,
    globalQuota,
    // 查询参数用于显示通知
    upgraded: url.searchParams.get('upgraded') === 'true',
    upgradeFailed: url.searchParams.get('upgrade_failed') === 'true',
    cancelled: url.searchParams.get('cancelled') === 'true',
    isTestMode: process.env.NODE_ENV === 'development',
  };
}

// Action: Handle reset API usage and reset refresh
export const action = async ({ request }) => {
  const formData = await request.formData();
  const actionType = formData.get('_action');
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  if (actionType === 'resetApiUsage') {
    try {
      const response = await fetch(`${BACKEND_URL}/api/shops/${shop}/plan`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiCallsToday: 0 }),
      });

      if (!response.ok) throw new Error('Failed to reset API usage');
      return { success: true, action: 'resetApiUsage' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  if (actionType === 'resetRefresh') {
    try {
      const response = await fetch(`${BACKEND_URL}/api/shops/${shop}/plan`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lastRefreshAt: null }),
      });

      if (!response.ok) {
        throw new Error('Failed to reset refresh time');
      }

      return { success: true, action: 'resetRefresh' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  if (actionType === 'updateGlobalQuota') {
    try {
      const dailyTokenQuota = parseInt(formData.get('dailyTokenQuota'));

      if (!dailyTokenQuota || dailyTokenQuota < 0) {
        return { success: false, error: 'Invalid quota value' };
      }

      const response = await fetch(`${BACKEND_URL}/api/admin/global-quota`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dailyTokenQuota }),
      });

      if (!response.ok) {
        throw new Error('Failed to update global quota');
      }

      return { success: true, action: 'updateGlobalQuota', dailyTokenQuota };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  return null;
};

// ===== Reusable Components =====

// Notification Component
const Notification = memo(({ notification, onClose }) => {
  if (!notification) return null;

  return (
    <div className={`${styles.notification} ${
      notification.type === 'success' ? styles.notificationSuccess :
      notification.type === 'error' ? styles.notificationError :
      styles.notificationInfo
    }`}>
      <span>{notification.message}</span>
      <button onClick={onClose} className={styles.notificationClose}>
        ×
      </button>
    </div>
  );
});
Notification.displayName = 'Notification';

// Stats Grid Component
const StatsGrid = memo(({ syncStatus, recommendations, statistics }) => {
  return (
    <div className={styles.statsGrid}>
      {/* Card 1: Recommendations */}
      <div className={styles.statCard}>
        <div className={styles.statLabel}>
          Recommendations
        </div>
        <div className={styles.statValue}>
          {(syncStatus?.recommendationCount || recommendations.length || 0).toLocaleString()}
        </div>
      </div>

      {/* Card 2: Total Clicks */}
      <div className={styles.statCard}>
        <div className={styles.statLabelWithBadge}>
          <span className={styles.statLabel} style={{ marginBottom: 0 }}>
            Total Clicks
          </span>
          <span className={styles.statBadgeLive}>
            LIVE
          </span>
        </div>
        <div className={`${styles.statValue} ${styles.statValueWithMargin}`}>
          {(statistics?.summary?.totalClicks || 0).toLocaleString()}
        </div>
        <p className={styles.statDescription}>
          Users clicked Recommendations
        </p>
      </div>

      {/* Card 3: Avg. Click-Through Rate */}
      <div className={styles.statCard}>
        <div className={styles.statLabel}>
          Avg. Click-Through Rate
        </div>
        <div className={styles.statValue}>
          {statistics?.summary?.ctr || 0}%
        </div>
      </div>
    </div>
  );
});
StatsGrid.displayName = 'StatsGrid';

// Sync Progress Component
const SyncProgress = memo(({ isAnySyncing }) => {
  if (!isAnySyncing) return null;

  return (
    <div className={styles.syncProgress}>
      <div className={styles.syncProgressHeader}>
        <div className={styles.syncProgressTitle}>
          <span>⏳</span>
          <span>Syncing in progress...</span>
        </div>
        <span className={styles.syncProgressTime}>
          This may take up to 30 minutes
        </span>
      </div>
      <div className={styles.syncProgressBar}>
        <div className={styles.syncProgressBarFill}>
          <style>{`
            @keyframes pulse {
              0% { opacity: 0.6; }
              50% { opacity: 1; }
              100% { opacity: 0.6; }
            }
          `}</style>
        </div>
      </div>
    </div>
  );
});
SyncProgress.displayName = 'SyncProgress';

// Sync Notice Component
const SyncNotice = memo(({ isBackendSyncing, optimisticSyncing }) => {
  if (!isBackendSyncing && !optimisticSyncing) return null;

  return (
    <div className={styles.syncNotice}>
      <div className={styles.syncNoticeIcon}>
        ⏳
      </div>
      <div className={styles.syncNoticeContent}>
        <div className={styles.syncNoticeTitle}>
          Sync in Progress
        </div>
        <div className={styles.syncNoticeText}>
          Your products are being synced in the background. This may take up to 30 minutes.
          Page will auto-refresh every 45 seconds to update progress.
        </div>
      </div>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
});
SyncNotice.displayName = 'SyncNotice';

// Sync Result Component
const SyncResult = memo(({ syncFetcherData, formatDate }) => {
  if (!syncFetcherData) return null;

  return (
    <div className={`${styles.syncResult} ${
      syncFetcherData.success ? styles.syncResultSuccess :
      syncFetcherData.rateLimited ? styles.syncResultWarning :
      syncFetcherData.tokenQuotaExceeded ? styles.syncResultQuota :
      styles.syncResultError
    }`}>
      {syncFetcherData.success ? (
        <>
          {syncFetcherData.async ? (
            <>
              <h3 className={`${styles.syncResultTitle} ${styles.syncResultTitleSuccess}`}>
                ✅ Sync Started in Background
              </h3>
              <div className={`${styles.syncResultText} ${styles.syncResultTextSuccess}`}>
                <p style={{ margin: '5px 0' }}>
                  <strong>Products being synced:</strong> {syncFetcherData.productsCount}
                </p>
                <p style={{ margin: '5px 0' }}>
                  <strong>Estimated completion:</strong> {syncFetcherData.estimatedCompletionTime}
                </p>
                <p style={{ margin: '15px 0 5px 0', fontSize: '15px', fontWeight: '600' }}>
                  💡 Please refresh this page in 30 minutes to see the results.
                </p>
              </div>
            </>
          ) : (
            <>
              <h3 className={`${styles.syncResultTitle} ${styles.syncResultTitleSuccess}`}>
                ✅ Sync Completed!
              </h3>
              <div className={`${styles.syncResultText} ${styles.syncResultTextSuccess}`}>
                <p style={{ margin: '5px 0' }}>
                  <strong>Products:</strong> {syncFetcherData.productsCount}
                </p>
                <p style={{ margin: '5px 0' }}>
                  <strong>Recommendations:</strong> {syncFetcherData.recommendationsCount}
                </p>
                <p style={{ margin: '5px 0' }}>
                  <strong>Duration:</strong> {syncFetcherData.duration}
                </p>
              </div>
            </>
          )}
        </>
      ) : syncFetcherData.rateLimited ? (
        <>
          <h3 className={`${styles.syncResultTitle} ${styles.syncResultTitleWarning}`}>⏰ Resync Rate Limited</h3>
          <p className={`${styles.syncResultText} ${styles.syncResultTextWarning}`}>
            You have reached your monthly resync limit.
          </p>
          <p className={`${styles.syncResultText} ${styles.syncResultTextWarning}`} style={{ fontSize: '14px' }}>
            Next resync available: <strong>{formatDate(syncFetcherData.nextRefreshAt)}</strong>
          </p>
        </>
      ) : syncFetcherData.tokenQuotaExceeded ? (
        <>
          <h3 className={`${styles.syncResultTitle} ${styles.syncResultTitleQuota}`}>🎫 Daily Token Quota Exceeded</h3>
          <p className={`${styles.syncResultText} ${styles.syncResultTextQuota}`} style={{ fontSize: '15px' }}>
            You have used all your free tokens for today. Please try again tomorrow.
          </p>
          <p className={`${styles.syncResultText} ${styles.syncResultTextQuota}`} style={{ margin: '10px 0 5px 0', fontSize: '14px' }}>
            Quota resets at: <strong>{formatDate(syncFetcherData.quotaResetDate)}</strong>
          </p>
          <p className={`${styles.syncResultText} ${styles.syncResultTextQuota}`} style={{ margin: '10px 0 0 0', fontSize: '13px' }}>
            💡 Want unlimited tokens? Upgrade to PRO or MAX plan!
          </p>
        </>
      ) : (
        <>
          <h3 className={`${styles.syncResultTitle} ${styles.syncResultTitleError}`}>❌ Sync Failed</h3>
          <p className={`${styles.syncResultText} ${styles.syncResultTextError}`}>
            {syncFetcherData.error || 'Unknown error occurred'}
          </p>
        </>
      )}
    </div>
  );
});
SyncResult.displayName = 'SyncResult';

// FREE Plan Banner Component
const FreePlanBanner = memo(({ onUpgrade, billingFetcherState }) => {
  return (
    <div className={styles.freePlanBanner}>
      <div className={styles.freePlanBannerRow}>
        <h2 className={styles.freePlanBannerTitle}>
          Unlock Your Store's Full Revenue Potential
        </h2>
        <div className={styles.freePlanBannerActions}>
          <button
            onClick={onUpgrade}
            disabled={billingFetcherState === 'submitting'}
            className={`${styles.button} ${styles.buttonSecondary}`}
            style={{ cursor: billingFetcherState === 'submitting' ? 'not-allowed' : 'pointer' }}
          >
            {billingFetcherState === 'submitting' ? 'Processing...' : (
              <>Upgrade to PRO <span>⚡</span></>
            )}
          </button>
          <Link to="/app/billing?view=plans" className={styles.link}>
            Need unlimited scale? View MAX Plan →
          </Link>
        </div>
      </div>
      <div className={styles.freePlanBannerFeatures}>
        <div className={styles.freePlanBannerFeature}>
          <span style={{ fontSize: '20px' }}>✓</span>
          <span>Sync 2,000 Products</span>
        </div>
        <div className={styles.freePlanBannerFeature}>
          <span style={{ fontSize: '20px' }}>✓</span>
          <span>3 Recommendations / Popup</span>
        </div>
        <div className={styles.freePlanBannerFeature}>
          <span style={{ fontSize: '20px' }}>✓</span>
          <span>no watermark</span>
        </div>
      </div>
    </div>
  );
});
FreePlanBanner.displayName = 'FreePlanBanner';

// Sync Card Component (STEP 1)
const SyncCard = memo(({ syncStatus, planFeatures, isAnySyncing, formatDate, syncFetcherForm }) => {
  return (
    <div className={`${styles.card} ${styles.cardLarge} ${styles.syncCard}`}>
      <div className={styles.syncCardLeft}>
        <div className={styles.syncCardHeader}>
          <span className={styles.stepBadge}>STEP 1</span>
          <h3 className={styles.syncCardTitle}>Sync your product catalog</h3>
        </div>
        <p className={styles.syncCardDescription}>
          CartWhisper needs to analyze your products to generate AI recommendations. This usually takes less than a minute.
        </p>
      </div>
      <div className={styles.syncCardMiddle}>
        <div className={styles.syncCardAllowanceLabel}>FREE ALLOWANCE</div>
        <div className={styles.syncCardAllowanceValue}>
          {syncStatus?.productCount || 0}
          <span className={styles.syncCardAllowanceLimit}> / {planFeatures?.maxProducts || 50}</span>
        </div>
      </div>
      <div className={styles.syncCardRight}>
        {syncFetcherForm}
      </div>
    </div>
  );
});
SyncCard.displayName = 'SyncCard';

// PRO Plan Usage Card Component
const ProPlanUsageCard = memo(({ syncStatus, planFeatures, isTestMode, onUpgrade, billingFetcherState }) => {
  return (
    <div className={styles.card}>
      <div className={styles.usageCard}>
        <h2 className={styles.usageTitle}>Pro Plan Usage</h2>
        <div className={styles.usageCount}>
          {syncStatus?.productCount || 0} / {planFeatures?.maxProducts?.toLocaleString() || '2,000'} Products
        </div>
      </div>
      <div className={styles.progressBar}>
        <div className={`${styles.progressBarFill} ${styles.progressBarFillPro}`} style={{
          width: `${Math.min(((syncStatus?.productCount || 0) / (planFeatures?.maxProducts || 2000)) * 100, 100)}%`
        }} />
      </div>
      <div className={styles.usageFooter}>
        {isTestMode ? (
          <Link to="/app/billing?view=plans" className={styles.linkPrimary}>
            Need more capacity? Upgrade to MAX (Unlimited) →
          </Link>
        ) : (
          <button
            onClick={onUpgrade}
            disabled={billingFetcherState === 'submitting'}
            className={styles.buttonLink}
            style={{ cursor: billingFetcherState === 'submitting' ? 'not-allowed' : 'pointer' }}
          >
            Need more capacity? Upgrade to MAX (Unlimited) →
          </button>
        )}
      </div>
    </div>
  );
});
ProPlanUsageCard.displayName = 'ProPlanUsageCard';

// MAX Plan Usage Card Component
const MaxPlanUsageCard = memo(({ syncStatus }) => {
  return (
    <div className={styles.card}>
      <div className={styles.usageCard}>
        <h2 className={styles.usageTitle}>MAX Plan Usage</h2>
        <div className={styles.usageCount}>
          {syncStatus?.productCount?.toLocaleString() || 0} / ∞ Products
        </div>
      </div>
      <div className={styles.progressBar}>
        <div className={`${styles.progressBarFill} ${styles.progressBarFillMax}`} style={{ width: '30%' }} />
      </div>
    </div>
  );
});
MaxPlanUsageCard.displayName = 'MaxPlanUsageCard';

// Products Table Component
const ProductsTable = memo(({ groupedProducts, visibleProducts, currentPlan, recommendations, onShowMore }) => {
  if (groupedProducts.length === 0) {
    return (
      <div className={styles.productsEmpty}>
        <div className={styles.productsEmptyIcon}>📦</div>
        <p className={styles.productsEmptyText}>
          No products synced yet. Click "Resync" to get started.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead className={styles.tableHead}>
            <tr>
              <th className={styles.tableHeader}>TRIGGER PRODUCT</th>
              <th className={styles.tableHeader}>RECOMMENDATIONS</th>
              <th className={`${styles.tableHeader} ${styles.tableHeaderCenter}`}>STATUS</th>
            </tr>
          </thead>
          <tbody>
            {groupedProducts.slice(0, visibleProducts).map((group, idx) => {
              // For FREE plan, get all recommendations (up to 3) for display
              const displayRecommendations = currentPlan === 'free'
                ? recommendations
                    .filter(rec => rec.sourceProductId === group.product.id)
                    .slice(0, 3)
                    .map(rec => ({
                      id: rec.targetProductId,
                      title: rec.targetTitle,
                      image: rec.targetImage,
                      reason: rec.reason?.split('|')[0] || 'Related Product'
                    }))
                : group.recommendations;

              return (
                <tr key={idx} className={styles.tableRow}>
                  {/* Trigger Product */}
                  <td className={styles.tableCell}>
                    <div className={styles.productDisplay}>
                      {group.product.image ? (
                        <img
                          src={group.product.image}
                          alt={group.product.title}
                          className={styles.productImage}
                        />
                      ) : (
                        <div className={styles.productImagePlaceholder}>📦</div>
                      )}
                      <div className={styles.productInfo}>
                        <div className={styles.productTitle}>{group.product.title}</div>
                        <div className={styles.productId}>ID: {group.product.id}</div>
                      </div>
                    </div>
                  </td>

                  {/* Recommendations */}
                  <td className={styles.tableCellTop}>
                    <div className={styles.recommendationsList}>
                      {displayRecommendations.map((rec, recIdx) => (
                        <div
                          key={recIdx}
                          className={`${styles.recommendationItem} ${
                            recIdx === 0 ? styles.recommendationItemFirst : styles.recommendationItemOther
                          } ${currentPlan === 'free' && recIdx > 0 ? 'locked-recommendation' : ''}`}
                        >
                          <div className={styles.recommendationContent}>
                            {rec.image ? (
                              <img
                                src={rec.image}
                                alt={rec.title}
                                className={styles.productImage}
                              />
                            ) : (
                              <div className={styles.productImagePlaceholder}>📦</div>
                            )}
                            <div className={styles.recommendationText}>
                              <div className={styles.recommendationTitle}>{rec.title}</div>
                              <div className={styles.recommendationReason}>{rec.reason}</div>
                            </div>
                          </div>

                          {/* Lock Overlay for FREE plan (2nd and 3rd recommendations) */}
                          {currentPlan === 'free' && recIdx > 0 && (
                            <>
                              <div className={styles.lockOverlay} />
                              <div className={styles.lockMessage}>
                                <span style={{ fontSize: '14px' }}>🔒</span>
                                {recIdx === 1 ? 'Upgrade to unlock these 2 items' : ''}
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </td>

                  {/* Status */}
                  <td className={`${styles.tableCell} ${styles.tableCellCenter}`}>
                    <span className={`${styles.statusBadge} ${styles.statusBadgeActive}`}>
                      Active
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Show More Button */}
      {visibleProducts < groupedProducts.length && (
        <div className={styles.showMoreWrapper}>
          <button onClick={onShowMore} className={styles.buttonSmall}>
            Show More ({groupedProducts.length - visibleProducts} remaining)
          </button>
        </div>
      )}
    </>
  );
});
ProductsTable.displayName = 'ProductsTable';

export default function Index() {
  const {
    shop,
    backendUrl,
    isRegistered,
    recommendations,
    stats,
    syncStatus,
    statistics,
    subscription,
    planFeatures,
    currentPlan: loaderPlan,
    error,
    globalQuota,
    upgraded,
    upgradeFailed,
    cancelled,
    isTestMode,
  } = useLoaderData();

  const planFetcher = useFetcher();
  const billingFetcher = useFetcher();
  const syncFetcher = useFetcher();
  const resetFetcher = useFetcher();
  const quotaFetcher = useFetcher();
  const revalidator = useRevalidator();

  const [showNotification, setShowNotification] = useState(null);
  const [visibleProducts, setVisibleProducts] = useState(10);

  // Initialize optimisticSyncing from sessionStorage (survives page refresh)
  const [optimisticSyncing, setOptimisticSyncing] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem('cartwhisper_syncing');
      if (stored) {
        const { timestamp, shopDomain } = JSON.parse(stored);
        // Check if it's for the current shop and within 5 minutes
        if (shopDomain === shop && Date.now() - timestamp < 5 * 60 * 1000) {
          console.log('[Optimistic] Restored syncing state from sessionStorage');
          return true;
        } else {
          // Clear stale data
          sessionStorage.removeItem('cartwhisper_syncing');
        }
      }
    }
    return false;
  });

  // Get current plan from subscription or loader
  const currentPlan = loaderPlan?.toLowerCase() || subscription?.plan || 'free';
  const isSyncing = syncFetcher.state === 'submitting';
  const isBackendSyncing = syncStatus?.isSyncing || false; // 后端正在同步
  const isAnySyncing = isSyncing || isBackendSyncing || optimisticSyncing; // Combined sync state

  // Debug: Log key state (only once on initial render when syncStatus is available)
  if (syncStatus && typeof window !== 'undefined') {
    console.log('=== DEBUG: Resync All Button State ===');
    console.log('currentPlan:', currentPlan);
    console.log('syncStatus.refreshLimit.canRefresh:', syncStatus.refreshLimit?.canRefresh);
    console.log('syncStatus.refreshLimit:', syncStatus.refreshLimit);
    console.log('syncStatus.initialSyncDone:', syncStatus.initialSyncDone);
    console.log('syncStatus.lastRefreshAt:', syncStatus.lastRefreshAt);
    console.log('Button disabled?', !syncStatus?.refreshLimit?.canRefresh);
    console.log('======================================');
  }

  // Group recommendations by source product
  const groupedProducts = useMemo(() => {
    const groups = {};

    recommendations.forEach(rec => {
      if (!groups[rec.sourceProductId]) {
        groups[rec.sourceProductId] = {
          product: {
            id: rec.sourceProductId,
            title: rec.sourceTitle,
            image: rec.sourceImage
          },
          recommendations: []
        };
      }

      groups[rec.sourceProductId].recommendations.push({
        id: rec.targetProductId,
        title: rec.targetTitle,
        image: rec.targetImage,
        reason: rec.reason?.split('|')[0] || 'Related Product', // Extract main reason
        reasonDetail: rec.reason?.split('|')[1] || '' // Optional detail
      });
    });

    // Limit recommendations per product based on plan
    Object.keys(groups).forEach(key => {
      const limit = planFeatures?.recommendationsPerProduct || 1;
      groups[key].recommendations = groups[key].recommendations.slice(0, limit);
    });

    return Object.values(groups);
  }, [recommendations, planFeatures]);

  // Consolidated revalidation effect
  useEffect(() => {
    const shouldRevalidate =
      planFetcher.data?.success ||
      resetFetcher.data?.success ||
      syncFetcher.data?.success ||
      (billingFetcher.state === 'idle' && billingFetcher.data) ||
      upgraded ||
      cancelled;

    if (shouldRevalidate) {
      revalidator.revalidate();
    }

    // Handle notifications
    if (upgraded) {
      setShowNotification({ type: 'success', message: 'Successfully upgraded to Pro Plan!' });
    } else if (upgradeFailed) {
      setShowNotification({ type: 'error', message: 'Upgrade failed. Please try again.' });
    } else if (cancelled) {
      setShowNotification({ type: 'info', message: 'Subscription cancelled. You are now on the Free Plan.' });
    }
  }, [
    planFetcher.data,
    resetFetcher.data,
    syncFetcher.data,
    billingFetcher.state,
    billingFetcher.data,
    upgraded,
    upgradeFailed,
    cancelled,
    revalidator
  ]);

  // Reset visible products count when plan or recommendations change
  useEffect(() => {
    setVisibleProducts(10);
  }, [currentPlan, recommendations.length]);

  // Handle sync completion and set optimistic state
  useEffect(() => {
    if (syncFetcher.data?.success && syncFetcher.data?.async) {
      // Async sync started, set optimistic state and persist to sessionStorage
      setOptimisticSyncing(true);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('cartwhisper_syncing', JSON.stringify({
          timestamp: Date.now(),
          shopDomain: shop
        }));
      }
      console.log('[Optimistic] Sync started, disabling button and saving to sessionStorage');
    }
  }, [syncFetcher.data, shop]);

  // Clear optimistic state when backend confirms sync is running or completed
  useEffect(() => {
    if (isBackendSyncing) {
      // Backend confirmed sync is running, clear optimistic state
      if (optimisticSyncing) {
        setOptimisticSyncing(false);
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('cartwhisper_syncing');
        }
        console.log('[Optimistic] Backend confirmed syncing, clearing optimistic state and sessionStorage');
      }
    } else if (optimisticSyncing) {
      // Check if we should clear optimistic state
      // 1. If sync completed (initialSyncDone is true and backend not syncing)
      // 2. If optimistic state is stale (more than 5 minutes old)
      const shouldClear = syncStatus?.initialSyncDone || (() => {
        if (typeof window !== 'undefined') {
          const stored = sessionStorage.getItem('cartwhisper_syncing');
          if (stored) {
            const { timestamp } = JSON.parse(stored);
            return Date.now() - timestamp > 5 * 60 * 1000; // 5 minutes
          }
        }
        return false;
      })();

      if (shouldClear) {
        setOptimisticSyncing(false);
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('cartwhisper_syncing');
        }
        console.log('[Optimistic] Clearing stale optimistic state and sessionStorage');
      }
    }
  }, [isBackendSyncing, optimisticSyncing, syncStatus?.initialSyncDone]);

  // On mount: if optimisticSyncing is true (from sessionStorage), immediately revalidate
  useEffect(() => {
    const hasOptimisticState = typeof window !== 'undefined' && sessionStorage.getItem('cartwhisper_syncing');
    if (hasOptimisticState) {
      console.log('[Optimistic] Page loaded with syncing flag, revalidating immediately');
      revalidator.revalidate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Auto-refresh when backend is syncing (optimized interval)
  useEffect(() => {
    if (isBackendSyncing || optimisticSyncing) {
      // 每45秒刷新一次，检查同步状态（从30秒优化到45秒以减少服务器负载）
      const intervalId = setInterval(() => {
        console.log('[Auto-refresh] Checking sync status...');
        revalidator.revalidate();
      }, 45000); // 45秒

      return () => clearInterval(intervalId);
    }
  }, [isBackendSyncing, optimisticSyncing, revalidator]);

  // Format date helper
  const formatDate = useCallback((dateStr) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleDateString('zh-CN', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }, []);

  const handleUpgrade = useCallback((plan = 'PRO') => {
    console.log('[Frontend] Initiating upgrade to plan:', plan);
    billingFetcher.submit(
      { action: 'upgrade', plan },
      { method: 'post', action: '/app/billing' }
    );
  }, [billingFetcher]);

  // 监听billing错误
  useEffect(() => {
    if (billingFetcher.state === 'idle' && billingFetcher.data) {
      console.log('[Frontend] Billing fetcher data:', billingFetcher.data);
      if (billingFetcher.data.error) {
        setShowNotification({
          type: 'error',
          message: `Upgrade failed: ${billingFetcher.data.error}`
        });
      }
    }
  }, [billingFetcher.state, billingFetcher.data]);

  const handleCancelSubscription = useCallback(() => {
    if (confirm('Are you sure you want to cancel your subscription? You will be downgraded to the Free Plan.')) {
      billingFetcher.submit(
        {},
        { method: 'post', action: '/app/billing/cancel' }
      );
    }
  }, [billingFetcher]);

  const handleShowMore = useCallback(() => {
    setVisibleProducts(prev => Math.min(prev + 10, groupedProducts.length));
  }, [groupedProducts.length]);

  if (!isRegistered) {
    return (
      <div className={styles.containerWelcome}>
        <h1 className={styles.welcomeTitle}>Welcome to CartWhisper AI</h1>
        <p className={styles.welcomeSubtitle}>
          Get started by syncing your products to generate AI-powered recommendations.
        </p>

        {/* Getting Started Card */}
        <div className={styles.cardWelcome}>
          <h2 className={styles.welcomeCardTitle}>🚀 Initial Setup</h2>
          <p className={styles.welcomeCardText}>
            Click the button below to sync your Shopify products and start generating recommendations.
          </p>

          <syncFetcher.Form method="post" action="/api/scan">
            <input type="hidden" name="mode" value="auto" />
            <button
              type="submit"
              disabled={isAnySyncing}
              className={`${styles.buttonWelcome} ${isAnySyncing ? styles.buttonWelcomeDisabled : styles.buttonWelcomePrimary}`}
            >
              {isAnySyncing ? (
                <>
                  <span>⏳</span> Syncing...
                </>
              ) : (
                <>🚀 Start Initial Sync</>
              )}
            </button>
          </syncFetcher.Form>

          {/* Sync Progress - Async Mode */}
          {isAnySyncing && (
            <div className={styles.syncProgressWelcome}>
              <div className={styles.syncProgressIcon}>
                ⏳
              </div>
              <h3 className={styles.syncProgressWelcomeTitle}>
                Sync Started Successfully
              </h3>
              <p className={styles.syncProgressWelcomeText}>
                Your products are being synced in the background. This process may take up to <strong>30 minutes</strong>.
                <br />
                Please refresh this page after 30 minutes to see the results.
              </p>
              <div className={styles.syncProgressTip}>
                <span style={{ fontSize: '20px' }}>💡</span>
                <span className={styles.syncProgressTipText}>
                  You can safely close this page and come back later
                </span>
              </div>
            </div>
          )}

          {/* Sync Result */}
          {syncFetcher.data && syncFetcher.data.success && (
            <div className={`${styles.syncResult} ${styles.syncResultSuccess}`}>
              <h3 className={`${styles.syncResultTitle} ${styles.syncResultTitleSuccess}`}>✅ Initial Sync Completed!</h3>
              <p className={`${styles.syncResultText} ${styles.syncResultTextSuccess}`}>
                Successfully synced <strong>{syncFetcher.data.productsCount}</strong> products and generated <strong>{syncFetcher.data.recommendationsCount}</strong> recommendations.
              </p>
              <p className={`${styles.syncResultText} ${styles.syncResultTextSuccess}`} style={{ margin: '10px 0 0 0', fontSize: '14px' }}>
                The page will reload automatically...
              </p>
            </div>
          )}
        </div>

        {/* How it works section */}
        <div className={styles.cardInfo}>
          <h3 className={styles.infoTitle}>ℹ️ How it works</h3>
          <ol className={styles.infoList}>
            <li>Click "Start Initial Sync" to fetch all products from your Shopify store</li>
            <li>Products are sent to the CartWhisper AI backend</li>
            <li>AI analyzes products and generates personalized recommendations</li>
            <li>Recommendations are stored and can be displayed in your storefront</li>
          </ol>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      <div className={styles.pageWrapper}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.headerContent}>
            {/* Left: Logo + Title */}
            <div className={styles.headerLeft}>
              <div className={styles.logo}>
                C
              </div>
              <h1 className={styles.headerTitle}>
                CartWhisper <span className={styles.headerTitleAccent}>AI</span>
              </h1>
            </div>

            {/* Right: Plan badge + Avatar */}
            <div className={styles.headerRight}>
              {currentPlan === 'free' && (
                <div className={`${styles.planBadge} ${styles.planBadgeFree}`}>
                  FREE PLAN
                </div>
              )}
              {currentPlan === 'pro' && (
                <div className={`${styles.planBadge} ${styles.planBadgePro}`}>
                  PRO PLAN
                </div>
              )}
              {currentPlan === 'max' && (
                <div className={`${styles.planBadge} ${styles.planBadgeMax}`}>
                  MAX PLAN
                </div>
              )}
              <div className={styles.avatar}>
                👤
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hero Section */}
      <div className={styles.hero}>
        <div className={styles.heroInner}>
          {/* Left: Headline and Subtext */}
          <div className={styles.heroLeft}>
            <h2 className={styles.heroHeadline}>
              Smart <span className={styles.heroAccent}>Popups.</span>
              <br />
              Bigger <span className={styles.heroAccent}>Carts.</span>
            </h2>
            <p className={styles.heroSubtext}>
              Stop losing revenue. Upgrade your standard add-to-cart popup with AI-driven upsells.
            </p>
          </div>

          {/* Right: Video Demo */}
          <div className={styles.heroRight}>
            <video
              autoPlay
              loop
              muted
              playsInline
              preload="metadata"
              className={styles.heroVideo}
            >
              <source src="/demo.mp4" type="video/mp4" />
              Your browser does not support the video tag.
            </video>
          </div>
        </div>
      </div>

      <div className={styles.container}>

      {/* Notifications */}
      <Notification
        notification={showNotification}
        onClose={() => setShowNotification(null)}
      />

      {/* Plan-Specific Banner/Usage Card */}
      {currentPlan === 'free' && (
        <FreePlanBanner
          onUpgrade={() => handleUpgrade('PRO')}
          billingFetcherState={billingFetcher.state}
        />
      )}

      {/* STEP 1: Sync Product Catalog Card */}
      <SyncCard
        syncStatus={syncStatus}
        planFeatures={planFeatures}
        isAnySyncing={isAnySyncing}
        formatDate={formatDate}
        syncFetcherForm={
          <syncFetcher.Form method="post" action="/api/scan">
            <input type="hidden" name="mode" value={syncStatus?.initialSyncDone ? 'incremental' : 'auto'} />
            <button
              type="submit"
              disabled={isAnySyncing || !syncStatus?.refreshLimit?.canRefresh}
              title={
                !syncStatus?.refreshLimit?.canRefresh
                  ? `Next refresh available: ${formatDate(syncStatus?.refreshLimit?.nextRefreshAt)}`
                  : isAnySyncing
                  ? 'Syncing in progress...'
                  : 'Click to sync products'
              }
              className={`${styles.button} ${isAnySyncing || !syncStatus?.refreshLimit?.canRefresh ? styles.buttonDisabled : styles.buttonPrimary}`}
            >
              {isAnySyncing ? (
                <>
                  <span className={styles.spinner}></span>
                  Syncing...
                </>
              ) : (
                <>
                  <span style={{ fontSize: '20px' }}>🔄</span>
                  Start Syncing ({syncStatus?.refreshLimit?.remaining || 0} left)
                </>
              )}
            </button>
          </syncFetcher.Form>
        }
      />

      {/* PRO Plan Usage Card */}
      {currentPlan === 'pro' && (
        <ProPlanUsageCard
          syncStatus={syncStatus}
          planFeatures={planFeatures}
          isTestMode={isTestMode}
          onUpgrade={() => handleUpgrade('MAX')}
          billingFetcherState={billingFetcher.state}
        />
      )}

      {/* MAX Plan Usage Card */}
      {currentPlan === 'max' && (
        <MaxPlanUsageCard syncStatus={syncStatus} />
      )}

      {/* Main Content */}
      <div>
          {/* Stats Grid - Three Cards */}
          <StatsGrid
            syncStatus={syncStatus}
            recommendations={recommendations}
            statistics={statistics}
          />

          {/* Backend Syncing Notice */}
          <SyncNotice
            isBackendSyncing={isBackendSyncing}
            optimisticSyncing={optimisticSyncing}
          />

          {/* Synced Products Section */}
          <div style={{ marginBottom: '40px' }}>
            <div className={styles.productsHeader}>
              <div className={styles.productsHeaderLeft}>
                <h2 className={styles.productsTitle}>
                  Synced Products
                </h2>
                {currentPlan === 'free' && (
                  <span className={styles.productsLimitBadge}>
                    Limit: {syncStatus?.productCount || 0} / {planFeatures?.maxProducts || 50}
                  </span>
                )}
              </div>
            </div>

            {/* Products Display */}
            <ProductsTable
              groupedProducts={groupedProducts}
              visibleProducts={visibleProducts}
              currentPlan={currentPlan}
              recommendations={recommendations}
              onShowMore={handleShowMore}
            />
          </div>

          {/* Admin: Global Quota Settings (Test Mode Only) */}
          {isTestMode && globalQuota && (
            <div style={{
              marginBottom: '20px',
              padding: '20px',
              backgroundColor: '#fff9e6',
              borderRadius: '8px',
              border: '2px solid #ffc107',
            }}>
              <h3 style={{ margin: '0 0 15px 0', fontSize: '16px', color: '#856404' }}>
                🔧 Admin: Global Quota Settings
              </h3>
              <div style={{ marginBottom: '15px' }}>
                <div style={{ fontSize: '14px', color: '#666', marginBottom: '10px' }}>
                  <strong>Current Settings:</strong>
                </div>
                <div style={{ fontSize: '13px', color: '#666', marginLeft: '10px' }}>
                  • Daily Token Limit: <strong>{globalQuota.dailyTokenQuota?.toLocaleString()}</strong> tokens
                </div>
                <div style={{ fontSize: '13px', color: '#666', marginLeft: '10px' }}>
                  • Tokens Used Today: <strong>{globalQuota.tokensUsedToday?.toLocaleString()}</strong> tokens
                </div>
                <div style={{ fontSize: '13px', color: '#666', marginLeft: '10px' }}>
                  • Last Updated: <strong>{globalQuota.updatedAt ? new Date(globalQuota.updatedAt).toLocaleString() : 'N/A'}</strong>
                </div>
              </div>
              <quotaFetcher.Form method="post">
                <input type="hidden" name="_action" value="updateGlobalQuota" />
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '13px', color: '#666', display: 'block', marginBottom: '5px' }}>
                      New Daily Token Limit:
                    </label>
                    <input
                      type="number"
                      name="dailyTokenQuota"
                      defaultValue={globalQuota.dailyTokenQuota}
                      min="0"
                      step="1000"
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        fontSize: '14px',
                        border: '1px solid #ccc',
                        borderRadius: '4px',
                      }}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={quotaFetcher.state === 'submitting'}
                    style={{
                      padding: '8px 16px',
                      fontSize: '14px',
                      backgroundColor: quotaFetcher.state === 'submitting' ? '#ccc' : '#ffc107',
                      color: '#000',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: quotaFetcher.state === 'submitting' ? 'not-allowed' : 'pointer',
                      fontWeight: 'bold',
                    }}
                  >
                    {quotaFetcher.state === 'submitting' ? 'Updating...' : 'Update Quota'}
                  </button>
                </div>
              </quotaFetcher.Form>
              {quotaFetcher.data?.success && (
                <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#d4edda', color: '#155724', borderRadius: '4px', fontSize: '13px' }}>
                  ✅ Global quota updated successfully to {quotaFetcher.data.dailyTokenQuota?.toLocaleString()} tokens/day
                </div>
              )}
              {quotaFetcher.data?.error && (
                <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#f8d7da', color: '#721c24', borderRadius: '4px', fontSize: '13px' }}>
                  ❌ Error: {quotaFetcher.data.error}
                </div>
              )}
            </div>
          )}

          {/* Sync Progress - Redesigned */}
          <SyncProgress isAnySyncing={isAnySyncing} />

          {/* Sync Result */}
          <SyncResult
            syncFetcherData={syncFetcher.data}
            formatDate={formatDate}
          />
        </div>
      </div>

      {error && (
        <div className={`${styles.syncResult} ${styles.syncResultError}`} style={{ marginTop: '20px' }}>
          Error: {error}
        </div>
      )}
      </div>
    </>
  );
}
