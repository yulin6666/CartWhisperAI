import { Modal } from '../Modal/Modal';
import styles from './DowngradeWarningModal.module.css';

// 套餐功能配置
const PLAN_FEATURES = {
  FREE: {
    maxProducts: 50,
    recommendationsPerProduct: 1,
    showWatermark: true,
    analytics: 'basic',
  },
  PRO: {
    maxProducts: 2000,
    recommendationsPerProduct: 3,
    showWatermark: false,
    analytics: 'advanced',
    prioritySupport: true,
  },
  MAX: {
    maxProducts: Infinity,
    recommendationsPerProduct: 3,
    showWatermark: false,
    analytics: 'advanced',
    prioritySupport: true,
    premiumSupport: true,
  },
};

const PLAN_NAMES = {
  FREE: 'Starter',
  PRO: 'Pro Growth',
  MAX: 'Unlimited',
};

function getLostFeatures(currentPlan, targetPlan) {
  const current = PLAN_FEATURES[currentPlan?.toUpperCase()] || {};
  const target = PLAN_FEATURES[targetPlan?.toUpperCase()] || PLAN_FEATURES.FREE;
  const lostFeatures = [];

  // 产品数量限制
  if (current.maxProducts > target.maxProducts) {
    const targetLimit = target.maxProducts === Infinity ? 'Unlimited' : target.maxProducts.toLocaleString();
    lostFeatures.push(`Product limit drops to ${targetLimit} items`);
  }

  // 推荐数量
  if (current.recommendationsPerProduct > target.recommendationsPerProduct) {
    lostFeatures.push(`Recommendations reduced to ${target.recommendationsPerProduct} per product`);
  }

  // 水印
  if (current.showWatermark === false && target.showWatermark === true) {
    lostFeatures.push('"Powered by" watermark reappears');
  }

  // 高级分析
  if (current.analytics === 'advanced' && target.analytics === 'basic') {
    lostFeatures.push('Advanced analytics disabled');
  }

  // 优先支持
  if (current.prioritySupport && !target.prioritySupport) {
    lostFeatures.push('Priority support no longer available');
  }

  return lostFeatures;
}

export function DowngradeWarningModal({
  isOpen,
  onClose,
  currentPlan,
  targetPlan,
  onConfirm,
  isLoading,
}) {
  const targetPlanName = PLAN_NAMES[targetPlan?.toUpperCase()] || 'Free';
  const currentPlanName = PLAN_NAMES[currentPlan?.toUpperCase()] || 'Pro';
  const lostFeatures = getLostFeatures(currentPlan, targetPlan);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="small">
      <div className={styles.container}>
        <div className={styles.warningIconWrapper}>
          <span className={styles.warningIcon}>⚠</span>
        </div>

        <h2 className={styles.title}>Downgrade to {targetPlanName}?</h2>

        <p className={styles.description}>
          You are about to switch to the {targetPlanName} plan. You will{' '}
          <span className={styles.descriptionBold}>immediately lose</span> access to these pro features:
        </p>

        <div className={styles.warningBox}>
          <ul className={styles.lostFeaturesList}>
            {lostFeatures.map((feature, idx) => (
              <li key={idx} className={styles.lostFeatureItem}>
                <span className={styles.lostFeatureIcon}>✕</span>
                {feature}
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.actions}>
          <button
            className={`${styles.button} ${styles.buttonKeep}`}
            onClick={onClose}
            disabled={isLoading}
          >
            Keep my {currentPlanName} benefits
          </button>
          <button
            className={`${styles.button} ${styles.buttonConfirm}`}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? 'Processing...' : 'Yes, downgrade'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
