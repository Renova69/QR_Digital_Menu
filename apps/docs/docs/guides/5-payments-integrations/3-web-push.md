---
id: web-push
title: Web Push Notifications
sidebar_position: 3
---

# Web Push Notifications

To ensure you never miss a critical update (like a new order or an urgent call for a waiter), the platform supports VAPID-based Web Push Notifications.

## How it Works
Unlike traditional socket notifications that only work while the dashboard tab is actively open and focused, Web Push Notifications are handled by a background Service Worker. 

This means that even if you minimize your browser or switch to a different app on your device, you will still receive a native system notification when an event occurs.

## Setting Up Notifications
1. When you first log into the dashboard, your browser will prompt you for notification permissions.
2. If you accept, a `PushSubscription` is securely registered with the server.
3. The server uses VAPID keys to send encrypted payloads to your device's push service (e.g., Google FCM, Apple Push Notification service).

## Smart Routing
When you click on a push notification on your device, the Service Worker intelligently intercepts the click and opens the exact page you need. For example, clicking an "Urgent Assistance Request" notification will immediately route you to the Assistance tab in your dashboard, ensuring lightning-fast response times.
