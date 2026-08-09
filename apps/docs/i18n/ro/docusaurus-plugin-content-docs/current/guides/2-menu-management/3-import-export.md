---
id: import-export
title: Import și Export meniu
sidebar_position: 3
---

# Import și Export meniu

Gestionarea manuală a unui meniu mare poate consuma mult timp. Panoul de control oferă o filă combinată **Import/Export** care vă permite să vă gestionați meniul în masă utilizând formate de fișiere standard.

## Exportul meniului dvs.

Puteți exporta datele actuale ale meniului pentru a le salva în siguranță sau pentru a le edita offline.
- **Descărcare JSON**: Generează un fișier de date brute potrivit pentru backup-uri și reimportări.
- **Descărcare XLSX**: Generează un registru de lucru Excel cu mai multe foi. Acesta este formatul recomandat dacă doriți să editați datele meniului, prețurile și traducerile folosind un software pentru foi de calcul.
- **Descărcare CSV**: Generează un fișier CSV standard (folosind formatarea locală europeană cu delimitatori punct și virgulă) pentru un import ușor în software-ul de contabilitate sau de inventar.

## Importul meniului dvs.

Puteți crea sau actualiza în masă meniul dvs. prin importul unui fișier. Platforma acceptă atât formatele `.json`, cât și `.xlsx`.

### Ciclul complet cu Excel (XLSX)
Cel mai simplu mod de a gestiona un meniu mare este ciclul complet cu Excel:
1. Accesați fila Export și faceți clic pe **Descărcare XLSX**.
2. Deschideți fișierul în Excel, adăugați articole noi, actualizați prețurile sau ajustați descrierile.
3. Accesați fila Import și încărcați fișierul XLSX modificat.
4. Sistemul va previzualiza modificările. Odată confirmat, meniul dvs. este actualizat instantaneu.

### Traduceri automate
Dacă fișierul dvs. importat nu are traduceri pentru anumite limbi, integrarea platformei cu DeepL va detecta automat limbile lipsă și va traduce noile articole pentru dvs. în timpul procesului de import.

### Import JSON & OCR
Dacă faceți tranziția de la un alt sistem sau utilizați instrumente de recunoaștere optică a caracterelor (OCR) pentru a digitaliza un meniu pe hârtie, puteți încărca fișierul JSON rezultat direct. Conducta de import gestionează validarea DTO și transferă cu grație orice conținut tradus anterior în baza de date fără a necesita re-traducere.
