# Extraction Review Page — Bugs Found

## Bug 1: Multi-line fields (rent_schedule, etc.) are NOT editable
**File**: `src/app/agreements/upload/page.tsx` lines 983-991
**Severity**: High

**Problem**: The rendering logic has a priority chain: `isNotFound → isBool → isMultiLine → EditableField`. Any field whose display value contains `\n` (newline) hits the `isMultiLine` branch and renders as a **read-only bullet list** — skipping the `EditableField` component entirely.

**Affected fields**:
- `rent_schedule` (array of year/rent objects → formatted as multi-line string)
- Any other array or long-text field that `parseField()` joins with `\n`

**Expected**: These fields should be editable. Either render each line item as individually editable, or allow editing the whole block.

**Fix approach**: Replace the static bullet-list rendering with an editable version. Options:
  - (A) Make each bullet line individually editable (best UX for rent_schedule)
  - (B) Allow clicking the whole block to open a textarea editor
  - (C) Wrap the bullet list in an EditableField-like component that supports multi-line editing

---

## Bug 2: Boolean fields (Yes/No) are NOT editable
**File**: `src/app/agreements/upload/page.tsx` lines 977-982
**Severity**: Medium

**Problem**: Fields parsed as `"Yes"` or `"No"` render as colored badges and skip `EditableField`. User cannot toggle or correct these values.

**Affected fields**: Any field extracted as a boolean (e.g., "exclusive_rights", "sub_lease_allowed", etc.)

**Fix approach**: Make the badge clickable to toggle Yes/No, or wrap in an editable dropdown.

---

## Bug 3: "Not found" fields are NOT editable — user can't fill them in
**File**: `src/app/agreements/upload/page.tsx` lines 975-976
**Severity**: Medium

**Problem**: Fields where AI extraction returned nothing show "Not found in document" as static greyed-out text. The user cannot click to manually enter a value. If the AI missed a field, the user has no way to add it.

**Fix approach**: Make "Not found" fields clickable — on click, open an empty EditableField so the user can manually type the value.

---

## Bug 4: Formatted values (₹, %, sq ft) are saved instead of raw values
**File**: `src/app/agreements/upload/page.tsx` lines 948-957, 993-994
**Severity**: Medium

**Problem**: The `EditableField` receives `formattedVal` (e.g., `"₹49,635"`, `"15%"`, `"500 sq ft"`) instead of the raw value. When a user edits and saves, the formatted string (with ₹, %, sq ft suffixes) gets written back to state. On the next render it may double-format (e.g., `"₹₹49,635"`) or fail numeric parsing downstream.

**Fix approach**: Pass the raw `displayVal` to `EditableField` for editing, and only use `formattedVal` for display. The `EditableField` component should show the formatted value in view mode but switch to raw value in edit mode.

---

## Bug 5: Rent schedule array items — individual line edits don't propagate
**File**: `src/app/agreements/upload/page.tsx` lines 996-1010
**Severity**: Low (blocked by Bug 1)

**Problem**: Even if Bug 1 is fixed, the `onChange` handler for EditableField replaces the entire field value with a plain string. For array fields like `rent_schedule`, this would replace the structured array `[{year: 1, monthly_rent: 49635}, ...]` with a flat string, losing all structure.

**Fix approach**: For array-type fields, the edit handler needs to update individual array items rather than replacing the whole field.

---

## Summary

| # | Bug | Severity | Editable? |
|---|-----|----------|-----------|
| 1 | Multi-line fields (rent_schedule) | High | No — renders as static bullet list |
| 2 | Boolean fields (Yes/No) | Medium | No — renders as static badge |
| 3 | "Not found" fields | Medium | No — renders as static grey text |
| 4 | Formatted values saved with ₹/% symbols | Medium | Editable but corrupts data |
| 5 | Array field edit loses structure | Low | Blocked by Bug 1 |
