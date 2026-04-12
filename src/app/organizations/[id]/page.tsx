"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  getOrganization,
  updateOrganization,
  resendOrgInvitation,
  deleteOrganization,
  assignOrgAdmin,
} from "@/lib/api";
import { useUser } from "@/lib/hooks/use-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Store,
  FileCheck,
  Bell,
  ArrowLeft,
  Calendar,
  Loader2,
  AlertTriangle,
  ChevronRight,
  Users,
  Tag,
  KeyRound,
  Trash2,
  Save,
  Building2,
  ShieldCheck,
  CheckCircle2,
  XCircle,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Organization {
  id: string;
  name: string;
  created_at: string;
  logo_url?: string | null;
  sheet_tab_name?: string | null;
  default_admin_email?: string | null;
  default_admin_user_id?: string | null;
  // Migration 034 onboarding metadata
  business_type?: string | null;
  hq_city?: string | null;
  hq_country?: string | null;
  gst_number?: string | null;
  company_registration?: string | null;
  expected_outlets_size?: string | null;
  billing_email?: string | null;
  website?: string | null;
  notes?: string | null;
  onboarded_at?: string | null;
}

interface Brand {
  id: string;
  name: string;
  notes?: string | null;
  logo_url?: string | null;
  created_at?: string;
}

interface Member {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  created_at?: string;
  must_reset_password?: boolean;
}

type DefaultAdmin = Member;

interface Outlet {
  id: string;
  name: string;
  brand_name?: string;
  city?: string;
  state?: string;
  property_type?: string;
  status?: string;
  super_area_sqft?: number;
  franchise_model?: string;
}

interface Agreement {
  id: string;
  type: string;
  status: string;
  document_filename?: string;
  monthly_rent?: number;
  lease_expiry_date?: string;
  outlet_id?: string;
  outlets?: { name?: string; city?: string } | null;
}

interface Alert {
  id: string;
  type: string;
  severity: string;
  title: string;
  trigger_date?: string;
  status?: string;
}

interface OrgDetailResponse {
  organization: Organization;
  brands: Brand[];
  members: Member[];
  default_admin: DefaultAdmin | null;
  outlets: Outlet[];
  agreements: Agreement[];
  alerts: Alert[];
  stats: {
    outlets_count: number;
    agreements_count: number;
    members_count: number;
    brands_count: number;
    alerts_count: number;
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function OrganizationDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useUser();
  const orgId = params.id;

  const [data, setData] = useState<OrgDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit state
  const [editName, setEditName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);

  // Resend invitation state
  const [resendResult, setResendResult] = useState<{
    email: string;
    password: string;
    email_sent: boolean;
  } | null>(null);
  const [resending, setResending] = useState(false);

  // Delete state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteText, setDeleteText] = useState("");

  // Assign admin (for orphaned orgs)
  const [showAssignAdmin, setShowAssignAdmin] = useState(false);
  const [assignName, setAssignName] = useState("");
  const [assignEmail, setAssignEmail] = useState("");
  const [assignPhone, setAssignPhone] = useState("");
  const [assignRoleTitle, setAssignRoleTitle] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  const isSuperAdmin = user?.role === "platform_admin";

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = (await getOrganization(orgId)) as OrgDetailResponse;
      setData(res);
      setEditName(res.organization?.name || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load organization");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    if (orgId) fetchDetail();
  }, [orgId, fetchDetail]);

  async function handleSaveName() {
    if (!editName.trim() || editName === data?.organization?.name) return;
    setSavingName(true);
    setNameSaved(false);
    try {
      await updateOrganization(orgId, { name: editName.trim() });
      setNameSaved(true);
      fetchDetail();
      setTimeout(() => setNameSaved(false), 2500);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update name");
    } finally {
      setSavingName(false);
    }
  }

  async function handleResendInvite() {
    if (!confirm(`Rotate the admin password and send a new invitation email to ${data?.default_admin?.email || "the default admin"}?`)) return;
    setResending(true);
    setResendResult(null);
    try {
      const res = await resendOrgInvitation(orgId);
      setResendResult({
        email: res.admin_email,
        password: res.temp_password,
        email_sent: res.email_sent,
      });
      // Refetch so the admin's must_reset_password badge + any profile
      // state the backend just updated reflects in the UI without a
      // page reload. Otherwise the sidebar/members list shows stale data.
      fetchDetail();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to resend invitation");
    } finally {
      setResending(false);
    }
  }

  async function handleAssignAdmin() {
    setAssignError(null);
    if (!assignName.trim() || !assignEmail.trim()) {
      setAssignError("Name and email are required.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(assignEmail.trim())) {
      setAssignError("Email is not valid.");
      return;
    }
    setAssigning(true);
    try {
      const res = await assignOrgAdmin(orgId, {
        admin_email: assignEmail.trim().toLowerCase(),
        admin_full_name: assignName.trim(),
        admin_phone: assignPhone.trim() || undefined,
        admin_role_title: assignRoleTitle.trim() || undefined,
      });
      setResendResult({
        email: res.admin?.email || assignEmail,
        password: res.admin?.temp_password || "",
        email_sent: !!res.email_sent,
      });
      setShowAssignAdmin(false);
      setAssignName("");
      setAssignEmail("");
      setAssignPhone("");
      setAssignRoleTitle("");
      fetchDetail();
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : "Failed to assign admin");
    } finally {
      setAssigning(false);
    }
  }

  async function handleDeleteOrg() {
    setDeleting(true);
    try {
      await deleteOrganization(orgId);
      router.push("/organizations");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
        <AlertTriangle className="h-10 w-10 text-rose-500" />
        <p className="text-sm text-muted-foreground">{error || "Organization not found"}</p>
        <Link href="/organizations">
          <Button variant="outline">Back to organizations</Button>
        </Link>
      </div>
    );
  }

  const org = data.organization;
  const stats = data.stats;

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Back */}
      <Link href="/organizations" className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Organizations
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4 min-w-0 flex-1">
          <div className="h-14 w-14 rounded-xl bg-foreground text-background flex items-center justify-center shrink-0 font-semibold text-xl">
            {org.name?.[0]?.toUpperCase() || "O"}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-[22px] font-semibold tracking-tight text-foreground truncate">
              {org.name}
            </h1>
            <div className="flex items-center gap-3 mt-1 text-[12px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Created {new Date(org.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
              </span>
              {org.sheet_tab_name && (
                <>
                  <span>·</span>
                  <span className="font-mono text-[11px]">Sheet: {org.sheet_tab_name}</span>
                </>
              )}
            </div>
          </div>
        </div>
        {isSuperAdmin && (
          <Button
            variant="outline"
            size="sm"
            className="text-rose-600 border-rose-200 hover:bg-rose-50 shrink-0"
            onClick={() => setShowDeleteConfirm(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete Organization
          </Button>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard icon={Store} label="Outlets" value={stats.outlets_count} />
        <StatCard icon={FileCheck} label="Agreements" value={stats.agreements_count} />
        <StatCard icon={Users} label="Members" value={stats.members_count} />
        <StatCard icon={Tag} label="Brands" value={stats.brands_count} />
        <StatCard icon={Bell} label="Alerts" value={stats.alerts_count} />
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left — settings */}
        <div className="lg:col-span-2 space-y-6">
          {/* Organization name */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Organization Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2 max-w-md">
                <Label htmlFor="org-name">Organization name</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="org-name"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    disabled={!isSuperAdmin || savingName}
                  />
                  <Button
                    size="sm"
                    onClick={handleSaveName}
                    disabled={!isSuperAdmin || savingName || !editName.trim() || editName === org.name}
                  >
                    {savingName ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  </Button>
                </div>
                {nameSaved && (
                  <p className="text-[11px] text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Saved
                  </p>
                )}
              </div>

              <div className="grid gap-1 max-w-md">
                <Label className="text-[11px] text-muted-foreground">Organization ID</Label>
                <p className="text-[12px] font-mono text-foreground/70 break-all">{org.id}</p>
              </div>

              {org.sheet_tab_name && (
                <div className="grid gap-1 max-w-md">
                  <Label className="text-[11px] text-muted-foreground">Google Sheet activity tab</Label>
                  <p className="text-[12px] font-mono text-foreground/70">{org.sheet_tab_name}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Onboarding metadata (from migration 034) — only render if any field is set */}
          {(org.business_type || org.hq_city || org.gst_number || org.company_registration || org.expected_outlets_size || org.billing_email || org.website || org.notes) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Business Details
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {org.business_type && (
                    <MetaField label="Business type" value={org.business_type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} />
                  )}
                  {org.expected_outlets_size && (
                    <MetaField label="Portfolio size" value={org.expected_outlets_size + " outlets"} />
                  )}
                  {org.hq_city && (
                    <MetaField label="HQ city" value={org.hq_city + (org.hq_country ? `, ${org.hq_country}` : "")} />
                  )}
                  {org.gst_number && <MetaField label="GST" value={org.gst_number} mono />}
                  {org.company_registration && <MetaField label="Company reg / CIN" value={org.company_registration} mono />}
                  {org.billing_email && <MetaField label="Billing email" value={org.billing_email} mono />}
                  {org.website && (
                    <MetaField
                      label="Website"
                      value={org.website}
                      mono
                      link={org.website.startsWith("http") ? org.website : `https://${org.website}`}
                    />
                  )}
                </div>
                {org.notes && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <Label className="text-[11px] text-muted-foreground">Internal notes</Label>
                    <p className="text-[12px] text-foreground/80 mt-1 whitespace-pre-wrap">{org.notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Default Admin */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" />
                Default Admin
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.default_admin ? (
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-semibold text-foreground">{data.default_admin.full_name || data.default_admin.email}</p>
                      <p className="text-[12px] text-muted-foreground font-mono">{data.default_admin.email}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="secondary" className="text-[10px]">
                          {data.default_admin.role.replace("_", " ").toUpperCase()}
                        </Badge>
                        {data.default_admin.must_reset_password && (
                          <Badge className="bg-amber-50 text-amber-700 border border-amber-200 text-[10px]">
                            Must reset password
                          </Badge>
                        )}
                      </div>
                    </div>
                    {isSuperAdmin && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 shrink-0"
                        onClick={handleResendInvite}
                        disabled={resending}
                      >
                        {resending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
                        Resend Invitation
                      </Button>
                    )}
                  </div>

                  {resendResult && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50/30 p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        {resendResult.email_sent ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-amber-600" />
                        )}
                        <p className="text-[12.5px] font-semibold text-emerald-900">
                          {resendResult.email_sent
                            ? `Invitation email sent to ${resendResult.email}`
                            : `Email send FAILED. Hand these credentials to ${resendResult.email} manually.`}
                        </p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="rounded bg-white border border-emerald-200 px-2.5 py-1.5">
                          <p className="text-[9.5px] uppercase tracking-wider text-emerald-700 font-semibold">Email</p>
                          <p className="text-[12px] font-mono break-all">{resendResult.email}</p>
                        </div>
                        <div className="rounded bg-white border border-emerald-200 px-2.5 py-1.5">
                          <p className="text-[9.5px] uppercase tracking-wider text-emerald-700 font-semibold">New temp password</p>
                          <p className="text-[12px] font-mono break-all">{resendResult.password}</p>
                        </div>
                      </div>
                      <p className="text-[10.5px] text-emerald-700">
                        This is shown once. The admin will be forced to change it on next login.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-[12px] text-muted-foreground">
                    No default admin set. Assign one below and they&apos;ll receive an
                    onboarding email with their login credentials.
                  </p>
                  {isSuperAdmin && !showAssignAdmin && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => setShowAssignAdmin(true)}
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                      Assign Admin
                    </Button>
                  )}
                  {showAssignAdmin && (
                    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                      <p className="text-[12px] font-semibold">Assign default admin</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <Label className="text-[11.5px]">Full name *</Label>
                          <Input
                            value={assignName}
                            onChange={(e) => setAssignName(e.target.value)}
                            placeholder="Alice Founder"
                            disabled={assigning}
                          />
                        </div>
                        <div>
                          <Label className="text-[11.5px]">Email *</Label>
                          <Input
                            type="email"
                            value={assignEmail}
                            onChange={(e) => setAssignEmail(e.target.value)}
                            placeholder="alice@example.com"
                            disabled={assigning}
                          />
                        </div>
                        <div>
                          <Label className="text-[11.5px]">Phone</Label>
                          <Input
                            value={assignPhone}
                            onChange={(e) => setAssignPhone(e.target.value)}
                            placeholder="+91 98765 43210"
                            disabled={assigning}
                          />
                        </div>
                        <div>
                          <Label className="text-[11.5px]">Role title</Label>
                          <Input
                            value={assignRoleTitle}
                            onChange={(e) => setAssignRoleTitle(e.target.value)}
                            placeholder="CEO / Head of Real Estate"
                            disabled={assigning}
                          />
                        </div>
                      </div>
                      {assignError && (
                        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[11.5px] text-rose-900">
                          {assignError}
                        </div>
                      )}
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setShowAssignAdmin(false); setAssignError(null); }}
                          disabled={assigning}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleAssignAdmin}
                          disabled={assigning || !assignEmail.trim() || !assignName.trim()}
                        >
                          {assigning ? "Assigning…" : "Create & send invitation"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Members */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" />
                Team Members ({data.members.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.members.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">No team members yet.</p>
              ) : (
                <div className="divide-y divide-border -mx-1">
                  {data.members.map((m) => (
                    <div key={m.id} className="flex items-center justify-between px-1 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium truncate">{m.full_name || m.email.split("@")[0]}</p>
                        <p className="text-[11px] font-mono text-muted-foreground truncate">{m.email}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {m.must_reset_password && (
                          <span title="Hasn't set permanent password yet">
                            <XCircle className="h-3.5 w-3.5 text-amber-500" />
                          </span>
                        )}
                        <Badge variant="secondary" className="text-[10px]">
                          {m.role.replace("_", " ")}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Outlets snapshot */}
          {data.outlets.length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Store className="h-4 w-4" />
                  Outlets ({data.outlets.length})
                </CardTitle>
                <Link href="/outlets" className="text-[12px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                  View all <ChevronRight className="h-3 w-3" />
                </Link>
              </CardHeader>
              <CardContent>
                <div className="divide-y divide-border -mx-1">
                  {data.outlets.slice(0, 8).map((o) => (
                    <Link key={o.id} href={`/outlets/${o.id}`} className="flex items-center justify-between px-1 py-2.5 hover:bg-muted/30 rounded transition-colors group">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium truncate group-hover:underline">{o.name}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {o.city || "—"}{o.brand_name ? ` · ${o.brand_name}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="secondary" className="text-[10px]">{o.status || "—"}</Badge>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Agreements snapshot */}
          {data.agreements.length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileCheck className="h-4 w-4" />
                  Agreements ({data.agreements.length})
                </CardTitle>
                <Link href="/agreements" className="text-[12px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                  View all <ChevronRight className="h-3 w-3" />
                </Link>
              </CardHeader>
              <CardContent>
                <div className="divide-y divide-border -mx-1">
                  {data.agreements.slice(0, 8).map((a) => (
                    <Link key={a.id} href={`/agreements/${a.id}`} className="flex items-center justify-between px-1 py-2.5 hover:bg-muted/30 rounded transition-colors group">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium truncate group-hover:underline">{a.document_filename || "Untitled"}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {a.outlets?.name || "—"} · {a.type || "—"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="secondary" className="text-[10px]">{a.status || "—"}</Badge>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right — sidebar: brands + alerts */}
        <div className="space-y-6">
          {/* Brands */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Tag className="h-4 w-4" />
                Brands ({data.brands.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.brands.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">No brands yet.</p>
              ) : (
                <div className="space-y-2">
                  {data.brands.map((b) => (
                    <div key={b.id} className="rounded-md border border-border px-3 py-2">
                      <p className="text-[13px] font-medium">{b.name}</p>
                      {b.notes && <p className="text-[11px] text-muted-foreground mt-0.5">{b.notes}</p>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Alerts */}
          {data.alerts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Bell className="h-4 w-4" />
                  Recent Alerts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="divide-y divide-border -mx-1">
                  {data.alerts.map((a) => (
                    <div key={a.id} className="px-1 py-2.5">
                      <p className="text-[12.5px] font-medium truncate">{a.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="secondary" className="text-[9.5px]">{a.severity}</Badge>
                        {a.trigger_date && (
                          <span className="text-[10.5px] text-muted-foreground">
                            {new Date(a.trigger_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
                <Trash2 className="h-5 w-5 text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold">Delete organization?</h3>
                <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">
                  This will permanently remove <strong>{org.name}</strong> and cascade-delete
                  every outlet, agreement, event, payment, alert, brand, and document
                  attached to it. Member profiles are kept (orphaned) so the emails can be
                  re-invited later. This <strong>cannot be undone</strong>.
                </p>
              </div>
            </div>

            <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 space-y-1 text-[11.5px]">
              <p className="font-semibold text-rose-900">Will cascade-delete:</p>
              <ul className="text-rose-900/80 space-y-0.5 list-disc list-inside">
                <li>{stats.outlets_count} outlet{stats.outlets_count === 1 ? "" : "s"}</li>
                <li>{stats.agreements_count} agreement{stats.agreements_count === 1 ? "" : "s"}</li>
                <li>{stats.brands_count} brand{stats.brands_count === 1 ? "" : "s"}</li>
                <li>All events, payments, obligations, alerts, documents, drafts</li>
              </ul>
            </div>

            <div>
              <Label htmlFor="confirm-text" className="text-[11.5px]">
                Type <span className="font-mono text-rose-600">DELETE {org.name}</span> to confirm
              </Label>
              <Input
                id="confirm-text"
                value={deleteText}
                onChange={(e) => setDeleteText(e.target.value)}
                placeholder={`DELETE ${org.name}`}
                disabled={deleting}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setShowDeleteConfirm(false); setDeleteText(""); }}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-rose-600 hover:bg-rose-700 text-white"
                disabled={deleting || deleteText !== `DELETE ${org.name}`}
                onClick={handleDeleteOrg}
              >
                {deleting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Deleting…
                  </>
                ) : (
                  "Permanently delete"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function StatCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2.5 mb-1.5">
          <div className="h-7 w-7 rounded-md bg-muted flex items-center justify-center">
            <Icon className="h-3.5 w-3.5 text-foreground" />
          </div>
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
        </div>
        <p className="text-[24px] font-semibold tabular-nums leading-none">{value}</p>
      </CardContent>
    </Card>
  );
}

function MetaField({
  label,
  value,
  mono,
  link,
}: {
  label: string;
  value: string;
  mono?: boolean;
  link?: string;
}) {
  return (
    <div>
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {link ? (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className={`text-[12.5px] block mt-0.5 text-foreground hover:underline ${mono ? "font-mono" : ""}`}
        >
          {value}
        </a>
      ) : (
        <p className={`text-[12.5px] mt-0.5 text-foreground ${mono ? "font-mono" : ""}`}>
          {value}
        </p>
      )}
    </div>
  );
}
