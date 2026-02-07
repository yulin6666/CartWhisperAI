import { memo } from 'react';
import { Modal } from '../Modal/Modal';
import styles from './ManageSubscriptionModal.module.css';

// 套餐配置（与 billing.server.js 保持一致）
const PLANS_CONFIG = {
  FREE: {
    name: 'Starter',
    price: 0,
    priceLabel: 'Free',
    description: 'Forever free',
    features: [
      { text: '50 Products', included: true },
      { text: '1 Recommendation', included: true },
      { text: 'Watermark included', included: false, isWarning: true },
    ],
  },
  PRO: {
    name: 'Pro Growth',
    price: 19.99,
    priceLabel: '$19.99',
    description: 'Billed monthly',
    features: [
      { text: '2,000 Products', included: true },
      { text: '3 Recommendations', included: true },
      { text: 'No Watermark', included: true },
    ],
  },
  MAX: {
    name: 'Unlimited',
    price: 49.99,
    priceLabel: '$49.99',
    description: 'Power users',
    features: [
      { text: 'Unlimited Sync', included: true },
      { text: 'Priority Support', included: true },
      { text: 'Dedicated Server', included: true },
    ],
  },
};

function getPlanLevel(plan) {
  const levels = { free: 0, pro: 1, max: 2 };
  return levels[plan?.toLowerCase()] || 0;
}

const PlanCard = memo(({ planKey, config, currentPlan, onUpgrade, onDowngrade, isLoading }) => {
  const isCurrent = currentPlan?.toUpperCase() === planKey;
  const currentLevel = getPlanLevel(currentPlan);
  const planLevel = getPlanLevel(planKey);
  const isDowngrade = planLevel < currentLevel;
  const isUpgrade = planLevel > currentLevel;

  return (
    <div className={`${styles.planCard} ${isCurrent ? styles.planCardCurrent : ''}`}>
      {isCurrent && <span className={styles.activeBadge}>ACTIVE</span>}

      <div className={styles.planHeader}>
        <h3 className={`${styles.planName} ${isCurrent ? styles.planNameActive : ''}`}>
          {config.name}
        </h3>
        <div className={styles.planPrice}>
          {config.price === 0 ? (
            <span className={styles.priceText}>{config.priceLabel}</span>
          ) : (
            <>
              <span className={`${styles.priceAmount} ${isCurrent ? styles.priceAmountActive : ''}`}>
                {config.priceLabel}
              </span>
              <span className={styles.pricePeriod}>/mo</span>
            </>
          )}
        </div>
        <p className={styles.planDescription}>{config.description}</p>
      </div>

      <ul className={styles.featureList}>
        {config.features.map((feature, idx) => (
          <li key={idx} className={styles.featureItem}>
            <span className={`${styles.featureIcon} ${feature.isWarning ? styles.featureIconWarning : styles.featureIconCheck}`}>
              {feature.isWarning ? '⚠' : '✓'}
            </span>
            <span className={feature.isWarning ? styles.featureTextWarning : ''}>
              {feature.text}
            </span>
          </li>
        ))}
      </ul>

      <div className={styles.buttonWrapper}>
        {isCurrent ? (
          <button className={`${styles.button} ${styles.buttonCurrent}`} disabled>
            <span className={styles.buttonCheckIcon}>✓</span>
            Current Plan
          </button>
        ) : isDowngrade ? (
          <button
            className={`${styles.button} ${styles.buttonDowngrade}`}
            onClick={() => onDowngrade(planKey)}
            disabled={isLoading}
          >
            {isLoading ? 'Processing...' : 'Downgrade'}
          </button>
        ) : isUpgrade ? (
          <button
            className={`${styles.button} ${styles.buttonUpgrade}`}
            onClick={() => onUpgrade(planKey)}
            disabled={isLoading}
          >
            {isLoading ? 'Processing...' : 'Upgrade'}
          </button>
        ) : null}
      </div>
    </div>
  );
});
PlanCard.displayName = 'PlanCard';

export function ManageSubscriptionModal({
  isOpen,
  onClose,
  currentPlan,
  onUpgrade,
  onDowngrade,
  isLoading,
}) {
  const planDisplayName = PLANS_CONFIG[currentPlan?.toUpperCase()]?.name || 'Free';

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="large">
      <div className={styles.container}>
        <div className={styles.header}>
          <h2 className={styles.title}>Manage Subscription</h2>
          <p className={styles.subtitle}>
            You are currently on the{' '}
            <span className={styles.currentPlanBadge}>{planDisplayName} Plan</span>.
          </p>
        </div>

        <div className={styles.plansGrid}>
          {Object.entries(PLANS_CONFIG).map(([key, config]) => (
            <PlanCard
              key={key}
              planKey={key}
              config={config}
              currentPlan={currentPlan}
              onUpgrade={onUpgrade}
              onDowngrade={onDowngrade}
              isLoading={isLoading}
            />
          ))}
        </div>
      </div>
    </Modal>
  );
}
