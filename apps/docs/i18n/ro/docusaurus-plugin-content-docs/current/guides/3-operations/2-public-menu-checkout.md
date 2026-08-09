---
id: public-menu-checkout
title: Meniu Public și Finalizare Comandă
sidebar_position: 2
---

# Meniu Public și Finalizare Comandă

Meniul public este partea platformei destinată clienților, optimizată pentru dispozitive mobile și concepută pentru a stimula vânzările cu zero frecare. Nu necesită descărcarea unei aplicații sau înregistrarea unui cont de către clienți.

## Experiența de Navigare

Când un client scanează codul QR al unei mese, el este direcționat imediat la meniul digital.

### Navigare și Căutare
- **Pastile de Categorii**: O bară de derulare orizontală cu categorii permite clienților să sară rapid la diferite secțiuni ale meniului.
- **Căutare și Filtre**: Clienții pot folosi bara de căutare de sus pentru a găsi anumite articole, sau pot folosi panoul de filtre care glisează în jos pentru a filtra după preferințe alimentare (Vegan, Picant) sau pentru a exclude alergeni (de ex., ascunderea tuturor articolelor care conțin nuci).

### Afișarea Articolelor
- Articolele sunt afișate în carduri orizontale simple.
- **Monedă Duală**: Prețurile sunt afișate în moneda principală (de ex., EUR) cu echivalentul într-o monedă secundară (de ex., BGN) afișat dedesubt, calculat automat folosind cursurile de schimb fixe oficiale.
- **Imagini**: Clienții pot atinge imaginile articolelor pentru a deschide un vizualizator pe tot ecranul (lightbox) cu capabilități de zoom prin ciupire.

## Fluxul de Finalizare a Comenzii (Checkout)

Odată ce un client adaugă articole în coșul său, trece la finalizarea comenzii.

### Validare la Nivel de Server
Pentru a asigura securitatea completă, prețurile articolelor și opțiunile alese (precum "Mare" sau "Extra Brânză") sunt validate în raport cu baza de date de pe server. Clienții nu pot manipula prețurile în browser-ul lor.

### Integrarea Fidelizării
În timpul finalizării comenzii, clienții conectați își vor vedea nivelul actual de loialitate, orice multiplicatori activi pentru „happy hour” și punctele pe care le vor câștiga pentru comandă. De asemenea, pot valorifica fără probleme puncte pentru a obține anumite articole gratuit sau pentru a aplica o reducere în numerar la nota de plată totală.

### Confirmarea și Urmărirea Comenzii
După plasarea comenzii, clientul ajunge pe pagina **Confirmare Comandă (Order Confirmation)**. Aici, un indicator de progres în direct urmărește comanda prin trei etape: Plasată (Placed), În Bucătărie (In Kitchen) și Servită (Served). Starea se actualizează în timp real, fără ca utilizatorul să aibă nevoie de reîmprospătarea paginii.
