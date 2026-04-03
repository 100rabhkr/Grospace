# GroSpace Changes — March 27-31, 2026

## Part 1: Design System Overhaul, Rebrand & Renames (PR #111 — Merged)

**43 files changed, +2910 / -1909 lines**

### UI/Design Overhaul
- Complete design system overhaul — premium light theme with consistent color palette
- Redesigned sidebar with nested navigation, collapsible sections, and role-based filtering
- Redesigned top bar with search, notifications bell, and user profile
- New dashboard layout with stat cards, quick actions, pipeline summary, map preview
- Outlet cards redesigned — prominent rent, area, photos, franchise model display
- Agreement detail page — split-screen PDF viewer + extracted data with confidence dots
- Settings page — tabbed interface (org, team, alerts, profile, templates, signups)
- Mobile-responsive navigation with hamburger menu
- Consistent card, badge, button, and input styling across all pages

### Branding & Naming Changes
- GrowBot → **Grow AI** (portfolio AI assistant)
- LeaseBot → **Lease AI** (public lease analysis tool)
- Alerts → **Reminders** (across sidebar, pages, API, database queries)
- Obligations → **Events** (throughout outlet detail, payments)
- Pipeline → **Lead Pipeline** (pre-signing lead management)

### AHAAR Demo Prep (Issues #80-87, #91)
- Rebrand to GroSpace AI — Real Estate Intelligence Platform
- Rename Upload Agreement → Upload Documents
- Document storage categories on outlet page
- Contacts tab on outlet detail page
- Remove timeline / expiring zone from outlet page
- Hide features for AHAAR demo
- Reports — PDF & XLS export
- Demo login & lead-capture sign-up form
- Design refresh — modern UI

### Leasebot Fixes
- Fixed sign-in flow — support demo session cookie auth
- Fixed sign-in buttons not navigating
- Fixed results page not showing full data after login
- Fixed auth detection + skip backend tests without secrets
- Fixed redirect URL encoding so convert param survives login redirect

---

## Part 2: Extraction Pipeline, Deep Audit & Meeting Completion

### Critical Bug Fixes

1. **Null ID constraint errors** — Added explicit `uuid.uuid4()` generation to all 17 Supabase table inserts across the entire backend (outlets, agreements, obligations, alerts, documents, activity_log, extraction_jobs, feedback, showcase_tokens, payment_records, etc.)

2. **Confirm & Activate crash** — Fixed to extract `org_id` from authenticated user's profile instead of relying on frontend to send it

3. **Create Draft crash** — Fixed 4 separate issues:
   - `get_or_create_demo_org()` was called with wrong args
   - Column name `filename` → `document_filename`
   - Column name `confidence` → `extraction_confidence`
   - `outlet_id` NOT NULL constraint — now creates a minimal placeholder outlet with `fit_out` status
   - `log_activity()` missing required positional args

4. **PDF Viewer crash** — `Object.defineProperty called on non-object` from pdfjs-dist v5. Fixed with dynamic import (`ssr: false`) and CDN worker URL

5. **Bulk upload polling memory leak** — `useEffect` had `[bulkJobs]` dependency causing infinite interval recreation. Changed to ref-based approach with `hasProcessing` boolean dependency

6. **Bulk upload file input** — `document.createElement("input").click()` blocked by some browsers. Replaced with persistent hidden file input in DOM

7. **Bulk upload org_id null** — `extraction_jobs` table has NOT NULL on `org_id`. Added fallback to `get_or_create_demo_org()`

8. **page_size 422 errors** — Frontend requested `page_size=500` but backend max was 100. Raised limit to 500 across all paginated endpoints

9. **Missing `/api/admin/log-usage`** — Dashboard called this endpoint but it didn't exist. Added endpoint that logs to `activity_log` table

10. **Agreements type check constraint** — `lease_agreement` is not a valid type. Fixed to use `lease_loi`

11. **Leasebot redirect URL encoding** — Middleware set `url.pathname` with `?convert=true` which got treated as literal path chars. Fixed to properly split path and query params

12. **Backend lint** — Removed unused `send_whatsapp_via_msg91` import

13. **Null safety checks** — Added to `create_organization`, `create_pilot` (admin + CEO user), and `bulk_mark_paid` endpoints

---

### Meeting Mar 22 — All 15 Issues Completed

#### Branding & Naming
- **#96** Unified GrowBot + LeaseBot → Grow AI brand. Sidebar nests "Chat" and "Lease AI" under "Grow AI". AI grounded with India lease playbook. Deterministic question flows (4 categories: Risk Scan, Rent Analysis, Compliance Check, Lease Health)
- **#97** Renamed Alerts → Reminders throughout sidebar, pages, API
- **#98** Renamed Obligations → Events throughout app

#### UI & Layout
- **#99** Map View moved to standalone page in sidebar
- **#101** Pipeline re-scoped as Lead Pipeline (Lead → Site Visit → Negotiation → LOI → Agreement → Fitout → Operational). Added "Beta" badge
- **#102** Dashboard cleaned up — stat cards, quick actions, pipeline summary, map preview, expiring leases, risk flags
- **#103** Outlet cards show rent, area (super/covered/carpet sqft), photos, franchise model, rent-to-revenue ratio

#### Business Logic
- **#104** Complex rent model support — fixed, revenue share, hybrid MGLR, percentage-only with escalation schedules, GST. MGLR tooltips added
- **#105** Reminders/Events workflow — ownership, snooze (custom duration), assign, acknowledge, calendar view, create/edit/delete custom reminders
- **#100** Draft Lease Review module — upload → draft review → save draft → view in agreements (filter by Draft) → Activate Agreement button. Export Review as .txt file

#### Technical
- **#106** OCR verification — field verification checkboxes, lease/license filter buttons, document type override dropdown
- **#108** Clean pilot environment — seed/cleanup API endpoints, manual SQL cleanup
- **#109** Pilot usage logging — `/api/admin/log-usage` wired to `activity_log`. Feedback button on every field syncs to Google Sheets

---

### India Lease Playbook — Full Coverage

#### 15 New Extraction Fields Added
- **Premises**: `parking_slots`, `parking_details`, `signage_rights`, `signage_approval_required`
- **Charges**: `marketing_charges_monthly`, `marketing_charges_per_sqft`
- **Legal**: `force_majeure_clause`, `force_majeure_details`, `exclusivity_clause`, `exclusivity_details`, `co_tenancy_clause`, `subleasing_allowed`, `subleasing_conditions`, `trading_hours`, `title_clear`

#### 8 India-Specific Risk Flags (Code-Based)
1. No force majeure clause → medium risk
2. No exclusivity clause → medium risk
3. No co-tenancy clause (mall properties) → low risk
4. Lock-in period > 3 years → medium risk
5. No subleasing allowed → low risk
6. Escalation > 10% → medium risk
7. No parking allocation (mall/high street) → low risk
8. Security deposit > 6 months → medium risk

#### New Enums
- **Franchise model**: Added `FICO` (Franchise Invested, Company Operated)
- **Property type**: Added `educational_hub`

---

### Bulk Upload Improvements
- Added "uploading" state with pulsing upload icon before "processing" state
- Persistent hidden file input (browser compatibility fix)
- Back-to-Queue button shows count of remaining completed jobs
- Activated jobs removed from queue automatically
- PDF preview for bulk results uses `document_url` from extraction
- Improved help text explaining the bulk upload workflow

---

### Lease AI (LeaseBot) Improvements
- Improved processing animation with progress bar, gradient icons, and contextual description
- Fixed redirect URL encoding after login
- Processing steps animation fixed (`useState` → `useEffect`)

---

### Additional Closed Issues (Linear-Synced)
- **#66** Role-based platform access — permission matrix enforced
- **#70** Sentry + health check — SDK integrated, `/api/health` endpoint
- **#71** Custom obligations CRUD — create/update/delete manual obligations
- **#72** Revenue tracking UI — input on outlet detail, CSV upload, rent-to-revenue ratio
- **#73** License tracking — detection, dashboard widget, filter buttons
- **#74** Leasebot SEO — public page, health gauge, gated results, convert flow
- **#88** Revenue CSV Upload — fuzzy outlet matching, frequency dropdown
- **#90** Admin draft storage — draft review mode + activate button
- **#95** Bulk upload limit = 10 — frontend + backend enforcement

---

### Deep Audit Results
- **Frontend**: All 15 pages audited — zero broken buttons or missing handlers
- **Backend**: 77 endpoints verified, 4 null safety bugs fixed
- **All CI checks passing**: Backend lint, ESLint, TypeScript, Next.js build

### Deployment
- **Frontend**: Vercel (grospace-sandy.vercel.app) — auto-deploys from SKULLFIRE07/grospace main
- **Backend**: Railway (grospace-production.up.railway.app) — auto-deploys from SKULLFIRE07/grospace main /backend
- **PRs**: #111 (Part 1, merged), #112 (Part 2)
- **Total commits in session**: 30+
- **Files changed**: 25+
