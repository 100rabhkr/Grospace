"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { listOrganizations, createOrganization } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Building2,
  Plus,
  Search,
  Calendar,
  ChevronRight,
  Loader2,
  AlertTriangle,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Organization {
  id: string;
  name: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
  if (!dateStr) return "--";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function OrganizationsPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function fetchOrganizations() {
    try {
      setLoading(true);
      setError(null);
      const data = await listOrganizations();
      setOrganizations(data.items || data.organizations || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load organizations");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchOrganizations();
  }, []);

  const filteredOrgs = organizations.filter((org) =>
    org.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  async function handleCreateOrg() {
    if (!newOrgName.trim()) return;
    try {
      setCreating(true);
      setCreateError(null);
      await createOrganization(newOrgName.trim());
      setNewOrgName("");
      setShowCreateForm(false);
      await fetchOrganizations();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create organization");
    } finally {
      setCreating(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Loading State
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
          <p className="text-sm text-neutral-500">Loading organizations...</p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Error State
  // ---------------------------------------------------------------------------
  if (error) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center max-w-md">
          <AlertTriangle className="h-10 w-10 text-red-400" />
          <p className="text-lg font-medium text-neutral-800">
            Failed to load organizations
          </p>
          <p className="text-sm text-neutral-500">{error}</p>
          <Button variant="outline" onClick={() => fetchOrganizations()}>
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
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
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newOrgName.trim()) {
                        handleCreateOrg();
                      }
                    }}
                  />
                </div>
                <Button
                  onClick={handleCreateOrg}
                  disabled={!newOrgName.trim() || creating}
                  className="gap-1.5 bg-black text-white hover:bg-neutral-800"
                >
                  {creating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  {creating ? "Creating..." : "Create"}
                </Button>
              </div>
              {createError && (
                <p className="text-sm text-red-600 mt-2">{createError}</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* Search                                                             */}
        {/* ----------------------------------------------------------------- */}
        {organizations.length > 0 && (
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search organizations..."
              className="pl-9 h-9 text-sm bg-white border-neutral-200"
            />
          </div>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* Empty State - No organizations at all                              */}
        {/* ----------------------------------------------------------------- */}
        {organizations.length === 0 && (
          <Card className="border border-neutral-200">
            <CardContent className="py-16 text-center">
              <Building2 className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
              <p className="text-lg font-medium text-neutral-700 mb-1">
                No organizations yet
              </p>
              <p className="text-sm text-neutral-500 mb-4">
                Create your first organization to get started.
              </p>
              <Button
                onClick={() => setShowCreateForm(true)}
                className="gap-1.5 bg-black text-white hover:bg-neutral-800"
              >
                <Plus className="w-4 h-4" />
                Create Organization
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* Empty State - No search results                                    */}
        {/* ----------------------------------------------------------------- */}
        {organizations.length > 0 && filteredOrgs.length === 0 && (
          <Card className="border border-neutral-200">
            <CardContent className="py-16 text-center">
              <Building2 className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
              <p className="text-sm text-neutral-500">
                No organizations found matching your search.
              </p>
            </CardContent>
          </Card>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* Organization Grid                                                  */}
        {/* ----------------------------------------------------------------- */}
        {filteredOrgs.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {filteredOrgs.map((org) => {
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
                          <span>Created {formatDate(org.created_at)}</span>
                        </div>
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
