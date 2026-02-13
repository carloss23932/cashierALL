import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  try {
    const existingAdmin = await prisma.user.findUnique({ where: { username: "admin" } });
    if (existingAdmin) {
      console.log("ℹ️ Seed: admin already exists, skipping creation");
    } else {
      // Only import crypto and define hashPassword when needed
      const crypto = await import("crypto");
      const hashPassword = (password: string) => {
        const salt = crypto.randomBytes(16).toString("hex");
        const derived = crypto.scryptSync(password, salt, 64).toString("hex");
        return `${salt}:${derived}`;
      };

      await prisma.user.create({
        data: {
          username: "admin",
          name: "المدير",
          passwordHash: hashPassword("admin"),
          role: "admin",
        },
      });
      console.log("✅ Seed: created default admin user (admin/admin)");
    }

    // Create sample clients and debts
    const existingClients = await prisma.client.count();
    if (existingClients === 0) {
      console.log("ℹ️ Seed: creating sample clients and debts");

      const client1 = await prisma.client.create({
        data: {
          name: "أحمد محمد",
          phone: "07771234567",
        },
      });

      const client2 = await prisma.client.create({
        data: {
          name: "فاطمة علي",
          phone: "07772345678",
        },
      });

      // Create sample debts
      await prisma.debt.create({
        data: {
          amount: 150.000,
          note: "دين لشراء مواد بناء",
          reason: "مشتريات",
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
          clientId: client1.id,
          createdById: existingAdmin?.id || 1,
        },
      });

      await prisma.debt.create({
        data: {
          amount: 75.500,
          note: "دين للخدمات",
          reason: "خدمات",
          dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 days from now
          paid: true,
          paidAt: new Date(),
          clientId: client2.id,
          createdById: existingAdmin?.id || 1,
        },
      });

      console.log("✅ Seed: created sample clients and debts");
    } else {
      console.log("ℹ️ Seed: sample data already exists, skipping creation");
    }
  } catch (err) {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
