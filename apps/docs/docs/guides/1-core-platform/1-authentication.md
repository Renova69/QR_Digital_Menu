---
id: authentication
title: Authentication & Login
sidebar_position: 1
---

# Authentication & Login

The QR Digital Menu platform provides distinct, secure authentication flows depending on your role. We ensure high security while minimizing friction for your customers.

## For Restaurant Owners & Managers

As an owner or manager, you require full access to the admin dashboard to manage your venues.

### Login Methods
- **Email & Password**: You can create an account with a traditional email and password during your initial registration.
- **Google Sign-In**: For convenience and enhanced security, you can sign in directly using your Google account (OAuth). If you use Google to sign up, an account is automatically created for you.

### Security
Your active session is secured using advanced HTTP-only cookies and CSRF (Cross-Site Request Forgery) protection, ensuring your administrative access cannot be hijacked by malicious websites.

## For Customers

Customers want to view the menu and order as quickly as possible. We've removed the friction of remembering passwords entirely.

### Login Methods
- **Email OTP (One-Time Password)**: Customers enter their email address and receive a 6-digit code via email. They enter this code to securely log in. There are no passwords to forget or reset.
- **Google Sign-In**: Customers can log in instantly with their Google account.

### How OTP Works
1. When a customer enters their email, a secure 6-digit code is generated and sent to their inbox.
2. The code expires in 10 minutes.
3. The platform includes built-in brute-force protection. After 5 failed attempts, the OTP endpoint locks for 10 minutes to protect the customer's account.

## For Staff (Waiters & Kitchen)

Restaurant staff need fast, shared-device access during their shifts, particularly when using the Point of Sale (POS) or Kitchen Display System (KDS).

### PIN Login
- **4-Digit PIN**: Waiters and kitchen staff authenticate using a unique 4-digit PIN.
- This allows staff to quickly switch users on a shared tablet or POS terminal without typing long emails and passwords.
- **Security Check**: For security reasons, Owners, Managers, and general Staff cannot log in using a 4-digit PIN. PIN login is strictly reserved for `WAITER` and `KITCHEN` roles, ensuring administrative accounts cannot be accessed via a simple PIN.
