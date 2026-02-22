# GroSpace

**AI-first Lease & Outlet Management Platform for Indian F&B and Retail Brands**

GroSpace automates lease abstraction, obligation tracking, and risk detection for commercial real estate. Upload a lease PDF and watch AI extract every clause, date, financial term, and red flag in seconds.

---

## What It Does

- **AI Document Extraction** - Upload any lease/LOI PDF. Gemini 2.0 Flash extracts 50+ structured fields: parties, premises, rent schedules, escalation clauses, deposits, legal terms, franchise details.
- **Risk Flag Detection** - Automatically detects 8 common lease red flags: unilateral relocation, predatory interest, missing lock-in, excessive deposits, uncapped revenue share, and more.
- **Confidence Scoring** - Every extracted field gets a confidence badge (High/Medium/Low) so you know what to double-check.
- **Outlet Portfolio Management** - Track all your outlets across cities with status tracking (pipeline, fit-out, operational, renewal, closed).
- **Agreement Lifecycle** - Manage agreements from draft to active to expiry with automatic status updates.
- **Obligation & Payment Tracking** - Monthly rent, CAM, HVAC, utility obligations auto-generated from extracted lease terms.
- **Smart Alerts** - Automated alerts for rent due dates, lease expiry, lock-in periods, escalation dates, and license renewals.
- **Document Q&A** - Ask natural language questions about any uploaded document and get answers with clause references.
- **Multi-Tenant Architecture** - Organizations, roles (platform admin, org admin, org member), and Row Level Security.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui, Recharts |
| Backend | FastAPI (Python), Google Gemini 2.0 Flash, PyMuPDF |
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
     |  PostgreSQL +     |         |  2.0 Flash       |
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

Create `backend/.env`:

```env
GEMINI_API_KEY=your-gemini-api-key
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
FRONTEND_URL=http://localhost:3000
PORT=8000
```

### 3. Database Setup

Run `supabase/schema.sql` in the Supabase SQL Editor. It creates all tables, indexes, RLS policies, storage buckets, and triggers.

### 4. Run

```bash
# Terminal 1: Frontend
npm run dev

# Terminal 2: Backend
cd backend
python main.py
```

Open http://localhost:3000

### Demo Login

```
Email: demo@grospace.com
Password: demo2025
```

---

## How to Test

1. **Login** with demo credentials
2. Go to **Agreements** > **Upload Agreement**
3. Upload a lease/LOI PDF (use `test-docs/sample-lease-agreement.txt` saved as PDF for testing)
4. Watch AI extract all fields with confidence scores
5. Review risk flags detected automatically
6. Browse **Outlets**, **Alerts**, **Reports** to see the full dashboard

---

## Deployment

### Frontend (Vercel)

1. Import repo on Vercel
2. Add environment variables from `.env.local`
3. Set `NEXT_PUBLIC_API_URL` to your Railway backend URL
4. Deploy

### Backend (Railway)

1. Create new project on Railway from GitHub
2. Set root directory to `/backend`
3. Add environment variables from `backend/.env`
4. Railway auto-detects the Dockerfile and deploys

---

## Database Schema

10 tables with full RLS:

- `organizations` - Brands/companies
- `profiles` - User profiles (extends Supabase auth)
- `outlets` - Physical store locations
- `agreements` - Lease/license documents with extracted data
- `obligations` - Recurring payment obligations
- `payment_records` - Payment tracking
- `alerts` - Smart notifications
- `documents` - Uploaded files
- `document_qa_sessions` - AI Q&A history
- `activity_log` - Audit trail

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
│   ├── app/                    # Next.js App Router pages
│   │   ├── agreements/         # Agreement list, detail, upload
│   │   ├── alerts/             # Smart alerts dashboard
│   │   ├── auth/               # Login page
│   │   ├── outlets/            # Outlet portfolio
│   │   ├── organizations/      # Org management
│   │   ├── reports/            # Analytics & reports
│   │   └── settings/           # App settings
│   ├── components/             # Reusable UI components
│   │   └── ui/                 # shadcn/ui primitives
│   └── lib/                    # Utilities, API client, Supabase
├── backend/
│   ├── main.py                 # FastAPI app + AI endpoints
│   ├── requirements.txt        # Python dependencies
│   └── Dockerfile              # Railway deployment
├── supabase/
│   └── schema.sql              # Complete database schema
└── test-docs/
    └── sample-lease-agreement.txt  # Sample document for testing
```

---

## License

MIT
