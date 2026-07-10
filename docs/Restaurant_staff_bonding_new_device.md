# Restaurant Staff Bonding For New Devices

## The issue

Two restaurants open next to each other , rest1 and rest2 ,
both owner/managers do onboarding and create a new restaurant with food menu and staff. Staff got their own pin and separate devices as phones/tables for POS and KDS screens.

waiter from rest1 take a new phone and goes where? as phone new going to /device-login but it shows /login page that requires user/pass and its ment for owner/manager login.

How staff from rest1 and rest2 are entering to /device-login on a new phone ? How phone would now to log them properly , for example waiter1 to rest1 and waiter2 to rest2

## Goal

Create a QR-based device enrollment flow so staff can use a new phone/tablet for POS or KDS without needing the owner/manager username and password on that device.

The key missing concept is **restaurant-device bonding**:

- A staff PIN identifies a staff member inside one restaurant.
- A new device does not know which restaurant it belongs to.
- A manager must securely bind the device to a restaurant before staff can use `/device-login`.

## Target Flow

1. Owner or manager logs into the dashboard on an already trusted admin device.
2. They go to `Settings -> Staff` or `Settings -> Shared Device Mode`.
3. They click `Generate Staff Device QR`.
4. The backend creates a short-lived device enrollment token for the active restaurant.
5. The dashboard displays a QR code.
6. Staff scans the QR on the new phone/tablet.
7. The QR opens:

```txt
/device-enroll?token=<short-lived-token>
```

8. The new device calls the backend to verify the token.
9. Backend returns safe restaurant info like:

```json
{
  "restaurantId": "rest1",
  "restaurantName": "Rest 1",
  "allowedModes": ["POS", "KDS"]
}
```

10. Frontend stores the bonding config in `localStorage.sharedDevice`.
11. Frontend redirects to `/device-login`.
12. Staff enters their PIN.
13. Backend checks `{ restaurantId, pin }`.
14. Staff is redirected by role:
    - `WAITER` -> `/staff/pos`
    - `KITCHEN` -> `/staff/kitchen`
    - `MANAGER` -> `/dashboard`

## Why This Fixes The Current Gap

Today, a new phone going to `/device-login` has no restaurant context.

With QR bonding:

- A Rest 1 QR bonds the phone to Rest 1.
- A Rest 2 QR bonds the phone to Rest 2.
- Waiter PINs are checked only inside the bonded restaurant.
- The same PIN can safely exist in two restaurants because the lookup is scoped by `restaurantId`.

## Backend Design

### Data Model

Add a device enrollment token model.

Suggested Prisma model:

```prisma
model DeviceEnrollmentToken {
  id           String   @id @default(cuid())
  tokenHash    String   @unique
  restaurantId String
  createdById  String
  expiresAt    DateTime
  usedAt       DateTime?
  createdAt    DateTime @default(now())

  restaurant   Restaurant @relation(fields: [restaurantId], references: [id], onDelete: Cascade)
  createdBy    User       @relation(fields: [createdById], references: [id], onDelete: Cascade)

  @@index([restaurantId])
  @@index([expiresAt])
}
```

Important security detail: store only a hash of the token, not the raw token.

### New Endpoints

#### `POST /api/restaurants/:id/device-enrollment`

Purpose: generate a QR enrollment token.

Auth:

- `OWNER`
- assigned `MANAGER`

Request body:

```json
{
  "mode": "STAFF_DEVICE"
}
```

Response:

```json
{
  "enrollmentUrl": "http://192.168.0.3:3001/device-enroll?token=raw-token",
  "expiresAt": "2026-05-13T19:30:00.000Z"
}
```

Rules:

- Token expires quickly, for example after 10 minutes.
- Token can be single-use or reusable until expiry. Single-use is safer.
- Rate limit generation, for example 10 per minute per restaurant.

#### `POST /api/device-enrollment/verify`

Purpose: verify token from scanned QR and return restaurant bonding details.

Auth:

- Public endpoint.
- Token itself is the authorization.

Request body:

```json
{
  "token": "raw-token"
}
```

Response:

```json
{
  "restaurantId": "rest1",
  "restaurantName": "Rest 1",
  "allowedModes": ["POS", "KDS"]
}
```

Rules:

- Hash incoming token and compare with stored `tokenHash`.
- Reject expired tokens.
- Reject already-used tokens if single-use.
- Mark token as used after successful verification if single-use.
- Do not return secrets, owner info, staff list, or PIN data.

## Frontend Design

### Manager QR Generation UI

Location:

- `Settings -> Staff`, or
- `Settings -> General -> Shared Device Mode`

Add button:

```txt
Generate Staff Device QR
```

When clicked:

1. Call `POST /api/restaurants/:id/device-enrollment`.
2. Display QR code for `enrollmentUrl`.
3. Show expiry countdown.
4. Include fallback copy link button.

Recommended UI states:

- Idle: button only.
- Loading: generating QR.
- Ready: QR + expiry countdown + copy link.
- Expired: disable QR and show `Generate new QR`.
- Error: show concise message.

### New Page: `/device-enroll`

Purpose: landing page when a staff member scans the QR.

Behavior:

1. Read `token` from query string.
2. If missing, show invalid enrollment link.
3. Call `POST /api/device-enrollment/verify`.
4. Save response:

```ts
localStorage.setItem(
  "sharedDevice",
  JSON.stringify({
    restaurantId,
    restaurantName,
    allowedModes,
    bondedAt: new Date().toISOString(),
  }),
);
```

5. Redirect to `/device-login`.

Page states:

- Verifying device...
- Device ready for Rest 1
- Invalid or expired link
- Retry / scan a new QR

### Existing `/device-login`

Update behavior:

- If `localStorage.sharedDevice` exists, show PIN keypad.
- If missing, show:

```txt
This device is not linked to a restaurant.
Ask a manager to scan the Staff Device QR from Settings.
```

Optional:

- Add `Scan QR` helper text.
- Add `I am a manager` link to `/login`.

## Security Rules

- Do not put `restaurantId` alone in QR as the only proof.
- QR should contain an opaque random token.
- Backend verifies token and decides which restaurant it belongs to.
- Token should expire quickly.
- Token should be stored hashed.
- Token should be generated only by owner/manager.
- PIN login should continue to check `{ restaurantId, pin }`.
- PIN login should not accept only `pin`.
- `/device-enroll` should not log in a staff user. It only bonds the device.
- Staff authentication still happens at `/device-login`.

## Edge Cases

### Two Restaurants Next To Each Other

Rest 1 and Rest 2 can both generate QR codes.

- Scanning Rest 1 QR bonds the phone to Rest 1.
- Scanning Rest 2 QR bonds the phone to Rest 2.
- A waiter from Rest 1 cannot log into a Rest 2-bonded phone unless their PIN exists for Rest 2.

### Staff Gets A New Phone

Manager opens dashboard, generates QR, staff scans it, then enters PIN.

### Device Was Bonded To Wrong Restaurant

Manager can:

- open `/device-login`,
- use a future `Reset Device` action,
- or scan the correct restaurant QR, replacing `localStorage.sharedDevice`.

Recommended: add a small manager-only reset flow later.

### QR Expires Before Staff Scans

Show invalid/expired link and ask manager to generate a new QR.

### Phone Clears Browser Storage

Device bonding is lost.

Staff must scan a new manager-generated QR.

## Implementation Phases

### Phase 1: Backend Token Infrastructure

- Add Prisma model for device enrollment tokens.
- Add migration.
- Create service for generating and verifying tokens.
- Hash raw token before storing.
- Add expiry and used-at logic.

### Phase 2: Backend Endpoints

- Add `POST /api/restaurants/:id/device-enrollment`.
- Add `POST /api/device-enrollment/verify`.
- Reuse existing restaurant access logic:
  - owner allowed
  - assigned manager allowed
- Add rate limiting.

### Phase 3: Frontend QR UI

- Add QR generation section in Settings.
- Use existing QR library if available.
- Show QR, expiry, and copy-link fallback.

### Phase 4: Device Enrollment Page

- Create `/device-enroll`.
- Verify token.
- Save `sharedDevice`.
- Redirect to `/device-login`.

### Phase 5: Polish And Manual Testing

Manual test checklist:

- Rest 1 manager generates QR.
- New phone scans QR.
- Phone bonds to Rest 1.
- Rest 1 waiter PIN opens POS.
- Rest 1 kitchen PIN opens KDS.
- Rest 2 waiter PIN does not work on Rest 1-bonded device unless that PIN belongs to Rest 1.
- Expired QR fails cleanly.
- Reused single-use QR fails cleanly.

## Open Decisions

- Should QR tokens be single-use or reusable until expiry?
- Should managers choose device mode in QR generation?
  - POS only
  - KDS only
  - POS + KDS
- Should a bonded device have a visible reset button?
- Should device bonding be stored only in localStorage, or should the backend also track registered devices?

## Recommended Defaults

- Single-use token.
- 10-minute expiry.
- QR generated by owner/manager only.
- Store only token hash.
- Keep bonding in localStorage for first implementation.
- Add backend registered devices later only if audit/history/revocation becomes necessary.

## IMPLEMENTATION DONE 13.05.2026 at time 19:40

Implemented the QR-based staff device bonding flow without hardcoded restaurant/staff examples.

What’s included:

Added DeviceEnrollmentToken Prisma model and migration:

migration.sql

Added backend QR enrollment generation:

POST /api/restaurants/:id/device-enrollment

Added backend token verification:

POST /api/device-enrollment/verify

Tokens are random, hashed in DB, single-use, and expire after 10 minutes.

Added Settings QR UI using QRCodeSVG.

Added /device-enroll?token=... page that verifies the token, stores the bonded restaurant in localStorage.sharedDevice, then redirects to /device-login.

Updated /device-login missing-config message to tell staff to scan the manager-generated QR.

Verification passed:

npm.cmd --workspace backend exec -- nest build

npm.cmd --workspace frontend run build

npm.cmd --workspace backend exec -- prisma validate
