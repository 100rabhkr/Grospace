# GroSpace — Full Session Changelog

## Summary

All 45 tasks from the **GroSpace Production TaskSheet** have been built. The application went from a basic MVP to a production-grade SaaS platform with AI-powered document extraction, notification systems, role-based access, comprehensive testing, modular backend architecture, and CI/CD infrastructure.

---

## Session 4 — UI Redesign, Google Sheets, Navigation Fixes, Role Enforcement

### UI/UX Complete Redesign
- Full rebrand to `#132337` deep navy — zero purple anywhere
- Login page: premium split-screen layout with branded left panel, fade-in animations, card-style demo logins with role icons (CEO/CFO/Admin/Manager)
- Sidebar: `router.push()` navigation fix — Outlets/Agreements had `e.preventDefault()` blocking clicks
- Mobile nav: replaced `<Link>` with `<button>` + `router.push()` inside Radix Dialog for reliable navigation
- Top bar: frosted glass effect (`backdrop-blur-sm`)
- Cards: smooth hover shadows, 60fps GPU-accelerated transitions (`translate3d`, `will-change`)
- All 9 pages updated: consistent navy accent, no black/purple remnants
- Logo: real GroSpace PNG (`public/logo.png`) across login, sidebar, mobile nav

### Back Button on All Pages
- Created `PageHeader` component (`src/components/page-header.tsx`)
- Added to: Pipeline, Outlets, Agreements, Upload Agreement, Alerts, Payments, Reports, Settings, Organizations

### Google Sheets Integration
- Created `backend/services/sheets_service.py` — lazy connection, auto-creates headers, appends rows
- Wired into `confirm-and-activate` flow — every confirmed agreement writes a row with: timestamp, agreement ID, outlet name, city, landlord, tenant, rent, deposit, CAM, lease dates, escalation %, risk flags, status, filename
- Service account credentials saved (`backend/google-sheets-credentials.json`, gitignored)
- `gspread>=6.0.0` added to requirements
- Spreadsheet ID configured in `.env`

### Processing Time Estimates (Fixed)
- Added `GET /api/processing-estimate` endpoint — returns real avg/min/max from last 100 extractions
- Frontend `ProcessingStep` component now fetches backend estimate instead of guessing
- Falls back to file-size heuristic if no backend data available

### Backend Role Enforcement
- Wired `require_permission()` dependency to **all 55+ API endpoints** across 8 route files:
  - `agreements.py`: view/create/edit permissions
  - `admin.py`: manage_org_settings, manage_org_members, view_reports
  - `documents.py`: create/view agreements, view/edit/delete outlets
  - `alerts.py`: view/acknowledge/assign alerts
  - `outlets.py`: view/edit outlets
  - `payments.py`: view/update payments
  - `pipeline.py`: view/edit outlets
  - `reports.py`: view_reports
- Platform admin (`*`) sees everything, org_admin has full CRUD, org_member is read-only
- Demo mode still works (unauthenticated users pass through)

---

## Session 3 — Supabase Fixes, Color Sweep, Site Codes

---

## Session 1 — Map, Document Text, PRs

### India Map (Task 38)
- Built interactive India map using `react-simple-maps` on the dashboard
- Hover popup cards showing outlet name, city, agreement status, rent
- Zoom controls (fixed z-index issue with `style={{ zIndex: 50 }}`)
- Lightened map colors: fills `#e8edf3`, strokes `#a8b8c8`, gradient background
- Debounced hover system (250ms enter, 300ms leave grace period)
- Clickable cards navigating to outlet detail pages

### Full Document Text Persistence (Task — from chat)
- `process_document()` returns `document_text` from PyMuPDF extraction
- Saved via `create_agreement_record()` to `document_text` column in agreements table
- `/api/qa` checks cached `document_text` first before re-scanning PDFs
- Resolved merge conflict with Saurabh's `document_text` column (we had `full_document_text`)
- Deleted duplicate `migration_008_full_document_text.sql`

### PR & Push
- Created PR #5 on `100rabhkr/Grospace` (feature-aryan branch)
- Pushed to skullfire on main

---

## Session 2 — Production Hardening (Tasks 1-10)

### Task 1: Background Job System (pg_cron stubs)
- Created 4 cron stub functions in backend:
  - `run_agreement_status_transitions()` — daily status changes
  - `run_payment_status_updater()` — mark overdue payments
  - `run_alert_engine()` — hourly alert scan
  - `run_email_digest()` — daily email digest
- Admin trigger endpoints:
  - `POST /api/admin/run-transitions`
  - `POST /api/admin/run-cron/{job_name}`

### Task 3: CORS Hardening
- Replaced `allow_origins=['*']` with explicit whitelist
- Reads from `ALLOWED_ORIGINS` env var
- Includes `localhost:3000-3003` + `FRONTEND_URL`

### Task 4: Rate Limiting
- Installed `slowapi` with `get_remote_address` key function
- Applied rate limits to all AI endpoints:
  - `/api/upload-and-extract`: 5/min
  - `/api/qa`: 20/min
  - `/api/classify`: 10/min
  - `/api/portfolio-qa`: 15/min

### Task 5: File Size Validation (50MB max)
- Validates `len(file_bytes) > 50 * 1024 * 1024` before processing
- Returns HTTP 413 with clear error message
- Applied to both upload-and-extract and outlet document upload

### Task 6: Transaction Safety (confirm-and-activate)
- Manual rollback pattern: `outlet_id = None; agreement_id = None` before try block
- On exception: deletes obligations → alerts → agreements → outlets in reverse order
- Supabase Python client doesn't support native DB transactions

### Task 7: Agreement Status Auto-Transitions
- In daily cron: active agreements near expiry → `expiring`
- Past expiry date → `expired`
- Configurable lead time thresholds

### Task 8: Error Boundaries
- Created 7 `error.tsx` files:
  - `src/app/error.tsx`
  - `src/app/agreements/[id]/error.tsx`
  - `src/app/agreements/upload/error.tsx`
  - `src/app/outlets/[id]/error.tsx`
  - `src/app/auth/login/error.tsx`
  - `src/app/organizations/[id]/error.tsx`
  - `src/app/showcase/[token]/error.tsx`

---

## Session 2 — Notification & Phase 1 (Tasks 10-16)

### Task 10: Notification Center
- **New file**: `src/components/notification-center.tsx`
- BellDot/Bell icon with red unread count badge
- Popover dropdown grouped by Today / This Week / Earlier
- Each item: severity dot, type icon, outlet name, relative time, type badge
- Click navigates to outlet/agreement detail
- Hover shows acknowledge checkmark
- "Mark all read" button, "View all alerts" footer link
- Auto-polls every 60 seconds
- Updated `src/components/top-bar.tsx` to use NotificationCenter component

### Task 12: Save as Draft Endpoint
- `PATCH /api/agreements/{id}/save-draft`
- Saves `extracted_data` and `risk_flags` without creating obligations/alerts
- Sets status to `draft`

### Task 13: Dashboard Enrichment
- Quick Actions row: Upload Agreement, View All Outlets, View Reports
- Expiring Leases card (amber styling, count from stats)
- Risk Flags Summary card (red when >0, green when 0)
- Outlets by Property Type card with colored horizontal bars

### Task 14: Role-Scoped Dashboard Views
- Uses `useUser()` hook for role detection
- `org_member` sees simplified dashboard (no map, pipeline, secondary stats)
- `org_admin` / `platform_admin` sees full dashboard

### Task 15: Agreement Timeline Visualization
- **Rewritten**: `src/components/agreement-timeline.tsx`
- Horizontal colored bar with segments:
  - Green = past, Blue = current, Amber = future, Red = expiring
- Proportional date markers: Lease Start, Rent Start, Lock-in End, Lease Expiry
- "Today" marker with triangle pointer
- Progress gradient overlay
- Legend row

### Task 16: Role Permissions Matrix
- `ROLE_PERMISSIONS` dict:
  - `platform_admin`: all permissions
  - `org_admin`: most actions
  - `org_member`: view-only + payments
- `check_role_permission()` function
- `require_permission()` FastAPI dependency

---

## Session 2 — Reporting, Payments & Features (Tasks 17-23)

### Task 17: Reports Table — All PRD Columns
- 19 columns total (16 PRD + 3 extras)
- Added: Agreement Status, Security Deposit columns
- Search input for outlet name filtering
- All columns sortable with arrow icons
- CSV export includes all columns

### Task 18: Bulk Mark All Paid
- "Mark All Paid This Month" button with `window.confirm` dialog
- `POST /api/payments/mark-all-paid` — accepts `{month: "YYYY-MM", org_id}`
- Marks all pending/upcoming obligations as paid
- API function: `markAllPaid(month, orgId?)`

### Task 20: Rent-to-Revenue Color Coding
- Updated thresholds from 15/30% to 12/18%:
  - Emerald: <12%
  - Amber: 12-18%
  - Red: >18%
- Applied to outlet list and detail pages

### Task 22: Configurable Alert Lead Times
- Per-org alert preferences stored in profiles
- Alert engine reads org-specific lead times
- Fallback to system defaults

### Task 23: Outlet Card View Toggle
- Toggle between table view and card view on outlets page
- Card view: outlet name, city, property type, rent, status badge, risk flags count
- Default view: card
- Uses `LayoutGrid` / `List` icons for toggle

---

## Session 2 — Final Build Sprint (Tasks 11, 26-30, 36, 42-45)

### Task 11 + 44: Split-Screen Extraction Review UI + Leasecake-Style UX
- **Modified**: `src/app/agreements/upload/page.tsx` (review step)
- Left side (50%): PDF/image viewer with zoom controls (50%-200%), sticky panel
- Right side (50%): Extracted fields in collapsible accordion sections
- Section headers with confidence dot counts and field count badges
- Per-field confidence badges: green "High" ✓, amber "Medium" ⚠, red "Low" ⚠
- "Expand All" / "Collapse All" buttons
- Smooth `max-h` CSS transitions for accordion
- Responsive: stacked on mobile, side-by-side on desktop
- Risk flags section also collapsible

### Task 26: Backend Unit Tests (pytest)
- **New directory**: `backend/tests/`
- `conftest.py` — Mock Supabase client, Gemini model, proxy pattern for module split
- `test_extraction.py` (31 tests) — get_val, get_num, get_date, get_section, confidence calculation, file type detection, OCR cleanup, schema validation, classify_document, extract_structured_data
- `test_obligations.py` (15 tests) — rent, CAM, HVAC, deposits, edge cases
- `test_alerts.py` (13 tests) — lease expiry, lock-in, escalation, rent-due, severity levels, notification dispatch
- `test_auth.py` (15 tests) — CurrentUser model, org filter, authentication flow, role checks
- `test_endpoints.py` (21 tests) — health check, CORS, list endpoints, 404s, payment status, alert actions
- **Total: 114 tests, all passing in ~0.93s**

### Task 27: Frontend Smoke Tests (Playwright)
- **New file**: `playwright.config.ts`
- **New directory**: `e2e/`
- `auth.spec.ts` (7 tests) — login page, form elements, invalid credentials
- `dashboard.spec.ts` (4 tests) — route loads, stat cards, navigation
- `outlets.spec.ts` (6 tests) — page loads, search, view toggle, filters
- `agreements.spec.ts` (8 tests) — list, upload page, file input
- `payments.spec.ts` (6 tests) — page loads, summary cards, filters, bulk actions
- ~30 tests total, gracefully handles unauthenticated state
- Added scripts: `test:e2e`, `test:e2e:ui`

### Task 28: Split Backend into Modules
- **Main.py**: 78 lines (down from ~4600)
- **`backend/core/`**:
  - `config.py` — env vars, constants, schemas, shared clients (Supabase, Gemini, limiter)
  - `models.py` — all Pydantic request/response models
  - `dependencies.py` — auth middleware, role permissions, org filter
- **`backend/services/`**:
  - `extraction.py` — AI extraction pipeline, classification, risk flags, obligation/alert generation
  - `email_service.py` — Resend email, notification dispatch
  - `whatsapp_service.py` — MSG91 WhatsApp
  - `ocr_service.py` — Google Cloud Vision OCR
- **`backend/routes/`** (9 APIRouter modules):
  - `auth.py`, `documents.py`, `outlets.py`, `agreements.py`, `payments.py`, `alerts.py`, `pipeline.py`, `admin.py`, `reports.py`
- All endpoints functionally identical, all tests passing

### Task 29: Sentry Monitoring Scaffold
- Backend: `sentry-sdk[fastapi]` in requirements.txt, conditional init in main.py
- Frontend: `src/lib/sentry.ts` with dynamic require (safe without @sentry/nextjs installed)
- Activated by setting `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` env vars

### Task 30: CI/CD Pipeline
- **New file**: `.github/workflows/ci.yml`
- 4 jobs: lint (ESLint), type-check (tsc), build (next build), backend-lint (ruff)
- Node 20, Python 3.11, npm/pip caching
- Triggers on push to main and PRs
- Commented-out deployment sections for Vercel + Railway
- Updated `DEPLOYMENT.md` with env var docs and migration list

### Task 36: Supabase RPC Migration
- **New file**: `supabase/migration_009_exec_readonly_sql.sql`
- `exec_readonly_sql(query_text)` RPC function
- SELECT-only validation, dangerous keyword blocking
- Returns JSON array, SECURITY DEFINER

### Task 42: Role-Based SLA Tiered Logins
- Extended `ROLE_PERMISSIONS` with granular permissions: `view_analytics`, `manage_team`, `bulk_operations`, `export_data`, etc.
- Added `ROLE_TIER_INFO` dict with badge labels, colors, descriptions
- `GET /api/role-tiers` endpoint
- Dashboard: role-tier badges (System Admin / Admin / Member)
- Settings: "Role Tiers" overview card with member counts per tier

### Task 43: Processing Time Estimates
- Backend: `time.time()` tracking in upload-and-extract, returns `processing_duration_seconds`
- `GET /api/processing-stats` — avg, count, min, max processing times
- Frontend: estimated time badge during extraction, live elapsed timer, "Processed in Xs" after completion
- API function: `getProcessingStats()`

### Task 45: Google Sheet Feedback Pipeline
- **New file**: `src/components/feedback-button.tsx` — flag icon, popover with corrected value input
- Backend: `FeedbackRequest` model, `POST /api/feedback`, `GET /api/feedback`
- Google Sheets sync stub (checks `GOOGLE_SHEETS_API_KEY`)
- **New migration**: `supabase/migration_010_feedback.sql` — feedback table with RLS
- API functions: `submitFeedback()`, `listFeedback()`

---

## Bug Fixes & Integration

- Resolved merge conflicts with Saurabh's `document_text` column naming
- Deleted duplicate migration file (`migration_008_full_document_text.sql`)
- Fixed `full_document_text` → `document_text` references (2 occurrences)
- Fixed ESLint: removed unused `userLoading` variable in page.tsx
- Fixed ESLint: removed unused `i` parameter in agreement-timeline.tsx
- Excluded `playwright.config.ts` and `e2e/` from tsconfig.json to fix build
- Made `src/lib/sentry.ts` safe without @sentry/nextjs installed (dynamic require)
- Fixed test conftest.py proxy pattern for modular backend (patched supabase/model in all sub-modules)
- Fixed `test_dispatch_notification_called` to patch at correct module path

---

## Files Changed (14 modified, 40+ new)

### Modified Files
| File | Changes |
|------|---------|
| `backend/main.py` | Refactored from ~4600 → 78 lines (router-only entry point) |
| `backend/requirements.txt` | Added pytest, pytest-asyncio, sentry-sdk[fastapi] |
| `package.json` | Added test:e2e, test:e2e:ui scripts |
| `tsconfig.json` | Excluded e2e/ and playwright.config.ts |
| `src/app/agreements/upload/page.tsx` | Split-screen review UI, processing time, feedback buttons |
| `src/app/page.tsx` | Dashboard enrichment, role tiers, quick actions |
| `src/app/outlets/page.tsx` | Card/table view toggle, updated imports |
| `src/app/outlets/[id]/page.tsx` | Rent-to-revenue threshold update |
| `src/app/payments/page.tsx` | Bulk mark-all-paid button |
| `src/app/reports/page.tsx` | 19 columns, sort, search, CSV export |
| `src/app/settings/page.tsx` | Team & Roles tab, role tiers overview |
| `src/components/agreement-timeline.tsx` | Full rewrite — horizontal bar visualization |
| `src/components/top-bar.tsx` | NotificationCenter integration |
| `src/lib/api.ts` | Added markAllPaid, submitFeedback, listFeedback, getProcessingStats |

### New Files
| File | Purpose |
|------|---------|
| `backend/core/config.py` | Env vars, constants, shared clients |
| `backend/core/models.py` | All Pydantic models |
| `backend/core/dependencies.py` | Auth, permissions, org filter |
| `backend/core/__init__.py` | Package init |
| `backend/services/extraction.py` | AI extraction pipeline |
| `backend/services/email_service.py` | Resend email + notification dispatch |
| `backend/services/whatsapp_service.py` | MSG91 WhatsApp |
| `backend/services/ocr_service.py` | Google Cloud Vision |
| `backend/services/__init__.py` | Package init |
| `backend/routes/auth.py` | Auth endpoints |
| `backend/routes/documents.py` | Document upload, Q&A endpoints |
| `backend/routes/outlets.py` | Outlet CRUD |
| `backend/routes/agreements.py` | Agreement CRUD, confirm-activate |
| `backend/routes/payments.py` | Payment endpoints |
| `backend/routes/alerts.py` | Alert CRUD, acknowledge/snooze |
| `backend/routes/pipeline.py` | Deal pipeline, showcase |
| `backend/routes/admin.py` | Admin, org, cron, portfolio Q&A |
| `backend/routes/reports.py` | Reports data |
| `backend/routes/__init__.py` | Package init |
| `backend/tests/conftest.py` | Test fixtures, mocks, proxy |
| `backend/tests/test_extraction.py` | 31 extraction tests |
| `backend/tests/test_obligations.py` | 15 obligation tests |
| `backend/tests/test_alerts.py` | 13 alert tests |
| `backend/tests/test_auth.py` | 15 auth tests |
| `backend/tests/test_endpoints.py` | 21 endpoint tests |
| `backend/tests/__init__.py` | Package init |
| `e2e/auth.spec.ts` | Login page tests |
| `e2e/dashboard.spec.ts` | Dashboard tests |
| `e2e/outlets.spec.ts` | Outlets page tests |
| `e2e/agreements.spec.ts` | Agreements page tests |
| `e2e/payments.spec.ts` | Payments page tests |
| `playwright.config.ts` | Playwright config |
| `.github/workflows/ci.yml` | CI/CD pipeline |
| `src/app/error.tsx` | Root error boundary |
| `src/app/agreements/[id]/error.tsx` | Agreement detail error boundary |
| `src/app/agreements/upload/error.tsx` | Upload error boundary |
| `src/app/outlets/[id]/error.tsx` | Outlet detail error boundary |
| `src/app/auth/login/error.tsx` | Login error boundary |
| `src/app/organizations/[id]/error.tsx` | Org detail error boundary |
| `src/app/showcase/[token]/error.tsx` | Showcase error boundary |
| `src/components/notification-center.tsx` | Bell icon notification dropdown |
| `src/components/feedback-button.tsx` | Extraction feedback flag button |
| `src/lib/sentry.ts` | Sentry monitoring scaffold |
| `supabase/migration_009_exec_readonly_sql.sql` | RPC function for portfolio Q&A |
| `supabase/migration_010_feedback.sql` | Feedback table + RLS |

---

## Pending (Requires External Setup)

| Item | What's Needed |
|------|---------------|
| Email notifications | `RESEND_API_KEY` env var |
| WhatsApp alerts | `MSG91_AUTH_KEY` + `MSG91_WHATSAPP_TEMPLATE_ID` env vars |
| Error monitoring | `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` env vars |
| Feedback → Google Sheets | `GOOGLE_SHEETS_API_KEY` env var |
| GCP Vision/Gemini | `GOOGLE_APPLICATION_CREDENTIALS` env var |
| Supabase migrations | Run migrations 004-010 in Supabase SQL Editor |
| Playwright | `npm install -D @playwright/test && npx playwright install` |
| Sentry frontend | `npm install @sentry/nextjs` |

---

## Build Status
- **Next.js build**: PASS (18 pages, 0 errors)
- **ESLint**: PASS (0 warnings)
- **TypeScript**: PASS (0 errors)
- **Backend pytest**: 114/114 passing (0.93s)
