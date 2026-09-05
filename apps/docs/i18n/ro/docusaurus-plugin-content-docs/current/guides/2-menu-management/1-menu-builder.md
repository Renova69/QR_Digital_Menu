---
id: menu-builder
title: Constructorul de meniu digital
sidebar_position: 1
---

# Constructorul de meniu digital

**Constructorul de meniu** este locul în care creați, organizați și actualizați meniul digital al restaurantului dumneavoastră. Acesta pune la dispoziție un editor vizual intuitiv pentru categorii, preparate, opțiuni de personalizare, etichete de preferințe alimentare, avertismente privind alergenii și încărcarea fotografiilor.

---

## Ce oferă această funcționalitate

- **Structură ierarhică clară a meniului**: Organizați preparatele în categorii bine ordonate (cum ar fi Aperitive, Paste, Grătar, Deserturi, Cocktailuri).
- **Detalii despre preparate și fotografii**: Puneți în valoare imagini apetisante, descrieri detaliate și prețuri afișate în două monede (de exemplu, EUR și BGN).
- **Transparență privind preferințele alimentare și alergenii**: Adăugați etichete de preferințe alimentare (Vegan, Vegetarian, Picant) și mențiuni oficiale despre alergeni (Gluten, Lactoză, Nuci, Pește). Oaspeții pot filtra meniul direct după aceste etichete.
- **Variante și opțiuni suplimentare plătite**: Permiteți oaspeților să selecteze gramajul, gradul de gătire sau ingrediente suplimentare, cu calcul automat al prețului.
- **Comutator rapid de disponibilitate**: Marcați rapid preparatele epuizate în timpul unei ture, fără a fi nevoie să le ștergeți din meniu.
- **Auditul de calitate a meniului (Menu Health Audit)**: Un asistent automat care scanează meniul și vă avertizează în privința fotografiilor lipsă, a traducerilor incomplete sau a preparatelor fără preț.

---

## Cine poate folosi această opțiune

- **Proprietarii și managerii**: Au acces complet pentru a crea, edita, reordona și șterge categorii și preparate.
- **Personalul și ospătarii**: Pot vizualiza meniul în interfețele operaționale, dar nu pot modifica detaliile sau prețurile preparatelor.

---

## Cum să creați o categorie de meniu

1. În bara superioară de navigare a panoului de control, apăsați pe **Editează meniul**.
2. Asigurați-vă că vă aflați în fila **Preparate**.
3. Apăsați pe butonul **Adaugă categorie**.
4. Completați detaliile categoriei:
   - **Numele categoriei**: Introduceți denumirea (de exemplu, „Feluri principale”).
   - **Descriere** *(Opțional)*: O scurtă notă introductivă pentru categorie.
   - **Imagine de fundal (Banner)** *(Opțional)*: Încărcați o imagine reprezentativă pentru antetul categoriei.
   - **Comutator categorie de băuturi**: Dacă această categorie conține băuturi, bifați **Categorie de băuturi — recomandă băuturi la finalizarea comenzii**. Această setare activează sugestii automate de băuturi atunci când oaspeții își revizuiesc coșul.
   - **Disponibilitate**: Alegeți **Mereu disponibil** (implicit), **Ascuns** (salvat pentru utilizare sezonieră) sau **Programat** (pentru a fi vizibil doar la micul dejun, prânz sau cină).
5. Apăsați pe **Salvează categoria**.

---

## Cum să adăugați un preparat în meniu

1. În lista de categorii din partea stângă a editorului de meniu, apăsați pe categoria în care doriți să introduceți preparatul.
2. Apăsați pe **Adaugă preparat**.
3. În formularul de creare a preparatului, completați:
   - **Numele preparatului**: Denumirea produsului (de exemplu, „Tagliatelle cu trufe”).
   - **Preț**: Introduceți prețul de bază. Renova calculează automat echivalentul în moneda secundară.
   - **Descriere**: Menționați ingredientele, modul de preparare sau mărimea porției.
   - **Fotografie**: Apăsați pentru a încărca o fotografie clară (formate JPEG, PNG sau WebP).
   - **Etichete de preferințe și alergeni**: Selectați din selectorul de etichete (de exemplu, Vegetarian, Gluten, Ouă, Lapte).
   - **Comutator Disponibil**: Asigurați-vă că este activat pentru ca preparatul să fie vizibil clienților.
   - **Preparate asociate (Recomandări de asociere)**: Selectați până la 3 produse complementare (cum ar fi un vin potrivit sau o garnitură) pentru a fi afișate drept „Recomandarea bucătarului” atunci când oaspetele adaugă preparatul în coș.
4. Apăsați pe **Salvează preparatul**. Produsul este publicat instantaneu în meniul digital live.

---

## Configurarea variantelor și a opțiunilor suplimentare

Pentru preparate care necesită opțiuni din partea clientului (cum ar fi gradul de gătire al cărnii sau volumul băuturii) ori oferă ingrediente extra (cum ar fi sos suplimentar sau brânză):

1. Identificați preparatul în editorul de meniu și apăsați pe **Gestionează opțiuni**.
2. Apăsați pe **Adaugă grup de opțiuni**.
3. Stabiliți parametrii grupului:
   - **Numele grupului**: De exemplu, „Alege mărimea” sau „Opțiuni suplimentare”.
   - **Tipul opțiunii**:
     - **Variantă**: Opțiuni care se exclud reciproc, unde clientul trebuie să aleagă exact una (de exemplu: Mic, Mediu, Mare). Activați opțiunea **Obligatoriu**.
     - **Opțiune suplimentară (Add-on)**: Suplimente opționale unde clientul poate alege niciuna, una sau mai multe (de exemplu: Bacon crocant, Avocado).
4. Adăugați opțiunile individuale în cadrul grupului:
   - Introduceți **Numele opțiunii** (de exemplu, „Mare”).
   - Introduceți **Modificatorul de preț** (de exemplu, `+2.50` pentru a adăuga 2,50 €, sau `0.00` dacă este inclus în prețul de bază).
5. Apăsați pe **Salvează opțiunile**. La adăugarea în coș și finalizarea comenzii, prețurile sunt calculate automat și validate cu exactitate.

---

## Utilizarea auditului de calitate a meniului (Menu Health Audit)

În partea dreaptă a editorului de meniu (sau sub lista de produse pe ecranele mobile), secțiunea **Audit calitate meniu** analizează permanent meniul dumneavoastră:

- **Erori**: Semnalează probleme critice, cum ar fi preparate cu preț de 0,00 € sau categorii care nu conțin niciun produs.
- **Avertismente**: Evidențiază preparatele fără descriere sau fără traduceri în limbile selectate.
- **Sugestii**: Vă amintește de preparatele care nu au fotografie (meniurile cu imagini atractive de calitate înregistrează o creștere a comenzilor de până la 30%).

Apăsați pe **Rezolvă** lângă oricare dintre recomandările din audit pentru a naviga direct la acel preparat sau categorie.

---

## Gestionarea preparatelor existente

- **Reordonarea categoriilor**: Apăsați și țineți apăsat pe mânerul de tragere de lângă titlul categoriei, glisați în sus sau în jos în ordinea dorită și eliberați.
- **Editarea detaliilor**: Apăsați pe pictograma în formă de creion de pe cardul oricărei categorii sau oricărui preparat pentru a actualiza numele, prețul sau descrierea.
- **Marcare ca Indisponibil**: Comutați butonul verde **Disponibil** pe poziția oprit. Preparatul va apărea instantaneu ca indisponibil în meniul oaspeților, fără a-i pierde opțiunile sau configurările.
- **Ștergerea unui preparat**: Apăsați pe pictograma coșului de gunoi de lângă preparat și confirmați acțiunea.
- **Ștergerea unei categorii**: Apăsați pe pictograma coșului de gunoi din antetul categoriei și confirmați ștergerea.

---

## Observații importante

- **Actualizări în timp real**: Orice modificare salvată în Editorul de meniu se reflectă imediat pe telefoanele clienților la următoarea lor acțiune pe ecran sau la reîmprospătare.
- **Denumiri clare pentru opțiuni**: Dacă oferiți mai multe variante într-un grup, asigurați-vă că denumirile sunt distincte și clare (de exemplu, „În sânge”, „Mediu”, „Bine făcut”).

---

## Ce puteți face dacă întâmpinați probleme

- **Încărcarea imaginii eșuează**: Asigurați-vă că fișierul de imagine este în format JPEG, PNG sau WebP și are o dimensiune mai mică de 10 MB.
- **Preparatul nu apare în meniul mobil**: Verificați dacă preparatul este marcat ca **Disponibil**, dacă respectiva categorie părinte este setată pe **Mereu disponibil** (sau se încadrează în programul orar curent) și reîmprospătați pagina browserului de pe telefon.
