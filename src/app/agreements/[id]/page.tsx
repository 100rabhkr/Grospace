"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  FileText,
  AlertTriangle,
  ShieldAlert,
  CalendarClock,
  MessageSquare,
  Send,
  ClipboardList,
  Bot,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  agreements,
  outlets,
  formatCurrency,
  formatDate,
  daysUntil,
  statusColor,
  statusLabel,
} from "@/lib/mock-data";
import type { Agreement } from "@/lib/mock-data";

// Build extracted data sections dynamically from agreement
function buildExtractedSections(agr: Agreement) {
  const outlet = outlets.find((o) => o.id === agr.outletId);

  return [
    {
      title: "Parties",
      fields: [
        { label: "Lessor", value: agr.lessorName || "--" },
        { label: "Lessee", value: agr.lesseeName },
        { label: "Brand", value: agr.brandName },
        { label: "Franchise Model", value: outlet?.franchiseModel?.toUpperCase() || "--" },
      ],
    },
    {
      title: "Premises",
      fields: [
        { label: "Address", value: outlet?.address || "--" },
        { label: "Floor", value: outlet?.floor || "--" },
        { label: "Unit Number", value: outlet?.unitNumber || "--" },
        { label: "Super Area (sqft)", value: outlet?.superAreaSqft?.toLocaleString("en-IN") || "--" },
        { label: "Covered Area (sqft)", value: outlet?.coveredAreaSqft?.toLocaleString("en-IN") || "--" },
        { label: "Property Type", value: outlet?.propertyType ? statusLabel(outlet.propertyType) : "--" },
      ],
    },
    {
      title: "Lease Term",
      fields: [
        { label: "Lease Commencement", value: formatDate(agr.leaseCommencementDate) },
        { label: "Rent Commencement", value: formatDate(agr.rentCommencementDate) },
        { label: "Lease Expiry", value: formatDate(agr.leaseExpiryDate) },
        { label: "Lock-in End", value: formatDate(agr.lockInEndDate) },
        {
          label: "Days to Expiry",
          value: agr.leaseExpiryDate
            ? `${daysUntil(agr.leaseExpiryDate)} days`
            : "--",
        },
      ],
    },
    {
      title: "Rent",
      fields: [
        { label: "Rent Model", value: statusLabel(agr.rentModel) },
        { label: "Monthly Rent", value: agr.monthlyRent ? formatCurrency(agr.monthlyRent) : "--" },
        { label: "Rent per Sqft", value: agr.rentPerSqft ? `Rs ${agr.rentPerSqft}` : "--" },
        { label: "Total Monthly Outflow", value: agr.totalMonthlyOutflow ? formatCurrency(agr.totalMonthlyOutflow) : "--" },
      ],
    },
    {
      title: "Charges",
      fields: [
        { label: "CAM Monthly", value: agr.camMonthly ? formatCurrency(agr.camMonthly) : "--" },
        { label: "Escalation", value: agr.escalationPct ? `${agr.escalationPct}% every ${agr.escalationFrequencyYears} year${agr.escalationFrequencyYears > 1 ? "s" : ""}` : "--" },
      ],
    },
    {
      title: "Deposits",
      fields: [
        { label: "Security Deposit", value: agr.securityDeposit ? formatCurrency(agr.securityDeposit) : "--" },
      ],
    },
    {
      title: "Legal",
      fields: [
        { label: "Document", value: agr.documentFilename },
        { label: "Extraction Status", value: statusLabel(agr.extractionStatus) },
        { label: "Confirmed At", value: agr.confirmedAt ? formatDate(agr.confirmedAt) : "Not confirmed" },
      ],
    },
  ];
}

// Build obligations from agreement data
function buildObligations(agr: Agreement) {
  const obligations = [];

  if (agr.monthlyRent > 0) {
    obligations.push({
      id: 1,
      type: "Rent",
      frequency: "Monthly",
      amount: formatCurrency(agr.monthlyRent),
      dueDay: "7th of month",
      startDate: formatDate(agr.rentCommencementDate),
      endDate: formatDate(agr.leaseExpiryDate),
      status: "Active",
    });
  }

  if (agr.camMonthly > 0) {
    obligations.push({
      id: 2,
      type: "CAM",
      frequency: "Monthly",
      amount: formatCurrency(agr.camMonthly),
      dueDay: "7th of month",
      startDate: formatDate(agr.rentCommencementDate),
      endDate: formatDate(agr.leaseExpiryDate),
      status: "Active",
    });
  }

  if (agr.securityDeposit > 0) {
    obligations.push({
      id: 3,
      type: "Security Deposit",
      frequency: "One-time",
      amount: formatCurrency(agr.securityDeposit),
      dueDay: "On signing",
      startDate: formatDate(agr.leaseCommencementDate),
      endDate: "--",
      status: "Paid",
    });
  }

  if (agr.escalationPct > 0) {
    const commDate = new Date(agr.rentCommencementDate);
    const escalationDate = new Date(commDate);
    escalationDate.setFullYear(escalationDate.getFullYear() + agr.escalationFrequencyYears);
    obligations.push({
      id: 4,
      type: "Rent Escalation",
      frequency: `Every ${agr.escalationFrequencyYears} year${agr.escalationFrequencyYears > 1 ? "s" : ""}`,
      amount: `+${agr.escalationPct}%`,
      dueDay: formatDate(escalationDate.toISOString().split("T")[0]),
      startDate: formatDate(agr.rentCommencementDate),
      endDate: formatDate(agr.leaseExpiryDate),
      status: "Upcoming",
    });
  }

  obligations.push({
    id: 5,
    type: "Electricity",
    frequency: "Monthly",
    amount: "Actual (metered)",
    dueDay: "As billed",
    startDate: formatDate(agr.rentCommencementDate),
    endDate: formatDate(agr.leaseExpiryDate),
    status: "Active",
  });

  return obligations;
}

// Sample Q&A conversation
const sampleConversation = [
  {
    role: "user" as const,
    message: "What is the lock-in period for this lease?",
  },
  {
    role: "assistant" as const,
    message:
      "Based on the agreement, the lock-in period runs from the lease commencement date (4 Oct 2024) until 3 Oct 2026, which is a 2-year lock-in period. During this time, the lessee cannot terminate the agreement without penalty. The lessor also has a lock-in commitment for the same duration.",
  },
  {
    role: "user" as const,
    message: "Can the rent be increased during the lock-in period?",
  },
  {
    role: "assistant" as const,
    message:
      "No. The agreement specifies that rent escalation of 15% occurs every 3 years from the rent commencement date (4 Dec 2024). This means the first escalation will apply on 4 Dec 2027, which is after the lock-in period ends on 3 Oct 2026. So during the lock-in period, the monthly base rent of Rs 53,460 remains unchanged.",
  },
  {
    role: "user" as const,
    message: "What happens if the lessee wants to exit early?",
  },
  {
    role: "assistant" as const,
    message:
      "During the lock-in period (until 3 Oct 2026), early termination by the lessee would likely result in forfeiture of the security deposit of Rs 7,84,080. After the lock-in period, the lessee must provide 6 months written notice to terminate. The agreement does not explicitly mention an early exit penalty beyond the lock-in forfeiture, but the security deposit may be at risk if notice requirements are not met.",
  },
];

export default function AgreementDetailPage() {
  const params = useParams();
  const agreementId = params.id as string;
  const agreement = agreements.find((a) => a.id === agreementId);

  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState(sampleConversation);

  if (!agreement) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
        <FileText className="h-12 w-12 text-neutral-300" />
        <h2 className="text-lg font-semibold">Agreement not found</h2>
        <p className="text-sm text-muted-foreground">
          The agreement with ID &quot;{agreementId}&quot; does not exist.
        </p>
        <Link href="/agreements">
          <Button variant="outline" className="gap-2">
            <ChevronLeft className="h-4 w-4" />
            Back to Agreements
          </Button>
        </Link>
      </div>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const outlet = outlets.find((o) => o.id === agreement.outletId);
  const sections = buildExtractedSections(agreement);
  const obligations = buildObligations(agreement);

  const typeLabels: Record<string, string> = {
    lease_loi: "Lease / LOI",
    license_certificate: "License Certificate",
    franchise_agreement: "Franchise Agreement",
  };

  function handleSendMessage() {
    if (!chatInput.trim()) return;
    const newMessages = [
      ...chatMessages,
      { role: "user" as const, message: chatInput.trim() },
      {
        role: "assistant" as const,
        message:
          "I can help answer that. Let me review the relevant clauses in the agreement. Based on the extracted data and the original document, the answer to your question involves multiple provisions that I am currently analyzing. Please note that this is a simulated response for demonstration purposes.",
      },
    ];
    setChatMessages(newMessages);
    setChatInput("");
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <Link href="/agreements">
            <Button variant="ghost" size="sm" className="gap-1 mt-0.5">
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-xs font-medium">
                {typeLabels[agreement.type] || agreement.type}
              </Badge>
              <Badge
                className={`${statusColor(agreement.status)} border-0 text-xs font-medium`}
              >
                {statusLabel(agreement.status)}
              </Badge>
              {agreement.riskFlags.length > 0 && (
                <Badge
                  className={`${
                    agreement.riskFlags.some((f) => f.severity === "high")
                      ? "bg-red-100 text-red-700"
                      : "bg-amber-100 text-amber-700"
                  } border-0 text-xs font-medium gap-1`}
                >
                  <AlertTriangle className="h-3 w-3" />
                  {agreement.riskFlags.length} Risk Flag{agreement.riskFlags.length !== 1 ? "s" : ""}
                </Badge>
              )}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {agreement.outletName}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {agreement.lessorName && (
                <>
                  <span className="font-medium text-black">Lessor:</span>{" "}
                  {agreement.lessorName}
                  {" | "}
                </>
              )}
              <span className="font-medium text-black">Lessee:</span>{" "}
              {agreement.lesseeName}
              {" | "}
              <span className="font-medium text-black">Document:</span>{" "}
              {agreement.documentFilename}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="extracted" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5 max-w-2xl">
          <TabsTrigger value="extracted" className="gap-1.5 text-xs sm:text-sm">
            <ClipboardList className="h-3.5 w-3.5 hidden sm:block" />
            Extracted Data
          </TabsTrigger>
          <TabsTrigger value="risks" className="gap-1.5 text-xs sm:text-sm">
            <ShieldAlert className="h-3.5 w-3.5 hidden sm:block" />
            Risk Flags
          </TabsTrigger>
          <TabsTrigger value="obligations" className="gap-1.5 text-xs sm:text-sm">
            <CalendarClock className="h-3.5 w-3.5 hidden sm:block" />
            Obligations
          </TabsTrigger>
          <TabsTrigger value="document" className="gap-1.5 text-xs sm:text-sm">
            <FileText className="h-3.5 w-3.5 hidden sm:block" />
            Document
          </TabsTrigger>
          <TabsTrigger value="qa" className="gap-1.5 text-xs sm:text-sm">
            <MessageSquare className="h-3.5 w-3.5 hidden sm:block" />
            Q&A
          </TabsTrigger>
        </TabsList>

        {/* Extracted Data Tab */}
        <TabsContent value="extracted">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {sections.map((section) => (
              <Card key={section.title}>
                <CardContent className="pt-4 pb-3">
                  <h3 className="text-sm font-semibold mb-3 text-black border-b pb-2">
                    {section.title}
                  </h3>
                  <div className="space-y-2.5">
                    {section.fields.map((field) => (
                      <div key={field.label}>
                        <p className="text-xs text-muted-foreground">{field.label}</p>
                        <p className="text-sm font-medium text-black">{field.value}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Risk Flags Tab */}
        <TabsContent value="risks">
          {agreement.riskFlags.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <ShieldAlert className="h-10 w-10 text-emerald-400 mb-3" />
                <h3 className="text-base font-semibold mb-1">No Risk Flags Detected</h3>
                <p className="text-sm text-muted-foreground">
                  The AI analysis did not detect any risk flags in this agreement.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {agreement.riskFlags.map((flag) => (
                <Card
                  key={flag.id}
                  className={`border-l-4 ${
                    flag.severity === "high"
                      ? "border-l-red-500"
                      : "border-l-amber-500"
                  }`}
                >
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <AlertTriangle
                          className={`h-4 w-4 flex-shrink-0 ${
                            flag.severity === "high"
                              ? "text-red-600"
                              : "text-amber-600"
                          }`}
                        />
                        <h3 className="text-sm font-semibold text-black">
                          {flag.name}
                        </h3>
                      </div>
                      <Badge
                        className={`${statusColor(flag.severity)} border-0 text-xs font-semibold`}
                      >
                        {flag.severity === "high" ? "High" : "Medium"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      {flag.explanation}
                    </p>
                    <div className="bg-neutral-50 border rounded-md p-3">
                      <p className="text-xs text-muted-foreground mb-1 font-medium">
                        Referenced Clause
                      </p>
                      <p className="text-sm text-black italic">
                        &ldquo;{flag.clauseText}&rdquo;
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Obligations Tab */}
        <TabsContent value="obligations">
          <Card>
            <div className="rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Type</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Due Date / Trigger</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>End Date</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {obligations.map((obl) => (
                    <TableRow key={obl.id}>
                      <TableCell className="font-medium text-sm">
                        {obl.type}
                      </TableCell>
                      <TableCell className="text-sm">{obl.frequency}</TableCell>
                      <TableCell className="text-sm text-right font-medium">
                        {obl.amount}
                      </TableCell>
                      <TableCell className="text-sm">{obl.dueDay}</TableCell>
                      <TableCell className="text-sm">{obl.startDate}</TableCell>
                      <TableCell className="text-sm">{obl.endDate}</TableCell>
                      <TableCell>
                        <Badge
                          className={`border-0 text-xs font-medium ${
                            obl.status === "Active"
                              ? "bg-emerald-100 text-emerald-800"
                              : obl.status === "Paid"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {obl.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* Document Tab */}
        <TabsContent value="document">
          <Card className="min-h-[500px] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-red-600" />
                <span className="text-sm font-medium">
                  {agreement.documentFilename}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">PDF</Badge>
                <Button variant="outline" size="sm" className="text-xs h-7">
                  Download
                </Button>
              </div>
            </div>
            <CardContent className="flex-1 flex items-center justify-center bg-neutral-50">
              <div className="text-center space-y-3">
                <FileText className="h-20 w-20 text-neutral-300 mx-auto" />
                <div>
                  <p className="text-base font-medium text-neutral-500">
                    PDF Viewer
                  </p>
                  <p className="text-sm text-muted-foreground">
                    The original agreement document will be rendered here
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {agreement.documentFilename}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Q&A Tab */}
        <TabsContent value="qa">
          <Card className="flex flex-col h-[calc(100vh-340px)] min-h-[500px]">
            {/* Chat Header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b">
              <MessageSquare className="h-4 w-4" />
              <span className="text-sm font-medium">
                Ask questions about this agreement
              </span>
              <Badge variant="secondary" className="text-xs ml-auto">
                AI-Powered
              </Badge>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Welcome message */}
              <div className="flex items-start gap-3">
                <div className="h-7 w-7 rounded-full bg-black flex items-center justify-center flex-shrink-0">
                  <Bot className="h-4 w-4 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground mb-1">GroSpace AI</p>
                  <div className="bg-neutral-100 rounded-lg rounded-tl-none p-3 max-w-[85%]">
                    <p className="text-sm">
                      I have analyzed the agreement for{" "}
                      <span className="font-semibold">{agreement.outletName}</span>.
                      You can ask me anything about the lease terms, clauses,
                      obligations, or any specific provisions in this document.
                    </p>
                  </div>
                </div>
              </div>

              {/* Conversation */}
              {chatMessages.map((msg, i) => (
                <div key={i} className="flex items-start gap-3">
                  {msg.role === "assistant" ? (
                    <div className="h-7 w-7 rounded-full bg-black flex items-center justify-center flex-shrink-0">
                      <Bot className="h-4 w-4 text-white" />
                    </div>
                  ) : (
                    <div className="h-7 w-7 rounded-full bg-neutral-200 flex items-center justify-center flex-shrink-0">
                      <User className="h-4 w-4 text-neutral-600" />
                    </div>
                  )}
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground mb-1">
                      {msg.role === "assistant" ? "GroSpace AI" : "You"}
                    </p>
                    <div
                      className={`rounded-lg p-3 max-w-[85%] ${
                        msg.role === "assistant"
                          ? "bg-neutral-100 rounded-tl-none"
                          : "bg-black text-white rounded-tr-none ml-auto"
                      }`}
                    >
                      <p className="text-sm">{msg.message}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Chat Input */}
            <div className="border-t p-3">
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Ask a question about this agreement..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  className="flex-1"
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!chatInput.trim()}
                  size="sm"
                  className="gap-1.5 h-9 px-4"
                >
                  <Send className="h-3.5 w-3.5" />
                  Send
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Responses are generated from the extracted agreement data and original document. Always verify critical information.
              </p>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
