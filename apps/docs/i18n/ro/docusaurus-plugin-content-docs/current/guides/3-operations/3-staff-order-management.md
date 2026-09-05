---
id: staff-order-management
title: Gestionarea comenzilor pentru personal
sidebar_position: 3
---

# Gestionarea comenzilor pentru personal

Secțiunea **Comenzi** din panoul de control reprezintă centrul operațional în timp real în care personalul de servire și managerii monitorizează, preiau și gestionează comenzile primite de la mese și punctele de servire.

---

## Ce oferă această funcționalitate

- **Flux instantaneu în timp real**: Comenzile plasate de oaspeți sau de personal apar imediat, fără a fi nevoie de reîncărcarea manuală a paginii.
- **Alerte sonore distincte**: Un semnal sonor anunță sosirea fiecărei comenzi noi, astfel încât personalul să nu rateze niciun tichet în perioadele aglomerate.
- **Etape clare de procesare**: Treceți comenzile prin stările **Nouă**, **În pregătire** și **Servită**, păstrând sincronizate sala de mese, bucătăria și ecranul oaspetelui.
- **Atribuirea sursei și a angajatului**: Fiecare comandă indică clar dacă provine din scanarea codului QR de către client sau a fost preluată pe un dispozitiv mobil POS de către un ospătar (indicând și numele acestuia).
- **Instrucțiuni speciale evidențiate**: Mențiunile clienților (alergii, cerințe de preparare) sunt evidențiate cu text roșu pentru a atrage atenția imediat.

---

## Cine poate utiliza această funcționalitate

- **Proprietari, manageri și personal**: Disponibilă pe abonamentele Starter, Professional și Enterprise.

---

## Etapele și fluxul stărilor de comandă

Fiecare comandă trece prin patru etape bine definite:

1. **NOUĂ (NEW)**: Comandă tocmai trimisă de oaspeți. Tichetul apare cu o margine albastră. Personalul verifică solicitarea și apasă pe **Acceptă / În pregătire**.
2. **ÎN PREGĂTIRE (IN PROGRESS)**: Preparatele sau băuturile sunt în curs de pregătire la bucătărie sau bar. Tichetul este evidențiat cu galben/portocaliu.
3. **SERVITĂ (SERVED)**: Produsele au fost livrate la masă. Personalul apasă pe **Marchează ca servită** pentru a finaliza tichetul.
4. **ANULATĂ (CANCELED)**: Comenzi care au fost anulate (de exemplu, oaspetele s-a răzgândit sau un ingredient a devenit indisponibil).

Actualizarea stării unei comenzi reflectă automat modificarea și pe bara de progres afișată pe telefonul oaspetelui, în timp real.

---

## Anatomia unui tichet de comandă

Fiecare tichet din ecranul de comenzi include toate detaliile necesare:

- **Etichetă Masă / Locație**: Indică vizibil numărul mesei (de exemplu, „Masa 8”) sau punctul de servire (de exemplu, „Bar”).
- **Număr comandă și marcaj temporal**: De exemplu, `#1042`, însoțit de un cronometru care arată câte minute au trecut de la plasarea comenzii.
- **Sursa comenzii**: O etichetă care arată dacă tichetul a fost plasat de client prin **Comandă QR** sau preluat direct la masă de personal (**POS**).
- **Angajat responsabil**: În cazul comenzilor preluate prin POS, se afișează numele ospătarului.
- **Produse și opțiuni**: Lista detaliată a preparatelor, cantitățile, variantele selectate (de exemplu, „Porție mare”) și opțiunile suplimentare (cum ar fi „Brânză extra”).
- **Instrucțiuni speciale**: Orice mențiune scrisă de client este evidențiată clar cu text roșu.
- **Total comandă**: Calculat și afișat în ambele monede (de exemplu, EUR și BGN).

---

## Cum se gestionează comenzile în timpul unei ture

1. În meniul panoului de control, apăsați pe **Comenzi**.
2. Utilizați filtrele din partea de sus pentru a vizualiza comenzile: **Noi**, **În pregătire**, **Servite** sau **Toate**.
3. Când sosește o comandă nouă:
   - Verificați masa și preparatele solicitate.
   - Apăsați pe **Acceptă** pentru a trimite comanda în starea „În pregătire”.
4. Când bucătăria semnalează că preparatul este gata:
   - Livrați comanda la masă.
   - Apăsați pe **Marchează ca servită** pe tichetul comenzii.

---

## Cum se anulează o comandă

1. Pe tichetul comenzii, apăsați pe meniul cu trei puncte sau pe butonul **Anulează comanda**.
2. Confirmați anularea în fereastra de dialog.
3. Comanda este mutată în fila **Anulate**, iar totalul activ al mesei este recalculat corespunzător.

---

## Note importante

- **Activarea sunetului în navigator**: Navigatoarele web moderne cer o primă interacțiune pe pagină înainte de a permite redarea alertelor audio. La începutul fiecărei ture, atingeți sau apăsați o dată oriunde pe ecranul panoului de control pentru a vă asigura că semnalele sonore vor funcționa.
- **Sincronizare multi-dispozitiv**: Dacă un manager marchează o comandă ca „Servită” de pe laptop, comanda se actualizează instantaneu pe tableta din bucătărie și pe dispozitivul mobil al ospătarului.

---

## Depanare și întrebări frecvente

- **Alertele sonore nu se aud**: Asigurați-vă că volumul fizic al dispozitivului nu este oprit (mute), verificați dacă fila din navigator are permisiune pentru sunet și apăsați o dată pe ecranul Comenzilor pentru a debloca redarea audio.
- **Comandă plasată la o masă greșită**: Dacă un oaspete a selectat din greșeală alt număr de masă, personalul poate anula comanda eronată și o poate introduce la masa corectă folosind aplicația POS a ospătarului.
