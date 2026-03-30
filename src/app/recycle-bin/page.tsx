"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2, RotateCcw, Loader2, Store, AlertTriangle } from "lucide-react";

type DeletedOutlet = {
  id: string;
  name: string;
  city?: string;
  brand_name?: string;
  deleted_at: string;
  agreements?: { id: string; type: string; status: string }[];
};

export default function RecycleBinPage() {
  const [outlets, setOutlets] = useState<DeletedOutlet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    async function fetch() {
      try {
        setLoading(true);
        const { listDeletedOutlets } = await import("@/lib/api");
        const data = await listDeletedOutlets();
        setOutlets(data.items || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load recycle bin");
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, []);

  async function handleRestore(outletId: string) {
    setRestoringId(outletId);
    try {
      const { restoreOutlet } = await import("@/lib/api");
      await restoreOutlet(outletId);
      setOutlets((prev) => prev.filter((o) => o.id !== outletId));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to restore outlet");
    } finally {
      setRestoringId(null);
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
        <Button onClick={() => window.location.reload()}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Recycle Bin</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Deleted outlets can be restored here. Items are kept indefinitely.
        </p>
      </div>

      {outlets.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Trash2 className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <h3 className="text-base font-semibold mb-1">Recycle bin is empty</h3>
            <p className="text-sm text-muted-foreground">No deleted outlets</p>
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
                    Deleted {new Date(outlet.deleted_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs"
                  disabled={restoringId === outlet.id}
                  onClick={() => handleRestore(outlet.id)}
                >
                  {restoringId === outlet.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3.5 w-3.5" />
                  )}
                  Restore
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
