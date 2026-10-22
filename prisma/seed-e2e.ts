import { PrismaClient } from '@prisma/client';
import { auth } from '../src/auth/auth';

// E2E seed: deterministic browser-test users on top of seed.ts + seed-demo.ts.
// Idempotent: re-registering an existing user fails safely and the row is
// reconciled instead. The Reception user keeps the default role the auth hook
// assigns; the Mechanic user is flipped to the Mechanic role and linked to an
// active employee so the RBAC scoping under test has data to scope to.
const prisma = new PrismaClient();

const E2E_PASSWORD = 'Passw0rd.e2e';

const USERS = [
  { email: 'reception-e2e@example.com', name: 'E2E Reception' },
  { email: 'mechanic-e2e@example.com', name: 'E2E Mechanic' },
  { email: 'admin-e2e@example.com', name: 'E2E Admin' },
];

async function ensureUser(email: string, name: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return existing;
  }
  await auth.api.signUpEmail({
    body: {
      email,
      name,
      password: E2E_PASSWORD,
    },
  });

  const registered = await prisma.user.findUnique({
    where: { email },
    select: { id: true, emailVerified: true, roleId: true },
  });

  if (!registered) {
    throw new Error(`E2E user ${email} was not created`);
  }

  return registered;
}

async function main() {
  const roles = await prisma.role.findMany({
    select: { id: true, name: true },
  });
  const roleByName = new Map(roles.map((role) => [role.name, role.id]));

  for (const { email, name } of USERS) {
    const user = await ensureUser(email, name);
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true },
    });
  }

  // Reflexive contract guard: the auth hook guarantees every new user starts
  // as Reception. If that ever changes, the happy-path spec's login must be
  // revisited (this seed documents that coupling).
  const receptionUser = await prisma.user.findUniqueOrThrow({
    where: { email: USERS[0].email },
    include: { role: { select: { name: true } } },
  });
  if (receptionUser.role.name !== 'Reception') {
    throw new Error(
      `Expected default role Reception for new users, got ${receptionUser.role.name}`
    );
  }

  const mechanicUserId = (
    await prisma.user.findUniqueOrThrow({
      where: { email: USERS[1].email },
      select: { id: true },
    })
  ).id;

  // Deterministic link: seed.ts always creates the named employees, so the
  // e2e mechanic always scopes to the same employee record. Refuse a link
  // already owned by another user instead of silently retargeting it.
  const employee = await prisma.employee.findFirst({
    where: { name: 'María González' },
  });
  if (!employee || !employee.isActive) {
    throw new Error(
      'E2E seed requires an active employee named "María González" (created by prisma/seed.ts)'
    );
  }
  if (employee.userId && employee.userId !== mechanicUserId) {
    throw new Error(
      `Employee "María González" is already linked to user ${employee.userId}`
    );
  }
  await prisma.employee.update({
    where: { id: employee.id },
    data: { userId: mechanicUserId },
  });

  await prisma.user.update({
    where: { id: mechanicUserId },
    data: { roleId: roleByName.get('Mechanic') ?? undefined },
  });

  const adminUserId = (
    await prisma.user.findUniqueOrThrow({
      where: { email: USERS[2].email },
      select: { id: true },
    })
  ).id;

  await prisma.user.update({
    where: { id: adminUserId },
    data: {
      roleId: roleByName.has('Admin') ? roleByName.get('Admin') : undefined,
    },
  });

  console.log(
    `e2e users ready: ${[receptionUser.id].length} ensured; mechanic employee ${employee.name}`
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
