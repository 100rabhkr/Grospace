# GroSpace

**AI-first Lease & Outlet Management Platform for Indian F&B and Retail Brands**

GroSpace automates lease abstraction, obligation tracking, and risk detection for commercial real estate. Upload a lease PDF and watch AI extract every clause, date, financial term, and red flag in seconds.

## Live Demo

| Service | URL |
|---------|-----|
| Frontend | https://grospace-sandy.vercel.app |
| Backend API | https://grospace-production.up.railway.app |
| Health Check | https://grospace-production.up.railway.app/api/health |

**Demo Login:** `demo@grospace.com` / `demo2025`

---

## Features

- **AI Document Extraction** — Upload any lease/LOI PDF. Gemini 2.5 Pro extracts 50+ structured fields: parties, premises, rent schedules, escalation clauses, deposits, legal terms, franchise details.
- **Risk Flag Detection** — Automatically detects 8 common lease red flags: unilateral relocation, predatory interest, missing lock-in, excessive deposits, uncapped revenue share, and more.
- **Confidence Scoring** — Every extracted field gets a confidence badge (High/Medium/Low) so you know what to double-check.
- **Confirm & Activate Flow** — One-click to save extracted data, auto-generate obligations, schedule alerts, and create outlet records.
- **Outlet Portfolio Management** — Track all outlets across cities with status tracking (pipeline, fit-out, operational, renewal, closed).
- **Agreement Lifecycle** — Manage agreements from draft to active to expiry with automatic status updates.
- **Obligation & Payment Tracking** — Monthly rent, CAM, HVAC, electricity, security deposits auto-generated from extracted lease terms.
- **Smart Alerts** — Automated alerts for rent due dates, lease expiry (180/90/30/7 days), lock-in periods, escalation dates, and fit-out deadlines.
- **Document Q&A** — Ask natural language questions about any uploaded document and get answers with clause references.
- **Multi-Tenant Architecture** — Organizations, roles (platform admin, org admin, org member), and Row Level Security.
- **Demo Data Seeding** — One API call to seed 6 realistic demo outlets across Indian cities with full agreements, obligations, and alerts.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui |
| Backend | FastAPI (Python), Google Gemini 2.5 Pro, PyMuPDF |
| Database | Supabase (PostgreSQL + Auth + Storage + RLS) |
| Deployment | Vercel (frontend), Railway (backend) |

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
              |                             |
     +--------v---------+         +--------v---------+
     |    Supabase       |         |  Google Gemini   |
     |  PostgreSQL +     |         |  2.5 Pro         |
     |  Auth + Storage   |         |  (AI Engine)     |
     +-------------------+         +------------------+
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
git clone https://github.com/100rabhkr/Grospace.git
cd Grospace

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

Run `supabase/schema.sql` in the Supabase SQL Editor. It creates all tables, indexes, RLS policies, storage buckets, and triggers. Safe to re-run.

### 4. Run

```bash
# Terminal 1: Frontend
npm run dev

# Terminal 2: Backend
cd backend
python main.py
```

Open http://localhost:3000

### 5. Seed Demo Data (Optional)

```bash
curl -X POST http://localhost:8000/api/seed
```

This creates 6 demo outlets (Ambience Mall Gurugram, Phoenix MarketCity Mumbai, Indiranagar Bengaluru, Select Citywalk Delhi, Palladium Chennai, DLF CyberHub Gurugram) with agreements, obligations, and alerts.

---

## How to Test

1. Login with demo credentials (`demo@grospace.com` / `demo2025`)
2. Go to **Agreements > Upload New**
3. Upload a lease/LOI PDF (use `test-docs/sample-lease-agreement.pdf` for testing)
4. Watch AI extract all fields with confidence scores and risk flags
5. Click **Confirm & Activate** to save to database
6. Check **Dashboard** for portfolio overview
7. Browse **Outlets**, **Agreements**, **Alerts** to see populated data
8. Click into any agreement to use **Document Q&A**

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/upload-and-extract` | Upload PDF, get AI extraction |
| POST | `/api/confirm-and-activate` | Confirm extraction, create outlet + agreement + obligations + alerts |
| POST | `/api/classify` | Classify document type |
| POST | `/api/extract` | Extract from Supabase storage URL |
| POST | `/api/qa` | Ask questions about a document |
| POST | `/api/risk-flags` | Analyze document for risk flags |
| GET | `/api/agreements` | List all agreements |
| GET | `/api/agreements/{id}` | Get agreement with obligations and alerts |
| GET | `/api/outlets` | List all outlets |
| GET | `/api/outlets/{id}` | Get outlet with full details |
| GET | `/api/alerts` | List all alerts |
| GET | `/api/dashboard` | Dashboard statistics |
| GET/POST | `/api/organizations` | List/create organizations |
| GET | `/api/organizations/{id}` | Get organization with outlets and agreements |
| POST | `/api/seed` | Seed demo data |

---

## Database Schema

10 tables with full Row Level Security:

| Table | Description |
|-------|-------------|
| `organizations` | Brands/companies |
| `profiles` | User profiles (extends Supabase auth) |
| `outlets` | Physical store locations |
| `agreements` | Lease/license documents with extracted data |
| `obligations` | Recurring payment obligations |
| `payment_records` | Payment tracking |
| `alerts` | Smart notifications |
| `documents` | Uploaded files |
| `document_qa_sessions` | AI Q&A history |
| `activity_log` | Audit trail |

---

## AI Extraction Schema

For lease/LOI documents, the AI extracts:

- **Parties**: Lessor, lessee, brand, consultant, CIN
- **Premises**: Property name, address, type, floor, unit, areas (super/covered/carpet)
- **Lease Term**: Commencement, expiry, lock-in, fit-out period, renewal terms
- **Rent**: Model (fixed/revenue share/hybrid), schedule, escalation %, frequency
- **Charges**: CAM rate, HVAC, electricity, operating hours
- **Deposits**: Security deposit, CAM deposit, utility deposit, refund terms
- **Legal**: Usage restrictions, subletting, arbitration, jurisdiction, TDS
- **Franchise**: Model (FOFO/FOCO/COCO), profit split, operator/investor entities

---

## Project Structure

```
Grospace/
├── src/
│   ├── app/                         # Next.js App Router pages
│   │   ├── page.tsx                 # Dashboard
│   │   ├── agreements/              # Agreement list, detail, upload
│   │   │   ├── page.tsx             # All Agreements
│   │   │   ├── [id]/page.tsx        # Agreement Detail + Q&A
│   │   │   └── upload/page.tsx      # Upload & Extract flow
│   │   ├── outlets/                 # Outlet portfolio
│   │   │   ├── page.tsx             # All Outlets (card + table view)
│   │   │   └── [id]/page.tsx        # Outlet Detail
│   │   ├── organizations/           # Organization management
│   │   │   ├── page.tsx             # All Organizations
│   │   │   └── [id]/page.tsx        # Organization Detail
│   │   ├── alerts/page.tsx          # Smart alerts dashboard
│   │   ├── reports/page.tsx         # Analytics & reports
│   │   ├── settings/page.tsx        # App settings
│   │   └── auth/login/page.tsx      # Login page
│   ├── components/                  # Reusable UI components
│   │   ├── app-shell.tsx            # Layout wrapper (hides sidebar on auth)
│   │   ├── sidebar.tsx              # Navigation sidebar
│   │   ├── top-bar.tsx              # Top navigation bar
│   │   └── ui/                      # shadcn/ui primitives
│   └── lib/                         # Utilities
│       ├── api.ts                   # Backend API client
│       ├── supabase.ts              # Supabase client
│       └── utils.ts                 # Helper functions
├── backend/
│   ├── main.py                      # FastAPI app + all AI endpoints
│   ├── requirements.txt             # Python dependencies
│   ├── Dockerfile                   # Railway deployment
│   └── .env.example                 # Environment template
├── supabase/
│   └── schema.sql                   # Complete database schema
└── test-docs/
    └── sample-lease-agreement.pdf   # Sample document for testing
```

---

## Deployment

### Frontend (Vercel)

1. Import repo on Vercel
2. Add environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL`
3. Deploy

### Backend (Railway)

1. Create new project on Railway from GitHub
2. Set root directory to `/backend`
3. Add environment variables: `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FRONTEND_URL`, `PORT`
4. Railway auto-detects the Dockerfile and deploys

---

## License

MIT
