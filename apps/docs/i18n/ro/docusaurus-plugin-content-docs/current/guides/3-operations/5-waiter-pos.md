---
id: waiter-pos
title: POS pentru Chelneri (Punct de Vânzare)
sidebar_position: 5
---

# POS pentru Chelneri (Punct de Vânzare)

POS-ul pentru Chelneri este o interfață rapidă, axată pe dispozitive mobile (mobile-first), concepută pentru ca personalul tău să preia rapid comenzi direct la masă. Acesta funcționează complet independent de meniul QR destinat clienților pentru a se asigura că fluxurile de lucru ale personalului nu interferează niciodată cu sesiunile clienților.

## Design Axat pe Dispozitive Mobile
Aspectul POS elimină navigarea standard a panoului de control pentru a oferi o experiență pe tot ecranul pe dispozitive mobile și tablete. Folosește o structură de grilă densă, cu 2 coloane pentru articolele din meniu (afișând doar numele și prețurile, fără imagini) pentru a maximiza viteza și eficiența pe dispozitivele Android sau iOS de gamă medie.

## Preluarea Comenzilor

### Selectarea Mesei
Chelnerii încep prin selectarea unei mese dintr-o grilă codificată pe culori. Dacă o masă este deja ocupată (de ex., clienții au comandat prin cod QR), chelnerul poate deschide sesiunea mesei respective. POS-ul va încărca istoricul complet al comenzilor de la masa respectivă ca articole doar în citire (read-only), iar orice articole noi pe care le adaugă chelnerul vor fi urmărite separat ca „în așteptare” (pending).

### Alocarea Locurilor și Note
Pentru a facilita notele de plată separate și livrarea precisă, chelnerii pot atribui articole la anumite locuri (de ex., Locul 1, Locul 2 sau Împărțit).

La atingerea unui articol din meniu, dacă are variații sau completări, se deschide un sertar (drawer) care permite chelnerului să selecteze acele opțiuni și, opțional, să adauge o notă text personalizată pentru bucătărie (de ex., "fără sare", "extra lămâie").

### Trimiterea către Bucătărie
Când chelnerul apasă „Trimite Comanda”, doar articolele *noi, în așteptare* sunt trimise la bucătărie. Sesiunea activă rămâne deschisă. Bucătăria primește comanda perfect formatată, grupând articolele după locurile alocate.

## Închiderea Sesiunilor
Când este timpul să fie achitată nota, chelnerul are trei opțiuni pentru a încheia sesiunea:
1. **Trimite Comanda (Submit Order)**: Păstrează sesiunea deschisă pentru mai multe comenzi.
2. **Plătit cu Cardul (Paid by Card)**: Marchează sesiunea ca achitată complet folosind un terminal POS integrat (de ex., MyPOS), eliberând masa pentru următorul client.
3. **Închidere Forțată (Force Close)**: Închide manual sesiunea fără a procesa o plată (util pentru plățile în numerar sau corectarea erorilor).

Chelnerii pot, de asemenea, să genereze o Notă QR pentru a o arăta clientului, permițându-i clientului să plătească de pe propriul telefon prin Stripe, dacă preferă.
