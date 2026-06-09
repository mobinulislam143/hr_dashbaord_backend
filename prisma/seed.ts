import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('\n🌱 Setting up Omira admin...\n');

  // ─── Read from .env ───────────────────────────────────────────────────────
  const email     = process.env.ADMIN_EMAIL     || 'admin@omira.com';
  const password  = process.env.ADMIN_PASSWORD  || 'Admin@123';
  const firstName = process.env.ADMIN_FIRST_NAME || 'Admin';
  const lastName  = process.env.ADMIN_LAST_NAME  || 'User';
  const orgName   = process.env.ADMIN_ORG_NAME   || 'Omira HQ';

  // ─── Create or update organization ───────────────────────────────────────
  const slug = orgName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  let org = await prisma.organization.findFirst({ where: { slug } });

  if (!org) {
    org = await prisma.organization.create({
      data: { name: orgName, slug, plan: 'FREE' },
    });
    console.log(`✅ Organization created: "${orgName}"`);
  } else {
    console.log(`ℹ️  Organization already exists: "${orgName}"`);
  }

  // ─── Create or update admin user ─────────────────────────────────────────
  const passwordHash = await bcrypt.hash(password, 12);

  const existingUser = await prisma.user.findUnique({ where: { email } });

  if (!existingUser) {
    await prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName,
        lastName,
        role: 'ADMIN',
        organizationId: org.id,
        isActive: true,
      },
    });
    console.log(`✅ Admin user created`);
  } else {
    // Update password in case it changed in .env
    await prisma.user.update({
      where: { email },
      data: { passwordHash, firstName, lastName, role: 'ADMIN', isActive: true },
    });
    console.log(`ℹ️  Admin user updated (password refreshed)`);
  }

  console.log('\n──────────────────────────────────────────');
  console.log('🚀 Admin credentials:');
  console.log(`   📧 Email    : ${email}`);
  console.log(`   🔑 Password : ${password}`);
  console.log(`   🏢 Org      : ${orgName}`);
  console.log('──────────────────────────────────────────\n');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
