// GroSpace Mock Data

export type Organization = {
  id: string;
  name: string;
  logoUrl?: string;
  createdAt: string;
};

export type User = {
  id: string;
  email: string;
  fullName: string;
  role: "platform_admin" | "org_admin" | "org_member";
  orgId: string | null;
};

export type OutletStatus = "pipeline" | "fit_out" | "operational" | "up_for_renewal" | "renewed" | "closed";
export type PropertyType = "mall" | "high_street" | "cloud_kitchen" | "metro" | "transit" | "cyber_park" | "hospital" | "college";
export type FranchiseModel = "FOFO" | "FOCO" | "COCO" | "direct_lease";

export type Outlet = {
  id: string;
  orgId: string;
  orgName: string;
  name: string;
  brandName: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  propertyType: PropertyType;
  floor: string;
  unitNumber: string;
  superAreaSqft: number;
  coveredAreaSqft: number;
  franchiseModel: FranchiseModel;
  status: OutletStatus;
  operatingHours: string;
  monthlyNetRevenue: number | null;
  revenueUpdatedAt: string | null;
  createdAt: string;
};

export type AgreementType = "lease_loi" | "license_certificate" | "franchise_agreement";
export type AgreementStatus = "draft" | "active" | "expiring" | "expired" | "renewed" | "terminated";
export type RentModel = "fixed" | "revenue_share" | "hybrid_mglr" | "percentage_only";

export type RiskFlag = {
  id: number;
  name: string;
  severity: "high" | "medium";
  explanation: string;
  clauseText: string;
};

export type Agreement = {
  id: string;
  orgId: string;
  outletId: string;
  outletName: string;
  type: AgreementType;
  status: AgreementStatus;
  documentFilename: string;
  extractionStatus: "pending" | "processing" | "review" | "confirmed" | "failed";
  lessorName: string;
  lesseeName: string;
  brandName: string;
  leaseCommencementDate: string;
  rentCommencementDate: string;
  leaseExpiryDate: string;
  lockInEndDate: string;
  rentModel: RentModel;
  monthlyRent: number;
  rentPerSqft: number;
  camMonthly: number;
  totalMonthlyOutflow: number;
  securityDeposit: number;
  escalationPct: number;
  escalationFrequencyYears: number;
  riskFlags: RiskFlag[];
  createdAt: string;
  confirmedAt: string | null;
};

export type ObligationType = "rent" | "cam" | "hvac" | "electricity" | "security_deposit" | "cam_deposit" | "license_renewal";
export type PaymentStatus = "upcoming" | "due" | "paid" | "overdue" | "partially_paid";

export type Obligation = {
  id: string;
  orgId: string;
  agreementId: string;
  outletId: string;
  outletName: string;
  type: ObligationType;
  frequency: "monthly" | "quarterly" | "yearly" | "one_time";
  amount: number;
  dueDayOfMonth: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
};

export type PaymentRecord = {
  id: string;
  obligationId: string;
  outletId: string;
  outletName: string;
  type: ObligationType;
  periodMonth: number;
  periodYear: number;
  dueDate: string;
  dueAmount: number;
  status: PaymentStatus;
  paidAmount: number | null;
  paidAt: string | null;
};

export type AlertType = "rent_due" | "cam_due" | "escalation" | "lease_expiry" | "license_expiry" | "lock_in_expiry" | "renewal_window" | "custom";
export type AlertSeverity = "high" | "medium" | "low" | "info";
export type AlertStatus = "pending" | "sent" | "acknowledged" | "snoozed";

export type Alert = {
  id: string;
  orgId: string;
  outletId: string;
  outletName: string;
  agreementId: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  triggerDate: string;
  status: AlertStatus;
  createdAt: string;
};

// --- MOCK DATA ---

export const organizations: Organization[] = [
  { id: "org-1", name: "Tan Coffee", createdAt: "2025-01-15" },
  { id: "org-2", name: "Good Flippin' Burgers", createdAt: "2025-02-01" },
  { id: "org-3", name: "Boba Bhai", createdAt: "2025-03-10" },
  { id: "org-4", name: "Glutokai", createdAt: "2025-04-05" },
  { id: "org-5", name: "Burgerama", createdAt: "2025-05-20" },
];

export const currentUser: User = {
  id: "user-1",
  email: "srabhjot@grospace.in",
  fullName: "Srabhjot Singh",
  role: "platform_admin",
  orgId: null,
};

export const outlets: Outlet[] = [
  {
    id: "out-1", orgId: "org-1", orgName: "Tan Coffee", name: "Tan Coffee - Sector 82A", brandName: "Tan Coffee",
    address: "Village Shikohpur, Sector 82A, Gurugram, Haryana-122001", city: "Gurugram", state: "Haryana", pincode: "122001",
    propertyType: "high_street", floor: "Ground Floor", unitNumber: "G-12", superAreaSqft: 850, coveredAreaSqft: 720,
    franchiseModel: "FOFO", status: "operational", operatingHours: "8 AM to 11 PM",
    monthlyNetRevenue: 680000, revenueUpdatedAt: "2026-01-31", createdAt: "2025-06-01",
  },
  {
    id: "out-2", orgId: "org-1", orgName: "Tan Coffee", name: "Tan Coffee - DLF Cyber Hub", brandName: "Tan Coffee",
    address: "DLF Cyber Hub, DLF Phase 3, Gurugram, Haryana-122002", city: "Gurugram", state: "Haryana", pincode: "122002",
    propertyType: "cyber_park", floor: "First Floor", unitNumber: "1068", superAreaSqft: 594, coveredAreaSqft: 1188,
    franchiseModel: "FOFO", status: "operational", operatingHours: "9 AM to 11 PM",
    monthlyNetRevenue: 920000, revenueUpdatedAt: "2026-01-31", createdAt: "2025-06-15",
  },
  {
    id: "out-3", orgId: "org-2", orgName: "Good Flippin' Burgers", name: "GFB - Felix Plaza, Gurugram", brandName: "Good Flippin' Burgers",
    address: "Felix Plaza, Sector 82A, Gurugram, Haryana-122001", city: "Gurugram", state: "Haryana", pincode: "122001",
    propertyType: "mall", floor: "Third Floor", unitNumber: "1068", superAreaSqft: 594, coveredAreaSqft: 1188,
    franchiseModel: "FOCO", status: "operational", operatingHours: "10 AM to 10 PM",
    monthlyNetRevenue: 450000, revenueUpdatedAt: "2026-01-31", createdAt: "2025-07-01",
  },
  {
    id: "out-4", orgId: "org-2", orgName: "Good Flippin' Burgers", name: "GFB - Connaught Place", brandName: "Good Flippin' Burgers",
    address: "Block A, Connaught Place, New Delhi-110001", city: "New Delhi", state: "Delhi", pincode: "110001",
    propertyType: "high_street", floor: "Ground Floor", unitNumber: "A-14", superAreaSqft: 780, coveredAreaSqft: 650,
    franchiseModel: "FOFO", status: "up_for_renewal", operatingHours: "11 AM to 11 PM",
    monthlyNetRevenue: 580000, revenueUpdatedAt: "2026-01-31", createdAt: "2025-07-15",
  },
  {
    id: "out-5", orgId: "org-3", orgName: "Boba Bhai", name: "Boba Bhai - Indiranagar", brandName: "Boba Bhai",
    address: "100 Feet Road, Indiranagar, Bengaluru-560038", city: "Bengaluru", state: "Karnataka", pincode: "560038",
    propertyType: "high_street", floor: "Ground Floor", unitNumber: "12", superAreaSqft: 420, coveredAreaSqft: 380,
    franchiseModel: "FOFO", status: "operational", operatingHours: "10 AM to 10 PM",
    monthlyNetRevenue: 320000, revenueUpdatedAt: "2026-01-31", createdAt: "2025-08-01",
  },
  {
    id: "out-6", orgId: "org-3", orgName: "Boba Bhai", name: "Boba Bhai - Koramangala", brandName: "Boba Bhai",
    address: "80 Feet Road, Koramangala, Bengaluru-560034", city: "Bengaluru", state: "Karnataka", pincode: "560034",
    propertyType: "high_street", floor: "Ground Floor", unitNumber: "5A", superAreaSqft: 380, coveredAreaSqft: 340,
    franchiseModel: "FOFO", status: "fit_out", operatingHours: "10 AM to 10 PM",
    monthlyNetRevenue: null, revenueUpdatedAt: null, createdAt: "2025-09-15",
  },
  {
    id: "out-7", orgId: "org-4", orgName: "Glutokai", name: "Glutokai - Saket", brandName: "Glutokai",
    address: "Select CityWalk, Saket, New Delhi-110017", city: "New Delhi", state: "Delhi", pincode: "110017",
    propertyType: "mall", floor: "Second Floor", unitNumber: "234", superAreaSqft: 650, coveredAreaSqft: 580,
    franchiseModel: "COCO", status: "operational", operatingHours: "10 AM to 10 PM",
    monthlyNetRevenue: 750000, revenueUpdatedAt: "2026-01-31", createdAt: "2025-05-20",
  },
  {
    id: "out-8", orgId: "org-4", orgName: "Glutokai", name: "Glutokai - Khan Market", brandName: "Glutokai",
    address: "Khan Market, New Delhi-110003", city: "New Delhi", state: "Delhi", pincode: "110003",
    propertyType: "high_street", floor: "Ground Floor", unitNumber: "48", superAreaSqft: 520, coveredAreaSqft: 480,
    franchiseModel: "COCO", status: "operational", operatingHours: "11 AM to 11 PM",
    monthlyNetRevenue: 890000, revenueUpdatedAt: "2026-01-31", createdAt: "2025-06-10",
  },
  {
    id: "out-9", orgId: "org-5", orgName: "Burgerama", name: "Burgerama - Sector 29", brandName: "Burgerama",
    address: "Sector 29 Market, Gurugram, Haryana-122001", city: "Gurugram", state: "Haryana", pincode: "122001",
    propertyType: "high_street", floor: "Ground Floor", unitNumber: "7", superAreaSqft: 600, coveredAreaSqft: 520,
    franchiseModel: "FOFO", status: "operational", operatingHours: "12 PM to 12 AM",
    monthlyNetRevenue: 410000, revenueUpdatedAt: "2026-01-31", createdAt: "2025-08-20",
  },
  {
    id: "out-10", orgId: "org-5", orgName: "Burgerama", name: "Burgerama - Hauz Khas", brandName: "Burgerama",
    address: "Hauz Khas Village, New Delhi-110016", city: "New Delhi", state: "Delhi", pincode: "110016",
    propertyType: "high_street", floor: "First Floor", unitNumber: "22B", superAreaSqft: 480, coveredAreaSqft: 430,
    franchiseModel: "FOFO", status: "pipeline", operatingHours: "12 PM to 12 AM",
    monthlyNetRevenue: null, revenueUpdatedAt: null, createdAt: "2026-01-10",
  },
  {
    id: "out-11", orgId: "org-1", orgName: "Tan Coffee", name: "Tan Coffee - Aerocity", brandName: "Tan Coffee",
    address: "Worldmark, Aerocity, New Delhi-110037", city: "New Delhi", state: "Delhi", pincode: "110037",
    propertyType: "mall", floor: "Ground Floor", unitNumber: "G-5", superAreaSqft: 720, coveredAreaSqft: 650,
    franchiseModel: "FOFO", status: "operational", operatingHours: "7 AM to 11 PM",
    monthlyNetRevenue: 780000, revenueUpdatedAt: "2026-01-31", createdAt: "2025-09-01",
  },
  {
    id: "out-12", orgId: "org-2", orgName: "Good Flippin' Burgers", name: "GFB - Mayur Vihar", brandName: "Good Flippin' Burgers",
    address: "Shop No. 02, Ground Floor, Mayur Vihar Phase 01, Delhi-110091", city: "New Delhi", state: "Delhi", pincode: "110091",
    propertyType: "high_street", floor: "Ground Floor", unitNumber: "02", superAreaSqft: 450, coveredAreaSqft: 400,
    franchiseModel: "FOFO", status: "operational", operatingHours: "11 AM to 11 PM",
    monthlyNetRevenue: 350000, revenueUpdatedAt: "2026-01-31", createdAt: "2025-10-01",
  },
];

export const agreements: Agreement[] = [
  {
    id: "agr-1", orgId: "org-2", outletId: "out-3", outletName: "GFB - Felix Plaza, Gurugram",
    type: "lease_loi", status: "active", documentFilename: "GFB_Felix_Plaza_LOI.pdf",
    extractionStatus: "confirmed", lessorName: "Felix Plaza AOP", lesseeName: "Good Flippin Foods Pvt Ltd",
    brandName: "Good Flippin' Burgers",
    leaseCommencementDate: "2024-10-04", rentCommencementDate: "2024-12-04",
    leaseExpiryDate: "2030-10-03", lockInEndDate: "2026-10-03",
    rentModel: "hybrid_mglr", monthlyRent: 53460, rentPerSqft: 90,
    camMonthly: 41580, totalMonthlyOutflow: 95040, securityDeposit: 784080,
    escalationPct: 15, escalationFrequencyYears: 3,
    riskFlags: [
      { id: 2, name: "High escalation", severity: "high", explanation: "Escalation is 15% every 3 years", clauseText: "The Lease Rent shall increase by 15% after every 3 years..." },
      { id: 8, name: "Uncapped revenue share", severity: "medium", explanation: "Revenue share has no maximum cap specified", clauseText: "Revenue share of 15% dine-in, 11% delivery with no cap..." },
    ],
    createdAt: "2025-07-01", confirmedAt: "2025-07-02",
  },
  {
    id: "agr-2", orgId: "org-1", outletId: "out-1", outletName: "Tan Coffee - Sector 82A",
    type: "lease_loi", status: "active", documentFilename: "TanCoffee_Sector82A_Lease.pdf",
    extractionStatus: "confirmed", lessorName: "Rahul Properties", lesseeName: "Tan Coffee India Pvt Ltd",
    brandName: "Tan Coffee",
    leaseCommencementDate: "2025-01-01", rentCommencementDate: "2025-03-01",
    leaseExpiryDate: "2031-01-01", lockInEndDate: "2027-01-01",
    rentModel: "fixed", monthlyRent: 85000, rentPerSqft: 100,
    camMonthly: 25500, totalMonthlyOutflow: 110500, securityDeposit: 510000,
    escalationPct: 10, escalationFrequencyYears: 3,
    riskFlags: [],
    createdAt: "2025-06-01", confirmedAt: "2025-06-02",
  },
  {
    id: "agr-3", orgId: "org-1", outletId: "out-2", outletName: "Tan Coffee - DLF Cyber Hub",
    type: "lease_loi", status: "active", documentFilename: "TanCoffee_CyberHub_Lease.pdf",
    extractionStatus: "confirmed", lessorName: "DLF Ltd", lesseeName: "Tan Coffee India Pvt Ltd",
    brandName: "Tan Coffee",
    leaseCommencementDate: "2025-03-01", rentCommencementDate: "2025-05-01",
    leaseExpiryDate: "2031-03-01", lockInEndDate: "2027-03-01",
    rentModel: "hybrid_mglr", monthlyRent: 120000, rentPerSqft: 202,
    camMonthly: 35000, totalMonthlyOutflow: 155000, securityDeposit: 720000,
    escalationPct: 15, escalationFrequencyYears: 3,
    riskFlags: [
      { id: 1, name: "No lessor lock-in", severity: "high", explanation: "Lessor can terminate but lessee is locked in for 24 months", clauseText: "The Lessor may terminate the agreement by providing 6 months notice..." },
      { id: 2, name: "High escalation", severity: "high", explanation: "Escalation is 15% every 3 years", clauseText: "Rent shall escalate by 15% every 3 years from rent commencement..." },
    ],
    createdAt: "2025-06-15", confirmedAt: "2025-06-16",
  },
  {
    id: "agr-4", orgId: "org-2", outletId: "out-4", outletName: "GFB - Connaught Place",
    type: "lease_loi", status: "expiring", documentFilename: "GFB_CP_Lease.pdf",
    extractionStatus: "confirmed", lessorName: "CP Properties Ltd", lesseeName: "Good Flippin Foods Pvt Ltd",
    brandName: "Good Flippin' Burgers",
    leaseCommencementDate: "2023-04-01", rentCommencementDate: "2023-06-01",
    leaseExpiryDate: "2026-04-01", lockInEndDate: "2025-04-01",
    rentModel: "fixed", monthlyRent: 145000, rentPerSqft: 186,
    camMonthly: 28000, totalMonthlyOutflow: 173000, securityDeposit: 870000,
    escalationPct: 12, escalationFrequencyYears: 1,
    riskFlags: [
      { id: 7, name: "No renewal option", severity: "medium", explanation: "No renewal clause found — renewal at sole discretion of lessor", clauseText: "Upon expiry, lessor may renew at prevailing market rates at their discretion." },
    ],
    createdAt: "2025-07-15", confirmedAt: "2025-07-16",
  },
  {
    id: "agr-5", orgId: "org-3", outletId: "out-5", outletName: "Boba Bhai - Indiranagar",
    type: "lease_loi", status: "active", documentFilename: "BobaBhai_Indiranagar_Lease.pdf",
    extractionStatus: "confirmed", lessorName: "Indiranagar Properties", lesseeName: "Boba Bhai Foods LLP",
    brandName: "Boba Bhai",
    leaseCommencementDate: "2025-06-01", rentCommencementDate: "2025-08-01",
    leaseExpiryDate: "2031-06-01", lockInEndDate: "2027-06-01",
    rentModel: "fixed", monthlyRent: 52000, rentPerSqft: 124,
    camMonthly: 12000, totalMonthlyOutflow: 64000, securityDeposit: 312000,
    escalationPct: 10, escalationFrequencyYears: 3,
    riskFlags: [],
    createdAt: "2025-08-01", confirmedAt: "2025-08-02",
  },
  {
    id: "agr-6", orgId: "org-4", outletId: "out-7", outletName: "Glutokai - Saket",
    type: "lease_loi", status: "active", documentFilename: "Glutokai_Saket_Lease.pdf",
    extractionStatus: "confirmed", lessorName: "Select Infrastructure Pvt Ltd", lesseeName: "Glutokai Foods Pvt Ltd",
    brandName: "Glutokai",
    leaseCommencementDate: "2025-02-01", rentCommencementDate: "2025-04-01",
    leaseExpiryDate: "2031-02-01", lockInEndDate: "2027-02-01",
    rentModel: "revenue_share", monthlyRent: 97500, rentPerSqft: 150,
    camMonthly: 45000, totalMonthlyOutflow: 142500, securityDeposit: 585000,
    escalationPct: 15, escalationFrequencyYears: 3,
    riskFlags: [
      { id: 8, name: "Uncapped revenue share", severity: "medium", explanation: "Revenue share with no cap", clauseText: "18% of gross sales revenue..." },
      { id: 4, name: "Excessive security deposit", severity: "medium", explanation: "Security deposit is 6 months rent", clauseText: "Security deposit equal to 6 months of lease rent..." },
    ],
    createdAt: "2025-05-20", confirmedAt: "2025-05-21",
  },
  {
    id: "agr-7", orgId: "org-2", outletId: "out-12", outletName: "GFB - Mayur Vihar",
    type: "license_certificate", status: "active", documentFilename: "GFB_MayurVihar_DPCC.pdf",
    extractionStatus: "confirmed", lessorName: "", lesseeName: "Good Flippin Foods Pvt Ltd",
    brandName: "Good Flippin' Burgers",
    leaseCommencementDate: "", rentCommencementDate: "",
    leaseExpiryDate: "2035-07-22", lockInEndDate: "",
    rentModel: "fixed", monthlyRent: 0, rentPerSqft: 0,
    camMonthly: 0, totalMonthlyOutflow: 0, securityDeposit: 0,
    escalationPct: 0, escalationFrequencyYears: 0,
    riskFlags: [],
    createdAt: "2025-10-01", confirmedAt: "2025-10-02",
  },
  {
    id: "agr-8", orgId: "org-5", outletId: "out-9", outletName: "Burgerama - Sector 29",
    type: "lease_loi", status: "active", documentFilename: "Burgerama_Sec29_Lease.pdf",
    extractionStatus: "review", lessorName: "Sector 29 Commercial", lesseeName: "Burgerama India Pvt Ltd",
    brandName: "Burgerama",
    leaseCommencementDate: "2025-06-01", rentCommencementDate: "2025-08-01",
    leaseExpiryDate: "2031-06-01", lockInEndDate: "2027-06-01",
    rentModel: "fixed", monthlyRent: 72000, rentPerSqft: 120,
    camMonthly: 18000, totalMonthlyOutflow: 90000, securityDeposit: 432000,
    escalationPct: 10, escalationFrequencyYears: 3,
    riskFlags: [
      { id: 3, name: "No rent-free fit-out", severity: "medium", explanation: "No rent-free period mentioned", clauseText: "Rent commences from date of handover..." },
    ],
    createdAt: "2025-08-20", confirmedAt: null,
  },
];

export const paymentRecords: PaymentRecord[] = [
  { id: "pay-1", obligationId: "obl-1", outletId: "out-3", outletName: "GFB - Felix Plaza", type: "rent", periodMonth: 2, periodYear: 2026, dueDate: "2026-02-07", dueAmount: 53460, status: "due", paidAmount: null, paidAt: null },
  { id: "pay-2", obligationId: "obl-2", outletId: "out-3", outletName: "GFB - Felix Plaza", type: "cam", periodMonth: 2, periodYear: 2026, dueDate: "2026-02-07", dueAmount: 41580, status: "due", paidAmount: null, paidAt: null },
  { id: "pay-3", obligationId: "obl-3", outletId: "out-1", outletName: "Tan Coffee - Sector 82A", type: "rent", periodMonth: 2, periodYear: 2026, dueDate: "2026-02-05", dueAmount: 85000, status: "paid", paidAmount: 85000, paidAt: "2026-02-04" },
  { id: "pay-4", obligationId: "obl-4", outletId: "out-1", outletName: "Tan Coffee - Sector 82A", type: "cam", periodMonth: 2, periodYear: 2026, dueDate: "2026-02-05", dueAmount: 25500, status: "paid", paidAmount: 25500, paidAt: "2026-02-04" },
  { id: "pay-5", obligationId: "obl-5", outletId: "out-2", outletName: "Tan Coffee - DLF Cyber Hub", type: "rent", periodMonth: 2, periodYear: 2026, dueDate: "2026-02-07", dueAmount: 120000, status: "overdue", paidAmount: null, paidAt: null },
  { id: "pay-6", obligationId: "obl-6", outletId: "out-2", outletName: "Tan Coffee - DLF Cyber Hub", type: "cam", periodMonth: 2, periodYear: 2026, dueDate: "2026-02-07", dueAmount: 35000, status: "overdue", paidAmount: null, paidAt: null },
  { id: "pay-7", obligationId: "obl-7", outletId: "out-4", outletName: "GFB - Connaught Place", type: "rent", periodMonth: 2, periodYear: 2026, dueDate: "2026-02-01", dueAmount: 145000, status: "overdue", paidAmount: null, paidAt: null },
  { id: "pay-8", obligationId: "obl-8", outletId: "out-5", outletName: "Boba Bhai - Indiranagar", type: "rent", periodMonth: 2, periodYear: 2026, dueDate: "2026-02-10", dueAmount: 52000, status: "due", paidAmount: null, paidAt: null },
  { id: "pay-9", obligationId: "obl-9", outletId: "out-7", outletName: "Glutokai - Saket", type: "rent", periodMonth: 2, periodYear: 2026, dueDate: "2026-02-05", dueAmount: 97500, status: "paid", paidAmount: 97500, paidAt: "2026-02-05" },
  { id: "pay-10", obligationId: "obl-10", outletId: "out-7", outletName: "Glutokai - Saket", type: "cam", periodMonth: 2, periodYear: 2026, dueDate: "2026-02-05", dueAmount: 45000, status: "paid", paidAmount: 45000, paidAt: "2026-02-05" },
  { id: "pay-11", obligationId: "obl-11", outletId: "out-9", outletName: "Burgerama - Sector 29", type: "rent", periodMonth: 2, periodYear: 2026, dueDate: "2026-02-07", dueAmount: 72000, status: "due", paidAmount: null, paidAt: null },
  { id: "pay-12", obligationId: "obl-12", outletId: "out-8", outletName: "Glutokai - Khan Market", type: "rent", periodMonth: 1, periodYear: 2026, dueDate: "2026-01-05", dueAmount: 110000, status: "overdue", paidAmount: null, paidAt: null },
  { id: "pay-13", obligationId: "obl-13", outletId: "out-11", outletName: "Tan Coffee - Aerocity", type: "rent", periodMonth: 2, periodYear: 2026, dueDate: "2026-02-07", dueAmount: 95000, status: "upcoming", paidAmount: null, paidAt: null },
  { id: "pay-14", obligationId: "obl-14", outletId: "out-12", outletName: "GFB - Mayur Vihar", type: "rent", periodMonth: 2, periodYear: 2026, dueDate: "2026-02-10", dueAmount: 55000, status: "upcoming", paidAmount: null, paidAt: null },
  { id: "pay-15", obligationId: "obl-15", outletId: "out-4", outletName: "GFB - Connaught Place", type: "cam", periodMonth: 2, periodYear: 2026, dueDate: "2026-02-01", dueAmount: 28000, status: "overdue", paidAmount: null, paidAt: null },
  { id: "pay-16", obligationId: "obl-16", outletId: "out-12", outletName: "GFB - Mayur Vihar", type: "cam", periodMonth: 2, periodYear: 2026, dueDate: "2026-02-10", dueAmount: 14000, status: "upcoming", paidAmount: null, paidAt: null },
];

export const alerts: Alert[] = [
  { id: "alt-1", orgId: "org-2", outletId: "out-4", outletName: "GFB - Connaught Place", agreementId: "agr-4", type: "lease_expiry", severity: "high", title: "Lease Expiring Soon", message: "Lease expires on April 1, 2026 — 38 days remaining", triggerDate: "2026-02-22", status: "sent", createdAt: "2026-02-22" },
  { id: "alt-2", orgId: "org-1", outletId: "out-2", outletName: "Tan Coffee - DLF Cyber Hub", agreementId: "agr-3", type: "rent_due", severity: "high", title: "Rent Overdue", message: "February rent of Rs 1,20,000 is overdue since Feb 7", triggerDate: "2026-02-15", status: "sent", createdAt: "2026-02-15" },
  { id: "alt-3", orgId: "org-4", outletId: "out-8", outletName: "Glutokai - Khan Market", agreementId: "agr-6", type: "rent_due", severity: "high", title: "Rent Overdue", message: "January rent of Rs 1,10,000 is overdue since Jan 5", triggerDate: "2026-01-12", status: "sent", createdAt: "2026-01-12" },
  { id: "alt-4", orgId: "org-2", outletId: "out-3", outletName: "GFB - Felix Plaza", agreementId: "agr-1", type: "escalation", severity: "medium", title: "Escalation Coming", message: "15% rent escalation due on Oct 4, 2027", triggerDate: "2026-07-04", status: "pending", createdAt: "2026-02-22" },
  { id: "alt-5", orgId: "org-1", outletId: "out-11", outletName: "Tan Coffee - Aerocity", agreementId: "agr-2", type: "rent_due", severity: "medium", title: "Rent Due This Week", message: "February rent of Rs 95,000 due on Feb 7", triggerDate: "2026-02-22", status: "sent", createdAt: "2026-02-22" },
  { id: "alt-6", orgId: "org-3", outletId: "out-5", outletName: "Boba Bhai - Indiranagar", agreementId: "agr-5", type: "rent_due", severity: "medium", title: "Rent Due Soon", message: "February rent of Rs 52,000 due on Feb 10", triggerDate: "2026-02-22", status: "sent", createdAt: "2026-02-22" },
  { id: "alt-7", orgId: "org-2", outletId: "out-4", outletName: "GFB - Connaught Place", agreementId: "agr-4", type: "renewal_window", severity: "high", title: "Renewal Window Open", message: "Lock-in expired. Initiate renewal discussions before lease expiry on Apr 1, 2026", triggerDate: "2026-01-01", status: "acknowledged", createdAt: "2026-01-01" },
  { id: "alt-8", orgId: "org-5", outletId: "out-9", outletName: "Burgerama - Sector 29", agreementId: "agr-8", type: "cam_due", severity: "low", title: "CAM Due", message: "February CAM of Rs 18,000 due on Feb 7", triggerDate: "2026-02-22", status: "pending", createdAt: "2026-02-22" },
  { id: "alt-9", orgId: "org-2", outletId: "out-12", outletName: "GFB - Mayur Vihar", agreementId: "agr-7", type: "license_expiry", severity: "medium", title: "License Expiring", message: "DPCC license expires on Jul 22, 2035", triggerDate: "2035-01-22", status: "pending", createdAt: "2026-02-22" },
  { id: "alt-10", orgId: "org-1", outletId: "out-1", outletName: "Tan Coffee - Sector 82A", agreementId: "agr-2", type: "lock_in_expiry", severity: "medium", title: "Lock-in Expiring", message: "Lock-in period ends Jan 1, 2027 — 313 days remaining", triggerDate: "2026-04-01", status: "pending", createdAt: "2026-02-22" },
];

// Helper functions
export function getOutletsByOrg(orgId: string) {
  return outlets.filter((o) => o.orgId === orgId);
}

export function getAgreementsByOutlet(outletId: string) {
  return agreements.filter((a) => a.outletId === outletId);
}

export function getPaymentsByOutlet(outletId: string) {
  return paymentRecords.filter((p) => p.outletId === outletId);
}

export function getAlertsByOrg(orgId: string) {
  return alerts.filter((a) => a.orgId === orgId);
}

export function formatCurrency(amount: number): string {
  if (amount >= 10000000) return `Rs ${(amount / 10000000).toFixed(2)} Cr`;
  if (amount >= 100000) return `Rs ${(amount / 100000).toFixed(2)} L`;
  return `Rs ${amount.toLocaleString("en-IN")}`;
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const today = new Date("2026-02-22");
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function statusColor(status: string): string {
  const map: Record<string, string> = {
    operational: "bg-emerald-100 text-emerald-800",
    active: "bg-emerald-100 text-emerald-800",
    pipeline: "bg-blue-100 text-blue-800",
    fit_out: "bg-amber-100 text-amber-800",
    up_for_renewal: "bg-orange-100 text-orange-800",
    expiring: "bg-orange-100 text-orange-800",
    renewed: "bg-teal-100 text-teal-800",
    closed: "bg-neutral-200 text-neutral-600",
    expired: "bg-red-100 text-red-800",
    terminated: "bg-red-100 text-red-800",
    draft: "bg-neutral-100 text-neutral-600",
    confirmed: "bg-emerald-100 text-emerald-800",
    review: "bg-amber-100 text-amber-800",
    processing: "bg-blue-100 text-blue-800",
    pending: "bg-neutral-100 text-neutral-600",
    paid: "bg-emerald-100 text-emerald-800",
    due: "bg-amber-100 text-amber-800",
    overdue: "bg-red-100 text-red-800",
    upcoming: "bg-blue-100 text-blue-800",
    partially_paid: "bg-yellow-100 text-yellow-800",
    sent: "bg-blue-100 text-blue-800",
    acknowledged: "bg-emerald-100 text-emerald-800",
    snoozed: "bg-neutral-100 text-neutral-600",
    high: "bg-red-100 text-red-700",
    medium: "bg-amber-100 text-amber-700",
    low: "bg-blue-100 text-blue-700",
    info: "bg-neutral-100 text-neutral-600",
  };
  return map[status] || "bg-neutral-100 text-neutral-600";
}

export function statusLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Dashboard computed stats
export function getDashboardStats() {
  const totalOutlets = outlets.length;
  const totalBrands = organizations.length;
  const activeAgreements = agreements.filter((a) => a.status === "active" || a.status === "expiring").length;
  const monthlyExposure = agreements
    .filter((a) => a.status === "active" || a.status === "expiring")
    .reduce((sum, a) => sum + a.totalMonthlyOutflow, 0);
  const overduePayments = paymentRecords.filter((p) => p.status === "overdue");
  const overdueAmount = overduePayments.reduce((sum, p) => sum + p.dueAmount, 0);
  const overdueCount = overduePayments.length;
  const dueThisWeek = paymentRecords.filter((p) => p.status === "due");
  const dueThisWeekAmount = dueThisWeek.reduce((sum, p) => sum + p.dueAmount, 0);
  const totalRiskFlags = agreements.reduce((sum, a) => sum + a.riskFlags.length, 0);
  const highRiskFlags = agreements.reduce((sum, a) => sum + a.riskFlags.filter((f) => f.severity === "high").length, 0);

  return {
    totalOutlets,
    totalBrands,
    activeAgreements,
    monthlyExposure,
    overdueAmount,
    overdueCount,
    dueThisWeekAmount,
    dueThisWeekCount: dueThisWeek.length,
    totalRiskFlags,
    highRiskFlags,
  };
}
