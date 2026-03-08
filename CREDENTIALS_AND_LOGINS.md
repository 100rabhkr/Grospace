# GroSpace — Credentials, Logins & Environment Variables

## SLA-Tiered Demo Logins

Login page has 4 quick-access buttons — one per role tier. Each sees a different dashboard.

| Title | Email | Password | Role | Dashboard View |
|-------|-------|----------|------|----------------|
| **CEO** | `ceo@grospace.in` | `ceo2025` | `platform_admin` | Full dashboard + system health + all-org switcher + system settings |
| **CFO** | `cfo@grospace.in` | `cfo2025` | `platform_admin` | Full dashboard + analytics + financial overview |
| **Admin** | `admin@grospace.in` | `admin2025` | `org_admin` | Full dashboard + manage team + full analytics |
| **Manager** | `manager@grospace.in` | `manager2025` | `org_member` | Simplified dashboard, view-only + payment marking |

### Role Permissions

| Permission | CEO/CFO (platform_admin) | Admin (org_admin) | Manager (org_member) |
|------------|--------------------------|--------------------|-----------------------|
| View all organizations | Yes | No (own org only) | No (own org only) |
| Create/edit outlets | Yes | Yes | No |
| Upload agreements | Yes | Yes | No |
| Confirm & activate | Yes | Yes | No |
| Mark payments as paid | Yes | Yes | Yes |
| View reports + export CSV | Yes | Yes | View only |
| Manage team members | Yes | Yes | No |
| System settings | Yes | No | No |
| India Map + Pipeline | Yes | Yes | No |
| Portfolio Q&A | Yes | Yes | No |

---

## Environment Variables

### Frontend (.env.local)

| Variable | Description | Where to Get | Status |
|----------|-------------|--------------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Supabase Dashboard → Settings → API | **SET** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key | Supabase Dashboard → Settings → API | **SET** |
| `NEXT_PUBLIC_API_URL` | Backend API URL | Railway deployment URL or `http://localhost:8000` | **SET** |
| `NEXT_PUBLIC_APP_URL` | Frontend URL | Vercel URL or `http://localhost:3000` | **SET** |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry DSN for frontend | Sentry → Project Settings → Client Keys | **NEEDED** |

### Backend (backend/.env)

| Variable | Description | Where to Get | Status |
|----------|-------------|--------------|--------|
| `SUPABASE_URL` | Supabase project URL | Supabase Dashboard → Settings → API | **SET** |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (admin) | Supabase Dashboard → Settings → API | **SET** |
| `GEMINI_API_KEY` | Google Gemini API key | Google AI Studio → API Keys | **SET** |
| `FRONTEND_URL` | Frontend URL for CORS | Vercel URL | **SET** |
| `PORT` | Backend port | Default: 8000 | **SET** |
| `ALLOWED_ORIGINS` | Comma-separated allowed CORS origins | Your domains | Optional |
| `RESEND_API_KEY` | Resend email API key | resend.com → API Keys | **NEEDED** |
| `MSG91_AUTH_KEY` | MSG91 auth key for WhatsApp | MSG91 Dashboard → API Keys | **NEEDED** |
| `MSG91_WHATSAPP_TEMPLATE_ID` | WhatsApp template ID | MSG91 → WhatsApp Templates | **NEEDED** |
| `SENTRY_DSN` | Sentry DSN for backend | Sentry → Project Settings → Client Keys | **NEEDED** |
| `GOOGLE_APPLICATION_CREDENTIALS` | GCP service account JSON path | GCP Console → IAM → Service Accounts | **NEEDED** |
| `GOOGLE_SHEETS_API_KEY` | Google Sheets API key for feedback | GCP Console → APIs → Credentials | **NEEDED** |

---

## Service Accounts & Where to Get Them

### 1. Supabase (Database + Auth + Storage)
- **Dashboard**: https://supabase.com/dashboard
- **What you need**: Project URL, Anon Key, Service Role Key
- **Where**: Settings → API → Project URL / Project API keys
- **Migrations to run**: Execute `migration_004` through `migration_010` in SQL Editor

### 2. Google Gemini (AI Document Understanding)
- **Dashboard**: https://aistudio.google.com/
- **What you need**: API Key
- **Where**: Get API Key → Create API key

### 3. Google Cloud Vision (OCR)
- **Dashboard**: https://console.cloud.google.com/
- **What you need**: Service Account JSON key
- **Steps**:
  1. Enable Cloud Vision API
  2. Create service account with `roles/visionai.user`
  3. Create JSON key → download
  4. Set `GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json`

### 4. Resend (Email Notifications)
- **Dashboard**: https://resend.com/
- **What you need**: API Key
- **Steps**:
  1. Sign up at resend.com
  2. Verify your sending domain (or use onboarding@resend.dev for testing)
  3. Go to API Keys → Create API Key
  4. Set `RESEND_API_KEY=re_xxxxx`

### 5. MSG91 (WhatsApp Alerts)
- **Dashboard**: https://msg91.com/
- **What you need**: Auth Key + WhatsApp Template ID
- **Steps**:
  1. Sign up at msg91.com
  2. Go to WhatsApp → Create templates (rent_due, lease_expiry, etc.)
  3. Get Auth Key from API Keys section
  4. Set `MSG91_AUTH_KEY=xxxxx` and `MSG91_WHATSAPP_TEMPLATE_ID=xxxxx`

### 6. Sentry (Error Monitoring)
- **Dashboard**: https://sentry.io/
- **What you need**: 2 DSN strings (frontend + backend)
- **Steps**:
  1. Create org at sentry.io
  2. Create project: Next.js → get `NEXT_PUBLIC_SENTRY_DSN`
  3. Create project: FastAPI/Python → get `SENTRY_DSN`
  4. Install: `npm install @sentry/nextjs` (frontend)

### 7. Google Sheets (Feedback Pipeline)
- **Dashboard**: https://console.cloud.google.com/
- **What you need**: API Key + target Sheet ID
- **Steps**:
  1. Enable Google Sheets API in GCP Console
  2. Create API key (or use the same service account)
  3. Create a Google Sheet for feedback collection
  4. Set `GOOGLE_SHEETS_API_KEY=xxxxx`

---

## Deployment URLs

| Service | Platform | URL |
|---------|----------|-----|
| Frontend | Vercel | `https://grospace.vercel.app` (or custom domain) |
| Backend | Railway | `https://grospace-ai.up.railway.app` (or custom) |
| Database | Supabase | `https://xxxxx.supabase.co` |
| Monitoring | Sentry | `https://xxxxx.sentry.io` |

---

## Supabase Migrations (Run in Order)

Run these in Supabase SQL Editor (Dashboard → SQL Editor):

1. `supabase/schema.sql` — Base schema (if fresh project)
2. `supabase/migration_004_deal_pipeline.sql` — Pipeline & showcase tables
3. `supabase/migration_005_phone_rls_fixes.sql` — RLS policy fixes
4. `supabase/migration_006_missing_indexes.sql` — Performance indexes
5. `supabase/migration_007_background_jobs.sql` — Background job tables
6. `supabase/migration_008_site_code_and_text_cache.sql` — Site codes + document text cache
7. `supabase/migration_009_exec_readonly_sql.sql` — RPC function for portfolio Q&A
8. `supabase/migration_010_feedback.sql` — Feedback table

---

## Quick Start Commands

```bash
# Frontend
cd grospace
npm install
npm run dev          # http://localhost:3000

# Backend
cd grospace/backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Tests
cd grospace/backend && python -m pytest tests/ -v     # 114 tests
cd grospace && npm run build                           # Build check
cd grospace && npx eslint src/ --ext .ts,.tsx          # Lint check

# E2E Tests (after installing Playwright)
npm install -D @playwright/test
npx playwright install
npm run test:e2e
```

---

## Task Sheet Status

All 45 tasks from GroSpace_Production_TaskSheet_Aryan(2).xlsx are **DONE**.
- Task 9 (Run migrations): Code ready, manual step in Supabase SQL Editor
- Task 37 (GCP setup): Setup guide ready, manual step in GCP Console
- Tasks 2, 19, 29, 45: Code built with stubs — activate by setting env vars above
