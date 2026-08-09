---
id: menu-scheduling
title: Programarea meniului (Dayparting)
sidebar_position: 2
---

# Programarea meniului (Dayparting)

Programarea meniului vă permite să ascundeți sau să afișați automat anumite categorii de meniu în funcție de ora din zi și de ziua din săptămână. Acest lucru este perfect pentru a oferi un meniu dedicat pentru micul dejun, un meniu de brunch în weekend sau oferte speciale pentru băuturi noaptea târziu.

## Setarea disponibilității

Fiecare categorie din meniul dvs. are o setare de „Disponibilitate” cu trei opțiuni:
1. **Întotdeauna disponibil**: Categoria este vizibilă 24/7. Aceasta este opțiunea implicită.
2. **Ascuns**: Categoria este ascunsă manual din meniul public (util pentru meniurile sezoniere pe care doriți să le salvați pentru mai târziu).
3. **Programat**: Categoria apare doar în anumite ore și zile.

## Cum funcționează disponibilitatea programată

Când setați o categorie pe „Programat”, definiți:
- **Zilele săptămânii**: Selectați în ce zile ar trebui să apară categoria (de ex., Sâmbătă și Duminică pentru brunch).
- **Interval orar**: Setați o oră de început și o oră de sfârșit (de ex., de la 07:00 la 11:30).

### Precizia fusului orar
Sistemul de programare folosește fusul orar exact IANA pe care l-ați configurat în Setările restaurantului (de ex., `Europe/Bucharest`). Nu se bazează pe ceasul telefonului clientului sau pe ora UTC a serverului. Acest lucru garantează că meniul dvs. de mic dejun se oprește exact la 11:30 AM, ora locală, indiferent de ora la care un turist vă răsfoiește meniul.

### Programe peste noapte
Sistemul acceptă pe deplin intervalele care trec de miezul nopții. De exemplu, dacă dețineți un bar și doriți o categorie „Noaptea târziu” vizibilă de la 22:00 la 02:00, pur și simplu introduceți aceste ore. Platforma va calcula automat trecerea de miezul nopții și va afișa categoria corect.
