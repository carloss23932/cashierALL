import { PrismaClient } from '@prisma/client';

(async () => {
  try {
    const prisma = new PrismaClient();
    const users = await prisma.user.findMany({ take: 1 });
    console.log('OK USERS:', users.length);
    await prisma.$disconnect();
    process.exit(0);
  } catch (e) {
    console.error('PRISMA CHECK ERROR');
    console.error(e);
    try { await (new (await import('@prisma/client')).PrismaClient()).$disconnect(); } catch {}
    process.exit(1);
  }
})();
