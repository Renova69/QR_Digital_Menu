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
        en: { title: 'Getting Started Guide', body: '' },
        bg: { title: 'Първи стъпки в платформата', body: '' },
        ro: { title: 'Ghid pentru primii pasi', body: '' },
      },
      {
        itemKey: 'guide-desc',
        en: {
          title:
            'Set up your digital restaurant and launch tableside QR ordering in four quick steps.',
          body: '',
        },
        bg: {
          title:
            'Настройте своя дигитален ресторант и стартирайте поръчки през QR код на масата в четири бързи стъпки.',
          body: '',
        },
        ro: {
          title:
            'Configurati restaurantul digital si lansati comenzile prin cod QR la masa in patru pasi simpli.',
          body: '',
        },
      },
      {
        itemKey: 'guide-step-0',
        en: {
          title:
            'Fill out your restaurant contact info, address, and timezone under Settings > General.',
          body: '',
        },
        bg: {
          title:
            'Попълнете информацията за контакт на ресторанта, адреса и часовата зона в раздел Настройки > Общи.',
          body: '',
        },
        ro: {
          title:
            'Completati informatiile de contact, adresa si fusul orar in sectiunea Setari > General.',
          body: '',
        },
      },
      {
        itemKey: 'guide-step-1',
        en: {
          title:
            'Create dining tables in the Tables & QR tab to generate unique QR codes for each table.',
          body: '',
        },
        bg: {
          title:
            'Създайте маси в раздел Маси и QR, за да генерирате уникални QR кодове за всяка маса.',
          body: '',
        },
        ro: {
          title:
            'Creati mesele in fila Mese si QR pentru a genera coduri QR unice pentru fiecare masa.',
          body: '',
        },
      },
      {
        itemKey: 'guide-step-2',
        en: {
          title:
            'Build your menu in the Menu Editor: define food categories and add items with prices, pictures, and descriptions.',
          body: '',
        },
        bg: {
          title:
            'Създайте менюто си в Редактора на менюто: дефинирайте категории храни и добавете артикули с цени, снимки и описания.',
          body: '',
        },
        ro: {
          title:
            'Construiti meniul in Editorul de meniu: definiti categorii de mancare si adaugati articole cu preturi, fotografii si descrieri.',
          body: '',
        },
      },
      {
        itemKey: 'guide-step-3',
        en: {
          title:
            'Configure your payment integration or loyalty settings, then place printed QR cards on tables for customers.',
          body: '',
        },
        bg: {
          title:
            'Конфигурирайте интеграцията за плащане или настройките за лоялност, след което поставете разпечатаните QR карти по масите.',
          body: '',
        },
        ro: {
          title:
            'Configurati integrarea de plata sau setarile de loialitate, apoi plasati codurile QR imprimate la mese pentru clienti.',
          body: '',
        },
      },
      {
        itemKey: 'guide-tip',
        en: {
          title:
            'Check your timezone settings! Happy Hour times and menu category visibility depend on it.',
          body: '',
        },
        bg: {
          title:
            'Проверете настройките на часовата зона! Часовете на Happy Hour и видимостта на категориите в менюто зависят от нея.',
          body: '',
        },
        ro: {
          title:
            'Verificati setarile fusului orar! Orele Happy Hour si vizibilitatea categoriilor de meniu depind de acesta.',
          body: '',
        },
      },
      {
        itemKey: 'faq-gs-1',
        en: {
          title: 'How do I change my restaurant name or address after setup?',
          body: 'Go to Settings > General tab. You can update your restaurant name, address, phone number, and timezone at any time. Changes apply immediately to your public menu and QR code pages.',
        },
        bg: {
          title:
            'Как да променя името или адреса на ресторанта след първоначалната настройка?',
          body: 'Отидете в Настройки > раздел Общи. Можете да актуализирате името на ресторанта, адреса, телефонния номер и часовата зона по всяко време. Промените се прилагат незабавно към публичното меню и страниците с QR кодове.',
        },
        ro: {
          title:
            'Cum schimb numele sau adresa restaurantului dupa configurare?',
          body: 'Accesati Setari > fila General. Puteti actualiza numele restaurantului, adresa, numarul de telefon si fusul orar in orice moment. Modificarile se aplica imediat in meniul public si pe paginile cu coduri QR.',
        },
      },
      {
        itemKey: 'faq-gs-2',
        en: {
          title: 'What happens if I forget my password or get locked out?',
          body: "Click 'Forgot Password' on the login screen and enter your registered email address. You will receive a password reset link via email. If you still cannot access your account, contact platform support through the Super Admin.",
        },
        bg: {
          title: 'Какво се случва, ако забравя паролата си или бъда блокиран?',
          body: "Кликнете върху 'Забравена парола' на екрана за вход и въведете регистрирания си имейл адрес. Ще получите линк за нулиране на паролата по имейл. Ако все още нямате достъп до акаунта си, свържете се с поддръжката на платформата чрез Super Admin.",
        },
        ro: {
          title: 'Ce se intampla daca imi uit parola sau sunt blocat?',
          body: "Faceti clic pe 'Am uitat parola' pe ecranul de autentificare si introduceti adresa de email inregistrata. Veti primi un link de resetare a parolei prin email. Daca tot nu puteti accesa contul, contactati suportul platformei prin Super Admin.",
        },
      },
      {
        itemKey: 'faq-gs-3',
        en: {
          title: 'Can I run multiple restaurant locations from one account?',
          body: 'Each restaurant location requires its own separate account with unique login credentials. However, the Super Admin panel provides centralized oversight of all restaurants on the platform, including stats, subscription tiers, and help content management.',
        },
        bg: {
          title: 'Мога ли да управлявам няколко ресторанта от един акаунт?',
          body: 'Всяка локация на ресторант изисква отделен акаунт с уникални данни за вход. Панелът Super Admin обаче предоставя централизиран преглед на всички ресторанти в платформата, включително статистики, абонаментни планове и управление на помощното съдържание.',
        },
        ro: {
          title:
            'Pot gestiona mai multe locatii de restaurant dintr-un singur cont?',
          body: 'Fiecare locatie de restaurant necesita un cont separat cu date de autentificare unice. Panoul Super Admin ofera insa o vedere centralizata a tuturor restaurantelor de pe platforma, inclusiv statistici, abonamente si gestionarea continutului de ajutor.',
        },
      },
    ],
  },
  {
    categoryKey: 'menu',
    items: [
      {
        itemKey: 'guide-title',
        en: { title: 'Menu Builder & Customization', body: '' },
        bg: { title: 'Създаване и персонализиране на менюто', body: '' },
        ro: { title: 'Configurarea si personalizarea meniului', body: '' },
      },
      {
        itemKey: 'guide-desc',
        en: {
          title:
            'Create a beautiful digital catalog with drag-and-drop reordering, item options, schedules, and automatic translations.',
          body: '',
        },
        bg: {
          title:
            'Създайте атрактивен дигитален каталог с пренареждане чрез влачене, опции за артикули, графици и автоматични преводи.',
          body: '',
        },
        ro: {
          title:
            'Creati un catalog digital atractiv cu ordonare prin glisare, optiuni de articole, orare si traduceri automate.',
          body: '',
        },
      },
      {
        itemKey: 'guide-step-0',
        en: {
          title:
            'Add categories (e.g. Mains, Drinks) and drag items vertically to reorder them.',
          body: '',
        },
        bg: {
          title:
            'Добавете категории (напр. Основни ястия, Безалкохолни) и подредете артикулите вертикално чрез влачене.',
          body: '',
        },
        ro: {
          title:
            'Adaugati categorii (de ex. Feluri principale, Bauturi) si glisati articolele pe verticala pentru a le ordona.',
          body: '',
        },
      },
      {
        itemKey: 'guide-step-1',
        en: {
          title:
            'Create Item Options for variations (e.g. steak doneness: rare/medium/well) or add-ons (e.g. extra cheese).',
          body: '',
        },
        bg: {
          title:
            'Създайте Опции на артикули за вариации (напр. степен на изпичане: суров/среден/добре изпечен) или добавки (напр. допълнително сирене).',
          body: '',
        },
        ro: {
          title:
            'Creati Optiuni articol pentru variatii (de ex. nivel de gatire friptura: in sange/mediu/bine facut) sau extra-optiuni (de ex. branza suplimentara).',
          body: '',
        },
      },
      {
        itemKey: 'guide-step-2',
        en: {
          title:
            'Use Schedules to display specific categories only during certain hours (e.g. breakfast menu from 8 AM to 11 AM).',
          body: '',
        },
        bg: {
          title:
            'Използвайте Графици за показване на конкретни категории само в определени часове (напр. меню за закуска от 8:00 до 11:00).',
          body: '',
        },
        ro: {
          title:
            'Utilizati programul orar pentru a afisa anumite categorii doar la anumite ore (de ex. meniu mic dejun intre 8:00 si 11:00).',
          body: '',
        },
      },
      {
        itemKey: 'guide-step-3',
        en: {
          title:
            'Add translation target languages in Settings. New items will automatically translate via DeepL to English, Bulgarian, or Romanian.',
          body: '',
        },
        bg: {
          title:
            'Добавете целеви езици за превод в Настройки. Новите артикули ще се превеждат автоматично чрез DeepL на английски, български или румънски.',
          body: '',
        },
        ro: {
          title:
            'Adaugati limbi tinta in Setari. Articolele noi se vor traduce automat prin DeepL in engleza, bulgara sau romana.',
          body: '',
        },
      },
      {
        itemKey: 'guide-tip',
        en: {
          title:
            'Have items created before adding target languages? Click "Translate All Now" in settings to batch process your existing catalog.',
          body: '',
        },
        bg: {
          title:
            "Имате артикули, създадени преди добавянето на целеви езици? Кликнете върху 'Преведи всичко сега' в настройките, за да преведете целия каталог наведнъж.",
          body: '',
        },
        ro: {
          title:
            "Aveti articole create inainte de adaugarea limbilor tinta? Faceti clic pe 'Traduceti tot acum' in setari pentru a traduce tot catalogul.",
          body: '',
        },
      },
      {
        itemKey: 'guide-warning',
        en: {
          title:
            'Items marked "Out of Stock" are instantly hidden from the public menu, but remain editable in your dashboard.',
          body: '',
        },
        bg: {
          title:
            "Артикулите, маркирани като 'Извън наличност', се скриват незабавно от публичното меню, но остават достъпни за редактиране в таблото.",
          body: '',
        },
        ro: {
          title:
            "Articolele marcate 'Stoc epuizat' sunt ascunse instantaneu din meniul public, dar raman editabile in panou.",
          body: '',
        },
      },
      {
        itemKey: 'faq-1',
        en: {
          title: 'Why are translated item names empty or only in English?',
          body: 'Translations happen automatically via DeepL when items are saved or target languages are configured. If you added languages after creating items, go to Settings > Localization and click "Translate All Now". This spins up a background worker to translate all your existing records.',
        },
        bg: {
          title:
            'Защо преведените имена на артикули са празни или само на английски?',
          body: "Преводите се извършват автоматично чрез DeepL при запазване на артикули или при конфигурация на целевите езици. Ако сте добавили езици след създаването на артикулите, отидете на Настройки > Локализация и натиснете 'Преведи всичко сега'. Това ще стартира фонов процес за превод на всички съществуващи записи.",
        },
        ro: {
          title:
            'De ce numele traduse ale produselor sunt goale sau doar in engleza?',
          body: "Traducerile se fac automat prin DeepL la salvarea produselor. Daca ati adaugat limbi tinta dupa ce ati creat produsele, accesati Setari > Localizare si faceti clic pe 'Traduceti tot acum' pentru a procesa catalogul existent.",
        },
      },
      {
        itemKey: 'faq-2',
        en: {
          title: 'How can I backup my menu or move it to another account?',
          body: 'Head to the Import/Export tab in your dashboard. Choose "Export Menu" to download your catalog in JSON or CSV format. You can restore this catalog on another account by uploading the downloaded JSON in the "Import Menu" sub-tab.',
        },
        bg: {
          title:
            'Как мога да направя резервно копие на менюто или да го преместя в друг акаунт?',
          body: "Отидете на раздел Импорт/Експорт в таблото. Изберете 'Експортиране на менюто', за да изтеглите менюто си в JSON или CSV формат. Можете да възстановите този каталог в друг акаунт, като качите изтегления JSON файл в подраздел 'Импортиране на меню'.",
        },
        ro: {
          title:
            'Cum pot face o copie de rezerva a meniului sau sa-l transfer pe alt cont?',
          body: "Accesati fila Import/Export din panou. Alegeti 'Export catalog' pentru a descarca meniul in format JSON sau CSV. Il puteti importa pe alt cont folosind optiunea 'Import catalog' din aceeasi pagina.",
        },
      },
      {
        itemKey: 'faq-m-1',
        en: {
          title: 'How do I add allergen or dietary labels to menu items?',
          body: 'When editing a menu item, use the Tags section to add dietary labels such as Vegan, Vegetarian, or Gluten-Free, as well as specific allergen warnings. These tags appear as filter pills on the public menu, allowing customers to filter by dietary preference or exclude allergens.',
        },
        bg: {
          title:
            'Как да добавя алергенни или диетични етикети към артикулите в менюто?',
          body: 'При редактиране на артикул от менюто използвайте секцията Тагове, за да добавите диетични етикети като Веган, Вегетарианско или Без глутен, както и конкретни алергенни предупреждения. Тези тагове се появяват като филтри в публичното меню, позволявайки на клиентите да филтрират по диетични предпочитания или да изключат алергени.',
        },
        ro: {
          title:
            'Cum adaug etichete pentru alergeni sau diete la articolele din meniu?',
          body: 'La editarea unui articol din meniu, utilizati sectiunea Etichete pentru a adauga etichete dietetice precum Vegan, Vegetarian sau Fara Gluten, precum si avertismente specifice pentru alergeni. Aceste etichete apar ca filtre in meniul public, permitand clientilor sa filtreze dupa preferinte dietetice sau sa excluda alergenii.',
        },
      },
      {
        itemKey: 'faq-m-2',
        en: {
          title:
            'Can I rearrange the order of categories and items on the public menu?',
          body: 'Yes. Both categories and items support drag-and-drop reordering in the Menu Editor. Grab the drag handle on the left side of any row and move it to the desired position. The new order is saved automatically and reflected instantly on the public menu.',
        },
        bg: {
          title:
            'Мога ли да пренаредя категориите и артикулите в публичното меню?',
          body: 'Да. Както категориите, така и артикулите поддържат пренареждане чрез влачене (drag-and-drop) в Редактора на меню. Хванете дръжката за влачене от лявата страна на всеки ред и го преместете на желаната позиция. Новият ред се записва автоматично и се отразява веднага в публичното меню.',
        },
        ro: {
          title:
            'Pot rearanja ordinea categoriilor si articolelor in meniul public?',
          body: 'Da. Atat categoriile, cat si articolele suporta rearanjare prin glisare (drag-and-drop) in Editorul de meniu. Apucati manerul de glisare din partea stanga a oricarui rand si mutati-l in pozitia dorita. Noua ordine se salveaza automat si se reflecta instantaneu in meniul public.',
        },
      },
    ],
  },
  {
    categoryKey: 'tables',
    items: [
      {
        itemKey: 'guide-title',
        en: { title: 'Table Setup & QR Printing', body: '' },
        bg: { title: 'Настройка на маси и печат на QR', body: '' },
        ro: { title: 'Configurarea meselor si imprimarea QR', body: '' },
      },
      {
        itemKey: 'guide-desc',
        en: {
          title:
            'Add tables, monitor real-time occupancy, and print branded QR codes for your tables.',
          body: '',
        },
        bg: {
          title:
            'Добавете маси, следете заетостта в реално време и отпечатайте брандирани QR кодове за масите.',
          body: '',
        },
        ro: {
          title:
            'Adaugati mese, monitorizati ocuparea in timp real si imprimati coduri QR personalizate cu logo.',
          body: '',
        },
      },
      {
        itemKey: 'guide-step-0',
        en: {
          title:
            'Create tables using numeric names (e.g. Table 1, Table 2) or custom labels (e.g. Bar 1, Garden 5).',
          body: '',
        },
        bg: {
          title:
            'Създайте маси с номера (напр. Маса 1, Маса 2) или с персонализирани имена (напр. Бар 1, Градина 5).',
          body: '',
        },
        ro: {
          title:
            'Creati mese cu nume numerice (de ex. Masa 1, Masa 2) sau personalizate (de ex. Bar 1, Gradina 5).',
          body: '',
        },
      },
      {
        itemKey: 'guide-step-1',
        en: {
          title:
            'Download individual high-res QR codes, or batch print them using our A4 templates.',
          body: '',
        },
        bg: {
          title:
            'Изтеглете индивидуални QR кодове с висока резолюция или ги отпечатайте наведнъж с помощта на нашите A4 шаблони.',
          body: '',
        },
        ro: {
          title:
            'Descarcati coduri QR individuale la rezolutie mare sau imprimati-le in format A4 folosind sabloanele noastre.',
          body: '',
        },
      },
      {
        itemKey: 'guide-step-2',
        en: {
          title:
            'Choose a print template: Classic (standard cards), Premium (elegant branding and dark borders), or Minimal (compact, table number only).',
          body: '',
        },
        bg: {
          title:
            'Изберете шаблон за печат: Класически (стандартни карти), Премиум (елегантен брандинг и рамки) или Минималистичен (компактен, само с номера на масата).',
          body: '',
        },
        ro: {
          title:
            'Alegeti un sablon de imprimare: Clasic (carduri standard), Premium (branding elegant si margini inchise) sau Minimal (compact, doar numarul mesei).',
          body: '',
        },
      },
      {
        itemKey: 'guide-step-3',
        en: {
          title:
            'Use the Live Table View to track occupancy: colors indicate open sessions, unpaid bills, or waiting orders.',
          body: '',
        },
        bg: {
          title:
            'Използвайте Схемата на масите на живо, за да проследявате заетостта: цветните кодове показват отворени сесии, неплатени сметки или чакащи поръчки.',
          body: '',
        },
        ro: {
          title:
            'Utilizati Vizualizarea live a meselor pentru a urmari ocuparea: culorile indica sesiuni deschise, note neplatite sau comenzi in asteptare.',
          body: '',
        },
      },
      {
        itemKey: 'guide-step-4',
        en: {
          title:
            'When printing, set paper orientation to "Portrait" and ensure "Print Background Graphics" is checked.',
          body: '',
        },
        bg: {
          title:
            "При печат задайте ориентацията на хартията на 'Portrait' (Вертикално) и задължително отметнете опцията 'Print Background Graphics' (Печат на фонови графики).",
          body: '',
        },
        ro: {
          title:
            "La imprimare, setati orientarea paginii pe 'Portrait' (Portret) si bifati 'Print Background Graphics' (Imprimare imagini de fundal).",
          body: '',
        },
      },
      {
        itemKey: 'guide-tip',
        en: {
          title:
            'When printing, set paper orientation to "Portrait" and ensure "Print Background Graphics" is checked for the borders to print correctly.',
          body: '',
        },
        bg: {
          title:
            "При печат задайте ориентацията на хартията на 'Portrait' и отметнете 'Print Background Graphics', за да се отпечатат фоновите рамки правилно.",
          body: '',
        },
        ro: {
          title:
            "La imprimare, setati orientarea pe 'Portrait' si bifati 'Print Background Graphics' pentru ca ramele de fundal sa se imprime corect.",
          body: '',
        },
      },
      {
        itemKey: 'guide-warning',
        en: {
          title:
            'Do not alter the structure of QR code URLs manually. They contain table identifiers required to route customer orders properly.',
          body: '',
        },
        bg: {
          title:
            'Не променяйте ръчно структурата на URL адресите на QR кодовете. Те съдържат идентификатори на масите, нужни за коректно насочване на поръчките.',
          body: '',
        },
        ro: {
          title:
            'Nu modificati manual structura URL-urilor codurilor QR. Ele contin identificatori de masa pentru conectarea corecta a comenzilor clientilor.',
          body: '',
        },
      },
      {
        itemKey: 'faq-1',
        en: {
          title:
            'How do I print the QR codes without the page borders cutting them off?',
          body: 'When the browser print panel opens, set the orientation to "Portrait", paper size to A4, and ensure "Print Background Graphics" is toggled ON under advanced settings. Our Classic, Premium, and Minimal templates are formatted to fit perfectly on a 2x2 grid without bleeding.',
        },
        bg: {
          title: 'Как да разпечатам QR кодовете, без да се изрязват краищата?',
          body: "Когато се отвори панелът за печат на браузъра, задайте ориентацията на 'Portrait', размер на хартията A4 и се уверете, че опцията 'Print Background Graphics' е включена в разширените настройки. Нашите Класически, Премиум и Минималистични шаблони са форматирани за мрежа 2x2 на лист A4 без преливане.",
        },
        ro: {
          title: 'Cum imprim codurile QR fara ca marginile paginii sa le taie?',
          body: "Cand se deschide panoul de imprimare, setati orientarea pe 'Portrait', dimensiunea A4 si asigurati-va ca optiunea 'Print Background Graphics' este activata. Sabloanele noastre Clasic, Premium si Minimal se incadreaza perfect pe o grila 2x2.",
        },
      },
      {
        itemKey: 'faq-t-1',
        en: {
          title: 'Can I organize tables into zones like Terrace or VIP Room?',
          body: 'Yes. The Tables tab supports zone grouping. Create named zones (e.g. Terrace, Indoor, Bar Area) and assign tables to them. Zones appear as separate sections in the Live Table View and help staff quickly identify table locations.',
        },
        bg: {
          title:
            'Мога ли да организирам масите в зони като Тераса или VIP зала?',
          body: 'Да. Разделът Маси поддържа групиране по зони. Създайте именувани зони (напр. Тераса, Вътрешна зала, Бар) и разпределете масите към тях. Зоните се показват като отделни секции в Схемата на масите на живо и помагат на персонала бързо да идентифицира местоположението на масите.',
        },
        ro: {
          title: 'Pot organiza mesele in zone precum Terasa sau Salon VIP?',
          body: 'Da. Fila Mese suporta gruparea pe zone. Creati zone cu nume (de ex. Terasa, Interior, Zona Bar) si atribuiti mesele la ele. Zonele apar ca sectiuni separate in Vizualizarea live a meselor si ajuta personalul sa identifice rapid locatia meselor.',
        },
      },
      {
        itemKey: 'faq-t-2',
        en: {
          title:
            'What happens if a customer scans a QR code after I delete or rename that table?',
          body: 'QR codes are linked to table identifiers. If you rename a table, existing QR codes continue to work and redirect to the renamed table. If you delete a table entirely, the QR code will show an error page. We recommend creating a replacement table before removing the old one.',
        },
        bg: {
          title:
            'Какво се случва, ако клиент сканира QR код след като съм изтрил или преименувал масата?',
          body: 'QR кодовете са свързани с идентификатори на маси. Ако преименувате маса, съществуващите QR кодове продължават да работят и пренасочват към преименуваната маса. Ако изтриете маса изцяло, QR кодът ще показва страница за грешка. Препоръчваме да създадете заместваща маса, преди да премахнете старата.',
        },
        ro: {
          title:
            'Ce se intampla daca un client scaneaza un cod QR dupa ce am sters sau redenumit masa?',
          body: 'Codurile QR sunt legate de identificatorii meselor. Daca redenumiti o masa, codurile QR existente continua sa functioneze si redirectioneaza catre masa redenumita. Daca stergeti o masa complet, codul QR va afisa o pagina de eroare. Va recomandam sa creati o masa de inlocuire inainte de a o elimina pe cea veche.',
        },
      },
    ],
  },
  {
    categoryKey: 'payments',
    items: [
      {
        itemKey: 'guide-title',
        en: { title: 'Tableside Payments with Stripe Connect', body: '' },
        bg: { title: 'Плащания на маса със Stripe Connect', body: '' },
        ro: { title: 'Plati la masa prin Stripe Connect', body: '' },
      },
      {
        itemKey: 'guide-desc',
        en: {
          title:
            'Integrate Stripe to let customers request the bill, leave a tip, and pay directly from their phones.',
          body: '',
        },
        bg: {
          title:
            'Интегрирайте Stripe, за да позволите на клиентите да искат сметката, да оставят бакшиш и да плащат от телефоните си.',
          body: '',
        },
        ro: {
          title:
            'Conectati contul Stripe pentru a le permite clientilor sa ceara nota de plata, sa lase bacsis si sa plateasca de pe telefon.',
          body: '',
        },
      },
      {
        itemKey: 'guide-step-0',
        en: {
          title:
            'Navigate to Settings > Payments and click "Connect with Stripe" to register or link your Stripe account.',
          body: '',
        },
        bg: {
          title:
            "Навигирайте до Настройки > Плащания и кликнете 'Свързване със Stripe', за да регистрирате или свържете вашия Stripe акаунт.",
          body: '',
        },
        ro: {
          title:
            "Navigati la Setari > Plati si faceti clic pe 'Conectare cu Stripe' pentru a inregistra sau conecta contul Stripe.",
          body: '',
        },
      },
      {
        itemKey: 'guide-step-1',
        en: {
          title:
            'Set up Default Tip percentages (e.g. 5%, 10%, 15%) to be shown during customer checkout.',
          body: '',
        },
        bg: {
          title:
            'Настройте проценти за Бакшиш по подразбиране (напр. 5%, 10%, 15%), за да се показват при плащане на клиента.',
          body: '',
        },
        ro: {
          title:
            'Configurati procente prestabilite pentru Bacsis (de ex. 5%, 10%, 15%) pentru a fi afisate clientilor la plata.',
          body: '',
        },
      },
      {
        itemKey: 'guide-step-2',
        en: {
          title:
            'Once connected, customers can request the bill from their mobile menu, choose a tip, and pay securely by card.',
          body: '',
        },
        bg: {
          title:
            'След свързването клиентите могат да поискат сметка от мобилното си меню, да изберат бакшиш и да платят сигурно с карта.',
          body: '',
        },
        ro: {
          title:
            'Dupa conectare, clientii pot solicita nota de plata din meniul mobil, alege bacsisul si plati securizat cu cardul.',
          body: '',
        },
      },
      {
        itemKey: 'guide-step-3',
        en: {
          title:
            'Monitor payouts and transactions in the Payments tab. Platform fees are automatically deducted at transaction time.',
          body: '',
        },
        bg: {
          title:
            'Следете постъпленията и транзакциите в раздел Плащания. Таксите на платформата се приспадат автоматично при всяка транзакция.',
          body: '',
        },
        ro: {
          title:
            'Monitorizati incasarile si tranzactiile in fila Plati. Taxele platformei sunt retinute automat la fiecare tranzactie.',
          body: '',
        },
      },
      {
        itemKey: 'guide-tip',
        en: {
          title:
            'Customers can calculate how to split the bill right on the checkout screen (up to 20 people), before they pay cash or card.',
          body: '',
        },
        bg: {
          title:
            'Клиентите могат да изчислят как да разделят сметката директно на екрана за плащане (до 20 души), преди да платят в брой или с карта.',
          body: '',
        },
        ro: {
          title:
            'Clientii pot calcula cum sa imparta nota direct pe ecranul de plata (pana la 20 de persoane), inainte de a plati cash sau cu cardul.',
          body: '',
        },
      },
      {
        itemKey: 'guide-warning',
        en: {
          title:
            'Stripe payments require a secure HTTPS connection. The Stripe Connect settings can only be accessed by the Owner role.',
          body: '',
        },
        bg: {
          title:
            'Плащанията със Stripe изискват сигурна HTTPS връзка. Настройките на Stripe Connect са достъпни само за собственика на ресторанта.',
          body: '',
        },
        ro: {
          title:
            'Platile prin Stripe necesita o conexiune securizata HTTPS. Setarile Stripe Connect pot fi accesate doar de catre proprietar.',
          body: '',
        },
      },
      {
        itemKey: 'faq-1',
        en: {
          title: 'What are the fees for using Stripe tableside payments?',
          body: 'The platform integrates using Stripe Connect. Standard Stripe processing fees apply per transaction. The platform also charges a configurable fee (e.g. 1%) which is automatically routed during tableside checkout. You can disconnect your Stripe account at any time.',
        },
        bg: {
          title: 'Какви са таксите за плащания с карта през Stripe на масата?',
          body: 'Платформата се интегрира чрез Stripe Connect. За всяка транзакция се начисляват стандартните такси за обработка на Stripe. Платформата също начислява конфигурируема такса (напр. 1%), която се разпределя автоматично по време на плащането. Можете да прекъснете връзката със Stripe по всяко време от Настройки.',
        },
        ro: {
          title: 'Care sunt taxele pentru platile la masa prin Stripe?',
          body: 'Platforma utilizeaza Stripe Connect. Se aplica comisioanele standard ale Stripe pentru procesarea tranzactiilor cu cardul. Suplimentar, se percepe un comision al platformei (de ex. 1%), retinut automat la plata. Puteti deconecta contul Stripe oricand.',
        },
      },
      {
        itemKey: 'faq-p-1',
        en: {
          title: 'How does the bill splitting feature work for customers?',
          body: 'On the checkout screen, customers select how many people are splitting the bill (up to 20). The system divides the total equally and shows each person their share including tip. Each person can pay their portion individually via card.',
        },
        bg: {
          title: 'Как работи функцията за разделяне на сметката за клиентите?',
          body: 'На екрана за плащане клиентите избират на колко души се разделя сметката (до 20). Системата разделя сумата поравно и показва на всеки неговия дял, включително бакшиша. Всеки може да плати своята част индивидуално с карта.',
        },
        ro: {
          title: 'Cum functioneaza impartirea notei de plata pentru clienti?',
          body: 'Pe ecranul de plata, clientii selecteaza cate persoane impart nota (pana la 20). Sistemul imparte totalul in mod egal si arata fiecarei persoane partea sa, inclusiv bacsisul. Fiecare persoana poate plati individual cu cardul.',
        },
      },
      {
        itemKey: 'faq-p-2',
        en: {
          title: 'Can customers pay in cash instead of by card?',
          body: 'Yes. The checkout screen offers both cash and card options. When a customer selects cash payment, the order is marked accordingly and no online transaction occurs. The waiter collects cash at the table. Cash payments are tracked in the Payments dashboard alongside card transactions.',
        },
        bg: {
          title: 'Могат ли клиентите да плащат в брой вместо с карта?',
          body: 'Да. Екранът за плащане предлага опции както за плащане в брой, така и с карта. Когато клиент избере плащане в брой, поръчката се маркира съответно и не се извършва онлайн транзакция. Сервитьорът събира парите на масата. Плащанията в брой се проследяват в панела Плащания заедно с картовите транзакции.',
        },
        ro: {
          title: 'Pot clientii sa plateasca in numerar in loc de cu cardul?',
          body: 'Da. Ecranul de plata ofera optiuni atat pentru numerar, cat si pentru card. Cand un client selecteaza plata in numerar, comanda este marcata corespunzator si nu se efectueaza nicio tranzactie online. Chelnerul colecteaza banii la masa. Platile in numerar sunt urmarite in panoul Plati alaturi de tranzactiile cu cardul.',
        },
      },
    ],
  },
  {
    categoryKey: 'loyalty',
    items: [
      {
        itemKey: 'guide-title',
        en: { title: 'Setting up Loyalty & VIP Tiers', body: '' },
        bg: { title: 'Настройка на програма за лоялност и VIP нива', body: '' },
        ro: {
          title: 'Configurarea programului de loialitate si a nivelurilor VIP',
          body: '',
        },
      },
      {
        itemKey: 'guide-desc',
        en: {
          title:
            'Create a rewards program that issues points per purchase and unlocks progressive VIP tier discounts.',
          body: '',
        },
        bg: {
          title:
            'Създайте програма за награди, която начислява точки за всяка покупка и отключва отстъпки за VIP нива.',
          body: '',
        },
        ro: {
          title:
            'Creati un program de recompense care ofera puncte pentru cumparaturi si deblocheaza discount-uri progresive VIP.',
          body: '',
        },
      },
      {
        itemKey: 'guide-step-0',
        en: {
          title:
            'Go to Settings > Loyalty and toggle the program ON. Define your point earning ratio and signup bonus.',
          body: '',
        },
        bg: {
          title:
            'Отидете в Настройки > Лоялност и активирайте програмата. Дефинирайте съотношението точки спрямо похарчена сума и бонус при регистрация.',
          body: '',
        },
        ro: {
          title:
            'Accesati Setari > Loialitate si activati programul. Definiti rata de castig (puncte pe 1 EUR) si bonusul de inregistrare.',
          body: '',
        },
      },
      {
        itemKey: 'guide-step-1',
        en: {
          title:
            'Set thresholds for VIP Tiers (Silver, Gold). Higher tier members automatically earn points faster (e.g. Gold: 1.5x points).',
          body: '',
        },
        bg: {
          title:
            'Настройте праговете за VIP нива (Бронзово, Сребърно, Златно). Членовете от по-високи нива автоматично печелят точки по-бързо (напр. Златно: 1.5x точки).',
          body: '',
        },
        ro: {
          title:
            'Configurati pragurile pentru nivelurile VIP (Bronz, Argint, Aur). Membrii VIP acumuleaza puncte mai rapid (de ex. Aur: 1.5x puncte).',
          body: '',
        },
      },
      {
        itemKey: 'guide-step-2',
        en: {
          title:
            'Configure Happy Hours time ranges to award point multipliers (e.g. 2x points) during slower shifts.',
          body: '',
        },
        bg: {
          title:
            'Конфигурирайте Happy Hours за часови зони, за да награждавате с допълнителни точки (напр. 2x точки) по време на по-слабо посещаваните часове.',
          body: '',
        },
        ro: {
          title:
            'Configurati intervale Happy Hours pentru a acorda puncte multiplicatoare (de ex. 2x puncte) in orele mai putin aglomerate.',
          body: '',
        },
      },
      {
        itemKey: 'guide-step-3',
        en: {
          title:
            'Points are deducted automatically at checkout if customers choose to redeem them for discounts or free items.',
          body: '',
        },
        bg: {
          title:
            'Точките се приспадат автоматично при финализиране на поръчката, ако клиентите изберат да ги обменят за отстъпки или безплатни артикули.',
          body: '',
        },
        ro: {
          title:
            'Punctele sunt scazute automat la finalizarea comenzii atunci cand clientii aleg sa le preschimbe in reduceri sau produse gratuite.',
          body: '',
        },
      },
      {
        itemKey: 'guide-tip',
        en: {
          title:
            'The system uses FIFO (First In, First Out) accounting for points. Expiring points are scrubbed daily from the system automatically.',
          body: '',
        },
        bg: {
          title:
            'Системата използва счетоводни FIFO (Първ влязъл, първ излязъл) изчисления. Изтичащите точки се изчистват автоматично ежедневно.',
          body: '',
        },
        ro: {
          title:
            'Sistemul utilizeaza FIFO (primul intrat, primul iesit) pentru puncte. Punctele care expira sunt eliminate zilnic din sistem.',
          body: '',
        },
      },
      {
        itemKey: 'guide-warning',
        en: {
          title:
            'The default cashback rate is 6.7%. We display a warning if your tuned cashback rate exceeds 15% to protect your margins.',
          body: '',
        },
        bg: {
          title:
            'Процентът на кешбек по подразбиране е 6.7%. Показваме предупреждение, ако настроеният от вас кешбек надвиши 15%, за да предпазим маржовете ви.',
          body: '',
        },
        ro: {
          title:
            'Rata cashback-ului implicita este de 6.7%. Afisam un avertisment daca cashback-ul depaseste 15%, pentru a va proteja profitul.',
          body: '',
        },
      },
      {
        itemKey: 'faq-1',
        en: {
          title:
            'Can customers sign up for loyalty without creating a password?',
          body: 'Yes! The customer menu utilizes an Email OTP (One Time Password) login system. Customers just enter their email, receive a 6 digit code in their inbox, and punch it in to enter. No passwords or long sign up forms needed.',
        },
        bg: {
          title:
            'Могат ли клиентите да се регистрират за лоялната програма без парола?',
          body: 'Да! Клиентското меню използва система за вход с еднократен код (OTP) по имейл. Клиентите просто въвеждат имейла си, получават 6-цифрен код и го въвеждат за вход. Не са необходими пароли или регистрационни форми.',
        },
        ro: {
          title:
            'Se pot inscrie clientii in programul de loialitate fara a crea o parola?',
          body: 'Da! Meniul clientilor utilizeaza un sistem de autentificare prin Email OTP. Clientii isi introduc email-ul, primesc un cod de 6 cifre pe mail si il introduc pentru a intra. Fara formulare lungi de inregistrare.',
        },
      },
      {
        itemKey: 'faq-l-1',
        en: {
          title:
            'How do Happy Hours multipliers work and how do I configure them?',
          body: 'Happy Hours award bonus point multipliers during specific time windows you configure in Settings > Loyalty. For example, setting a 2x multiplier between 14:00 and 17:00 means customers earn double loyalty points on orders placed during those hours. Happy Hours respect your restaurant timezone setting.',
        },
        bg: {
          title: 'Как работят множителите за Happy Hours и как да ги настроя?',
          body: 'Happy Hours начисляват бонусни множители за точки през конкретни времеви прозорци, които конфигурирате в Настройки > Лоялност. Например, задаване на 2x множител между 14:00 и 17:00 означава, че клиентите печелят двойно повече точки за лоялност при поръчки в тези часове. Happy Hours спазват настройката за часова зона на вашия ресторант.',
        },
        ro: {
          title:
            'Cum functioneaza multiplicatorii Happy Hours si cum ii configurez?',
          body: 'Happy Hours acorda multiplicatori de puncte bonus in ferestre de timp specifice pe care le configurati in Setari > Loialitate. De exemplu, setarea unui multiplicator 2x intre 14:00 si 17:00 inseamna ca clientii castiga dublu puncte de loialitate pentru comenzile plasate in acele ore. Happy Hours respecta setarea de fus orar a restaurantului.',
        },
      },
      {
        itemKey: 'faq-l-2',
        en: {
          title:
            'What happens to loyalty points if a customer requests a refund?',
          body: 'Loyalty points awarded for a refunded order are automatically deducted from the customer balance. If the customer has already spent those points, their balance may go negative and future point earnings will first cover the deficit before accumulating new rewards.',
        },
        bg: {
          title:
            'Какво се случва с точките за лоялност, ако клиент поиска възстановяване на сума?',
          body: 'Точките за лоялност, начислени за възстановена поръчка, автоматично се приспадат от баланса на клиента. Ако клиентът вече е изхарчил тези точки, балансът може да стане отрицателен и бъдещите печалби от точки първо ще покрият дефицита, преди да се натрупват нови награди.',
        },
        ro: {
          title:
            'Ce se intampla cu punctele de loialitate daca un client solicita o rambursare?',
          body: 'Punctele de loialitate acordate pentru o comanda rambursata sunt deduse automat din soldul clientului. Daca clientul a cheltuit deja acele puncte, soldul poate deveni negativ, iar castigurile viitoare de puncte vor acoperi mai intai deficitul inainte de a acumula noi recompense.',
        },
      },
    ],
  },
  {
    categoryKey: 'staff',
    items: [
      {
        itemKey: 'guide-title',
        en: { title: 'Waiter POS & Kitchen KDS Systems', body: '' },
        bg: { title: 'Сервитьорски POS и кухненски KDS системи', body: '' },
        ro: {
          title: 'Sisteme POS pentru ospatari si KDS pentru bucatarie',
          body: '',
        },
      },
      {
        itemKey: 'guide-desc',
        en: {
          title:
            'Equip waiters with digital order pads for tableside entry, and cooks with real-time order tracking screens.',
          body: '',
        },
        bg: {
          title:
            'Оборудвайте сервитьорите с дигитални бележници за поръчки на маса, а готвачите с екрани за поръчки в реално време.',
          body: '',
        },
        ro: {
          title:
            'Dotati ospatarii cu terminale digitale pentru preluarea comenzilor si bucatarii cu ecrane de monitorizare in timp real.',
          body: '',
        },
      },
      {
        itemKey: 'guide-step-0',
        en: {
          title:
            'Add employee profiles in Settings > Staff. Assign access roles and security PIN codes.',
          body: '',
        },
        bg: {
          title:
            'Добавете профили на служители в Настройки > Персонал. Задайте права за достъп и PIN кодове за сигурно влизане.',
          body: '',
        },
        ro: {
          title:
            'Adaugati profile de angajati in Setari > Personal. Atribuiti roluri de acces si coduri PIN de securitate.',
          body: '',
        },
      },
      {
        itemKey: 'guide-step-1',
        en: {
          title:
            'Waiters utilize the mobile POS at the route "/staff/pos" to rapidly pick tables, add items, type notes, and dispatch orders.',
          body: '',
        },
        bg: {
          title:
            "Сервитьорите използват мобилния POS на адрес '/staff/pos', за да избират бързо маси, добавят артикули, записват бележки и изпращат поръчки.",
          body: '',
        },
        ro: {
          title:
            "Ospatarii utilizeaza POS-ul mobil la adresa '/staff/pos' pentru a selecta rapid mesele, adauga produse si trimite comenzi.",
          body: '',
        },
      },
      {
        itemKey: 'guide-step-2',
        en: {
          title:
            'Kitchen line cooks monitor incoming live orders on the dark-mode OLED KDS screen at "/staff/kitchen".',
          body: '',
        },
        bg: {
          title:
            "Готвачите в кухнята следят входящите поръчки на живо на тъмния OLED KDS екран на адрес '/staff/kitchen'.",
          body: '',
        },
        ro: {
          title:
            "Bucatarii monitorizaza comenzile in timp real pe ecranul KDS cu fundal intunecat la adresa '/staff/kitchen'.",
          body: '',
        },
      },
      {
        itemKey: 'guide-step-3',
        en: {
          title:
            'Kitchen staff tap on order cards to bump them across columns: Placed, In Kitchen, and Served, playing chime sounds on arrival.',
          body: '',
        },
        bg: {
          title:
            "Персоналът в кухнята докосва картите с поръчки, за да ги придвижи през колоните 'Приети', 'В кухнята' и 'Сервирани', със звукови известия при пристигане.",
          body: '',
        },
        ro: {
          title:
            'Personalul din bucatarie apasa pe cardurile de comenzi pentru a le muta intre coloanele Plasate, In pregatire si Servite.',
          body: '',
        },
      },
      {
        itemKey: 'guide-tip',
        en: {
          title:
            'The waiter POS cart is persisted only in device memory. Switching tables scrubs scratchpad items without bleeding into customer views.',
          body: '',
        },
        bg: {
          title:
            'Количката в сервитьорския POS се пази локално в паметта на устройството. Смяната на маса изчиства временните артикули, без да пречи на клиентите.',
          body: '',
        },
        ro: {
          title:
            'Cosul din POS-ul ospatarilor este pastrat doar in memoria dispozitivului. Schimbarea mesei reseteaza articolele, fara a afecta clientii.',
          body: '',
        },
      },
      {
        itemKey: 'guide-warning',
        en: {
          title:
            'KDS screens feature elapsed chronometers. Tickets sitting for >15 mins get coated in stark red to flag urgency.',
          body: '',
        },
        bg: {
          title:
            'KDS екраните показват таймери за изминало време. Поръчките, чакащи повече от 15 минути, се оцветяват в червено за спешност.',
          body: '',
        },
        ro: {
          title:
            'Ecranele KDS afiseaza cronometre de timp scurs. Comenzile mai vechi de 15 minute sunt evidentiate cu rosu pentru urgenta.',
          body: '',
        },
      },
      {
        itemKey: 'faq-1',
        en: {
          title:
            'What is the access difference between Waiter POS and Kitchen KDS?',
          body: 'The Waiter POS (/staff/pos) is geared towards front-of-house waiters to punch in tableside tickets rapidly. The Kitchen KDS (/staff/kitchen) is optimized for back-of-house cooks for order tracking. Both require an account setup in Settings > Staff, but restaurant configurations, analytics, and payouts remain siloed exclusively to the Owner role.',
        },
        bg: {
          title:
            'Каква е разликата в нивата на достъп между Сервитьорски POS и Кухненски KDS?',
          body: 'Сервитьорският POS (/staff/pos) е оптимизиран за сервитьори в залата за бързо приемане на поръчки. Кухненският KDS (/staff/kitchen) е предназначен за готвачи за проследяване на поръчки. И двата изискват акаунт от Настройки > Персонал, но настройките, анализите и плащанията са достъпни само за ролята Собственик.',
        },
        ro: {
          title:
            'Care este diferenta de acces intre POS ospatari si KDS bucatarie?',
          body: 'POS-ul ospatarilor (/staff/pos) este conceput pentru ospatari pentru a prelua rapid comenzi de la mese. KDS bucatarie (/staff/kitchen) este optimizat pentru bucatari pentru urmarirea comenzilor. Ambele necesita un cont creat in Setari > Personal, dar setarile restaurantului si platile raman exclusive pentru rolul de Proprietar.',
        },
      },
      {
        itemKey: 'faq-s-1',
        en: {
          title:
            'Can waiters add special notes to individual items in an order?',
          body: "Yes. When adding items in the Waiter POS, tap the note icon next to any item to type custom instructions such as 'no onions', 'extra spicy', or 'allergy: nuts'. These notes appear on the Kitchen Display ticket alongside the item, ensuring kitchen staff see special requests immediately.",
        },
        bg: {
          title:
            'Могат ли сервитьорите да добавят специални бележки към отделни артикули в поръчка?',
          body: "Да. При добавяне на артикули в сервитьорския POS, натиснете иконата за бележка до всеки артикул, за да напишете специални инструкции като 'без лук', 'допълнително люто' или 'алергия: ядки'. Тези бележки се появяват на билета в кухненския дисплей до артикула, за да могат готвачите веднага да видят специалните изисквания.",
        },
        ro: {
          title:
            'Pot chelnerii sa adauge note speciale la articolele individuale dintr-o comanda?',
          body: "Da. Cand adauga articole in POS-ul chelnerului, apasati iconita de nota de langa orice articol pentru a scrie instructiuni speciale precum 'fara ceapa', 'extra picant' sau 'alergie: nuci'. Aceste note apar pe tichetul de pe afisajul de bucatarie langa articol, asigurand ca personalul din bucatarie vede imediat cererile speciale.",
        },
      },
      {
        itemKey: 'faq-s-2',
        en: {
          title:
            'How does the Kitchen Display handle multiple simultaneous orders?',
          body: 'The KDS organizes orders into individual ticket cards arranged in columns: Placed, In Kitchen, and Served. Each card shows the table number, items, notes, and an elapsed timer. Kitchen staff tap a card to advance it to the next column. Tickets active for longer than 15 minutes are highlighted in red to flag urgency.',
        },
        bg: {
          title:
            'Как кухненският дисплей обработва множество едновременни поръчки?',
          body: 'KDS организира поръчките в индивидуални карти, подредени в колони: Приети, В кухнята и Сервирани. Всяка карта показва номера на масата, артикулите, бележките и таймер за изминалото време. Персоналът в кухнята докосва карта, за да я придвижи към следващата колона. Билетите, активни повече от 15 минути, се оцветяват в червено за спешност.',
        },
        ro: {
          title:
            'Cum gestioneaza afisajul de bucatarie mai multe comenzi simultane?',
          body: 'KDS organizeaza comenzile in tichete individuale aranjate in coloane: Plasate, In Bucatarie si Servite. Fiecare tichet afiseaza numarul mesei, articolele, notele si un cronometru al timpului scurs. Personalul din bucatarie apasa un tichet pentru a-l avansa la coloana urmatoare. Tichetele active mai mult de 15 minute sunt evidentiate cu rosu pentru urgenta.',
        },
      },
    ],
  },
  {
    categoryKey: 'legal',
    items: [
      {
        itemKey: 'guide-title',
        en: { title: 'GDPR Compliance & Privacy', body: '' },
        bg: { title: 'GDPR съответствие и поверителност', body: '' },
        ro: { title: 'Conformitate GDPR si Confidentialitate', body: '' },
      },
      {
        itemKey: 'guide-desc',
        en: {
          title:
            'Ensure your business respects customer privacy, displays consent banners, and drops user data when requested.',
          body: '',
        },
        bg: {
          title:
            'Уверете се, че вашият бизнес спазва регулациите за поверителност, показва съгласие за бисквитки и изтрива лични данни при поискване.',
          body: '',
        },
        ro: {
          title:
            'Asigurati-va ca afacerea dvs. respecta confidentialitatea clientilor, afiseaza bannere de consimtamant si sterge datele solicitate.',
          body: '',
        },
      },
      {
        itemKey: 'guide-step-0',
        en: {
          title:
            'Toggle cookie consent banners in settings to notify customers on their public menu browser.',
          body: '',
        },
        bg: {
          title:
            'Активирайте банера за съгласие за бисквитки в настройките, за да се показва на клиентите в публичното меню.',
          body: '',
        },
        ro: {
          title:
            'Activati bannerul de consimtamant pentru cookie-uri in setari pentru a fi afisat clientilor in meniul public.',
          body: '',
        },
      },
      {
        itemKey: 'guide-step-1',
        en: {
          title:
            'Provide visible links to privacy policy pages. The platform auto-generates localized /privacy and /terms routes.',
          body: '',
        },
        bg: {
          title:
            'Осигурете видими връзки към политиката за поверителност. Платформата автоматично генерира локализирани адреси /privacy и /terms.',
          body: '',
        },
        ro: {
          title:
            'Adaugati legaturi vizibile catre politica de confidentialitate. Platforma genereaza automat rutele /privacy si /terms.',
          body: '',
        },
      },
      {
        itemKey: 'guide-step-2',
        en: {
          title:
            'Under GDPR guidelines, if a customer requests account erasure, navigate to the User Management dashboard.',
          body: '',
        },
        bg: {
          title:
            'При поискване от клиент за изтриване на данни съгласно GDPR, отидете в панела за управление на потребители.',
          body: '',
        },
        ro: {
          title:
            'La cererea unui client pentru stergerea datelor (GDPR), navigati in panoul de administrare a utilizatorilor.',
          body: '',
        },
      },
      {
        itemKey: 'guide-step-3',
        en: {
          title:
            'Use the "Purge Account / Right to Erasure" button to permanently delete customer emails, transaction lists, and point ledgers.',
          body: '',
        },
        bg: {
          title:
            "Натиснете бутона 'Право на изтриване (GDPR)', за да изтриете завинаги имейли, история на транзакции и баланс на точки.",
          body: '',
        },
        ro: {
          title:
            "Folositi butonul 'Dreptul de a fi uitat (GDPR)' pentru a sterge definitiv email-urile, tranzactiile si punctele clientului.",
          body: '',
        },
      },
      {
        itemKey: 'guide-tip',
        en: {
          title:
            'Deleted GDPR customer accounts cannot be recovered. Ensure you verify client identity before processing erasure requests.',
          body: '',
        },
        bg: {
          title:
            'Изтритите по GDPR клиентски акаунти не могат да бъдат възстановени. Задължително проверете самоличността на клиента преди изтриване.',
          body: '',
        },
        ro: {
          title:
            'Conturile clientilor sterse conform GDPR nu mai pot fi recuperate. Verificati identitatea clientului inainte de stergere.',
          body: '',
        },
      },
      {
        itemKey: 'faq-lg-1',
        en: {
          title:
            'What customer data does the platform collect and how long is it stored?',
          body: 'The platform collects email addresses for customer login via OTP, order history, loyalty point balances, and feedback ratings. Data retention periods are configurable by the Super Admin in the GDPR settings panel. Personal data is automatically anonymized after the configured retention window expires.',
        },
        bg: {
          title:
            'Какви клиентски данни събира платформата и колко дълго се съхраняват?',
          body: 'Платформата събира имейл адреси за вход на клиенти чрез OTP, история на поръчките, баланси на точки за лоялност и оценки от обратна връзка. Периодите на съхранение на данни са конфигурируеми от Super Admin в панела за GDPR настройки. Личните данни автоматично се анонимизират след изтичане на конфигурирания период за съхранение.',
        },
        ro: {
          title:
            'Ce date ale clientilor colecteaza platforma si cat timp sunt stocate?',
          body: 'Platforma colecteaza adrese de email pentru autentificarea clientilor prin OTP, istoricul comenzilor, soldurile de puncte de loialitate si evaluarile de feedback. Perioadele de retentie a datelor sunt configurabile de catre Super Admin in panoul de setari GDPR. Datele personale sunt anonimizate automat dupa expirarea ferestrei de retentie configurate.',
        },
      },
      {
        itemKey: 'faq-lg-2',
        en: {
          title: 'Can customers export their personal data from the platform?',
          body: 'Yes. Under GDPR Article 20, customers can request a full export of their personal data in JSON format. This includes their email, order history, loyalty points, and feedback. The data export endpoint can be enabled or disabled by the Super Admin in the GDPR settings panel.',
        },
        bg: {
          title:
            'Могат ли клиентите да експортират личните си данни от платформата?',
          body: 'Да. Съгласно член 20 от GDPR, клиентите могат да поискат пълен експорт на личните си данни в JSON формат. Това включва имейла им, историята на поръчките, точките за лоялност и обратната връзка. Функцията за експорт на данни може да бъде активирана или деактивирана от Super Admin в панела за GDPR настройки.',
        },
        ro: {
          title: 'Pot clientii sa-si exporte datele personale de pe platforma?',
          body: 'Da. Conform Articolului 20 din GDPR, clientii pot solicita un export complet al datelor lor personale in format JSON. Acesta include email-ul lor, istoricul comenzilor, punctele de loialitate si feedback-ul. Functia de export de date poate fi activata sau dezactivata de catre Super Admin in panoul de setari GDPR.',
        },
      },
    ],
  },
  {
    categoryKey: 'analytics',
    items: [
      {
        itemKey: 'category-meta',
        en: { title: 'Layout', body: 'Analytics & Reports' },
        bg: { title: 'Layout', body: 'Анализи и отчети' },
        ro: { title: 'Layout', body: 'Analize si rapoarte' },
      },
      {
        itemKey: 'guide-title',
        en: { title: 'Understanding Your Analytics Dashboard', body: '' },
        bg: { title: 'Работа с аналитичния панел', body: '' },
        ro: { title: 'Utilizarea panoului de analize', body: '' },
      },
      {
        itemKey: 'guide-desc',
        en: {
          title:
            'Track restaurant performance with real-time charts covering orders, revenue, category sales, and day-part breakdowns.',
          body: '',
        },
        bg: {
          title:
            'Проследявайте представянето на ресторанта с графики в реално време за поръчки, приходи, продажби по категории и анализ по части от деня.',
          body: '',
        },
        ro: {
          title:
            'Urmariti performanta restaurantului cu grafice in timp real pentru comenzi, venituri, vanzari pe categorii si analiza pe intervale orare.',
          body: '',
        },
      },
      {
        itemKey: 'guide-step-0',
        en: {
          title:
            'Navigate to the Analytics tab to view your restaurant performance overview including total orders, revenue, and average order value.',
          body: '',
        },
        bg: {
          title:
            'Навигирайте до раздел Анализи, за да видите преглед на представянето на ресторанта, включително общ брой поръчки, приходи и средна стойност на поръчка.',
          body: '',
        },
        ro: {
          title:
            'Navigati la fila Analize pentru a vedea o privire de ansamblu asupra performantei restaurantului, inclusiv totalul comenzilor, veniturile si valoarea medie a comenzii.',
          body: '',
        },
      },
      {
        itemKey: 'guide-step-1',
        en: {
          title:
            'Use the date range picker to filter analytics by day, week, month, or custom period. Compare current performance against previous periods.',
          body: '',
        },
        bg: {
          title:
            'Използвайте избора на период, за да филтрирате анализите по ден, седмица, месец или персонализиран период. Сравнявайте текущото представяне с предходни периоди.',
          body: '',
        },
        ro: {
          title:
            'Utilizati selectorul de intervale de date pentru a filtra analizele pe zi, saptamana, luna sau perioada personalizata. Comparati performanta curenta cu perioadele anterioare.',
          body: '',
        },
      },
      {
        itemKey: 'guide-step-2',
        en: {
          title:
            'Review the Category Mix chart to identify your best-selling categories and items. Use this data to optimize menu pricing and placement.',
          body: '',
        },
        bg: {
          title:
            'Прегледайте графиката Микс по категории, за да идентифицирате най-продаваните категории и артикули. Използвайте тези данни за оптимизиране на цените и подреждането на менюто.',
          body: '',
        },
        ro: {
          title:
            'Analizati graficul Mix pe categorii pentru a identifica cele mai vandute categorii si articole. Utilizati aceste date pentru a optimiza preturile si plasarea in meniu.',
          body: '',
        },
      },
      {
        itemKey: 'guide-step-3',
        en: {
          title:
            'Analyze Day-Part breakdowns (Breakfast, Lunch, Dinner, Late Night) to understand peak ordering hours and plan staff allocation.',
          body: '',
        },
        bg: {
          title:
            'Анализирайте разбивката по части от деня (Закуска, Обяд, Вечеря, Късна вечер), за да разберете пиковите часове за поръчки и да планирате разпределението на персонала.',
          body: '',
        },
        ro: {
          title:
            'Analizati impartirea pe intervale orare (Mic dejun, Pranz, Cina, Tarziu seara) pentru a intelege orele de varf si a planifica alocarea personalului.',
          body: '',
        },
      },
      {
        itemKey: 'guide-tip',
        en: {
          title:
            'Export analytics data to CSV for accounting or spreadsheet analysis using the download button in the top-right corner of the Analytics tab.',
          body: '',
        },
        bg: {
          title:
            'Експортирайте данните от анализите в CSV формат за счетоводство или анализ в таблици чрез бутона за изтегляне в горния десен ъгъл на раздел Анализи.',
          body: '',
        },
        ro: {
          title:
            'Exportati datele de analize in CSV pentru contabilitate sau analiza in foi de calcul folosind butonul de descarcare din coltul din dreapta sus al filei Analize.',
          body: '',
        },
      },
      {
        itemKey: 'guide-warning',
        en: {
          title:
            'Analytics data is calculated from completed orders only. Cancelled or refunded orders are excluded from revenue totals.',
          body: '',
        },
        bg: {
          title:
            'Данните от анализите се изчисляват само от завършени поръчки. Отказаните или възстановените поръчки не се включват в общите приходи.',
          body: '',
        },
        ro: {
          title:
            'Datele de analize sunt calculate doar din comenzile finalizate. Comenzile anulate sau rambursate sunt excluse din totalurile veniturilor.',
          body: '',
        },
      },
      {
        itemKey: 'faq-1',
        en: {
          title: 'What metrics does the analytics dashboard track?',
          body: 'The dashboard tracks total orders, revenue, average order value, category sales mix, day-part breakdowns, item popularity rankings, customer feedback scores, and payment method distribution. All metrics can be filtered by date range.',
        },
        bg: {
          title: 'Какви показатели проследява аналитичният панел?',
          body: 'Панелът проследява общия брой поръчки, приходите, средната стойност на поръчка, микса на продажби по категории, разбивката по части от деня, класациите по популярност на артикулите, оценките от обратна връзка и разпределението по метод на плащане. Всички показатели могат да бъдат филтрирани по период.',
        },
        ro: {
          title: 'Ce indicatori urmareste panoul de analize?',
          body: 'Panoul urmareste totalul comenzilor, veniturile, valoarea medie a comenzii, mixul de vanzari pe categorii, impartirea pe intervale orare, clasamentele de popularitate a articolelor, scorurile de feedback ale clientilor si distributia metodelor de plata. Toti indicatorii pot fi filtrati dupa interval de date.',
        },
      },
      {
        itemKey: 'faq-2',
        en: {
          title: 'Can I export analytics data to Excel or CSV?',
          body: 'Yes. Click the export button in the top-right corner of the Analytics tab. You can download the current view as a CSV file compatible with Excel, Google Sheets, and other spreadsheet applications. The export includes all visible metrics for the selected date range.',
        },
        bg: {
          title: 'Мога ли да експортирам данните от анализите в Excel или CSV?',
          body: 'Да. Кликнете върху бутона за експорт в горния десен ъгъл на раздел Анализи. Можете да изтеглите текущия изглед като CSV файл, съвместим с Excel, Google Sheets и други приложения за таблици. Експортът включва всички видими показатели за избрания период.',
        },
        ro: {
          title: 'Pot exporta datele de analize in Excel sau CSV?',
          body: 'Da. Faceti clic pe butonul de export din coltul din dreapta sus al filei Analize. Puteti descarca vizualizarea curenta ca fisier CSV compatibil cu Excel, Google Sheets si alte aplicatii de foi de calcul. Exportul include toti indicatorii vizibili pentru intervalul de date selectat.',
        },
      },
    ],
  },
  {
    categoryKey: 'branding',
    items: [
      {
        itemKey: 'category-meta',
        en: { title: 'Image', body: 'Branding & Theming' },
        bg: { title: 'Image', body: 'Брандиране и теми' },
        ro: { title: 'Image', body: 'Branding si teme' },
      },
      {
        itemKey: 'guide-title',
        en: { title: 'Customizing Your Restaurant Brand', body: '' },
        bg: { title: 'Персонализиране на бранда на вашия ресторант', body: '' },
        ro: { title: 'Personalizarea brandului restaurantului', body: '' },
      },
      {
        itemKey: 'guide-desc',
        en: {
          title:
            'Upload logos, choose color schemes, select fonts, and preview your public menu appearance on multiple devices.',
          body: '',
        },
        bg: {
          title:
            'Качете лого, изберете цветова схема, изберете шрифтове и прегледайте как изглежда публичното ви меню на различни устройства.',
          body: '',
        },
        ro: {
          title:
            'Incarcati logo-uri, alegeti scheme de culori, selectati fonturi si previzualizati aspectul meniului public pe dispozitive multiple.',
          body: '',
        },
      },
      {
        itemKey: 'guide-step-0',
        en: {
          title:
            'Go to Settings > Branding to upload your restaurant logo. The logo appears on QR code printouts, the public menu header, and customer receipts.',
          body: '',
        },
        bg: {
          title:
            'Отидете в Настройки > Брандиране, за да качите логото на ресторанта. Логото се появява на разпечатките с QR кодове, заглавието на публичното меню и касовите бележки за клиенти.',
          body: '',
        },
        ro: {
          title:
            'Accesati Setari > Branding pentru a incarca logo-ul restaurantului. Logo-ul apare pe tipararile codurilor QR, antetul meniului public si chitantele clientilor.',
          body: '',
        },
      },
      {
        itemKey: 'guide-step-1',
        en: {
          title:
            'Choose a Color Scheme using the visual editor. Select primary, accent, and background colors that match your restaurant brand identity. Changes preview in real-time.',
          body: '',
        },
        bg: {
          title:
            'Изберете Цветова схема чрез визуалния редактор. Изберете основни, акцентни и фонови цветове, които съответстват на бранд идентичността на ресторанта. Промените се визуализират в реално време.',
          body: '',
        },
        ro: {
          title:
            'Alegeti o Schema de culori folosind editorul vizual. Selectati culorile primare, de accent si de fundal care corespund identitatii de brand a restaurantului. Modificarile se previzualizeaza in timp real.',
          body: '',
        },
      },
      {
        itemKey: 'guide-step-2',
        en: {
          title:
            'Pick a Typography preset from the font picker. Choose heading and body fonts that complement your brand. Google Fonts are loaded automatically for customers.',
          body: '',
        },
        bg: {
          title:
            'Изберете Типография от списъка с шрифтове. Изберете шрифтове за заглавия и основен текст, които допълват вашия бранд. Google Fonts се зареждат автоматично за клиентите.',
          body: '',
        },
        ro: {
          title:
            'Alegeti o setare de Tipografie din selectorul de fonturi. Alegeti fonturi pentru titluri si corp de text care completeaza brandul. Google Fonts sunt incarcate automat pentru clienti.',
          body: '',
        },
      },
      {
        itemKey: 'guide-step-3',
        en: {
          title:
            'Preview your complete brand on the 3D device mockup. Check how your menu looks on phone, tablet, and desktop screens before publishing.',
          body: '',
        },
        bg: {
          title:
            'Прегледайте пълния си бранд на 3D макета на устройството. Проверете как изглежда менюто ви на телефон, таблет и десктоп екрани, преди да публикувате.',
          body: '',
        },
        ro: {
          title:
            'Previzualizati brandul complet pe macheta 3D a dispozitivului. Verificati cum arata meniul pe ecranele de telefon, tableta si desktop inainte de publicare.',
          body: '',
        },
      },
      {
        itemKey: 'guide-tip',
        en: {
          title:
            'Use the color scheme editor to maintain consistent branding across all customer touchpoints including the menu, checkout, and loyalty screens.',
          body: '',
        },
        bg: {
          title:
            'Използвайте редактора на цветова схема, за да поддържате последователно брандиране във всички точки на контакт с клиента, включително менюто, плащането и екраните за лоялност.',
          body: '',
        },
        ro: {
          title:
            'Utilizati editorul de scheme de culori pentru a mentine un branding consistent in toate punctele de contact cu clientii, inclusiv meniul, plata si ecranele de loialitate.',
          body: '',
        },
      },
      {
        itemKey: 'faq-1',
        en: {
          title: 'Can I customize the colors and fonts of my public menu?',
          body: 'Yes. Navigate to Settings > Branding to access the Color Scheme Editor and Font Picker. You can set primary colors, accent colors, background tones, and font families. All changes preview in real-time on a 3D device mockup before publishing.',
        },
        bg: {
          title:
            'Мога ли да персонализирам цветовете и шрифтовете на публичното си меню?',
          body: 'Да. Навигирайте до Настройки > Брандиране, за да достъпите Редактора на цветова схема и Избора на шрифтове. Можете да зададете основни цветове, акцентни цветове, фонови тонове и семейства шрифтове. Всички промени се визуализират в реално време на 3D макет на устройството, преди да публикувате.',
        },
        ro: {
          title: 'Pot personaliza culorile si fonturile meniului meu public?',
          body: 'Da. Navigati la Setari > Branding pentru a accesa Editorul de scheme de culori si Selectorul de fonturi. Puteti seta culori primare, culori de accent, tonuri de fundal si familii de fonturi. Toate modificarile se previzualizeaza in timp real pe o macheta 3D a dispozitivului inainte de publicare.',
        },
      },
      {
        itemKey: 'faq-2',
        en: {
          title:
            'How do I upload my restaurant logo for QR codes and the public menu?',
          body: 'In Settings > Branding, click the logo upload area to select an image file. PNG, JPG, or SVG formats are recommended. The logo is displayed on printed QR code cards, the public menu header, and the restaurant profile. For best results, use a square image with at least 512x512 pixels.',
        },
        bg: {
          title:
            'Как да кача логото на ресторанта за QR кодовете и публичното меню?',
          body: 'В Настройки > Брандиране кликнете върху зоната за качване на лого, за да изберете файл с изображение. Препоръчват се формати PNG, JPG или SVG. Логото се показва на разпечатани карти с QR кодове, заглавието на публичното меню и профила на ресторанта. За най-добри резултати използвайте квадратно изображение с поне 512x512 пиксела.',
        },
        ro: {
          title:
            'Cum incarc logo-ul restaurantului pentru codurile QR si meniul public?',
          body: 'In Setari > Branding, faceti clic pe zona de incarcare a logo-ului pentru a selecta un fisier imagine. Se recomanda formatele PNG, JPG sau SVG. Logo-ul este afisat pe cardurile QR imprimate, antetul meniului public si profilul restaurantului. Pentru cele mai bune rezultate, utilizati o imagine patrata cu cel putin 512x512 pixeli.',
        },
      },
    ],
  },
  {
    categoryKey: 'importExportHelp',
    items: [
      {
        itemKey: 'category-meta',
        en: { title: 'FileText', body: 'Import & Export' },
        bg: { title: 'FileText', body: 'Импорт и експорт' },
        ro: { title: 'FileText', body: 'Import si export' },
      },
      {
        itemKey: 'guide-title',
        en: { title: 'Importing and Exporting Your Menu', body: '' },
        bg: { title: 'Импортиране и експортиране на менюто', body: '' },
        ro: { title: 'Importarea si exportarea meniului', body: '' },
      },
      {
        itemKey: 'guide-desc',
        en: {
          title:
            'Transfer menu data between accounts, create backups, and connect external OCR digitization tools.',
          body: '',
        },
        bg: {
          title:
            'Прехвърляйте данни от менюта между акаунти, създавайте резервни копия и свързвайте външни OCR инструменти за дигитализация.',
          body: '',
        },
        ro: {
          title:
            'Transferati date de meniu intre conturi, creati copii de siguranta si conectati instrumente externe de digitalizare OCR.',
          body: '',
        },
      },
      {
        itemKey: 'guide-step-0',
        en: {
          title:
            'Navigate to the Import/Export tab in your dashboard to access all menu data transfer tools.',
          body: '',
        },
        bg: {
          title:
            'Навигирайте до раздел Импорт/Експорт в таблото, за да достъпите всички инструменти за трансфер на данни от менюто.',
          body: '',
        },
        ro: {
          title:
            'Navigati la fila Import/Export din panoul de control pentru a accesa toate instrumentele de transfer de date ale meniului.',
          body: '',
        },
      },
      {
        itemKey: 'guide-step-1',
        en: {
          title:
            'To export your menu, click Export and choose JSON (full data including options and translations) or CSV (flat table format compatible with Excel).',
          body: '',
        },
        bg: {
          title:
            'За да експортирате менюто си, кликнете Експорт и изберете JSON (пълни данни, включително опции и преводи) или CSV (плосък табличен формат, съвместим с Excel).',
          body: '',
        },
        ro: {
          title:
            'Pentru a exporta meniul, faceti clic pe Export si alegeti JSON (date complete inclusiv optiuni si traduceri) sau CSV (format tabelar plat compatibil cu Excel).',
          body: '',
        },
      },
      {
        itemKey: 'guide-step-2',
        en: {
          title:
            'To import a menu, click Import and upload a JSON file from a previous export or from the OCR digitization tool. Preview the items before confirming.',
          body: '',
        },
        bg: {
          title:
            'За да импортирате меню, кликнете Импорт и качете JSON файл от предишен експорт или от OCR инструмента за дигитализация. Прегледайте артикулите, преди да потвърдите.',
          body: '',
        },
        ro: {
          title:
            'Pentru a importa un meniu, faceti clic pe Import si incarcati un fisier JSON dintr-un export anterior sau din instrumentul de digitalizare OCR. Previzualizati articolele inainte de confirmare.',
          body: '',
        },
      },
      {
        itemKey: 'guide-step-3',
        en: {
          title:
            'Use the OCR API Key to connect external menu scanning tools. The key authenticates direct pushes from the offline OCR tool into your restaurant menu.',
          body: '',
        },
        bg: {
          title:
            'Използвайте OCR API ключа, за да свържете външни инструменти за сканиране на менюта. Ключът удостоверява директни изпращания от офлайн OCR инструмента към менюто на ресторанта.',
          body: '',
        },
        ro: {
          title:
            'Utilizati Cheia API OCR pentru a conecta instrumente externe de scanare a meniurilor. Cheia autentifica trimiteri directe din instrumentul OCR offline in meniul restaurantului.',
          body: '',
        },
      },
      {
        itemKey: 'guide-tip',
        en: {
          title:
            'Always export a backup before performing a large import. This lets you restore your previous menu if anything goes wrong.',
          body: '',
        },
        bg: {
          title:
            'Винаги експортирайте резервно копие, преди да извършите голям импорт. Това ви позволява да възстановите предишното си меню, ако нещо се обърка.',
          body: '',
        },
        ro: {
          title:
            'Exportati intotdeauna o copie de siguranta inainte de a efectua un import mare. Acest lucru va permite sa restaurati meniul anterior daca ceva nu merge bine.',
          body: '',
        },
      },
      {
        itemKey: 'guide-warning',
        en: {
          title:
            'Importing a menu creates new items and categories. It does not delete existing items. Duplicate item names within the same category will be created as separate entries.',
          body: '',
        },
        bg: {
          title:
            'Импортирането на меню създава нови артикули и категории. То не изтрива съществуващи артикули. Дублиращи се имена на артикули в една и съща категория ще бъдат създадени като отделни записи.',
          body: '',
        },
        ro: {
          title:
            'Importarea unui meniu creeaza articole si categorii noi. Nu sterge articolele existente. Numele duplicate de articole din aceeasi categorie vor fi create ca intrari separate.',
          body: '',
        },
      },
      {
        itemKey: 'faq-1',
        en: {
          title: 'What file formats are supported for menu import?',
          body: 'The platform supports JSON and CSV file imports. JSON preserves the full menu structure including categories, items, options, prices, descriptions, tags, and translations. CSV is a flat format with one row per item, suitable for spreadsheet editing. Both formats can be exported and re-imported.',
        },
        bg: {
          title: 'Какви файлови формати се поддържат за импорт на меню?',
          body: 'Платформата поддържа импорт на файлове в JSON и CSV формат. JSON запазва пълната структура на менюто, включително категории, артикули, опции, цени, описания, тагове и преводи. CSV е плосък формат с един ред на артикул, подходящ за редактиране в таблици. И двата формата могат да бъдат експортирани и реимпортирани.',
        },
        ro: {
          title:
            'Ce formate de fisiere sunt acceptate pentru importul meniului?',
          body: 'Platforma suporta importul de fisiere JSON si CSV. JSON pastreaza structura completa a meniului, inclusiv categorii, articole, optiuni, preturi, descrieri, etichete si traduceri. CSV este un format plat cu un rand per articol, potrivit pentru editare in foi de calcul. Ambele formate pot fi exportate si reimportate.',
        },
      },
      {
        itemKey: 'faq-2',
        en: {
          title: 'Will importing a menu overwrite my existing items?',
          body: 'No. Menu imports are additive. New categories and items are created alongside your existing menu. If a category with the same name already exists, new items are added to it. Existing items are never deleted or overwritten during import.',
        },
        bg: {
          title:
            'Ще презапише ли импортирането на меню съществуващите ми артикули?',
          body: 'Не. Импортирането на менюта е добавящо. Новите категории и артикули се създават заедно със съществуващото ви меню. Ако категория със същото име вече съществува, новите артикули се добавят към нея. Съществуващите артикули никога не се изтриват или презаписват при импорт.',
        },
        ro: {
          title:
            'Importarea unui meniu va suprascrie articolele mele existente?',
          body: 'Nu. Importurile de meniuri sunt aditive. Categoriile si articolele noi sunt create alaturi de meniul existent. Daca o categorie cu acelasi nume exista deja, articolele noi sunt adaugate la ea. Articolele existente nu sunt niciodata sterse sau suprascrise in timpul importului.',
        },
      },
    ],
  },
  {
    categoryKey: 'feedback',
    items: [
      {
        itemKey: 'category-meta',
        en: { title: 'MessageSquare', body: 'Feedback & Reviews' },
        bg: { title: 'MessageSquare', body: 'Обратна връзка и отзиви' },
        ro: { title: 'MessageSquare', body: 'Feedback si recenzii' },
      },
      {
        itemKey: 'guide-title',
        en: { title: 'Managing Customer Feedback and Reviews', body: '' },
        bg: {
          title: 'Управление на обратната връзка и отзивите от клиенти',
          body: '',
        },
        ro: {
          title: 'Gestionarea feedback-ului si recenziilor clientilor',
          body: '',
        },
      },
      {
        itemKey: 'guide-desc',
        en: {
          title:
            'Collect optional customer ratings after successful payment, review feedback trends, and offer the same Google review link for every rating.',
          body: '',
        },
        bg: {
          title:
            'Събирайте оценки от клиенти по желание след успешно плащане, преглеждайте тенденциите в обратната връзка и предлагайте един и същ линк за отзив в Google при всяка оценка.',
          body: '',
        },
        ro: {
          title:
            'Colectati optional evaluari dupa plata reusita, analizati tendintele de feedback si oferiti acelasi link de recenzie Google pentru fiecare evaluare.',
          body: '',
        },
      },
      {
        itemKey: 'guide-step-0',
        en: {
          title:
            'After successful payment, customers can optionally rate their experience on a 5-star scale and leave a text comment once their food has been served.',
          body: '',
        },
        bg: {
          title:
            'След успешно плащане клиентите могат по желание да оценят преживяването си по 5-звездна скала и да оставят текстов коментар, след като храната им е сервирана.',
          body: '',
        },
        ro: {
          title:
            'Dupa plata reusita, clientii isi pot evalua optional experienta pe o scara de 5 stele si pot lasa un comentariu dupa ce mancarea a fost servita.',
          body: '',
        },
      },
      {
        itemKey: 'guide-step-1',
        en: {
          title:
            'View all feedback entries in the Feedback tab. Filter by star rating, date range, or search by comment text to identify trends and issues.',
          body: '',
        },
        bg: {
          title:
            'Прегледайте всички записи с обратна връзка в раздел Обратна връзка. Филтрирайте по звездна оценка, период или търсете по текст на коментари, за да идентифицирате тенденции и проблеми.',
          body: '',
        },
        ro: {
          title:
            'Vizualizati toate intrarile de feedback in fila Feedback. Filtrati dupa evaluare cu stele, interval de date sau cautati dupa textul comentariilor pentru a identifica tendinte si probleme.',
          body: '',
        },
      },
      {
        itemKey: 'guide-step-2',
        en: {
          title:
            'Add your Google Business review link to offer every customer the same optional opportunity to share their experience, regardless of their rating.',
          body: '',
        },
        bg: {
          title:
            'Добавете линка за отзиви на вашата Google Business страница, за да предложите на всеки клиент еднаква възможност по желание да сподели преживяването си, независимо от оценката.',
          body: '',
        },
        ro: {
          title:
            'Adaugati linkul de recenzii Google Business pentru a oferi fiecarui client aceeasi optiune de a-si impartasi experienta, indiferent de evaluare.',
          body: '',
        },
      },
      {
        itemKey: 'guide-step-3',
        en: {
          title:
            'Export feedback data to CSV for further analysis. Track customer satisfaction trends over time to measure the impact of menu changes or service improvements.',
          body: '',
        },
        bg: {
          title:
            'Експортирайте данните от обратната връзка в CSV за допълнителен анализ. Проследявайте тенденциите в удовлетвореността на клиентите във времето, за да измерите въздействието на промени в менюто или подобрения в обслужването.',
          body: '',
        },
        ro: {
          title:
            'Exportati datele de feedback in CSV pentru analiza suplimentara. Urmariti tendintele de satisfactie a clientilor in timp pentru a masura impactul modificarilor de meniu sau al imbunatatirilor de servicii.',
          body: '',
        },
      },
      {
        itemKey: 'guide-tip',
        en: {
          title:
            'Respond promptly to negative feedback. Customers who feel heard are more likely to return. Use feedback data to identify and fix recurring issues.',
          body: '',
        },
        bg: {
          title:
            'Реагирайте бързо на негативната обратна връзка. Клиентите, които се чувстват чути, е по-вероятно да се върнат. Използвайте данните от обратната връзка, за да идентифицирате и отстраните повтарящи се проблеми.',
          body: '',
        },
        ro: {
          title:
            'Raspundeti prompt la feedback-ul negativ. Clientii care se simt ascultati sunt mai predispusi sa revina. Utilizati datele de feedback pentru a identifica si remedia problemele recurente.',
          body: '',
        },
      },
      {
        itemKey: 'faq-1',
        en: {
          title: 'How do customers leave feedback after their meal?',
          body: 'After successful payment, the payment confirmation page offers an optional feedback form once the food has been served. Customers select a star rating from 1 to 5 and can optionally write a text comment. The app asks only once per guest visit.',
        },
        bg: {
          title: 'Как клиентите оставят обратна връзка след храненето си?',
          body: 'След успешно плащане страницата за потвърждение предлага форма за обратна връзка по желание, когато храната е сервирана. Клиентите избират оценка от 1 до 5 звезди и могат да напишат коментар. Приложението пита само веднъж за всяко посещение на гост.',
        },
        ro: {
          title: 'Cum lasa clientii feedback dupa masa?',
          body: 'Dupa plata reusita, pagina de confirmare ofera un formular optional de feedback dupa ce mancarea a fost servita. Clientii selecteaza o evaluare de la 1 la 5 stele si pot scrie un comentariu. Aplicatia intreaba o singura data pentru fiecare vizita.',
        },
      },
      {
        itemKey: 'faq-2',
        en: {
          title: 'Can I offer customers a link to leave a Google review?',
          body: 'Yes. In Settings, add your Google Business review URL. After submitting in-app feedback, every customer sees the same optional link to share their experience on Google, regardless of the rating they selected.',
        },
        bg: {
          title: 'Мога ли да предложа на клиентите линк за отзив в Google?',
          body: 'Да. В Настройки добавете URL адреса за отзиви на вашата Google Business страница. След изпращане на обратната връзка в приложението всеки клиент вижда един и същ линк по желание за споделяне на преживяването в Google, независимо от избраната оценка.',
        },
        ro: {
          title: 'Pot oferi clientilor un link pentru o recenzie Google?',
          body: 'Da. In Setari, adaugati URL-ul de recenzii al paginii dvs. Google Business. Dupa trimiterea feedback-ului in aplicatie, fiecare client vede acelasi link optional pentru a-si impartasi experienta pe Google, indiferent de evaluarea aleasa.',
        },
      },
    ],
  },
];

export async function seedHelpContent(prisma: PrismaClient) {
  console.log('Seeding help content...');

  const existing = await prisma.helpContent.count();
  if (existing > 0) {
    console.log(
      `  ${existing} help content rows already exist — skipping seed.`,
    );
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
