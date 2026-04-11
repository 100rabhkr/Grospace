"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Trash2,
  RotateCcw,
  Loader2,
  Store,
  FileText,
  AlertTriangle,
} from "lucide-react";
import { useUser } from "@/lib/hooks/use-user";
import { canWrite, type UserRole } from "@/components/navigation-config";

type DeletedOutlet = {
  id: string;
  name: string;
  city?: string;
  brand_name?: string;
  deleted_at: string;
  agreements?: { id: string; type: string; status: string }[];
};

type DeletedAgreement = {
  id: string;
  document_filename?: string;
  lessor_name?: string;
  brand_name?: string;
  status?: string;
  type?: string;
  deleted_at: string;
  outlet_id?: string | null;
  outlets?: { name?: string; city?: string } | null;
};

export default function RecycleBinPage() {
  const { user, loading: userLoading } = useUser();
  const [outlets, setOutlets] = useState<DeletedOutlet[]>([]);
  const [agreements, setAgreements] = useState<DeletedAgreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Role guards: only org_admin and platform_admin can restore / delete
  // forever. org_member / finance_viewer see the items but no actions.
  const userCanWrite = canWrite(user?.role as UserRole | undefined);
  const isReadOnly = !userLoading && !userCanWrite;

  async function fetchAll() {
    try {
      setLoading(true);
      const { listDeletedOutlets, listDeletedAgreements } = await import("@/lib/api");
      const [outletsRes, agreementsRes] = await Promise.all([
        listDeletedOutlets().catch(() => ({ items: [] })),
        listDeletedAgreements().catch(() => ({ items: [] })),
      ]);
      setOutlets(outletsRes.items || []);
      setAgreements(agreementsRes.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load recycle bin");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAll();
  }, []);

  async function handleRestoreOutlet(outletId: string) {
    setBusyId(outletId);
    try {
      const { restoreOutlet } = await import("@/lib/api");
      await restoreOutlet(outletId);
      setOutlets((prev) => prev.filter((o) => o.id !== outletId));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to restore outlet");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDeleteOutletForever(outletId: string, name: string) {
    const count = outlets.find((o) => o.id === outletId)?.agreements?.length || 0;
    const warning = count > 0
      ? `Permanently delete "${name}"? This will cascade-remove ${count} agreement${count === 1 ? "" : "s"} + every event, payment, alert, and document attached to this outlet. This CANNOT be undone.`
      : `Permanently delete "${name}"? This CANNOT be undone.`;
    if (!confirm(warning)) return;
    setBusyId(outletId);
    try {
      const { deleteOutletForever } = await import("@/lib/api");
      await deleteOutletForever(outletId);
      setOutlets((prev) => prev.filter((o) => o.id !== outletId));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to permanently delete");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRestoreAgreement(agreementId: string) {
    setBusyId(agreementId);
    try {
      const { restoreAgreement } = await import("@/lib/api");
      await restoreAgreement(agreementId);
      setAgreements((prev) => prev.filter((a) => a.id !== agreementId));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to restore agreement");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDeleteAgreementForever(agreementId: string, name: string) {
    if (!confirm(`Permanently delete "${name}"? Every event, payment, obligation, alert, and clause tied to this agreement will also be removed. This CANNOT be undone.`)) return;
    setBusyId(agreementId);
    try {
      const { deleteAgreementForever } = await import("@/lib/api");
      await deleteAgreementForever(agreementId);
      setAgreements((prev) => prev.filter((a) => a.id !== agreementId));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to permanently delete");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
        <AlertTriangle className="h-12 w-12 text-rose-500" />
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button onClick={() => fetchAll()}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[17px] font-semibold tracking-tight text-foreground">Recycle Bin</h1>
        <p className="text-[12.5px] text-muted-foreground mt-1 font-medium">
          Soft-deleted items can be restored or permanently removed. Every
          action is logged to the Deletion Audit tab in your Google Sheet.
        </p>
      </div>

      <Tabs defaultValue="outlets" className="w-full">
        <TabsList className="h-auto bg-transparent border-b border-border rounded-none p-0 w-full justify-start gap-6 overflow-x-auto scrollbar-hide">
          <TabsTrigger
            value="outlets"
            className="relative h-10 rounded-none bg-transparent px-0 text-[13px] font-semibold text-muted-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:bottom-[-1px] data-[state=active]:after:h-[2px] data-[state=active]:after:bg-foreground"
          >
            Outlets
            {outlets.length > 0 && (
              <span className="ml-2 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-foreground text-background text-[10px] font-semibold">
                {outlets.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="agreements"
            className="relative h-10 rounded-none bg-transparent px-0 text-[13px] font-semibold text-muted-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:bottom-[-1px] data-[state=active]:after:h-[2px] data-[state=active]:after:bg-foreground"
          >
            Agreements
            {agreements.length > 0 && (
              <span className="ml-2 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-foreground text-background text-[10px] font-semibold">
                {agreements.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="outlets" className="mt-6">
          {outlets.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Trash2 className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <h3 className="text-base font-semibold mb-1">No deleted outlets</h3>
                <p className="text-sm text-muted-foreground">
                  Outlets you delete will appear here.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {outlets.map((outlet) => (
                <Card key={outlet.id}>
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="h-10 w-10 rounded-lg bg-rose-50 flex items-center justify-center flex-shrink-0">
                      <Store className="h-5 w-5 text-rose-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">{outlet.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {outlet.city || "Unknown city"}
                        {outlet.brand_name && ` \u00b7 ${outlet.brand_name}`}
                        {outlet.agreements && outlet.agreements.length > 0 && (
                          <> &middot; {outlet.agreements.length} agreement{outlet.agreements.length > 1 ? "s" : ""}</>
                        )}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Deleted{" "}
                        {new Date(outlet.deleted_at).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {userCanWrite && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 text-xs"
                            disabled={busyId === outlet.id}
                            onClick={() => handleRestoreOutlet(outlet.id)}
                          >
                            {busyId === outlet.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RotateCcw className="h-3.5 w-3.5" />
                            )}
                            Restore
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 text-xs text-rose-600 border-rose-200 hover:bg-rose-50"
                            disabled={busyId === outlet.id}
                            onClick={() => handleDeleteOutletForever(outlet.id, outlet.name)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete Forever
                          </Button>
                        </>
                      )}
                      {isReadOnly && (
                        <span className="text-[11px] text-muted-foreground italic px-2">
                          Read-only — ask an admin to restore
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="agreements" className="mt-6">
          {agreements.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Trash2 className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <h3 className="text-base font-semibold mb-1">No deleted agreements</h3>
                <p className="text-sm text-muted-foreground">
                  Agreements you delete will appear here.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {agreements.map((agr) => {
                const title = agr.document_filename || agr.lessor_name || "Untitled agreement";
                return (
                  <Card key={agr.id}>
                    <CardContent className="p-4 flex items-center gap-4">
                      <div className="h-10 w-10 rounded-lg bg-rose-50 flex items-center justify-center flex-shrink-0">
                        <FileText className="h-5 w-5 text-rose-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{title}</p>
                        <p className="text-xs text-muted-foreground">
                          {agr.outlets?.name || "Orphaned"}
                          {agr.outlets?.city && ` \u00b7 ${agr.outlets.city}`}
                          {agr.brand_name && ` \u00b7 ${agr.brand_name}`}
                          {agr.status && ` \u00b7 ${agr.status}`}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Deleted{" "}
                          {new Date(agr.deleted_at).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {userCanWrite && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5 text-xs"
                              disabled={busyId === agr.id}
                              onClick={() => handleRestoreAgreement(agr.id)}
                            >
                              {busyId === agr.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <RotateCcw className="h-3.5 w-3.5" />
                              )}
                              Restore
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5 text-xs text-rose-600 border-rose-200 hover:bg-rose-50"
                              disabled={busyId === agr.id}
                              onClick={() => handleDeleteAgreementForever(agr.id, title)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete Forever
                            </Button>
                          </>
                        )}
                        {isReadOnly && (
                          <span className="text-[11px] text-muted-foreground italic px-2">
                            Read-only
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
