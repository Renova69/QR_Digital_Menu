---
title: Afișaj Bucătărie
sidebar_label: Afișaj Bucătărie
sidebar_position: 3
---

# Afișaj Bucătărie

Afișajul bucătăriei de la `/staff/kitchen` este conceput pentru un ecran comun sau o tabletă de bucătărie. Dispozitivele cu rol de bucătărie sunt direcționate către această vizualizare după autentificare.

Comenzile active sunt grupate în coloanele **În Așteptarea Plății**, **Nou**, **În Curs** și **Gata**. Comenzile plătite sau cu plată ulterioară intră în fluxul de pregătire; avansarea unei comenzi o mută apoi prin `NEW → IN_PROGRESS → SERVED → COMPLETED`. Cardurile includ masa disponibilă, articolul și detaliile cererii.

Comenzile finalizate părăsesc panoul activ și rămân disponibile în istoricul încorporat timp de 24 de ore. Actualizările de stare eșuate rămân vizibile, astfel încât personalul să poată reîncerca în loc să piardă în tăcere acțiunea.
