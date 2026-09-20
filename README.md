# Poszee Attendance — ระบบลงเวลาเข้างานผ่าน LINE (SaaS)

Multi-tenant HR/attendance platform delivered through **LINE** (LIFF + Messaging API).
Super Admin creates หน่วยงาน (tenants); each tenant's org admin (HR) manages employees,
attendance, leave, employment approval and payroll. Domain: `hr.poszee.com`
(tenants at `<org>.poszee.com`).

## Monorepo layout

```
apps/
  api/        NestJS API (auth, tenants, attendance, leave, hire, payroll, LINE webhook)
  liff/       Employee LIFF app (React + Vite) — check-in, leave, payslip
  console/    Web console (React + Vite) — HR (org admin) + Super Admin (platform)
packages/
  db/         Drizzle ORM schema + migrations + seed + reset (PostgreSQL)
  shared/     Shared types, roles, enums, constants
*.dc.html     UI design canvas source (artboards) at repo root — see the published Design canvas
ops/nginx/    Reverse-proxy config (hr.poszee.com + *.poszee.com, TLS)
Jenkinsfile   CI/CD pipeline (runs on the droplet's Jenkins → deploys via docker compose)
```

## Stack

- **Backend:** Node 20 · TypeScript · NestJS · Drizzle ORM · PostgreSQL · Redis + BullMQ
- **Frontend:** React 18 · Vite · `@line/liff`
- **LINE:** `@line/bot-sdk` (Messaging API push, webhook), LINE Login, LIFF, Rich Menu
- **Infra:** Docker Compose (postgres, redis, api, nginx) · Jenkins CI/CD → droplet `167.99.66.6`

## Multi-tenancy & roles

Shared DB + `tenant_id` on every domain table; every query is tenant-scoped by a
tenant guard. Roles: `super_admin` > `org_admin` (HR) > `supervisor` > `employee`.
Leave is approved by **supervisor**; employment start is approved by **HR (org admin)**.
Super Admin never sees tenant PII — only aggregate counts (PDPA).

## Getting started (dev)

```bash
cp .env.example .env          # then edit secrets
pnpm install
docker compose up -d postgres redis
pnpm db:migrate               # apply schema
pnpm db:seed                  # demo tenant + users
pnpm dev                      # api + liff + console in parallel
```

Reset the database anytime (drop → migrate → seed):

```bash
pnpm db:reset
```

## PDPA / security notes

- PII (national ID, bank, contact) encrypted at rest; access limited to the owning tenant's HR.
- Payslip PDFs are password-protected with the employee's **own** password (not derived from PII)
  and delivered via LINE.
- Tenant LINE channel credentials are encrypted (AES-256-GCM) per tenant.
- `audit_logs` records access/changes to personal data.

> Design canvas (UI reference): see the published Design artifact link shared in-session.
