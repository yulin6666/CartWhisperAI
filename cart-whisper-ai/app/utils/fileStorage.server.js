import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../../data');

// 确保数据目录存在
export function ensureDataDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

// 保存产品到 JSON
export function saveProducts(products) {
  ensureDataDir();
  const productsFile = path.join(dataDir, 'products.json');
  fs.writeFileSync(productsFile, JSON.stringify(products, null, 2));
  console.log(`✅ Saved ${products.length} products to ${productsFile}`);
}

// 读取产品
export function loadProducts() {
  ensureDataDir();
  const productsFile = path.join(dataDir, 'products.json');
  if (!fs.existsSync(productsFile)) {
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(productsFile, 'utf8'));
  } catch (e) {
    console.error('Error loading products:', e);
    return [];
  }
}

// 保存订单到 JSON
export function saveOrders(orders) {
  ensureDataDir();
  const ordersFile = path.join(dataDir, 'orders.json');
  fs.writeFileSync(ordersFile, JSON.stringify(orders, null, 2));
  console.log(`✅ Saved ${orders.length} orders to ${ordersFile}`);
}

// 读取订单
export function loadOrders() {
  ensureDataDir();
  const ordersFile = path.join(dataDir, 'orders.json');
  if (!fs.existsSync(ordersFile)) {
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(ordersFile, 'utf8'));
  } catch (e) {
    console.error('Error loading orders:', e);
    return [];
  }
}

// 保存扫描日志
export function saveScanLog(log) {
  ensureDataDir();
  const logsFile = path.join(dataDir, 'scan-logs.json');
  let logs = [];
  if (fs.existsSync(logsFile)) {
    try {
      logs = JSON.parse(fs.readFileSync(logsFile, 'utf8'));
    } catch (e) {
      console.error('Error loading logs:', e);
    }
  }
  logs.push(log);
  fs.writeFileSync(logsFile, JSON.stringify(logs, null, 2));
  console.log(`✅ Saved scan log to ${logsFile}`);
}

// 获取数据目录路径
export function getDataDir() {
  ensureDataDir();
  return dataDir;
}
