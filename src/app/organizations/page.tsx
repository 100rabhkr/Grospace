"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Building2,
  Plus,
  Search,
  Calendar,
  Store,
  FileText,
  ChevronRight,
} from "lucide-react";
import {
  organizations,
  outlets,
  agreements,
  formatDate,
} from "@/lib/mock-data";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getOrgStats(orgId: string) {
  const orgOutlets = outlets.filter((o) => o.orgId === orgId);
  const orgAgreements = agreements.filter((a) => a.orgId === orgId);
  const activeAgreements = orgAgreements.filter(
    (a) => a.status === "active" || a.status === "expiring"
  );

  return {
    outletCount: orgOutlets.length,
    agreementCount: orgAgreements.length,
    activeAgreementCount: activeAgreements.length,
  };
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function OrganizationsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");

  const filteredOrgs = organizations.filter((org) =>
    org.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  function handleCreateOrg() {
    // Placeholder for create logic
    setNewOrgName("");
    setShowCreateForm(false);
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* ----------------------------------------------------------------- */}
        {/* Page Header                                                        */}
        {/* ----------------------------------------------------------------- */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-bold tracking-tight text-black">
                  Organizations
                </h1>
                <Badge
                  variant="secondary"
                  className="bg-neutral-100 text-neutral-600 text-xs"
                >
                  {organizations.length}
                </Badge>
              </div>
              <p className="text-sm text-neutral-500 mt-0.5">
                Manage all registered organizations
              </p>
            </div>
          </div>
          <Button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="gap-1.5 bg-black text-white hover:bg-neutral-800"
          >
            <Plus className="w-4 h-4" />
            Create Organization
          </Button>
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* Create Organization Form                                           */}
        {/* ----------------------------------------------------------------- */}
        {showCreateForm && (
          <Card className="border border-neutral-200">
            <CardContent className="p-5">
              <p className="text-sm font-semibold text-black mb-4">
                New Organization
              </p>
              <div className="flex items-end gap-4">
                <div className="flex-1">
                  <label
                    htmlFor="new-org-name"
                    className="block text-xs font-medium text-neutral-600 mb-1.5"
                  >
                    Organization Name
                  </label>
                  <Input
                    id="new-org-name"
                    value={newOrgName}
                    onChange={(e) => setNewOrgName(e.target.value)}
                    placeholder="e.g. Chaayos, Third Wave Coffee"
                    className="bg-white border-neutral-200"
                  />
                </div>
                <Button
                  onClick={handleCreateOrg}
                  disabled={!newOrgName.trim()}
                  className="gap-1.5 bg-black text-white hover:bg-neutral-800"
                >
                  <Plus className="w-4 h-4" />
                  Create
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* Search                                                             */}
        {/* ----------------------------------------------------------------- */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search organizations..."
            className="pl-9 h-9 text-sm bg-white border-neutral-200"
          />
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* Organization Grid                                                  */}
        {/* ----------------------------------------------------------------- */}
        {filteredOrgs.length === 0 ? (
          <Card className="border border-neutral-200">
            <CardContent className="py-16 text-center">
              <Building2 className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
              <p className="text-sm text-neutral-500">
                No organizations found matching your search.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {filteredOrgs.map((org) => {
              const stats = getOrgStats(org.id);
              const initial = org.name.charAt(0).toUpperCase();

              return (
                <Card
                  key={org.id}
                  className="border border-neutral-200 hover:shadow-lg transition-shadow group"
                >
                  <CardContent className="p-5">
                    {/* Org Identity */}
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-11 h-11 rounded-full bg-black flex items-center justify-center shrink-0">
                        <span className="text-white text-lg font-bold">
                          {initial}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-lg font-bold text-black leading-tight truncate">
                          {org.name}
                        </h3>
                        <div className="flex items-center gap-1.5 mt-1 text-xs text-neutral-500">
                          <Calendar className="w-3 h-3 shrink-0" />
                          <span>Created {formatDate(org.createdAt)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Stats Row */}
                    <div className="grid grid-cols-3 gap-3 mb-5">
                      <div className="text-center py-3 px-2 rounded-lg bg-neutral-50 border border-neutral-100">
                        <Store className="w-4 h-4 text-neutral-400 mx-auto mb-1" />
                        <p className="text-lg font-bold text-black">
                          {stats.outletCount}
                        </p>
                        <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-medium">
                          Outlets
                        </p>
                      </div>
                      <div className="text-center py-3 px-2 rounded-lg bg-neutral-50 border border-neutral-100">
                        <FileText className="w-4 h-4 text-neutral-400 mx-auto mb-1" />
                        <p className="text-lg font-bold text-black">
                          {stats.agreementCount}
                        </p>
                        <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-medium">
                          Agreements
                        </p>
                      </div>
                      <div className="text-center py-3 px-2 rounded-lg bg-emerald-50 border border-emerald-100">
                        <FileText className="w-4 h-4 text-emerald-500 mx-auto mb-1" />
                        <p className="text-lg font-bold text-emerald-700">
                          {stats.activeAgreementCount}
                        </p>
                        <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-medium">
                          Active
                        </p>
                      </div>
                    </div>

                    {/* View Details Button */}
                    <Link href={`/organizations/${org.id}`}>
                      <Button
                        variant="outline"
                        className="w-full gap-1.5 text-sm border-neutral-200 text-black hover:bg-black hover:text-white hover:border-black transition-colors"
                      >
                        View Details
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
