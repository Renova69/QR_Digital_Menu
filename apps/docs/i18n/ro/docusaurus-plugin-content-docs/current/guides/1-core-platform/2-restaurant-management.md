---
id: restaurant-management
title: Managementul Restaurantelor și Multi-Tenancy
sidebar_position: 2
---

# Managementul Restaurantelor

Platforma QR Digital Menu este construită pe o arhitectură multi-tenant, ceea ce înseamnă că un singur cont de utilizator poate crea și gestiona mai multe locații de restaurante distincte.

## Suport Multi-Locație

Fie că deții o singură cafenea sau un lanț de restaurante, le gestionezi pe toate dintr-un panou de control centralizat.

### Ce este izolat per restaurant?
Fiecare restaurant pe care îl creezi acționează ca o locație complet independentă. Următoarele date și setări sunt izolate per restaurant:
- **Meniuri**: Categorii, articole, opțiuni și programe.
- **Mese și coduri QR**: Amenajarea fizică și rutarea QR pentru locație.
- **Comenzi și Analitice**: Date de vânzări în timp real, istoricul comenzilor și feedback-ul clienților.
- **Branding și Teme**: Logo-uri, palete de culori și fonturi.
- **Programe de Loialitate**: Niveluri de recompense, registre de puncte și happy hours.
- **Personal**: Ospătari și personal de bucătărie asociați locației.

## Comutarea Între Locații

Când te conectezi la panoul de control, ți se va solicita să selectezi un restaurant dacă gestionezi mai multe.

Poți comuta fără probleme între locațiile tale folosind selectorul de restaurante din navigarea panoului de control. Când schimbi locația, panoul se reîncarcă instantaneu pentru a afișa comenzile în timp real, analiticele și setările pentru noua locație selectată.

## Setări și Configurare

Pentru fiecare locație, poți configura setări profunde:
- **Localizare**: Definește limbile țintă implicite pentru traducerea automată a meniului.
- **Fus orar**: Setează fusul orar local IANA pentru a te asigura că porționarea zilei (programele meniului), happy hours și datele analitice sunt perfect precise pentru acea locație specifică, în loc să revină la timpul implicit al serverului UTC.
- **Funcționalități**: În funcție de nivelul tău de abonament, activează sau dezactivează anumite funcționalități per locație.
