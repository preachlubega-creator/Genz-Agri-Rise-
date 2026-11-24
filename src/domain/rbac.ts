import type {
  PermissionAction,
  ResourceDomain,
  RoleName,
  RolePermissionMap,
  SectorId,
  SessionUser,
} from './types';

export const ALL_ROLES: RoleName[] = [
  'Founder / Super Administrator',
  'Administrator',
  'Sector Manager',
  'Team Leader',
  'General Member',
];

export const ALL_SECTORS: SectorId[] = [
  'agriculture',
  'piggery',
  'poultry',
  'vertical_farming',
];

export const SECTOR_LABELS: Record<SectorId, string> = {
  agriculture: 'Agriculture',
  piggery: 'Piggery',
  poultry: 'Poultry',
  vertical_farming: 'Vertical Farming',
};

export const DEFAULT_ROLE_PERMISSIONS: RolePermissionMap = {
  'Founder / Super Administrator': {
    organisation: ['view', 'create', 'edit', 'approve', 'delete'],
    members: ['view', 'create', 'edit', 'approve', 'delete'],
    finance: ['view', 'create', 'edit', 'approve'],
    projects: ['view', 'create', 'edit', 'approve', 'delete'],
    sector_operations: ['view', 'create', 'edit', 'approve', 'delete'],
    roles: ['view', 'edit'],
    reports: ['view', 'create'],
    audit_logs: ['view'],
  },
  Administrator: {
    organisation: ['view', 'create', 'edit'],
    members: ['view', 'create', 'edit', 'approve'],
    finance: ['view', 'create', 'approve'],
    projects: ['view', 'create', 'edit', 'approve'],
    sector_operations: ['view', 'create', 'edit', 'approve'],
    roles: ['view'],
    reports: ['view', 'create'],
    audit_logs: ['view'],
  },
  'Sector Manager': {
    organisation: ['view'],
    members: ['view', 'create', 'edit'],
    finance: ['view', 'create'],
    projects: ['view', 'create', 'edit'],
    sector_operations: ['view', 'create', 'edit', 'approve'],
    roles: ['view'],
    reports: ['view'],
    audit_logs: ['view'],
  },
  'Team Leader': {
    organisation: ['view'],
    members: ['view'],
    finance: ['view'],
    projects: ['view', 'edit'],
    sector_operations: ['view', 'create', 'edit'],
    roles: ['view'],
    reports: ['view'],
    audit_logs: [],
  },
  'General Member': {
    organisation: ['view'],
    members: ['view'],
    finance: [],
    projects: ['view'],
    sector_operations: ['view'],
    roles: [],
    reports: [],
    audit_logs: [],
  },
};

const ROLE_RANK: Record<RoleName, number> = {
  'Founder / Super Administrator': 5,
  Administrator: 4,
  'Sector Manager': 3,
  'Team Leader': 2,
  'General Member': 1,
};

export function getEffectiveRoleForScope(
  user: SessionUser,
  scope: 'Organisation' | SectorId,
): RoleName {
  if (
    user.role === 'Founder / Super Administrator' ||
    user.role === 'Administrator'
  ) {
    return user.role;
  }
  if (scope === 'Organisation') {
    return user.role;
  }
  const assignment = user.sectorAssignments.find((s) => s.sectorId === scope);
  if (assignment) {
    return assignment.role;
  }
  // If user is a Sector Manager or Team Leader in another sector, they only have General Member visibility in unassigned sectors
  return 'General Member';
}

export function hasPermission(
  user: SessionUser,
  rolePermissions: RolePermissionMap,
  resource: ResourceDomain,
  action: PermissionAction,
  scope: 'Organisation' | SectorId = 'Organisation',
): boolean {
  const effectiveRole = getEffectiveRoleForScope(user, scope);
  const allowedActions = rolePermissions[effectiveRole]?.[resource] ?? [];
  return allowedActions.includes(action);
}

export function isGlobalAdmin(user: SessionUser): boolean {
  return (
    user.role === 'Founder / Super Administrator' ||
    user.role === 'Administrator'
  );
}

export function canUserAccessSectorManagement(
  user: SessionUser,
  sectorId: SectorId,
): boolean {
  if (isGlobalAdmin(user)) return true;
  const effective = getEffectiveRoleForScope(user, sectorId);
  return ROLE_RANK[effective] >= ROLE_RANK['Team Leader'];
}
