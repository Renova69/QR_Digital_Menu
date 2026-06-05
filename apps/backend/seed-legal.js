const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const termsEn = `Welcome to QR Digital Menu.

1. ACCEPTANCE OF TERMS
By accessing and using our service, you accept and agree to be bound by the terms and provision of this agreement.

2. SERVICE DESCRIPTION
QR Digital Menu provides a platform for restaurants to create digital menus, manage orders, and handle customer payments via Stripe.

3. SUBSCRIPTIONS AND BILLING
Some features of the Service are billed on a subscription basis ("Subscriptions"). You will be billed in advance on a recurring and periodic basis (such as monthly or annually).

4. CANCELLATION AND REFUND POLICY
You may cancel your Subscription at any time via the billing portal. Cancellations take effect at the end of the current billing cycle. 
We do not offer prorated refunds for canceled subscriptions. If you made a mistake during checkout, please contact our support team within 24 hours.

5. USER OBLIGATIONS
You are responsible for maintaining the confidentiality of your account and password. You must not use the Service for any illegal or unauthorized purpose.
`;

  const termsBg = `Добре дошли в QR Digital Menu.

1. ПРИЕМАНЕ НА УСЛОВИЯТА
С достъпа и използването на нашата услуга, вие приемате и се съгласявате да бъдете обвързани с условията на това споразумение.

2. ОПИСАНИЕ НА УСЛУГАТА
QR Digital Menu предоставя платформа за ресторанти за създаване на дигитални менюта, управление на поръчки и обработка на плащания на клиенти чрез Stripe.

3. АБОНАМЕНТИ И ТАКСУВАНЕ
Някои функции на Услугата се таксуват на абонаментен принцип ("Абонаменти"). Ще бъдете таксувани предварително на повтаряща се и периодична основа (например месечно или годишно).

4. ПОЛИТИКА ЗА АНУЛИРАНЕ И ВРЪЩАНЕ НА ПАРИ
Можете да анулирате абонамента си по всяко време чрез портала за фактуриране. Анулирането влиза в сила в края на текущия цикъл на фактуриране.
Не предлагаме пропорционално възстановяване на суми за анулирани абонаменти. Ако сте направили грешка по време на плащането, моля, свържете се с нашия екип за поддръжка в рамките на 24 часа.

5. ЗАДЪЛЖЕНИЯ НА ПОТРЕБИТЕЛЯ
Вие сте отговорни за поддържането на поверителността на вашия акаунт и парола. Не трябва да използвате Услугата за каквато и да е незаконна или неоторизирана цел.
`;

  const termsRo = `Bun venit la QR Digital Menu.

1. ACCEPTAREA TERMENILOR
Prin accesarea și utilizarea serviciului nostru, acceptați și sunteți de acord să respectați termenii și prevederile acestui acord.

2. DESCRIEREA SERVICIULUI
QR Digital Menu oferă o platformă pentru restaurante pentru a crea meniuri digitale, a gestiona comenzi și a procesa plăți ale clienților prin Stripe.

3. ABONAMENTE ȘI FACTURARE
Unele funcții ale Serviciului sunt facturate pe bază de abonament ("Abonamente"). Veți fi facturat în avans în mod recurent și periodic (cum ar fi lunar sau anual).

4. POLITICA DE ANULARE ȘI RAMBURSARE
Vă puteți anula Abonamentul în orice moment prin portalul de facturare. Anulările intră în vigoare la sfârșitul ciclului de facturare curent.
Nu oferim rambursări proporționale pentru abonamentele anulate. Dacă ați făcut o greșeală în timpul plății, vă rugăm să contactați echipa noastră de asistență în termen de 24 de ore.

5. OBLIGAȚIILE UTILIZATORULUI
Sunteți responsabil pentru menținerea confidențialității contului și a parolei dumneavoastră. Nu trebuie să utilizați Serviciul în niciun scop ilegal sau neautorizat.
`;

  const privacyEn = `Privacy Policy
Last updated: June 5, 2026

1. INFORMATION WE COLLECT
We collect personal information that you voluntarily provide to us when you register on the Services, express an interest in obtaining information about us or our products and Services, when you participate in activities on the Services, or otherwise when you contact us.

2. HOW WE USE YOUR INFORMATION
We process your personal information for a variety of reasons, depending on how you interact with our Services, including:
- To facilitate account creation and authentication
- To deliver and facilitate delivery of services to the user
- To respond to user inquiries/offer support to users

3. DATA RETENTION
We will only keep your personal information for as long as it is necessary for the purposes set out in this privacy notice, unless a longer retention period is required or permitted by law.

4. YOUR PRIVACY RIGHTS
In some regions (like the EEA, UK, and Canada), you have certain rights under applicable data protection laws. These may include the right (i) to request access and obtain a copy of your personal information, (ii) to request rectification or erasure.
`;

  const privacyBg = `Политика за поверителност
Последна актуализация: 5 юни 2026 г.

1. ИНФОРМАЦИЯ, КОЯТО СЪБИРАМЕ
Ние събираме лична информация, която доброволно ни предоставяте, когато се регистрирате в Услугите, изразявате интерес към получаване на информация за нас или нашите продукти и услуги, когато участвате в дейности в Услугите или когато се свържете с нас.

2. КАК ИЗПОЛЗВАМЕ ВАШАТА ИНФОРМАЦИЯ
Ние обработваме вашата лична информация по различни причини, в зависимост от това как взаимодействате с нашите Услуги, включително:
- За улесняване създаването на акаунт и удостоверяване
- За предоставяне и улесняване предоставянето на услуги на потребителя
- За отговор на запитвания на потребители / предлагане на поддръжка

3. СЪХРАНЕНИЕ НА ДАННИ
Ние ще съхраняваме вашата лична информация само толкова дълго, колкото е необходимо за целите, посочени в тази декларация за поверителност, освен ако не се изисква или разрешава по-дълъг период на съхранение от закона.

4. ВАШИТЕ ПРАВА ЗА ПОВЕРИТЕЛНОСТ
В някои региони (като ЕИП, Обединеното кралство и Канада) имате определени права съгласно приложимите закони за защита на данните. Те могат да включват правото (i) да поискате достъп и да получите копие от вашата лична информация, (ii) да поискате коригиране или изтриване.
`;

  const privacyRo = `Politica de confidențialitate
Ultima actualizare: 5 iunie 2026

1. INFORMAȚIILE PE CARE LE COLECTĂM
Colectăm informații personale pe care ni le furnizați în mod voluntar atunci când vă înregistrați pe Servicii, vă exprimați interesul de a obține informații despre noi sau despre produsele și Serviciile noastre, când participați la activități pe Servicii sau atunci când ne contactați.

2. CUM UTILIZĂM INFORMAȚIILE DVS.
Procesăm informațiile dvs. personale dintr-o varietate de motive, în funcție de modul în care interacționați cu Serviciile noastre, inclusiv:
- Pentru a facilita crearea contului și autentificarea
- Pentru a livra și a facilita furnizarea de servicii către utilizator
- Pentru a răspunde la întrebările utilizatorilor / a oferi asistență

3. PĂSTRAREA DATELOR
Vom păstra informațiile dvs. personale doar atâta timp cât este necesar pentru scopurile stabilite în această notificare de confidențialitate, cu excepția cazului în care legea impune sau permite o perioadă de păstrare mai lungă.

4. DREPTURILE DVS. DE CONFIDENȚIALITATE
În anumite regiuni (precum SEE, Marea Britanie și Canada), aveți anumite drepturi în conformitate cu legile aplicabile privind protecția datelor. Acestea pot include dreptul (i) de a solicita accesul și de a obține o copie a informațiilor dvs. personale, (ii) de a solicita rectificarea sau ștergerea.
`;

  const cookieEn = `Cookie Policy

1. WHAT ARE COOKIES?
Cookies are small data files that are placed on your computer or mobile device when you visit a website. They are widely used by website owners in order to make their websites work, or to work more efficiently, as well as to provide reporting information.

2. WHY DO WE USE COOKIES?
We use first-party and third-party cookies for several reasons. Some cookies are required for technical reasons in order for our Websites to operate, and we refer to these as "essential" or "strictly necessary" cookies (e.g., keeping you logged in).

3. HOW CAN I CONTROL COOKIES?
You have the right to decide whether to accept or reject cookies. You can exercise your cookie rights by setting your preferences in the Cookie Consent Manager. Essential cookies cannot be rejected as they are strictly necessary to provide you with services.
`;

  const cookieBg = `Политика за бисквитките

1. КАКВО СА БИСКВИТКИ?
Бисквитките са малки файлове с данни, които се поставят на вашия компютър или мобилно устройство, когато посетите уебсайт. Те се използват широко от собствениците на уебсайтове, за да накарат техните уебсайтове да работят или да работят по-ефективно, както и за предоставяне на информация за отчитане.

2. ЗАЩО ИЗПОЛЗВАМЕ БИСКВИТКИ?
Ние използваме бисквитки на първи и трети страни по няколко причини. Някои бисквитки са необходими по технически причини, за да работят нашите уебсайтове, и ние ги наричаме "основни" или "строго необходими" бисквитки (например за да ви държат влезли в системата).

3. КАК МОГА ДА КОНТРОЛИРАМ БИСКВИТКИТЕ?
Имате право да решите дали да приемете или отхвърлите бисквитките. Можете да упражните правата си за бисквитки, като зададете предпочитанията си в Мениджъра за съгласие за бисквитки. Основните бисквитки не могат да бъдат отхвърлени, тъй като те са строго необходими за предоставянето на услугите.
`;

  const cookieRo = `Politica privind modulele cookie

1. CE SUNT MODULELE COOKIE?
Modulele cookie sunt mici fișiere de date care sunt plasate pe computerul sau dispozitivul dvs. mobil atunci când vizitați un site web. Acestea sunt utilizate pe scară largă de către proprietarii de site-uri web pentru a face site-urile lor să funcționeze sau să funcționeze mai eficient, precum și pentru a furniza informații de raportare.

2. DE CE UTILIZĂM MODULE COOKIE?
Utilizăm module cookie de la prima parte și de la terțe părți din mai multe motive. Anumite module cookie sunt necesare din motive tehnice pentru ca site-urile noastre să funcționeze și le numim module cookie „esențiale” sau „strict necesare” (de exemplu, pentru a vă menține conectat).

3. CUM POT CONTROLA MODULELE COOKIE?
Aveți dreptul de a decide dacă acceptați sau respingeți modulele cookie. Vă puteți exercita drepturile privind modulele cookie setându-vă preferințele în Managerul de consimțământ pentru module cookie. Modulele cookie esențiale nu pot fi respinse deoarece sunt strict necesare pentru a vă oferi servicii.
`;

  const bannerEn = "We use cookies to ensure you get the best experience on our website. By continuing to use this site, you agree to our use of cookies as described in our Cookie Policy.";
  const bannerBg = "Използваме бисквитки, за да гарантираме, че получавате най-доброто изживяване на нашия уебсайт. Продължавайки да използвате този сайт, вие се съгласявате с използването на бисквитки, както е описано в нашата Политика за бисквитки.";
  const bannerRo = "Utilizăm module cookie pentru a vă asigura că aveți cea mai bună experiență pe site-ul nostru. Prin continuarea utilizării acestui site, sunteți de acord cu utilizarea modulelor cookie așa cum este descris în Politica noastră privind modulele cookie.";

  await prisma.platformSettings.update({
    where: { id: 'singleton' },
    data: {
      termsContent: { en: termsEn, bg: termsBg, ro: termsRo },
      privacyPolicyContent: { en: privacyEn, bg: privacyBg, ro: privacyRo },
      cookiePolicyContent: { en: cookieEn, bg: cookieBg, ro: cookieRo },
      cookieBannerText: { en: bannerEn, bg: bannerBg, ro: bannerRo }
    }
  });

  console.log('Successfully updated the database with multi-lingual legal content (en, bg, ro)!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
