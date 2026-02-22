# GroSpace - Deployment & Credentials

## Live Links

| Service | URL |
|---------|-----|
| Frontend (Vercel) | https://grospace-sandy.vercel.app |
| Backend (Railway) | https://grospace-production.up.railway.app |
| Backend Health Check | https://grospace-production.up.railway.app/api/health |
| Supabase Dashboard | https://supabase.com/dashboard/project/yuatalgbsvywgsbpyttl |
| GitHub (100rabhkr) | https://github.com/100rabhkr/Grospace |
| GitHub (SKULLFIRE07) | https://github.com/SKULLFIRE07/grospace |

---

## Demo Login

| Field | Value |
|-------|-------|
| Email | demo@grospace.com |
| Password | demo2025 |

---

## Supabase

| Key | Value |
|-----|-------|
| Project URL | https://yuatalgbsvywgsbpyttl.supabase.co |
| Anon Key | eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1YXRhbGdic3Z5d2dzYnB5dHRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3NDgzODksImV4cCI6MjA4NzMyNDM4OX0.EmTnCRaBOsbY8zTSKEA7C9fI7mJsyaiInuWqXR7lctk |
| Service Role Key | eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1YXRhbGdic3Z5d2dzYnB5dHRsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTc0ODM4OSwiZXhwIjoyMDg3MzI0Mzg5fQ.v3_kazW8g9DyaNEJpERzT1oHldrcLaNp_vCiKp2qxqU |
| Admin User | admin@grospace.com / admin2025 |

---

## Gemini AI

| Key | Value |
|-----|-------|
| API Key | AIzaSyBWuHmXy2MKzH3vISGp8eun2hRHsPzLjIw |
| Model | gemini-2.5-pro |

---

## Vercel Environment Variables

| Variable | Value |
|----------|-------|
| NEXT_PUBLIC_SUPABASE_URL | https://yuatalgbsvywgsbpyttl.supabase.co |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1YXRhbGdic3Z5d2dzYnB5dHRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3NDgzODksImV4cCI6MjA4NzMyNDM4OX0.EmTnCRaBOsbY8zTSKEA7C9fI7mJsyaiInuWqXR7lctk |
| NEXT_PUBLIC_API_URL | https://grospace-production.up.railway.app |
| NEXT_PUBLIC_APP_URL | https://grospace-sandy.vercel.app |

---

## Railway Environment Variables

| Variable | Value |
|----------|-------|
| GEMINI_API_KEY | AIzaSyBWuHmXy2MKzH3vISGp8eun2hRHsPzLjIw |
| SUPABASE_URL | https://yuatalgbsvywgsbpyttl.supabase.co |
| SUPABASE_SERVICE_ROLE_KEY | eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1YXRhbGdic3Z5d2dzYnB5dHRsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTc0ODM4OSwiZXhwIjoyMDg3MzI0Mzg5fQ.v3_kazW8g9DyaNEJpERzT1oHldrcLaNp_vCiKp2qxqU |
| FRONTEND_URL | https://grospace-sandy.vercel.app |
| PORT | 8000 |

---

## Local Development (.env.local)

```env
NEXT_PUBLIC_SUPABASE_URL=https://yuatalgbsvywgsbpyttl.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1YXRhbGdic3Z5d2dzYnB5dHRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3NDgzODksImV4cCI6MjA4NzMyNDM4OX0.EmTnCRaBOsbY8zTSKEA7C9fI7mJsyaiInuWqXR7lctk
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Local Development (backend/.env)

```env
GEMINI_API_KEY=AIzaSyBWuHmXy2MKzH3vISGp8eun2hRHsPzLjIw
SUPABASE_URL=https://yuatalgbsvywgsbpyttl.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1YXRhbGdic3Z5d2dzYnB5dHRsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTc0ODM4OSwiZXhwIjoyMDg3MzI0Mzg5fQ.v3_kazW8g9DyaNEJpERzT1oHldrcLaNp_vCiKp2qxqU
FRONTEND_URL=http://localhost:3000
PORT=8000
```

---

## Database Schema

Run `supabase/schema.sql` in the Supabase SQL Editor. Safe to re-run (drops and recreates).

### Tables
- organizations, profiles, outlets, agreements, obligations
- payment_records, alerts, documents, document_qa_sessions, activity_log

---

## API Endpoints (Railway Backend)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/health | Health check |
| POST | /api/upload-and-extract | Upload PDF, get AI extraction |
| POST | /api/extract | Extract from Supabase storage URL |
| POST | /api/classify | Classify document type |
| POST | /api/qa | Ask questions about a document |
| POST | /api/risk-flags | Analyze document for risk flags |
