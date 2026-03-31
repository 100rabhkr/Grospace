"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getOutlet, updateOutlet, getActivityLog, listShowcases, createShowcase, updateShowcase, uploadOutletDocument, deleteDocument, listOutletContacts, addOutletContact, updateContact, deleteContact, uploadRevenueCSV } from "@/lib/api";
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
  TrendingUp,
  ArrowUpDown,
  Camera,
  Store,
  FileUp,
  Eye,
  CheckCircle2,
  AlertCircle,
  Info,
  Percent,
  ChevronRight,
  CalendarClock,
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
import { useUser } from "@/lib/hooks/use-user";
import {
  TooltipProvider,
} from "@/components/ui/tooltip";

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
  rent_model?: string;
  revenue_share_pct?: number;
  rent_per_sqft?: number;
  extracted_data?: Record<string, Record<string, unknown>> | null;
  custom_notes?: string | null;
  custom_clauses?: { name: string; value: string }[] | null;
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
  profile_photo_url?: string | null;
}

interface OutletDocument {
  id: string;
  filename: string;
  file_url: string;
  file_type: string;
  file_size_bytes: number;
  uploaded_at: string;
  category?: string;
  name?: string;
  url?: string;
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
  criticalDates?: Record<string, unknown>[];
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
  if (!status) return "bg-muted text-muted-foreground";
  const map: Record<string, string> = {
    active: "bg-emerald-50 text-emerald-700",
    operational: "bg-emerald-50 text-emerald-700",
    fit_out: "bg-amber-50 text-amber-700",
    expiring: "bg-amber-50 text-amber-700",
    expired: "bg-rose-50 text-rose-700",
    closed: "bg-muted text-muted-foreground",
    draft: "bg-muted text-muted-foreground",
    high: "bg-rose-50 text-rose-700 border-rose-200",
    medium: "bg-amber-50 text-amber-700 border-amber-200",
    low: "bg-muted text-foreground border-border",
    pending: "bg-amber-50 text-amber-700",
    paid: "bg-emerald-50 text-emerald-700",
    overdue: "bg-rose-50 text-rose-700",
    upcoming: "bg-blue-50 text-blue-600",
    triggered: "bg-amber-50 text-amber-700",
    resolved: "bg-emerald-50 text-emerald-700",
  };
  return map[status] || "bg-muted text-muted-foreground";
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
  const router = useRouter();
  const { user } = useUser();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [data, setData] = useState<OutletResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [revenueInput, setRevenueInput] = useState<string>("");
  const [revenueSaving, setRevenueSaving] = useState(false);
  const [revenueFrequency, setRevenueFrequency] = useState<string>("monthly");

  // CSV Upload state
  const [showCsvDialog, setShowCsvDialog] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<string[][]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvResult, setCsvResult] = useState<{ imported: number; skipped: number; errors: { row: number; error: string }[] } | null>(null);
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
  const [docCategory, setDocCategory] = useState("");

  // Contacts state
  const [contacts, setContacts] = useState<OutletContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);
  const [editingContact, setEditingContact] = useState<OutletContact | null>(null);
  const [contactForm, setContactForm] = useState({ name: "", designation: "", phone: "", email: "", notes: "" });
  const [contactSaving, setContactSaving] = useState(false);

  const [showGstBreakdown, setShowGstBreakdown] = useState(false);

  // Reminder creation state
  const [showCreateReminder, setShowCreateReminder] = useState(false);
  const [showCreateEvent, setShowCreateEvent] = useState(false);
  const [eventForm, setEventForm] = useState({ title: "", event_type: "custom", date_value: "", priority: "medium", description: "" });
  const [eventSaving, setEventSaving] = useState(false);
  const [reminderForm, setReminderForm] = useState({ title: "", message: "", trigger_date: "", severity: "medium" });
  const [reminderSaving, setReminderSaving] = useState(false);

  // Rent editing state
  const [rentEditing, setRentEditing] = useState(false);
  const [rentOverride, setRentOverride] = useState({ monthly_rent: "", revenue_share_pct: "", escalation_pct: "", escalation_frequency_years: "" });
  const [rentSaving, setRentSaving] = useState(false);

  // Edit outlet state
  const [showEditOutlet, setShowEditOutlet] = useState(false);
  const [editOutletData, setEditOutletData] = useState({ name: "", city: "", address: "", property_type: "", floor: "", unit_number: "" });

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
  }, [outletId, refreshKey]);

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

  // Populate edit outlet form when outlet loads
  useEffect(() => {
    if (data?.outlet) {
      setEditOutletData({
        name: data.outlet.name || "",
        city: data.outlet.city || "",
        address: data.outlet.address || "",
        property_type: data.outlet.property_type || "",
        floor: data.outlet.floor || "",
        unit_number: data.outlet.unit_number || "",
      });
    }
  }, [data?.outlet]);

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

  // CSV file selection handler
  function handleCsvFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFile(file);
    setCsvResult(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
      if (lines.length === 0) return;

      const headers = lines[0].split(",").map((h) => h.trim());
      setCsvHeaders(headers);

      const rows = lines.slice(1, 11).map((line) => line.split(",").map((cell) => cell.trim()));
      setCsvPreview(rows);
    };
    reader.readAsText(file);
  }

  // CSV upload handler
  async function handleCsvUpload() {
    if (!csvFile) return;
    setCsvUploading(true);
    setCsvResult(null);
    try {
      const result = await uploadRevenueCSV(csvFile);
      setCsvResult(result);
    } catch (err) {
      setCsvResult({ imported: 0, skipped: 0, errors: [{ row: 0, error: err instanceof Error ? err.message : "Upload failed" }] });
    } finally {
      setCsvUploading(false);
    }
  }

  function resetCsvDialog() {
    setCsvFile(null);
    setCsvPreview([]);
    setCsvHeaders([]);
    setCsvResult(null);
    setShowCsvDialog(false);
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
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading outlet details...</p>
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
        <AlertTriangle className="h-10 w-10 text-rose-500" />
        <h1 className="text-xl font-semibold text-foreground">
          {error || "Outlet not found"}
        </h1>
        <p className="text-sm text-muted-foreground">
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

  async function handleDeleteOutlet() {
    setDeleting(true);
    try {
      const { deleteOutlet } = await import("@/lib/api");
      await deleteOutlet(outletId);
      router.push("/outlets");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete outlet");
    } finally {
      setDeleting(false);
      setShowDeleteDialog(false);
    }
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
            className="mt-1.5 p-1.5 rounded-md hover:bg-muted transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          {/* Profile Photo */}
          <label className="cursor-pointer group relative flex-shrink-0">
            <input
              type="file"
              className="hidden"
              accept="image/*"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const { uploadOutletProfilePhoto } = await import("@/lib/api");
                  const res = await uploadOutletProfilePhoto(outletId, file);
                  setData((prev) => prev ? { ...prev, outlet: { ...prev.outlet, profile_photo_url: res.url } } : prev);
                } catch (err) {
                  alert(err instanceof Error ? err.message : "Failed to upload photo");
                }
                e.target.value = "";
              }}
            />
            <div className="h-16 w-16 rounded-xl bg-muted border-2 border-border overflow-hidden flex items-center justify-center group-hover:border-foreground/30 transition-colors">
              {outlet.profile_photo_url ? (
                <img src={outlet.profile_photo_url} alt={outlet.name} className="h-full w-full object-cover" />
              ) : (
                <Store className="h-7 w-7 text-muted-foreground/50" />
              )}
            </div>
            <div className="absolute inset-0 rounded-xl bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
              <Camera className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </label>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold tracking-tight">{outlet.name}</h1>
              {outlet.site_code && (
                <span className="font-mono text-xs bg-muted text-muted-foreground px-2 py-1 rounded border border-border">
                  {outlet.site_code}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
              <Building2 className="h-3.5 w-3.5" />
              <span>{outlet.brand_name}</span>
              <span className="text-muted-foreground">|</span>
              <MapPin className="h-3.5 w-3.5" />
              <span>
                {outlet.address}, {outlet.city}, {outlet.state}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge variant="outline" className={statusColor(outlet.status)}>
                {statusLabel(outlet.status)}
              </Badge>
              <Badge variant="outline" className="border-border text-foreground">
                {propertyTypeLabel(outlet.property_type)}
              </Badge>
              {outlet.floor && (
                <Badge variant="outline" className="border-border text-foreground">
                  {outlet.floor}
                </Badge>
              )}
              {outlet.unit_number && (
                <Badge variant="outline" className="border-border text-foreground">
                  Unit {outlet.unit_number}
                </Badge>
              )}
              <Badge variant="outline" className="border-border text-foreground">
                {outlet.franchise_model}
              </Badge>
            </div>
          </div>
        </div>
        {/* Action buttons — 2 rows */}
        <div className="flex flex-col gap-2 items-end">
          <div className="flex items-center gap-2">
            <Link href={`/agreements/upload?outlet_id=${outlet.id}`}>
              <Button size="sm" className="gap-1.5 bg-foreground hover:bg-foreground/90">
                <Upload className="h-3.5 w-3.5" />
                Upload Lease
              </Button>
            </Link>
            {agreements.length > 0 && (
              <Link href={`/agreements/${agreements[0].id}`}>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  View Agreement
                </Button>
              </Link>
            )}
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowCreateEvent(true)}>
              <CalendarClock className="h-3.5 w-3.5" />
              Create Event
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowEditOutlet(true)}>
              <Pencil className="h-3.5 w-3.5" />
              Edit Details
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={openShareDialog}>
              <Share2 className="h-3.5 w-3.5" />
              Share
            </Button>
            {(user?.role === "platform_admin" || user?.role === "org_admin") && (
              <Button variant="outline" size="sm" className="gap-1.5 text-rose-600 border-rose-200 hover:bg-rose-50" onClick={() => setShowDeleteDialog(true)}>
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Share Dialog */}
      <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Share Outlet</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Create shareable links for this property. Anyone with the link can view outlet details.
            </p>

            {showcaseLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground py-4 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Loading...</span>
              </div>
            ) : (
              <>
                {showcases.map((sc) => (
                  <div key={sc.id} className="border border-border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium truncate">{sc.title || "Showcase Link"}</span>
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`active-${sc.id}`} className="text-xs text-muted-foreground">Active</Label>
                        <Switch
                          id={`active-${sc.id}`}
                          checked={sc.is_active}
                          onCheckedChange={() => handleToggleShowcase(sc.id, sc.is_active)}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`fin-${sc.id}`} className="text-xs text-muted-foreground">Include financials</Label>
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
      {/* KEY PEOPLE — extracted from agreements + contacts                  */}
      {/* ----------------------------------------------------------------- */}
      {(agreements.some(a => a.lessor_name || a.lessee_name) || contacts.length > 0) && (
        <Card className="border-border overflow-hidden">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-foreground flex items-center justify-center">
                  <Users className="h-3.5 w-3.5 text-white" />
                </div>
                <CardTitle className="text-sm font-semibold">Key People</CardTitle>
              </div>
              {contacts.length > 0 && (
                <Badge variant="secondary" className="text-[10px]">{contacts.length} contact{contacts.length !== 1 ? "s" : ""}</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {/* Lessor from primary agreement */}
              {agreements[0]?.lessor_name && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-muted border border-border">
                  <div className="w-9 h-9 rounded-full bg-neutral-50 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-neutral-900">{agreements[0].lessor_name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">{agreements[0].lessor_name}</p>
                    <p className="text-[10px] text-muted-foreground">Lessor / Owner</p>
                  </div>
                </div>
              )}
              {/* Lessee from primary agreement */}
              {agreements[0]?.lessee_name && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-muted border border-border">
                  <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-foreground">{agreements[0].lessee_name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">{agreements[0].lessee_name}</p>
                    <p className="text-[10px] text-muted-foreground">Lessee / Tenant</p>
                  </div>
                </div>
              )}
              {/* Top contacts */}
              {contacts.slice(0, 4).map((c) => (
                <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl bg-muted border border-border">
                  <div className="w-9 h-9 rounded-full bg-neutral-50 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-neutral-700">{c.name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-foreground truncate">{c.name}</p>
                    <p className="text-[10px] text-muted-foreground">{c.designation || "Contact"}</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {c.phone && (
                      <a href={`tel:${c.phone}`} className="text-muted-foreground hover:text-foreground transition-colors">
                        <Phone className="h-3 w-3" />
                      </a>
                    )}
                    {c.email && (
                      <a href={`mailto:${c.email}`} className="text-muted-foreground hover:text-foreground transition-colors">
                        <Mail className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* OUTLET DETAILS CARD                                               */}
      {/* ----------------------------------------------------------------- */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base">Outlet Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground text-xs">Name</span>
              <div className="font-medium">{outlet.name}</div>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Brand</span>
              <div className="font-medium">{outlet.brand_name}</div>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Site Code</span>
              <div className="font-medium font-mono">{outlet.site_code || "--"}</div>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Locality</span>
              <div className="font-medium">{outlet.locality || "--"}</div>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Full Address</span>
              <div className="font-medium">
                {outlet.address}, {outlet.city}, {outlet.state}
              </div>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Property Type</span>
              <div className="font-medium">{propertyTypeLabel(outlet.property_type)}</div>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Floor</span>
              <div className="font-medium">{outlet.floor || "--"}</div>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Unit Number</span>
              <div className="font-medium">{outlet.unit_number || "--"}</div>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Super Area</span>
              <div className="font-medium">
                {outlet.super_area_sqft
                  ? `${outlet.super_area_sqft.toLocaleString("en-IN")} sqft`
                  : "--"}
              </div>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Covered Area</span>
              <div className="font-medium">
                {outlet.covered_area_sqft
                  ? `${outlet.covered_area_sqft.toLocaleString("en-IN")} sqft`
                  : "--"}
              </div>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Franchise Model</span>
              <div className="font-medium">{outlet.franchise_model}</div>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Status</span>
              <div className="mt-0.5">
                <Badge variant="outline" className={statusColor(outlet.status)}>
                  {statusLabel(outlet.status)}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Photos section removed — use Document Storage instead */}

      {/* ----------------------------------------------------------------- */}
      {/* REVENUE INPUT                                                     */}
      {/* ----------------------------------------------------------------- */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2">
              <IndianRupee className="h-4 w-4" />
              Net Revenue
            </span>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => setShowCsvDialog(true)}
            >
              <FileUp className="h-3.5 w-3.5" />
              Upload CSV
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <div className="flex-1 max-w-xs">
              <label className="text-xs text-muted-foreground mb-1 block">Revenue (INR)</label>
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
            <div className="w-32">
              <label className="text-xs text-muted-foreground mb-1 block">Frequency</label>
              <Select value={revenueFrequency} onValueChange={setRevenueFrequency}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                </SelectContent>
              </Select>
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
            <div className="mt-3 text-sm text-muted-foreground">
              Current: <span className="font-semibold">{formatCurrency(outlet.monthly_net_revenue)}</span>
              {outlet.revenue_updated_at && (
                <span className="text-xs text-muted-foreground ml-2">
                  Updated {formatDate(outlet.revenue_updated_at)}
                </span>
              )}
              {(() => {
                const primaryRent = agreements?.[0]?.monthly_rent;
                if (primaryRent && primaryRent > 0 && outlet.monthly_net_revenue > 0) {
                  const ratio = ((primaryRent / outlet.monthly_net_revenue) * 100).toFixed(1);
                  return (
                    <span className="ml-3 text-xs">
                      Rent-to-Revenue: <span className={`font-semibold ${Number(ratio) >= 18 ? "text-rose-600" : Number(ratio) >= 12 ? "text-amber-600" : "text-emerald-700"}`}>{ratio}%</span>
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
      {/* CSV UPLOAD DIALOG                                                */}
      {/* ----------------------------------------------------------------- */}
      <Dialog open={showCsvDialog} onOpenChange={(open) => { if (!open) resetCsvDialog(); else setShowCsvDialog(true); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileUp className="h-4 w-4" />
              Upload Revenue CSV
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Instructions */}
            <div className="text-sm text-muted-foreground bg-muted/50 rounded-md p-3">
              <p className="font-medium text-foreground mb-1">Expected CSV format:</p>
              <code className="text-xs block bg-background rounded p-2 mt-1">
                outlet,month,year,revenue<br />
                Store Name,3,2026,500000<br />
                Another Store,3,2026,750000
              </code>
              <p className="mt-2 text-xs">
                Columns: <strong>outlet</strong> (or outlet_name), <strong>month</strong> (1-12), <strong>year</strong>, <strong>revenue</strong> (or total_revenue, dine_in, delivery).
                Outlet names are fuzzy-matched automatically.
              </p>
              <a
                href="data:text/csv;charset=utf-8,outlet,month,year,revenue%0AStore%20Name,3,2026,500000%0AStore%20Name,4,2026,750000"
                download="sample-revenue.csv"
                className="text-xs text-blue-600 hover:text-blue-800 underline mt-2 inline-block"
              >
                Download sample CSV
              </a>
            </div>

            {/* File input */}
            {!csvResult && (
              <div>
                <label className="text-sm font-medium mb-1 block">Select CSV file</label>
                <Input
                  type="file"
                  accept=".csv"
                  onChange={handleCsvFileSelect}
                  className="cursor-pointer"
                />
              </div>
            )}

            {/* Preview table */}
            {csvPreview.length > 0 && !csvResult && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm font-medium">Preview (first {csvPreview.length} rows)</span>
                </div>
                <div className="border rounded-md overflow-auto max-h-48">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {csvHeaders.map((h, i) => (
                          <TableHead key={i} className="text-xs whitespace-nowrap">{h}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {csvPreview.map((row, ri) => (
                        <TableRow key={ri}>
                          {row.map((cell, ci) => (
                            <TableCell key={ci} className="text-xs py-1.5">{cell}</TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Upload result */}
            {csvResult && (
              <div className="space-y-3">
                <div className={`flex items-center gap-2 p-3 rounded-md ${csvResult.imported > 0 ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" : "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-400"}`}>
                  {csvResult.imported > 0 ? (
                    <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  )}
                  <span className="text-sm font-medium">
                    {csvResult.imported} row{csvResult.imported !== 1 ? "s" : ""} imported
                    {csvResult.skipped > 0 && `, ${csvResult.skipped} skipped`}
                  </span>
                </div>
                {csvResult.errors.length > 0 && (
                  <div className="text-xs space-y-1 max-h-32 overflow-auto">
                    {csvResult.errors.map((err, i) => (
                      <div key={i} className="text-rose-600 dark:text-rose-400">
                        {err.row > 0 ? `Row ${err.row}: ` : ""}{err.error}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={resetCsvDialog}>
                {csvResult ? "Close" : "Cancel"}
              </Button>
              {!csvResult && (
                <Button
                  size="sm"
                  onClick={handleCsvUpload}
                  disabled={!csvFile || csvUploading}
                  className="gap-1.5"
                >
                  {csvUploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                  {csvUploading ? "Uploading..." : "Upload & Import"}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ----------------------------------------------------------------- */}
      {/* RENT MODEL OVERVIEW                                              */}
      {/* ----------------------------------------------------------------- */}
      {agreements.length > 0 && (() => {
        const agr = agreements[0];
        const rentModel = agr.rent_model || "fixed";
        const rentSection = agr.extracted_data?.rent as Record<string, unknown> | undefined;
        const rentSchedule = (rentSection?.rent_schedule || []) as Array<Record<string, unknown>>;
        const revSharePct = agr.revenue_share_pct || (rentSection?.revenue_share_pct as number | undefined) || (rentSection?.revenue_share_net_sales_pct as number | undefined) || 0;
        const escalationPct = agr.escalation_pct || (rentSection?.escalation_percentage as number | undefined) || 0;
        const escalationFreq = agr.escalation_frequency_years || (rentSection?.escalation_frequency_years as number | undefined) || 0;

        const rentModelLabels: Record<string, string> = {
          fixed: "Fixed",
          revenue_share: "Revenue Share",
          hybrid_mglr: "Guaranteed Rent",
          percentage_only: "Percentage Only",
        };
        const rentModelColors: Record<string, string> = {
          fixed: "bg-blue-50 text-blue-700 border-blue-200",
          revenue_share: "bg-emerald-50 text-emerald-700 border-emerald-200",
          hybrid_mglr: "bg-amber-50 text-amber-700 border-amber-200",
          percentage_only: "bg-slate-50 text-slate-700 border-slate-200",
        };

        const GST_RATE = 0.18;
        const baseRent = agr.monthly_rent || 0;
        const gstAmount = baseRent * GST_RATE;
        const rentWithGst = baseRent + gstAmount;

        return (
          <TooltipProvider>
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <IndianRupee className="h-4 w-4" />
                    Rent Model
                    <Badge className={`text-[10px] font-medium border ${rentModelColors[rentModel] || "bg-muted text-muted-foreground"}`}>
                      {rentModelLabels[rentModel] || rentModel.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
                    </Badge>
                  </span>
                  {!rentEditing ? (
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs ml-auto" onClick={() => {
                      setRentEditing(true);
                      setRentOverride({
                        monthly_rent: String(agr.monthly_rent || ""),
                        revenue_share_pct: String(agr.revenue_share_pct || revSharePct || ""),
                        escalation_pct: String(agr.escalation_pct || escalationPct || ""),
                        escalation_frequency_years: String(agr.escalation_frequency_years || escalationFreq || ""),
                      });
                    }}>
                      <Pencil className="h-3 w-3" />
                      Edit Values
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2 ml-auto">
                      <Button variant="outline" size="sm" className="text-xs" onClick={() => setRentEditing(false)}>Cancel</Button>
                      <Button size="sm" className="gap-1.5 text-xs" onClick={async () => {
                        setRentSaving(true);
                        try {
                          const updates: Record<string, unknown> = {};
                          if (rentOverride.monthly_rent) updates["rent.monthly_rent"] = parseFloat(rentOverride.monthly_rent);
                          if (rentOverride.revenue_share_pct) updates["rent.revenue_share_pct"] = parseFloat(rentOverride.revenue_share_pct);
                          if (rentOverride.escalation_pct) updates["rent.escalation_percentage"] = parseFloat(rentOverride.escalation_pct);
                          if (rentOverride.escalation_frequency_years) updates["rent.escalation_frequency_years"] = parseFloat(rentOverride.escalation_frequency_years);
                          const { updateAgreement } = await import("@/lib/api");
                          await updateAgreement(agr.id, { field_updates: updates });
                          setRentEditing(false);
                          window.location.reload();
                        } catch (err) {
                          alert(err instanceof Error ? err.message : "Failed to save");
                        } finally {
                          setRentSaving(false);
                        }
                      }} disabled={rentSaving}>
                        {rentSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                        Save
                      </Button>
                    </div>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {rentEditing && (
                  <div className="space-y-3 mb-4 p-3 rounded-lg border bg-muted/30">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Monthly Rent (INR)</label>
                        <Input type="number" value={rentOverride.monthly_rent} onChange={(e) => setRentOverride(p => ({ ...p, monthly_rent: e.target.value }))} placeholder="e.g. 200000" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Revenue Share %</label>
                        <Input type="number" value={rentOverride.revenue_share_pct} onChange={(e) => setRentOverride(p => ({ ...p, revenue_share_pct: e.target.value }))} placeholder="e.g. 8" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Escalation %</label>
                        <Input type="number" value={rentOverride.escalation_pct} onChange={(e) => setRentOverride(p => ({ ...p, escalation_pct: e.target.value }))} placeholder="e.g. 5" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Escalation Freq (years)</label>
                        <Input type="number" value={rentOverride.escalation_frequency_years} onChange={(e) => setRentOverride(p => ({ ...p, escalation_frequency_years: e.target.value }))} placeholder="e.g. 1" />
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground">These values override the auto-extracted rent data.</p>
                  </div>
                )}
                {(
                  <div className="space-y-4">
                    {/* Rent model specific display */}
                    {rentModel === "fixed" && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground text-xs block">Base Rent</span>
                            <span className="font-semibold">{baseRent > 0 ? formatCurrency(baseRent) : "--"}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground text-xs block flex items-center gap-1">
                              GST (18%)
                              <button onClick={() => setShowGstBreakdown(!showGstBreakdown)} className="text-muted-foreground hover:text-foreground">
                                <Info className="h-3 w-3" />
                              </button>
                            </span>
                            <span className="font-semibold">{baseRent > 0 ? formatCurrency(gstAmount) : "--"}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground text-xs block">Rent + GST</span>
                            <span className="font-semibold text-foreground">{baseRent > 0 ? formatCurrency(rentWithGst) : "--"}</span>
                          </div>
                          {agr.rent_per_sqft && agr.rent_per_sqft > 0 && (
                            <div>
                              <span className="text-muted-foreground text-xs block">Rate / sqft</span>
                              <span className="font-semibold">{formatCurrency(agr.rent_per_sqft)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {rentModel === "revenue_share" && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground text-xs block">Revenue Share %</span>
                          <span className="font-semibold">{revSharePct > 0 ? `${revSharePct}%` : "--"}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs block">Base Rent (Minimum)</span>
                          <span className="font-semibold">{baseRent > 0 ? formatCurrency(baseRent) : "--"}</span>
                        </div>
                        {agr.rent_per_sqft && agr.rent_per_sqft > 0 && (
                          <div>
                            <span className="text-muted-foreground text-xs block">Rate / sqft</span>
                            <span className="font-semibold">{formatCurrency(agr.rent_per_sqft)}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {rentModel === "hybrid_mglr" && (
                      <div className="space-y-3">
                        <div className="p-3 rounded-lg bg-blue-50/50 border border-blue-200/50 text-sm">
                          <div className="flex items-center gap-1.5 text-blue-700 mb-1">
                            <ArrowUpDown className="h-3.5 w-3.5" />
                            <span className="font-medium">Higher of: Guaranteed Rent or Revenue Share %</span>
                          </div>
                          <p className="text-xs text-blue-600">
                            Payable rent each month is the higher of the guaranteed fixed amount or the revenue share percentage applied to actual sales.
                          </p>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground text-xs block">Guaranteed (Fixed)</span>
                            <span className="font-semibold">{baseRent > 0 ? formatCurrency(baseRent) : "--"}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground text-xs block">Revenue Share %</span>
                            <span className="font-semibold">{revSharePct > 0 ? `${revSharePct}%` : "--"}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground text-xs block">GST (18%)</span>
                            <span className="font-semibold">{baseRent > 0 ? formatCurrency(gstAmount) : "--"}</span>
                          </div>
                          {agr.rent_per_sqft && agr.rent_per_sqft > 0 && (
                            <div>
                              <span className="text-muted-foreground text-xs block">Rate / sqft</span>
                              <span className="font-semibold">{formatCurrency(agr.rent_per_sqft)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {rentModel === "percentage_only" && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground text-xs block">Revenue Share %</span>
                          <span className="font-semibold">{revSharePct > 0 ? `${revSharePct}%` : "--"}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs block">Fixed Component</span>
                          <span className="text-sm text-muted-foreground italic">None (% only)</span>
                        </div>
                      </div>
                    )}

                    {/* Escalation display */}
                    {(escalationPct > 0 || rentSchedule.length > 0) && (
                      <div className="border-t border-border pt-3 space-y-2">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <TrendingUp className="h-3.5 w-3.5" />
                          <span className="font-medium uppercase tracking-wide">Escalation Schedule</span>
                        </div>
                        {escalationPct > 0 && (
                          <div className="flex items-center gap-4 text-sm">
                            <div>
                              <span className="text-muted-foreground text-xs block">Escalation %</span>
                              <span className="font-semibold">{escalationPct}%</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground text-xs block">Frequency</span>
                              <span className="font-semibold">
                                Every {escalationFreq || 1} year{(escalationFreq || 1) > 1 ? "s" : ""}
                              </span>
                            </div>
                          </div>
                        )}
                        {rentSchedule.length > 0 && (
                          <div className="mt-2 space-y-1.5">
                            {rentSchedule.map((item, idx) => {
                              const period = item.year || item.period || item.years || (item.from_year && item.to_year ? `${item.from_year}-${item.to_year}` : "") || `${idx + 1}`;
                              const rent = item.monthly_rent || item.mglr_monthly || item.rent || item.amount || 0;
                              const perSqft = item.rent_per_sqft || item.mglr_per_sqft || item.per_sqft || 0;
                              const revShare = item.revenue_share_net_sales_pct || item.revenue_share || 0;
                              return (
                                <div key={idx} className="flex items-center gap-3 text-sm py-1 px-2 rounded bg-muted/50">
                                  <Badge variant="outline" className="text-[10px] shrink-0">Year {String(period)}</Badge>
                                  {Number(rent) > 0 && <span className="font-medium">{formatCurrency(Number(rent))}/mo</span>}
                                  {Number(perSqft) > 0 && <span className="text-xs text-muted-foreground">({formatCurrency(Number(perSqft))}/sqft)</span>}
                                  {Number(revShare) > 0 && <span className="text-xs text-muted-foreground flex items-center gap-0.5"><Percent className="h-2.5 w-2.5" />{String(revShare)}% rev share</span>}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TooltipProvider>
        );
      })()}

      {/* ----------------------------------------------------------------- */}
      {/* AGREEMENTS TABLE                                                  */}
      {/* ----------------------------------------------------------------- */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Linked Agreements
            {agreements.length > 0 && (
              <Badge variant="secondary" className="ml-2 bg-muted text-muted-foreground">
                {agreements.length}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {agreements.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4 text-center">
              No agreements linked to this outlet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted hover:bg-muted">
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Type
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Status
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right">
                      Monthly Rent
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Lease Expiry
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center">
                      Risk Flags
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Lessor
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right">
                      Security Deposit
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agreements.map((agr) => (
                    <TableRow key={agr.id} className="hover:bg-muted transition-colors">
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
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(agr.lease_expiry_date)}
                      </TableCell>
                      <TableCell className="text-center">
                        {agr.risk_flags && agr.risk_flags.length > 0 ? (
                          <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 text-xs">
                            {agr.risk_flags.length}
                          </Badge>
                        ) : (
                          <span className="text-sm text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
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

      {/* Custom Notes from Agreements */}
      {agreements.some((a) => a.custom_notes || (a.custom_clauses && a.custom_clauses.length > 0)) && (
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Agreement Notes & Custom Clauses
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {agreements.filter((a) => a.custom_notes || (a.custom_clauses && a.custom_clauses.length > 0)).map((agr) => (
              <div key={agr.id} className="space-y-2">
                {agr.document_filename && <p className="text-xs font-medium text-muted-foreground">{agr.document_filename}</p>}
                {agr.custom_clauses && agr.custom_clauses.length > 0 && (
                  <div className="space-y-1">
                    {agr.custom_clauses.map((clause, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        <span className="font-medium min-w-[120px]">{clause.name}:</span>
                        <span className="text-muted-foreground">{clause.value}</span>
                      </div>
                    ))}
                  </div>
                )}
                {agr.custom_notes && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{agr.custom_notes}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* EVENTS TABLE                                                      */}
      {/* ----------------------------------------------------------------- */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Events
            {(obligations.length + (data?.criticalDates?.length || 0)) > 0 && (
              <Badge variant="secondary" className="ml-2 bg-muted text-muted-foreground">
                {obligations.length + (data?.criticalDates?.length || 0)}
              </Badge>
            )}
            <Button variant="outline" size="sm" className="gap-1.5 text-xs ml-auto" onClick={() => setShowCreateEvent(true)}>
              <Plus className="h-3.5 w-3.5" />
              Add Event
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {obligations.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4 text-center">
              No events recorded for this outlet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted hover:bg-muted">
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Type
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right">
                      Amount
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Frequency
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Due Date
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Status
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {obligations.map((obl) => (
                    <TableRow key={obl.id} className="hover:bg-muted transition-colors">
                      <TableCell className="text-sm font-medium">
                        {obligationTypeLabel(obl.type)}
                      </TableCell>
                      <TableCell className="text-sm font-semibold text-right">
                        {obl.amount > 0 ? formatCurrency(obl.amount) : "--"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {obl.frequency
                          ? obl.frequency.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
                          : "--"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {obl.due_date ? formatDate(obl.due_date) : "--"}
                      </TableCell>
                      <TableCell>
                        {obl.status ? (
                          <Badge className={`${statusColor(obl.status)} border-0 text-xs font-medium`}>
                            {statusLabel(obl.status)}
                          </Badge>
                        ) : (
                          <span className="text-sm text-muted-foreground">--</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {/* Critical Dates / Custom Events */}
          {(data?.criticalDates || []).length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Custom Events</p>
              {(data?.criticalDates || []).map((cd: Record<string, unknown>) => (
                <div key={cd.id as string} className="flex items-center gap-3 p-3 rounded-lg bg-muted border border-border">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    cd.priority === "critical" ? "bg-rose-500" : cd.priority === "high" ? "bg-amber-500" : "bg-blue-400"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold">{cd.label as string}</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="outline" className="text-[10px]">{((cd.event_type as string) || "custom").replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}</Badge>
                      <span className="text-xs text-muted-foreground">{cd.date_value as string}</span>
                      <Badge variant="outline" className="text-[10px]">{(cd.task_status as string) || "pending"}</Badge>
                    </div>
                    {cd.notes ? <p className="text-xs text-muted-foreground mt-1">{String(cd.notes)}</p> : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ----------------------------------------------------------------- */}
      {/* ALERTS LIST                                                       */}
      {/* ----------------------------------------------------------------- */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" />
            Reminders
            {alerts.filter(a => { const d = new Date(a.trigger_date); const t = new Date(); t.setHours(0,0,0,0); return d >= t && d <= new Date(t.getTime() + 90*24*60*60*1000); }).length > 0 && (
              <Badge variant="secondary" className="ml-2 bg-muted text-muted-foreground">
                {alerts.filter(a => { const d = new Date(a.trigger_date); const t = new Date(); t.setHours(0,0,0,0); return d >= t && d <= new Date(t.getTime() + 90*24*60*60*1000); }).length}
              </Badge>
            )}
            <Button variant="outline" size="sm" className="gap-1.5 text-xs ml-auto" onClick={() => setShowCreateReminder(true)}>
              <Plus className="h-3.5 w-3.5" />
              Create Reminder
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(() => {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const cutoff = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);
            const upcomingAlerts = alerts.filter((a) => {
              if (!a.trigger_date) return true;
              const d = new Date(a.trigger_date);
              return d >= today && d <= cutoff;
            });
            return upcomingAlerts.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4 text-center">
              No reminders in the next 90 days.
            </div>
          ) : (
            <div className="space-y-3">
              {upcomingAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-start gap-3 p-3 rounded-lg bg-muted border border-border"
                >
                  <div
                    className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${
                      alert.severity === "high"
                        ? "bg-rose-500"
                        : alert.severity === "medium"
                        ? "bg-amber-500"
                        : alert.severity === "low"
                        ? "bg-blue-400"
                        : "bg-slate-400"
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
                      <p className="text-sm text-muted-foreground mt-1">{alert.message}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Trigger: {formatDate(alert.trigger_date)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          );
          })()}
        </CardContent>
      </Card>

      {/* ----------------------------------------------------------------- */}
      {/* DOCUMENT STORAGE (Drive-like multi-doc)                           */}
      {/* ----------------------------------------------------------------- */}
      <Card className="border-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FolderOpen className="h-4 w-4" />
              Outlet Storage Drive
              <Badge variant="secondary" className="text-[10px]">
                {(data.documents || []).length}
              </Badge>
            </CardTitle>
            <div className="flex items-center gap-2">
              <Select value={docCategory} onValueChange={setDocCategory}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select type *" />
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
                    if (!docCategory) {
                      alert("Please select a document type before uploading.");
                      e.target.value = "";
                      return;
                    }
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
          {/* Pre-defined folder view */}
          {(() => {
            const docs = data.documents || [];
            const FOLDERS = [
              { key: "agreement", label: "Agreements", icon: "📄" },
              { key: "loi", label: "LOI / Letters of Intent", icon: "📋" },
              { key: "license", label: "Licenses & Certificates", icon: "📜" },
              { key: "kyc", label: "KYC Documents", icon: "🪪" },
              { key: "property_tax", label: "Property Tax", icon: "🏛️" },
              { key: "electricity", label: "Electricity Bills", icon: "⚡" },
              { key: "layout_plan", label: "Layout Plans", icon: "📐" },
              { key: "noc", label: "NOC / Approvals", icon: "✅" },
              { key: "sale_deed", label: "Sale Deed", icon: "📑" },
              { key: "other", label: "Other Documents", icon: "📁" },
            ];
            const grouped: Record<string, typeof docs> = {};
            for (const f of FOLDERS) grouped[f.key] = [];
            for (const doc of docs) {
              const cat = doc.category || doc.file_type || "other";
              const folder = FOLDERS.find((f) => f.key === cat) ? cat : "other";
              grouped[folder].push(doc);
            }
            const photosDocs = docs.filter((d) => /\.(jpg|jpeg|png|webp|gif)$/i.test(d.filename || ""));
            const nonEmpty = FOLDERS.filter((f) => grouped[f.key].length > 0);
            const empty = FOLDERS.filter((f) => grouped[f.key].length === 0);

            return (
              <div className="space-y-1">
                {/* Photo folder (special) */}
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted transition-colors">
                  <span className="text-sm">📸</span>
                  <span className="text-sm font-medium flex-1">Photos</span>
                  <Badge variant="outline" className="text-[10px]">{photosDocs.length}</Badge>
                </div>
                {/* Folders with documents */}
                {nonEmpty.map((folder) => (
                  <details key={folder.key} className="group">
                    <summary className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted transition-colors cursor-pointer list-none">
                      <span className="text-sm">{folder.icon}</span>
                      <span className="text-sm font-medium flex-1">{folder.label}</span>
                      <Badge variant="secondary" className="text-[10px]">{grouped[folder.key].length}</Badge>
                      <ChevronRight className="h-3 w-3 text-muted-foreground group-open:rotate-90 transition-transform" />
                    </summary>
                    <div className="ml-8 mt-1 space-y-1">
                      {grouped[folder.key].map((doc) => (
                        <a key={doc.id} href={doc.url || doc.file_url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-muted transition-colors">
                          <File className="h-3 w-3 text-muted-foreground" />
                          <span className="truncate flex-1">{doc.filename || doc.name}</span>
                        </a>
                      ))}
                    </div>
                  </details>
                ))}
                {/* Empty folders (collapsed) */}
                {empty.map((folder) => (
                  <div key={folder.key} className="flex items-center gap-2 px-3 py-2 rounded-lg text-muted-foreground">
                    <span className="text-sm opacity-50">{folder.icon}</span>
                    <span className="text-xs flex-1">{folder.label}</span>
                    <Badge variant="outline" className="text-[9px] opacity-50">empty</Badge>
                  </div>
                ))}
              </div>
            );
          })()}
          {(data?.documents || []).length === 0 && (
            <div className="text-center py-6 text-muted-foreground mt-3 border-t">
              <p className="text-xs">Upload documents using the button above. Files will be organized into folders automatically.</p>
            </div>
          )}
          {false && (data?.documents || []).length > 0 && (
            <div className="space-y-2 hidden">
              {(data?.documents || []).map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-3 p-2.5 rounded-lg border border-border hover:bg-muted transition-colors group"
                >
                  <div className="h-8 w-8 rounded bg-muted flex items-center justify-center flex-shrink-0">
                    <FileText className="h-4 w-4 text-muted-foreground" />
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
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
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
                        className="p-1.5 rounded hover:bg-muted transition-colors"
                        title="Download"
                      >
                        <Download className="h-3.5 w-3.5 text-muted-foreground" />
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
                      className="p-1.5 rounded hover:bg-neutral-50 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-neutral-900" />
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
      <Card className="border-border">
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
            <div className="flex items-center gap-2 text-muted-foreground py-4 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading contacts...</span>
            </div>
          ) : contacts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
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
                          <Phone className="h-3 w-3 text-muted-foreground" />
                          {contact.phone}
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      {contact.email ? (
                        <span className="flex items-center gap-1 text-sm">
                          <Mail className="h-3 w-3 text-muted-foreground" />
                          {contact.email}
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEditContact(contact)}
                          className="p-1.5 rounded hover:bg-muted transition-colors"
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                        <button
                          onClick={() => handleDeleteContact(contact.id)}
                          className="p-1.5 rounded hover:bg-neutral-50 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-neutral-900" />
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
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4" />
            Activity Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activityLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-4 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading activity...</span>
            </div>
          ) : (
            <Timeline items={activityItems} />
          )}
        </CardContent>
      </Card>
      )}

      {/* Edit Outlet Dialog */}
      {showEditOutlet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl p-6 max-w-lg mx-4 space-y-4 shadow-xl w-full">
            <h3 className="text-lg font-semibold">Edit Outlet Details</h3>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(editOutletData).map(([key, val]) => (
                <div key={key}>
                  <label className="text-xs text-muted-foreground mb-1 block capitalize">{key.replace(/_/g, " ")}</label>
                  <Input
                    value={val}
                    onChange={(e) => setEditOutletData((p) => ({ ...p, [key]: e.target.value }))}
                    placeholder={key.replace(/_/g, " ")}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowEditOutlet(false)}>Cancel</Button>
              <Button size="sm" onClick={async () => {
                try {
                  await updateOutlet(outletId, editOutletData as Record<string, unknown>);
                  setShowEditOutlet(false);
                  window.location.reload();
                } catch (err) {
                  alert(err instanceof Error ? err.message : "Failed to update outlet");
                }
              }}>Save Changes</Button>
            </div>
          </div>
        </div>
      )}

      {/* Create Event Dialog */}
      {showCreateEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl p-6 max-w-md mx-4 space-y-4 shadow-xl w-full">
            <h3 className="text-lg font-semibold">Create Event</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Event Title *</label>
                <Input value={eventForm.title} onChange={(e) => setEventForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Rent escalation due" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Event Type *</label>
                <Select value={eventForm.event_type} onValueChange={(v) => setEventForm(p => ({ ...p, event_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="custom">Custom</SelectItem>
                    <SelectItem value="rent_escalation">Rent Escalation</SelectItem>
                    <SelectItem value="renewal_option">Renewal Option</SelectItem>
                    <SelectItem value="notice_deadline">Notice Deadline</SelectItem>
                    <SelectItem value="insurance_renewal">Insurance Renewal</SelectItem>
                    <SelectItem value="license_renewal">License Renewal</SelectItem>
                    <SelectItem value="registration_deadline">Registration Deadline</SelectItem>
                    <SelectItem value="security_deposit_topup">Security Deposit Top-up</SelectItem>
                    <SelectItem value="tds_filing">TDS Filing</SelectItem>
                    <SelectItem value="cam_reconciliation">CAM Reconciliation</SelectItem>
                    <SelectItem value="fit_out_end">Fit-Out End</SelectItem>
                    <SelectItem value="rent_commencement">Rent Commencement</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Date *</label>
                <Input type="date" value={eventForm.date_value} onChange={(e) => setEventForm(p => ({ ...p, date_value: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Priority</label>
                <Select value={eventForm.priority} onValueChange={(v) => setEventForm(p => ({ ...p, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Description</label>
                <Input value={eventForm.description} onChange={(e) => setEventForm(p => ({ ...p, description: e.target.value }))} placeholder="Optional details" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowCreateEvent(false)}>Cancel</Button>
              <Button size="sm" disabled={eventSaving || !eventForm.title || !eventForm.date_value} onClick={async () => {
                setEventSaving(true);
                try {
                  const { createCriticalDate } = await import("@/lib/api");
                  await createCriticalDate({
                    outlet_id: outletId,
                    agreement_id: agreements.length > 0 ? agreements[0].id : undefined,
                    title: eventForm.title,
                    event_type: eventForm.event_type,
                    date_value: eventForm.date_value,
                    priority: eventForm.priority,
                    description: eventForm.description,
                  });
                  setShowCreateEvent(false);
                  setEventForm({ title: "", event_type: "custom", date_value: "", priority: "medium", description: "" });
                  setRefreshKey((k) => k + 1);
                } catch (err) {
                  alert(err instanceof Error ? err.message : "Failed to create event");
                } finally {
                  setEventSaving(false);
                }
              }}>
                {eventSaving ? "Creating..." : "Create Event"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Create Reminder Dialog */}
      {showCreateReminder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl p-6 max-w-md mx-4 space-y-4 shadow-xl w-full">
            <h3 className="text-lg font-semibold">Create Reminder</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Title *</label>
                <Input value={reminderForm.title} onChange={(e) => setReminderForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Rent payment due" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Message</label>
                <Input value={reminderForm.message} onChange={(e) => setReminderForm(p => ({ ...p, message: e.target.value }))} placeholder="Optional details" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Date *</label>
                <Input type="date" value={reminderForm.trigger_date} onChange={(e) => setReminderForm(p => ({ ...p, trigger_date: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Severity</label>
                <Select value={reminderForm.severity} onValueChange={(v) => setReminderForm(p => ({ ...p, severity: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowCreateReminder(false)}>Cancel</Button>
              <Button size="sm" disabled={reminderSaving || !reminderForm.title || !reminderForm.trigger_date} onClick={async () => {
                setReminderSaving(true);
                try {
                  const { createReminder } = await import("@/lib/api");
                  await createReminder({
                    title: reminderForm.title,
                    message: reminderForm.message,
                    trigger_date: reminderForm.trigger_date,
                    severity: reminderForm.severity,
                    outlet_id: outletId,
                  });
                  setShowCreateReminder(false);
                  setReminderForm({ title: "", message: "", trigger_date: "", severity: "medium" });
                  setRefreshKey((k) => k + 1);
                } catch (err) {
                  alert(err instanceof Error ? err.message : "Failed to create reminder");
                } finally {
                  setReminderSaving(false);
                }
              }}>
                {reminderSaving ? "Creating..." : "Create Reminder"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showDeleteDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl p-6 max-w-md mx-4 space-y-4 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-rose-100 flex items-center justify-center">
                <Trash2 className="h-5 w-5 text-rose-600" />
              </div>
              <div>
                <p className="text-sm font-semibold">Delete Outlet</p>
                <p className="text-xs text-muted-foreground">This action can be undone from the Recycle Bin</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete <strong className="text-foreground">{outlet?.name}</strong>?
              The outlet and its agreements will be moved to the Recycle Bin.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowDeleteDialog(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={deleting}
                onClick={handleDeleteOutlet}
              >
                {deleting ? "Deleting..." : "Yes, Delete Outlet"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
