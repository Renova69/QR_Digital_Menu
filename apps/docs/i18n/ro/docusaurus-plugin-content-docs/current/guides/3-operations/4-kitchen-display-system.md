---
id: kitchen-display-system
title: Sistem de Afișare pentru Bucătărie (KDS)
sidebar_position: 4
---

# Sistem de Afișare pentru Bucătărie (KDS)

Sistemul de Afișare pentru Bucătărie (KDS) este o interfață dedicată, concepută special pentru personalul din bucătărie (back-of-house). Acesta înlocuiește biletele tradiționale de hârtie cu un panou Kanban digital, în timp real.

## Interfața
Accesul la KDS se face la `/staff/kitchen` și dispune de o interfață în mod întunecat (dark mode), cu contrast ridicat (folosind un fundal gri-ardezie și fonturi cu lățime fixă), optimizată pentru a reduce reflexiile în medii de bucătărie puternic iluminate și pentru a maximiza lizibilitatea de la distanță.

### Fluxul de Lucru Kanban
Comenzile curg automat prin trei coloane:
1. **Noi (Albastru)**: Comenzi primite. Sistemul redă o alertă audio când sosește o comandă nouă.
2. **În Curs (Chihlimbar)**: Comenzi pregătite activ de către bucătari.
3. **Gata (Verde)**: Comenzi care sunt pregătite și gata ca un chelner să le ridice și să le servească.

Personalul din bucătărie atinge pur și simplu un card de comandă pentru a-l avansa în coloana următoare. Când o comandă este atinsă în coloana „Gata”, aceasta este marcată ca Finalizată și mutată în vizualizarea istoricului.

## Urmărirea Timpului și Urgența
Pentru a ajuta bucătăriile să gestioneze timpii de preparare, fiecare comandă are un contor de timp scurs care se actualizează la fiecare 10 secunde.

Dacă o comandă este în așteptare de mai mult de 15 minute, aceasta este semnalată automat cu un stil de urgență roșu, atrăgând atenția personalului asupra biletelor întârziate.

## Panoul de Istoric
Dacă se face o greșeală sau bucătăria trebuie să revizuiască o comandă trecută, un comutator dezvăluie Panoul de Istoric. Acesta prezintă o grilă cu toate comenzile finalizate din ultimele 24 de ore, asigurând o trasabilitate completă.
