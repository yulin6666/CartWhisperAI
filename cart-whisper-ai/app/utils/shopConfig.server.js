/**
 * 商店配置管理
 * 存储和管理商店的 API Key
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { registerShop } from './backendApi.server';

// 获取当前文件所在目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// data 目录应该在项目根目录下（app的父目录）
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'shop-config.json');


// 确保 data 目录存在
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch (error) {
}

/**
 * 读取商店配置
 * @returns {Object} 配置对象 { [domain]: { apiKey, registeredAt } }
 */
function readConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
      const config = JSON.parse(content);
      return config;
    }
  } catch (e) {
  }
  return {};
}

/**
 * 保存商店配置
 * @param {Object} config - 配置对象
 */
function saveConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

/**
 * 获取商店的 API Key（如果没有则自动注册）
 * @param {string} domain - 商店域名
 * @param {object} admin - Shopify Admin API 对象（可选，用于获取shop信息）
 * @returns {Promise<string>} API Key
 */
export async function getApiKey(domain, admin = null) {
  try {
    const config = readConfig();

    // 获取shop的plan信息（如果提供了admin）
    let planName = null;
    if (admin) {
      try {
        const shopResponse = await admin.graphql(`
          query {
            shop {
              plan {
                displayName
              }
            }
          }
        `);
        const shopData = await shopResponse.json();
        planName = shopData?.data?.shop?.plan?.displayName || null;
      } catch (e) {
      }
    }

    // 检查是否已有配置
    if (config[domain]?.apiKey) {

      // 如果获取到了新的planName，更新后端
      if (planName) {
        try {
          const result = await registerShop(domain, planName);

          // 检查是否是开发店且被拒绝
          if (result.isDevelopmentStore && !result.isWhitelisted && result.requiresWhitelist) {
            throw new Error(result.error || 'Development store access denied');
          }
        } catch (e) {
          // 如果是开发店被拒绝，抛出错误
          if (e.message.includes('Development store') || e.message.includes('403')) {
            throw e;
          }
        }
      }

      return config[domain].apiKey;
    }

    // 没有配置，需要注册
    const result = await registerShop(domain, planName);

    // 检查是否是开发店且被拒绝
    if (result.isDevelopmentStore && !result.isWhitelisted && result.requiresWhitelist) {
      throw new Error(result.error || 'Development store access denied. Please upgrade to a paid Shopify plan or contact support.');
    }

    if (!result.success || !result.apiKey) {
      throw new Error('Failed to register shop: ' + JSON.stringify(result));
    }

    // 保存配置
    config[domain] = {
      apiKey: result.apiKey,
      registeredAt: new Date().toISOString(),
      isNew: result.isNew,
      isDevelopmentStore: result.isDevelopmentStore || false,
      isWhitelisted: result.isWhitelisted || false,
    };
    saveConfig(config);

    return result.apiKey;
  } catch (error) {
    throw error;
  }
}

/**
 * 清除商店配置（用于调试）
 * @param {string} domain - 商店域名
 */
export function clearApiKey(domain) {
  const config = readConfig();
  delete config[domain];
  saveConfig(config);
}

/**
 * 获取所有商店配置
 * @returns {Object} 所有配置
 */
export function getAllConfigs() {
  return readConfig();
}
