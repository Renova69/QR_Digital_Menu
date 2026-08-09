---
title: Afișaj bucătărie
sidebar_label: Afișaj bucătărie
sidebar_position: 3
---

# Afișaj bucătărie

Afișajul bucătăriei la `/staff/kitchen` este conceput pentru un ecran sau o tabletă partajată în bucătărie. Dispozitivele cu rol de bucătărie sunt direcționate către această vizualizare după autentificare.

Comenzile active sunt grupate în coloanele **În așteptarea plății**, **Nou**, **În curs** și **Gata**. Comenzile plătite sau cu plată ulterioară intră în fluxul de pregătire; avansarea unei comenzi o mută apoi prin `NEW → IN_PROGRESS → SERVED → COMPLETED`. Cardurile includ detaliile disponibile despre masă, articol și cerere.

Comenzile finalizate părăsesc panoul activ și rămân disponibile în istoricul încorporat timp de 24 de ore. Actualizările eșuate de stare rămân vizibile astfel încât personalul să poată reîncerca în loc să piardă în tăcere acțiunea.
