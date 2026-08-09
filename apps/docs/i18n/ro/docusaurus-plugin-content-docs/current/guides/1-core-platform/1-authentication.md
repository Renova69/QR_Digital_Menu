---
id: authentication
title: Autentificare și Autentificare
sidebar_position: 1
---

# Autentificare și Autentificare

Platforma QR Digital Menu oferă fluxuri de autentificare distincte și sigure în funcție de rolul tău. Asigurăm o securitate ridicată, reducând în același timp la minimum fricțiunile pentru clienții tăi.

## Pentru proprietarii și managerii de restaurante

În calitate de proprietar sau manager, ai nevoie de acces complet la panoul de administrare pentru a-ți gestiona locațiile.

### Metode de conectare
- **E-mail și parolă**: Poți crea un cont cu un e-mail tradițional și o parolă în timpul înregistrării inițiale.
- **Conectare cu Google**: Pentru comoditate și securitate sporită, te poți conecta direct folosind contul tău Google (OAuth). Dacă folosești Google pentru a te înscrie, ți se creează automat un cont.

### Securitate
Sesiunea ta activă este securizată folosind cookie-uri HTTP-only avansate și protecție CSRF (Cross-Site Request Forgery), asigurându-se că accesul tău administrativ nu poate fi deturnat de site-uri web rău intenționate.

## Pentru clienți

Clienții doresc să vadă meniul și să comande cât mai repede posibil. Am eliminat complet fricțiunea de a-și aminti parolele.

### Metode de conectare
- **OTP prin E-mail (Parolă Unică)**: Clienții introduc adresa lor de e-mail și primesc un cod de 6 cifre prin e-mail. Ei introduc acest cod pentru a se conecta în siguranță. Nu există parole de uitat sau de resetat.
- **Conectare cu Google**: Clienții se pot conecta instantaneu cu contul lor Google.

### Cum funcționează OTP
1. Când un client își introduce e-mailul, este generat un cod sigur de 6 cifre și trimis în căsuța sa de e-mail.
2. Codul expiră în 10 minute.
3. Platforma include protecție încorporată împotriva atacurilor de tip forță brută (brute-force). După 5 încercări eșuate, punctul terminal OTP se blochează timp de 10 minute pentru a proteja contul clientului.

## Pentru personal (Ospătari și Bucătărie)

Personalul restaurantului are nevoie de acces rapid de pe dispozitive partajate în timpul turelor lor, în special atunci când utilizează Sistemul Point of Sale (POS) sau Sistemul de Afișare în Bucătărie (KDS).

### Conectare cu PIN
- **PIN din 4 cifre**: Ospătarii și personalul din bucătărie se autentifică folosind un PIN unic din 4 cifre.
- Acest lucru permite personalului să schimbe rapid utilizatorii pe o tabletă partajată sau un terminal POS fără a introduce e-mailuri și parole lungi.
- **Verificarea securității**: Din motive de securitate, Proprietarii, Managerii și Personalul general nu se pot conecta folosind un PIN din 4 cifre. Conectarea cu PIN este strict rezervată rolurilor `WAITER` și `KITCHEN`, asigurând că conturile administrative nu pot fi accesate printr-un simplu PIN.
