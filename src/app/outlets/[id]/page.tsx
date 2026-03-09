"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getOutlet, updateOutlet, getActivityLog, listShowcases, createShowcase, updateShowcase, uploadOutletDocument, deleteDocument, listOutletContacts, addOutletContact, updateContact, deleteContact } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  Building2,
  MapPin,
  Loader2,
  AlertTriangle,
  FileText,
  Clock,
  ShieldAlert,
  IndianRupee,
  Save,
  History,
  Share2,
  Copy,
  Check,
  ExternalLink,
  Upload,
  Trash2,
  FolderOpen,
  File,
  Download,
  Users,
  Plus,
  Pencil,
  Phone,
  Mail,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Timeline } from "@/components/timeline";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RiskFlag {
  id: string;
  name: string;
  severity: string;
  explanation: string;
  clause_text?: string;
}

interface Agreement {
  id: string;
  type: string;
  status: string;
  monthly_rent: number;
  cam_monthly?: number;
  security_deposit?: number;
  total_monthly_outflow?: number;
  lease_commencement_date?: string;
  rent_commencement_date?: string;
  lease_expiry_date: string;
  lock_in_end_date?: string;
  escalation_pct?: number;
  escalation_frequency_years?: number;
  lessor_name?: string;
  lessee_name?: string;
  extraction_status?: string;
  document_filename?: string;
  risk_flags: RiskFlag[];
}

interface Obligation {
  id: string;
  type: string;
  amount: number;
  frequency?: string;
  due_date?: string;
  status?: string;
  agreement_id?: string;
}

interface AlertItem {
  id: string;
  type: string;
  title: string;
  message?: string;
  severity?: string;
  status?: string;
  trigger_date: string;
}

interface OutletDetail {
  id: string;
  name: string;
  brand_name: string;
  address: string;
  city: string;
  state: string;
  site_code: string | null;
  locality: string | null;
  property_type: string;
  floor: string;
  unit_number: string;
  super_area_sqft: number;
  covered_area_sqft: number;
  franchise_model: string;
  status: string;
  monthly_net_revenue: number | null;
  revenue_updated_at: string | null;
}

interface OutletDocument {
  id: string;
  filename: string;
  file_url: string;
  file_type: string;
  file_size_bytes: number;
  uploaded_at: string;
}

interface OutletContact {
  id: string;
  name: string;
  designation: string;
  phone: string;
  email: string;
  notes: string;
}

const DESIGNATIONS = [
  "Lessor",
  "Property Manager",
  "Legal Counsel",
  "Maintenance",
  "Broker",
  "Tenant Rep",
  "Other",
];

interface OutletResponse {
  outlet: OutletDetail;
  agreements: Agreement[];
  obligations: Obligation[];
  alerts: AlertItem[];
  documents?: OutletDocument[];
}

const DOCUMENT_CATEGORIES = [
  { value: "loi", label: "Letter of Intent (LOI)" },
  { value: "agreement", label: "Lease / License Agreement" },
  { value: "kyc", label: "KYC Documents" },
  { value: "property_tax", label: "Property Tax Receipt" },
  { value: "electricity", label: "Electricity Bill" },
  { value: "sale_deed", label: "Sale Deed" },
  { value: "layout_plan", label: "Layout Plan / Floor Plan" },
  { value: "license", label: "License / Certificate" },
  { value: "noc", label: "NOC / Approval" },
  { value: "other", label: "Other" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function propertyTypeLabel(pt: string): string {
  if (!pt) return "Unknown";
  const map: Record<string, string> = {
    mall: "Mall",
    high_street: "High Street",
    cloud_kitchen: "Cloud Kitchen",
    metro: "Metro",
    transit: "Transit",
    cyber_park: "Cyber Park",
    hospital: "Hospital",
    college: "College",
  };
  return map[pt] || pt.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function agreementTypeLabel(t: string): string {
  if (!t) return "Unknown";
  const map: Record<string, string> = {
    lease_loi: "Lease / LOI",
    license_certificate: "License Certificate",
    franchise_agreement: "Franchise Agreement",
  };
  return map[t] || t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function obligationTypeLabel(t: string): string {
  if (!t) return "Unknown";
  const map: Record<string, string> = {
    rent: "Rent",
    cam: "CAM",
    hvac: "HVAC",
    electricity: "Electricity",
    security_deposit: "Security Deposit",
    cam_deposit: "CAM Deposit",
    license_renewal: "License Renewal",
  };
  return map[t] || t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusLabel(status: string): string {
  if (!status) return "Unknown";
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusColor(status: string): string {
  if (!status) return "bg-neutral-100 text-neutral-600";
  const map: Record<string, string> = {
    active: "bg-emerald-50 text-emerald-700",
    operational: "bg-emerald-50 text-emerald-700",
    fit_out: "bg-blue-50 text-blue-700",
    expiring: "bg-amber-50 text-amber-700",
    expired: "bg-red-50 text-red-700",
    closed: "bg-neutral-100 text-neutral-500",
    draft: "bg-neutral-100 text-neutral-600",
    high: "bg-red-50 text-red-700 border-red-200",
    medium: "bg-amber-50 text-amber-700 border-amber-200",
    low: "bg-blue-50 text-blue-700 border-blue-200",
    pending: "bg-amber-50 text-amber-700",
    paid: "bg-emerald-50 text-emerald-700",
    overdue: "bg-red-50 text-red-700",
    upcoming: "bg-blue-50 text-blue-700",
    triggered: "bg-amber-50 text-amber-700",
    resolved: "bg-emerald-50 text-emerald-700",
  };
  return map[status] || "bg-neutral-100 text-neutral-600";
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "--";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function OutletDetailPage() {
  const params = useParams();
  const outletId = params.id as string;

  const [data, setData] = useState<OutletResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revenueInput, setRevenueInput] = useState<string>("");
  const [revenueSaving, setRevenueSaving] = useState(false);
  const [activityItems, setActivityItems] = useState<
    { id: string; action: string; details: Record<string, unknown>; created_at: string; user_name: string }[]
  >([]);
  const [activityLoading, setActivityLoading] = useState(true);

  // Showcase state
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showcases, setShowcases] = useState<
    { id: string; token: string; title: string; is_active: boolean; include_financials: boolean; expires_at: string | null }[]
  >([]);
  const [showcaseLoading, setShowcaseLoading] = useState(false);
  const [creatingShowcase, setCreatingShowcase] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [docUploading, setDocUploading] = useState(false);
  const [docCategory, setDocCategory] = useState("other");

  // Contacts state
  const [contacts, setContacts] = useState<OutletContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);
  const [editingContact, setEditingContact] = useState<OutletContact | null>(null);
  const [contactForm, setContactForm] = useState({ name: "", designation: "", phone: "", email: "", notes: "" });
  const [contactSaving, setContactSaving] = useState(false);

  const fetchContacts = useCallback(async () => {
    if (!outletId) return;
    try {
      setContactsLoading(true);
      const res = await listOutletContacts(outletId);
      setContacts(res.contacts || []);
    } catch {
      // silently handle — table may not exist yet
    } finally {
      setContactsLoading(false);
    }
  }, [outletId]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  const handleContactSubmit = async () => {
    if (!contactForm.name.trim()) return;
    setContactSaving(true);
    try {
      if (editingContact) {
        await updateContact(editingContact.id, contactForm);
      } else {
        await addOutletContact(outletId, contactForm);
      }
      await fetchContacts();
      setShowContactForm(false);
      setEditingContact(null);
      setContactForm({ name: "", designation: "", phone: "", email: "", notes: "" });
    } catch {
      // handle error
    } finally {
      setContactSaving(false);
    }
  };

  const handleDeleteContact = async (id: string) => {
    if (!confirm("Delete this contact?")) return;
    try {
      await deleteContact(id);
      setContacts((prev) => prev.filter((c) => c.id !== id));
    } catch {
      // handle error
    }
  };

  const openEditContact = (contact: OutletContact) => {
    setEditingContact(contact);
    setContactForm({
      name: contact.name || "",
      designation: contact.designation || "",
      phone: contact.phone || "",
      email: contact.email || "",
      notes: contact.notes || "",
    });
    setShowContactForm(true);
  };

  const openAddContact = () => {
    setEditingContact(null);
    setContactForm({ name: "", designation: "", phone: "", email: "", notes: "" });
    setShowContactForm(true);
  };

  useEffect(() => {
    async function fetchOutlet() {
      try {
        setLoading(true);
        setError(null);
        const response = await getOutlet(outletId);
        setData(response);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load outlet");
      } finally {
        setLoading(false);
      }
    }
    if (outletId) {
      fetchOutlet();
    }
  }, [outletId]);

  // Initialize revenue input when data loads
  useEffect(() => {
    if (data?.outlet?.monthly_net_revenue != null) {
      setRevenueInput(String(data.outlet.monthly_net_revenue));
    }
  }, [data]);

  // Fetch activity log
  useEffect(() => {
    if (!outletId) return;
    setActivityLoading(true);
    getActivityLog("outlet", outletId, 30)
      .then((res) => setActivityItems(res.items || []))
      .catch(() => {})
      .finally(() => setActivityLoading(false));
  }, [outletId]);

  async function handleSaveRevenue() {
    const value = parseFloat(revenueInput);
    if (isNaN(value) || value < 0) return;
    setRevenueSaving(true);
    try {
      await updateOutlet(outletId, { monthly_net_revenue: value });
      setData((prev) => prev ? {
        ...prev,
        outlet: { ...prev.outlet, monthly_net_revenue: value, revenue_updated_at: new Date().toISOString() },
      } : prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save revenue");
    } finally {
      setRevenueSaving(false);
    }
  }

  // Showcase handlers
  async function fetchShowcases() {
    setShowcaseLoading(true);
    try {
      const res = await listShowcases(outletId);
      setShowcases(res.showcases || []);
    } catch {
      // ignore
    } finally {
      setShowcaseLoading(false);
    }
  }

  async function handleCreateShowcase() {
    setCreatingShowcase(true);
    try {
      await createShowcase({ outlet_id: outletId });
      await fetchShowcases();
    } catch {
      // ignore
    } finally {
      setCreatingShowcase(false);
    }
  }

  async function handleToggleShowcase(id: string, isActive: boolean) {
    try {
      await updateShowcase(id, { is_active: !isActive });
      setShowcases((prev) => prev.map((s) => (s.id === id ? { ...s, is_active: !isActive } : s)));
    } catch {
      // ignore
    }
  }

  async function handleToggleFinancials(id: string, current: boolean) {
    try {
      await updateShowcase(id, { include_financials: !current });
      setShowcases((prev) => prev.map((s) => (s.id === id ? { ...s, include_financials: !current } : s)));
    } catch {
      // ignore
    }
  }

  function copyShowcaseLink(token: string) {
    const url = `${window.location.origin}/showcase/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  }

  function openShareDialog() {
    setShowShareDialog(true);
    fetchShowcases();
  }

  // ---------------------------------------------------------------------------
  // Loading State
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
          <p className="text-sm text-neutral-500">Loading outlet details...</p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Error State
  // ---------------------------------------------------------------------------
  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <AlertTriangle className="h-10 w-10 text-red-400" />
        <h1 className="text-xl font-semibold text-neutral-800">
          {error || "Outlet not found"}
        </h1>
        <p className="text-sm text-neutral-500">
          Could not load details for outlet &quot;{outletId}&quot;.
        </p>
        <Link href="/outlets">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Outlets
          </Button>
        </Link>
      </div>
    );
  }

  const { outlet, agreements, obligations, alerts } = data;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* ----------------------------------------------------------------- */}
      {/* HEADER                                                            */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <Link
            href="/outlets"
            className="mt-1.5 p-1.5 rounded-md hover:bg-neutral-100 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">{outlet.name}</h1>
              {outlet.site_code && (
                <span className="font-mono text-xs bg-neutral-100 text-neutral-500 px-2 py-1 rounded border border-neutral-200">
                  {outlet.site_code}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1 text-sm text-neutral-500">
              <Building2 className="h-3.5 w-3.5" />
              <span>{outlet.brand_name}</span>
              <span className="text-neutral-300">|</span>
              <MapPin className="h-3.5 w-3.5" />
              <span>
                {outlet.address}, {outlet.city}, {outlet.state}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge variant="outline" className={statusColor(outlet.status)}>
                {statusLabel(outlet.status)}
              </Badge>
              <Badge variant="outline" className="border-neutral-200 text-neutral-700">
                {propertyTypeLabel(outlet.property_type)}
              </Badge>
              {outlet.floor && (
                <Badge variant="outline" className="border-neutral-200 text-neutral-700">
                  {outlet.floor}
                </Badge>
              )}
              {outlet.unit_number && (
                <Badge variant="outline" className="border-neutral-200 text-neutral-700">
                  Unit {outlet.unit_number}
                </Badge>
              )}
              <Badge variant="outline" className="border-neutral-200 text-neutral-700">
                {outlet.franchise_model}
              </Badge>
            </div>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={openShareDialog}>
          <Share2 className="h-3.5 w-3.5" />
          Share
        </Button>
      </div>

      {/* Share Dialog */}
      <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Share Outlet</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-neutral-500">
              Create shareable links for this property. Anyone with the link can view outlet details.
            </p>

            {showcaseLoading ? (
              <div className="flex items-center gap-2 text-neutral-400 py-4 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Loading...</span>
              </div>
            ) : (
              <>
                {showcases.map((sc) => (
                  <div key={sc.id} className="border border-neutral-200 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium truncate">{sc.title || "Showcase Link"}</span>
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`active-${sc.id}`} className="text-xs text-neutral-500">Active</Label>
                        <Switch
                          id={`active-${sc.id}`}
                          checked={sc.is_active}
                          onCheckedChange={() => handleToggleShowcase(sc.id, sc.is_active)}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`fin-${sc.id}`} className="text-xs text-neutral-500">Include financials</Label>
                      <Switch
                        id={`fin-${sc.id}`}
                        checked={sc.include_financials}
                        onCheckedChange={() => handleToggleFinancials(sc.id, sc.include_financials)}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs flex-1"
                        onClick={() => copyShowcaseLink(sc.token)}
                      >
                        {copiedToken === sc.token ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                        {copiedToken === sc.token ? "Copied!" : "Copy Link"}
                      </Button>
                      <a
                        href={`/showcase/${sc.token}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                          <ExternalLink className="h-3 w-3" />
                          Preview
                        </Button>
                      </a>
                    </div>
                  </div>
                ))}

                <Button
                  onClick={handleCreateShowcase}
                  disabled={creatingShowcase}
                  className="w-full gap-1.5"
                  variant={showcases.length > 0 ? "outline" : "default"}
                >
                  {creatingShowcase ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Share2 className="h-3.5 w-3.5" />
                  )}
                  {creatingShowcase ? "Creating..." : "Create New Share Link"}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ----------------------------------------------------------------- */}
      {/* OUTLET DETAILS CARD                                               */}
      {/* ----------------------------------------------------------------- */}
      <Card className="border-neutral-200">
        <CardHeader>
          <CardTitle className="text-base">Outlet Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-neutral-500 text-xs">Name</span>
              <div className="font-medium">{outlet.name}</div>
            </div>
            <div>
              <span className="text-neutral-500 text-xs">Brand</span>
              <div className="font-medium">{outlet.brand_name}</div>
            </div>
            <div>
              <span className="text-neutral-500 text-xs">Site Code</span>
              <div className="font-medium font-mono">{outlet.site_code || "--"}</div>
            </div>
            <div>
              <span className="text-neutral-500 text-xs">Locality</span>
              <div className="font-medium">{outlet.locality || "--"}</div>
            </div>
            <div>
              <span className="text-neutral-500 text-xs">Full Address</span>
              <div className="font-medium">
                {outlet.address}, {outlet.city}, {outlet.state}
              </div>
            </div>
            <div>
              <span className="text-neutral-500 text-xs">Property Type</span>
              <div className="font-medium">{propertyTypeLabel(outlet.property_type)}</div>
            </div>
            <div>
              <span className="text-neutral-500 text-xs">Floor</span>
              <div className="font-medium">{outlet.floor || "--"}</div>
            </div>
            <div>
              <span className="text-neutral-500 text-xs">Unit Number</span>
              <div className="font-medium">{outlet.unit_number || "--"}</div>
            </div>
            <div>
              <span className="text-neutral-500 text-xs">Super Area</span>
              <div className="font-medium">
                {outlet.super_area_sqft
                  ? `${outlet.super_area_sqft.toLocaleString("en-IN")} sqft`
                  : "--"}
              </div>
            </div>
            <div>
              <span className="text-neutral-500 text-xs">Covered Area</span>
              <div className="font-medium">
                {outlet.covered_area_sqft
                  ? `${outlet.covered_area_sqft.toLocaleString("en-IN")} sqft`
                  : "--"}
              </div>
            </div>
            <div>
              <span className="text-neutral-500 text-xs">Franchise Model</span>
              <div className="font-medium">{outlet.franchise_model}</div>
            </div>
            <div>
              <span className="text-neutral-500 text-xs">Status</span>
              <div className="mt-0.5">
                <Badge variant="outline" className={statusColor(outlet.status)}>
                  {statusLabel(outlet.status)}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ----------------------------------------------------------------- */}
      {/* REVENUE INPUT                                                     */}
      {/* ----------------------------------------------------------------- */}
      <Card className="border-neutral-200">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <IndianRupee className="h-4 w-4" />
            Monthly Net Revenue
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <div className="flex-1 max-w-xs">
              <label className="text-xs text-neutral-500 mb-1 block">Revenue (INR)</label>
              <Input
                type="number"
                min="0"
                step="1000"
                placeholder="e.g. 500000"
                value={revenueInput}
                onChange={(e) => setRevenueInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSaveRevenue(); }}
              />
            </div>
            <Button
              onClick={handleSaveRevenue}
              disabled={revenueSaving || !revenueInput}
              size="sm"
              className="gap-1.5"
            >
              {revenueSaving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Save
            </Button>
          </div>
          {outlet.monthly_net_revenue != null && outlet.monthly_net_revenue > 0 && (
            <div className="mt-3 text-sm text-neutral-600">
              Current: <span className="font-semibold">{formatCurrency(outlet.monthly_net_revenue)}</span>
              {outlet.revenue_updated_at && (
                <span className="text-xs text-neutral-400 ml-2">
                  Updated {formatDate(outlet.revenue_updated_at)}
                </span>
              )}
              {(() => {
                const primaryRent = agreements?.[0]?.monthly_rent;
                if (primaryRent && primaryRent > 0 && outlet.monthly_net_revenue > 0) {
                  const ratio = ((primaryRent / outlet.monthly_net_revenue) * 100).toFixed(1);
                  return (
                    <span className="ml-3 text-xs">
                      Rent-to-Revenue: <span className={`font-semibold ${Number(ratio) >= 18 ? "text-red-600" : Number(ratio) >= 12 ? "text-amber-600" : "text-emerald-600"}`}>{ratio}%</span>
                    </span>
                  );
                }
                return null;
              })()}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ----------------------------------------------------------------- */}
      {/* AGREEMENTS TABLE                                                  */}
      {/* ----------------------------------------------------------------- */}
      <Card className="border-neutral-200">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Linked Agreements
            {agreements.length > 0 && (
              <Badge variant="secondary" className="ml-2 bg-neutral-100 text-neutral-600">
                {agreements.length}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {agreements.length === 0 ? (
            <div className="text-sm text-neutral-500 py-4 text-center">
              No agreements linked to this outlet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-neutral-50 hover:bg-neutral-50">
                    <TableHead className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                      Type
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                      Status
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-neutral-500 uppercase tracking-wide text-right">
                      Monthly Rent
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                      Lease Expiry
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-neutral-500 uppercase tracking-wide text-center">
                      Risk Flags
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                      Lessor
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-neutral-500 uppercase tracking-wide text-right">
                      Security Deposit
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-neutral-500 uppercase tracking-wide" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agreements.map((agr) => (
                    <TableRow key={agr.id} className="hover:bg-neutral-50 transition-colors">
                      <TableCell className="text-sm font-medium">
                        {agreementTypeLabel(agr.type)}
                      </TableCell>
                      <TableCell>
                        <Badge className={`${statusColor(agr.status)} border-0 text-xs font-medium`}>
                          {statusLabel(agr.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm font-medium text-right">
                        {agr.monthly_rent > 0 ? formatCurrency(agr.monthly_rent) : "--"}
                      </TableCell>
                      <TableCell className="text-sm text-neutral-600">
                        {formatDate(agr.lease_expiry_date)}
                      </TableCell>
                      <TableCell className="text-center">
                        {agr.risk_flags && agr.risk_flags.length > 0 ? (
                          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-xs">
                            {agr.risk_flags.length}
                          </Badge>
                        ) : (
                          <span className="text-sm text-neutral-400">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-neutral-600">
                        {agr.lessor_name || "--"}
                      </TableCell>
                      <TableCell className="text-sm font-medium text-right">
                        {agr.security_deposit && agr.security_deposit > 0
                          ? formatCurrency(agr.security_deposit)
                          : "--"}
                      </TableCell>
                      <TableCell>
                        <Link href={`/agreements/${agr.id}`}>
                          <Button variant="outline" size="sm" className="text-xs">
                            View
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ----------------------------------------------------------------- */}
      {/* OBLIGATIONS TABLE                                                 */}
      {/* ----------------------------------------------------------------- */}
      <Card className="border-neutral-200">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Obligations
            {obligations.length > 0 && (
              <Badge variant="secondary" className="ml-2 bg-neutral-100 text-neutral-600">
                {obligations.length}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {obligations.length === 0 ? (
            <div className="text-sm text-neutral-500 py-4 text-center">
              No obligations recorded for this outlet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-neutral-50 hover:bg-neutral-50">
                    <TableHead className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                      Type
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-neutral-500 uppercase tracking-wide text-right">
                      Amount
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                      Frequency
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                      Due Date
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                      Status
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {obligations.map((obl) => (
                    <TableRow key={obl.id} className="hover:bg-neutral-50 transition-colors">
                      <TableCell className="text-sm font-medium">
                        {obligationTypeLabel(obl.type)}
                      </TableCell>
                      <TableCell className="text-sm font-semibold text-right">
                        {obl.amount > 0 ? formatCurrency(obl.amount) : "--"}
                      </TableCell>
                      <TableCell className="text-sm text-neutral-600">
                        {obl.frequency
                          ? obl.frequency.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
                          : "--"}
                      </TableCell>
                      <TableCell className="text-sm text-neutral-600">
                        {obl.due_date ? formatDate(obl.due_date) : "--"}
                      </TableCell>
                      <TableCell>
                        {obl.status ? (
                          <Badge className={`${statusColor(obl.status)} border-0 text-xs font-medium`}>
                            {statusLabel(obl.status)}
                          </Badge>
                        ) : (
                          <span className="text-sm text-neutral-400">--</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ----------------------------------------------------------------- */}
      {/* ALERTS LIST                                                       */}
      {/* ----------------------------------------------------------------- */}
      <Card className="border-neutral-200">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" />
            Alerts
            {alerts.length > 0 && (
              <Badge variant="secondary" className="ml-2 bg-neutral-100 text-neutral-600">
                {alerts.length}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 ? (
            <div className="text-sm text-neutral-500 py-4 text-center">
              No alerts for this outlet.
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-start gap-3 p-3 rounded-lg bg-neutral-50 border border-neutral-100"
                >
                  <div
                    className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${
                      alert.severity === "high"
                        ? "bg-red-500"
                        : alert.severity === "medium"
                        ? "bg-amber-500"
                        : alert.severity === "low"
                        ? "bg-blue-500"
                        : "bg-neutral-400"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold">{alert.title}</span>
                      <Badge variant="outline" className="text-xs">
                        {(alert.type || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                      </Badge>
                      {alert.severity && (
                        <Badge variant="outline" className={`text-xs ${statusColor(alert.severity)}`}>
                          {statusLabel(alert.severity)}
                        </Badge>
                      )}
                      {alert.status && (
                        <Badge variant="outline" className={`text-xs ${statusColor(alert.status)}`}>
                          {statusLabel(alert.status)}
                        </Badge>
                      )}
                    </div>
                    {alert.message && (
                      <p className="text-sm text-neutral-600 mt-1">{alert.message}</p>
                    )}
                    <p className="text-xs text-neutral-400 mt-1">
                      Trigger: {formatDate(alert.trigger_date)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ----------------------------------------------------------------- */}
      {/* DOCUMENT STORAGE (Drive-like multi-doc)                           */}
      {/* ----------------------------------------------------------------- */}
      <Card className="border-neutral-200">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FolderOpen className="h-4 w-4" />
              Document Storage
              <Badge variant="secondary" className="text-[10px]">
                {(data.documents || []).length}
              </Badge>
            </CardTitle>
            <div className="flex items-center gap-2">
              <Select value={docCategory} onValueChange={setDocCategory}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <label className="cursor-pointer">
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setDocUploading(true);
                    try {
                      const res = await uploadOutletDocument(outlet.id, file, docCategory);
                      setData((prev) =>
                        prev
                          ? {
                              ...prev,
                              documents: [res.document, ...(prev.documents || [])],
                            }
                          : prev
                      );
                    } catch {
                      // handle silently
                    } finally {
                      setDocUploading(false);
                      e.target.value = "";
                    }
                  }}
                  disabled={docUploading}
                />
                <Button size="sm" variant="outline" className="gap-1.5" asChild>
                  <span>
                    {docUploading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5" />
                    )}
                    Upload
                  </span>
                </Button>
              </label>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {(data.documents || []).length === 0 ? (
            <div className="text-center py-8 text-neutral-400">
              <File className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No documents uploaded yet</p>
              <p className="text-xs mt-1">Upload lease agreements, bills, licenses, and more</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(data.documents || []).map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-3 p-2.5 rounded-lg border border-neutral-100 hover:bg-neutral-50 transition-colors group"
                >
                  <div className="h-8 w-8 rounded bg-neutral-100 flex items-center justify-center flex-shrink-0">
                    <FileText className="h-4 w-4 text-neutral-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">
                        {doc.filename || "Untitled"}
                      </p>
                      {doc.file_type && (
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          {DOCUMENT_CATEGORIES.find((c) => c.value === doc.file_type)?.label ||
                            doc.file_type.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-neutral-400">
                      <span>
                        {doc.file_size_bytes
                          ? `${(doc.file_size_bytes / 1024).toFixed(0)} KB`
                          : "—"}
                      </span>
                      <span>·</span>
                      <span>
                        {doc.uploaded_at
                          ? new Date(doc.uploaded_at).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })
                          : "—"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {doc.file_url && !doc.file_url.startsWith("storage://") && (
                      <a
                        href={doc.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded hover:bg-neutral-200 transition-colors"
                        title="Download"
                      >
                        <Download className="h-3.5 w-3.5 text-neutral-500" />
                      </a>
                    )}
                    <button
                      onClick={async () => {
                        if (!confirm("Delete this document?")) return;
                        try {
                          await deleteDocument(doc.id);
                          setData((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  documents: (prev.documents || []).filter(
                                    (d) => d.id !== doc.id
                                  ),
                                }
                              : prev
                          );
                        } catch {
                          // handle silently
                        }
                      }}
                      className="p-1.5 rounded hover:bg-red-100 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-neutral-400 hover:text-red-500" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ----------------------------------------------------------------- */}
      {/* CONTACTS                                                          */}
      {/* ----------------------------------------------------------------- */}
      <Card className="border-neutral-200">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Contacts
          </CardTitle>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={openAddContact}>
            <Plus className="h-3.5 w-3.5" />
            Add Contact
          </Button>
        </CardHeader>
        <CardContent>
          {contactsLoading ? (
            <div className="flex items-center gap-2 text-neutral-400 py-4 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading contacts...</span>
            </div>
          ) : contacts.length === 0 ? (
            <div className="text-center py-8 text-neutral-400">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No contacts added yet</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Designation</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="w-[80px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((contact) => (
                  <TableRow key={contact.id}>
                    <TableCell className="font-medium">{contact.name}</TableCell>
                    <TableCell>
                      {contact.designation ? (
                        <Badge variant="secondary" className="text-xs">{contact.designation}</Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      {contact.phone ? (
                        <span className="flex items-center gap-1 text-sm">
                          <Phone className="h-3 w-3 text-neutral-400" />
                          {contact.phone}
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      {contact.email ? (
                        <span className="flex items-center gap-1 text-sm">
                          <Mail className="h-3 w-3 text-neutral-400" />
                          {contact.email}
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEditContact(contact)}
                          className="p-1.5 rounded hover:bg-neutral-100 transition-colors"
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5 text-neutral-400" />
                        </button>
                        <button
                          onClick={() => handleDeleteContact(contact.id)}
                          className="p-1.5 rounded hover:bg-red-100 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-neutral-400 hover:text-red-500" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Contact Form Dialog */}
      <Dialog open={showContactForm} onOpenChange={setShowContactForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingContact ? "Edit Contact" : "Add Contact"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input
                value={contactForm.name}
                onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                placeholder="Contact name"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Designation</Label>
              <Select
                value={contactForm.designation}
                onValueChange={(v) => setContactForm({ ...contactForm, designation: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select designation" />
                </SelectTrigger>
                <SelectContent>
                  {DESIGNATIONS.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input
                  value={contactForm.phone}
                  onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                  placeholder="+91 ..."
                />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input
                  value={contactForm.email}
                  onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                  placeholder="email@example.com"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input
                value={contactForm.notes}
                onChange={(e) => setContactForm({ ...contactForm, notes: e.target.value })}
                placeholder="Optional notes"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowContactForm(false)}>Cancel</Button>
              <Button onClick={handleContactSubmit} disabled={!contactForm.name.trim() || contactSaving}>
                {contactSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {editingContact ? "Save Changes" : "Add Contact"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ----------------------------------------------------------------- */}
      {/* ACTIVITY TIMELINE (hidden)                                        */}
      {/* ----------------------------------------------------------------- */}
      {false && (
      <Card className="border-neutral-200">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4" />
            Activity Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activityLoading ? (
            <div className="flex items-center gap-2 text-neutral-400 py-4 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading activity...</span>
            </div>
          ) : (
            <Timeline items={activityItems} />
          )}
        </CardContent>
      </Card>
      )}
    </div>
  );
}
