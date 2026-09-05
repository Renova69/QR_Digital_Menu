---
id: import-export
title: Importul și exportul meniului
sidebar_position: 3
---

# Importul și exportul meniului

Instrumentul de **Import/Export** vă permite să creați copii de siguranță ale datelor din meniu și să efectuați actualizări în masă folosind programe de foi de calcul familiare, precum Microsoft Excel sau Google Sheets. Acest lucru vă economisește ore întregi de muncă atunci când lansați meniuri sezoniere sau ajustați prețurile pentru numeroase preparate.

---

## Ce oferă această funcționalitate

- **Copii de siguranță complete ale meniului**: Exportați întregul catalog de categorii, preparate, prețuri, descrieri, opțiuni și traduceri în orice moment.
- **Flux complet de editare în Excel (Roundtrip)**: Descărcați un fișier Excel (`.xlsx`) preformatat cu mai multe foi de lucru, efectuați modificările offline și reîncărcați fișierul în Renova pentru a aplica ajustările în masă.
- **Formate multiple de export**: Alegeți între formatul Excel (`.xlsx`), fișiere de date JSON sau fișiere standard CSV formatate pentru mediul european.
- **Verificare preliminară înainte de import**: Vizualizați un tabel de previzualizare a preparatelor importate înainte de a confirma modificările, prevenind astfel suprascrierile accidentale.

---

## Cine poate folosi această opțiune

- **Proprietarii și managerii**: Funcționalitatea este disponibilă pe toate planurile de abonament, inclusiv pe planul Free.

---

## Cum să exportați meniul

1. Apăsați pe **Editează meniul** în bara superioară de navigare.
2. Selectați fila **Import/Export**.
3. Alegeți formatul de export dorit în secțiunea **Export**:
   - **Descarcă XLSX** *(Recomandat)*: Descarcă un fișier Excel cu foi de lucru separate pentru categorii, preparate și opțiuni personalizate. Folosiți acest format pentru editarea în foaie de calcul.
   - **Descarcă JSON**: Descarcă un fișier complet de date, ideal pentru copii de siguranță sau pentru transferul meniului către o altă locație.
   - **Descarcă CSV**: Generează un fișier de tip tabel delimitat prin punct și virgulă, util pentru programe de contabilitate sau gestiune a stocurilor.
   - **Copiază JSON**: Copiază datele brute ale meniului direct în memoria clipboard a dispozitivului.
4. Fișierul se va descărca imediat pe computerul dumneavoastră.

---

## Fluxul de editare în masă cu Excel (Excel Roundtrip)

Cea mai eficientă metodă de a actualiza prețurile sau de a introduce zeci de preparate simultan este fluxul cu fișiere Excel:

1. În editorul de meniu, la secțiunea **Import/Export**, apăsați pe **Descarcă XLSX**.
2. Deschideți fișierul în Microsoft Excel, Apple Numbers sau Google Sheets.
3. Editați preparatele:
   - Modificați prețurile în coloana de preț.
   - Actualizați descrierile sau denumirile produselor.
   - Adăugați rânduri noi pentru a crea preparate noi într-o categorie existentă.
4. Salvați fișierul în format `.xlsx`.
5. În panoul Renova, mergeți la fila **Import**.
6. Trageți și plasați fișierul `.xlsx` salvat în zona de încărcare sau apăsați pe **Răsfoiește fișiere** pentru a-l selecta.
7. Renova va analiza foaia de calcul și va afișa un **Tabel de previzualizare** care rezumă categoriile, preparatele și prețurile identificate în fișier.
8. Verificați previzualizarea, apoi apăsați pe **Confirmă importul**.
9. Meniul se actualizează imediat atât în panoul de control, cât și în meniul digital live pentru oaspeți.

---

## Observații importante

- **Păstrați antetele coloanelor**: Când editați în Excel, nu redenumiți, nu reordonați și nu ștergeți rândul de antet din partea superioară a fiecărei foi. Renova se bazează pe aceste denumiri exacte pentru a potrivi fiecare câmp.
- **Formatul prețurilor**: Folosiți exclusiv valori numerice standard pentru prețuri (de exemplu, `12.50`). Nu introduceți simboluri monetare precum `€` sau `lei` în celulele de preț.
- **Traduceri automate**: Dacă adăugați preparate noi în foaia de calcul fără traduceri, sistemul de traducere Renova va genera automat traducerile în fundal pentru toate limbile țintă configurate.

---

## Ce puteți face dacă întâmpinați probleme

- **Fișierul este respins la încărcare**: Asigurați-vă că extensia fișierului este `.xlsx` sau `.json`. Formatele vechi precum `.xls` sau documentele `.doc` nu sunt acceptate.
- **Rânduri invalide în previzualizare**: Dacă un preparat apare cu avertisment în tabelul de previzualizare, asigurați-vă că are o denumire validă și că prețul este un număr pozitiv.
