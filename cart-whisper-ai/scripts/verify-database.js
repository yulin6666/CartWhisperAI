#!/usr/bin/env node

/**
 * 数据库连接验证脚本
 * 用于验证 DATABASE_URL 配置是否正确
 *
 * 使用方法：
 * 1. 确保 .env 文件中有正确的 DATABASE_URL
 * 2. 运行：node scripts/verify-database.js
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

async function verifyDatabase() {
  console.log('🔍 开始验证数据库连接...\n');

  try {
    // 测试 1: 数据库连接
    console.log('1️⃣ 测试数据库连接...');
    await prisma.$connect();
    console.log('   ✅ 数据库连接成功\n');

    // 测试 2: 查询会话表
    console.log('2️⃣ 测试查询 Session 表...');
    const sessionCount = await prisma.session.count();
    console.log(`   ✅ Session 表查询成功，共 ${sessionCount} 条记录\n`);

    // 测试 3: 查询 API Key 表
    console.log('3️⃣ 测试查询 ShopApiKey 表...');
    const apiKeyCount = await prisma.shopApiKey.count();
    console.log(`   ✅ ShopApiKey 表查询成功，共 ${apiKeyCount} 条记录\n`);

    // 测试 4: 查询数据库版本
    console.log('4️⃣ 测试查询 PostgreSQL 版本...');
    const result = await prisma.$queryRaw`SELECT version();`;
    console.log('   ✅ PostgreSQL 版本:', result[0].version.split(',')[0]);
    console.log('');

    // 测试 5: 测试写入（创建一个测试会话）
    console.log('5️⃣ 测试数据库写入...');
    const testSession = await prisma.session.create({
      data: {
        id: `test-${Date.now()}`,
        shop: 'test-shop.myshopify.com',
        state: '{}',
        isOnline: false,
        scope: 'test',
        accessToken: 'test-token',
      },
    });
    console.log('   ✅ 写入测试成功，Session ID:', testSession.id);

    // 清理测试数据
    await prisma.session.delete({
      where: { id: testSession.id },
    });
    console.log('   ✅ 测试数据已清理\n');

    // 总结
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 所有测试通过！数据库配置正确！');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('\n❌ 数据库验证失败！\n');
    console.error('错误类型:', error.constructor.name);
    console.error('错误信息:', error.message);
    console.error('');

    if (error.message.includes('P1001')) {
      console.error('💡 可能的原因：');
      console.error('   1. DATABASE_URL 缺少 ?sslmode=require 参数');
      console.error('   2. 数据库服务未启动');
      console.error('   3. 网络连接问题\n');
      console.error('📝 请检查 .env 文件中的 DATABASE_URL 格式：');
      console.error('   postgresql://user:password@host:port/database?sslmode=require');
    } else if (error.message.includes('P1003')) {
      console.error('💡 可能的原因：');
      console.error('   1. 数据库不存在');
      console.error('   2. 数据库名称错误\n');
    } else if (error.message.includes('authentication failed')) {
      console.error('💡 可能的原因：');
      console.error('   1. 数据库用户名或密码错误');
      console.error('   2. DATABASE_URL 配置错误\n');
    }

    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 运行验证
verifyDatabase().catch((error) => {
  console.error('脚本执行失败:', error);
  process.exit(1);
});
