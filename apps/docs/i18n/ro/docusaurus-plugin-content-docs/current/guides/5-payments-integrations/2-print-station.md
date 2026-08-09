---
id: print-station
title: Integrare Stație de Imprimare
sidebar_position: 2
---

# Integrare Stație de Imprimare

*(Disponibil pentru planurile PROFESSIONAL și ENTERPRISE)*

Deși platforma este în primul rând digitală, multe bucătării și baruri se bazează încă pe bonuri fizice de hârtie. Subsistemul **Stație de Imprimare** acoperă acest decalaj, permițându-vă să imprimați automat chitanțe termice atunci când sosesc comenzile.

## Cum Funcționează
Platforma comunică cu o aplicație Android de Emulare Imprimantă (`escpresso`) care rulează în rețeaua dvs. locală. 

1. **Alocare Stație**: În panoul de control, puteți defini diferite Stații de Imprimare (de ex., "Imprimantă Bucătărie", "Imprimantă Bar").
2. **Rutare Categorii**: Puteți direcționa categorii specifice din meniu către anumite imprimante. De exemplu, toate articolele din categoria "Cocktail-uri" vor fi imprimate doar la Imprimanta de Bar, în timp ce "Feluri Principale" se vor imprima la Imprimanta din Bucătărie.
3. **Autentificare**: Fiecare imprimantă se conectează securizat la platformă folosind un `PrintAgentToken` unic.

## Personalizare Chitanță
Sistemul generează tichete ESC/POS (standardul industriei pentru imprimantele termice de chitanțe). 
- Acceptă complet caractere chirilice (crucial pentru meniurile bulgare/rusești).
- Puteți personaliza șablonul chitanței per stație, ajustând antetul, subsolul și dimensiunile fonturilor pentru a se potrivi preferințelor bucătăriei dvs.

## Fiabilitate
Dacă o imprimantă rămâne fără hârtie sau își pierde conexiunea, platforma urmărește starea `PrintJob`. Ea face distincția între stările `PENDING`, `PRINTING`, `COMPLETED` și `FAILED`, asigurând că niciun tichet nu se pierde vreodată în tăcere. Puteți monitoriza starea tuturor imprimantelor direct din vizualizarea **Stații de Imprimare** din panoul de control.
