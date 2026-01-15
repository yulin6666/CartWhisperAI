import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';

// 加载环境变量
config();

const prisma = new PrismaClient();

async function checkSubscription() {
  try {
    const subscriptions = await prisma.subscription.findMany({
      select: {
        shop: true,
        plan: true,
        status: true,
        isTestMode: true,
        createdAt: true,
      }
    });

    console.log('=== Subscription Records ===');
    console.log(JSON.stringify(subscriptions, null, 2));

    await prisma.$disconnect();
  } catch (error) {
    console.error('Error:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

checkSubscription();
