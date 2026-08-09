---
id: web-push
title: Notificări Web Push
sidebar_position: 3
---

# Notificări Web Push

Pentru a vă asigura că nu ratați niciodată o actualizare critică (cum ar fi o comandă nouă sau un apel urgent pentru un chelner), platforma acceptă Notificări Web Push bazate pe VAPID.

## Cum Funcționează
Spre deosebire de notificările tradiționale prin socket care funcționează doar atâta timp cât fila panoului de control este activ deschisă și focalizată, Notificările Web Push sunt gestionate de un Service Worker care rulează în fundal. 

Acest lucru înseamnă că, chiar dacă minimizați browserul sau treceți la o altă aplicație pe dispozitivul dvs., veți primi totuși o notificare de sistem nativă atunci când apare un eveniment.

## Configurarea Notificărilor
1. Când vă conectați pentru prima dată la panoul de control, browserul dvs. vă va solicita permisiuni pentru notificări.
2. Dacă acceptați, se înregistrează în siguranță o `PushSubscription` pe server.
3. Serverul folosește chei VAPID pentru a trimite sarcini utile criptate către serviciul push al dispozitivului dvs. (de ex., Google FCM, Apple Push Notification service).

## Rutare Inteligentă
Când faceți clic pe o notificare push pe dispozitivul dvs., Service Worker interceptează inteligent clicul și deschide exact pagina de care aveți nevoie. De exemplu, dacă faceți clic pe o notificare de „Cerere Asistență Urgentă”, veți fi direcționat imediat la fila Asistență din panoul dvs. de control, asigurând timpi de reacție fulgerători.
