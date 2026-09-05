---
id: payment-providers
title: Plăți digitale și reconciliere
sidebar_position: 1
---

# Plăți digitale și reconciliere

*(Disponibil în abonamentele Professional și Enterprise)*

Renova permite oaspeților să achite nota de plată direct de pe smartphone-urile lor, eliminând așteptarea aducerii notei pe hârtie, a POS-ului fizic și a bonului tipărit. Încasările sunt transferate direct în contul bancar al companiei dumneavoastră.

---

## Ce oferă această funcționalitate

- **Plată comodă direct la masă (Pay-at-Table)**: Oaspeții verifică nota detaliată cu toate produsele comandate, aleg bacșișul și finalizează plata direct din navigatorul mobil.
- **Integrare cu procesatori de plăți renumiți**: Conectați furnizori consacrați precum **Stripe**, **BORICA**, **ePay.bg** sau **MyPOS**, în funcție de cerințele bancare ale localului.
- **Bacșiș recomandat configurabil**: Afișați oaspeților procente prestabilite de bacșiș (de exemplu, 5%, 10%, 15%, 20%) sau posibilitatea de a introduce o sumă personalizată la finalizarea plății.
- **Alerte în timp real pentru personal**: Plățile finalizate cu succes declanșează o alertă sonoră și colorează imediat masa în verde pe panoul live.
- **Coadă de reconciliere a plăților**: Gestionați și confirmați într-un singur loc tranzacțiile în numerar, plățile prin terminale POS clasice și închiderile manuale de mese, asigurând o balanță contabilă zilnică fără cusur.

---

## Cine poate utiliza această funcționalitate

- **Proprietarii**: Pot conecta procesatorii de plăți, pot configura opțiunile de bacșiș și pot urmări situația încasărilor.
- **Managerii și personalul de servire**: Pot monitoriza mesele achitate, pot aproba cererile de plată cu numerar și pot soluționa tichetele din coada de reconciliere.

---

## Cum se conectează procesatorul de plăți

1. În meniul panoului de control, mergeți la **Setări** și deschideți fila **Plăți**.
2. Activați comutatorul **Activează plățile digitale**.
3. Selectați procesatorul de plăți dorit:
   - **Stripe**: Apăsați pe **Conectare cu Stripe** și parcurgeți pașii standard de verificare a contului. Aceasta activează instant plățile cu cardul bancar, Apple Pay și Google Pay.
   - **BORICA**: Introduceți credențialele de comerciant pentru procesarea locală a plăților cu cardul în Bulgaria.
   - **ePay.bg**: Introduceți numărul de client de comerciant și cheia secretă pentru a accepta plăți prin rețeaua ePay.
   - **MyPOS**: Conectați contul de comerciant MyPOS pentru a unifica terminalele de plată fizice cu plățile digitale.
4. După finalizare, starea conexiunii va fi afișată ca **Conectat**.
5. Configurați **Procentele recomandate de bacșiș** (de exemplu, bifați 10%, 15% și 20%).
6. Apăsați pe **Salvează modificările**. Plățile digitale sunt acum active pentru toate mesele.

---

## Experiența de plată la masă pentru oaspeți

1. Când au terminat masa, oaspeții apasă pe **Cere nota** în meniul digital.
2. Pe ecran apare nota detaliată cu toate preparatele și băuturile comandate în acea sesiune.
3. Oaspeții pot alege să achite întreaga sumă sau să împartă nota. *(Consultați [Împărțirea notei de plată](/guides/payments-integrations/split-bill))*
4. Oaspetele alege procentul de bacșiș dorit sau introduce o sumă manuală.
5. Confirmă plata prin metoda preferată (cum ar fi Apple Pay, Google Pay sau completarea datelor cardului).
6. După autorizare, oaspetele primește confirmarea cu chitanța digitală.
7. În panoul de control și în aplicația POS a restaurantului, masa trece imediat în starea **Achitată (Verde)**, însoțită de o alertă sonoră.

---

## Coada de reconciliere a plăților

Uneori, notele de plată sunt achitate în afara meniului digital (de exemplu, când un oaspete plătește ospătarului în numerar sau pe un terminal POS fizic de la bar). **Coada de reconciliere a plăților** asigură corectitudinea înregistrărilor financiare:

1. În bara laterală a panoului de control, apăsați pe **Plăți**.
2. Dacă o masă a fost închisă manual sau dacă o tranzacție necesită confirmarea personalului, aceasta apare în **Coada de reconciliere**.
3. Personalul poate alege o acțiune:
   - **Rezolvă**: Confirmați modalitatea de încasare a notei (de exemplu, „Încasat numerar la masă” sau „Achitat prin terminal POS fizic”).
   - **Redeschide sesiunea**: Dacă masa a fost închisă din greșeală în timp ce clienții încă servesc masa, redeschideți sesiunea.
   - **Respinge**: Eliminați avertismentele de test sau eronate.
4. Toate tranzacțiile soluționate sunt incluse în rapoartele de vânzări de la finalul turei.

---

## Note importante

- **Încasări directe**: Renova nu reține fondurile restaurantului dumneavoastră. Toate plățile clienților sunt transferate direct prin intermediul procesatorului de plăți conectat către contul bancar al companiei, conform calendarului de viramente al procesatorului.
- **Suport pentru monede**: Plățile digitale sunt procesate în moneda principală a localului (de exemplu, EUR sau BGN), cu valorile în monedă dublă afișate clar pe chitanța clientului.

---

## Depanare și întrebări frecvente

- **Cardul clientului a fost respins**: Pe telefonul oaspetelui apare o notificare prin care este invitat să încerce o altă metodă de plată sau să apese pe **Cheamă ospătarul** pentru a achita în numerar.
- **Masa rămâne galbenă/portocalie deși clientul susține că a plătit**: Verificați secțiunea **Plăți** pentru a vedea dacă tranzacția a fost autorizată cu succes. Dacă plata nu s-a finalizat, personalul poate aduce un terminal POS fizic sau poate încasa numerar.
