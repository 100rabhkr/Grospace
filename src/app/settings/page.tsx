"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Shield,
  Mail,
  Upload,
  Trash2,
  Calendar,
  Save,
  Check,
  Loader2,
  MessageCircle,
  Clock,
  CheckCircle,
  XCircle,
  Building2,
  Eye,
  AlertTriangle,
  MapPin,
  Store,
  Download,
  FileText,
  ExternalLink,
  Plus,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { useUser } from "@/lib/hooks/use-user";
import {
  getOrganization,
  updateOrganization,
  getOrgMembers,
  inviteOrgMember,
  removeOrgMember,
  getProfile,
  updateProfile,
  getAlertPreferences,
  saveAlertPreferences,
  getNotificationPreferences,
  saveNotificationPreferences,
  listSignupRequests,
  approveSignupRequest,
  rejectSignupRequest,
  listOrganizations,
  createOrganization,
  uploadTemplate,
  deleteTemplate,
  listBrands,
  createBrand,
  updateBrand,
  deleteBrand,
  type Brand,
  createOrganizationWithAdmin,
  changeOwnPassword,
  resetSuperAdminPassword,
} from "@/lib/api";

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

type TeamMember = {
  id: string;
  full_name: string;
  email: string;
  role: "platform_admin" | "org_admin" | "org_member";
  status?: "active" | "invited";
};

type AlertPreference = {
  key: string;
  label: string;
  daysBefore: number;
};

const NOTIFICATION_ALERT_TYPES = [
  { key: "rent_due", label: "Rent Due" },
  { key: "cam_due", label: "CAM Due" },
  { key: "escalation", label: "Escalation" },
  { key: "lease_expiry", label: "Lease Expiry" },
  { key: "license_expiry", label: "License Expiry" },
  { key: "lock_in_expiry", label: "Lock-in Expiry" },
  { key: "renewal_window", label: "Renewal Window" },
  { key: "fit_out_deadline", label: "Fit-out Deadline" },
  { key: "deposit_installment", label: "Deposit Installment" },
  { key: "revenue_reconciliation", label: "Revenue Reconciliation" },
  { key: "custom", label: "Custom Reminder" },
];

type SignupRequest = {
  id: string;
  user_id: string;
  name: string;
  company: string;
  phone: string;
  email: string;
  city?: string;
  num_outlets?: number;
  status: "pending" | "approved" | "rejected";
  created_at: string;
};

type OrgOption = {
  id: string;
  name: string;
};

type TemplateItem = {
  id: string;
  name: string;
  description: string;
  file_url: string;
  storage_path: string;
  uploaded_at: string;
  size: number;
};

type NotifRoute = { email: boolean; whatsapp: boolean };

const DEFAULT_ALERT_PREFS: AlertPreference[] = [
  { key: "rent_due", label: "Rent Due", daysBefore: 7 },
  { key: "cam_due", label: "CAM Due", daysBefore: 7 },
  { key: "escalation", label: "Escalation Coming", daysBefore: 90 },
  { key: "lease_expiry", label: "Lease Expiry", daysBefore: 180 },
  { key: "license_expiry", label: "License Expiry", daysBefore: 180 },
  { key: "lock_in_expiry", label: "Lock-in Expiry", daysBefore: 90 },
  { key: "renewal_window", label: "Renewal Window", daysBefore: 30 },
  { key: "electricity", label: "Electricity Bill", daysBefore: 7 },
  { key: "water", label: "Water Bill", daysBefore: 7 },
  { key: "property_tax", label: "Property Tax", daysBefore: 30 },
  { key: "insurance_renewal", label: "Insurance Renewal", daysBefore: 30 },
  { key: "custom", label: "Custom Events", daysBefore: 7 },
];

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

const roleLabels: Record<string, { label: string; className: string }> = {
  platform_admin: { label: "Platform Admin", className: "bg-foreground text-white" },
  org_admin: { label: "Org Admin", className: "bg-muted text-foreground" },
  org_member: { label: "Org Member", className: "bg-muted text-foreground" },
};

function roleBadge(role: string) {
  const c = roleLabels[role] || roleLabels.org_member;
  return <Badge className={c.className}>{c.label}</Badge>;
}

function statusBadge(status: string) {
  const config: Record<string, { label: string; className: string }> = {
    active: { label: "Active", className: "bg-emerald-50 text-emerald-700" },
    invited: { label: "Invited", className: "bg-amber-50 text-amber-700" },
  };
  const c = config[status] || config.active;
  return (
    <Badge variant="secondary" className={c.className}>
      {c.label}
    </Badge>
  );
}

// -------------------------------------------------------------------
// Page Component
// -------------------------------------------------------------------

function SettingsPageInner() {
  const { user, loading: userLoading } = useUser();
  const searchParams = useSearchParams();

  // Initial tab from ?tab= URL param. Falls back to role-appropriate
  // default (Super Admin → platform, everyone else → organization).
  const initialTab = (() => {
    const t = searchParams.get("tab");
    const valid = ["platform", "organization", "brands", "team", "approvals", "account", "data"];
    if (t && valid.includes(t)) return t;
    return user?.role === "platform_admin" ? "platform" : "organization";
  })();
  const [activeTab, setActiveTab] = useState<string>(initialTab);

  // Update active tab when user role resolves (in case initial render
  // happened before useUser settled)
  useEffect(() => {
    if (!userLoading) {
      const t = searchParams.get("tab");
      if (t) {
        setActiveTab(t);
      } else if (user?.role === "platform_admin") {
        setActiveTab("platform");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLoading, user?.role]);

  // Loading states
  const [loadingOrg, setLoadingOrg] = useState(true);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [loadingPrefs, setLoadingPrefs] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(true);

  // Organization state
  const [orgName, setOrgName] = useState("");
  const [orgCreatedAt, setOrgCreatedAt] = useState<string | null>(null);
  const [orgSaved, setOrgSaved] = useState(false);
  const [orgSaving, setOrgSaving] = useState(false);

  // Team members state
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("org_member");
  const [inviting, setInviting] = useState(false);

  // Alert preferences state
  const [alertPrefs, setAlertPrefs] = useState<AlertPreference[]>(DEFAULT_ALERT_PREFS);
  const [emailDigestEnabled, setEmailDigestEnabled] = useState(true);
  const [alertsSaved, setAlertsSaved] = useState(false);
  const [alertsSaving, setAlertsSaving] = useState(false);

  // Notification routing state
  const [notifRoutes, setNotifRoutes] = useState<Record<string, NotifRoute>>({});
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [defaultHighSeverity, setDefaultHighSeverity] = useState<NotifRoute>({ email: true, whatsapp: true });
  const [defaultNormal, setDefaultNormal] = useState<NotifRoute>({ email: true, whatsapp: false });
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifSaved, setNotifSaved] = useState(false);
  const [loadingNotif, setLoadingNotif] = useState(true);

  // Account state
  const [accountName, setAccountName] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [accountRole, setAccountRole] = useState("");
  // Legacy state retained for handleAccountSave reset path only
  const [, setCurrentPassword] = useState("");
  const [, setNewPassword] = useState("");
  const [, setConfirmPassword] = useState("");
  const [accountSaved, setAccountSaved] = useState(false);
  const [accountSaving, setAccountSaving] = useState(false);

  // Data management

  // Pending approvals state
  const [signupRequests, setSignupRequests] = useState<SignupRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [approvalFeedback, setApprovalFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [approvalStates, setApprovalStates] = useState<Record<string, {
    orgId: string;
    role: string;
    fullAccess: boolean;
    newOrgName: string;
    processing: boolean;
  }>>({});

  // Templates state
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [templateUploading, setTemplateUploading] = useState(false);
  const [templateDescription, setTemplateDescription] = useState("");
  const [showTemplateUpload, setShowTemplateUpload] = useState(false);
  const [selectedTemplateFile, setSelectedTemplateFile] = useState<File | null>(null);

  const orgId = user?.orgId;
  const [orgLogoUrl, setOrgLogoUrl] = useState<string | null>(null);

  // Fetch organization details
  useEffect(() => {
    if (!orgId) return;
    setLoadingOrg(true);
    getOrganization(orgId)
      .then((data) => {
        const org = data.organization;
        if (org) {
          setOrgName(org.name || "");
          setOrgCreatedAt(org.created_at || null);
          setOrgLogoUrl(org.logo_url || null);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingOrg(false));
  }, [orgId]);

  // Fetch team members
  useEffect(() => {
    if (!orgId) return;
    setLoadingMembers(true);
    getOrgMembers(orgId)
      .then((data) => setTeamMembers(data.items || data.members || []))
      .catch(() => {})
      .finally(() => setLoadingMembers(false));
  }, [orgId]);

  // Fetch alert preferences
  useEffect(() => {
    if (!orgId) return;
    setLoadingPrefs(true);
    getAlertPreferences(orgId)
      .then((data) => {
        const prefs = data.preferences || {};
        if (Object.keys(prefs).length > 0) {
          setAlertPrefs(
            DEFAULT_ALERT_PREFS.map((p) => ({
              ...p,
              daysBefore: prefs[p.key] ?? p.daysBefore,
            }))
          );
          if (prefs.email_digest_enabled !== undefined) {
            setEmailDigestEnabled(prefs.email_digest_enabled);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoadingPrefs(false));
  }, [orgId]);

  // Fetch notification preferences
  useEffect(() => {
    if (!orgId) return;
    setLoadingNotif(true);
    getNotificationPreferences(orgId)
      .then((notifPrefs) => {
        if (notifPrefs.whatsapp_number) setWhatsappNumber(notifPrefs.whatsapp_number);
        if (notifPrefs.routes) setNotifRoutes(notifPrefs.routes);
        if (notifPrefs.default_high_severity) setDefaultHighSeverity(notifPrefs.default_high_severity);
        if (notifPrefs.default_normal) setDefaultNormal(notifPrefs.default_normal);
      })
      .catch(() => {})
      .finally(() => setLoadingNotif(false));
  }, [orgId]);

  // Fetch profile
  useEffect(() => {
    if (userLoading) return;
    setLoadingProfile(true);
    if (user) {
      // Use data from useUser hook directly
      setAccountName(user.fullName || "");
      setAccountEmail(user.email || "");
      setAccountRole(user.role || "org_member");
      setLoadingProfile(false);
    }
    // Fetch the authoritative profile from the backend. The old guard
    // that skipped this for user.id === "demo-user" is a leftover from
    // the removed demo auth path and is no longer reachable.
    if (user) {
      getProfile()
        .then((data) => {
          const profile = data.profile;
          if (profile) {
            setAccountName(profile.full_name || "");
            setAccountEmail(profile.email || "");
            setAccountRole(profile.role || "org_member");
          }
        })
        .catch(() => {})
        .finally(() => setLoadingProfile(false));
    }
  }, [user, userLoading]);

  // Fetch signup requests and orgs for approvals
  const fetchSignupRequests = useCallback(async () => {
    try {
      setLoadingRequests(true);
      const [reqData, orgData] = await Promise.all([
        listSignupRequests("pending"),
        listOrganizations(),
      ]);
      setSignupRequests(reqData.requests || []);
      setOrgs((orgData.items || []).map((o: { id: string; name: string }) => ({ id: o.id, name: o.name })));
      // Initialize approval state for each request
      const states: typeof approvalStates = {};
      for (const req of reqData.requests || []) {
        states[req.id] = {
          orgId: orgId || "",
          role: "org_member",
          fullAccess: false,
          newOrgName: "",
          processing: false,
        };
      }
      setApprovalStates(states);
    } catch {
      // silently handle
    } finally {
      setLoadingRequests(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchSignupRequests();
  }, [fetchSignupRequests]);

  // Export all signup requests (all statuses) as CSV
  async function exportCSV() {
    try {
      const allData = await listSignupRequests("all");
      const rows: SignupRequest[] = allData.requests || [];
      if (rows.length === 0) return;

      const headers = ["Name", "Email", "Company", "Phone", "City", "Outlets", "Status", "Signed Up"];
      const csvRows = [headers.join(",")];
      for (const r of rows) {
        csvRows.push([
          `"${(r.name || "").replace(/"/g, '""')}"`,
          `"${(r.email || "").replace(/"/g, '""')}"`,
          `"${(r.company || "").replace(/"/g, '""')}"`,
          `"${(r.phone || "").replace(/"/g, '""')}"`,
          `"${(r.city || "").replace(/"/g, '""')}"`,
          r.num_outlets ?? "",
          r.status,
          new Date(r.created_at).toLocaleString("en-IN"),
        ].join(","));
      }

      const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `signup_requests_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silently handle
    }
  }

  // Export all signup requests as PDF
  async function exportPDF() {
    try {
      const allData = await listSignupRequests("all");
      const rows: SignupRequest[] = allData.requests || [];
      if (rows.length === 0) return;

      // Build HTML table for print
      const tableRows = rows.map((r) => `
        <tr>
          <td style="padding:6px 10px;border:1px solid #ddd;">${r.name || ""}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;">${r.email || ""}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;">${r.company || ""}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;">${r.phone || ""}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;">${r.city || ""}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;">${r.num_outlets ?? ""}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;text-transform:capitalize;">${r.status}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;">${new Date(r.created_at).toLocaleString("en-IN")}</td>
        </tr>
      `).join("");

      const html = `
        <html>
        <head>
          <title>Signup Requests - GroSpace</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 30px; color: #1a1a1a; }
            h1 { font-size: 20px; margin-bottom: 4px; }
            p.subtitle { font-size: 12px; color: #666; margin-bottom: 20px; }
            table { border-collapse: collapse; width: 100%; font-size: 12px; }
            th { padding: 8px 10px; border: 1px solid #ddd; background: #132337; color: white; text-align: left; font-weight: 600; }
            @media print { body { padding: 10px; } }
          </style>
        </head>
        <body>
          <h1>GroSpace — Signup Requests</h1>
          <p class="subtitle">Exported on ${new Date().toLocaleString("en-IN")} &bull; Total: ${rows.length} requests</p>
          <table>
            <thead>
              <tr>
                <th>Name</th><th>Email</th><th>Company</th><th>Phone</th><th>City</th><th>Outlets</th><th>Status</th><th>Signed Up</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </body>
        </html>
      `;

      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => printWindow.print(), 300);
      }
    } catch {
      // silently handle
    }
  }

  function showFeedback(type: "success" | "error", message: string) {
    setApprovalFeedback({ type, message });
    setTimeout(() => setApprovalFeedback(null), 4000);
  }

  async function handleApprove(requestId: string) {
    const state = approvalStates[requestId];
    if (!state) return;
    const reqName = signupRequests.find((r) => r.id === requestId)?.name || "User";

    let targetOrgId = state.orgId;

    // If "new" org selected, create it first
    if (targetOrgId === "__new__" && state.newOrgName.trim()) {
      setApprovalStates((prev) => ({ ...prev, [requestId]: { ...prev[requestId], processing: true } }));
      try {
        const res = await createOrganization(state.newOrgName.trim());
        targetOrgId = res.organization.id;
      } catch {
        showFeedback("error", "Failed to create organization");
        setApprovalStates((prev) => ({ ...prev, [requestId]: { ...prev[requestId], processing: false } }));
        return;
      }
    }

    if (!targetOrgId || targetOrgId === "__new__") {
      showFeedback("error", "Please select or create an organization");
      return;
    }

    setApprovalStates((prev) => ({ ...prev, [requestId]: { ...prev[requestId], processing: true } }));
    try {
      await approveSignupRequest(requestId, targetOrgId, state.role, state.fullAccess);
      setSignupRequests((prev) => prev.filter((r) => r.id !== requestId));
      showFeedback("success", `${reqName} has been approved successfully`);
    } catch (err) {
      showFeedback("error", err instanceof Error ? err.message : "Failed to approve request");
    } finally {
      setApprovalStates((prev) => ({ ...prev, [requestId]: { ...prev[requestId], processing: false } }));
    }
  }

  async function handleReject(requestId: string) {
    if (!confirm("Reject this signup request?")) return;
    const reqName = signupRequests.find((r) => r.id === requestId)?.name || "User";
    setApprovalStates((prev) => ({ ...prev, [requestId]: { ...prev[requestId], processing: true } }));
    try {
      await rejectSignupRequest(requestId);
      setSignupRequests((prev) => prev.filter((r) => r.id !== requestId));
      showFeedback("success", `${reqName} has been rejected`);
    } catch (err) {
      showFeedback("error", err instanceof Error ? err.message : "Failed to reject request");
    } finally {
      setApprovalStates((prev) => ({ ...prev, [requestId]: { ...prev[requestId], processing: false } }));
    }
  }

  function updateApprovalState(requestId: string, updates: Partial<typeof approvalStates[string]>) {
    setApprovalStates((prev) => ({
      ...prev,
      [requestId]: { ...prev[requestId], ...updates },
    }));
  }

  // Handlers
  async function handleOrgSave() {
    if (!orgId) return;
    setOrgSaving(true);
    try {
      await updateOrganization(orgId, { name: orgName });
      setOrgSaved(true);
      setTimeout(() => setOrgSaved(false), 2000);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setOrgSaving(false);
    }
  }

  // Invite result banner — shown after inviting a member so the inviter
  // can see whether the email was delivered, and copy the temp password
  // manually if Resend blocked the recipient (test-mode limitation).
  const [inviteResult, setInviteResult] = useState<{
    email: string;
    tempPassword: string;
    emailSent: boolean;
    emailReason?: string | null;
    emailError?: string | null;
  } | null>(null);

  async function handleInvite() {
    if (!orgId || !inviteEmail) return;
    setInviting(true);
    setInviteResult(null);
    try {
      const res = await inviteOrgMember(orgId, inviteEmail, inviteRole);
      setTeamMembers((prev) => [...prev, { ...res.member, status: "invited" }]);

      // Surface the result to the UI so the inviter can copy credentials
      // if the invitation email failed (common in Resend test mode).
      setInviteResult({
        email: res.member?.email || inviteEmail,
        tempPassword: res.temp_password || "",
        emailSent: !!res.email_sent,
        emailReason: res.email_reason,
        emailError: res.email_error,
      });

      setInviteEmail("");
      setInviteRole("org_member");
      setShowInviteForm(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to invite");
    } finally {
      setInviting(false);
    }
  }

  async function handleRemoveMember(memberId: string) {
    if (!orgId) return;
    if (!confirm("Remove this member from your organization?")) return;
    try {
      await removeOrgMember(orgId, memberId);
      setTeamMembers((prev) => prev.filter((m) => m.id !== memberId));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to remove member");
    }
  }

  async function handleAlertsSave() {
    if (!orgId) return;
    setAlertsSaving(true);
    try {
      const prefsObj: Record<string, unknown> = {
        email_digest_enabled: emailDigestEnabled,
      };
      alertPrefs.forEach((p) => {
        prefsObj[p.key] = p.daysBefore;
      });
      await saveAlertPreferences(orgId, prefsObj);
      setAlertsSaved(true);
      setTimeout(() => setAlertsSaved(false), 2000);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save preferences");
    } finally {
      setAlertsSaving(false);
    }
  }

  async function handleAccountSave() {
    setAccountSaving(true);
    try {
      await updateProfile({ full_name: accountName });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setAccountSaved(true);
      setTimeout(() => setAccountSaved(false), 2000);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setAccountSaving(false);
    }
  }

  async function handleNotifSave() {
    if (!orgId) return;
    setNotifSaving(true);
    try {
      await saveNotificationPreferences(orgId, {
        whatsapp_number: whatsappNumber,
        routes: notifRoutes,
        default_high_severity: defaultHighSeverity,
        default_normal: defaultNormal,
      });
      setNotifSaved(true);
      setTimeout(() => setNotifSaved(false), 2000);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setNotifSaving(false);
    }
  }

  function toggleRoute(alertType: string, channel: "email" | "whatsapp") {
    setNotifRoutes((prev) => {
      const current = prev[alertType] || { email: true, whatsapp: false };
      return { ...prev, [alertType]: { ...current, [channel]: !current[channel] } };
    });
  }

  function updateAlertDays(key: string, days: number) {
    setAlertPrefs((prev) =>
      prev.map((p) => (p.key === key ? { ...p, daysBefore: days } : p))
    );
  }

  function formatCreatedDate(dateStr: string | null): string {
    if (!dateStr) return "---";
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  // Load templates from localStorage
  useEffect(() => {
    if (!orgId) return;
    try {
      const stored = localStorage.getItem(`grospace_templates_${orgId}`);
      if (stored) {
        setTemplates(JSON.parse(stored));
      }
    } catch {
      // silently handle
    }
  }, [orgId]);

  function saveTemplatesToStorage(updated: TemplateItem[]) {
    if (!orgId) return;
    setTemplates(updated);
    try {
      localStorage.setItem(`grospace_templates_${orgId}`, JSON.stringify(updated));
    } catch {
      // silently handle
    }
  }

  async function handleTemplateUpload() {
    if (!orgId || !selectedTemplateFile) return;
    setTemplateUploading(true);
    try {
      const result = await uploadTemplate(orgId, selectedTemplateFile);
      const newTemplate: TemplateItem = {
        id: `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: selectedTemplateFile.name,
        description: templateDescription,
        file_url: result.url,
        storage_path: result.path,
        uploaded_at: new Date().toISOString(),
        size: selectedTemplateFile.size,
      };
      saveTemplatesToStorage([newTemplate, ...templates]);
      setSelectedTemplateFile(null);
      setTemplateDescription("");
      setShowTemplateUpload(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to upload template");
    } finally {
      setTemplateUploading(false);
    }
  }

  async function handleTemplateDelete(template: TemplateItem) {
    if (!confirm(`Delete template "${template.name}"?`)) return;
    try {
      await deleteTemplate(template.storage_path);
    } catch {
      // File may already be deleted from storage, continue removing from list
    }
    saveTemplatesToStorage(templates.filter((t) => t.id !== template.id));
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <PageHeader title="Settings" description="Manage your organization, team, reminders, and account preferences" />

      {/* Tabs — flat underline style, no pill bg */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="h-auto bg-transparent border-b border-border rounded-none p-0 w-full justify-start gap-6 overflow-x-auto scrollbar-hide">
          {user?.role === "platform_admin" && (
            <TabsTrigger
              value="platform"
              className="relative h-10 rounded-none bg-transparent px-0 text-[13px] font-semibold text-muted-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:bottom-[-1px] data-[state=active]:after:h-[2px] data-[state=active]:after:bg-foreground"
            >
              Platform
            </TabsTrigger>
          )}
          <TabsTrigger
            value="organization"
            className="relative h-10 rounded-none bg-transparent px-0 text-[13px] font-semibold text-muted-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:bottom-[-1px] data-[state=active]:after:h-[2px] data-[state=active]:after:bg-foreground"
          >
            Organization
          </TabsTrigger>
          <TabsTrigger
            value="brands"
            className="relative h-10 rounded-none bg-transparent px-0 text-[13px] font-semibold text-muted-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:bottom-[-1px] data-[state=active]:after:h-[2px] data-[state=active]:after:bg-foreground"
          >
            Brands
          </TabsTrigger>
          <TabsTrigger
            value="team"
            className="relative h-10 rounded-none bg-transparent px-0 text-[13px] font-semibold text-muted-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:bottom-[-1px] data-[state=active]:after:h-[2px] data-[state=active]:after:bg-foreground"
          >
            Team & Roles
          </TabsTrigger>
          {/* Approvals — legacy signup-request flow, only Super Admin sees it */}
          {user?.role === "platform_admin" && (
            <TabsTrigger
              value="approvals"
              className="relative h-10 rounded-none bg-transparent px-0 text-[13px] font-semibold text-muted-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:bottom-[-1px] data-[state=active]:after:h-[2px] data-[state=active]:after:bg-foreground"
            >
              Approvals
              {signupRequests.length > 0 && (
                <span className="ml-2 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-foreground text-background text-[10px] font-semibold">
                  {signupRequests.length}
                </span>
              )}
            </TabsTrigger>
          )}
          {/* Templates + Reminder Preferences: dropped for both roles —
              legacy features that added clutter. Reminder config moved into
              the Organization tab (TODO) and templates aren't a real feature. */}
          <TabsTrigger
            value="account"
            className="relative h-10 rounded-none bg-transparent px-0 text-[13px] font-semibold text-muted-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:bottom-[-1px] data-[state=active]:after:h-[2px] data-[state=active]:after:bg-foreground"
          >
            Account
          </TabsTrigger>
          {/* Data tab: Super Admin only (platform-wide export/flush operations) */}
          {user?.role === "platform_admin" && (
            <TabsTrigger
              value="data"
              className="relative h-10 rounded-none bg-transparent px-0 text-[13px] font-semibold text-muted-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:bottom-[-1px] data-[state=active]:after:h-[2px] data-[state=active]:after:bg-foreground"
            >
              Data
            </TabsTrigger>
          )}
        </TabsList>

        {/* ============================================================= */}
        {/* Platform Tab (Super Admin only)                                */}
        {/* ============================================================= */}
        {user?.role === "platform_admin" && (
          <TabsContent value="platform" className="mt-6">
            <PlatformSuperAdminSection />
          </TabsContent>
        )}

        {/* ============================================================= */}
        {/* Organization Tab                                               */}
        {/* ============================================================= */}
        <TabsContent value="organization" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Organization Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {loadingOrg ? (
                <div className="flex items-center gap-2 text-muted-foreground py-4">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Loading organization...</span>
                </div>
              ) : (
                <>
                  {/* Org Name */}
                  <div className="grid gap-2 max-w-md">
                    <Label htmlFor="org-name">Organization Name</Label>
                    <Input
                      id="org-name"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      placeholder="Enter organization name"
                    />
                  </div>

                  {/* Logo Upload */}
                  <div className="grid gap-2 max-w-md">
                    <Label>Organization Logo</Label>
                    <div className="flex items-center gap-4">
                      <div className="w-20 h-20 rounded-lg border-2 border-dashed border-border bg-muted flex items-center justify-center overflow-hidden">
                        {orgLogoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={orgLogoUrl} alt="Logo" className="w-full h-full object-contain" />
                        ) : (
                          <Upload className="w-6 h-6 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="cursor-pointer">
                          <input
                            type="file"
                            className="hidden"
                            accept=".png,.jpg,.jpeg,.svg,.webp"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file || !orgId) return;
                              try {
                                const formData = new FormData();
                                formData.append("file", file);
                                formData.append("category", "logo");
                                const uploadRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/documents/upload-file`, {
                                  method: "POST",
                                  body: formData,
                                });
                                const uploadData = await uploadRes.json();
                                if (uploadData?.url) {
                                  await updateOrganization(orgId, { logo_url: uploadData.url });
                                  setOrgLogoUrl(uploadData.url);
                                }
                              } catch (err) {
                                console.error("Logo upload failed:", err);
                              }
                              e.target.value = "";
                            }}
                          />
                          <Button variant="outline" size="sm" className="gap-1.5" asChild>
                            <span>
                              <Upload className="w-3.5 h-3.5" />
                              {orgLogoUrl ? "Change Logo" : "Upload Logo"}
                            </span>
                          </Button>
                        </label>
                        <p className="text-xs text-muted-foreground">
                          PNG or JPG, max 2 MB. Shows across the app.
                        </p>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Created date */}
                  <div className="flex items-center gap-2 max-w-md">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <Label className="text-muted-foreground">Created</Label>
                      <p className="text-sm">{formatCreatedDate(orgCreatedAt)}</p>
                    </div>
                  </div>

                  <Separator />

                  {/* Save */}
                  <div className="flex items-center gap-3">
                    <Button onClick={handleOrgSave} disabled={orgSaving} className="gap-1.5">
                      {orgSaved ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : orgSaving ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Save className="w-3.5 h-3.5" />
                      )}
                      {orgSaved ? "Saved" : orgSaving ? "Saving..." : "Save Changes"}
                    </Button>
                    {orgSaved && (
                      <span className="text-sm text-neutral-700 font-medium">
                        Changes saved successfully
                      </span>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============================================================= */}
        {/* Brands Tab                                                     */}
        {/* ============================================================= */}
        <TabsContent value="brands" className="mt-6">
          <BrandsSection />
        </TabsContent>

        {/* ============================================================= */}
        {/* Team Members Tab                                               */}
        {/* ============================================================= */}
        <TabsContent value="team" className="mt-6 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">Team & Roles</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                {loadingMembers
                  ? "Loading..."
                  : `${teamMembers.length} member${teamMembers.length !== 1 ? "s" : ""} in your organization`}
              </p>
            </div>
            <Button
              onClick={() => setShowInviteForm(!showInviteForm)}
              className="gap-1.5"
            >
              <Mail className="w-3.5 h-3.5" />
              Invite Member
            </Button>
          </div>

          {/* Invite result banner — show generated credentials + email status */}
          {inviteResult && (
            <div className={`rounded-lg border p-4 space-y-2 ${
              inviteResult.emailSent
                ? "border-emerald-200 bg-emerald-50/30"
                : "border-amber-200 bg-amber-50/30"
            }`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className={`text-[13px] font-semibold ${inviteResult.emailSent ? "text-emerald-900" : "text-amber-900"}`}>
                    {inviteResult.emailSent
                      ? `Invitation email sent to ${inviteResult.email}`
                      : `Email could not be sent to ${inviteResult.email}`}
                  </p>
                  {inviteResult.emailReason === "test_mode_recipient_blocked" && (
                    <p className="text-[11.5px] text-amber-800 mt-1 leading-relaxed">
                      Resend is in test mode and can only deliver to the account owner&apos;s email.
                      Verify a custom domain at <a href="https://resend.com/domains" target="_blank" rel="noopener noreferrer" className="underline font-semibold">resend.com/domains</a> to unlock delivery to all recipients.
                      For now, <strong>copy the credentials below</strong> and hand them off manually.
                    </p>
                  )}
                  {inviteResult.emailError && inviteResult.emailReason !== "test_mode_recipient_blocked" && (
                    <p className="text-[11.5px] text-amber-800 mt-1">{inviteResult.emailError}</p>
                  )}
                </div>
                <Button size="sm" variant="ghost" onClick={() => setInviteResult(null)} className="text-[11px] shrink-0">
                  Dismiss
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="rounded bg-white border border-border px-3 py-2">
                  <p className="text-[9.5px] uppercase tracking-wider text-muted-foreground font-semibold">Login email</p>
                  <p className="text-[12px] font-mono text-foreground mt-0.5 break-all">{inviteResult.email}</p>
                </div>
                <div className="rounded bg-white border border-border px-3 py-2">
                  <p className="text-[9.5px] uppercase tracking-wider text-muted-foreground font-semibold">Temporary password</p>
                  <p className="text-[12px] font-mono text-foreground mt-0.5 break-all">{inviteResult.tempPassword}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-[11px] gap-1"
                  onClick={() => {
                    const text = `Login: ${inviteResult.email}\nPassword: ${inviteResult.tempPassword}\nURL: ${window.location.origin}/auth/login`;
                    navigator.clipboard.writeText(text);
                    alert("Credentials copied to clipboard!");
                  }}
                >
                  Copy credentials
                </Button>
                <p className="text-[10.5px] text-muted-foreground">
                  Save this — the password won&apos;t be shown again.
                </p>
              </div>
            </div>
          )}

          {/* Role hierarchy explanation */}
          <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3 text-xs text-blue-700">
            <strong>Role Hierarchy (Top → Bottom):</strong> Platform Admin has full system access across all organizations. Org Admin manages their organization, team, and settings. Org Member has view-only access with limited actions. Higher roles inherit all permissions of lower roles.
          </div>

          {/* Role Tier Overview Card (Task 42) */}
          {(user?.role === "org_admin" || user?.role === "platform_admin") && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  Role Tiers
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-lg border border-neutral-300 bg-neutral-50/50 p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className="bg-neutral-50 text-neutral-900 border-neutral-300 text-[10px]">System Admin</Badge>
                    </div>
                    <p className="text-xs text-foreground">Full system access across all organizations</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {teamMembers.filter((m) => m.role === "platform_admin").length} member{teamMembers.filter((m) => m.role === "platform_admin").length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/50 p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className="bg-muted text-foreground border-border text-[10px]">Admin</Badge>
                    </div>
                    <p className="text-xs text-foreground">Full access within organization, team management</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {teamMembers.filter((m) => m.role === "org_admin").length} member{teamMembers.filter((m) => m.role === "org_admin").length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/50 p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className="bg-muted text-foreground border-border text-[10px]">Member</Badge>
                    </div>
                    <p className="text-xs text-foreground">Standard view access, limited actions</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {teamMembers.filter((m) => m.role === "org_member").length} member{teamMembers.filter((m) => m.role === "org_member").length !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Invite Form (inline toggle) */}
          {showInviteForm && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Invite New Member</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1 grid gap-2">
                    <Label htmlFor="invite-email" className="text-xs">
                      Email Address
                    </Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="invite-email"
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="email@company.com"
                        className="pl-9"
                      />
                    </div>
                  </div>
                  <div className="w-full sm:w-48 grid gap-2">
                    <Label htmlFor="invite-role" className="text-xs">
                      Role
                    </Label>
                    <Select value={inviteRole} onValueChange={setInviteRole}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="org_admin">Org Admin</SelectItem>
                        <SelectItem value="org_member">Org Member</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end gap-2">
                    <Button className="gap-1.5" onClick={handleInvite} disabled={inviting || !inviteEmail}>
                      {inviting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Mail className="w-3.5 h-3.5" />
                      )}
                      {inviting ? "Sending..." : "Send Invite"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowInviteForm(false);
                        setInviteEmail("");
                        setInviteRole("org_member");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Members Table */}
          <Card>
            <CardContent className="p-0">
              {loadingMembers ? (
                <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Loading team members...</span>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/80">
                        <th className="text-left font-medium text-muted-foreground px-4 py-3">
                          Name
                        </th>
                        <th className="text-left font-medium text-muted-foreground px-4 py-3">
                          Email
                        </th>
                        <th className="text-left font-medium text-muted-foreground px-4 py-3">
                          Role
                        </th>
                        <th className="text-left font-medium text-muted-foreground px-4 py-3">
                          Status
                        </th>
                        <th className="text-right font-medium text-muted-foreground px-4 py-3">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {teamMembers.map((member) => (
                        <tr
                          key={member.id}
                          className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors"
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-foreground flex items-center justify-center shrink-0">
                                <span className="text-white text-[10px] font-semibold">
                                  {getInitials(member.full_name || member.email)}
                                </span>
                              </div>
                              <span className="font-medium">
                                {member.full_name || member.email.split("@")[0]}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-foreground">
                            {member.email}
                          </td>
                          <td className="px-4 py-3">{roleBadge(member.role)}</td>
                          <td className="px-4 py-3">
                            {statusBadge(member.status || "active")}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-neutral-900"
                                title="Remove member"
                                onClick={() => handleRemoveMember(member.id)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {teamMembers.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground text-sm">
                            No team members found. Invite someone to get started.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============================================================= */}
        {/* Pending Approvals Tab (Super Admin only)                       */}
        {/* ============================================================= */}
        {user?.role === "platform_admin" && (
        <TabsContent value="approvals" className="mt-6 space-y-4">
          <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3 text-xs text-blue-700">
            <strong>How Approvals Work:</strong> When new users sign up for GroSpace, their request appears here. You can assign them to an organization, set their role (Org Member, Org Admin, or Platform Admin), and approve or reject their access. Approved users get immediate access to their assigned organization.
          </div>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Pending Sign-up Requests
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" onClick={exportCSV}>
                  <Download className="h-3.5 w-3.5" />
                  CSV
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" onClick={exportPDF}>
                  <FileText className="h-3.5 w-3.5" />
                  PDF
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {approvalFeedback && (
                <div className={`mb-4 px-4 py-3 rounded-lg text-sm flex items-center gap-2 ${
                  approvalFeedback.type === "success"
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-rose-50 text-rose-700 border border-rose-200"
                }`}>
                  {approvalFeedback.type === "success" ? (
                    <CheckCircle className="h-4 w-4 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                  )}
                  {approvalFeedback.message}
                </div>
              )}
              {loadingRequests ? (
                <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Loading requests...</span>
                </div>
              ) : signupRequests.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <CheckCircle className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm font-medium">No pending requests</p>
                  <p className="text-xs mt-1">New sign-up requests will appear here for approval</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {signupRequests.map((req) => {
                    const state = approvalStates[req.id] || { orgId: "", role: "org_member", fullAccess: false, newOrgName: "", processing: false };
                    return (
                      <div key={req.id} className="border rounded-lg p-4 space-y-4">
                        {/* Request info */}
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className="font-semibold text-sm">{req.name}</h4>
                            <p className="text-xs text-muted-foreground mt-0.5">{req.email}</p>
                            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                              {req.company && (
                                <span className="flex items-center gap-1">
                                  <Building2 className="h-3 w-3" />
                                  {req.company}
                                </span>
                              )}
                              {req.phone && (
                                <span>{req.phone}</span>
                              )}
                              {req.city && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3" />
                                  {req.city}
                                </span>
                              )}
                              {req.num_outlets != null && req.num_outlets > 0 && (
                                <span className="flex items-center gap-1">
                                  <Store className="h-3 w-3" />
                                  {req.num_outlets} outlets
                                </span>
                              )}
                              <span>
                                {new Date(req.created_at).toLocaleDateString("en-IN", {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                          </div>
                          <Badge variant="secondary" className="bg-amber-50 text-amber-700">Pending</Badge>
                        </div>

                        {/* Approval controls */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t">
                          {/* Assign to Organization */}
                          <div className="space-y-1.5">
                            <Label className="text-xs">Assign to Organization</Label>
                            <Select
                              value={state.orgId}
                              onValueChange={(v) => updateApprovalState(req.id, { orgId: v })}
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder="Select org..." />
                              </SelectTrigger>
                              <SelectContent>
                                {orgs.map((org) => (
                                  <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                                ))}
                                <SelectItem value="__new__">+ Create New Organization</SelectItem>
                              </SelectContent>
                            </Select>
                            {state.orgId === "__new__" && (
                              <Input
                                placeholder="New organization name"
                                value={state.newOrgName}
                                onChange={(e) => updateApprovalState(req.id, { newOrgName: e.target.value })}
                                className="h-9 mt-1.5"
                              />
                            )}
                          </div>

                          {/* Role */}
                          <div className="space-y-1.5">
                            <Label className="text-xs">Role</Label>
                            <Select
                              value={state.role}
                              onValueChange={(v) => updateApprovalState(req.id, { role: v })}
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="org_member">Org Member</SelectItem>
                                <SelectItem value="org_admin">Org Admin</SelectItem>
                                <SelectItem value="platform_admin">Platform Admin</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Full Access Toggle */}
                          <div className="space-y-1.5">
                            <Label className="text-xs">Access Level</Label>
                            <div className="flex items-center gap-2 h-9">
                              <Switch
                                checked={state.fullAccess}
                                onCheckedChange={(v) => updateApprovalState(req.id, { fullAccess: v })}
                              />
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Eye className="h-3 w-3" />
                                {state.fullAccess ? "Full Access (all orgs)" : "Org-only access"}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-2 pt-2">
                          <Button
                            size="sm"
                            onClick={() => handleApprove(req.id)}
                            disabled={state.processing || (!state.orgId || (state.orgId === "__new__" && !state.newOrgName.trim()))}
                            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                          >
                            {state.processing ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <CheckCircle className="h-3.5 w-3.5" />
                            )}
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleReject(req.id)}
                            disabled={state.processing}
                            className="gap-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Reject
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        )}

        {/* ============================================================= */}
        {/* Templates Tab                                                  */}
        {/* ============================================================= */}
        {/* Templates tab — retained for fallback URL access but no tab
            trigger exists so this is effectively dead code. Wrapped in a
            permanent `false` guard to kill-switch it without deleting the
            markup (in case we restore templates later). */}
        {false && (
        <TabsContent value="templates" className="mt-6 space-y-4">
          <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3 text-xs text-blue-700">
            <strong>Agreement Templates:</strong> Upload your standard lease agreement templates here. These serve as your baseline terms — when new agreements are extracted, you can compare them against these standards to quickly identify deviations in rent structure, lock-in periods, escalation clauses, and other key terms.
          </div>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Agreement Templates</CardTitle>
                <label>
                  <input
                    type="file"
                    accept=".pdf,.docx"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setShowTemplateUpload(true);
                        // Store selected file for upload
                        setSelectedTemplateFile(file);
                      }
                      e.target.value = "";
                    }}
                  />
                  <Button variant="outline" size="sm" className="gap-1.5" asChild>
                    <span><Upload className="h-3.5 w-3.5" /> Upload Template</span>
                  </Button>
                </label>
              </div>
            </CardHeader>
            <CardContent>
              {showTemplateUpload && (
                <div className="mb-4 p-4 rounded-lg border border-border bg-muted/30 space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Description</Label>
                    <Input
                      placeholder="e.g. Standard Lease Agreement — Mall"
                      value={templateDescription}
                      onChange={(e) => setTemplateDescription(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" disabled={templateUploading} onClick={handleTemplateUpload}>
                      {templateUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                      Upload
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setShowTemplateUpload(false)}>Cancel</Button>
                  </div>
                </div>
              )}
              {templates.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No templates uploaded yet.</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Upload your first standard agreement template.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {templates.map((t) => (
                    <div key={t.id} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-3">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">{t.name}</p>
                          <p className="text-xs text-muted-foreground">{t.description || "No description"} &middot; {formatFileSize(t.size)} &middot; {new Date(t.uploaded_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {t.file_url && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => window.open(t.file_url, "_blank")}>
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handleTemplateDelete(t)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        )}

        {/* ============================================================= */}
        {/* Alert Preferences Tab — killswitched (same pattern as Templates) */}
        {/* ============================================================= */}
        {false && (
        <TabsContent value="alerts" className="mt-6 space-y-4">
          {/* Alert Lead Times */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Reminder Lead Times</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Configure how many days in advance each reminder type should be
                triggered
              </p>
            </CardHeader>
            <CardContent className="space-y-0">
              {loadingPrefs ? (
                <div className="flex items-center gap-2 text-muted-foreground py-4">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Loading preferences...</span>
                </div>
              ) : (
                alertPrefs.map((pref, idx) => (
                  <div key={pref.key}>
                    <div className="flex items-center justify-between py-4">
                      <div className="flex-1 min-w-0 pr-6">
                        <p className="text-sm font-medium">{pref.label}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Input
                          type="number"
                          min={1}
                          max={365}
                          value={pref.daysBefore}
                          onChange={(e) =>
                            updateAlertDays(
                              pref.key,
                              parseInt(e.target.value) || 1
                            )
                          }
                          className="w-20 h-9 text-center text-sm"
                        />
                        <span className="text-sm text-muted-foreground w-20">
                          days before
                        </span>
                      </div>
                    </div>
                    {idx < alertPrefs.length - 1 && <Separator />}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Email Digest */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Email Digest</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Receive a daily summary of upcoming events and reminders
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Daily Email Digest</p>
                    <p className="text-xs text-muted-foreground">
                      {emailDigestEnabled
                        ? "You will receive a daily summary email"
                        : "Email digest is currently disabled"}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={emailDigestEnabled}
                  onCheckedChange={setEmailDigestEnabled}
                />
              </div>
            </CardContent>
          </Card>

          {/* Save Alert Prefs */}
          <div className="flex items-center gap-3">
            <Button onClick={handleAlertsSave} disabled={alertsSaving} className="gap-1.5">
              {alertsSaved ? (
                <Check className="w-3.5 h-3.5" />
              ) : alertsSaving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              {alertsSaved ? "Saved" : alertsSaving ? "Saving..." : "Save Preferences"}
            </Button>
            {alertsSaved && (
              <span className="text-sm text-neutral-700 font-medium">
                Reminder preferences saved successfully
              </span>
            )}
          </div>

          <Separator className="my-4" />

          {/* Notification Routing */}
          {true && (<Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MessageCircle className="w-4 h-4" />
                Notification Routing
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Choose how each reminder type is delivered. WhatsApp integration via MSG91 coming soon.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {loadingNotif ? (
                <div className="flex items-center gap-2 text-muted-foreground py-4">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Loading routing preferences...</span>
                </div>
              ) : (
                <>
                  {/* Default Routing */}
                  <div>
                    <p className="text-sm font-medium mb-3">Default Routing</p>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm">High Severity Reminders</p>
                          <p className="text-xs text-muted-foreground">Defaults for high priority reminders</p>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={defaultHighSeverity.email}
                              onCheckedChange={(v) => setDefaultHighSeverity((p) => ({ ...p, email: v }))}
                            />
                            <span className="text-xs text-muted-foreground">Email</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm">Normal Reminders</p>
                          <p className="text-xs text-muted-foreground">Defaults for medium/low reminders</p>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={defaultNormal.email}
                              onCheckedChange={(v) => setDefaultNormal((p) => ({ ...p, email: v }))}
                            />
                            <span className="text-xs text-muted-foreground">Email</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Per-Type Routes */}
                  <div>
                    <p className="text-sm font-medium mb-3">Per-Type Overrides</p>
                    <div className="space-y-0">
                      {/* Header */}
                      <div className="flex items-center justify-between py-2 px-2 bg-muted rounded-t-md border border-border">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Reminder Type</span>
                        <div className="flex items-center gap-6">
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-14 text-center">Email</span>
                        </div>
                      </div>
                      {NOTIFICATION_ALERT_TYPES.map((at, idx) => {
                        const route = notifRoutes[at.key] || { email: true, whatsapp: false };
                        return (
                          <div
                            key={at.key}
                            className={`flex items-center justify-between py-2.5 px-2 border-x border-border ${
                              idx === NOTIFICATION_ALERT_TYPES.length - 1 ? "border-b rounded-b-md" : "border-b"
                            }`}
                          >
                            <span className="text-sm">{at.label}</span>
                            <div className="flex items-center gap-6">
                              <div className="w-14 flex justify-center">
                                <Switch
                                  checked={route.email}
                                  onCheckedChange={() => toggleRoute(at.key, "email")}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Save Notification Routing */}
                  <div className="flex items-center gap-3 pt-2">
                    <Button onClick={handleNotifSave} disabled={notifSaving} className="gap-1.5">
                      {notifSaved ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : notifSaving ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Save className="w-3.5 h-3.5" />
                      )}
                      {notifSaved ? "Saved" : notifSaving ? "Saving..." : "Save Routing"}
                    </Button>
                    {notifSaved && (
                      <span className="text-sm text-neutral-700 font-medium">
                        Notification routing saved successfully
                      </span>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
          )}
        </TabsContent>
        )}

        {/* ============================================================= */}
        {/* Account Tab                                                    */}
        {/* ============================================================= */}
        <TabsContent value="account" className="mt-6 space-y-4">
          {/* Change Password (for every role) */}
          <ChangePasswordSection isSuperAdmin={user?.role === "platform_admin"} />

          {/* Profile */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {loadingProfile ? (
                <div className="flex items-center gap-2 text-muted-foreground py-4">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Loading profile...</span>
                </div>
              ) : (
                <>
                  {/* Name */}
                  <div className="grid gap-2 max-w-md">
                    <Label htmlFor="account-name">Full Name</Label>
                    <Input
                      id="account-name"
                      value={accountName}
                      onChange={(e) => setAccountName(e.target.value)}
                    />
                  </div>

                  {/* Email (disabled) */}
                  <div className="grid gap-2 max-w-md">
                    <Label htmlFor="account-email" className="flex items-center gap-1.5">
                      Email
                      <Badge
                        variant="secondary"
                        className="text-[10px] py-0 px-1.5 bg-muted text-foreground"
                      >
                        Read-only
                      </Badge>
                    </Label>
                    <Input
                      id="account-email"
                      value={accountEmail}
                      disabled
                      className="bg-muted text-muted-foreground cursor-not-allowed"
                    />
                  </div>

                  {/* Role display */}
                  <div className="grid gap-2 max-w-md">
                    <Label className="flex items-center gap-1.5">
                      Role
                      <Badge
                        variant="secondary"
                        className="text-[10px] py-0 px-1.5 bg-muted text-foreground"
                      >
                        Read-only
                      </Badge>
                    </Label>
                    <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-border bg-muted text-sm text-muted-foreground">
                      <Shield className="w-3.5 h-3.5" />
                      {roleLabels[accountRole]?.label || "Member"}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Change Password lives at the top of this tab as
              <ChangePasswordSection/> — do not duplicate it here. */}

          {/* Save */}
          <div className="flex items-center gap-3">
            <Button onClick={handleAccountSave} disabled={accountSaving} className="gap-1.5">
              {accountSaved ? (
                <Check className="w-3.5 h-3.5" />
              ) : accountSaving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              {accountSaved ? "Saved" : accountSaving ? "Saving..." : "Save Changes"}
            </Button>
            {accountSaved && (
              <span className="text-sm text-neutral-700 font-medium">
                Account updated successfully
              </span>
            )}
          </div>
        </TabsContent>

        {/* ============================================================= */}
        {/* Data Management Tab (Super Admin only)                         */}
        {/* ============================================================= */}
        {user?.role === "platform_admin" && (
        <TabsContent value="data" className="mt-6 space-y-4">
          {/* Support & Ops (#110) */}
          <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3 text-xs text-blue-700">
            <strong>About This Page:</strong> This section shows your platform support contacts, status update schedule, and scope documentation. Use the support email for any technical issues. Status updates are sent weekly with sprint progress notes.
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Support & Operations
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg border border-border space-y-1">
                  <p className="label-micro">Support Email</p>
                  <p className="text-sm font-medium">tech@grospace.in</p>
                  <p className="text-xs text-muted-foreground/60">For technical issues and platform support</p>
                </div>
                <div className="p-4 rounded-lg border border-border space-y-1">
                  <p className="label-micro">Status Updates</p>
                  <p className="text-sm font-medium">Weekly — Every Friday</p>
                  <p className="text-xs text-muted-foreground/60">Sprint notes sent to all stakeholders</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-muted-foreground">Scope Document</p>
                  <p className="text-xs text-muted-foreground/60">Module-wise scope bible — coming soon</p>
                </div>
                <Button variant="outline" size="sm" disabled className="text-xs opacity-50">View</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        )}
      </Tabs>
    </div>
  );
}


// Default export wraps the inner component in Suspense because
// useSearchParams() requires a Suspense boundary in Next.js 14.
export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-[40vh]">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <SettingsPageInner />
    </Suspense>
  );
}


// -------------------------------------------------------------------
// Brands Section (Settings → Brands tab)
// -------------------------------------------------------------------

function BrandsSection() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  async function refresh() {
    setLoading(true);
    try {
      const data = await listBrands();
      setBrands(data.brands || []);
      setWarning(data.warning || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load brands");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await createBrand({
        name: newName.trim(),
        notes: newNotes.trim() || undefined,
      });
      setNewName("");
      setNewNotes("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create brand");
    } finally {
      setCreating(false);
    }
  }

  async function handleSaveEdit(brandId: string) {
    if (!editName.trim()) return;
    try {
      await updateBrand(brandId, { name: editName.trim() });
      setEditingId(null);
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update brand");
    }
  }

  async function handleDelete(brand: Brand) {
    if (!confirm(`Delete brand "${brand.name}"? Outlets that reference it will have the link cleared but keep the brand name for historical reports.`)) return;
    try {
      await deleteBrand(brand.id);
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete brand");
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Brands</CardTitle>
          <p className="text-[12px] text-muted-foreground">
            Define the brands your organization operates. Outlets pick from
            this list so reports and filters stay consistent.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {warning && (
            <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-[12px] text-amber-900">
              {warning}
            </div>
          )}

          {/* Create form */}
          <div className="border border-border rounded-lg p-4 space-y-3 bg-muted/30">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px] text-muted-foreground">Brand name</Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Good Flippin' Burgers"
                  disabled={creating}
                />
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">Notes (optional)</Label>
                <Input
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="e.g. QSR · franchised model"
                  disabled={creating}
                />
              </div>
            </div>
            {error && <p className="text-[11px] text-rose-600">{error}</p>}
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
              >
                {creating ? "Creating…" : "Add brand"}
              </Button>
            </div>
          </div>

          {/* Brand list */}
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading brands…</span>
            </div>
          ) : brands.length === 0 ? (
            <div className="text-center text-[12px] text-muted-foreground py-6 border border-dashed border-border rounded-lg">
              No brands yet. Create your first brand above — then every outlet
              you add will pick from this curated list.
            </div>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left text-[10.5px] font-semibold text-muted-foreground uppercase tracking-wide px-3 py-2">Name</th>
                    <th className="text-left text-[10.5px] font-semibold text-muted-foreground uppercase tracking-wide px-3 py-2">Notes</th>
                    <th className="text-right text-[10.5px] font-semibold text-muted-foreground uppercase tracking-wide px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {brands.map((b) => (
                    <tr key={b.id} className="border-t border-border">
                      <td className="px-3 py-2.5 text-[12.5px] font-medium">
                        {editingId === b.id ? (
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="h-7 text-[12.5px]"
                            autoFocus
                          />
                        ) : (
                          b.name
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-[11.5px] text-muted-foreground">
                        {b.notes || "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right space-x-1">
                        {editingId === b.id ? (
                          <>
                            <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setEditingId(null)}>Cancel</Button>
                            <Button size="sm" className="h-7 text-[11px]" onClick={() => handleSaveEdit(b.id)}>Save</Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-[11px]"
                              onClick={() => {
                                setEditingId(b.id);
                                setEditName(b.name);
                              }}
                            >
                              Rename
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-[11px] text-rose-600 hover:text-rose-700"
                              onClick={() => handleDelete(b)}
                            >
                              Delete
                            </Button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


// -------------------------------------------------------------------
// Change Password Section (Settings → Account → Change Password)
// -------------------------------------------------------------------

function ChangePasswordSection({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [resettingSuperAdmin, setResettingSuperAdmin] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setSaving(true);
    try {
      await changeOwnPassword(newPassword);
      setSuccess(true);
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update password");
    } finally {
      setSaving(false);
    }
  }

  async function handleSuperAdminReset() {
    if (!confirm("Reset the Super Admin password back to the hardcoded default? Do this only if you lost access and need to recover.")) return;
    setResettingSuperAdmin(true);
    try {
      const res = await resetSuperAdminPassword();
      alert(res.message || "Super Admin password has been reset to the default.");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setResettingSuperAdmin(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Change Password</CardTitle>
        <p className="text-[12px] text-muted-foreground">
          Update the password you use to sign in to GroSpace. You&apos;ll stay logged in after the change.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-3 max-w-md">
          <div className="space-y-1.5">
            <Label htmlFor="cp-new" className="text-[12px]">New password</Label>
            <Input
              id="cp-new"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
              disabled={saving}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cp-confirm" className="text-[12px]">Confirm new password</Label>
            <Input
              id="cp-confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Type it again"
              disabled={saving}
            />
          </div>
          {error && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-900">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-900">
              Password updated successfully.
            </div>
          )}
          <Button type="submit" size="sm" disabled={saving || !newPassword || !confirmPassword}>
            {saving ? "Updating…" : "Update password"}
          </Button>
        </form>

        {isSuperAdmin && (
          <div className="mt-6 pt-6 border-t border-border">
            <p className="text-[12px] font-semibold text-foreground mb-1">Super Admin recovery</p>
            <p className="text-[11.5px] text-muted-foreground mb-3">
              If you lose access to the Super Admin account, this button rotates
              the password back to the hardcoded default so you can log in again.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="text-[12px]"
              onClick={handleSuperAdminReset}
              disabled={resettingSuperAdmin}
            >
              {resettingSuperAdmin ? "Resetting…" : "Reset Super Admin to default"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}


// -------------------------------------------------------------------
// Platform Super Admin Section (Settings → Platform tab)
// -------------------------------------------------------------------
// Only rendered for role=platform_admin. Shows:
//   - "Create New Organization" dialog with admin email + name + brand list
//   - List of all existing orgs + their default admin + created date
// Organization creation calls POST /api/admin/create-organization-with-admin
// which returns the generated temp password ONCE — we surface it to the
// Super Admin so they can hand it off manually if the email bounces.

interface AllOrgRow {
  id: string;
  name: string;
  created_at?: string;
  default_admin_email?: string | null;
  sheet_tab_name?: string | null;
}

function PlatformSuperAdminSection() {
  const [orgs, setOrgs] = useState<AllOrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // Org fields
  const [newOrgName, setNewOrgName] = useState("");
  const [newBusinessType, setNewBusinessType] = useState("");
  const [newHqCity, setNewHqCity] = useState("");
  const [newHqCountry, setNewHqCountry] = useState("IN");
  const [newGstNumber, setNewGstNumber] = useState("");
  const [newCompanyReg, setNewCompanyReg] = useState("");
  const [newExpectedSize, setNewExpectedSize] = useState("");
  const [newBillingEmail, setNewBillingEmail] = useState("");
  const [newWebsite, setNewWebsite] = useState("");
  const [newOrgNotes, setNewOrgNotes] = useState("");
  // Admin fields
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminName, setNewAdminName] = useState("");
  const [newAdminPhone, setNewAdminPhone] = useState("");
  const [newAdminRoleTitle, setNewAdminRoleTitle] = useState("");
  // Brands
  const [newBrands, setNewBrands] = useState("");

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createResult, setCreateResult] = useState<{
    email: string;
    password: string;
    org_name: string;
    email_sent: boolean;
    brands_created?: string[];
  } | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const data = await listOrganizations();
      setOrgs(data.items || data.organizations || []);
    } catch (err) {
      console.error("Failed to load orgs", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetCreateForm() {
    setNewOrgName("");
    setNewBusinessType("");
    setNewHqCity("");
    setNewHqCountry("IN");
    setNewGstNumber("");
    setNewCompanyReg("");
    setNewExpectedSize("");
    setNewBillingEmail("");
    setNewWebsite("");
    setNewOrgNotes("");
    setNewAdminEmail("");
    setNewAdminName("");
    setNewAdminPhone("");
    setNewAdminRoleTitle("");
    setNewBrands("");
    setCreateError(null);
  }

  async function handleCreate() {
    setCreateError(null);
    if (!newOrgName.trim() || !newAdminEmail.trim() || !newAdminName.trim()) {
      setCreateError("Organization name, admin email, and admin full name are required.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newAdminEmail.trim())) {
      setCreateError("Admin email is not a valid address.");
      return;
    }
    setCreating(true);
    try {
      const brandList = newBrands
        .split(",")
        .map((b) => b.trim())
        .filter(Boolean);
      const res = await createOrganizationWithAdmin({
        // Org
        name: newOrgName.trim(),
        business_type: newBusinessType || undefined,
        hq_city: newHqCity.trim() || undefined,
        hq_country: newHqCountry || undefined,
        gst_number: newGstNumber.trim() || undefined,
        company_registration: newCompanyReg.trim() || undefined,
        expected_outlets_size: newExpectedSize || undefined,
        billing_email: newBillingEmail.trim() || undefined,
        website: newWebsite.trim() || undefined,
        notes: newOrgNotes.trim() || undefined,
        // Admin
        admin_email: newAdminEmail.trim().toLowerCase(),
        admin_full_name: newAdminName.trim(),
        admin_phone: newAdminPhone.trim() || undefined,
        admin_role_title: newAdminRoleTitle.trim() || undefined,
        // Brands
        brand_names: brandList.length > 0 ? brandList : undefined,
      });
      setCreateResult({
        email: res.admin?.email || newAdminEmail,
        password: res.admin?.temp_password || "",
        org_name: res.organization?.name || newOrgName,
        email_sent: !!res.email_sent,
        brands_created: res.brands_created,
      });
      resetCreateForm();
      setShowCreate(false);
      refresh();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create organization");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Platform Administration</h2>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Create organizations on behalf of customers. Each new org gets a
            default admin user, brands, an invitation email, and its own
            activity tab in the shared Google Sheet.
          </p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => { setCreateResult(null); setShowCreate(true); }}>
          <Plus className="h-3.5 w-3.5" />
          Create New Organization
        </Button>
      </div>

      {/* Success banner with generated creds — stays until Super Admin dismisses */}
      {createResult && (
        <Card className="border-emerald-200 bg-emerald-50/30">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                <CheckCircle className="h-4 w-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13.5px] font-semibold text-emerald-900">
                  {createResult.org_name} created
                </p>
                <p className="text-[11.5px] text-emerald-800 mt-0.5">
                  {createResult.email_sent
                    ? `Invitation email sent to ${createResult.email}.`
                    : `Invitation email FAILED — hand the credentials below to ${createResult.email} manually.`}
                </p>
                {createResult.brands_created && createResult.brands_created.length > 0 && (
                  <p className="text-[11px] text-emerald-800 mt-1">
                    Brands seeded: {createResult.brands_created.join(", ")}
                  </p>
                )}
              </div>
              <Button size="sm" variant="ghost" onClick={() => setCreateResult(null)} className="text-[11px]">
                Dismiss
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
              <div className="rounded-lg bg-white border border-emerald-200 px-3 py-2">
                <p className="text-[9.5px] font-semibold uppercase tracking-wider text-emerald-700">Login email</p>
                <p className="text-[12.5px] font-mono text-foreground mt-0.5 break-all">{createResult.email}</p>
              </div>
              <div className="rounded-lg bg-white border border-emerald-200 px-3 py-2">
                <p className="text-[9.5px] font-semibold uppercase tracking-wider text-emerald-700">Temporary password</p>
                <p className="text-[12.5px] font-mono text-foreground mt-0.5 break-all">{createResult.password}</p>
              </div>
            </div>
            <p className="text-[10.5px] text-emerald-700 leading-relaxed">
              <strong>Save this password.</strong> It won&apos;t be shown again. The user
              will be forced to change it on first login.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Create dialog — 3 sections, scrollable */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl my-8 max-w-2xl w-full shadow-2xl">
            {/* Header — sticky */}
            <div className="sticky top-0 bg-white border-b border-border px-6 py-4 rounded-t-xl">
              <h3 className="text-base font-semibold">Create New Organization</h3>
              <p className="text-[11.5px] text-muted-foreground mt-0.5">
                Fills the org, auth user, brands, Google Sheet tab, and sends the
                onboarding email in one shot.
              </p>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-6">
              {/* Section 1 — Organization */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-5 w-5 rounded-full bg-foreground text-background text-[10px] font-semibold flex items-center justify-center">1</div>
                  <h4 className="text-[13px] font-semibold">Organization</h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <Label className="text-[11.5px]">Organization / Brand name *</Label>
                    <Input
                      value={newOrgName}
                      onChange={(e) => setNewOrgName(e.target.value)}
                      placeholder="e.g. ABC Foods Pvt Ltd"
                      disabled={creating}
                      autoFocus
                    />
                  </div>
                  <div>
                    <Label className="text-[11.5px]">Business type</Label>
                    <Select
                      value={newBusinessType}
                      onValueChange={setNewBusinessType}
                      disabled={creating}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="qsr">QSR / Fast Food</SelectItem>
                        <SelectItem value="cafe">Cafe / Dine-in</SelectItem>
                        <SelectItem value="cloud_kitchen">Cloud Kitchen</SelectItem>
                        <SelectItem value="retail">Retail / Fashion</SelectItem>
                        <SelectItem value="mall">Mall Operator</SelectItem>
                        <SelectItem value="co_working">Co-working</SelectItem>
                        <SelectItem value="hospitality">Hospitality / Hotel</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[11.5px]">Expected outlets</Label>
                    <Select
                      value={newExpectedSize}
                      onValueChange={setNewExpectedSize}
                      disabled={creating}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Portfolio size" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1-10">1 – 10</SelectItem>
                        <SelectItem value="11-50">11 – 50</SelectItem>
                        <SelectItem value="51-200">51 – 200</SelectItem>
                        <SelectItem value="200+">200+</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[11.5px]">HQ City</Label>
                    <Input
                      value={newHqCity}
                      onChange={(e) => setNewHqCity(e.target.value)}
                      placeholder="e.g. Gurugram"
                      disabled={creating}
                    />
                  </div>
                  <div>
                    <Label className="text-[11.5px]">HQ Country</Label>
                    <Input
                      value={newHqCountry}
                      onChange={(e) => setNewHqCountry(e.target.value)}
                      placeholder="IN"
                      disabled={creating}
                    />
                  </div>
                  <div>
                    <Label className="text-[11.5px]">GST number</Label>
                    <Input
                      value={newGstNumber}
                      onChange={(e) => setNewGstNumber(e.target.value)}
                      placeholder="22AAAAA0000A1Z5"
                      disabled={creating}
                    />
                  </div>
                  <div>
                    <Label className="text-[11.5px]">Company registration / CIN</Label>
                    <Input
                      value={newCompanyReg}
                      onChange={(e) => setNewCompanyReg(e.target.value)}
                      placeholder="U12345DL2020PTC123456"
                      disabled={creating}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-[11.5px]">Billing email</Label>
                    <Input
                      type="email"
                      value={newBillingEmail}
                      onChange={(e) => setNewBillingEmail(e.target.value)}
                      placeholder="billing@abcfoods.com"
                      disabled={creating}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-[11.5px]">Website</Label>
                    <Input
                      value={newWebsite}
                      onChange={(e) => setNewWebsite(e.target.value)}
                      placeholder="https://abcfoods.com"
                      disabled={creating}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-[11.5px]">Internal notes (optional)</Label>
                    <Input
                      value={newOrgNotes}
                      onChange={(e) => setNewOrgNotes(e.target.value)}
                      placeholder="e.g. Introduced via LinkedIn, closed May 2026"
                      disabled={creating}
                    />
                  </div>
                </div>
              </section>

              {/* Section 2 — Admin user */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-5 w-5 rounded-full bg-foreground text-background text-[10px] font-semibold flex items-center justify-center">2</div>
                  <h4 className="text-[13px] font-semibold">Default Admin User</h4>
                </div>
                <p className="text-[11px] text-muted-foreground mb-3">
                  The admin is created with a random temporary password and receives an
                  onboarding email with their login credentials. They&apos;ll be forced
                  to change the password on first login.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[11.5px]">Admin full name *</Label>
                    <Input
                      value={newAdminName}
                      onChange={(e) => setNewAdminName(e.target.value)}
                      placeholder="Alice Founder"
                      disabled={creating}
                    />
                  </div>
                  <div>
                    <Label className="text-[11.5px]">Admin email *</Label>
                    <Input
                      type="email"
                      value={newAdminEmail}
                      onChange={(e) => setNewAdminEmail(e.target.value)}
                      placeholder="alice@abcfoods.com"
                      disabled={creating}
                    />
                  </div>
                  <div>
                    <Label className="text-[11.5px]">Admin phone</Label>
                    <Input
                      value={newAdminPhone}
                      onChange={(e) => setNewAdminPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                      disabled={creating}
                    />
                  </div>
                  <div>
                    <Label className="text-[11.5px]">Role title at org</Label>
                    <Input
                      value={newAdminRoleTitle}
                      onChange={(e) => setNewAdminRoleTitle(e.target.value)}
                      placeholder="CEO / Head of Real Estate"
                      disabled={creating}
                    />
                  </div>
                </div>
              </section>

              {/* Section 3 — Brands */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-5 w-5 rounded-full bg-foreground text-background text-[10px] font-semibold flex items-center justify-center">3</div>
                  <h4 className="text-[13px] font-semibold">Initial Brands (optional)</h4>
                </div>
                <p className="text-[11px] text-muted-foreground mb-3">
                  Seed the org with an initial list of brands. Comma-separated. The
                  admin can add, rename, or delete brands anytime from Settings.
                </p>
                <Input
                  value={newBrands}
                  onChange={(e) => setNewBrands(e.target.value)}
                  placeholder="ABC Original, ABC Express, ABC Drive-Thru"
                  disabled={creating}
                />
              </section>

              {createError && (
                <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[11.5px] text-rose-900">
                  {createError}
                </div>
              )}
            </div>

            {/* Footer — sticky */}
            <div className="sticky bottom-0 bg-white border-t border-border px-6 py-4 rounded-b-xl flex justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setShowCreate(false); resetCreateForm(); }}
                disabled={creating}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={creating || !newOrgName.trim() || !newAdminEmail.trim() || !newAdminName.trim()}
              >
                {creating ? "Creating…" : "Create & send invitation"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Existing orgs list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Organizations</CardTitle>
          <p className="text-[11.5px] text-muted-foreground">
            {loading ? "Loading…" : `${orgs.length} organization${orgs.length === 1 ? "" : "s"}`}
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading organizations…</span>
            </div>
          ) : orgs.length === 0 ? (
            <div className="text-center text-[12px] text-muted-foreground py-6 border border-dashed border-border rounded-lg">
              No organizations yet. Click &quot;Create New Organization&quot; above.
            </div>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left text-[10.5px] font-semibold text-muted-foreground uppercase tracking-wide px-3 py-2">Name</th>
                    <th className="text-left text-[10.5px] font-semibold text-muted-foreground uppercase tracking-wide px-3 py-2">Admin Email</th>
                    <th className="text-left text-[10.5px] font-semibold text-muted-foreground uppercase tracking-wide px-3 py-2">Sheet Tab</th>
                    <th className="text-left text-[10.5px] font-semibold text-muted-foreground uppercase tracking-wide px-3 py-2">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {orgs.map((o) => (
                    <tr key={o.id} className="border-t border-border">
                      <td className="px-3 py-2.5 text-[12.5px] font-medium">{o.name}</td>
                      <td className="px-3 py-2.5 text-[11.5px] text-muted-foreground font-mono">
                        {o.default_admin_email || "—"}
                      </td>
                      <td className="px-3 py-2.5 text-[11.5px] text-muted-foreground">
                        {o.sheet_tab_name || "—"}
                      </td>
                      <td className="px-3 py-2.5 text-[11.5px] text-muted-foreground">
                        {o.created_at ? new Date(o.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
