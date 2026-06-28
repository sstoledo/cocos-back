import { PrismaClient, RoleName } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const roles: RoleName[] = [
    'Admin',
    'Reception',
    'Mechanic',
    'Warehouse',
    'Purchasing',
    'ReadOnly',
  ];

  await prisma.role.createMany({
    data: roles.map((name) => ({ name })),
    skipDuplicates: true,
  });
}

main()
  .catch(() => process.exit(1))
  .finally(async () => {
    await prisma.$disconnect();
  });
