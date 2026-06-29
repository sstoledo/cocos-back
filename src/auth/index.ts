export { auth } from './auth';
export {
  assignDefaultRole,
  createAssignDefaultRoleHook,
  DEFAULT_ROLE_NAME,
} from './default-role.hook';
export type {
  AssignDefaultRoleResult,
  UserCreateData,
} from './default-role.hook';
export { ROLES_KEY, Roles } from './roles.decorator';
export { RolesGuard } from './role.guard';
export type { RequestWithUser } from './request';
