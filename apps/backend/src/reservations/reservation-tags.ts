/**
 * Single source of truth for reservation tag vocabularies (Phase 1). Imported by
 * DTO validation, the services, and the frontend chips (mirrored) so the sets
 * cannot drift between layers.
 */

// Guest self-selects these on the public form. The health/accessibility items
// are special-category (GDPR Art. 9) data — only persisted with explicit
// consent (see SENSITIVE_PREFERENCES below).
export const CUSTOMER_PREFERENCES = [
  'VEGAN',
  'VEGETARIAN',
  'GLUTEN_INTOLERANT',
  'LACTOSE_INTOLERANT',
  'NUT_ALLERGY',
  'WHEELCHAIR_ACCESS',
  'PREGNANT',
  'PET',
  'HIGH_CHAIR',
  'QUIET_TABLE',
] as const;
export type CustomerPreference = (typeof CUSTOMER_PREFERENCES)[number];

// Special-category (health / disability) subset of the above — gated behind
// explicit consent. Kept as built-ins on purpose: an owner should reach for
// WHEELCHAIR_ACCESS/PREGNANT here (consent-protected) instead of re-creating
// them as unprotected custom chips. Custom chips remain non-sensitive.
// (Export name is historical — it covers all special-category prefs, not just
// dietary ones.)
export const DIETARY_PREFERENCES: readonly CustomerPreference[] = [
  'VEGAN',
  'VEGETARIAN',
  'GLUTEN_INTOLERANT',
  'LACTOSE_INTOLERANT',
  'NUT_ALLERGY',
  'WHEELCHAIR_ACCESS',
  'PREGNANT',
];

// Accessibility/assistance subset of the consent-gated set above — same consent
// rule, but the public form shows these under their own heading rather than
// under "Dietary/allergy". Display-only grouping; consent still applies.
export const ACCESSIBILITY_PREFERENCES: readonly CustomerPreference[] = [
  'WHEELCHAIR_ACCESS',
  'PREGNANT',
];

// Staff-assigned, cross-visit. NEVER shown to the guest or emitted to any
// public/table-session socket. Deliberately excludes spend-based labels.
export const STAFF_PATRON_TAGS = [
  'VIP',
  'REGULAR',
  'WINE_LOVER',
  'OFTEN_LATE',
  'NO_SHOW_RISK',
  'PREFERS_TERRACE',
  'PREFERS_WINDOW',
  'NEEDS_CALL_CONFIRMATION',
] as const;
export type StaffPatronTag = (typeof STAFF_PATRON_TAGS)[number];

const CUSTOMER_PREFERENCE_SET = new Set<string>(CUSTOMER_PREFERENCES);
const DIETARY_PREFERENCE_SET = new Set<string>(DIETARY_PREFERENCES);
const STAFF_PATRON_TAG_SET = new Set<string>(STAFF_PATRON_TAGS);

function uniqueValid(values: unknown, allowed: Set<string>): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  for (const v of values) {
    if (typeof v === 'string' && allowed.has(v)) seen.add(v);
  }
  return [...seen];
}

/**
 * Keep only allowed customer preferences (deduped): the built-in set plus any
 * owner-defined custom labels the restaurant currently offers. A guest can only
 * pick what the form shows, so a submitted value must be in one of those two.
 */
export function sanitizeCustomerPreferences(
  values: unknown,
  extraAllowed: readonly string[] = [],
): string[] {
  const allowed = new Set<string>([
    ...CUSTOMER_PREFERENCE_SET,
    ...extraAllowed,
  ]);
  return uniqueValid(values, allowed);
}

/** Keep only recognized staff tags (deduped). */
export function sanitizeStaffTags(values: unknown): string[] {
  return uniqueValid(values, STAFF_PATRON_TAG_SET);
}

/**
 * Sanitize an owner's free-text custom-preference labels: trim, cap length,
 * de-dupe (case-insensitive), drop empties, cap the count.
 */
export function sanitizeCustomPreferenceLabels(
  values: unknown,
  max = 20,
): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (typeof v !== 'string') continue;
    const label = v.trim().slice(0, 40);
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
    if (out.length >= max) break;
  }
  return out;
}

/** True when the preference set includes any health-sensitive dietary item. */
export function hasDietaryPreference(prefs: readonly string[]): boolean {
  return prefs.some((p) => DIETARY_PREFERENCE_SET.has(p));
}
