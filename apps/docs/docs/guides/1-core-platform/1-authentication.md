---
id: authentication
title: Signing In & Account Access
sidebar_position: 1
---

# Signing In & Account Access

Renova provides dedicated, role-specific access methods so that restaurant owners, managers, frontline employees, and dining guests can sign in with minimal friction and appropriate security.

---

## Access Methods by Role

### 1. Restaurant Owners & Managers
Owners and managers have full access to configuration, menus, staff, financial metrics, and billing.

- **Email & Password**: Register with your email and a secure password. New accounts receive a 6-digit verification code by email to confirm the address.
- **Google Sign-In**: Click **Sign in with Google** to register or log in instantly without creating a separate password.

### 2. Frontline Staff (Waitstaff & Kitchen)
Waitstaff and kitchen crew need rapid access on shared venue tablets or Point-of-Sale (POS) stations during busy shifts.

- **4-Digit PIN**: Staff tap their unique 4-digit PIN on the venue's shared device keypad.
- **Dedicated Redirect**: Entering a waiter PIN opens the **Waiter POS**, while a kitchen PIN opens the **Kitchen Display System**.
- **Role Security**: For security, 4-digit PIN access is restricted exclusively to the `Waiter` and `Kitchen` roles. Owners, managers, and administrative staff must always sign in with their email credentials to safeguard business settings.

### 3. Dining Guests & Customers
Customers can browse the menu anonymously. When they want to save orders, track loyalty rewards, or view VIP progress, they can log in without creating a password.

- **Email Verification Code**: Guests enter their email address and receive a temporary 6-digit code. Submitting the code signs them in.
- **Google Sign-In**: Guests can tap **Sign in with Google** for one-tap access on mobile devices.

---

## How to Sign In as an Owner or Manager

1. Open the Renova login screen or click **Login** in the top navigation bar.
2. Enter your registered email address and password.
3. Click **Sign In**.
4. If this is your first time signing in after registration, check your email inbox for the 6-digit confirmation code, enter it into the verification dialog, and click **Verify**.
5. Once authenticated, you will be taken directly to your **Dashboard**.

---

## How to Set Up and Use Staff Device PIN Login

### Before You Begin
Make sure the staff member has been created in your dashboard under **Settings > Staff** with either the `Waiter` or `Kitchen` role and an assigned 4-digit PIN.

### Enrolling a Shared Venue Tablet
1. On your manager computer or tablet, go to **Settings > Staff**.
2. Locate the **Enrolled Devices** section and click **Enroll Device** to display the device QR code.
3. On the staff tablet, open the camera and scan the enrollment QR code.
4. The tablet will confirm that it is linked to your venue and display the PIN keypad screen.

### Logging In During a Shift
1. On the enrolled tablet, tap your 4-digit PIN on the screen.
2. The screen automatically unlocks:
   - If your role is `Waiter`, the **Waiter POS** opens immediately.
   - If your role is `Kitchen`, the **Kitchen Display System** opens immediately.
3. When you finish taking an order or step away from the terminal, tap **Switch User** or **Lock** at the top right so the next team member can enter their PIN.

---

## Managing Your Account and Security

1. In the top navigation bar, click on your profile icon or name, and select **Profile**.
2. **Account Details**: Review your registered email and profile name.
3. **Linked Sign-In Methods**: View whether your account is connected to Google or uses email credentials.
4. **Active Sessions**: View all devices and web browsers currently logged into your account. Click **Log out of other sessions** to disconnect stale or unfamiliar devices.
5. **Data Privacy**: Export a copy of your personal account data or submit a data removal request.

---

## Important Notes

- **PIN Access Protection**: If an incorrect PIN is entered 5 consecutive times, the keypad temporarily pauses for 10 minutes to prevent unauthorized guessing.
- **Session Duration**: Staff PIN sessions on shared terminals automatically time out after a period of inactivity to prevent accidental order entries under the wrong name.
- **Administrative Roles**: Staff with the `Manager` or `Staff` role manage orders, tables, and settings using their email address and temporary password issued by the owner.

---

## If Something Goes Wrong

- **Forgot Password**: Click the **Forgot Password?** link on the login screen, enter your email address, and follow the instructions sent to your inbox to reset your password.
- **Verification Code Not Received**: Check your spam and junk email folders. If it hasn't arrived after 60 seconds, click **Resend Code** on the verification screen.
- **Device Shows "Device Not Enrolled"**: If a venue tablet loses its setup (for example, if browser history was cleared), open **Settings > Staff** on your manager device and scan the enrollment QR code again.
- **Forgotten Staff PIN**: An owner or manager can open **Settings > Staff**, locate the employee, click **Reset PIN**, and set a new 4-digit code.
