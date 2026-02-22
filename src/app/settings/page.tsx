"use client";

import { useState } from "react";
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
  Settings,
  Users,
  Bell,
  User,
  Shield,
  Mail,
  Upload,
  Trash2,
  MoreHorizontal,
  Calendar,
  Save,
  Check,
} from "lucide-react";
import { organizations, formatDate } from "@/lib/mock-data";

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: "platform_admin" | "org_admin" | "org_member";
  status: "active" | "invited";
};

type AlertPreference = {
  key: string;
  label: string;
  daysBefore: number;
};

// -------------------------------------------------------------------
// Sample Data
// -------------------------------------------------------------------

const initialTeamMembers: TeamMember[] = [
  {
    id: "user-1",
    name: "Srabhjot Singh",
    email: "srabhjot@grospace.in",
    role: "platform_admin",
    status: "active",
  },
  {
    id: "user-2",
    name: "Aryan Budukh",
    email: "aryan@grospace.in",
    role: "org_admin",
    status: "active",
  },
  {
    id: "user-3",
    name: "Priya Sharma",
    email: "priya@tancoffee.in",
    role: "org_member",
    status: "active",
  },
  {
    id: "user-4",
    name: "Rahul Gupta",
    email: "rahul@tancoffee.in",
    role: "org_member",
    status: "invited",
  },
];

const initialAlertPreferences: AlertPreference[] = [
  { key: "rent_due", label: "Rent Due", daysBefore: 7 },
  { key: "cam_due", label: "CAM Due", daysBefore: 7 },
  { key: "escalation", label: "Escalation Coming", daysBefore: 90 },
  { key: "lease_expiry", label: "Lease Expiry", daysBefore: 180 },
  { key: "license_expiry", label: "License Expiry", daysBefore: 180 },
  { key: "lock_in_expiry", label: "Lock-in Expiry", daysBefore: 90 },
  { key: "renewal_window", label: "Renewal Window", daysBefore: 30 },
];

// -------------------------------------------------------------------
// Helper: get initials from name
// -------------------------------------------------------------------

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

// -------------------------------------------------------------------
// Role badge helper
// -------------------------------------------------------------------

function roleBadge(role: TeamMember["role"]) {
  const config: Record<TeamMember["role"], { label: string; className: string }> = {
    platform_admin: {
      label: "Platform Admin",
      className: "bg-black text-white",
    },
    org_admin: {
      label: "Org Admin",
      className: "bg-blue-100 text-blue-800",
    },
    org_member: {
      label: "Org Member",
      className: "bg-neutral-100 text-neutral-700",
    },
  };
  const c = config[role];
  return <Badge className={c.className}>{c.label}</Badge>;
}

function statusBadge(status: TeamMember["status"]) {
  const config: Record<TeamMember["status"], { label: string; className: string }> = {
    active: {
      label: "Active",
      className: "bg-emerald-100 text-emerald-800",
    },
    invited: {
      label: "Invited",
      className: "bg-amber-100 text-amber-800",
    },
  };
  const c = config[status];
  return (
    <Badge variant="secondary" className={c.className}>
      {c.label}
    </Badge>
  );
}

// -------------------------------------------------------------------
// Page Component
// -------------------------------------------------------------------

export default function SettingsPage() {
  // Organization state
  const [orgName, setOrgName] = useState("Tan Coffee");
  const [orgSaved, setOrgSaved] = useState(false);

  // Team members state
  const [teamMembers] = useState<TeamMember[]>(initialTeamMembers);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("org_member");

  // Alert preferences state
  const [alertPrefs, setAlertPrefs] = useState<AlertPreference[]>(
    initialAlertPreferences
  );
  const [emailDigestEnabled, setEmailDigestEnabled] = useState(true);
  const [alertsSaved, setAlertsSaved] = useState(false);

  // Account state
  const [accountName, setAccountName] = useState("Srabhjot Singh");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [accountSaved, setAccountSaved] = useState(false);

  // Handlers
  function handleOrgSave() {
    setOrgSaved(true);
    setTimeout(() => setOrgSaved(false), 2000);
  }

  function handleAlertsSave() {
    setAlertsSaved(true);
    setTimeout(() => setAlertsSaved(false), 2000);
  }

  function handleAccountSave() {
    setAccountSaved(true);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setTimeout(() => setAccountSaved(false), 2000);
  }

  function updateAlertDays(key: string, days: number) {
    setAlertPrefs((prev) =>
      prev.map((p) => (p.key === key ? { ...p, daysBefore: days } : p))
    );
  }

  // Get the Tan Coffee org for the created date
  const tanCoffeeOrg = organizations.find((o) => o.name === "Tan Coffee");

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-black rounded-lg flex items-center justify-center">
          <Settings className="w-4.5 h-4.5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-neutral-500">
            Manage your organization, team, alerts, and account preferences
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="organization" className="w-full">
        <TabsList className="grid w-full max-w-2xl grid-cols-4">
          <TabsTrigger value="organization" className="gap-1.5 text-xs sm:text-sm">
            <Settings className="w-3.5 h-3.5 hidden sm:inline-block" />
            Organization
          </TabsTrigger>
          <TabsTrigger value="team" className="gap-1.5 text-xs sm:text-sm">
            <Users className="w-3.5 h-3.5 hidden sm:inline-block" />
            Team Members
          </TabsTrigger>
          <TabsTrigger value="alerts" className="gap-1.5 text-xs sm:text-sm">
            <Bell className="w-3.5 h-3.5 hidden sm:inline-block" />
            Alert Preferences
          </TabsTrigger>
          <TabsTrigger value="account" className="gap-1.5 text-xs sm:text-sm">
            <User className="w-3.5 h-3.5 hidden sm:inline-block" />
            Account
          </TabsTrigger>
        </TabsList>

        {/* ============================================================= */}
        {/* Organization Tab                                               */}
        {/* ============================================================= */}
        <TabsContent value="organization" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Organization Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
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

              {/* Logo Upload Placeholder */}
              <div className="grid gap-2 max-w-md">
                <Label>Organization Logo</Label>
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 rounded-lg border-2 border-dashed border-neutral-300 bg-neutral-50 flex items-center justify-center">
                    <Upload className="w-6 h-6 text-neutral-400" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <Upload className="w-3.5 h-3.5" />
                      Upload Logo
                    </Button>
                    <p className="text-xs text-neutral-400">
                      PNG or SVG, max 2 MB. Recommended 256x256px.
                    </p>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Created date */}
              <div className="flex items-center gap-2 max-w-md">
                <Calendar className="w-4 h-4 text-neutral-400" />
                <div>
                  <Label className="text-neutral-500">Created</Label>
                  <p className="text-sm">
                    {tanCoffeeOrg ? formatDate(tanCoffeeOrg.createdAt) : "---"}
                  </p>
                </div>
              </div>

              <Separator />

              {/* Save */}
              <div className="flex items-center gap-3">
                <Button onClick={handleOrgSave} className="gap-1.5">
                  {orgSaved ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  {orgSaved ? "Saved" : "Save Changes"}
                </Button>
                {orgSaved && (
                  <span className="text-sm text-emerald-600 font-medium">
                    Changes saved successfully
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============================================================= */}
        {/* Team Members Tab                                               */}
        {/* ============================================================= */}
        <TabsContent value="team" className="mt-6 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">Team Members</h2>
              <p className="text-sm text-neutral-500 mt-0.5">
                {teamMembers.length} member{teamMembers.length !== 1 ? "s" : ""} in
                your organization
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
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
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
                    <Button className="gap-1.5">
                      <Mail className="w-3.5 h-3.5" />
                      Send Invite
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
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200 bg-neutral-50/80">
                      <th className="text-left font-medium text-neutral-500 px-4 py-3">
                        Name
                      </th>
                      <th className="text-left font-medium text-neutral-500 px-4 py-3">
                        Email
                      </th>
                      <th className="text-left font-medium text-neutral-500 px-4 py-3">
                        Role
                      </th>
                      <th className="text-left font-medium text-neutral-500 px-4 py-3">
                        Status
                      </th>
                      <th className="text-right font-medium text-neutral-500 px-4 py-3">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamMembers.map((member) => (
                      <tr
                        key={member.id}
                        className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50/50 transition-colors"
                      >
                        {/* Name with avatar initials */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center shrink-0">
                              <span className="text-white text-[10px] font-semibold">
                                {getInitials(member.name)}
                              </span>
                            </div>
                            <span className="font-medium">{member.name}</span>
                          </div>
                        </td>
                        {/* Email */}
                        <td className="px-4 py-3 text-neutral-600">
                          {member.email}
                        </td>
                        {/* Role badge */}
                        <td className="px-4 py-3">{roleBadge(member.role)}</td>
                        {/* Status badge */}
                        <td className="px-4 py-3">
                          {statusBadge(member.status)}
                        </td>
                        {/* Actions */}
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              title="Edit role"
                            >
                              <Shield className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-neutral-400 hover:text-red-600"
                              title="Remove member"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              title="More options"
                            >
                              <MoreHorizontal className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============================================================= */}
        {/* Alert Preferences Tab                                          */}
        {/* ============================================================= */}
        <TabsContent value="alerts" className="mt-6 space-y-4">
          {/* Alert Lead Times */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Alert Lead Times</CardTitle>
              <p className="text-sm text-neutral-500 mt-1">
                Configure how many days in advance each alert type should be
                triggered
              </p>
            </CardHeader>
            <CardContent className="space-y-0">
              {alertPrefs.map((pref, idx) => (
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
                      <span className="text-sm text-neutral-500 w-20">
                        days before
                      </span>
                    </div>
                  </div>
                  {idx < alertPrefs.length - 1 && <Separator />}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Email Digest */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Email Digest</CardTitle>
              <p className="text-sm text-neutral-500 mt-1">
                Receive a daily summary of upcoming obligations and alerts
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Mail className="w-4 h-4 text-neutral-500" />
                  <div>
                    <p className="text-sm font-medium">Daily Email Digest</p>
                    <p className="text-xs text-neutral-500">
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

          {/* Save */}
          <div className="flex items-center gap-3">
            <Button onClick={handleAlertsSave} className="gap-1.5">
              {alertsSaved ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              {alertsSaved ? "Saved" : "Save Preferences"}
            </Button>
            {alertsSaved && (
              <span className="text-sm text-emerald-600 font-medium">
                Alert preferences saved successfully
              </span>
            )}
          </div>
        </TabsContent>

        {/* ============================================================= */}
        {/* Account Tab                                                    */}
        {/* ============================================================= */}
        <TabsContent value="account" className="mt-6 space-y-4">
          {/* Profile */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
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
                    className="text-[10px] py-0 px-1.5 bg-neutral-100 text-neutral-500"
                  >
                    Read-only
                  </Badge>
                </Label>
                <Input
                  id="account-email"
                  value="srabhjot@grospace.in"
                  disabled
                  className="bg-neutral-50 text-neutral-500 cursor-not-allowed"
                />
              </div>

              {/* Role display */}
              <div className="grid gap-2 max-w-md">
                <Label className="flex items-center gap-1.5">
                  Role
                  <Badge
                    variant="secondary"
                    className="text-[10px] py-0 px-1.5 bg-neutral-100 text-neutral-500"
                  >
                    Read-only
                  </Badge>
                </Label>
                <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-neutral-200 bg-neutral-50 text-sm text-neutral-500">
                  <Shield className="w-3.5 h-3.5" />
                  Platform Admin
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Change Password */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="w-4 h-4" />
                Change Password
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2 max-w-md">
                <Label htmlFor="current-password">Current Password</Label>
                <Input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                />
              </div>

              <div className="grid gap-2 max-w-md">
                <Label htmlFor="new-password">New Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                />
              </div>

              <div className="grid gap-2 max-w-md">
                <Label htmlFor="confirm-password">Confirm New Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                />
                {newPassword &&
                  confirmPassword &&
                  newPassword !== confirmPassword && (
                    <p className="text-xs text-red-600">
                      Passwords do not match
                    </p>
                  )}
              </div>
            </CardContent>
          </Card>

          {/* Save */}
          <div className="flex items-center gap-3">
            <Button onClick={handleAccountSave} className="gap-1.5">
              {accountSaved ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              {accountSaved ? "Saved" : "Save Changes"}
            </Button>
            {accountSaved && (
              <span className="text-sm text-emerald-600 font-medium">
                Account updated successfully
              </span>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
