import {
  pgEnum,
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  integer,
  numeric,
  date,
  timestamp,
  doublePrecision,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

// ---------- enums ----------
export const roleEnum = pgEnum('role', ['super_admin', 'org_admin', 'supervisor', 'employee']);
export const tenantStatusEnum = pgEnum('tenant_status', ['active', 'trial', 'suspended']);
export const planEnum = pgEnum('plan', ['trial', 'starter', 'pro']);
export const attendanceStatusEnum = pgEnum('attendance_status', ['present', 'late', 'absent', 'leave']);
export const leaveTypeEnum = pgEnum('leave_type', ['sick', 'personal', 'vacation']);
export const requestStatusEnum = pgEnum('request_status', ['pending', 'approved', 'rejected']);
export const payrollStatusEnum = pgEnum('payroll_status', ['draft', 'approved', 'paid']);
export const salaryKindEnum = pgEnum('salary_kind', ['earning', 'deduction']);
export const invitationStatusEnum = pgEnum('invitation_status', ['pending', 'accepted', 'expired', 'revoked']);

const pk = () => uuid('id').defaultRandom().primaryKey();
const createdAt = () => timestamp('created_at', { withTimezone: true }).defaultNow().notNull();

// ---------- tenants (organizations) ----------
export const tenants = pgTable(
  'tenants',
  {
    id: pk(),
    name: text('name').notNull(),
    subdomain: varchar('subdomain', { length: 63 }).notNull(),
    plan: planEnum('plan').notNull().default('trial'),
    status: tenantStatusEnum('status').notNull().default('trial'),
    createdAt: createdAt(),
  },
  (t) => ({
    subdomainUq: uniqueIndex('tenants_subdomain_uq').on(t.subdomain),
  }),
);

// Per-tenant LINE channel binding. Secrets are AES-256-GCM ciphertext (never plaintext).
export const tenantLineChannels = pgTable('tenant_line_channels', {
  id: pk(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  loginChannelId: text('login_channel_id'),
  channelId: text('channel_id'),
  channelSecretEnc: text('channel_secret_enc'),
  accessTokenEnc: text('access_token_enc'),
  liffId: text('liff_id'),
  connected: boolean('connected').notNull().default(false),
  features: jsonb('features').$type<{ richMenu: boolean; notifyPush: boolean; sendSlip: boolean }>()
    .notNull()
    .default({ richMenu: true, notifyPush: true, sendSlip: true }),
  createdAt: createdAt(),
});

// ---------- users (all roles; tenantId null only for super_admin) ----------
export const users = pgTable(
  'users',
  {
    id: pk(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    role: roleEnum('role').notNull().default('employee'),
    lineUserId: text('line_user_id'),
    name: text('name').notNull(),
    email: text('email'),
    department: text('department'),
    position: text('position'),
    employeeCode: varchar('employee_code', { length: 32 }),
    // console login (super_admin / org_admin / supervisor) — scrypt hash; employees use LINE
    passwordHash: text('password_hash'),
    // PII — encrypted at rest (AES-256-GCM ciphertext)
    nationalIdEnc: text('national_id_enc'),
    phoneEnc: text('phone_enc'),
    bankAccountEnc: text('bank_account_enc'),
    baseSalary: numeric('base_salary', { precision: 12, scale: 2 }),
    // payslip open password (hashed) — employee-set, NOT derived from PII
    payslipPasswordHash: text('payslip_password_hash'),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => ({
    tenantLineUq: uniqueIndex('users_tenant_line_uq').on(t.tenantId, t.lineUserId),
    tenantIdx: index('users_tenant_idx').on(t.tenantId),
  }),
);

// ---------- PDPA consents ----------
export const pdpaConsents = pgTable('pdpa_consents', {
  id: pk(),
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  version: varchar('version', { length: 32 }).notNull(),
  consented: boolean('consented').notNull().default(true),
  ip: varchar('ip', { length: 64 }),
  consentedAt: createdAt(),
});

// ---------- office locations (geofence) ----------
export const officeLocations = pgTable('office_locations', {
  id: pk(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  radiusM: integer('radius_m').notNull().default(150),
  createdAt: createdAt(),
});

// ---------- attendance ----------
export const attendanceRecords = pgTable(
  'attendance_records',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    workDate: date('work_date').notNull(),
    checkInAt: timestamp('check_in_at', { withTimezone: true }),
    checkOutAt: timestamp('check_out_at', { withTimezone: true }),
    checkInLat: doublePrecision('check_in_lat'),
    checkInLng: doublePrecision('check_in_lng'),
    officeId: uuid('office_id').references(() => officeLocations.id),
    status: attendanceStatusEnum('status').notNull().default('present'),
    createdAt: createdAt(),
  },
  (t) => ({
    userDateUq: uniqueIndex('attendance_user_date_uq').on(t.userId, t.workDate),
    tenantDateIdx: index('attendance_tenant_date_idx').on(t.tenantId, t.workDate),
  }),
);

// ---------- leave (approved by supervisor) ----------
export const leaveRequests = pgTable(
  'leave_requests',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    type: leaveTypeEnum('type').notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    days: numeric('days', { precision: 4, scale: 1 }).notNull(),
    reason: text('reason'),
    status: requestStatusEnum('status').notNull().default('pending'),
    approverId: uuid('approver_id').references(() => users.id),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => ({ tenantStatusIdx: index('leave_tenant_status_idx').on(t.tenantId, t.status) }),
);

// ---------- hire (employment start, approved by HR / org_admin) ----------
export const hireRequests = pgTable(
  'hire_requests',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    position: text('position'),
    department: text('department'),
    // applicant PII kept encrypted until approved
    nationalIdEnc: text('national_id_enc'),
    phoneEnc: text('phone_enc'),
    docsComplete: boolean('docs_complete').notNull().default(false),
    appliedAt: date('applied_at').notNull(),
    startDate: date('start_date'),
    status: requestStatusEnum('status').notNull().default('pending'),
    decidedBy: uuid('decided_by').references(() => users.id),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => ({ tenantStatusIdx: index('hire_tenant_status_idx').on(t.tenantId, t.status) }),
);

// ---------- payroll ----------
export const payrollRuns = pgTable('payroll_runs', {
  id: pk(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  period: varchar('period', { length: 7 }).notNull(), // YYYY-MM
  status: payrollStatusEnum('status').notNull().default('draft'),
  totalNet: numeric('total_net', { precision: 14, scale: 2 }).notNull().default('0'),
  createdAt: createdAt(),
});

export const payslips = pgTable(
  'payslips',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    runId: uuid('run_id').notNull().references(() => payrollRuns.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    gross: numeric('gross', { precision: 12, scale: 2 }).notNull(),
    deductions: numeric('deductions', { precision: 12, scale: 2 }).notNull(),
    net: numeric('net', { precision: 12, scale: 2 }).notNull(),
    pdfAssetId: text('pdf_asset_id'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => ({ runUserUq: uniqueIndex('payslip_run_user_uq').on(t.runId, t.userId) }),
);

// line items for a payslip (earnings / deductions)
export const salaryComponents = pgTable('salary_components', {
  id: pk(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  payslipId: uuid('payslip_id').notNull().references(() => payslips.id, { onDelete: 'cascade' }),
  kind: salaryKindEnum('kind').notNull(),
  label: text('label').notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
});

// ---------- invitations (super_admin invites org_admin; org_admin invites staff) ----------
export const invitations = pgTable('invitations', {
  id: pk(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  email: text('email'),
  role: roleEnum('role').notNull().default('org_admin'),
  token: text('token').notNull(),
  status: invitationStatusEnum('status').notNull().default('pending'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

// ---------- audit log (PDPA: track access/changes to personal data) ----------
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: pk(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entity: text('entity'),
    entityId: text('entity_id'),
    meta: jsonb('meta'),
    createdAt: createdAt(),
  },
  (t) => ({ tenantIdx: index('audit_tenant_idx').on(t.tenantId, t.createdAt) }),
);

export const schema = {
  tenants,
  tenantLineChannels,
  users,
  pdpaConsents,
  officeLocations,
  attendanceRecords,
  leaveRequests,
  hireRequests,
  payrollRuns,
  payslips,
  salaryComponents,
  invitations,
  auditLogs,
};
