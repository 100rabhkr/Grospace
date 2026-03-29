/**
 * Location-scoped access control helpers.
 *
 * Stores member-to-outlet scope mappings in localStorage until the backend
 * RBAC layer supports this natively. The canonical shape is:
 *
 *   { memberScopes: { [userId]: { scope: "all" | "specific", outletIds: string[] } } }
 *
 * All functions are safe to call server-side (they no-op when `window` is
 * unavailable).
 */

const STORAGE_KEY = "grospace:memberScopes";

export type MemberScope = {
  scope: "all" | "specific";
  outletIds: string[];
};

export type MemberScopesMap = Record<string, MemberScope>;

// ---------------------------------------------------------------------------
// Read / Write
// ---------------------------------------------------------------------------

export function getMemberScopes(): MemberScopesMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return (parsed.memberScopes as MemberScopesMap) ?? {};
  } catch {
    return {};
  }
}

export function getMemberScope(userId: string): MemberScope {
  const all = getMemberScopes();
  return all[userId] ?? { scope: "all", outletIds: [] };
}

export function setMemberScope(userId: string, scope: MemberScope): void {
  if (typeof window === "undefined") return;
  const all = getMemberScopes();
  all[userId] = scope;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ memberScopes: all }));
}

// ---------------------------------------------------------------------------
// Access check
// ---------------------------------------------------------------------------

/**
 * Returns true when the given user has access to the specified outlet.
 * Platform admins and org admins always have access to all locations.
 */
export function hasOutletAccess(
  userId: string,
  userRole: string,
  outletId: string,
): boolean {
  // Admins always see everything
  if (userRole === "platform_admin" || userRole === "org_admin") return true;

  const scope = getMemberScope(userId);
  if (scope.scope === "all") return true;
  return scope.outletIds.includes(outletId);
}

/**
 * Filters a list of outlets to only those the current user can access.
 */
export function filterOutletsByAccess<T extends { id: string }>(
  outlets: T[],
  userId: string,
  userRole: string,
): T[] {
  if (userRole === "platform_admin" || userRole === "org_admin") return outlets;

  const scope = getMemberScope(userId);
  if (scope.scope === "all") return outlets;
  const allowed = new Set(scope.outletIds);
  return outlets.filter((o) => allowed.has(o.id));
}
