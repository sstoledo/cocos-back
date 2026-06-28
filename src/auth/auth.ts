import { PrismaClient } from '@prisma/client';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { createDefaultRoleAssignmentHook } from './default-role.hook';

const prisma = new PrismaClient();

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  emailAndPassword: {
    enabled: true,
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
  },
  resetPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      roleId: {
        type: 'string',
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: createDefaultRoleAssignmentHook(prisma),
      },
    },
  },
});
