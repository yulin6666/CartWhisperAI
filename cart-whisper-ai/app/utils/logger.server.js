import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../../data');
const logsDir = path.join(dataDir, 'logs');

// 确保日志目录存在
function ensureLogsDir() {
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
}

/**
 * 创建新的日志会话
 * @returns {Object} 包含 log 函数和日志文件路径的对象
 */
export function createLogger(sessionName = 'scan') {
  ensureLogsDir();

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logFile = path.join(logsDir, `${sessionName}-${timestamp}.log`);
  const logs = [];

  /**
   * 记录日志
   * @param {string} message - 日志信息
   * @param {string} level - 日志级别 (info, warn, error, success)
   */
  function log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

    // 同时输出到控制台和日志数组
    console.log(logEntry);
    logs.push(logEntry);
  }

  /**
   * 保存日志到文件
   */
  function save() {
    fs.writeFileSync(logFile, logs.join('\n'), 'utf8');
    console.log(`\n📝 详细日志已保存到: ${logFile}`);
    return logFile;
  }

  /**
   * 获取所有日志内容
   */
  function getContent() {
    return logs.join('\n');
  }

  return {
    info: (msg) => log(msg, 'info'),
    warn: (msg) => log(msg, 'warn'),
    error: (msg) => log(msg, 'error'),
    success: (msg) => log(msg, 'success'),
    log: (msg, level) => log(msg, level),
    save,
    getContent,
    path: logFile,
  };
}

/**
 * 获取最新的日志文件
 */
export function getLatestLogFile() {
  ensureLogsDir();

  const files = fs.readdirSync(logsDir)
    .filter(f => f.startsWith('scan-') && f.endsWith('.log'))
    .map(f => ({
      name: f,
      path: path.join(logsDir, f),
      time: fs.statSync(path.join(logsDir, f)).mtime.getTime(),
    }))
    .sort((a, b) => b.time - a.time);

  if (files.length === 0) {
    return null;
  }

  return files[0];
}

/**
 * 读取日志文件内容
 */
export function readLogFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return fs.readFileSync(filePath, 'utf8');
}
