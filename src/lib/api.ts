/**
 * GroSpace API Client
 * Communicates with the FastAPI backend (Railway) for AI operations
 */

import { createClient } from "@/lib/supabase/client";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

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
export async function askDocumentQuestion(agreementId: string, question: string, sessionId?: string) {
  return apiFetch("/api/qa", {
    method: "POST",
    body: JSON.stringify({ agreement_id: agreementId, question, session_id: sessionId }),
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

/** Get processing time estimate from backend */
export async function getProcessingEstimate(): Promise<{
  avg_seconds: number;
  min_seconds: number;
  max_seconds: number;
  sample_count: number;
}> {
  return apiFetch("/api/processing-estimate");
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
  document_text?: string | null;
  document_url?: string | null;
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

/** Update an outlet (revenue, status, site_code) */
export async function updateOutlet(outletId: string, data: {
  monthly_net_revenue?: number;
  status?: string;
  site_code?: string;
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

// ============================================
// SMART AI CHAT
// ============================================

/** Ask the AI assistant a question about your portfolio */
export async function smartChat(question: string, orgId?: string) {
  return apiFetch("/api/smart-chat", {
    method: "POST",
    body: JSON.stringify({ question, org_id: orgId }),
  });
}

/** Get activity log for an entity */
export async function getActivityLog(entityType: string, entityId: string, limit?: number) {
  const sp = new URLSearchParams();
  sp.set("entity_type", entityType);
  sp.set("entity_id", entityId);
  if (limit) sp.set("limit", String(limit));
  return apiFetch(`/api/activity-log?${sp.toString()}`);
}

// ============================================
// OUTLET DOCUMENTS (Drive-like multi-doc)
// ============================================

/** List all documents for an outlet */
export async function listOutletDocuments(outletId: string) {
  return apiFetch(`/api/outlets/${outletId}/documents`);
}

/** Upload a document to an outlet */
export async function uploadOutletDocument(outletId: string, file: File, category: string = "other") {
  const token = await getAuthToken();
  const formData = new FormData();
  formData.append("file", file);
  formData.append("category", category);

  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}/api/outlets/${outletId}/documents`, {
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

/** Delete a document */
export async function deleteDocument(documentId: string) {
  return apiFetch(`/api/documents/${documentId}`, {
    method: "DELETE",
  });
}

// ============================================
// PORTFOLIO Q&A
// ============================================

/** Ask a natural language question about your portfolio */
export async function askPortfolioQuestion(question: string) {
  return apiFetch("/api/portfolio-qa", {
    method: "POST",
    body: JSON.stringify({ question }),
  });
}

// ============================================
// SAVE AS DRAFT
// ============================================

/** Save extraction as draft (without creating obligations/alerts) */
export async function saveAsDraft(agreementId: string, data: {
  extracted_data: Record<string, unknown>;
  risk_flags?: unknown[];
}) {
  return apiFetch(`/api/agreements/${agreementId}/save-draft`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// ============================================
// BULK PAYMENTS
// ============================================

/** Bulk mark payments as paid */
export async function bulkMarkPaid(data: {
  payment_ids?: string[];
  month?: number;
  year?: number;
  org_id?: string;
}) {
  return apiFetch("/api/payments/bulk-mark-paid", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/** Mark all payments as paid for a given month (YYYY-MM string) */
export async function markAllPaid(month: string, orgId?: string) {
  return apiFetch("/api/payments/mark-all-paid", {
    method: "POST",
    body: JSON.stringify({ month, org_id: orgId }),
  });
}

// ============================================
// MGLR CALCULATION
// ============================================

/** Calculate hybrid MGLR rent */
export async function calculateMGLR(data: {
  outlet_id: string;
  dine_in_revenue: number;
  delivery_revenue: number;
}) {
  return apiFetch("/api/calculate-mglr", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ============================================
// PROCESSING STATS (Task 43)
// ============================================

/** Get processing time statistics */
export async function getProcessingStats() {
  return apiFetch("/api/processing-stats");
}

// ============================================
// FEEDBACK PIPELINE (Task 45)
// ============================================

/** Submit feedback for an extraction field correction */
export async function submitFeedback(data: {
  agreement_id: string;
  field_name: string;
  original_value?: string;
  corrected_value?: string;
  comment?: string;
  org_id?: string;
}) {
  return apiFetch("/api/feedback", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/** List feedback entries for an organization */
export async function listFeedback(orgId?: string) {
  const params = orgId ? `?org_id=${orgId}` : "";
  return apiFetch(`/api/feedback${params}`);
}

// ============================================
// ROLE TIERS (Task 42)
// ============================================

/** Get role tier metadata */
export async function getRoleTiers() {
  return apiFetch("/api/role-tiers");
}

// ============================================
// CRON TRIGGERS (manual)
// ============================================

/** Trigger agreement status transitions */
export async function triggerAgreementTransitions() {
  return apiFetch("/api/cron/agreement-transitions", { method: "POST" });
}

/** Trigger payment status updates */
export async function triggerPaymentStatusUpdate() {
  return apiFetch("/api/cron/payment-status-update", { method: "POST" });
}

/** Trigger escalation calculator */
export async function triggerEscalationCalculator() {
  return apiFetch("/api/cron/escalation-calculator", { method: "POST" });
}

// ============================================
// OUTLET CONTACTS
// ============================================

/** List contacts for an outlet */
export async function listOutletContacts(outletId: string) {
  return apiFetch(`/api/outlets/${outletId}/contacts`);
}

/** Add a contact to an outlet */
export async function addOutletContact(outletId: string, data: {
  name: string;
  designation?: string;
  phone?: string;
  email?: string;
  notes?: string;
}) {
  return apiFetch(`/api/outlets/${outletId}/contacts`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/** Update a contact */
export async function updateContact(contactId: string, data: {
  name?: string;
  designation?: string;
  phone?: string;
  email?: string;
  notes?: string;
}) {
  return apiFetch(`/api/contacts/${contactId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

/** Delete a contact */
export async function deleteContact(contactId: string) {
  return apiFetch(`/api/contacts/${contactId}`, {
    method: "DELETE",
  });
}
