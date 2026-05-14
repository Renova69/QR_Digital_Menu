# Staff Settings Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Shared Device Mode + QR enrollment from General tab into Staff tab, chain staff creation with QR generation in a modal, add per-row re-bond buttons.

**Architecture:** Frontend-only. No backend changes. Single new component (`StaffCreatedModal`). `SettingsView.tsx` modified to relocate sections, chain API calls, and add re-bond buttons.

**Tech Stack:** React 18 + TypeScript + Tailwind 4 + `qrcode.react` (already in project)

---

## File Structure

```
Create: apps/frontend/src/components/staff/StaffCreatedModal.tsx
Modify: apps/frontend/src/pages/Dashboard/SettingsView.tsx
```

---

### Task 1: Create StaffCreatedModal Component

**Files:**
- Create: `apps/frontend/src/components/staff/StaffCreatedModal.tsx`

- [ ] **Step 1: Write the StaffCreatedModal component**

```tsx
// apps/frontend/src/components/staff/StaffCreatedModal.tsx

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCopy, faCheck, faTimes } from "@fortawesome/free-solid-svg-icons";

interface StaffCreatedModalProps {
  open: boolean;
  onClose: () => void;
  staffName: string;
  rawPin?: string;         // only for new staff; absent for re-bond
  enrollmentUrl: string;
  expiresAt: string;
}

export default function StaffCreatedModal({
  open,
  onClose,
  staffName,
  rawPin,
  enrollmentUrl,
  expiresAt,
}: StaffCreatedModalProps) {
  const [pinCopied, setPinCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    if (!open || !expiresAt) return;
    const update = () => {
      const remaining = new Date(expiresAt).getTime() - Date.now();
      if (remaining <= 0) {
        setTimeLeft("Expired");
        return;
      }
      const m = Math.floor(remaining / 60000);
      const s = Math.floor((remaining % 60000) / 1000);
      setTimeLeft(`${m}:${s.toString().padStart(2, "0")}`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [open, expiresAt]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-card rounded-2xl shadow-xl border border-border w-full max-w-sm p-6 relative">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close"
        >
          <FontAwesomeIcon icon={faTimes} />
        </button>

        <h3 className="text-lg font-semibold text-foreground mb-1">
          {rawPin ? "Staff Account Created" : "Device Bonding QR"}
        </h3>
        <p className="text-sm text-muted-foreground mb-6">
          {rawPin
            ? `Scan QR on the staff device, then enter the PIN below.`
            : `Scan this QR on ${staffName}'s device to re-bond it.`}
        </p>

        {/* QR Code */}
        <div className="flex justify-center mb-6">
          <div className="rounded-xl bg-white p-3">
            <QRCodeSVG value={enrollmentUrl} size={200} />
          </div>
        </div>

        {/* Expiry countdown */}
        <p className="text-xs text-muted-foreground text-center mb-4">
          Expires in {timeLeft} ·{" "}
          {new Date(expiresAt).toLocaleTimeString()}
        </p>

        {/* PIN display (new staff only) */}
        {rawPin && (
          <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 mb-4 text-center">
            <p className="text-sm text-muted-foreground mb-1">
              PIN for {staffName}
            </p>
            <p className="text-3xl font-mono font-bold text-foreground tracking-widest select-all">
              {rawPin}
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Copy this PIN now — it won't be shown again.
            </p>
            <button
              onClick={() => {
                navigator.clipboard.writeText(rawPin);
                setPinCopied(true);
                setTimeout(() => setPinCopied(false), 2000);
              }}
              className="mt-2 inline-flex items-center gap-1 text-sm text-accent hover:underline"
            >
              <FontAwesomeIcon icon={pinCopied ? faCheck : faCopy} />
              {pinCopied ? "Copied!" : "Copy PIN"}
            </button>
          </div>
        )}

        {/* Copy link */}
        <button
          onClick={() => {
            navigator.clipboard.writeText(enrollmentUrl);
            setLinkCopied(true);
            setTimeout(() => setLinkCopied(false), 2000);
          }}
          className="w-full inline-flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <FontAwesomeIcon icon={linkCopied ? faCheck : faCopy} />
          {linkCopied ? "Link Copied!" : "Copy Enrollment Link"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify frontend builds**

Run: `cd apps/frontend && npm run build`
Expected: Build succeeds (component compiles, no consumers yet).

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/staff/StaffCreatedModal.tsx
git commit -m "feat: add StaffCreatedModal component with QR code and PIN display"
```

---

### Task 2: Move Shared Device Mode & QR Enrollment from General to Staff Tab

**Files:**
- Modify: `apps/frontend/src/pages/Dashboard/SettingsView.tsx`

- [ ] **Step 1: Remove Shared Device Mode + QR sections from General tab**

Delete lines 471-564 in SettingsView.tsx (the entire `{/* ── Shared Device Mode ── */}` block including the QR enrollment card). This is inside the `activeSettingsTab === 'general'` block ending at line 565 (`</>`)}).

```tsx
// REMOVE these lines from General tab (lines 471-564):
//
//   {/* ── Shared Device Mode ── */}
//   <div className="border-b border-border pb-6">
//     ... entire Shared Device Mode section with QR card ...
//   </div>
```

- [ ] **Step 2: Add Shared Device Mode toggle at top of Staff tab**

Insert after line 857 (`</div>` closing the staff heading), before the `{staffError && ...}` block:

```tsx
{/* Shared Device Mode */}
<div className="border-b border-border pb-6">
  <h3 className="text-lg font-medium text-foreground mb-1">Shared Device Mode</h3>
  <p className="text-sm text-muted-foreground mb-4">
    Enable PIN-based login for hourly staff on a shared tablet. This configures the device for staff PIN entry without requiring individual email/password accounts.
  </p>
  <div className="flex items-center gap-3">
    <Button
      type="button"
      variant="outline"
      onClick={() => {
        if (!activeRestaurant) return;
        if (sharedDeviceEnabled) {
          localStorage.removeItem("sharedDevice");
          setSharedDeviceConfig(null);
          setSharedDeviceMessage("Shared Device Mode disabled for this device.");
          setTimeout(() => setSharedDeviceMessage(""), 5000);
        } else {
          const config = {
            restaurantId: activeRestaurant.id,
            restaurantName: activeRestaurant.name,
          };
          localStorage.setItem("sharedDevice", JSON.stringify(config));
          setSharedDeviceConfig(config);
          setSharedDeviceMessage("Shared Device Mode enabled. Staff can now log in at /device-login with their PIN.");
          setTimeout(() => setSharedDeviceMessage(""), 5000);
        }
      }}
    >
      {sharedDeviceEnabled ? "Disable Shared Device Mode" : "Enable Shared Device Mode"}
    </Button>
    {sharedDeviceMessage && (
      <span className="text-sm text-green-600 dark:text-green-400">{sharedDeviceMessage}</span>
    )}
  </div>
  {!sharedDeviceEnabled && (
    <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
      Shared Device Mode is off. Enable it so staff can use PIN login at /device-login.
    </p>
  )}
</div>
```

- [ ] **Step 3: Add standalone Generate Staff Device QR section in Staff tab**

Insert after the Shared Device Mode section (from Step 2), before the invite form:

```tsx
{/* Bond a Device (standalone) */}
<div className="border-b border-border pb-6">
  <div className="rounded-lg border border-border bg-muted/20 p-4">
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <p className="font-medium text-sm text-foreground">Bond a Device</p>
        <p className="text-xs text-muted-foreground mt-1">
          Generate a QR code to bond a device to this restaurant. Use for existing staff getting a new phone or tablet.
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleGenerateDeviceEnrollment}
        disabled={deviceEnrollmentLoading || !activeRestaurant}
      >
        {deviceEnrollmentLoading ? "Generating..." : "Generate Device QR"}
      </Button>
    </div>

    {deviceEnrollmentError && (
      <p className="mt-3 text-sm text-destructive">{deviceEnrollmentError}</p>
    )}

    {deviceEnrollmentUrl && (
      <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center">
        <div className="rounded-lg bg-white p-3 w-fit">
          <QRCodeSVG value={deviceEnrollmentUrl} size={160} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            Scan this QR on the staff device.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Expires at {new Date(deviceEnrollmentExpiresAt).toLocaleTimeString()}.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(deviceEnrollmentUrl);
                setDeviceEnrollmentCopied(true);
                setTimeout(() => setDeviceEnrollmentCopied(false), 2000);
              }}
            >
              <FontAwesomeIcon
                icon={deviceEnrollmentCopied ? faCheck : faCopy}
                className="mr-1"
              />
              {deviceEnrollmentCopied ? "Copied!" : "Copy Link"}
            </Button>
          </div>
        </div>
      </div>
    )}
  </div>
</div>
```

- [ ] **Step 4: Verify frontend builds**

Run: `cd apps/frontend && npm run build`
Expected: Build succeeds. General tab no longer has Shared Device Mode. Staff tab has Shared Device Mode + standalone QR sections.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/Dashboard/SettingsView.tsx
git commit -m "refactor: move Shared Device Mode and QR enrollment from General to Staff tab"
```

---

### Task 3: Chain Staff Creation with QR Enrollment in Modal

**Files:**
- Modify: `apps/frontend/src/pages/Dashboard/SettingsView.tsx`

- [ ] **Step 1: Add modal state and import at top of SettingsView**

Add import after line 9 (`import { QRCodeSVG } from "qrcode.react";`):

```tsx
import StaffCreatedModal from "../../components/staff/StaffCreatedModal";
```

Add modal state after the `deviceEnrollmentCopied` state (line 117):

```tsx
const [staffCreatedModal, setStaffCreatedModal] = useState<{
  open: boolean;
  staffName: string;
  rawPin: string;
  enrollmentUrl: string;
  expiresAt: string;
}>({ open: false, staffName: "", rawPin: "", enrollmentUrl: "", expiresAt: "" });
```

- [ ] **Step 2: Rewrite handleInviteStaff to chain API calls and open modal**

Replace the existing `handleInviteStaff` (lines 182-201) with:

```tsx
const handleInviteStaff = async () => {
  if (!activeRestaurant || !inviteName.trim()) return;
  setStaffError("");
  try {
    // Step 1: Create staff member
    const result = await createStaff(activeRestaurant.id, {
      name: inviteName.trim(),
      email: inviteEmail.trim() || undefined,
      role: inviteRole,
    });

    const staffName = result.user.name || inviteName.trim();
    const rawPin = result.rawPin;

    // Step 2: Generate device enrollment QR
    let enrollmentUrl = "";
    let expiresAt = "";
    try {
      const enrollment = await createDeviceEnrollment(activeRestaurant.id);
      enrollmentUrl = enrollment.enrollmentUrl;
      expiresAt = enrollment.expiresAt;
    } catch {
      // Staff created but QR failed — still show modal with error note
    }

    // Open combined modal
    setStaffCreatedModal({
      open: true,
      staffName,
      rawPin,
      enrollmentUrl,
      expiresAt,
    });

    setInviteName("");
    setInviteEmail("");
    setInviteRole("WAITER");
    await fetchStaff();
  } catch (err: any) {
    setStaffError(err.response?.data?.message || "Failed to create staff member");
  }
};
```

- [ ] **Step 3: Remove old inline PIN display card**

Delete the `{/* New PIN display */}` block (lines 898-923) — the `{newStaffPin && ...}` section. Also remove the `newStaffPin` and `newStaffName` state declarations (lines 97-98):

```tsx
// REMOVE these state declarations (lines 97-98):
// const [newStaffPin, setNewStaffPin] = useState<string | null>(null);
// const [newStaffName, setNewStaffName] = useState<string | null>(null);
```

- [ ] **Step 4: Add StaffCreatedModal render at end of component**

Add before the closing `</div>` of the outermost wrapper (before line 1132):

```tsx
<StaffCreatedModal
  open={staffCreatedModal.open}
  onClose={() => setStaffCreatedModal((prev) => ({ ...prev, open: false }))}
  staffName={staffCreatedModal.staffName}
  rawPin={staffCreatedModal.rawPin}
  enrollmentUrl={staffCreatedModal.enrollmentUrl}
  expiresAt={staffCreatedModal.expiresAt}
/>
```

- [ ] **Step 5: Verify frontend builds**

Run: `cd apps/frontend && npm run build`
Expected: Build succeeds. Creating staff now opens modal with QR + PIN.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/pages/Dashboard/SettingsView.tsx
git commit -m "feat: chain staff creation with QR enrollment, show result in StaffCreatedModal"
```

---

### Task 4: Add Re-Bond Button to Staff Table Rows

**Files:**
- Modify: `apps/frontend/src/pages/Dashboard/SettingsView.tsx`

- [ ] **Step 1: Add handleRebondStaff helper function**

Add after `handleRemoveStaff` (after line 213):

```tsx
const handleRebondStaff = async (staffName: string) => {
  if (!activeRestaurant) return;
  setDeviceEnrollmentError("");
  try {
    const result = await createDeviceEnrollment(activeRestaurant.id);
    setStaffCreatedModal({
      open: true,
      staffName,
      rawPin: "",
      enrollmentUrl: result.enrollmentUrl,
      expiresAt: result.expiresAt,
    });
  } catch (err: any) {
    setDeviceEnrollmentError(
      err.response?.data?.message || "Failed to generate re-bond QR",
    );
  }
};
```

- [ ] **Step 2: Add re-bond button to staff table rows**

Modify the `<td>` at line 956 (the actions column) to include a re-bond button before the remove button:

```tsx
<td className="px-4 py-2">
  <div className="flex items-center gap-2">
    {/* Re-bond button */}
    <button
      type="button"
      onClick={() => handleRebondStaff(s.name || s.email)}
      className="text-muted-foreground hover:text-accent transition-colors"
      title="Re-bond device"
    >
      <FontAwesomeIcon icon={faQrcode} />
    </button>
    {s.role !== 'OWNER' && (
      <button
        type="button"
        onClick={() => handleRemoveStaff(s.id)}
        className="text-muted-foreground hover:text-destructive transition-colors"
        title="Remove"
      >
        <FontAwesomeIcon icon={faTrash} />
      </button>
    )}
  </div>
</td>
```

- [ ] **Step 3: Add faQrcode to FontAwesome imports**

Update line 5 — add `faQrcode` to the import:

```tsx
import { faTriangleExclamation, faMedal, faTrash, faCopy, faCheck, faQrcode } from "@fortawesome/free-solid-svg-icons";
```

- [ ] **Step 4: Verify frontend builds**

Run: `cd apps/frontend && npm run build`
Expected: Build succeeds. Each staff row has a QR re-bond button.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/Dashboard/SettingsView.tsx
git commit -m "feat: add per-staff re-bond QR button to staff table"
```

---

### Task 5: Final Integration Check

**Files:** None new — verification only.

- [ ] **Step 1: Run full frontend build**

```bash
cd apps/frontend && npm run build
```
Expected: Build succeeds with no errors or warnings.

- [ ] **Step 2: Smoke test checklist**

Start dev server: `npm run dev` (from root)

Manual tests:
1. Login as OWNER → Dashboard → Settings → Staff tab
2. Verify Shared Device Mode toggle is visible at top of Staff tab
3. Enable Shared Device Mode → verify success message
4. Verify "Bond a Device" standalone QR section works
5. Fill staff form (name + role) → click "Create Staff Account"
6. Verify modal opens with QR code + 4-digit PIN
7. Verify expiry countdown ticks
8. Verify Copy PIN + Copy Link buttons work
9. Close modal → new staff appears in table with re-bond QR button
10. Click re-bond button on existing staff → verify modal opens with QR (no PIN)
11. Switch to General tab → verify Shared Device Mode section is gone

- [ ] **Step 3: Commit any final fixes**

```bash
git add -A
git commit -m "chore: integration fixes from staff settings consolidation"
```

---

## Self-Review

**1. Spec coverage:**
- Move Shared Device Mode to Staff tab — Task 2 Step 2 ✓
- Move Generate Staff Device QR to Staff tab — Task 2 Step 3 ✓
- Chain staff creation with QR enrollment — Task 3 Step 2 ✓
- StaffCreatedModal with QR + PIN — Task 1 Step 1 ✓
- Re-bond button per staff row — Task 4 Step 2 ✓
- Remove old PIN display card — Task 3 Step 3 ✓
- Remove sections from General tab — Task 2 Step 1 ✓
- Shared Device Mode off note — Task 2 Step 2 ✓

**2. Placeholder scan:** No TBDs, TODOs, or "implement later" patterns. Every step has actual code.

**3. Type consistency:** `StaffCreatedModalProps` interface matches state shape `staffCreatedModal`. `handleRebondStaff` signature matches `handleGenerateDeviceEnrollment` pattern. `rawPin` optional in modal (absent for re-bond) — checked in Task 1 Step 1 with `{rawPin ? ... : ...}`.
