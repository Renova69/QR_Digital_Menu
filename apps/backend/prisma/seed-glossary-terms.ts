/**
 * Terminology-constrained translation glossary — Bulgarian menu vocabulary.
 *
 * This is a RECONCILER, not an appender: run it and the DB `glossary_term`
 * table for sourceLang='bg' converges to exactly the GROUPS below — no more,
 * no less. Two flags control how far that convergence goes:
 *
 *   npx ts-node prisma/seed-glossary-terms.ts --dry-run   (default: prints
 *     the add/update/unchanged/prune diff against the current DB, writes
 *     nothing)
 *   npx ts-node prisma/seed-glossary-terms.ts              (upserts GROUPS;
 *     never deletes)
 *   npx ts-node prisma/seed-glossary-terms.ts --prune       (upserts GROUPS,
 *     then deletes any bg row NOT in GROUPS — this is what actually removes
 *     stale rows, e.g. the old COMPOUND_ITEMS set below)
 *
 * Idempotent upsert on the (sourceLang, sourceText, targetLang) composite
 * key — safe to re-run.
 *
 * ── Why this file was rewritten (2026-07-25) ────────────────────────────────
 * The previous version was append-only and had grown to 264 bg terms, 56% of
 * them full multi-word menu item names and drink brands copied verbatim out
 * of one demo restaurant's Demo_menu.json (a COMPOUND_ITEMS block of 66 full
 * item-name phrases, e.g. "запечено сирене със сладко от боровинки"). That
 * happened because a since-removed bug in TranslationService made the
 * DeepL provider completely unreachable — the glossary was the only way
 * *anything* got translated, so the fix-path became "add every item name by
 * hand", which can never converge (one demo menu alone has 180+ unique
 * names). With the provider reachable again, this glossary goes back to its
 * actual job: a small set of controlled terminology DeepL's own general
 * model handles unreliably on short/rare-word input, plus terms that must
 * never be machine-translated at all (brand names).
 *
 * ── Classification ───────────────────────────────────────────────────────
 *   TERM              — ordinary vocabulary substitution (sections, prep
 *                        words, ingredients, condiments, drink names). NMT
 *                        models translate these unreliably specifically
 *                        because they're short and repeated across menus
 *                        (see the "Мезета" -> "Das Keller" repro that
 *                        prompted this feature originally).
 *   PROTECTED_DISH     — proper-noun dish names, kept transliterated
 *                        consistently across languages rather than
 *                        "translated" (the same convention as Sushi/Paella).
 *   DO_NOT_TRANSLATE   — brand/product names. Synced to DeepL's *native*
 *                        glossary as identity entries so the provider leaves
 *                        them alone even mid-sentence, not just on an exact
 *                        whole-string local match.
 *
 * Target languages remain deliberately limited to en/de/ru/ro/it/es/fr — the
 * ones with high self-confidence translations. ja/zh/ar/el are intentionally
 * NOT included yet: those scripts are both the highest-risk to get subtly
 * wrong and the hardest to self-verify without a native reviewer. Add them
 * in a follow-up pass with dedicated verification, not by extending this
 * file blind.
 *
 * "закуски" -> Breakfast confirmed by the restaurant owner (2026-07-24) —
 * the term is ambiguous in Bulgarian (can also mean appetizers/snacks
 * depending on region/menu) and was NOT guessed.
 *
 * "сладко" deliberately OMITTED — ambiguous between "jam" (noun, a common
 * Bulgarian dessert item) and "sweet" (adjective). Same trap as "закуски";
 * needs the same kind of owner confirmation before it's safe to pin.
 *
 * Preset allergen/dietary-tag keys (menu-tags.ts) are deliberately NOT
 * seeded here — their labels come from the frontend's own i18n bundle, not
 * DeepL, and menu-translation.service.ts / restaurants.service.ts already
 * skip them via isPresetTagKey() before any text reaches the translation
 * pipeline. Adding them here would just be unreachable rows.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { validateRows } from './validate-glossary';
import { assertLocalSeedTarget } from '../scripts/seed-target-safety';

const prisma = new PrismaClient();

type TargetLang = 'en' | 'de' | 'ru' | 'ro' | 'it' | 'es' | 'fr';
type GlossaryKind = 'TERM' | 'PROTECTED_DISH' | 'DO_NOT_TRANSLATE';

export interface TermRow {
  bg: string; // sourceText — must already be normalized: trim + toLowerCase()
  t: Partial<Record<TargetLang, string>>;
}

// ── Menu section / category names ──────────────────────────────────────────
const SECTIONS: TermRow[] = [
  {
    bg: 'мезе',
    t: {
      en: 'Appetizer',
      de: 'Vorspeise',
      ru: 'Закуска',
      ro: 'Aperitiv',
      it: 'Antipasto',
      es: 'Aperitivo',
      fr: 'Entrée',
    },
  },
  {
    bg: 'мезета',
    t: {
      en: 'Appetizers',
      de: 'Vorspeisen',
      ru: 'Закуски',
      ro: 'Aperitive',
      it: 'Antipasti',
      es: 'Aperitivos',
      fr: 'Entrées',
    },
  },
  {
    bg: 'скара',
    t: {
      en: 'Grill',
      de: 'Grill',
      ru: 'Гриль',
      ro: 'Grătar',
      it: 'Griglia',
      es: 'Parrilla',
      fr: 'Grillades',
    },
  },
  {
    bg: 'салати',
    t: {
      en: 'Salads',
      de: 'Salate',
      ru: 'Салаты',
      ro: 'Salate',
      it: 'Insalate',
      es: 'Ensaladas',
      fr: 'Salades',
    },
  },
  {
    bg: 'салата',
    t: {
      en: 'Salad',
      de: 'Salat',
      ru: 'Салат',
      ro: 'Salată',
      it: 'Insalata',
      es: 'Ensalada',
      fr: 'Salade',
    },
  },
  {
    bg: 'супи',
    t: {
      en: 'Soups',
      de: 'Suppen',
      ru: 'Супы',
      ro: 'Supe',
      it: 'Zuppe',
      es: 'Sopas',
      fr: 'Soupes',
    },
  },
  {
    bg: 'супа',
    t: {
      en: 'Soup',
      de: 'Suppe',
      ru: 'Суп',
      ro: 'Supă',
      it: 'Zuppa',
      es: 'Sopa',
      fr: 'Soupe',
    },
  },
  {
    bg: 'основни ястия',
    t: {
      en: 'Main Courses',
      de: 'Hauptgerichte',
      ru: 'Основные блюда',
      ro: 'Feluri Principale',
      it: 'Piatti Principali',
      es: 'Platos Principales',
      fr: 'Plats Principaux',
    },
  },
  {
    bg: 'десерти',
    t: {
      en: 'Desserts',
      de: 'Desserts',
      ru: 'Десерты',
      ro: 'Deserturi',
      it: 'Dolci',
      es: 'Postres',
      fr: 'Desserts',
    },
  },
  {
    bg: 'десерт',
    t: {
      en: 'Dessert',
      de: 'Dessert',
      ru: 'Десерт',
      ro: 'Desert',
      it: 'Dolce',
      es: 'Postre',
      fr: 'Dessert',
    },
  },
  {
    bg: 'напитки',
    t: {
      en: 'Drinks',
      de: 'Getränke',
      ru: 'Напитки',
      ro: 'Băuturi',
      it: 'Bevande',
      es: 'Bebidas',
      fr: 'Boissons',
    },
  },
  {
    bg: 'безалкохолни напитки',
    t: {
      en: 'Soft Drinks',
      de: 'Alkoholfreie Getränke',
      ru: 'Безалкогольные напитки',
      ro: 'Băuturi Răcoritoare',
      it: 'Bevande Analcoliche',
      es: 'Bebidas Sin Alcohol',
      fr: 'Boissons Sans Alcool',
    },
  },
  {
    bg: 'алкохолни напитки',
    t: {
      en: 'Alcoholic Drinks',
      de: 'Alkoholische Getränke',
      ru: 'Алкогольные напитки',
      ro: 'Băuturi Alcoolice',
      it: 'Bevande Alcoliche',
      es: 'Bebidas Alcohólicas',
      fr: 'Boissons Alcoolisées',
    },
  },
  {
    bg: 'топли напитки',
    t: {
      en: 'Hot Drinks',
      de: 'Heiße Getränke',
      ru: 'Горячие напитки',
      ro: 'Băuturi Calde',
      it: 'Bevande Calde',
      es: 'Bebidas Calientes',
      fr: 'Boissons Chaudes',
    },
  },
  {
    bg: 'гарнитури',
    t: {
      en: 'Side Dishes',
      de: 'Beilagen',
      ru: 'Гарниры',
      ro: 'Garnituri',
      it: 'Contorni',
      es: 'Guarniciones',
      fr: 'Accompagnements',
    },
  },
  {
    bg: 'гарнитура',
    t: {
      en: 'Side Dish',
      de: 'Beilage',
      ru: 'Гарнир',
      ro: 'Garnitură',
      it: 'Contorno',
      es: 'Guarnición',
      fr: 'Accompagnement',
    },
  },
  // Confirmed by owner 2026-07-24 to mean "breakfast" in this context, not appetizers/snacks.
  {
    bg: 'закуски',
    t: {
      en: 'Breakfast',
      de: 'Frühstück',
      ru: 'Завтрак',
      ro: 'Mic Dejun',
      it: 'Colazione',
      es: 'Desayuno',
      fr: 'Petit-déjeuner',
    },
  },
  {
    bg: 'пици',
    t: {
      en: 'Pizzas',
      de: 'Pizzen',
      ru: 'Пиццы',
      ro: 'Pizza',
      it: 'Pizze',
      es: 'Pizzas',
      fr: 'Pizzas',
    },
  },
  {
    bg: 'паста',
    t: {
      en: 'Pasta',
      de: 'Pasta',
      ru: 'Паста',
      ro: 'Paste',
      it: 'Pasta',
      es: 'Pasta',
      fr: 'Pâtes',
    },
  },
  {
    bg: 'морски дарове',
    t: {
      en: 'Seafood',
      de: 'Meeresfrüchte',
      ru: 'Морепродукты',
      ro: 'Fructe de Mare',
      it: 'Frutti di Mare',
      es: 'Mariscos',
      fr: 'Fruits de Mer',
    },
  },
  {
    bg: 'риба',
    t: {
      en: 'Fish',
      de: 'Fisch',
      ru: 'Рыба',
      ro: 'Pește',
      it: 'Pesce',
      es: 'Pescado',
      fr: 'Poisson',
    },
  },
  {
    bg: 'пилешко',
    t: {
      en: 'Chicken',
      de: 'Hähnchen',
      ru: 'Курица',
      ro: 'Pui',
      it: 'Pollo',
      es: 'Pollo',
      fr: 'Poulet',
    },
  },
  {
    bg: 'свинско',
    t: {
      en: 'Pork',
      de: 'Schweinefleisch',
      ru: 'Свинина',
      ro: 'Porc',
      it: 'Maiale',
      es: 'Cerdo',
      fr: 'Porc',
    },
  },
  {
    bg: 'телешко',
    t: {
      en: 'Beef',
      de: 'Rindfleisch',
      ru: 'Говядина',
      ro: 'Vită',
      it: 'Manzo',
      es: 'Ternera',
      fr: 'Bœuf',
    },
  },
  {
    bg: 'агнешко',
    t: {
      en: 'Lamb',
      de: 'Lammfleisch',
      ru: 'Баранина',
      ro: 'Miel',
      it: 'Agnello',
      es: 'Cordero',
      fr: 'Agneau',
    },
  },
  {
    bg: 'вегетариански',
    t: {
      en: 'Vegetarian',
      de: 'Vegetarisch',
      ru: 'Вегетарианское',
      ro: 'Vegetarian',
      it: 'Vegetariano',
      es: 'Vegetariano',
      fr: 'Végétarien',
    },
  },
  {
    bg: 'веган',
    t: {
      en: 'Vegan',
      de: 'Vegan',
      ru: 'Веганское',
      ro: 'Vegan',
      it: 'Vegano',
      es: 'Vegano',
      fr: 'Végan',
    },
  },
  {
    bg: 'детско меню',
    t: {
      en: 'Kids Menu',
      de: 'Kindermenü',
      ru: 'Детское меню',
      ro: 'Meniu Copii',
      it: 'Menù Bambini',
      es: 'Menú Infantil',
      fr: 'Menu Enfant',
    },
  },
  {
    bg: 'сандвичи',
    t: {
      en: 'Sandwiches',
      de: 'Sandwiches',
      ru: 'Сэндвичи',
      ro: 'Sandvișuri',
      it: 'Panini',
      es: 'Sándwiches',
      fr: 'Sandwichs',
    },
  },
  {
    bg: 'хлебни изделия',
    t: {
      en: 'Bread',
      de: 'Backwaren',
      ru: 'Хлебобулочные изделия',
      ro: 'Produse de Panificație',
      it: 'Prodotti da Forno',
      es: 'Panadería',
      fr: 'Boulangerie',
    },
  },
  {
    bg: 'предястия',
    t: {
      en: 'Starters',
      de: 'Vorspeisen',
      ru: 'Закуски',
      ro: 'Antreuri',
      it: 'Antipasti',
      es: 'Entrantes',
      fr: 'Entrées',
    },
  },
  {
    bg: 'ордьоври',
    t: {
      en: "Hors d'oeuvres",
      de: 'Vorspeisen',
      ru: 'Закуски',
      ro: 'Antreuri',
      it: 'Antipasti',
      es: 'Entrantes',
      fr: "Hors d'œuvre",
    },
  },
  {
    bg: 'основно ястие',
    t: {
      en: 'Main Course',
      de: 'Hauptgericht',
      ru: 'Основное блюдо',
      ro: 'Fel Principal',
      it: 'Piatto Principale',
      es: 'Plato Principal',
      fr: 'Plat Principal',
    },
  },
  {
    bg: 'напитка',
    t: {
      en: 'Drink',
      de: 'Getränk',
      ru: 'Напиток',
      ro: 'Băutură',
      it: 'Bevanda',
      es: 'Bebida',
      fr: 'Boisson',
    },
  },
  {
    bg: 'бира',
    t: {
      en: 'Beer',
      de: 'Bier',
      ru: 'Пиво',
      ro: 'Bere',
      it: 'Birra',
      es: 'Cerveza',
      fr: 'Bière',
    },
  },
  {
    bg: 'вино',
    t: {
      en: 'Wine',
      de: 'Wein',
      ru: 'Вино',
      ro: 'Vin',
      it: 'Vino',
      es: 'Vino',
      fr: 'Vin',
    },
  },
  {
    // Balkan fruit brandy — a proper-noun-like regional term, kept
    // transliterated across languages (same convention as "Sake").
    bg: 'ракия',
    t: {
      en: 'Rakia',
      de: 'Rakia',
      ru: 'Ракия',
      ro: 'Rachiu',
      it: 'Rakia',
      es: 'Rakia',
      fr: 'Rakia',
    },
  },
  {
    bg: 'кафе',
    t: {
      en: 'Coffee',
      de: 'Kaffee',
      ru: 'Кофе',
      ro: 'Cafea',
      it: 'Caffè',
      es: 'Café',
      fr: 'Café',
    },
  },
  {
    bg: 'чай',
    t: {
      en: 'Tea',
      de: 'Tee',
      ru: 'Чай',
      ro: 'Ceai',
      it: 'Tè',
      es: 'Té',
      fr: 'Thé',
    },
  },
  {
    bg: 'пица',
    t: {
      en: 'Pizza',
      de: 'Pizza',
      ru: 'Пицца',
      ro: 'Pizza',
      it: 'Pizza',
      es: 'Pizza',
      fr: 'Pizza',
    },
  },
  {
    bg: 'зеленчуци',
    t: {
      en: 'Vegetables',
      de: 'Gemüse',
      ru: 'Овощи',
      ro: 'Legume',
      it: 'Verdure',
      es: 'Verduras',
      fr: 'Légumes',
    },
  },
  {
    bg: 'картофи',
    t: {
      en: 'Potatoes',
      de: 'Kartoffeln',
      ru: 'Картофель',
      ro: 'Cartofi',
      it: 'Patate',
      es: 'Patatas',
      fr: 'Pommes de terre',
    },
  },
  {
    bg: 'пържени картофи',
    t: {
      en: 'French Fries',
      de: 'Pommes Frites',
      ru: 'Картофель фри',
      ro: 'Cartofi Prăjiți',
      it: 'Patatine Fritte',
      es: 'Patatas Fritas',
      fr: 'Frites',
    },
  },
  {
    bg: 'ориз',
    t: {
      en: 'Rice',
      de: 'Reis',
      ru: 'Рис',
      ro: 'Orez',
      it: 'Riso',
      es: 'Arroz',
      fr: 'Riz',
    },
  },
  {
    // Small cakes/pastries — distinct from "паста" (pasta).
    bg: 'пасти',
    t: {
      en: 'Pastries',
      de: 'Kuchen',
      ru: 'Пирожные',
      ro: 'Prăjituri',
      it: 'Pasticcini',
      es: 'Pastelería',
      fr: 'Pâtisseries',
    },
  },
  {
    bg: 'торти',
    t: {
      en: 'Cakes',
      de: 'Torten',
      ru: 'Торты',
      ro: 'Torturi',
      it: 'Torte',
      es: 'Tartas',
      fr: 'Gâteaux',
    },
  },
  {
    bg: 'сладолед',
    t: {
      en: 'Ice Cream',
      de: 'Eis',
      ru: 'Мороженое',
      ro: 'Înghețată',
      it: 'Gelato',
      es: 'Helado',
      fr: 'Glace',
    },
  },
  {
    bg: 'плодове',
    t: {
      en: 'Fruits',
      de: 'Obst',
      ru: 'Фрукты',
      ro: 'Fructe',
      it: 'Frutta',
      es: 'Frutas',
      fr: 'Fruits',
    },
  },
];

// ── Common standalone ingredient words (used as short option/choice names) ──
const INGREDIENTS: TermRow[] = [
  {
    bg: 'сирене',
    t: {
      en: 'Cheese',
      de: 'Käse',
      ru: 'Сыр',
      ro: 'Brânză',
      it: 'Formaggio',
      es: 'Queso',
      fr: 'Fromage',
    },
  },
  {
    // Balkan yellow cheese — shared regional term, keep close to native
    // spelling per language rather than a loose translation.
    bg: 'кашкавал',
    t: {
      en: 'Kashkaval',
      de: 'Kaschkawal',
      ru: 'Кашкавал',
      ro: 'Cașcaval',
      it: 'Kashkaval',
      es: 'Kashkaval',
      fr: 'Kashkaval',
    },
  },
  {
    bg: 'домати',
    t: {
      en: 'Tomatoes',
      de: 'Tomaten',
      ru: 'Помидоры',
      ro: 'Roșii',
      it: 'Pomodori',
      es: 'Tomates',
      fr: 'Tomates',
    },
  },
  {
    bg: 'краставици',
    t: {
      en: 'Cucumbers',
      de: 'Gurken',
      ru: 'Огурцы',
      ro: 'Castraveți',
      it: 'Cetrioli',
      es: 'Pepinos',
      fr: 'Concombres',
    },
  },
  {
    bg: 'лук',
    t: {
      en: 'Onion',
      de: 'Zwiebel',
      ru: 'Лук',
      ro: 'Ceapă',
      it: 'Cipolla',
      es: 'Cebolla',
      fr: 'Oignon',
    },
  },
  {
    bg: 'чесън',
    t: {
      en: 'Garlic',
      de: 'Knoblauch',
      ru: 'Чеснок',
      ro: 'Usturoi',
      it: 'Aglio',
      es: 'Ajo',
      fr: 'Ail',
    },
  },
  {
    bg: 'гъби',
    t: {
      en: 'Mushrooms',
      de: 'Pilze',
      ru: 'Грибы',
      ro: 'Ciuperci',
      it: 'Funghi',
      es: 'Setas',
      fr: 'Champignons',
    },
  },
  {
    bg: 'маслини',
    t: {
      en: 'Olives',
      de: 'Oliven',
      ru: 'Оливки',
      ro: 'Măsline',
      it: 'Olive',
      es: 'Aceitunas',
      fr: 'Olives',
    },
  },
];

// ── Common prep / description words ─────────────────────────────────────────
const PREP_WORDS: TermRow[] = [
  {
    bg: 'пържено',
    t: {
      en: 'Fried',
      de: 'Frittiert',
      ru: 'Жареное',
      ro: 'Prăjit',
      it: 'Fritto',
      es: 'Frito',
      fr: 'Frit',
    },
  },
  {
    bg: 'печено',
    t: {
      en: 'Roasted',
      de: 'Gebraten',
      ru: 'Запечённое',
      ro: 'Copt',
      it: 'Al Forno',
      es: 'Al Horno',
      fr: 'Rôti',
    },
  },
  {
    bg: 'на скара',
    t: {
      en: 'Grilled',
      de: 'Gegrillt',
      ru: 'На гриле',
      ro: 'La Grătar',
      it: 'Alla Griglia',
      es: 'A la Parrilla',
      fr: 'Grillé',
    },
  },
  {
    bg: 'задушено',
    t: {
      en: 'Stewed',
      de: 'Geschmort',
      ru: 'Тушёное',
      ro: 'Înăbușit',
      it: 'Stufato',
      es: 'Estofado',
      fr: 'Mijoté',
    },
  },
  {
    bg: 'пушено',
    t: {
      en: 'Smoked',
      de: 'Geräuchert',
      ru: 'Копчёное',
      ro: 'Afumat',
      it: 'Affumicato',
      es: 'Ahumado',
      fr: 'Fumé',
    },
  },
  {
    bg: 'мариновано',
    t: {
      en: 'Marinated',
      de: 'Mariniert',
      ru: 'Маринованное',
      ro: 'Marinat',
      it: 'Marinato',
      es: 'Marinado',
      fr: 'Mariné',
    },
  },
  {
    bg: 'пикантно',
    t: {
      en: 'Spicy',
      de: 'Scharf',
      ru: 'Острое',
      ro: 'Picant',
      it: 'Piccante',
      es: 'Picante',
      fr: 'Épicé',
    },
  },
  {
    bg: 'домашно',
    t: {
      en: 'Homemade',
      de: 'Hausgemacht',
      ru: 'Домашнее',
      ro: 'De Casă',
      it: 'Fatto in Casa',
      es: 'Casero',
      fr: 'Maison',
    },
  },
  {
    bg: 'варено',
    t: {
      en: 'Boiled',
      de: 'Gekocht',
      ru: 'Варёное',
      ro: 'Fiert',
      it: 'Bollito',
      es: 'Hervido',
      fr: 'Bouilli',
    },
  },
  {
    bg: 'хрупкаво',
    t: {
      en: 'Crispy',
      de: 'Knusprig',
      ru: 'Хрустящее',
      ro: 'Crocant',
      it: 'Croccante',
      es: 'Crujiente',
      fr: 'Croustillant',
    },
  },
  {
    bg: 'крехко',
    t: {
      en: 'Tender',
      de: 'Zart',
      ru: 'Нежное',
      ro: 'Fraged',
      it: 'Tenero',
      es: 'Tierno',
      fr: 'Tendre',
    },
  },
  {
    bg: 'сочно',
    t: {
      en: 'Juicy',
      de: 'Saftig',
      ru: 'Сочное',
      ro: 'Suculent',
      it: 'Succoso',
      es: 'Jugoso',
      fr: 'Juteux',
    },
  },
  {
    // Chili-heat "hot", distinct from "пикантно" (flavorful/spicy) — both
    // are common on menus and legitimately map to overlapping English words.
    bg: 'люто',
    t: {
      en: 'Hot',
      de: 'Scharf',
      ru: 'Острое',
      ro: 'Iute',
      it: 'Piccante',
      es: 'Picante',
      fr: 'Épicé',
    },
  },
  {
    bg: 'кисело',
    t: {
      en: 'Sour',
      de: 'Sauer',
      ru: 'Кислое',
      ro: 'Acru',
      it: 'Acido',
      es: 'Ácido',
      fr: 'Acide',
    },
  },
  {
    bg: 'прясно',
    t: {
      en: 'Fresh',
      de: 'Frisch',
      ru: 'Свежее',
      ro: 'Proaspăt',
      it: 'Fresco',
      es: 'Fresco',
      fr: 'Frais',
    },
  },
  {
    bg: 'топло',
    t: {
      en: 'Warm',
      de: 'Warm',
      ru: 'Тёплое',
      ro: 'Cald',
      it: 'Caldo',
      es: 'Caliente',
      fr: 'Chaud',
    },
  },
  {
    bg: 'студено',
    t: {
      en: 'Cold',
      de: 'Kalt',
      ru: 'Холодное',
      ro: 'Rece',
      it: 'Freddo',
      es: 'Frío',
      fr: 'Froid',
    },
  },
];

// ── Iconic Bulgarian/Balkan dish names — proper nouns, kept transliterated
// consistently across languages. RU keeps the Bulgarian Cyrillic spelling
// unchanged (Russian speakers read Cyrillic natively, common practice for
// shared-heritage dish names between Slavic-language menus) rather than
// inventing a separate Russian rendering that can't be verified.
const DISH_NAMES: TermRow[] = [
  {
    bg: 'кебапче',
    t: {
      en: 'Kebapche',
      de: 'Kebapche',
      ru: 'Кебапче',
      ro: 'Kebapche',
      it: 'Kebapche',
      es: 'Kebapche',
      fr: 'Kebapche',
    },
  },
  {
    bg: 'кюфте',
    t: {
      en: 'Kyufte',
      de: 'Kyufte',
      ru: 'Кюфте',
      ro: 'Kyufte',
      it: 'Kyufte',
      es: 'Kyufte',
      fr: 'Kyufte',
    },
  },
  {
    bg: 'шопска салата',
    t: {
      en: 'Shopska Salad',
      de: 'Schopska-Salat',
      ru: 'Шопска салата',
      ro: 'Salată Shopska',
      it: 'Insalata Shopska',
      es: 'Ensalada Shopska',
      fr: 'Salade Shopska',
    },
  },
  {
    bg: 'баница',
    t: {
      en: 'Banitsa',
      de: 'Banitsa',
      ru: 'Баница',
      ro: 'Banitsa',
      it: 'Banitsa',
      es: 'Banitsa',
      fr: 'Banitsa',
    },
  },
  {
    bg: 'мусака',
    t: {
      en: 'Musaka',
      de: 'Musaka',
      ru: 'Мусака',
      ro: 'Musaca',
      it: 'Musaka',
      es: 'Musaka',
      fr: 'Musaka',
    },
  },
  {
    bg: 'сарми',
    t: {
      en: 'Sarmi',
      de: 'Sarmi',
      ru: 'Сарми',
      ro: 'Sarmale',
      it: 'Sarmi',
      es: 'Sarmi',
      fr: 'Sarmi',
    },
  },
  {
    bg: 'таратор',
    t: {
      en: 'Tarator',
      de: 'Tarator',
      ru: 'Таратор',
      ro: 'Tarator',
      it: 'Tarator',
      es: 'Tarator',
      fr: 'Tarator',
    },
  },
  {
    bg: 'шкембе чорба',
    t: {
      en: 'Shkembe Chorba',
      de: 'Shkembe Chorba',
      ru: 'Шкембе чорба',
      ro: 'Shkembe Chorba',
      it: 'Shkembe Chorba',
      es: 'Shkembe Chorba',
      fr: 'Shkembe Chorba',
    },
  },
  {
    bg: 'кисело мляко',
    t: {
      en: 'Bulgarian Yogurt',
      de: 'Bulgarisches Joghurt',
      ru: 'Кисело мляко',
      ro: 'Iaurt Bulgăresc',
      it: 'Yogurt Bulgaro',
      es: 'Yogur Búlgaro',
      fr: 'Yaourt Bulgare',
    },
  },
  {
    bg: 'айрян',
    t: {
      en: 'Ayran',
      de: 'Ayran',
      ru: 'Айран',
      ro: 'Ayran',
      it: 'Ayran',
      es: 'Ayran',
      fr: 'Ayran',
    },
  },
  {
    bg: 'боза',
    t: {
      en: 'Boza',
      de: 'Boza',
      ru: 'Боза',
      ro: 'Boza',
      it: 'Boza',
      es: 'Boza',
      fr: 'Boza',
    },
  },
  {
    bg: 'лютеница',
    t: {
      en: 'Lutenitsa',
      de: 'Lutenitsa',
      ru: 'Лютеница',
      ro: 'Lutenița',
      it: 'Lutenitsa',
      es: 'Lutenitsa',
      fr: 'Lutenitsa',
    },
  },
  {
    bg: 'баклава',
    t: {
      en: 'Baklava',
      de: 'Baklava',
      ru: 'Баклава',
      ro: 'Baclava',
      it: 'Baklava',
      es: 'Baklava',
      fr: 'Baklava',
    },
  },
];

// ── Condiments ────────────────────────────────────────────────────────────
const CONDIMENTS: TermRow[] = [
  {
    bg: 'сол',
    t: {
      en: 'Salt',
      de: 'Salz',
      ru: 'Соль',
      ro: 'Sare',
      it: 'Sale',
      es: 'Sal',
      fr: 'Sel',
    },
  },
  {
    bg: 'черен пипер',
    t: {
      en: 'Black Pepper',
      de: 'Schwarzer Pfeffer',
      ru: 'Чёрный перец',
      ro: 'Piper Negru',
      it: 'Pepe Nero',
      es: 'Pimienta Negra',
      fr: 'Poivre Noir',
    },
  },
  {
    bg: 'захар',
    t: {
      en: 'Sugar',
      de: 'Zucker',
      ru: 'Сахар',
      ro: 'Zahăr',
      it: 'Zucchero',
      es: 'Azúcar',
      fr: 'Sucre',
    },
  },
  {
    bg: 'оцет',
    t: {
      en: 'Vinegar',
      de: 'Essig',
      ru: 'Уксус',
      ro: 'Oțet',
      it: 'Aceto',
      es: 'Vinagre',
      fr: 'Vinaigre',
    },
  },
  {
    bg: 'горчица',
    t: {
      en: 'Mustard',
      de: 'Senf',
      ru: 'Горчица',
      ro: 'Muștar',
      it: 'Senape',
      es: 'Mostaza',
      fr: 'Moutarde',
    },
  },
  {
    bg: 'майонеза',
    t: {
      en: 'Mayonnaise',
      de: 'Mayonnaise',
      ru: 'Майонез',
      ro: 'Maioneză',
      it: 'Maionese',
      es: 'Mayonesa',
      fr: 'Mayonnaise',
    },
  },
  {
    bg: 'кетчуп',
    t: {
      en: 'Ketchup',
      de: 'Ketchup',
      ru: 'Кетчуп',
      ro: 'Ketchup',
      it: 'Ketchup',
      es: 'Ketchup',
      fr: 'Ketchup',
    },
  },
];

// ── More drinks ───────────────────────────────────────────────────────────
const MORE_DRINKS: TermRow[] = [
  {
    bg: 'вода',
    t: {
      en: 'Water',
      de: 'Wasser',
      ru: 'Вода',
      ro: 'Apă',
      it: 'Acqua',
      es: 'Agua',
      fr: 'Eau',
    },
  },
  {
    bg: 'минерална вода',
    t: {
      en: 'Mineral Water',
      de: 'Mineralwasser',
      ru: 'Минеральная вода',
      ro: 'Apă Minerală',
      it: 'Acqua Minerale',
      es: 'Agua Mineral',
      fr: 'Eau Minérale',
    },
  },
  {
    bg: 'газирана вода',
    t: {
      en: 'Sparkling Water',
      de: 'Sprudelwasser',
      ru: 'Газированная вода',
      ro: 'Apă Carbogazoasă',
      it: 'Acqua Frizzante',
      es: 'Agua con Gas',
      fr: 'Eau Gazeuse',
    },
  },
  {
    bg: 'сок',
    t: {
      en: 'Juice',
      de: 'Saft',
      ru: 'Сок',
      ro: 'Suc',
      it: 'Succo',
      es: 'Zumo',
      fr: 'Jus',
    },
  },
  {
    bg: 'лимонада',
    t: {
      en: 'Lemonade',
      de: 'Limonade',
      ru: 'Лимонад',
      ro: 'Limonadă',
      it: 'Limonata',
      es: 'Limonada',
      fr: 'Limonade',
    },
  },
];

// ── Additional menu section / category names from Demo_menu.json ───────────
const MORE_SECTIONS: TermRow[] = [
  {
    bg: 'топли предястия',
    t: {
      en: 'Hot Starters',
      de: 'Warme Vorspeisen',
      ru: 'Горячие закуски',
      ro: 'Antreuri Calde',
      it: 'Antipasti Caldi',
      es: 'Entrantes Calientes',
      fr: 'Entrées Chaudes',
    },
  },
  {
    bg: 'родопска кухня',
    t: {
      en: 'Rhodope Cuisine',
      de: 'Rhodopen-Küche',
      ru: 'Родопская кухня',
      ro: 'Bucătărie Rodopeană',
      it: 'Cucina dei Rodopi',
      es: 'Cocina de los Ródopes',
      fr: 'Cuisine des Rhodopes',
    },
  },
  {
    bg: 'традиционни ястия',
    t: {
      en: 'Traditional Dishes',
      de: 'Traditionelle Gerichte',
      ru: 'Традиционные блюда',
      ro: 'Mâncăruri Tradiționale',
      it: 'Piatti Tradizionali',
      es: 'Platos Tradicionales',
      fr: 'Plats Traditionnels',
    },
  },
  {
    bg: 'ястия на жар',
    t: {
      en: 'Charcoal Grill',
      de: 'Holzkohlegrill',
      ru: 'Блюда на углях',
      ro: 'Grătar pe Cărbuni',
      it: 'Alla Brace',
      es: 'A la Brasa',
      fr: 'Grillades au Charbon',
    },
  },
  {
    bg: 'пърленки и пици',
    t: {
      en: 'Flatbreads & Pizzas',
      de: 'Fladenbrot & Pizzen',
      ru: 'Лепёшки и пиццы',
      ro: 'Lipii și Pizza',
      it: 'Focacce e Pizze',
      es: 'Panes Planos y Pizzas',
      fr: 'Galettes et Pizzas',
    },
  },
  {
    bg: 'ядки',
    t: {
      en: 'Nuts',
      de: 'Nüsse',
      ru: 'Орехи',
      ro: 'Nuci',
      it: 'Frutta Secca',
      es: 'Frutos Secos',
      fr: 'Fruits à Coque',
    },
  },
  {
    bg: 'ракии',
    t: {
      en: 'Rakia',
      de: 'Rakia',
      ru: 'Ракии',
      ro: 'Rachiu',
      it: 'Rakia',
      es: 'Rakia',
      fr: 'Rakia',
    },
  },
  {
    bg: 'анасонови напитки',
    t: {
      en: 'Anise Drinks',
      de: 'Anisgetränke',
      ru: 'Анисовые напитки',
      ro: 'Băuturi cu Anason',
      it: "Bevande all'Anice",
      es: 'Bebidas de Anís',
      fr: 'Boissons Anisées',
    },
  },
  {
    bg: 'коняк',
    t: {
      en: 'Cognac',
      de: 'Cognac',
      ru: 'Коньяк',
      ro: 'Coniac',
      it: 'Cognac',
      es: 'Coñac',
      fr: 'Cognac',
    },
  },
  {
    bg: 'водка',
    t: {
      en: 'Vodka',
      de: 'Wodka',
      ru: 'Водка',
      ro: 'Vodcă',
      it: 'Vodka',
      es: 'Vodka',
      fr: 'Vodka',
    },
  },
  {
    bg: 'уиски',
    t: {
      en: 'Whiskey',
      de: 'Whiskey',
      ru: 'Виски',
      ro: 'Whiskey',
      it: 'Whiskey',
      es: 'Whiskey',
      fr: 'Whiskey',
    },
  },
  {
    bg: 'бели вина',
    t: {
      en: 'White Wines',
      de: 'Weißweine',
      ru: 'Белые вина',
      ro: 'Vinuri Albe',
      it: 'Vini Bianchi',
      es: 'Vinos Blancos',
      fr: 'Vins Blancs',
    },
  },
  {
    bg: 'червени вина',
    t: {
      en: 'Red Wines',
      de: 'Rotweine',
      ru: 'Красные вина',
      ro: 'Vinuri Roșii',
      it: 'Vini Rossi',
      es: 'Vinos Tintos',
      fr: 'Vins Rouges',
    },
  },
  // NOTE: the previous version of this file also had a `'топли напитки/'`
  // (trailing slash) row here — a malformed duplicate of `'топли напитки'`
  // above (same translations). Dropped rather than "fixed": normalizing the
  // slash away just collides with the existing entry, so keeping it as a
  // separate row would either violate the unique constraint or waste a row.
  {
    bg: 'изба ивайловград',
    t: {
      en: 'Ivaylovgrad Winery',
      de: 'Weingut Ivaylovgrad',
      ru: 'Винодельня Ивайловград',
      ro: 'Crama Ivailovgrad',
      it: 'Cantina Ivaylovgrad',
      es: 'Bodega Ivaylovgrad',
      fr: 'Cave Ivaylovgrad',
    },
  },
];

// ── Traditional Bulgarian dishes — proper nouns from Demo_menu.json ────────
// Cross-referenced against public records (Wikipedia, Bulgarian culinary
// sources). Specific menu item names, same treatment as DISH_NAMES above.
const MORE_DISHES: TermRow[] = [
  {
    bg: 'катък',
    t: {
      en: 'Katak',
      de: 'Katak',
      ru: 'Катък',
      ro: 'Katak',
      it: 'Katak',
      es: 'Katak',
      fr: 'Katak',
    },
  },
  {
    bg: 'пататник',
    t: {
      en: 'Patatnik',
      de: 'Patatnik',
      ru: 'Пататник',
      ro: 'Patatnik',
      it: 'Patatnik',
      es: 'Patatnik',
      fr: 'Patatnik',
    },
  },
  {
    bg: 'качамак',
    t: {
      en: 'Kachamak',
      de: 'Kachamak',
      ru: 'Качамак',
      ro: 'Mămăligă',
      it: 'Kachamak',
      es: 'Kachamak',
      fr: 'Kachamak',
    },
  },
  {
    bg: 'синдирмьо',
    t: {
      en: 'Sindirmyo',
      de: 'Sindirmyo',
      ru: 'Синдирмьо',
      ro: 'Sindirmyo',
      it: 'Sindirmyo',
      es: 'Sindirmyo',
      fr: 'Sindirmyo',
    },
  },
  {
    bg: 'кавърма',
    t: {
      en: 'Kavarma',
      de: 'Kavarma',
      ru: 'Кавърма',
      ro: 'Kavarma',
      it: 'Kavarma',
      es: 'Kavarma',
      fr: 'Kavarma',
    },
  },
  {
    bg: 'луканка',
    t: {
      en: 'Lukanka',
      de: 'Lukanka',
      ru: 'Луканка',
      ro: 'Lukanka',
      it: 'Lukanka',
      es: 'Lukanka',
      fr: 'Lukanka',
    },
  },
  {
    bg: 'филе елена',
    t: {
      en: 'Elena Fillet',
      de: 'Elena-Filet',
      ru: 'Филе Елена',
      ro: 'File Elena',
      it: 'Filetto Elena',
      es: 'Filete Elena',
      fr: 'Filet Elena',
    },
  },
  {
    bg: 'суджук',
    t: {
      en: 'Sudzhuk',
      de: 'Sudschuk',
      ru: 'Суджук',
      ro: 'Sugiuc',
      it: 'Sudzhuk',
      es: 'Sudzhuk',
      fr: 'Sudzhuk',
    },
  },
  {
    bg: 'рачел',
    t: {
      en: 'Rachel',
      de: 'Rachel',
      ru: 'Рачел',
      ro: 'Rachel',
      it: 'Rachel',
      es: 'Rachel',
      fr: 'Rachel',
    },
  },
  {
    bg: 'снежанка',
    t: {
      en: 'Snezhanka',
      de: 'Snezhanka',
      ru: 'Снежанка',
      ro: 'Snezhanka',
      it: 'Snezhanka',
      es: 'Snezhanka',
      fr: 'Snezhanka',
    },
  },
  {
    bg: 'родопски данон',
    t: {
      en: 'Rhodope Yogurt Dessert',
      de: 'Rhodopen-Joghurtdessert',
      ru: 'Родопски данон',
      ro: 'Desert de Iaurt Rhodopean',
      it: 'Dessert allo Yogurt dei Rodopi',
      es: 'Postre de Yogur Ródope',
      fr: 'Dessert au Yaourt des Rhodopes',
    },
  },
  {
    bg: 'родопски клин',
    t: {
      en: 'Rhodope Klin',
      de: 'Rhodopen-Klin',
      ru: 'Родопски клин',
      ro: 'Klin Rodopeean',
      it: 'Klin dei Rodopi',
      es: 'Klin Ródope',
      fr: 'Klin des Rhodopes',
    },
  },
];

// ── Standalone ingredient/cooking terms found in compound item names ───────
const MORE_INGREDIENTS: TermRow[] = [
  {
    bg: 'мед',
    t: {
      en: 'Honey',
      de: 'Honig',
      ru: 'Мёд',
      ro: 'Miere',
      it: 'Miele',
      es: 'Miel',
      fr: 'Miel',
    },
  },
  {
    bg: 'сметана',
    t: {
      en: 'Cream',
      de: 'Sahne',
      ru: 'Сметана',
      ro: 'Smântână',
      it: 'Panna',
      es: 'Nata',
      fr: 'Crème',
    },
  },
  {
    bg: 'бадеми',
    t: {
      en: 'Almonds',
      de: 'Mandeln',
      ru: 'Миндаль',
      ro: 'Migdale',
      it: 'Mandorle',
      es: 'Almendras',
      fr: 'Amandes',
    },
  },
  {
    bg: 'фъстъци',
    t: {
      en: 'Peanuts',
      de: 'Erdnüsse',
      ru: 'Арахис',
      ro: 'Arahide',
      it: 'Arachidi',
      es: 'Cacahuetes',
      fr: 'Cacahuètes',
    },
  },
];

// ── Hot drinks & other beverage items ─────────────────────────────────────
const HOT_DRINKS: TermRow[] = [
  {
    bg: 'кафе еспресо',
    t: {
      en: 'Espresso',
      de: 'Espresso',
      ru: 'Эспрессо',
      ro: 'Espresso',
      it: 'Espresso',
      es: 'Espresso',
      fr: 'Espresso',
    },
  },
  {
    bg: 'нес кафе',
    t: {
      en: 'Instant Coffee',
      de: 'Instantkaffee',
      ru: 'Растворимый кофе',
      ro: 'Nes Cafea',
      it: 'Caffè Istantaneo',
      es: 'Café Instantáneo',
      fr: 'Café Instantané',
    },
  },
  {
    bg: 'капучино',
    t: {
      en: 'Cappuccino',
      de: 'Cappuccino',
      ru: 'Капучино',
      ro: 'Cappuccino',
      it: 'Cappuccino',
      es: 'Capuchino',
      fr: 'Cappuccino',
    },
  },
  {
    bg: 'топъл шоколад',
    t: {
      en: 'Hot Chocolate',
      de: 'Heiße Schokolade',
      ru: 'Горячий шоколад',
      ro: 'Ciocolată Caldă',
      it: 'Cioccolata Calda',
      es: 'Chocolate Caliente',
      fr: 'Chocolat Chaud',
    },
  },
  {
    bg: 'мляко с какао',
    t: {
      en: 'Milk with Cocoa',
      de: 'Milch mit Kakao',
      ru: 'Молоко с какао',
      ro: 'Lapte cu Cacao',
      it: 'Latte con Cacao',
      es: 'Leche con Cacao',
      fr: 'Lait au Cacao',
    },
  },
  {
    bg: 'домашен сок',
    t: {
      en: 'Homemade Juice',
      de: 'Hausgemachter Saft',
      ru: 'Домашний сок',
      ro: 'Suc de Casă',
      it: 'Succo Fatto in Casa',
      es: 'Zumo Casero',
      fr: 'Jus Maison',
    },
  },
  {
    bg: 'натурален сок',
    t: {
      en: 'Natural Juice',
      de: 'Natursaft',
      ru: 'Натуральный сок',
      ro: 'Suc Natural',
      it: 'Succo Naturale',
      es: 'Zumo Natural',
      fr: 'Jus Naturel',
    },
  },
  {
    bg: 'чаша вино',
    t: {
      en: 'Glass of Wine',
      de: 'Glas Wein',
      ru: 'Бокал вина',
      ro: 'Pahar de Vin',
      it: 'Bicchiere di Vino',
      es: 'Copa de Vino',
      fr: 'Verre de Vin',
    },
  },
  {
    bg: 'кана',
    t: {
      en: 'Jug',
      de: 'Krug',
      ru: 'Кувшин',
      ro: 'Carafă',
      it: 'Caraffa',
      es: 'Jarra',
      fr: 'Carafe',
    },
  },
  {
    bg: 'наливна бира',
    t: {
      en: 'Draft Beer',
      de: 'Fassbier',
      ru: 'Разливное пиво',
      ro: 'Bere la Draught',
      it: 'Birra alla Spina',
      es: 'Cerveza de Barril',
      fr: 'Bière Pression',
    },
  },
  {
    bg: 'безалкохолна бира',
    t: {
      en: 'Non-Alcoholic Beer',
      de: 'Alkoholfreies Bier',
      ru: 'Безалкогольное пиво',
      ro: 'Bere Fără Alcool',
      it: 'Birra Analcolica',
      es: 'Cerveza Sin Alcohol',
      fr: 'Bière Sans Alcool',
    },
  },
];

// ── Brand names (Bulgarian-script) — transliterated, NOT translated ───────
// These are product/brand names that should be kept as close to their
// original form as possible. For Latin-script target languages we use the
// established Latin transliteration; for Cyrillic targets we keep the
// original Cyrillic.
const BRAND_NAMES: TermRow[] = [
  // Beer brands
  {
    bg: 'пиринско',
    t: {
      en: 'Pirinsko',
      de: 'Pirinsko',
      ru: 'Пиринско',
      ro: 'Pirinsko',
      it: 'Pirinsko',
      es: 'Pirinsko',
      fr: 'Pirinsko',
    },
  },
  {
    bg: 'пиринско младо пиво',
    t: {
      en: 'Pirinsko Young Beer',
      de: 'Pirinsko Jungbier',
      ru: 'Пиринско младо пиво',
      ro: 'Pirinsko Bere Tânără',
      it: 'Pirinsko Birra Giovane',
      es: 'Pirinsko Cerveza Joven',
      fr: 'Pirinsko Bière Jeune',
    },
  },
  {
    bg: 'шуменско',
    t: {
      en: 'Shumensko',
      de: 'Shumensko',
      ru: 'Шуменско',
      ro: 'Shumensko',
      it: 'Shumensko',
      es: 'Shumensko',
      fr: 'Shumensko',
    },
  },
  {
    bg: 'туборг',
    t: {
      en: 'Tuborg',
      de: 'Tuborg',
      ru: 'Туборг',
      ro: 'Tuborg',
      it: 'Tuborg',
      es: 'Tuborg',
      fr: 'Tuborg',
    },
  },
  {
    bg: 'карлсберг',
    t: {
      en: 'Carlsberg',
      de: 'Carlsberg',
      ru: 'Карлсберг',
      ro: 'Carlsberg',
      it: 'Carlsberg',
      es: 'Carlsberg',
      fr: 'Carlsberg',
    },
  },
  {
    bg: 'будвайзер',
    t: {
      en: 'Budweiser',
      de: 'Budweiser',
      ru: 'Будвайзер',
      ro: 'Budweiser',
      it: 'Budweiser',
      es: 'Budweiser',
      fr: 'Budweiser',
    },
  },
  {
    bg: 'жатецки хъс',
    t: {
      en: 'Žatecký Gus',
      de: 'Žatecký Gus',
      ru: 'Жатецки хъс',
      ro: 'Žatecký Gus',
      it: 'Žatecký Gus',
      es: 'Žatecký Gus',
      fr: 'Žatecký Gus',
    },
  },
  {
    bg: 'самърсби',
    t: {
      en: 'Somersby',
      de: 'Somersby',
      ru: 'Самърсби',
      ro: 'Somersby',
      it: 'Somersby',
      es: 'Somersby',
      fr: 'Somersby',
    },
  },
  {
    bg: 'редбул',
    t: {
      en: 'Red Bull',
      de: 'Red Bull',
      ru: 'Ред Булл',
      ro: 'Red Bull',
      it: 'Red Bull',
      es: 'Red Bull',
      fr: 'Red Bull',
    },
  },
  // Rakia brands
  {
    bg: 'пещерска отлежала',
    t: {
      en: 'Peshterska Aged Rakia',
      de: 'Peshterska Gereifter Rakia',
      ru: 'Пещерска отлежала',
      ro: 'Peshterska Învechită',
      it: 'Peshterska Invecchiata',
      es: 'Peshterska Añejada',
      fr: 'Peshterska Vieillie',
    },
  },
  {
    bg: 'ямболска',
    t: {
      en: 'Yambolska',
      de: 'Yambolska',
      ru: 'Ямболска',
      ro: 'Yambolska',
      it: 'Yambolska',
      es: 'Yambolska',
      fr: 'Yambolska',
    },
  },
  {
    bg: 'поморие',
    t: {
      en: 'Pomorie',
      de: 'Pomorie',
      ru: 'Поморие',
      ro: 'Pomorie',
      it: 'Pomorie',
      es: 'Pomorie',
      fr: 'Pomorie',
    },
  },
  {
    bg: 'сунгурларска',
    t: {
      en: 'Sungularska',
      de: 'Sungularska',
      ru: 'Сунгурларска',
      ro: 'Sungularska',
      it: 'Sungularska',
      es: 'Sungularska',
      fr: 'Sungularska',
    },
  },
  {
    bg: 'бургаска мускатова',
    t: {
      en: 'Burgaska Muscat',
      de: 'Burgaska Muskat',
      ru: 'Бургаска мускатова',
      ro: 'Burgaska Muscat',
      it: 'Burgaska Moscato',
      es: 'Burgaska Moscatel',
      fr: 'Burgaska Muscat',
    },
  },
  {
    bg: 'бургас 63',
    t: {
      en: 'Burgas 63',
      de: 'Burgas 63',
      ru: 'Бургас 63',
      ro: 'Burgas 63',
      it: 'Burgas 63',
      es: 'Burgas 63',
      fr: 'Burgas 63',
    },
  },
  {
    bg: 'стралджанска мускатова',
    t: {
      en: 'Straldjanska Muscat',
      de: 'Straldjanska Muskat',
      ru: 'Стралджанска мускатова',
      ro: 'Straldjanska Muscat',
      it: 'Straldjanska Moscato',
      es: 'Straldjanska Moscatel',
      fr: 'Straldjanska Muscat',
    },
  },
  {
    bg: 'троянска сливова 3 годишна',
    t: {
      en: 'Troyanska Plum Rakia 3-Year',
      de: 'Troyanska Pflaume 3 Jahre',
      ru: 'Троянска сливова 3-годишна',
      ro: 'Troyanska de Prune 3 Ani',
      it: 'Troyanska Prugna 3 Anni',
      es: 'Troyanska Ciruela 3 Años',
      fr: 'Troyanska Prune 3 Ans',
    },
  },
  // Anise drinks
  {
    bg: 'мастика пещера',
    t: {
      en: 'Mastika Peshtera',
      de: 'Mastika Peshtera',
      ru: 'Мастика Пещера',
      ro: 'Mastika Peshtera',
      it: 'Mastika Peshtera',
      es: 'Mastika Peshtera',
      fr: 'Mastika Peshtera',
    },
  },
  {
    bg: 'узо пломари',
    t: {
      en: 'Ouzo Plomari',
      de: 'Ouzo Plomari',
      ru: 'Узо Пломари',
      ro: 'Ouzo Plomari',
      it: 'Ouzo Plomari',
      es: 'Ouzo Plomari',
      fr: 'Ouzo Plomari',
    },
  },
  {
    bg: 'узо 12',
    t: {
      en: 'Ouzo 12',
      de: 'Ouzo 12',
      ru: 'Узо 12',
      ro: 'Ouzo 12',
      it: 'Ouzo 12',
      es: 'Ouzo 12',
      fr: 'Ouzo 12',
    },
  },
  {
    bg: 'перно',
    t: {
      en: 'Pernod',
      de: 'Pernod',
      ru: 'Перно',
      ro: 'Pernod',
      it: 'Pernod',
      es: 'Pernod',
      fr: 'Pernod',
    },
  },
  // Spirits
  {
    bg: 'метакса',
    t: {
      en: 'Metaxa',
      de: 'Metaxa',
      ru: 'Метакса',
      ro: 'Metaxa',
      it: 'Metaxa',
      es: 'Metaxa',
      fr: 'Metaxa',
    },
  },
  {
    bg: 'ром атлантик',
    t: {
      en: 'Atlantic Rum',
      de: 'Atlantic Rum',
      ru: 'Ром Атлантик',
      ro: 'Rom Atlantic',
      it: 'Rum Atlantic',
      es: 'Ron Atlantic',
      fr: 'Rhum Atlantic',
    },
  },
  {
    bg: 'мента пещера',
    t: {
      en: 'Menta Peshtera',
      de: 'Menta Peshtera',
      ru: 'Мента Пещера',
      ro: 'Menta Peshtera',
      it: 'Menta Peshtera',
      es: 'Menta Peshtera',
      fr: 'Menta Peshtera',
    },
  },
  {
    bg: 'джин савой',
    t: {
      en: 'Savoy Gin',
      de: 'Savoy Gin',
      ru: 'Джин Савой',
      ro: 'Gin Savoy',
      it: 'Gin Savoy',
      es: 'Gin Savoy',
      fr: 'Gin Savoy',
    },
  },
  {
    bg: 'мартини бианко',
    t: {
      en: 'Martini Bianco',
      de: 'Martini Bianco',
      ru: 'Мартини Бианко',
      ro: 'Martini Bianco',
      it: 'Martini Bianco',
      es: 'Martini Bianco',
      fr: 'Martini Bianco',
    },
  },
  {
    bg: 'бейлис',
    t: {
      en: 'Baileys',
      de: 'Baileys',
      ru: 'Бейлис',
      ro: 'Baileys',
      it: 'Baileys',
      es: 'Baileys',
      fr: 'Baileys',
    },
  },
  {
    bg: 'савой',
    t: {
      en: 'Savoy',
      de: 'Savoy',
      ru: 'Савой',
      ro: 'Savoy',
      it: 'Savoy',
      es: 'Savoy',
      fr: 'Savoy',
    },
  },
  {
    bg: 'абсолют',
    t: {
      en: 'Absolut',
      de: 'Absolut',
      ru: 'Абсолют',
      ro: 'Absolut',
      it: 'Absolut',
      es: 'Absolut',
      fr: 'Absolut',
    },
  },
  {
    bg: 'финландия',
    t: {
      en: 'Finlandia',
      de: 'Finlandia',
      ru: 'Финляндия',
      ro: 'Finlandia',
      it: 'Finlandia',
      es: 'Finlandia',
      fr: 'Finlandia',
    },
  },
  {
    bg: 'собиески зелена ябълка',
    t: {
      en: 'Sobieski Green Apple',
      de: 'Sobieski Grüner Apfel',
      ru: 'Собиески зелёное яблоко',
      ro: 'Sobieski Măr Verde',
      it: 'Sobieski Mela Verde',
      es: 'Sobieski Manzana Verde',
      fr: 'Sobieski Pomme Verte',
    },
  },
  {
    bg: 'руски стандарт',
    t: {
      en: 'Russian Standard',
      de: 'Russian Standard',
      ru: 'Русский стандарт',
      ro: 'Russian Standard',
      it: 'Russian Standard',
      es: 'Russian Standard',
      fr: 'Russian Standard',
    },
  },
  // Wine brands/types
  {
    bg: 'совиньон блан',
    t: {
      en: 'Sauvignon Blanc',
      de: 'Sauvignon Blanc',
      ru: 'Совиньон Блан',
      ro: 'Sauvignon Blanc',
      it: 'Sauvignon Blanc',
      es: 'Sauvignon Blanc',
      fr: 'Sauvignon Blanc',
    },
  },
  {
    bg: 'пино гри',
    t: {
      en: 'Pinot Gris',
      de: 'Pinot Gris',
      ru: 'Пино Гри',
      ro: 'Pinot Gris',
      it: 'Pinot Grigio',
      es: 'Pinot Gris',
      fr: 'Pinot Gris',
    },
  },
  {
    bg: 'каберне совиньон',
    t: {
      en: 'Cabernet Sauvignon',
      de: 'Cabernet Sauvignon',
      ru: 'Каберне Совиньон',
      ro: 'Cabernet Sauvignon',
      it: 'Cabernet Sauvignon',
      es: 'Cabernet Sauvignon',
      fr: 'Cabernet Sauvignon',
    },
  },
  {
    bg: 'мавруд асеновград',
    t: {
      en: 'Mavrud Asenovgrad',
      de: 'Mavrud Asenovgrad',
      ru: 'Мавруд Асеновград',
      ro: 'Mavrud Asenovgrad',
      it: 'Mavrud Asenovgrad',
      es: 'Mavrud Asenovgrad',
      fr: 'Mavrud Asenovgrad',
    },
  },
  {
    bg: 'мезек мерло',
    t: {
      en: 'Mezek Merlot',
      de: 'Mezek Merlot',
      ru: 'Мезек Мерло',
      ro: 'Mezek Merlot',
      it: 'Mezek Merlot',
      es: 'Mezek Merlot',
      fr: 'Mezek Merlot',
    },
  },
  {
    bg: 'мезек каберне совиньон',
    t: {
      en: 'Mezek Cabernet Sauvignon',
      de: 'Mezek Cabernet Sauvignon',
      ru: 'Мезек Каберне Совиньон',
      ro: 'Mezek Cabernet Sauvignon',
      it: 'Mezek Cabernet Sauvignon',
      es: 'Mezek Cabernet Sauvignon',
      fr: 'Mezek Cabernet Sauvignon',
    },
  },
  {
    bg: 'търговище мускат',
    t: {
      en: 'Targovishte Muscat',
      de: 'Targovishte Muskat',
      ru: 'Търговище Мускат',
      ro: 'Targovishte Muscat',
      it: 'Targovishte Moscato',
      es: 'Targovishte Moscatel',
      fr: 'Targovishte Muscat',
    },
  },
  {
    bg: 'търговище шардоне',
    t: {
      en: 'Targovishte Chardonnay',
      de: 'Targovishte Chardonnay',
      ru: 'Търговище Шардоне',
      ro: 'Targovishte Chardonnay',
      it: 'Targovishte Chardonnay',
      es: 'Targovishte Chardonnay',
      fr: 'Targovishte Chardonnay',
    },
  },
  {
    bg: 'търговище траминер',
    t: {
      en: 'Targovishte Traminer',
      de: 'Targovishte Traminer',
      ru: 'Търговище Траминер',
      ro: 'Targovishte Traminer',
      it: 'Targovishte Traminer',
      es: 'Targovishte Traminer',
      fr: 'Targovishte Traminer',
    },
  },
  {
    bg: 'вила армира совиньон, шердоне',
    t: {
      en: 'Villa Armira Sauvignon, Chardonnay',
      de: 'Villa Armira Sauvignon, Chardonnay',
      ru: 'Вила Армира Совиньон, Шардоне',
      ro: 'Villa Armira Sauvignon, Chardonnay',
      it: 'Villa Armira Sauvignon, Chardonnay',
      es: 'Villa Armira Sauvignon, Chardonnay',
      fr: 'Villa Armira Sauvignon, Chardonnay',
    },
  },
  // Misc branded
  {
    bg: 'газирана вода "михалково"',
    t: {
      en: 'Mihalkovo Sparkling Water',
      de: 'Mihalkovo Sprudelwasser',
      ru: 'Газированная вода «Михалково»',
      ro: 'Apă Carbogazoasă Mihalkovo',
      it: 'Acqua Frizzante Mihalkovo',
      es: 'Agua con Gas Mihalkovo',
      fr: 'Eau Gazeuse Mihalkovo',
    },
  },
];

// ── International brand names (already Latin-script, kept identical) ───────
// These are brands that appear in the menu already in Latin script.
// We keep them identical across all target languages — they're proper nouns.
const INTL_BRANDS: TermRow[] = [
  {
    bg: '7 up',
    t: {
      en: '7 Up',
      de: '7 Up',
      ru: '7 Up',
      ro: '7 Up',
      it: '7 Up',
      es: '7 Up',
      fr: '7 Up',
    },
  },
  {
    bg: 'pepsi',
    t: {
      en: 'Pepsi',
      de: 'Pepsi',
      ru: 'Пепси',
      ro: 'Pepsi',
      it: 'Pepsi',
      es: 'Pepsi',
      fr: 'Pepsi',
    },
  },
  {
    bg: 'mirinda',
    t: {
      en: 'Mirinda',
      de: 'Mirinda',
      ru: 'Миринда',
      ro: 'Mirinda',
      it: 'Mirinda',
      es: 'Mirinda',
      fr: 'Mirinda',
    },
  },
  {
    bg: 'evervess tonic',
    t: {
      en: 'Evervess Tonic',
      de: 'Evervess Tonic',
      ru: 'Эвервесс Тоник',
      ro: 'Evervess Tonic',
      it: 'Evervess Tonic',
      es: 'Evervess Tonic',
      fr: 'Evervess Tonic',
    },
  },
  {
    bg: 'jack daniels',
    t: {
      en: "Jack Daniel's",
      de: "Jack Daniel's",
      ru: "Джек Дэниел'с",
      ro: "Jack Daniel's",
      it: "Jack Daniel's",
      es: "Jack Daniel's",
      fr: "Jack Daniel's",
    },
  },
  {
    bg: 'johnnie walker',
    t: {
      en: 'Johnnie Walker',
      de: 'Johnnie Walker',
      ru: 'Джонни Уокер',
      ro: 'Johnnie Walker',
      it: 'Johnnie Walker',
      es: 'Johnnie Walker',
      fr: 'Johnnie Walker',
    },
  },
  {
    bg: 'johnnie walker 12 years',
    t: {
      en: 'Johnnie Walker 12 Years',
      de: 'Johnnie Walker 12 Jahre',
      ru: 'Джонни Уокер 12 лет',
      ro: 'Johnnie Walker 12 Ani',
      it: 'Johnnie Walker 12 Anni',
      es: 'Johnnie Walker 12 Años',
      fr: 'Johnnie Walker 12 Ans',
    },
  },
  {
    bg: 'bushmills',
    t: {
      en: 'Bushmills',
      de: 'Bushmills',
      ru: 'Бушмилс',
      ro: 'Bushmills',
      it: 'Bushmills',
      es: 'Bushmills',
      fr: 'Bushmills',
    },
  },
  {
    bg: 'jameson',
    t: {
      en: 'Jameson',
      de: 'Jameson',
      ru: 'Джемесон',
      ro: 'Jameson',
      it: 'Jameson',
      es: 'Jameson',
      fr: 'Jameson',
    },
  },
  {
    bg: 'tullamore dew',
    t: {
      en: 'Tullamore Dew',
      de: 'Tullamore Dew',
      ru: 'Талламор Дью',
      ro: 'Tullamore Dew',
      it: 'Tullamore Dew',
      es: 'Tullamore Dew',
      fr: 'Tullamore Dew',
    },
  },
  // Mixed BG+Latin brand/wine names
  {
    bg: 'джин beefeater',
    t: {
      en: 'Beefeater Gin',
      de: 'Beefeater Gin',
      ru: 'Джин Бифитер',
      ro: 'Gin Beefeater',
      it: 'Gin Beefeater',
      es: 'Ginebra Beefeater',
      fr: 'Gin Beefeater',
    },
  },
  {
    bg: 'студен чай lipton',
    t: {
      en: 'Lipton Iced Tea',
      de: 'Lipton Eistee',
      ru: 'Холодный чай Липтон',
      ro: 'Ceai Rece Lipton',
      it: 'Tè Freddo Lipton',
      es: 'Té Helado Lipton',
      fr: 'Thé Glacé Lipton',
    },
  },
  {
    bg: 'розе pinot noir',
    t: {
      en: 'Rosé Pinot Noir',
      de: 'Rosé Pinot Noir',
      ru: 'Розе Пино Нуар',
      ro: 'Rosé Pinot Noir',
      it: 'Rosé Pinot Nero',
      es: 'Rosado Pinot Noir',
      fr: 'Rosé Pinot Noir',
    },
  },
  {
    bg: 'сира yamantievs',
    t: {
      en: 'Syrah Yamantievs',
      de: 'Syrah Yamantievs',
      ru: 'Сира Яманциевс',
      ro: 'Syrah Yamantievs',
      it: 'Syrah Yamantievs',
      es: 'Syrah Yamantievs',
      fr: 'Syrah Yamantievs',
    },
  },
  {
    bg: 'мерло yamantievs',
    t: {
      en: 'Merlot Yamantievs',
      de: 'Merlot Yamantievs',
      ru: 'Мерло Яманциевс',
      ro: 'Merlot Yamantievs',
      it: 'Merlot Yamantievs',
      es: 'Merlot Yamantievs',
      fr: 'Merlot Yamantievs',
    },
  },
];

// ── REMOVED: COMPOUND_ITEMS (66 rows) ───────────────────────────────────────
// Full multi-word menu item names copied verbatim from one demo restaurant's
// Demo_menu.json (e.g. "запечено сирене със сладко от боровинки", "омлет със
// шунка, сирене и домати"). This is exactly the anti-pattern this rewrite
// exists to undo — a glossary can never converge if it tries to cover every
// restaurant's full item names. Deliberately not migrated to any group here;
// running this file with --prune deletes any leftover DB rows for them.

export const GROUPS: {
  kind: GlossaryKind;
  category: string;
  rows: TermRow[];
}[] = [
  { kind: 'TERM', category: 'section', rows: SECTIONS },
  { kind: 'TERM', category: 'prep', rows: PREP_WORDS },
  { kind: 'TERM', category: 'ingredient', rows: INGREDIENTS },
  { kind: 'TERM', category: 'condiment', rows: CONDIMENTS },
  { kind: 'TERM', category: 'drink', rows: MORE_DRINKS },
  { kind: 'TERM', category: 'section', rows: MORE_SECTIONS },
  { kind: 'TERM', category: 'ingredient', rows: MORE_INGREDIENTS },
  { kind: 'TERM', category: 'drink', rows: HOT_DRINKS },
  { kind: 'PROTECTED_DISH', category: 'dish', rows: DISH_NAMES },
  { kind: 'PROTECTED_DISH', category: 'dish', rows: MORE_DISHES },
  { kind: 'DO_NOT_TRANSLATE', category: 'brand', rows: BRAND_NAMES },
  { kind: 'DO_NOT_TRANSLATE', category: 'brand', rows: INTL_BRANDS },
];

/** Flat view of every row across all groups — used by validation and by
 * scripts (e.g. the poisoning repair script) that need the full curated set
 * without caring about kind/category. */
export const ROWS: TermRow[] = GROUPS.flatMap((g) => g.rows);

interface Term {
  sourceLang: 'bg';
  sourceText: string;
  targetLang: TargetLang;
  translatedText: string;
  kind: GlossaryKind;
  category: string;
}

const TERMS: Term[] = GROUPS.flatMap(({ kind, category, rows }) =>
  rows.flatMap((row) =>
    (Object.entries(row.t) as [TargetLang, string][]).map(
      ([targetLang, translatedText]) => ({
        sourceLang: 'bg' as const,
        sourceText: row.bg,
        targetLang,
        translatedText,
        kind,
        category,
      }),
    ),
  ),
);

const CANONICAL_SOURCE_TEXTS = [...new Set(ROWS.map((r) => r.bg))];

/** Runs N upserts with bounded concurrency — fast enough not to need a raw
 * multi-row INSERT, but never wraps writes in an interactive $transaction
 * (PgBouncer transaction-mode pooling can't hold a connection across many
 * round-trips — see CLAUDE.md). Each upsert is its own autocommit statement;
 * only independent writes run concurrently. */
async function upsertInBatches(terms: Term[], concurrency = 25) {
  for (let i = 0; i < terms.length; i += concurrency) {
    const batch = terms.slice(i, i + concurrency);
    await Promise.all(
      batch.map((term) =>
        prisma.glossaryTerm.upsert({
          where: {
            sourceLang_sourceText_targetLang: {
              sourceLang: term.sourceLang,
              sourceText: term.sourceText,
              targetLang: term.targetLang,
            },
          },
          create: {
            sourceLang: term.sourceLang,
            sourceText: term.sourceText,
            targetLang: term.targetLang,
            translatedText: term.translatedText,
            kind: term.kind,
            category: term.category,
            verified: true,
          },
          update: {
            translatedText: term.translatedText,
            kind: term.kind,
            category: term.category,
            verified: true,
          },
        }),
      ),
    );
  }
}

async function printDryRun() {
  const existing = await prisma.glossaryTerm.findMany({
    where: { sourceLang: 'bg' },
    select: { sourceText: true, targetLang: true, translatedText: true },
  });
  const existingKey = (sourceText: string, targetLang: string) =>
    `${sourceText}::${targetLang}`;
  const existingMap = new Map(
    existing.map((e) => [
      existingKey(e.sourceText, e.targetLang),
      e.translatedText,
    ]),
  );

  let toAdd = 0;
  let toUpdate = 0;
  let unchanged = 0;
  for (const term of TERMS) {
    const key = existingKey(term.sourceText, term.targetLang);
    if (!existingMap.has(key)) toAdd++;
    else if (existingMap.get(key) !== term.translatedText) toUpdate++;
    else unchanged++;
  }

  const staleSourceTexts = [
    ...new Set(
      existing
        .map((e) => e.sourceText)
        .filter((s) => !CANONICAL_SOURCE_TEXTS.includes(s)),
    ),
  ];
  const staleRowCount = existing.filter((e) =>
    staleSourceTexts.includes(e.sourceText),
  ).length;

  console.log('── DRY RUN — no writes performed ──────────────────────────');
  console.log(
    `Canonical set: ${ROWS.length} bg terms × up to 7 langs = ${TERMS.length} rows`,
  );
  console.log(`  to add:       ${toAdd}`);
  console.log(`  to update:    ${toUpdate}`);
  console.log(`  unchanged:    ${unchanged}`);
  console.log(
    `Stale (in DB, not in canonical set): ${staleSourceTexts.length} bg terms / ${staleRowCount} rows`,
  );
  if (staleSourceTexts.length > 0) {
    console.log(
      `  e.g.: ${staleSourceTexts.slice(0, 10).join(', ')}${staleSourceTexts.length > 10 ? ', …' : ''}`,
    );
    console.log('  Re-run with --prune to delete these.');
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const prune = args.includes('--prune');

  // ── Structural pre-flight (folded in from the old validate-glossary.ts —
  // no file-write side effect, just a hard stop on malformed data) ─────────
  const errors = validateRows(ROWS);
  if (errors.length > 0) {
    console.error('❌ Glossary validation failed:');
    for (const e of errors) console.error(`   - ${e}`);
    process.exit(1);
  }

  assertLocalSeedTarget(process.env.DATABASE_URL, process.env.NODE_ENV);

  if (dryRun) {
    await printDryRun();
    return;
  }

  await upsertInBatches(TERMS);
  console.log(
    `Upserted ${TERMS.length} glossary rows (${ROWS.length} bg terms × up to 7 target langs).`,
  );

  if (prune) {
    const { count } = await prisma.glossaryTerm.deleteMany({
      where: {
        sourceLang: 'bg',
        sourceText: { notIn: CANONICAL_SOURCE_TEXTS },
      },
    });
    console.log(`Pruned ${count} stale rows not in the canonical set.`);
  } else {
    console.log(
      'Run with --prune to delete stale rows not in the canonical set (dry-run first to preview).',
    );
  }
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
