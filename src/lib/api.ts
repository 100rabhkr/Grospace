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

/** List agreements (paginated) */
export async function listAgreements(params?: { page?: number; page_size?: number }) {
  const sp = new URLSearchParams();
  if (params?.page) sp.set("page", String(params.page));
  if (params?.page_size) sp.set("page_size", String(params.page_size));
  const qs = sp.toString();
  return apiFetch(`/api/agreements${qs ? `?${qs}` : ""}`);
}

/** Get a single agreement with obligations and alerts */
export async function getAgreement(id: string) {
  return apiFetch(`/api/agreements/${id}`);
}

/** List outlets (paginated) */
export async function listOutlets(params?: { page?: number; page_size?: number }) {
  const sp = new URLSearchParams();
  if (params?.page) sp.set("page", String(params.page));
  if (params?.page_size) sp.set("page_size", String(params.page_size));
  const qs = sp.toString();
  return apiFetch(`/api/outlets${qs ? `?${qs}` : ""}`);
}

/** Get a single outlet with full details */
export async function getOutlet(id: string) {
  return apiFetch(`/api/outlets/${id}`);
}

/** List alerts (paginated) */
export async function listAlerts(params?: { page?: number; page_size?: number }) {
  const sp = new URLSearchParams();
  if (params?.page) sp.set("page", String(params.page));
  if (params?.page_size) sp.set("page_size", String(params.page_size));
  const qs = sp.toString();
  return apiFetch(`/api/alerts${qs ? `?${qs}` : ""}`);
}

/** Update an outlet (revenue, status) */
export async function updateOutlet(outletId: string, data: {
  monthly_net_revenue?: number;
  status?: string;
}) {
  return apiFetch(`/api/outlets/${outletId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
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
// AGREEMENT EDITING
// ============================================

/** Update agreement extracted fields (sparse dot-notation merge) */
export async function updateAgreement(id: string, data: {
  field_updates?: Record<string, unknown>;
  extracted_data?: Record<string, unknown>;
}) {
  return apiFetch(`/api/agreements/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// ============================================
// PAYMENT TRACKING
// ============================================

/** List payment records with optional filters (paginated) */
export async function listPayments(params?: {
  outlet_id?: string;
  status?: string;
  period_year?: number;
  period_month?: number;
  page?: number;
  page_size?: number;
}) {
  const searchParams = new URLSearchParams();
  if (params?.outlet_id) searchParams.set("outlet_id", params.outlet_id);
  if (params?.status) searchParams.set("status", params.status);
  if (params?.period_year) searchParams.set("period_year", String(params.period_year));
  if (params?.period_month) searchParams.set("period_month", String(params.period_month));
  if (params?.page) searchParams.set("page", String(params.page));
  if (params?.page_size) searchParams.set("page_size", String(params.page_size));
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

/** List obligations (paginated) */
export async function listObligations(params?: {
  outlet_id?: string;
  active_only?: boolean;
  page?: number;
  page_size?: number;
}) {
  const searchParams = new URLSearchParams();
  if (params?.outlet_id) searchParams.set("outlet_id", params.outlet_id);
  if (params?.active_only !== undefined) searchParams.set("active_only", String(params.active_only));
  if (params?.page) searchParams.set("page", String(params.page));
  if (params?.page_size) searchParams.set("page_size", String(params.page_size));
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

// ============================================
// SETTINGS
// ============================================

/** Update organization */
export async function updateOrganization(orgId: string, data: {
  name?: string;
  logo_url?: string;
  alert_preferences?: Record<string, unknown>;
}) {
  return apiFetch(`/api/organizations/${orgId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

/** List organization members */
export async function getOrgMembers(orgId: string) {
  return apiFetch(`/api/organizations/${orgId}/members`);
}

/** Invite a member to the organization */
export async function inviteOrgMember(orgId: string, email: string, role: string = "org_member") {
  return apiFetch(`/api/organizations/${orgId}/invite`, {
    method: "POST",
    body: JSON.stringify({ email, role }),
  });
}

/** Remove a member from the organization */
export async function removeOrgMember(orgId: string, userId: string) {
  return apiFetch(`/api/organizations/${orgId}/members/${userId}`, {
    method: "DELETE",
  });
}

/** Get current user's profile */
export async function getProfile() {
  return apiFetch("/api/profile");
}

/** Update current user's profile */
export async function updateProfile(data: { full_name?: string }) {
  return apiFetch("/api/profile", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

/** Get alert preferences for an org */
export async function getAlertPreferences(orgId: string) {
  return apiFetch(`/api/alert-preferences/${orgId}`);
}

/** Save alert preferences for an org */
export async function saveAlertPreferences(orgId: string, preferences: Record<string, unknown>) {
  return apiFetch(`/api/alert-preferences/${orgId}`, {
    method: "PUT",
    body: JSON.stringify({ preferences }),
  });
}

// ============================================
// CUSTOM REMINDERS
// ============================================

/** Create a custom reminder (stored as alert with type='custom') */
export async function createReminder(data: {
  title: string;
  message?: string;
  trigger_date: string;
  severity?: string;
  outlet_id?: string;
  agreement_id?: string;
}) {
  return apiFetch("/api/reminders", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/** Update a custom reminder */
export async function updateReminder(id: string, data: {
  title?: string;
  message?: string;
  trigger_date?: string;
  severity?: string;
}) {
  return apiFetch(`/api/reminders/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

/** Delete a custom reminder */
export async function deleteReminder(id: string) {
  return apiFetch(`/api/reminders/${id}`, {
    method: "DELETE",
  });
}

// ============================================
// ACTIVITY LOG
// ============================================

// ============================================
// NOTIFICATION ROUTING
// ============================================

/** Get notification preferences (stored in alert_preferences.notification_preferences) */
export async function getNotificationPreferences(orgId: string) {
  const data = await getAlertPreferences(orgId);
  return (data.preferences || {}).notification_preferences || {};
}

/** Save notification preferences */
export async function saveNotificationPreferences(orgId: string, notifPrefs: Record<string, unknown>) {
  // Merge into existing alert_preferences
  const data = await getAlertPreferences(orgId);
  const existing = data.preferences || {};
  return saveAlertPreferences(orgId, {
    ...existing,
    notification_preferences: notifPrefs,
  });
}

// ============================================
// SHOWCASE (shareable public outlet pages)
// ============================================

/** Create a showcase token for an outlet */
export async function createShowcase(data: {
  outlet_id: string;
  title?: string;
  description?: string;
  include_financials?: boolean;
  expires_at?: string;
}) {
  return apiFetch("/api/showcase", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/** List showcase tokens (optionally filtered by outlet) */
export async function listShowcases(outletId?: string) {
  const qs = outletId ? `?outlet_id=${outletId}` : "";
  return apiFetch(`/api/showcase${qs}`);
}

/** Update a showcase token */
export async function updateShowcase(tokenId: string, data: {
  title?: string;
  description?: string;
  include_financials?: boolean;
  is_active?: boolean;
}) {
  return apiFetch(`/api/showcase/${tokenId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

/** Get public showcase data (no auth required) */
export async function getPublicShowcase(token: string) {
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  const response = await fetch(`${API_URL}/api/showcase/public/${token}`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Not found" }));
    throw new Error(error.detail || `Error: ${response.status}`);
  }
  return response.json();
}

// ============================================
// DEAL PIPELINE
// ============================================

/** Get pipeline data (outlets grouped by deal_stage) */
export async function getPipeline() {
  return apiFetch("/api/pipeline");
}

/** Move an outlet to a new deal stage */
export async function movePipelineCard(outletId: string, newStage: string, dealNotes?: string) {
  return apiFetch("/api/pipeline/move", {
    method: "PATCH",
    body: JSON.stringify({ outlet_id: outletId, new_stage: newStage, deal_notes: dealNotes }),
  });
}

/** Update deal priority or notes */
export async function updatePipelineDeal(outletId: string, data: { deal_priority?: string; deal_notes?: string }) {
  return apiFetch(`/api/pipeline/${outletId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// ============================================
// ACTIVITY LOG
// ============================================

/** Get activity log for an entity */
export async function getActivityLog(entityType: string, entityId: string, limit?: number) {
  const sp = new URLSearchParams();
  sp.set("entity_type", entityType);
  sp.set("entity_id", entityId);
  if (limit) sp.set("limit", String(limit));
  return apiFetch(`/api/activity-log?${sp.toString()}`);
}
