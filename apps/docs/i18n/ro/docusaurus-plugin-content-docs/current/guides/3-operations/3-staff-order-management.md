---
id: staff-order-management
title: Gestionarea Comenzilor de către Personal
sidebar_position: 3
---

# Gestionarea Comenzilor de către Personal

Vizualizarea **Comenzi (Orders)** din panoul de control este centrul nervos pentru personalul din sala de mese. Este conceput pentru a gestiona cu ușurință volume mari de comenzi primite.

## Notificări în Timp Real
Platforma folosește WebSockets pentru a furniza actualizări instantaneu. Când un client plasează o comandă nouă, panoul de control emite o alertă audio (un sunet de notificare clar) și actualizează lista de comenzi imediat — nu este necesară reîmprospătarea manuală a paginii.

## Fluxul de Lucru al Comenzilor

Comenzile trec printr-un flux de lucru strict pentru a asigura că nimic nu este ratat:

1. **NOUĂ (NEW)**: Comenzi tocmai plasate de clienți. Personalul ar trebui să le confirme făcând clic pe butonul de acțiune principal pentru a le muta în "În Curs (In Progress)".
2. **ÎN CURS (IN PROGRESS)**: Comenzi pregătite în prezent de bucătărie sau bar.
3. **SERVITĂ (SERVED)**: Comenzi care au fost livrate la masa clientului.
4. **ANULATĂ (CANCELED)**: Comenzi care au fost anulate.

Această stare este sincronizată cu telefonul clientului, astfel încât aceștia cunosc întotdeauna starea exactă a comenzii lor.

## Cardurile de Comandă
Fiecare comandă apare ca un card care conține informații cruciale:
- **Insignă Masă**: Afișează vizibil numărul mesei pentru ca personalul să știe exact unde merge mâncarea.
- **ID Comandă și Marcaj de Timp**: Pentru urmărire și contabilitate.
- **Articole și Opțiuni**: O listă clară cu ceea ce a comandat clientul, inclusiv opțiunile lor specifice (de ex., "Burger - Mediu").
- **Cereri Speciale**: Orice instrucțiuni speciale lăsate de client sunt evidențiate cu roșu pentru a se asigura că nu sunt omise de personal.
- **Telefon Client**: Afișat dacă clientul l-a furnizat în timpul finalizării comenzii.

## Sincronizare Perfectă
Dacă starea unei comenzi se schimbă (de ex., din NOUĂ în ÎN CURS), această schimbare este transmisă nu doar clientului, ci și oricărui alt membru al personalului care vizualizează panoul de control sau Sistemul de Afișare pentru Bucătărie (KDS), asigurând că întreaga echipă este întotdeauna perfect sincronizată.
