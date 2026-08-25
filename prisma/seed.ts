import { PrismaClient, RoleName } from '@prisma/client';

const prisma = new PrismaClient();

const SEED_BRANCH_ID = 'clseedbranch0000000000001';
const SEED_EMPLOYEE_1_ID = 'clseedemployee00000000001';
const SEED_EMPLOYEE_2_ID = 'clseedemployee00000000002';

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

  await prisma.branch.createMany({
    data: [{ id: SEED_BRANCH_ID, name: 'Sucursal Central' }],
    skipDuplicates: true,
  });

  await prisma.employee.createMany({
    data: [
      {
        id: SEED_EMPLOYEE_1_ID,
        name: 'Juan Pérez',
        specialty: 'Mecánica general',
      },
      {
        id: SEED_EMPLOYEE_2_ID,
        name: 'María González',
        specialty: 'Electricidad automotriz',
      },
    ],
    skipDuplicates: true,
  });
}

main()
  .catch(() => process.exit(1))
  .finally(async () => {
    await prisma.$disconnect();
  });
