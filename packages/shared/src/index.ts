// Shared domain vocabulary used by api + web apps.

export const ROLES = ['super_admin', 'org_admin', 'supervisor', 'employee'] as const;
export type Role = (typeof ROLES)[number];

/** Role rank — higher can do everything a lower role can within its scope. */
export const ROLE_RANK: Record<Role, number> = {
  super_admin: 3,
  org_admin: 2,
  supervisor: 1,
  employee: 0,
};

export const TENANT_STATUS = ['active', 'trial', 'suspended'] as const;
export type TenantStatus = (typeof TENANT_STATUS)[number];

export const TENANT_PLANS = ['trial', 'starter', 'pro'] as const;
export type TenantPlan = (typeof TENANT_PLANS)[number];

export const ATTENDANCE_STATUS = ['present', 'late', 'absent', 'leave'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUS)[number];

export const LEAVE_TYPES = ['sick', 'personal', 'vacation'] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export const REQUEST_STATUS = ['pending', 'approved', 'rejected'] as const;
export type RequestStatus = (typeof REQUEST_STATUS)[number];

export const PAYROLL_STATUS = ['draft', 'approved', 'paid'] as const;
export type PayrollStatus = (typeof PAYROLL_STATUS)[number];

export const SALARY_COMPONENT_KIND = ['earning', 'deduction'] as const;
export type SalaryComponentKind = (typeof SALARY_COMPONENT_KIND)[number];

/** Header the frontend sends / nginx sets so the API can resolve the tenant. */
export const TENANT_HEADER = 'x-tenant';

/** Authenticated principal carried on the request after JWT verification. */
export interface AuthPrincipal {
  userId: string;
  tenantId: string | null; // null for super_admin (platform scope)
  role: Role;
  lineUserId?: string;
}

export const PDPA_CONSENT_VERSION = '2026-09-01';

export function canApproveLeave(role: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK.supervisor;
}

export function isPlatformRole(role: Role): boolean {
  return role === 'super_admin';
}
