/**
 * GroSpace API Client
 * Communicates with the FastAPI backend (Railway) for AI operations
 */

import { createClient } from "@/lib/supabase/client";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function getAuthToken(): Promise<string | null> {
  try {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  } catch {
    return null;
  }
}

async function apiFetch(endpoint: string, options: RequestInit = {}) {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(error.detail || `API error: ${response.status}`);
  }

  return response.json();
}

/** Classify a document type from its text */
export async function classifyDocument(text: string) {
  return apiFetch("/api/classify", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

/** Extract structured data from a document */
export async function extractDocument(fileUrl: string, agreementId: string) {
  return apiFetch("/api/extract", {
    method: "POST",
    body: JSON.stringify({ file_url: fileUrl, agreement_id: agreementId }),
  });
}

/** Ask a question about a specific agreement document */
export async function askDocumentQuestion(agreementId: string, question: string) {
  return apiFetch("/api/qa", {
    method: "POST",
    body: JSON.stringify({ agreement_id: agreementId, question }),
  });
}

/** Analyze a document for risk flags */
export async function analyzeRiskFlags(agreementId: string, extractedData: Record<string, unknown>) {
  return apiFetch("/api/risk-flags", {
    method: "POST",
    body: JSON.stringify({ agreement_id: agreementId, extracted_data: extractedData }),
  });
}

/** Upload a PDF file directly and get AI extraction results */
export async function uploadAndExtract(file: File) {
  const token = await getAuthToken();
  const formData = new FormData();
  formData.append("file", file);

  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}/api/upload-and-extract`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Upload failed" }));
    throw new Error(error.detail || `API error: ${response.status}`);
  }

  return response.json();
}

/** Check backend health */
export async function checkHealth() {
  return apiFetch("/api/health");
}

/** Confirm extraction and activate agreement - creates outlet, obligations, alerts */
export async function confirmAndActivate(data: {
  extraction: Record<string, unknown>;
  document_type: string;
  risk_flags: unknown[];
  confidence: Record<string, string>;
  filename: string;
}) {
  return apiFetch("/api/confirm-and-activate", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/** List all agreements from the database */
export async function listAgreements() {
  return apiFetch("/api/agreements");
}

/** Get a single agreement with obligations and alerts */
export async function getAgreement(id: string) {
  return apiFetch(`/api/agreements/${id}`);
}

/** List all outlets */
export async function listOutlets() {
  return apiFetch("/api/outlets");
}

/** Get a single outlet with full details */
export async function getOutlet(id: string) {
  return apiFetch(`/api/outlets/${id}`);
}

/** List all alerts */
export async function listAlerts() {
  return apiFetch("/api/alerts");
}

/** Get dashboard stats */
export async function getDashboardStats() {
  return apiFetch("/api/dashboard");
}

/** List organizations */
export async function listOrganizations() {
  return apiFetch("/api/organizations");
}

/** Get a single organization with outlets, agreements, and alerts */
export async function getOrganization(id: string) {
  return apiFetch(`/api/organizations/${id}`);
}

/** Create organization */
export async function createOrganization(name: string) {
  const token = await getAuthToken();
  const formData = new FormData();
  formData.append("name", name);

  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}/api/organizations`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Failed to create organization" }));
    throw new Error(error.detail || `API error: ${response.status}`);
  }

  return response.json();
}

// ============================================
// PAYMENT TRACKING
// ============================================

/** List payment records with optional filters */
export async function listPayments(params?: {
  outlet_id?: string;
  status?: string;
  period_year?: number;
  period_month?: number;
}) {
  const searchParams = new URLSearchParams();
  if (params?.outlet_id) searchParams.set("outlet_id", params.outlet_id);
  if (params?.status) searchParams.set("status", params.status);
  if (params?.period_year) searchParams.set("period_year", String(params.period_year));
  if (params?.period_month) searchParams.set("period_month", String(params.period_month));
  const qs = searchParams.toString();
  return apiFetch(`/api/payments${qs ? `?${qs}` : ""}`);
}

/** Update a payment record (mark paid, overdue, etc.) */
export async function updatePayment(paymentId: string, data: {
  status: string;
  paid_amount?: number;
  notes?: string;
}) {
  return apiFetch(`/api/payments/${paymentId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

/** Generate payment records from active obligations */
export async function generatePayments(monthsAhead: number = 3) {
  return apiFetch("/api/payments/generate", {
    method: "POST",
    body: JSON.stringify({ months_ahead: monthsAhead }),
  });
}

/** List obligations */
export async function listObligations(params?: {
  outlet_id?: string;
  active_only?: boolean;
}) {
  const searchParams = new URLSearchParams();
  if (params?.outlet_id) searchParams.set("outlet_id", params.outlet_id);
  if (params?.active_only !== undefined) searchParams.set("active_only", String(params.active_only));
  const qs = searchParams.toString();
  return apiFetch(`/api/obligations${qs ? `?${qs}` : ""}`);
}

// ============================================
// ALERT ACTIONS
// ============================================

/** Acknowledge an alert */
export async function acknowledgeAlert(alertId: string) {
  return apiFetch(`/api/alerts/${alertId}/acknowledge`, {
    method: "PATCH",
  });
}

/** Snooze an alert for N days */
export async function snoozeAlert(alertId: string, days: number = 7) {
  return apiFetch(`/api/alerts/${alertId}/snooze`, {
    method: "PATCH",
    body: JSON.stringify({ days }),
  });
}

/** Assign an alert to a user */
export async function assignAlert(alertId: string, userId: string) {
  return apiFetch(`/api/alerts/${alertId}/assign`, {
    method: "PATCH",
    body: JSON.stringify({ user_id: userId }),
  });
}

// ============================================
// REPORTS
// ============================================

/** Get outlet report data (joined outlets + agreements + payments) */
export async function getReportData() {
  return apiFetch("/api/reports");
}
