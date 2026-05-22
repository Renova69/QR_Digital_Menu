// apps/backend/prisma/seed-help-content.ts
import { PrismaClient } from '@prisma/client';

const LANDING_FAQ = [
  {
    itemKey: 'q1',
    en: {
      title: 'What is QR Menu and how does it work?',
      body: 'QR Menu turns every table into a digital ordering station. Customers scan a QR code, browse your full menu on their phone, place orders instantly, and pay by card — all from their browser. No app download, no account sign-up, no friction. Orders appear immediately in your dashboard, on the Kitchen Display, and in the Waiter POS.',
    },
    bg: {
      title: 'Какво е QR Menu и как работи?',
      body: 'QR Menu превръща всяка маса в дигитална станция за поръчки. Клиентите сканират QR код, разглеждат пълното меню на телефона си, правят поръчки и плащат с карта — директно от браузъра. Без изтегляне на приложение, без регистрация. Поръчките се появяват веднага в таблото за управление, кухненския дисплей и ПОС терминала.',
    },
    ro: {
      title: 'Ce este QR Menu și cum funcționează?',
      body: 'QR Menu transformă fiecare masă într-o stație digitală de comandă. Clienții scanează un cod QR, navighează prin meniul complet pe telefon, plasează comenzi instantaneu și plătesc cu cardul — totul din browser. Fără descărcare de aplicație, fără înregistrare. Comenzile apar imediat în tabloul de bord, pe afișajul de bucătărie și în POS.',
    },
  },
  {
    itemKey: 'q2',
    en: {
      title: 'Do I need special hardware or printers?',
      body: 'No special hardware required. QR Menu is fully cloud-based — you only need a standard printer (any inkjet or laser) to print QR code cards on A4 paper. We provide three print templates (Classic, Premium, Minimal) formatted for clean 2×2 grid layouts. Tablets for Waiter POS and Kitchen Display are optional. Best part: your QR codes never change — update your menu, prices, or items anytime without reprinting.',
    },
    bg: {
      title: 'Трябва ли ми специален хардуер или принтери?',
      body: 'Не е необходим специален хардуер. QR Menu е изцяло облачно базиран — нужен ви е само стандартен принтер (мастилено-струен или лазерен), за да отпечатате QR кодове на А4. Предлагаме три шаблона за печат (Classic, Premium, Minimal) форматирани за чисти 2×2 решетки. Таблетите за ПОС и кухненски дисплей са по избор. Най-доброто: QR кодовете ви никога не се променят — обновявайте менюто, цените или артикулите по всяко време без препечатване.',
    },
    ro: {
      title: 'Am nevoie de hardware sau imprimante speciale?',
      body: 'Nu este necesar hardware special. QR Menu este complet bazat pe cloud — aveți nevoie doar de o imprimantă standard (inkjet sau laser) pentru a imprima coduri QR pe hârtie A4. Oferim trei șabloane de imprimare (Classic, Premium, Minimal) formatate pentru grile 2×2. Tabletele pentru POS și afișajul de bucătărie sunt opționale. Cel mai bun lucru: codurile QR nu se schimbă niciodată — actualizați meniul, prețurile sau articolele oricând fără reimprimare.',
    },
  },
  {
    itemKey: 'q3',
    en: {
      title: 'How much does it cost? Are there hidden fees?',
      body: 'Plans start at €29/month (Starter), €79/month (Pro), and €199/month (Enterprise). There are no per-order commissions and no hidden platform fees. Stripe card processing fees (1.4% + €0.25 per EU transaction) are standard and go directly to Stripe, not us. All plans are billed monthly with no lock-in contracts — cancel anytime from the Billing portal.',
    },
    bg: {
      title: 'Колко струва? Има ли скрити такси?',
      body: 'Плановете започват от €29/месец (Starter), €79/месец (Pro) и €199/месец (Enterprise). Няма комисионни за поръчка и скрити такси. Таксите за обработка на карти през Stripe (1.4% + €0.25 на транзакция в ЕС) са стандартни и отиват директно в Stripe. Всички планове се таксуват месечно без дългосрочни договори — прекратете по всяко време от портала за фактуриране.',
    },
    ro: {
      title: 'Cât costă? Există taxe ascunse?',
      body: 'Abonamentele încep de la €29/lună (Starter), €79/lună (Pro) și €199/lună (Enterprise). Nu există comisioane per comandă și nici taxe ascunse de platformă. Taxele de procesare a cardurilor Stripe (1.4% + €0.25 per tranzacție UE) sunt standard și merg direct la Stripe, nu la noi. Toate abonamentele sunt facturate lunar fără contracte pe termen lung — anulați oricând din portalul de facturare.',
    },
  },
  {
    itemKey: 'q4',
    en: {
      title: 'How quickly can I go live?',
      body: 'Most restaurants go live the same day. The setup takes under 30 minutes: create your restaurant profile, add your tables, build your menu (or import from an existing file), and print QR codes. No technical skills, no coding, no integration work needed. If you have an existing digital menu, our team can convert it for free.',
    },
    bg: {
      title: 'Колко бързо мога да стартирам?',
      body: 'Повечето ресторанти стартират в същия ден. Настройката отнема под 30 минути: създайте профил на ресторанта, добавете маси, изградете меню (или импортирайте от съществуващ файл) и отпечатайте QR кодове. Не са необходими технически умения, програмиране или интеграция. Ако имате съществуващо дигитално меню, нашият екип може да го конвертира безплатно.',
    },
    ro: {
      title: 'Cât de repede pot deveni operațional?',
      body: 'Majoritatea restaurantelor devin operaționale în aceeași zi. Configurarea durează sub 30 de minute: creați profilul restaurantului, adăugați mesele, construiți meniul (sau importați dintr-un fișier existent) și imprimați codurile QR. Nu sunt necesare abilități tehnice, programare sau lucrări de integrare. Dacă aveți deja un meniu digital, echipa noastră îl poate converti gratuit.',
    },
  },
  {
    itemKey: 'q5',
    en: {
      title: 'How do tableside payments and tipping work?',
      body: 'Customers tap "Request Bill" on their phone to see an itemized bill, select a tip percentage (you set the options — e.g., 5%, 10%, 15%), and pay securely by card via Stripe Connect. The payment processes in seconds and your dashboard updates instantly. Customers can also split the bill between up to 20 people. Waiters can close tables with card payments through the POS as well.',
    },
    bg: {
      title: 'Как работят плащанията на масата и бакшишите?',
      body: 'Клиентите натискат "Заяви сметка" на телефона си, за да видят детайлна сметка, избират процент бакшиш (вие задавате опциите — напр. 5%, 10%, 15%) и плащат сигурно с карта чрез Stripe Connect. Плащането се обработва за секунди и таблото ви се обновява незабавно. Клиентите могат също да разделят сметката между до 20 души. Сервитьорите могат да приключат маси с картови плащания и през ПОС.',
    },
    ro: {
      title: 'Cum funcționează plățile la masă și bacșișul?',
      body: 'Clienții apasă "Solicită nota de plată" pe telefon pentru a vedea o notă detaliată, selectează un procent de bacșiș (dvs. setați opțiunile — de ex., 5%, 10%, 15%) și plătesc sigur cu cardul prin Stripe Connect. Plata se procesează în câteva secunde, iar tabloul de bord se actualizează instantaneu. Clienții pot, de asemenea, să împartă nota între până la 20 de persoane. Chelnerii pot închide mesele cu plăți cu cardul și prin POS.',
    },
  },
  {
    itemKey: 'q6',
    en: {
      title: 'Which languages does the menu support?',
      body: 'Your menu auto-translates to English, Bulgarian, and Romanian via DeepL — the industry-leading neural machine translation engine. Add target languages in Settings, and new menu items translate automatically. Use "Translate All Now" to batch-translate your entire existing menu. Customers see the menu in their browser language without changing any settings.',
    },
    bg: {
      title: 'Какви езици поддържа менюто?',
      body: 'Менюто ви се превежда автоматично на английски, български и румънски чрез DeepL — водещия невронен машинен превод. Добавете целеви езици в Настройки и новите артикули се превеждат автоматично. Използвайте "Преведи всичко сега" за пакетен превод на цялото меню. Клиентите виждат менюто на езика на браузъра си без да променят настройки.',
    },
    ro: {
      title: 'Ce limbi suportă meniul?',
      body: 'Meniul dvs. se traduce automat în engleză, bulgară și română prin DeepL — motorul de traducere neurală de top. Adăugați limbile țintă în Setări, iar articolele noi se traduc automat. Utilizați "Traduceți tot acum" pentru traducerea în lot a întregului meniu existent. Clienții văd meniul în limba browserului lor fără a schimba setările.',
    },
  },
  {
    itemKey: 'q7',
    en: {
      title: 'What about customer data privacy and GDPR?',
      body: 'QR Menu is fully GDPR-compliant. We provide cookie consent banners for your public menu page, auto-generate /privacy and /terms routes, and include a one-click "Right to Erasure" button that permanently deletes customer emails, transaction history, and loyalty point ledgers. Customers log in with email OTP (one-time passcodes) — no passwords are ever stored. Deleted accounts cannot be recovered, ensuring complete data removal.',
    },
    bg: {
      title: 'Ами поверителността на данните и GDPR?',
      body: 'QR Menu е напълно съвместим с GDPR. Предоставяме банери за съгласие за бисквитки за публичната страница на менюто, автоматично генерираме /privacy и /terms маршрути и включваме бутон "Право на изтриване" с едно кликване, който трайно изтрива имейли на клиенти, история на транзакции и регистри на точки за лоялност. Клиентите влизат с имейл OTP (еднократни кодове) — пароли никога не се съхраняват. Изтритите акаунти не могат да бъдат възстановени.',
    },
    ro: {
      title: 'Cum rămâne cu confidențialitatea datelor și GDPR?',
      body: 'QR Menu este pe deplin conform cu GDPR. Oferim bannere de consimțământ pentru cookie-uri pentru pagina publică a meniului, generăm automat rutele /privacy și /terms și includem un buton "Dreptul la ștergere" cu un singur clic care șterge permanent e-mailurile clienților, istoricul tranzacțiilor și registrele de puncte de loialitate. Clienții se autentifică cu OTP prin e-mail (coduri de unică folosință) — parolele nu sunt niciodată stocate. Conturile șterse nu pot fi recuperate.',
    },
  },
  {
    itemKey: 'q8',
    en: {
      title: 'Can I try it before subscribing?',
      body: 'Absolutely. Start with our free plan — it has no time limit and no credit card required. Build your digital menu, generate QR codes, and manage tables at no cost. When you are ready for advanced features like Stripe payments, loyalty programs, analytics, POS, and Kitchen Display, upgrade to a paid plan. You can upgrade or downgrade anytime.',
    },
    bg: {
      title: 'Мога ли да го тествам преди да се абонирам?',
      body: 'Абсолютно. Започнете с безплатния ни план — няма ограничение във времето и не се изисква кредитна карта. Изградете дигиталното си меню, генерирайте QR кодове и управлявайте маси безплатно. Когато сте готови за разширени функции като Stripe плащания, програми за лоялност, анализи, ПОС и кухненски дисплей, надградете до платен план. Можете да надграждате или понижавате по всяко време.',
    },
    ro: {
      title: 'Pot încerca înainte de a mă abona?',
      body: 'Absolut. Începeți cu planul nostru gratuit — nu are limită de timp și nu necesită card de credit. Construiți meniul digital, generați coduri QR și gestionați mesele fără costuri. Când sunteți pregătit pentru funcții avansate precum plăți Stripe, programe de loialitate, analize, POS și afișaj de bucătărie, faceți upgrade la un plan plătit. Puteți face upgrade sau downgrade oricând.',
    },
  },
];

const DASHBOARD_HELP = [
  {
    categoryKey: 'getting-started',
    items: [
      {
        itemKey: 'guide-title',
        en: { title: 'Getting Started Walkthrough', body: '' },
        bg: { title: 'Getting Started Walkthrough', body: '' },
        ro: { title: 'Getting Started Walkthrough', body: '' },
      },
      {
        itemKey: 'guide-desc',
        en: { title: 'Set up your digital restaurant and launch tableside QR ordering in four quick steps.', body: '' },
        bg: { title: 'Set up your digital restaurant and launch tableside QR ordering in four quick steps.', body: '' },
        ro: { title: 'Set up your digital restaurant and launch tableside QR ordering in four quick steps.', body: '' },
      },
      {
        itemKey: 'guide-step-0',
        en: { title: 'Complete your restaurant contact information, address, and local timezone in the Settings > General tab.', body: '' },
        bg: { title: 'Complete your restaurant contact information, address, and local timezone in the Settings > General tab.', body: '' },
        ro: { title: 'Complete your restaurant contact information, address, and local timezone in the Settings > General tab.', body: '' },
      },
      {
        itemKey: 'guide-step-1',
        en: { title: 'Create your dining tables in the Tables & QR tab to generate table-specific menu scanning URLs.', body: '' },
        bg: { title: 'Create your dining tables in the Tables & QR tab to generate table-specific menu scanning URLs.', body: '' },
        ro: { title: 'Create your dining tables in the Tables & QR tab to generate table-specific menu scanning URLs.', body: '' },
      },
      {
        itemKey: 'guide-step-2',
        en: { title: 'Build your menu inside the Menu Editor: define food categories and add items with pricing, photos, and descriptions.', body: '' },
        bg: { title: 'Build your menu inside the Menu Editor: define food categories and add items with pricing, photos, and descriptions.', body: '' },
        ro: { title: 'Build your menu inside the Menu Editor: define food categories and add items with pricing, photos, and descriptions.', body: '' },
      },
      {
        itemKey: 'guide-step-3',
        en: { title: 'Configure payment integration or loyalty settings, then display printed QR cards at your tables for customers.', body: '' },
        bg: { title: 'Configure payment integration or loyalty settings, then display printed QR cards at your tables for customers.', body: '' },
        ro: { title: 'Configure payment integration or loyalty settings, then display printed QR cards at your tables for customers.', body: '' },
      },
      {
        itemKey: 'guide-tip',
        en: { title: 'Verify your timezone setting! Happy hours and menu category visibility depend on your restaurant timezone.', body: '' },
        bg: { title: 'Verify your timezone setting! Happy hours and menu category visibility depend on your restaurant timezone.', body: '' },
        ro: { title: 'Verify your timezone setting! Happy hours and menu category visibility depend on your restaurant timezone.', body: '' },
      },
    ]
  },
  {
    categoryKey: 'menu',
    items: [
      {
        itemKey: 'guide-title',
        en: { title: 'Building & Customizing Your Menu', body: '' },
        bg: { title: 'Building & Customizing Your Menu', body: '' },
        ro: { title: 'Building & Customizing Your Menu', body: '' },
      },
      {
        itemKey: 'guide-desc',
        en: { title: 'Create an attractive digital catalog with drag-and-drop ordering, options, schedules, and automatic translations.', body: '' },
        bg: { title: 'Create an attractive digital catalog with drag-and-drop ordering, options, schedules, and automatic translations.', body: '' },
        ro: { title: 'Create an attractive digital catalog with drag-and-drop ordering, options, schedules, and automatic translations.', body: '' },
      },
      {
        itemKey: 'guide-step-0',
        en: { title: 'Add categories (e.g. Main Dishes, Soft Drinks) and drag items vertically to order them as you like.', body: '' },
        bg: { title: 'Add categories (e.g. Main Dishes, Soft Drinks) and drag items vertically to order them as you like.', body: '' },
        ro: { title: 'Add categories (e.g. Main Dishes, Soft Drinks) and drag items vertically to order them as you like.', body: '' },
      },
      {
        itemKey: 'guide-step-1',
        en: { title: 'Create Item Options for variations (e.g., Rare/Medium/Well-Done steak sizes) or addons (e.g., Extra Cheese).', body: '' },
        bg: { title: 'Create Item Options for variations (e.g., Rare/Medium/Well-Done steak sizes) or addons (e.g., Extra Cheese).', body: '' },
        ro: { title: 'Create Item Options for variations (e.g., Rare/Medium/Well-Done steak sizes) or addons (e.g., Extra Cheese).', body: '' },
      },
      {
        itemKey: 'guide-step-2',
        en: { title: 'Use Dayparting schedules to show specific categories only during certain hours (e.g., Breakfast menu from 8 AM to 11 AM).', body: '' },
        bg: { title: 'Use Dayparting schedules to show specific categories only during certain hours (e.g., Breakfast menu from 8 AM to 11 AM).', body: '' },
        ro: { title: 'Use Dayparting schedules to show specific categories only during certain hours (e.g., Breakfast menu from 8 AM to 11 AM).', body: '' },
      },
      {
        itemKey: 'guide-step-3',
        en: { title: 'Add target translation languages in Settings. New items will automatically translate via DeepL to English, Bulgarian, or Romanian.', body: '' },
        bg: { title: 'Add target translation languages in Settings. New items will automatically translate via DeepL to English, Bulgarian, or Romanian.', body: '' },
        ro: { title: 'Add target translation languages in Settings. New items will automatically translate via DeepL to English, Bulgarian, or Romanian.', body: '' },
      },
      {
        itemKey: 'guide-tip',
        en: { title: 'Have existing menu items created before adding target languages? Click "Translate All Now" in settings to translate your entire menu at once.', body: '' },
        bg: { title: 'Have existing menu items created before adding target languages? Click "Translate All Now" in settings to translate your entire menu at once.', body: '' },
        ro: { title: 'Have existing menu items created before adding target languages? Click "Translate All Now" in settings to translate your entire menu at once.', body: '' },
      },
      {
        itemKey: 'guide-warning',
        en: { title: 'Items marked "Out of Stock" are instantly hidden from the public menu but remain editable in your dashboard.', body: '' },
        bg: { title: 'Items marked "Out of Stock" are instantly hidden from the public menu but remain editable in your dashboard.', body: '' },
        ro: { title: 'Items marked "Out of Stock" are instantly hidden from the public menu but remain editable in your dashboard.', body: '' },
      },
      {
        itemKey: 'faq-2',
        en: { title: 'Why are my translated menu titles showing up blank or in English only?', body: 'Translations occur dynamically via DeepL when menu items are saved or when target languages are configured. If you imported items or configured languages after adding items, go to Settings > Localization, check the desired languages, and click "Translate All Now". This runs a complete background batch translation on your existing database records.' },
        bg: { title: 'Why are my translated menu titles showing up blank or in English only?', body: 'Translations occur dynamically via DeepL when menu items are saved or when target languages are configured. If you imported items or configured languages after adding items, go to Settings > Localization, check the desired languages, and click "Translate All Now". This runs a complete background batch translation on your existing database records.' },
        ro: { title: 'Why are my translated menu titles showing up blank or in English only?', body: 'Translations occur dynamically via DeepL when menu items are saved or when target languages are configured. If you imported items or configured languages after adding items, go to Settings > Localization, check the desired languages, and click "Translate All Now". This runs a complete background batch translation on your existing database records.' },
      },
      {
        itemKey: 'faq-6',
        en: { title: 'How can I back up my restaurant menu or migrate it to another account?', body: 'Go to the Import/Export dashboard tab. Choose "Export Menu" to download your full menu in JSON or CSV (Excel/Numbers-compatible) formats, or copy the JSON catalog to your clipboard. You can restore this catalog on another account by uploading the exported JSON file in the "Import Menu" sub-tab.' },
        bg: { title: 'How can I back up my restaurant menu or migrate it to another account?', body: 'Go to the Import/Export dashboard tab. Choose "Export Menu" to download your full menu in JSON or CSV (Excel/Numbers-compatible) formats, or copy the JSON catalog to your clipboard. You can restore this catalog on another account by uploading the exported JSON file in the "Import Menu" sub-tab.' },
        ro: { title: 'How can I back up my restaurant menu or migrate it to another account?', body: 'Go to the Import/Export dashboard tab. Choose "Export Menu" to download your full menu in JSON or CSV (Excel/Numbers-compatible) formats, or copy the JSON catalog to your clipboard. You can restore this catalog on another account by uploading the exported JSON file in the "Import Menu" sub-tab.' },
      },
    ]
  },
  {
    categoryKey: 'tables',
    items: [
      {
        itemKey: 'guide-title',
        en: { title: 'Table Setup & QR Printing', body: '' },
        bg: { title: 'Table Setup & QR Printing', body: '' },
        ro: { title: 'Table Setup & QR Printing', body: '' },
      },
      {
        itemKey: 'guide-desc',
        en: { title: 'Add named dining tables, monitor occupied rooms in real-time, and print branded tabletop QR codes.', body: '' },
        bg: { title: 'Add named dining tables, monitor occupied rooms in real-time, and print branded tabletop QR codes.', body: '' },
        ro: { title: 'Add named dining tables, monitor occupied rooms in real-time, and print branded tabletop QR codes.', body: '' },
      },
      {
        itemKey: 'guide-step-0',
        en: { title: 'Create tables named numerically (e.g. Table 1, Table 2) or custom (e.g. Bar 1, Garden 5).', body: '' },
        bg: { title: 'Create tables named numerically (e.g. Table 1, Table 2) or custom (e.g. Bar 1, Garden 5).', body: '' },
        ro: { title: 'Create tables named numerically (e.g. Table 1, Table 2) or custom (e.g. Bar 1, Garden 5).', body: '' },
      },
      {
        itemKey: 'guide-step-1',
        en: { title: 'Download high-resolution individual QR codes or bulk print them directly using our A4 templates.', body: '' },
        bg: { title: 'Download high-resolution individual QR codes or bulk print them directly using our A4 templates.', body: '' },
        ro: { title: 'Download high-resolution individual QR codes or bulk print them directly using our A4 templates.', body: '' },
      },
      {
        itemKey: 'guide-step-2',
        en: { title: 'Choose a print template: Classic (standard cards), Premium (dark brackets, elegant branding), or Minimal (compact, table number only).', body: '' },
        bg: { title: 'Choose a print template: Classic (standard cards), Premium (dark brackets, elegant branding), or Minimal (compact, table number only).', body: '' },
        ro: { title: 'Choose a print template: Classic (standard cards), Premium (dark brackets, elegant branding), or Minimal (compact, table number only).', body: '' },
      },
      {
        itemKey: 'guide-step-3',
        en: { title: 'Use the Live Table View to track occupancy: color-coded statuses indicate open sessions, unpaid bills, or waiting orders.', body: '' },
        bg: { title: 'Use the Live Table View to track occupancy: color-coded statuses indicate open sessions, unpaid bills, or waiting orders.', body: '' },
        ro: { title: 'Use the Live Table View to track occupancy: color-coded statuses indicate open sessions, unpaid bills, or waiting orders.', body: '' },
      },
      {
        itemKey: 'guide-tip',
        en: { title: 'When printing, set your browser print options to "Portrait" and check the "Print Background Graphics" checkbox so background frames print correctly.', body: '' },
        bg: { title: 'When printing, set your browser print options to "Portrait" and check the "Print Background Graphics" checkbox so background frames print correctly.', body: '' },
        ro: { title: 'When printing, set your browser print options to "Portrait" and check the "Print Background Graphics" checkbox so background frames print correctly.', body: '' },
      },
      {
        itemKey: 'guide-warning',
        en: { title: 'Do not manually edit the URL structure of the QR codes. They embed table names to link client orders directly to the correct tables.', body: '' },
        bg: { title: 'Do not manually edit the URL structure of the QR codes. They embed table names to link client orders directly to the correct tables.', body: '' },
        ro: { title: 'Do not manually edit the URL structure of the QR codes. They embed table names to link client orders directly to the correct tables.', body: '' },
      },
      {
        itemKey: 'faq-1',
        en: { title: 'How do I print QR codes without page margins cutting them off?', body: 'When your browser print panel opens, set the layout orientation to "Portrait", set paper size to A4, and make sure "Print Background Graphics" is enabled under the advanced settings. Our Classic, Premium, and Minimal layouts are formatted to fit a 2x2 grid cleanly on standard A4 paper without overflow.' },
        bg: { title: 'How do I print QR codes without page margins cutting them off?', body: 'When your browser print panel opens, set the layout orientation to "Portrait", set paper size to A4, and make sure "Print Background Graphics" is enabled under the advanced settings. Our Classic, Premium, and Minimal layouts are formatted to fit a 2x2 grid cleanly on standard A4 paper without overflow.' },
        ro: { title: 'How do I print QR codes without page margins cutting them off?', body: 'When your browser print panel opens, set the layout orientation to "Portrait", set paper size to A4, and make sure "Print Background Graphics" is enabled under the advanced settings. Our Classic, Premium, and Minimal layouts are formatted to fit a 2x2 grid cleanly on standard A4 paper without overflow.' },
      },
    ]
  },
  {
    categoryKey: 'payments',
    items: [
      {
        itemKey: 'guide-title',
        en: { title: 'Stripe Connect Tableside Payments', body: '' },
        bg: { title: 'Stripe Connect Tableside Payments', body: '' },
        ro: { title: 'Stripe Connect Tableside Payments', body: '' },
      },
      {
        itemKey: 'guide-desc',
        en: { title: 'Onboard with Stripe to allow customers to request their bill, tip waiters, and pay directly from their phones.', body: '' },
        bg: { title: 'Onboard with Stripe to allow customers to request their bill, tip waiters, and pay directly from their phones.', body: '' },
        ro: { title: 'Onboard with Stripe to allow customers to request their bill, tip waiters, and pay directly from their phones.', body: '' },
      },
      {
        itemKey: 'guide-step-0',
        en: { title: 'Navigate to Settings > Payments and click "Connect with Stripe" to register or link your Stripe account.', body: '' },
        bg: { title: 'Navigate to Settings > Payments and click "Connect with Stripe" to register or link your Stripe account.', body: '' },
        ro: { title: 'Navigate to Settings > Payments and click "Connect with Stripe" to register or link your Stripe account.', body: '' },
      },
      {
        itemKey: 'guide-step-1',
        en: { title: 'Set custom Tip Percentages (e.g. 5%, 10%, 15%) in settings to prompt clients during tableside checkout.', body: '' },
        bg: { title: 'Set custom Tip Percentages (e.g. 5%, 10%, 15%) in settings to prompt clients during tableside checkout.', body: '' },
        ro: { title: 'Set custom Tip Percentages (e.g. 5%, 10%, 15%) in settings to prompt clients during tableside checkout.', body: '' },
      },
      {
        itemKey: 'guide-step-2',
        en: { title: 'Once connected, customers can request their bill from their browser, choose their tip, and pay securely using card.', body: '' },
        bg: { title: 'Once connected, customers can request their bill from their browser, choose their tip, and pay securely using card.', body: '' },
        ro: { title: 'Once connected, customers can request their bill from their browser, choose their tip, and pay securely using card.', body: '' },
      },
      {
        itemKey: 'guide-step-3',
        en: { title: 'Monitor incoming payouts and transaction logs in the Payments tab. Platform fees are auto-deducted per transaction.', body: '' },
        bg: { title: 'Monitor incoming payouts and transaction logs in the Payments tab. Platform fees are auto-deducted per transaction.', body: '' },
        ro: { title: 'Monitor incoming payouts and transaction logs in the Payments tab. Platform fees are auto-deducted per transaction.', body: '' },
      },
      {
        itemKey: 'guide-tip',
        en: { title: 'Customers can calculate how to split the bill directly on the checkout screen (up to 20 people) before submitting cash/card payments.', body: '' },
        bg: { title: 'Customers can calculate how to split the bill directly on the checkout screen (up to 20 people) before submitting cash/card payments.', body: '' },
        ro: { title: 'Customers can calculate how to split the bill directly on the checkout screen (up to 20 people) before submitting cash/card payments.', body: '' },
      },
      {
        itemKey: 'guide-warning',
        en: { title: 'Stripe payments require an active HTTPS connection. Stripe Connect settings are only accessible by restaurant owners.', body: '' },
        bg: { title: 'Stripe payments require an active HTTPS connection. Stripe Connect settings are only accessible by restaurant owners.', body: '' },
        ro: { title: 'Stripe payments require an active HTTPS connection. Stripe Connect settings are only accessible by restaurant owners.', body: '' },
      },
      {
        itemKey: 'faq-3',
        en: { title: 'What are the charges for using tableside Stripe card payments?', body: 'The platform integrates using Stripe Connect. Standard card processing fees apply per transaction from Stripe. The platform also charges a configurable platform fee (e.g. 1%) which is automatically split and routed during purchase checkouts. You can disconnect your Stripe account at any time from the Payments Settings.' },
        bg: { title: 'What are the charges for using tableside Stripe card payments?', body: 'The platform integrates using Stripe Connect. Standard card processing fees apply per transaction from Stripe. The platform also charges a configurable platform fee (e.g. 1%) which is automatically split and routed during purchase checkouts. You can disconnect your Stripe account at any time from the Payments Settings.' },
        ro: { title: 'What are the charges for using tableside Stripe card payments?', body: 'The platform integrates using Stripe Connect. Standard card processing fees apply per transaction from Stripe. The platform also charges a configurable platform fee (e.g. 1%) which is automatically split and routed during purchase checkouts. You can disconnect your Stripe account at any time from the Payments Settings.' },
      },
    ]
  },
  {
    categoryKey: 'loyalty',
    items: [
      {
        itemKey: 'guide-title',
        en: { title: 'Configuring Loyalty & VIP Tiers', body: '' },
        bg: { title: 'Configuring Loyalty & VIP Tiers', body: '' },
        ro: { title: 'Configuring Loyalty & VIP Tiers', body: '' },
      },
      {
        itemKey: 'guide-desc',
        en: { title: 'Establish a gamified rewards program that awards points per purchase and unlocks custom VIP discount multipliers.', body: '' },
        bg: { title: 'Establish a gamified rewards program that awards points per purchase and unlocks custom VIP discount multipliers.', body: '' },
        ro: { title: 'Establish a gamified rewards program that awards points per purchase and unlocks custom VIP discount multipliers.', body: '' },
      },
      {
        itemKey: 'guide-step-0',
        en: { title: 'Go to Settings > Loyalty and toggle loyalty rewards active. Define point earning rates (points per € spent) and signup bonuses.', body: '' },
        bg: { title: 'Go to Settings > Loyalty and toggle loyalty rewards active. Define point earning rates (points per € spent) and signup bonuses.', body: '' },
        ro: { title: 'Go to Settings > Loyalty and toggle loyalty rewards active. Define point earning rates (points per € spent) and signup bonuses.', body: '' },
      },
      {
        itemKey: 'guide-step-1',
        en: { title: 'Set up VIP Tier thresholds (Bronze, Silver, Gold). High-tier members automatically gain point multipliers (e.g. Gold: 1.5x points).', body: '' },
        bg: { title: 'Set up VIP Tier thresholds (Bronze, Silver, Gold). High-tier members automatically gain point multipliers (e.g. Gold: 1.5x points).', body: '' },
        ro: { title: 'Set up VIP Tier thresholds (Bronze, Silver, Gold). High-tier members automatically gain point multipliers (e.g. Gold: 1.5x points).', body: '' },
      },
      {
        itemKey: 'guide-step-2',
        en: { title: 'Configure timezone-aware Happy Hours to award multipliers (e.g., 2.0x points) on food during off-peak dining periods.', body: '' },
        bg: { title: 'Configure timezone-aware Happy Hours to award multipliers (e.g., 2.0x points) on food during off-peak dining periods.', body: '' },
        ro: { title: 'Configure timezone-aware Happy Hours to award multipliers (e.g., 2.0x points) on food during off-peak dining periods.', body: '' },
      },
      {
        itemKey: 'guide-step-3',
        en: { title: 'Points are automatically deducted on checkout when customers choose to exchange points for cash discounts or free menu items.', body: '' },
        bg: { title: 'Points are automatically deducted on checkout when customers choose to exchange points for cash discounts or free menu items.', body: '' },
        ro: { title: 'Points are automatically deducted on checkout when customers choose to exchange points for cash discounts or free menu items.', body: '' },
      },
      {
        itemKey: 'guide-tip',
        en: { title: 'The system uses accounting-grade FIFO (First-In, First-Out) calculations. Expiring customer points are automatically purged daily.', body: '' },
        bg: { title: 'The system uses accounting-grade FIFO (First-In, First-Out) calculations. Expiring customer points are automatically purged daily.', body: '' },
        ro: { title: 'The system uses accounting-grade FIFO (First-In, First-Out) calculations. Expiring customer points are automatically purged daily.', body: '' },
      },
      {
        itemKey: 'guide-warning',
        en: { title: 'Earning rate cashback defaults to 6.7%. We show a warning indicator if your configured cashback exceeds 15% to protect profit margins.', body: '' },
        bg: { title: 'Earning rate cashback defaults to 6.7%. We show a warning indicator if your configured cashback exceeds 15% to protect profit margins.', body: '' },
        ro: { title: 'Earning rate cashback defaults to 6.7%. We show a warning indicator if your configured cashback exceeds 15% to protect profit margins.', body: '' },
      },
      {
        itemKey: 'faq-4',
        en: { title: 'Can customers sign up for loyalty rewards without creating a password?', body: 'Yes! The customer-facing menu uses an Email OTP (One-Time Password) system. Customers simply input their email address, receive a 6-digit verification code in their email, and input it to log in. No passwords or registration forms are required, keeping tableside ordering frictionless.' },
        bg: { title: 'Can customers sign up for loyalty rewards without creating a password?', body: 'Yes! The customer-facing menu uses an Email OTP (One-Time Password) system. Customers simply input their email address, receive a 6-digit verification code in their email, and input it to log in. No passwords or registration forms are required, keeping tableside ordering frictionless.' },
        ro: { title: 'Can customers sign up for loyalty rewards without creating a password?', body: 'Yes! The customer-facing menu uses an Email OTP (One-Time Password) system. Customers simply input their email address, receive a 6-digit verification code in their email, and input it to log in. No passwords or registration forms are required, keeping tableside ordering frictionless.' },
      },
    ]
  },
  {
    categoryKey: 'staff',
    items: [
      {
        itemKey: 'guide-title',
        en: { title: 'Waiter POS & Kitchen KDS Systems', body: '' },
        bg: { title: 'Waiter POS & Kitchen KDS Systems', body: '' },
        ro: { title: 'Waiter POS & Kitchen KDS Systems', body: '' },
      },
      {
        itemKey: 'guide-desc',
        en: { title: 'Equip floor staff with tableside digital order pads and kitchen cooks with real-time ticket display screens.', body: '' },
        bg: { title: 'Equip floor staff with tableside digital order pads and kitchen cooks with real-time ticket display screens.', body: '' },
        ro: { title: 'Equip floor staff with tableside digital order pads and kitchen cooks with real-time ticket display screens.', body: '' },
      },
      {
        itemKey: 'guide-step-0',
        en: { title: 'Add staff profiles in Settings > Staff. Assign credentials and secure login PINs.', body: '' },
        bg: { title: 'Add staff profiles in Settings > Staff. Assign credentials and secure login PINs.', body: '' },
        ro: { title: 'Add staff profiles in Settings > Staff. Assign credentials and secure login PINs.', body: '' },
      },
      {
        itemKey: 'guide-step-1',
        en: { title: 'Waiters use the tableside POS at "/staff/pos" to rapidly select tables, browse items, type custom notes, and send tickets.', body: '' },
        bg: { title: 'Waiters use the tableside POS at "/staff/pos" to rapidly select tables, browse items, type custom notes, and send tickets.', body: '' },
        ro: { title: 'Waiters use the tableside POS at "/staff/pos" to rapidly select tables, browse items, type custom notes, and send tickets.', body: '' },
      },
      {
        itemKey: 'guide-step-2',
        en: { title: 'Kitchen cooks monitor incoming orders in real time on the Dark OLED KDS board at "/staff/kitchen".', body: '' },
        bg: { title: 'Kitchen cooks monitor incoming orders in real time on the Dark OLED KDS board at "/staff/kitchen".', body: '' },
        ro: { title: 'Kitchen cooks monitor incoming orders in real time on the Dark OLED KDS board at "/staff/kitchen".', body: '' },
      },
      {
        itemKey: 'guide-step-3',
        en: { title: 'Kitchen staff tap cards to advance tickets through Placed, In Kitchen, and Served columns, playing sound alerts on arrival.', body: '' },
        bg: { title: 'Kitchen staff tap cards to advance tickets through Placed, In Kitchen, and Served columns, playing sound alerts on arrival.', body: '' },
        ro: { title: 'Kitchen staff tap cards to advance tickets through Placed, In Kitchen, and Served columns, playing sound alerts on arrival.', body: '' },
      },
      {
        itemKey: 'guide-tip',
        en: { title: 'The Waiter POS cart is fully isolated in-memory. Switching tables resets pending items without interfering with customer browsers.', body: '' },
        bg: { title: 'The Waiter POS cart is fully isolated in-memory. Switching tables resets pending items without interfering with customer browsers.', body: '' },
        ro: { title: 'The Waiter POS cart is fully isolated in-memory. Switching tables resets pending items without interfering with customer browsers.', body: '' },
      },
      {
        itemKey: 'guide-warning',
        en: { title: 'KDS screens display elapsed timers. Tickets active for longer than 15 minutes highlight in red to indicate kitchen urgency.', body: '' },
        bg: { title: 'KDS screens display elapsed timers. Tickets active for longer than 15 minutes highlight in red to indicate kitchen urgency.', body: '' },
        ro: { title: 'KDS screens display elapsed timers. Tickets active for longer than 15 minutes highlight in red to indicate kitchen urgency.', body: '' },
      },
      {
        itemKey: 'faq-5',
        en: { title: 'What is the difference between Waiter POS and Kitchen KDS access permissions?', body: 'Waiter POS (/staff/pos) is optimized for floor waiters to place orders at the table. Kitchen KDS (/staff/kitchen) is optimized for cooks to track tickets in the kitchen. Both require a user account created under Settings > Staff. However, settings panels, analytics charts, and payment configurations are strictly restricted to the Owner role and cannot be opened by floor staff.' },
        bg: { title: 'What is the difference between Waiter POS and Kitchen KDS access permissions?', body: 'Waiter POS (/staff/pos) is optimized for floor waiters to place orders at the table. Kitchen KDS (/staff/kitchen) is optimized for cooks to track tickets in the kitchen. Both require a user account created under Settings > Staff. However, settings panels, analytics charts, and payment configurations are strictly restricted to the Owner role and cannot be opened by floor staff.' },
        ro: { title: 'What is the difference between Waiter POS and Kitchen KDS access permissions?', body: 'Waiter POS (/staff/pos) is optimized for floor waiters to place orders at the table. Kitchen KDS (/staff/kitchen) is optimized for cooks to track tickets in the kitchen. Both require a user account created under Settings > Staff. However, settings panels, analytics charts, and payment configurations are strictly restricted to the Owner role and cannot be opened by floor staff.' },
      },
    ]
  },
  {
    categoryKey: 'legal',
    items: [
      {
        itemKey: 'guide-title',
        en: { title: 'GDPR Compliance & Customer Privacy', body: '' },
        bg: { title: 'GDPR Compliance & Customer Privacy', body: '' },
        ro: { title: 'GDPR Compliance & Customer Privacy', body: '' },
      },
      {
        itemKey: 'guide-desc',
        en: { title: 'Ensure your business respects privacy regulations, displays consent notifications, and processes data deletion requests.', body: '' },
        bg: { title: 'Ensure your business respects privacy regulations, displays consent notifications, and processes data deletion requests.', body: '' },
        ro: { title: 'Ensure your business respects privacy regulations, displays consent notifications, and processes data deletion requests.', body: '' },
      },
      {
        itemKey: 'guide-step-0',
        en: { title: 'Toggle cookie consent banners in settings to notify customers on their public menu browser.', body: '' },
        bg: { title: 'Toggle cookie consent banners in settings to notify customers on their public menu browser.', body: '' },
        ro: { title: 'Toggle cookie consent banners in settings to notify customers on their public menu browser.', body: '' },
      },
      {
        itemKey: 'guide-step-1',
        en: { title: 'Provide visible links to privacy policy pages. The platform auto-generates localized /privacy and /terms routes.', body: '' },
        bg: { title: 'Provide visible links to privacy policy pages. The platform auto-generates localized /privacy and /terms routes.', body: '' },
        ro: { title: 'Provide visible links to privacy policy pages. The platform auto-generates localized /privacy and /terms routes.', body: '' },
      },
      {
        itemKey: 'guide-step-2',
        en: { title: 'Under GDPR guidelines, if a customer requests account erasure, navigate to the User Management dashboard.', body: '' },
        bg: { title: 'Under GDPR guidelines, if a customer requests account erasure, navigate to the User Management dashboard.', body: '' },
        ro: { title: 'Under GDPR guidelines, if a customer requests account erasure, navigate to the User Management dashboard.', body: '' },
      },
      {
        itemKey: 'guide-step-3',
        en: { title: 'Use the "Purge Account / Right to Erasure" button to permanently delete customer emails, transaction lists, and point ledgers.', body: '' },
        bg: { title: 'Use the "Purge Account / Right to Erasure" button to permanently delete customer emails, transaction lists, and point ledgers.', body: '' },
        ro: { title: 'Use the "Purge Account / Right to Erasure" button to permanently delete customer emails, transaction lists, and point ledgers.', body: '' },
      },
      {
        itemKey: 'guide-tip',
        en: { title: 'Deleted GDPR customer accounts cannot be recovered. Ensure you verify client identity before processing erasure requests.', body: '' },
        bg: { title: 'Deleted GDPR customer accounts cannot be recovered. Ensure you verify client identity before processing erasure requests.', body: '' },
        ro: { title: 'Deleted GDPR customer accounts cannot be recovered. Ensure you verify client identity before processing erasure requests.', body: '' },
      },
    ]
  },
];

export async function seedHelpContent(prisma: PrismaClient) {
  console.log('Seeding help content...');

  const existing = await prisma.helpContent.count();
  if (existing > 0) {
    console.log(`  ${existing} help content rows already exist — skipping seed.`);
    return;
  }

  let sortOrder = 0;

  // Seed landing FAQ items
  for (const faq of LANDING_FAQ) {
    for (const locale of ['en', 'bg', 'ro'] as const) {
      const loc = faq[locale];
      await prisma.helpContent.create({
        data: {
          section: 'landing',
          categoryKey: 'general',
          itemKey: faq.itemKey,
          sortOrder,
          locale,
          title: loc.title,
          body: loc.body,
          active: true,
        },
      });
    }
    sortOrder++;
  }

  // Seed dashboard help categories and items
  sortOrder = 0;
  for (const category of DASHBOARD_HELP) {
    for (const item of category.items) {
      for (const locale of ['en', 'bg', 'ro'] as const) {
        const loc = item[locale];
        await prisma.helpContent.create({
          data: {
            section: 'dashboard',
            categoryKey: category.categoryKey,
            itemKey: item.itemKey,
            sortOrder,
            locale,
            title: loc.title,
            body: loc.body,
            active: true,
          },
        });
      }
      sortOrder++;
    }
  }

  const total = await prisma.helpContent.count();
  console.log(`  ${total} help content rows seeded.`);
}
