import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logsDir = path.join(__dirname, '../../data/logs');

/**
 * 获取日志列表和内容
 */
export async function loader({ request, params }) {
  try {
    // 检查查询参数
    const url = new URL(request.url);
    const action = url.searchParams.get('action');

    // 检查日志目录是否存在
    if (!fs.existsSync(logsDir)) {
      return {
        logs: [],
        latest: null,
      };
    }

    // 获取所有日志文件
    const files = fs.readdirSync(logsDir)
      .filter(f => f.startsWith('scan-') && f.endsWith('.log'))
      .map(f => ({
        name: f,
        path: path.join(logsDir, f),
        time: fs.statSync(path.join(logsDir, f)).mtime,
      }))
      .sort((a, b) => b.time.getTime() - a.time.getTime());

    // 如果请求最新日志内容
    if (action === 'latest' && files.length > 0) {
      const latestFile = files[0];
      const content = fs.readFileSync(latestFile.path, 'utf8');
      return {
        latest: {
          name: latestFile.name,
          content: content,
          size: fs.statSync(latestFile.path).size,
          time: latestFile.time.toISOString(),
        },
        logs: files.map(f => ({
          name: f.name,
          time: f.time.toISOString(),
          size: fs.statSync(f.path).size,
        })),
      };
    }

    // 如果请求特定文件内容
    const file = url.searchParams.get('file');
    if (file && action === 'read') {
      const filePath = path.join(logsDir, file);
      if (fs.existsSync(filePath) && file.startsWith('scan-') && file.endsWith('.log')) {
        const content = fs.readFileSync(filePath, 'utf8');
        return {
          name: file,
          content: content,
          size: fs.statSync(filePath).size,
          time: fs.statSync(filePath).mtime.toISOString(),
        };
      }
    }

    // 返回日志文件列表
    return {
      logs: files.map(f => ({
        name: f.name,
        time: f.time.toISOString(),
        size: fs.statSync(f.path).size,
      })),
      latest: files.length > 0 ? {
        name: files[0].name,
        time: files[0].time.toISOString(),
      } : null,
    };
  } catch (error) {
    console.error('Error reading logs:', error);
    return {
      error: error.message,
      logs: [],
      latest: null,
    };
  }
}
