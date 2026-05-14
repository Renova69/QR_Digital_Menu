# Staff Settings Consolidation — Move QR & Shared Device Mode into Staff Tab

**Date:** 2026-05-13
**Status:** Approved
**Scope:** Frontend-only UX consolidation. No backend changes.

---

## Problem

Staff-related settings are scattered across two tabs in Dashboard → Settings:

- **General tab** — Shared Device Mode toggle, Generate Staff Device QR
- **Staff tab** — Create staff account (with PIN), staff list table

A manager creating a new staff member must: (1) create the account in Staff tab, (2) note the PIN, (3) switch to General tab, (4) generate QR, (5) give both to staff. This is three extra steps and two tab switches.

## Solution

Consolidate everything into the **Staff tab**. When "Create Staff Account" is clicked, chain both API calls and present a combined modal with QR code + PIN. Standalone QR generation stays available for re-bonding existing staff.

## Architecture

Zero backend changes. Both APIs already exist and work:

- `POST /auth/restaurants/:id/staff` → `{ user, rawPin }`
- `POST /restaurants/:id/device-enrollment` → `{ enrollmentUrl, expiresAt }`

Frontend chains them: `createStaff()` → on success `createDeviceEnrollment()` → show modal.

## Staff Tab Layout (top to bottom)

1. **Shared Device Mode toggle** (moved from General tab)
2. **"Invite New Staff" form** — name, email, role dropdown, "Create Staff Account" button
3. **Staff list table** — Name, Email, Role, Actions (re-bond button per row)
4. **Standalone "Generate Staff Device QR" button** — for bulk or re-use without creating staff

## Create Staff Account Flow

1. Manager fills name (required), email (optional), selects role (MANAGER/WAITER/KITCHEN)
2. Clicks "Create Staff Account"
3. Frontend calls `createStaff(restaurantId, { name, email, role })`
4. On success, immediately calls `createDeviceEnrollment(restaurantId)`
5. Opens **StaffCreatedModal** showing QR code + 4-digit PIN

### StaffCreatedModal States

| State | UI |
|-------|----|
| Loading | Spinner + "Creating staff account..." |
| Ready | QR code (200px centered), PIN in large monospace, expiry countdown (10 min), Copy PIN + Copy Link buttons, close button |
| Partial failure (staff created, QR failed) | "Staff account created. QR generation failed — use Re-bond button in staff list." |
| Full failure | Error toast, modal closes |

## Re-bond Button (per staff row)

Small icon button in Actions column. On click:
1. Calls `createDeviceEnrollment(restaurantId)`
2. Opens modal showing QR + "Scan to bond this device for [staff name]"
3. No PIN displayed (staff already has one)

## Items Moved Out of General Tab

- Shared Device Mode toggle (lines 471-505 in SettingsView)
- Generate Staff Device QR section (lines 507-563 in SettingsView)
- `handleGenerateDeviceEnrollment` handler
- `deviceEnrollmentUrl`, `deviceEnrollmentExpiresAt`, `deviceEnrollmentError`, `deviceEnrollmentCopied` state

## Files Changed

| File | Action |
|------|--------|
| `apps/frontend/src/pages/Dashboard/SettingsView.tsx` | Move sections from General to Staff tab; add chaining logic; add re-bond buttons |
| `apps/frontend/src/components/staff/StaffCreatedModal.tsx` | Create — modal with QR + PIN display |

## New Component: StaffCreatedModal

Props:
```ts
interface StaffCreatedModalProps {
  open: boolean;
  onClose: () => void;
  staffName: string;
  rawPin: string;          // from createStaff
  enrollmentUrl: string;   // from createDeviceEnrollment
  expiresAt: string;        // from createDeviceEnrollment
}
```

Reuses `QRCodeSVG` from `qrcode.react` (already in project). Same visual style as current QR display in SettingsView.

## Edge Cases

- **createStaff succeeds, createDeviceEnrollment fails** — staff saved with PIN, error shown in modal, re-bond available in staff table
- **Both fail** — error toast, nothing persisted
- **Shared Device Mode is OFF** — staff tab shows a note reminding manager to enable it
- **Staff member role changes later** — re-bond generates new QR, device re-bonded to restaurant
- **Two restaurants side by side** — each manager generates their own QR from their own dashboard; QR bonds device to correct restaurant

## Self-Review

- No TBDs or placeholders
- No backend changes — reduces risk
- Reuses existing API functions and `qrcode.react` library
- Single new component (`StaffCreatedModal`)
- Existing `DeviceEnrollPage` and `DeviceLoginPage` unchanged
