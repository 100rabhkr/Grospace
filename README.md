# GroSpace

**AI-first Lease & Outlet Management Platform for Indian F&B and Retail Brands**

GroSpace automates lease abstraction, obligation tracking, and risk detection for commercial real estate. Upload a lease PDF and watch AI extract every clause, date, financial term, and red flag in seconds.

## Live Demo

| Service | URL |
|---------|-----|
| Frontend | https://grospace-sandy.vercel.app |
| Backend API | https://grospace-production.up.railway.app |
| Health Check | https://grospace-production.up.railway.app/api/health |
| API Docs | https://grospace-production.up.railway.app/docs |

**Demo Access:** Click any role on the login page (CEO, CFO, Admin, Manager)

---

## Features

### Core Platform
- **AI Document Extraction** — Upload any lease/LOI/license PDF. Gemini 2.5 Flash extracts 50+ structured fields with confidence scores.
- **Risk Flag Detection** — Automatically detects 8 common lease red flags: unilateral relocation, predatory interest, missing lock-in, excessive deposits, and more.
- **Confirm & Activate Flow** — One-click atomic transaction to save extracted data, auto-generate obligations, schedule alerts, and create outlet records.
- **Document Q&A** — Ask natural language questions about any uploaded document and get answers with clause references.
- **Multi-Tenant Architecture** — Organizations, roles (platform admin, org admin, org member), and Row Level Security.

### Leasebot (Public Lead Generation)
- **Public Lease Analysis** — No login required. Upload a lease at `/leasebot` and get an AI analysis in 90 seconds.
- **Health Score** — 0-100 score with color coding (green 70+, amber 40-69, red 0-39).
- **Gated Results** — Preview is free (health score, document type, 3 sample fields). Full extraction requires signup.
- **Conversion Flow** — "Sign up to unlock" → account created → analysis converted to agreement in dashboard.

### Portfolio Management
- **Outlet Tracking** — Track all outlets across cities with card/table view toggle, status tracking (pipeline, fit-out, operational, renewal, closed).
- **Revenue Tracking** — Manual entry or CSV import of monthly revenue per outlet. Trend charts with rent-to-revenue ratio.
- **MGLR Calculator** — Hybrid rent calculation: compare fixed rent vs revenue share percentage, show effective payable.
- **License Tracking** — Active licenses per outlet with traffic light indicators (green/amber/red by days to expiry).
- **Outlet Photos** — Upload and manage outlet photos with thumbnail grid.

### Financial Management
- **Obligation Tracking** — Auto-extracted + custom manual obligations (rent, CAM, HVAC, electricity, insurance, etc.).
- **Payment Records** — Monthly payment tracking with bulk "Mark All Paid" and per-payment actions.
- **Revenue Analytics** — Portfolio-wide revenue summary with MoM change and sparkline on dashboard.

### Alerts & Monitoring
- **Smart Alerts** — Automated alerts for rent due dates, lease expiry (180/90/30/7 days), lock-in periods, escalation dates.
- **Calendar View** — Toggle between list and calendar view on alerts page with severity-colored dots.
- **Due This Week Widget** — Dashboard card showing payments due in the next 7 days with quick "Mark as Paid".

### Intelligence
- **GroBot AI Chat** — Portfolio-wide Q&A with categorized suggestions (Portfolio, Risks, Agreements, Insights).
- **Cross-Portfolio Analysis** — SQL-powered natural language queries across all agreements and outlets.
- **Risk Scoring** — Health score gauge on agreement detail pages.

### Administration
- **Role-Based Access** — Sidebar items filtered by role. Upload/Pipeline/Settings hidden from org_member.
- **Pilot Provisioning** — One API call to create a fully populated pilot account with outlets, agreements, payments, and alerts.
- **Smart Onboarding** — 4-step checklist for new users (upload lease, review data, check alerts, invite team).
- **Deal Pipeline** — Kanban board for tracking outlet deals through stages (Lead → Site Visit → Negotiation → LOI → Fit-out → Operational).

### Infrastructure
- **Background Jobs** — pg_cron schedules for payment updates, agreement transitions, and escalation calculations.
- **Sentry Monitoring** — Optional error tracking for backend and frontend (set SENTRY_DSN to activate).
- **Health Check** — `/api/health` returns version, environment, timestamp, and database connectivity status.
- **CI/CD Pipeline** — GitHub Actions for lint, build, and backend tests.
- **Bulk Upload** — Async extraction with background processing, job polling, support for up to 10 files.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui, Lucide Icons |
| Backend | FastAPI (Python), Google Gemini 2.5 Flash, PyMuPDF, Google Cloud Vision |
| Database | Supabase (PostgreSQL + Auth + Storage + RLS + pg_cron) |
| Deployment | Vercel (frontend), Railway (backend) |
| Monitoring | Sentry (optional), GitHub Actions CI |

---

## Architecture

```
                    +------------------+
                    |    Vercel        |
                    |  Next.js 14     |
                    |  (Frontend)     |
                    +--------+---------+
                             |
                    REST API calls
                             |
                    +--------v---------+
                    |    Railway       |
                    |  FastAPI + AI    |
                    |  (Backend)      |
                    +--------+---------+
                             |
              +--------------+--------------+
              |              |              |
     +--------v-------+ +---v----+ +-------v--------+
     |   Supabase     | | Gemini | | Cloud Vision   |
     |  PostgreSQL +  | | 2.5    | | (OCR fallback) |
     |  Auth+Storage  | | Flash  | |                |
     +----------------+ +--------+ +----------------+
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.11+
- Supabase account
- Google AI API key (Gemini)

### 1. Clone & Install

```bash
git clone https://github.com/SKULLFIRE07/grospace.git
cd grospace

# Frontend
npm install

# Backend
cd backend
pip install -r requirements.txt
cd ..
```

### 2. Environment Setup

Create `.env.local` in the root:

```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Create `backend/.env` (copy from `backend/.env.example`):

```env
GEMINI_API_KEY=your-gemini-api-key
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
FRONTEND_URL=http://localhost:3000
PORT=8000
```

### 3. Database Setup

Run these in Supabase SQL Editor in order:

1. `supabase/schema.sql` — Core tables, indexes, RLS policies
2. `supabase/migration_004_deal_pipeline.sql` — Pipeline columns + showcase tokens
3. `supabase/migration_007_background_jobs.sql` — Background job functions
4. `supabase/migration_014_leasebot.sql` — Leasebot analyses table
5. `supabase/migration_015_outlet_revenue.sql` — Revenue tracking table
6. `supabase/migration_016_extraction_jobs.sql` — Extraction jobs + obligation sources
7. `supabase/migration_015_confirm_activate_tx.sql` — Atomic transaction function

### 4. Run

```bash
# Terminal 1: Backend
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2: Frontend
npm run dev
```

Open http://localhost:3000

### 5. Create Pilot Account (Optional)

```bash
curl -X POST http://localhost:8000/api/admin/create-pilot \
  -H "Content-Type: application/json" \
  -d '{
    "client_name": "Tan Coffee",
    "brand_name": "Tan Coffee",
    "cities": ["Mumbai", "Delhi", "Bengaluru"],
    "num_outlets": 6,
    "admin_email": "admin@tancoffee.com",
    "admin_password": "TanCoffee2026"
  }'
```

---

## Customer Onboarding Flow

### Self-Service (via Leasebot)
1. Visit `/leasebot` (no login required)
2. Upload a lease PDF → get AI analysis in 90 seconds
3. See preview: health score, document type, key terms
4. Sign up to unlock full extraction + risk details
5. Convert analysis to a full agreement in dashboard
6. Guided onboarding checklist walks through first steps

### Assisted Setup (via Pilot Provisioning)
1. Admin calls `POST /api/admin/create-pilot` with client details
2. System creates: organization, users, sample outlets, agreements, obligations, payments, alerts
3. Client logs in and sees a fully populated dashboard immediately

---

## API Endpoints

### Document Processing
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/upload-and-extract` | Yes | Upload PDF, get AI extraction |
| POST | `/api/upload-and-extract-async` | Yes | Async extraction with job ID |
| GET | `/api/extraction-jobs/{id}` | Yes | Poll extraction job status |
| POST | `/api/confirm-and-activate` | Yes | Atomic save: outlet + agreement + obligations + alerts |
| POST | `/api/classify` | Yes | Classify document type |
| POST | `/api/qa` | Yes | Ask questions about a document |
| POST | `/api/risk-flags` | Yes | Analyze document for risk flags |

### Leasebot (Public)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/leasebot/analyze` | No | Upload PDF for public lease analysis |
| GET | `/api/leasebot/results/{token}` | Optional | Get analysis (preview or full) |
| POST | `/api/leasebot/convert/{token}` | Yes | Convert analysis to agreement |

### Portfolio
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/outlets` | Yes | List all outlets |
| GET | `/api/outlets/{id}` | Yes | Get outlet with full details |
| POST | `/api/outlets/{id}/revenue` | Yes | Upsert monthly revenue |
| GET | `/api/outlets/{id}/revenue` | Yes | List revenue with date range |
| POST | `/api/revenue/upload-csv` | Yes | Import revenue from CSV |
| GET | `/api/revenue/summary` | Yes | Org-wide revenue by month |

### Obligations & Payments
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/outlets/{id}/obligations` | Yes | Create custom obligation |
| PATCH | `/api/obligations/{id}` | Yes | Update obligation (manual only) |
| DELETE | `/api/obligations/{id}` | Yes | Delete obligation (manual only) |
| GET | `/api/payments` | Yes | List payment records |
| POST | `/api/payments/bulk-mark-paid` | Yes | Bulk mark payments as paid |
| POST | `/api/payments/mark-all-paid` | Yes | Mark all paid for current month |

### Admin
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/admin/create-pilot` | Yes | Create pilot organization with sample data |
| POST | `/api/cron` | Secret | Run all background jobs |
| GET | `/api/dashboard` | Yes | Dashboard statistics |
| POST | `/api/smart-chat` | Yes | Portfolio-wide AI Q&A |

### System
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/health` | No | Health check with DB status |
| GET | `/docs` | No | Swagger API documentation |

---

## Database Schema

13 tables with full Row Level Security:

| Table | Description |
|-------|-------------|
| `organizations` | Brands/companies |
| `profiles` | User profiles with roles (extends Supabase auth) |
| `outlets` | Physical store locations with deal pipeline |
| `agreements` | Lease/license documents with extracted data |
| `obligations` | Recurring payment obligations (auto-extracted + manual) |
| `payment_records` | Payment tracking with status workflow |
| `alerts` | Smart notifications with snooze/acknowledge |
| `documents` | Uploaded files per outlet |
| `document_qa_sessions` | AI Q&A conversation history |
| `activity_log` | Audit trail |
| `showcase_tokens` | Public shareable outlet pages |
| `leasebot_analyses` | Public lease analysis with token access |
| `outlet_revenue` | Monthly revenue tracking per outlet |
| `extraction_jobs` | Background extraction job queue |

---

## Project Structure

```
grospace/
├── src/
│   ├── app/
│   │   ├── page.tsx                   # Dashboard
│   │   ├── leasebot/                  # Public lease analysis
│   │   │   ├── page.tsx               # Landing page + upload
│   │   │   └── results/[id]/page.tsx  # Results + gated content
│   │   ├── agreements/                # Agreement management
│   │   │   ├── page.tsx               # List all agreements
│   │   │   ├── [id]/page.tsx          # Detail + Q&A + health score
│   │   │   └── upload/page.tsx        # Upload (single + bulk)
│   │   ├── outlets/                   # Outlet portfolio
│   │   │   ├── page.tsx               # Card/table view
│   │   │   └── [id]/page.tsx          # Detail + revenue + photos
│   │   ├── alerts/page.tsx            # Alerts (list + calendar view)
│   │   ├── payments/page.tsx          # Payment tracking
│   │   ├── pipeline/page.tsx          # Deal pipeline (Kanban)
│   │   ├── ai-assistant/page.tsx      # GroBot full-page chat
│   │   ├── map/page.tsx               # India map view
│   │   ├── reports/page.tsx           # Analytics + export
│   │   ├── settings/page.tsx          # Organization settings
│   │   ├── organizations/             # Multi-org management
│   │   └── auth/login/page.tsx        # Login + demo access
│   ├── components/
│   │   ├── app-shell.tsx              # Layout wrapper
│   │   ├── sidebar.tsx                # Navigation (role-filtered)
│   │   ├── health-score-gauge.tsx     # Reusable SVG gauge
│   │   ├── onboarding-checklist.tsx   # Smart onboarding
│   │   └── ui/                        # shadcn/ui primitives
│   └── lib/
│       ├── api.ts                     # Backend API client
│       ├── sentry.ts                  # Error monitoring
│       └── supabase/                  # Supabase client + middleware
├── backend/
│   ├── main.py                        # FastAPI app setup
│   ├── routes/
│   │   ├── leasebot.py                # Public lease analysis API
│   │   ├── revenue.py                 # Revenue tracking API
│   │   ├── documents.py               # Upload + extraction
│   │   ├── agreements.py              # Agreement CRUD
│   │   ├── payments.py                # Payments + obligations
│   │   ├── admin.py                   # Admin + pilot provisioning
│   │   ├── outlets.py                 # Outlet CRUD
│   │   ├── alerts.py                  # Alert management
│   │   └── pipeline.py               # Deal pipeline
│   ├── services/
│   │   ├── extraction.py              # AI extraction engine
│   │   └── ocr_service.py            # Cloud Vision OCR
│   ├── core/
│   │   ├── config.py                  # App configuration
│   │   ├── models.py                  # Pydantic models
│   │   └── dependencies.py           # Auth + permissions
│   └── requirements.txt
├── supabase/
│   ├── schema.sql                     # Core database schema
│   └── migration_*.sql               # Incremental migrations
└── .github/
    └── workflows/ci.yml              # CI pipeline
```

---

## Environment Variables

### Railway (Backend)
| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Google AI API key |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key |
| `FRONTEND_URL` | Yes | Frontend URL for CORS |
| `PORT` | Yes | Server port (Railway sets automatically) |
| `CRON_SECRET` | Yes | Secret for `/api/cron` endpoint |
| `GOOGLE_CLOUD_CREDENTIALS_JSON` | Optional | GCP service account JSON for Cloud Vision OCR |
| `SENTRY_DSN` | Optional | Sentry error tracking DSN |

### Vercel (Frontend)
| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key |
| `NEXT_PUBLIC_API_URL` | Yes | Backend API URL |
| `NEXT_PUBLIC_APP_URL` | Yes | Frontend URL |
| `NEXT_PUBLIC_SENTRY_DSN` | Optional | Sentry error tracking DSN |

---

## License

MIT
