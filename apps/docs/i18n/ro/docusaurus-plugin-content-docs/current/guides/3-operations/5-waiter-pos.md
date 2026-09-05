---
id: waiter-pos
title: POS mobil pentru ospătari
sidebar_position: 5
---

# POS mobil pentru ospătari

*(Disponibil în abonamentul Enterprise)*

**Aplicația POS pentru ospătari (Point of Sale)** este o interfață rapidă, optimizată pentru dispozitive mobile, concepută pentru ca personalul de servire să preia comenzi direct la masă de pe smartphone-uri sau tablete, să atribuie preparatele pe locuri la masă, să trimită comenzile la bucătărie și să închidă notele de plată.

---

## Ce oferă această funcționalitate

- **Design pe tot ecranul pentru mobil**: Elimină elementele administrative inutile pentru a oferi ospătarilor o grilă aerisită și rapidă pentru introducerea comenzilor.
- **Selectarea meselor pe zone**: Selectați mesele organizate după zonele fizice ale localului (Sala principală, Terasă, Bar).
- **Alocare pe locuri la masă**: Asociați preparatele și băuturile anumitor locuri (Locul 1, Locul 2, ..., Comun) pentru a simplifica servirea și împărțirea notei de plată.
- **Mențiuni pentru bucătărie și opțiuni suplimentare**: Selectați rapid mărimile, gradul de gătire și ingredientele suplimentare plătite, sau tastați instrucțiuni speciale (cum ar fi „fără sare”, „lămâie separat”).
- **Modalități multiple de încasare**: Închideți notele cu terminale POS de card integrate, împărțiți nota între clienți, încasați numerar sau afișați un cod QR de plată direct pe ecranul tabletei pentru ca oaspetele să scaneze și să plătească.
- **Atribuirea angajatului**: Fiecare comandă înregistrează numele membrului din personal autentificat, pentru o evidență clară pe ture.

---

## Cine poate utiliza această funcționalitate

- **Personalul de servire (ospătari)**: Introduce codul PIN din 4 cifre pe o tabletă înregistrată pentru a deschide automat interfața POS.
- **Proprietarii și managerii**: Pot deschide interfața POS oricând, apăsând pe butonul **POS** din bara superioară a panoului de control.

---

## Fluxul complet de lucru în aplicația POS

### 1. Deschiderea unei mese
1. Atingeți **Selectează masa** în bara superioară a ecranului POS.
2. Selectorul de mese afișează toate mesele localului grupate pe **Zone**.
3. Atingeți masa dorită:
   - Dacă masa este **Liberă**, începe o sesiune nouă de servire.
   - Dacă masa este **Ocupată** (de exemplu, dacă oaspeții au comandat deja băuturi prin codul QR), aplicația POS încarcă istoricul comenzilor confirmate (cu text gri) și vă permite să adăugați produse noi.

### 2. Adăugarea preparatelor și a băuturilor
1. Utilizați etichetele categoriilor din partea de sus (de exemplu, Aperitive, Feluri principale, Băuturi) pentru a filtra produsele.
2. Atingeți cartonașul oricărui preparat pentru a-l adăuga la comanda curentă.
3. Dacă preparatul are opțiuni, se deschide o fereastră laterală:
   - Selectați opțiunile obligatorii (de exemplu, „Gătit mediu”).
   - Selectați opțiunile suplimentare plătite (de exemplu, „Unt cu trufe”).
   - *(Opțional)* Scrieți o notă personalizată în câmpul **Instrucțiuni speciale**.
4. Atingeți **Gata** pentru a confirma produsul configurat.

### 3. Alocarea produselor pe locuri la masă
1. Înainte sau după selectarea preparatelor, alegeți locul din bara de selecție (**Locul 1**, **Locul 2**, **Locul 3** sau **Comun**).
2. Produsele adăugate în timp ce un loc este selectat sunt etichetate automat cu acel număr de loc.
3. La trimiterea comenzii către bucătărie, preparatele sunt grupate pe locuri, astfel încât personalul care aduce mâncarea știe exact la cine ajunge fiecare farfurie.

### 4. Trimiterea comenzii către bucătărie
1. Verificați produsele adăugate în panoul comenzii.
2. Atingeți **Trimite comanda** (sau **Trimite la bucătărie**).
3. Doar produsele nou adăugate sunt transmise către sistemul din bucătărie (KDS) și imprimantele de comenzi.
4. Sesiunea mesei rămâne activă, astfel încât să puteți reveni oricând pentru a adăuga deserturi sau băuturi suplimentare.

### 5. Încasarea notei de plată
Când oaspeții doresc să achite, deschideți panoul notei de plată a mesei și verificați produsele. Aveți la dispoziție patru modalități de închidere:

- **Plată cu cardul**: Marchează nota ca achitată complet prin terminalul de plată cu cardul al localului (de exemplu, MyPOS) și eliberează masa pentru următorii oaspeți.
- **Împărțirea notei**: Deschide panoul de divizare a notei, permițând oaspeților să împartă suma în mod egal sau să aleagă produse individuale pentru plată separată. *(Consultați [Împărțirea notei de plată](/guides/payments-integrations/split-bill))*
- **Afișează cod QR de plată**: Afișează un cod QR de plată digitală direct pe ecranul tabletei. Oaspetele îl scanează cu camera telefonului pentru a plăti prin Apple Pay, Google Pay sau card.
- **Închidere forțată / Numerar**: Închide sesiunea mesei fără o tranzacție electronică (folosită când oaspeții plătesc în numerar sau la corectarea deschiderii accidentale a unei mese).

---

## Schimbarea utilizatorului între mese

Pe tabletele partajate între colegi, personalul ar trebui să blocheze ecranul după preluarea comenzii:
1. Atingeți butonul **Schimbă utilizatorul** sau **Blochează** din colțul din dreapta-sus.
2. Ecranul revine la tastatura pentru introducerea codului PIN din 4 cifre, pregătit pentru următorul ospătar.

---

## Note importante

- **Coșuri independente**: Aplicația POS funcționează complet separat de coșurile din navigatoarele oaspeților. Acțiunile ospătarilor nu vor suprascrie și nu vor interfera cu produsele pe care un client le vizualizează pe propriul telefon.
- **Notificare în timp real la plata online**: Dacă un oaspete achită nota direct de pe propriul telefon în timp ce ospătarul are masa deschisă pe POS, Renova afișează o notificare pe ecran și resetează automat masa.

---

## Depanare și întrebări frecvente

- **Tableta s-a deconectat de la Wi-Fi**: Dacă semnalul cade temporar, aplicația POS păstrează produsele adăugate local și afișează o bară de atenționare până la restabilirea conexiunii.
- **Produs greșit trimis la bucătărie**: Deschideți comanda în panoul de control la secțiunea **Comenzi** sau anunțați direct bucătăria; personalul poate anula sau ajusta comanda.
