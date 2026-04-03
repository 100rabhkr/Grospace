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

// Endpoints that involve AI processing need longer timeouts
const LONG_TIMEOUT_PATTERNS = [
  "/api/upload-and-extract",
  "/api/extract",
  "/api/qa",
  "/api/risk-flags",
  "/api/classify",
  "/api/smart-chat",
  "/api/portfolio-qa",
  "/api/seed",
  "/api/leasebot/analyze",
  "/api/cron",
];

async function apiFetch(endpoint: string, options: RequestInit = {}) {
  const token = await getAuthToken();
  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const isLongRunning = LONG_TIMEOUT_PATTERNS.some((p) => endpoint.startsWith(p));
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), isLongRunning ? 600000 : 60000);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Request timed out — server may be starting up. Please retry in a moment.");
    }
    throw new Error("Network error — unable to reach the server. Please check your connection and try again.");
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Request failed" }));
    const detail = typeof error.detail === "string" ? error.detail : JSON.stringify(error.detail) || `API error: ${response.status}`;
    throw new Error(detail);
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
  const formData = new FormData();
  formData.append("file", file);

  return apiFetch("/api/upload-and-extract", {
    method: "POST",
    body: formData,
  });
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
  file_hash?: string | null;
  custom_notes?: string;
  custom_clauses?: { name: string; value: string }[];
}) {
  return apiFetch("/api/confirm-and-activate", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/** List agreements (paginated) */
export async function listAgreements(params?: { page?: number; page_size?: number }) {
  const sp = new URLSearchParams();
  if (params?.page != null) sp.set("page", String(params.page));
  if (params?.page_size != null) sp.set("page_size", String(params.page_size));
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
  if (params?.page != null) sp.set("page", String(params.page));
  if (params?.page_size != null) sp.set("page_size", String(params.page_size));
  const qs = sp.toString();
  return apiFetch(`/api/outlets${qs ? `?${qs}` : ""}`);
}

/** Get a single outlet with full details */
export async function getOutlet(id: string) {
  return apiFetch(`/api/outlets/${id}`);
}

/** List alerts (paginated, server-side date filtering) */
export async function listAlerts(params?: { page?: number; page_size?: number; months_ahead?: number; deduplicate?: boolean }) {
  const sp = new URLSearchParams();
  if (params?.page != null) sp.set("page", String(params.page));
  if (params?.page_size != null) sp.set("page_size", String(params.page_size));
  if (params?.months_ahead != null) sp.set("months_ahead", String(params.months_ahead));
  if (params?.deduplicate) sp.set("deduplicate", "true");
  const qs = sp.toString();
  return apiFetch(`/api/alerts${qs ? `?${qs}` : ""}`);
}

/** List pending/completed extraction jobs for the current user */
export async function listExtractionJobs(params?: { status?: string }) {
  const sp = new URLSearchParams();
  if (params?.status) sp.set("status", params.status);
  const qs = sp.toString();
  return apiFetch(`/api/extraction-jobs${qs ? `?${qs}` : ""}`);
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
  const formData = new FormData();
  formData.append("name", name);

  return apiFetch("/api/organizations", {
    method: "POST",
    body: formData,
  });
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
  due_from?: string;
  due_to?: string;
  page?: number;
  page_size?: number;
}) {
  const searchParams = new URLSearchParams();
  if (params?.outlet_id) searchParams.set("outlet_id", params.outlet_id);
  if (params?.status) searchParams.set("status", params.status);
  if (params?.period_year != null) searchParams.set("period_year", String(params.period_year));
  if (params?.period_month != null) searchParams.set("period_month", String(params.period_month));
  if (params?.due_from) searchParams.set("due_from", params.due_from);
  if (params?.due_to) searchParams.set("due_to", params.due_to);
  if (params?.page != null) searchParams.set("page", String(params.page));
  if (params?.page_size != null) searchParams.set("page_size", String(params.page_size));
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
  if (params?.page != null) searchParams.set("page", String(params.page));
  if (params?.page_size != null) searchParams.set("page_size", String(params.page_size));
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
  const formData = new FormData();
  formData.append("file", file);
  formData.append("category", category);

  return apiFetch(`/api/outlets/${outletId}/documents`, {
    method: "POST",
    body: formData,
  });
}

/** Delete a document */
export async function deleteDocument(documentId: string) {
  return apiFetch(`/api/documents/${documentId}`, {
    method: "DELETE",
  });
}

// ============================================
// SEED / DEMO DATA
// ============================================

export async function seedDemoData() {
  return apiFetch("/api/admin/seed", { method: "POST" });
}

export async function removeSeedData() {
  return apiFetch("/api/admin/seed", { method: "DELETE" });
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

/** Create a new draft agreement from extraction results (no outlet created) */
export async function createDraft(data: {
  extraction: Record<string, unknown>;
  document_type: string;
  risk_flags: unknown[];
  confidence: Record<string, string>;
  filename: string;
  document_text?: string | null;
  document_url?: string | null;
  file_hash?: string | null;
}) {
  return apiFetch("/api/agreements/create-draft", {
    method: "POST",
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
// RENT SCHEDULES
// ============================================

export async function listRentSchedule(agreementId: string) {
  return apiFetch(`/api/agreements/${agreementId}/rent-schedule`);
}

export async function addRentScheduleEntry(agreementId: string, entry: {
  period_label: string;
  period_start?: string;
  period_end?: string;
  base_rent?: number;
  rent_per_sqft?: number;
  cam_monthly?: number;
  gst_pct?: number;
  revenue_share_pct?: number;
}) {
  return apiFetch(`/api/agreements/${agreementId}/rent-schedule`, {
    method: "POST",
    body: JSON.stringify(entry),
  });
}

export async function updateRentScheduleEntry(entryId: string, updates: Record<string, unknown>) {
  return apiFetch(`/api/rent-schedule/${entryId}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

export async function deleteRentScheduleEntry(entryId: string) {
  return apiFetch(`/api/rent-schedule/${entryId}`, {
    method: "DELETE",
  });
}

// ============================================
// CRITICAL DATES
// ============================================

export async function listEvents(agreementId: string) {
  return apiFetch(`/api/agreements/${agreementId}/events`);
}

export async function listUpcomingEvents(days: number = 90) {
  return apiFetch(`/api/events/upcoming?days=${days}`);
}

export async function listOverdueEvents() {
  return apiFetch("/api/events/overdue");
}

export async function createEvent(data: {
  agreement_id: string;
  date_value: string;
  label: string;
  event_type?: string;
  date_type?: string;
  priority?: string;
  notes?: string;
  assigned_to?: string;
  amount?: number;
  is_recurring?: boolean;
  recurrence_frequency?: string;
}) {
  return apiFetch("/api/events", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateEvent(eventId: string, updates: Record<string, unknown>) {
  return apiFetch(`/api/events/${eventId}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

export async function deleteEvent(eventId: string) {
  return apiFetch(`/api/events/${eventId}`, { method: "DELETE" });
}

export async function assignEvent(eventId: string, userId: string, role: string = "assignee") {
  return apiFetch(`/api/events/${eventId}/assign?user_id=${userId}&role=${role}`, { method: "POST" });
}

export async function generateIndiaEvents(agreementId: string) {
  return apiFetch(`/api/agreements/${agreementId}/events/generate-india`, { method: "POST" });
}

export async function checkEventEscalations() {
  return apiFetch("/api/events/check-escalations", { method: "POST" });
}

// Legacy aliases
export const listCriticalDates = listEvents;
export const updateCriticalDateStatus = (dateId: string, status: string) =>
  updateEvent(dateId, { status });

// ============================================
// CREATE OUTLET
// ============================================

export async function createOutlet(data: { name: string; city?: string }) {
  return apiFetch("/api/outlets", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/** Soft-delete an outlet (admin only) */
export async function deleteOutlet(outletId: string) {
  return apiFetch(`/api/outlets/${outletId}`, { method: "DELETE" });
}

/** Restore a soft-deleted outlet */
export async function restoreOutlet(outletId: string) {
  return apiFetch(`/api/outlets/${outletId}/restore`, { method: "PATCH" });
}

/** Upload a profile photo for an outlet */
export async function uploadOutletProfilePhoto(outletId: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return apiFetch(`/api/outlets/${outletId}/profile-photo`, {
    method: "POST",
    body: formData,
  });
}

/** List soft-deleted outlets (recycle bin) */
export async function listDeletedOutlets() {
  return apiFetch("/api/outlets/deleted");
}

// ============================================
// ORG LOGO
// ============================================

export async function uploadOrgLogo(orgId: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("org_id", orgId);
  // Upload to documents storage, then update org
  const uploadRes = await apiFetch("/api/documents/upload-file", {
    method: "POST",
    body: formData,
  });
  if (uploadRes?.url) {
    await apiFetch(`/api/organizations/${orgId}`, {
      method: "PATCH",
      body: JSON.stringify({ logo_url: uploadRes.url }),
    });
  }
  return uploadRes;
}

// ============================================
// AGREEMENT DELETE + DUPLICATE CHECK
// ============================================

export async function deleteAgreement(agreementId: string) {
  return apiFetch(`/api/agreements/${agreementId}`, { method: "DELETE" });
}

export async function checkDuplicateAgreement(outletId: string, filename: string) {
  // Check if an agreement with similar filename already exists for this outlet
  const agreements = await apiFetch(`/api/agreements?outlet_id=${outletId}`);
  const existing = (agreements.agreements || []).find(
    (a: { document_filename?: string }) =>
      a.document_filename?.toLowerCase() === filename.toLowerCase()
  );
  return existing || null;
}

// ============================================
// INDIA COMPLIANCE
// ============================================

export async function calculateStampDuty(state: string, monthlyRent: number, termYears: number, deposit: number = 0, docType: string = "lease") {
  const params = new URLSearchParams({ state, monthly_rent: String(monthlyRent), lease_term_years: String(termYears), security_deposit: String(deposit), doc_type: docType });
  return apiFetch(`/api/stamp-duty/calculate?${params}`);
}

export async function getTdsSummary(agreementId: string) {
  return apiFetch(`/api/agreements/${agreementId}/tds-summary`);
}

export async function getGstBreakdown(agreementId: string) {
  return apiFetch(`/api/agreements/${agreementId}/gst-breakdown`);
}

export async function getLockInSummary(agreementId: string) {
  return apiFetch(`/api/agreements/${agreementId}/lock-in-summary`);
}

export async function listClauses(agreementId: string, category?: string) {
  const url = category
    ? `/api/agreements/${agreementId}/clauses?category=${category}`
    : `/api/agreements/${agreementId}/clauses`;
  return apiFetch(url);
}

export async function searchClauses(category: string, q?: string) {
  const params = new URLSearchParams({ category });
  if (q) params.set("q", q);
  return apiFetch(`/api/clauses/search?${params}`);
}

export async function updateAgreementRenewalStatus(agreementId: string, renewalStatus: string) {
  return apiFetch(`/api/agreements/${agreementId}`, {
    method: "PATCH",
    body: JSON.stringify({ renewal_status: renewalStatus }),
  });
}

// ============================================
// ESCALATION
// ============================================

export async function generateEscalationSchedule(agreementId: string, opts: {
  escalation_pct?: number;
  escalation_frequency_years?: number;
  num_years?: number;
}) {
  const params = new URLSearchParams();
  if (opts.escalation_pct) params.set("escalation_pct", String(opts.escalation_pct));
  if (opts.escalation_frequency_years) params.set("escalation_frequency_years", String(opts.escalation_frequency_years));
  if (opts.num_years) params.set("num_years", String(opts.num_years));
  return apiFetch(`/api/agreements/${agreementId}/rent-schedule/generate-escalation?${params}`, {
    method: "POST",
  });
}

// ============================================
// REVENUE CSV UPLOAD
// ============================================

/** Upload a CSV file of revenue data (server-side fuzzy matching) */
export async function uploadRevenueCSV(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return apiFetch("/api/revenue/upload-csv", {
    method: "POST",
    body: formData,
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

// ---------------------------------------------------------------------------
// Signup Requests / Approvals
// ---------------------------------------------------------------------------

export async function listSignupRequests(status: string = "pending") {
  return apiFetch(`/api/signup-requests?status=${status}`);
}

export async function approveSignupRequest(
  requestId: string,
  orgId: string,
  role: string = "org_member",
  fullAccess: boolean = false,
) {
  const form = new FormData();
  form.append("org_id", orgId);
  form.append("role", role);
  form.append("full_access", String(fullAccess));
  return apiFetch(`/api/signup-requests/${requestId}/approve`, {
    method: "POST",
    body: form,
  });
}

export async function rejectSignupRequest(requestId: string) {
  return apiFetch(`/api/signup-requests/${requestId}/reject`, {
    method: "POST",
  });
}

// ============================================
// OUTLET PHOTOS (Supabase Storage)
// ============================================

/** Upload a photo for an outlet to Supabase storage */
export async function uploadOutletPhoto(outletId: string, file: File) {
  const { createClient } = await import("@/lib/supabase/client");
  const supabase = createClient();

  const ext = file.name.split(".").pop() || "jpg";
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const path = `${outletId}/${filename}`;

  const { error } = await supabase.storage
    .from("outlet-photos")
    .upload(path, file, { upsert: false });

  if (error) throw new Error(error.message);

  const { data: urlData } = supabase.storage
    .from("outlet-photos")
    .getPublicUrl(path);

  return { path, url: urlData.publicUrl, filename };
}

/** List photos for an outlet from Supabase storage */
export async function listOutletPhotos(outletId: string) {
  const { createClient } = await import("@/lib/supabase/client");
  const supabase = createClient();

  const { data, error } = await supabase.storage
    .from("outlet-photos")
    .list(outletId, { limit: 100, sortBy: { column: "created_at", order: "desc" } });

  if (error) throw new Error(error.message);

  const photos = (data || [])
    .filter((f) => !f.name.startsWith("."))
    .map((f) => {
      const { data: urlData } = supabase.storage
        .from("outlet-photos")
        .getPublicUrl(`${outletId}/${f.name}`);
      return {
        name: f.name,
        path: `${outletId}/${f.name}`,
        url: urlData.publicUrl,
        created_at: f.created_at,
      };
    });

  return photos;
}

/** Delete an outlet photo from Supabase storage */
export async function deleteOutletPhoto(path: string) {
  const { createClient } = await import("@/lib/supabase/client");
  const supabase = createClient();

  const { error } = await supabase.storage
    .from("outlet-photos")
    .remove([path]);

  if (error) throw new Error(error.message);
}

// ============================================
// ONBOARDING CHECKS
// ============================================

/** Get onboarding status for the current org */
export async function getOnboardingStatus() {
  return apiFetch("/api/dashboard");
}

// ============================================
// LEASEBOT
// ============================================

/** Analyze a lease document via Leasebot (no auth required) */
export async function analyzeLeasebot(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return apiFetch("/api/leasebot/analyze", {
    method: "POST",
    body: formData,
  } as RequestInit);
}

/** Get Leasebot results by token */
export async function getLeasebotResults(token: string, full?: boolean) {
  const params = full ? "?full=true" : "";
  return apiFetch(`/api/leasebot/results/${token}${params}`);
}

/** Convert Leasebot analysis to full agreement (auth required) */
export async function convertLeasebot(token: string) {
  return apiFetch(`/api/leasebot/convert/${token}`, { method: "POST" });
}

// ============================================
// ASYNC EXTRACTION
// ============================================

/** Upload and extract a document asynchronously (returns job_id) */
export async function uploadAndExtractAsync(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return apiFetch("/api/upload-and-extract-async", {
    method: "POST",
    body: formData,
  });
}

/** Get extraction job status */
export async function getExtractionJob(jobId: string) {
  return apiFetch(`/api/extraction-jobs/${jobId}`);
}

/** Mark an extraction job as seen */
export async function markExtractionJobSeen(jobId: string) {
  return apiFetch(`/api/extraction-jobs/${jobId}/seen`, { method: "PATCH" });
}

/** Create a critical date / event for an outlet */
export async function createCriticalDate(data: {
  outlet_id: string;
  agreement_id?: string;
  title: string;
  event_type: string;
  date_value: string;
  priority?: string;
  description?: string;
}) {
  return apiFetch("/api/critical-dates", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ============================================
// AGREEMENT TEMPLATES (Supabase Storage)
// ============================================

/** Upload a standard agreement template to Supabase storage */
export async function uploadTemplate(orgId: string, file: File) {
  const { createClient } = await import("@/lib/supabase/client");
  const supabase = createClient();

  const ext = file.name.split(".").pop() || "pdf";
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const path = `${orgId}/templates/${filename}`;

  const { error } = await supabase.storage
    .from("outlet-photos")
    .upload(path, file, { upsert: false });

  if (error) throw new Error(error.message);

  const { data: urlData } = supabase.storage
    .from("outlet-photos")
    .getPublicUrl(path);

  return { path, url: urlData.publicUrl, filename, originalName: file.name, size: file.size };
}

/** Delete a template file from Supabase storage */
export async function deleteTemplate(path: string) {
  const { createClient } = await import("@/lib/supabase/client");
  const supabase = createClient();

  const { error } = await supabase.storage
    .from("outlet-photos")
    .remove([path]);

  if (error) throw new Error(error.message);
}

// ============================================
// USAGE LOGGING (#109)
// ============================================

/** Log a usage event. Fails silently if backend doesn't support it yet. */
export async function logUsage(action: string, metadata?: Record<string, unknown>) {
  try {
    await apiFetch("/api/admin/log-usage", {
      method: "POST",
      body: JSON.stringify({ action, metadata, timestamp: new Date().toISOString() }),
    });
  } catch {
    // Silent — usage logging should never break the UI
  }
}
