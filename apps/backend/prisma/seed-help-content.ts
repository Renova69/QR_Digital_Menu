// apps/backend/prisma/seed-help-content.ts
import { PrismaClient } from '@prisma/client';

const LANDING_FAQ: Array<{
  itemKey: string;
  en: { title: string; body: string };
  bg: { title: string; body: string };
  ro: { title: string; body: string };
}> = [
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

const DASHBOARD_HELP: Array<{
  categoryKey: string;
  items: Array<{
    itemKey: string;
    en: { title: string; body: string };
    bg: { title: string; body: string };
    ro: { title: string; body: string };
  }>;
}> = [
  {
    categoryKey: 'getting-started',
    items: [
      {
        itemKey: 'create-menu',
        en: { title: 'How do I create my first menu?', body: 'Go to Menu Editor, click "+ Add Category" to create a section (e.g., Appetizers, Main Courses), then click "+ Add Item" within each category. Fill in the item name, description, price, and optional image. Your menu is live immediately.' },
        bg: { title: 'Как да създам първото си меню?', body: 'Отидете в Редактор на меню, натиснете "+ Добави категория" за да създадете секция (напр. Предястия, Основни ястия), след това натиснете "+ Добави артикул" във всяка категория. Попълнете име, описание, цена и по желание снимка. Менюто ви е активно веднага.' },
        ro: { title: 'Cum creez primul meu meniu?', body: 'Mergeți la Editorul de meniu, faceți clic pe "+ Adaugă categorie" pentru a crea o secțiune (de ex., Aperitive, Feluri principale), apoi faceți clic pe "+ Adaugă articol" în fiecare categorie. Completați numele, descrierea, prețul și opțional o imagine. Meniul dvs. este live imediat.' },
      },
      {
        itemKey: 'add-items',
        en: { title: 'How do I add items to a category?', body: 'Expand a category in Menu Editor and click "+ Add Item". Each item needs a name and price. You can also add a description, upload an image, assign dietary tags, and add modifier options (like size or extras).' },
        bg: { title: 'Как да добавя артикули към категория?', body: 'Разгънете категория в Редактора на меню и натиснете "+ Добави артикул". Всеки артикул се нуждае от име и цена. Можете също да добавите описание, снимка, диетични тагове и модификатори (като размер или екстри).' },
        ro: { title: 'Cum adaug articole într-o categorie?', body: 'Extindeți o categorie în Editorul de meniu și faceți clic pe "+ Adaugă articol". Fiecare articol necesită un nume și un preț. Puteți adăuga, de asemenea, o descriere, o imagine, etichete dietetice și opțiuni de modificare (cum ar fi mărimea sau extra).' },
      },
    ],
  },
  {
    categoryKey: 'qr-codes',
    items: [
      {
        itemKey: 'print-qr',
        en: { title: 'How do I print QR codes for my tables?', body: 'Go to Tables in the sidebar. Each table has a "Print QR" button. Choose a template (Classic, Premium, or Minimal), and print on A4 paper. Each QR code is permanently linked to its table — no need to reprint when you update your menu.' },
        bg: { title: 'Как да отпечатам QR кодове за моите маси?', body: 'Отидете в Маси в страничното меню. Всяка маса има бутон "Печат QR". Изберете шаблон (Classic, Premium или Minimal) и отпечатайте на А4. Всеки QR код е трайно свързан с масата си — няма нужда от препечатване при обновяване на менюто.' },
        ro: { title: 'Cum imprim coduri QR pentru mesele mele?', body: 'Mergeți la Mese în bara laterală. Fiecare masă are un buton "Imprimare QR". Alegeți un șablon (Classic, Premium sau Minimal) și imprimați pe hârtie A4. Fiecare cod QR este legat permanent de masa sa — nu este nevoie să reimprimați când actualizați meniul.' },
      },
    ],
  },
  {
    categoryKey: 'orders',
    items: [
      {
        itemKey: 'view-orders',
        en: { title: 'Where do I see incoming orders?', body: 'Active orders appear in the Dashboard under "Live Orders" and also on the Kitchen Display if you have it open. You\'ll hear a notification sound for each new order. Click any order to see its details and update its status.' },
        bg: { title: 'Къде виждам входящите поръчки?', body: 'Активните поръчки се появяват в Таблото под "Поръчки на живо" и също на Кухненския дисплей, ако е отворен. Ще чуете звук за известяване при всяка нова поръчка. Кликнете върху поръчка, за да видите детайли и да обновите статуса.' },
        ro: { title: 'Unde văd comenzile primite?', body: 'Comenzile active apar în Tabloul de bord sub "Comenzi live" și, de asemenea, pe Afișajul de bucătărie dacă îl aveți deschis. Veți auzi un sunet de notificare pentru fiecare comandă nouă. Faceți clic pe orice comandă pentru a vedea detaliile și a actualiza statusul.' },
      },
    ],
  },
  {
    categoryKey: 'payments',
    items: [
      {
        itemKey: 'setup-payments',
        en: { title: 'How do I set up Stripe payments?', body: 'Go to Settings → Payments and click "Connect Stripe". You\'ll be redirected to Stripe to complete onboarding. Once connected, your Stripe status will show as "Active" and customers can pay by card at their table.' },
        bg: { title: 'Как да настроя Stripe плащания?', body: 'Отидете в Настройки → Плащания и натиснете "Свържи Stripe". Ще бъдете пренасочени към Stripe за завършване на регистрацията. След като сте свързани, статусът ви в Stripe ще показва "Активен" и клиентите могат да плащат с карта на масата.' },
        ro: { title: 'Cum configurez plățile Stripe?', body: 'Mergeți la Setări → Plăți și faceți clic pe "Conectează Stripe". Veți fi redirecționat către Stripe pentru a finaliza înregistrarea. Odată conectat, statutul Stripe va apărea ca "Activ", iar clienții pot plăti cu cardul la masă.' },
      },
    ],
  },
  {
    categoryKey: 'loyalty',
    items: [
      {
        itemKey: 'loyalty-setup',
        en: { title: 'How does the loyalty program work?', body: 'Enable loyalty in Settings → Loyalty. Set your earn rate (points per €1 spent) and redeem rate (points needed for €1 discount). Customers automatically earn points on every order. They can redeem points at checkout for discounts. Points expire after 12 months of inactivity.' },
        bg: { title: 'Как работи програмата за лоялност?', body: 'Активирайте лоялността в Настройки → Лоялност. Задайте процент на печалба (точки за €1 похарчени) и процент на осребряване (точки за €1 отстъпка). Клиентите автоматично печелят точки за всяка поръчка. Могат да осребряват точки при плащане за отстъпки. Точките изтичат след 12 месеца неактивност.' },
        ro: { title: 'Cum funcționează programul de loialitate?', body: 'Activați loialitatea în Setări → Loialitate. Setați rata de câștig (puncte per 1€ cheltuit) și rata de răscumpărare (puncte necesare pentru 1€ reducere). Clienții câștigă automat puncte la fiecare comandă. Pot răscumpăra puncte la checkout pentru reduceri. Punctele expiră după 12 luni de inactivitate.' },
      },
    ],
  },
  {
    categoryKey: 'translations',
    items: [
      {
        itemKey: 'translate-menu',
        en: { title: 'How do I translate my menu?', body: 'Go to Settings → Languages and add target languages (English, Bulgarian, Romanian). New items translate automatically via DeepL. Use "Translate All Now" to batch-translate your existing menu. Each item stores its translations in the database, so they persist across edits.' },
        bg: { title: 'Как да преведа менюто си?', body: 'Отидете в Настройки → Езици и добавете целеви езици (английски, български, румънски). Новите артикули се превеждат автоматично чрез DeepL. Използвайте "Преведи всичко сега" за пакетен превод на съществуващото меню. Всеки артикул съхранява преводите си в базата данни.' },
        ro: { title: 'Cum traduc meniul meu?', body: 'Mergeți la Setări → Limbi și adăugați limbile țintă (engleză, bulgară, română). Articolele noi se traduc automat prin DeepL. Utilizați "Traduceți tot acum" pentru traducerea în lot a meniului existent. Fiecare articol își stochează traducerile în baza de date.' },
      },
    ],
  },
  {
    categoryKey: 'troubleshooting',
    items: [
      {
        itemKey: 'orders-not-appearing',
        en: { title: 'Orders are not appearing in my dashboard', body: 'First, check that your restaurant is set to "Active" in Settings. Then verify your internet connection. If orders still don\'t appear, try refreshing the page or logging out and back in. Contact support if the issue persists.' },
        bg: { title: 'Поръчките не се появяват в таблото ми', body: 'Първо проверете дали ресторантът ви е "Активен" в Настройки. След това проверете интернет връзката си. Ако поръчките все още не се появяват, опитайте да опресните страницата или да излезете и влезете отново. Свържете се с поддръжката, ако проблемът продължава.' },
        ro: { title: 'Comenzile nu apar în tabloul meu de bord', body: 'Mai întâi, verificați dacă restaurantul dvs. este setat ca "Activ" în Setări. Apoi verificați conexiunea la internet. Dacă comenzile tot nu apar, încercați să reîmprospătați pagina sau să vă deconectați și reconectați. Contactați suportul dacă problema persistă.' },
      },
    ],
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
