import { PrismaClient, RoleName } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const roles = Object.values(RoleName).map((name) => ({ name }));

  await prisma.role.createMany({
    data: roles,
    skipDuplicates: true,
  });

  const createdRoles = await prisma.role.findMany();
  console.log(
    `Seeded ${createdRoles.length} roles:`,
    createdRoles.map((role) => role.name).join(', '),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
