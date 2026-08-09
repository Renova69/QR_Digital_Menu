---
id: translation-system
title: Sistem de traducere automată
sidebar_position: 4
---

# Sistem de traducere automată

O caracteristică de bază a platformei este sistemul de traducere automată a meniului, susținut de DeepL. Oferind un meniu multilingv, puteți servi turiști și diverse categorii demografice fără niciun efort manual suplimentar.

## Cum funcționează

Vă creați meniul în limba dvs. principală (de ex., română sau engleză). Sistemul se ocupă de restul automat. Există trei moduri în care au loc traducerile:

1. **Pre-încălzire în fundal (Background Pre-warming)**: Ori de câte ori creați sau actualizați o categorie, un articol sau o opțiune, sistemul îl traduce tăcut în limbile țintă configurate, în fundal. Acest lucru nu vă încetinește fluxul de lucru.
2. **La cerere (Lazy On-Demand)**: Dacă un client selectează o limbă în meniul public care nu a fost încă tradusă, platforma interceptează cererea, apelează DeepL, stochează rezultatul în memoria cache a bazei de date și servește meniul complet tradus. Memoria cache asigură că vizitele ulterioare sunt extrem de rapide.
3. **Traducere manuală în masă**: Dacă doriți să forțați traducerea întregului meniu dintr-o dată, puteți merge la **Setări > Localizare** și puteți face clic pe „Traduceți totul acum”.

## Gestionarea limbilor

În **Setările** panoului dvs. de control, puteți specifica limbile pe care doriți să le vizați. Meniul public acceptă în prezent până la 12 limbi, inclusiv EN, BG, RO, DE, ES, FR, IT, ZH, EL, JA, RU și AR.

Când un client vă vizitează meniul, sistemul detectează automat preferința de limbă a browserului său și servește traducerea adecvată. Aceștia pot, de asemenea, să schimbe manual limba folosind steagurile din bara de navigare de sus.

## Ce se traduce?
Sistemul traduce aproape totul, inclusiv:
- Numele categoriilor
- Numele și descrierile articolelor
- Variațiile opțiunilor din meniu (de ex., „Gătit mediu”)
- Etichetele dietetice și avertismentele privind alergenii

## Gestionat de platformă
Spre deosebire de alte sisteme care vă solicită să vă generați și să vă gestionați propriile chei API, integrarea noastră DeepL este complet gestionată de platformă. Nu trebuie să configurați chei API sau să plătiți direct pentru cotele de traducere.
