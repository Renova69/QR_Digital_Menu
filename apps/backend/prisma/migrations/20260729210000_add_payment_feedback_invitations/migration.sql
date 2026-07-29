-- Feedback is now collected after a verified payment/visit rather than once
-- per submitted order. Legacy order-linked feedback remains valid.
ALTER TABLE "feedback"
  ALTER COLUMN "orderId" DROP NOT NULL,
  ADD COLUMN "invitationId" TEXT,
  ADD COLUMN "googleReviewClickedAt" TIMESTAMP(3);

CREATE TABLE "feedback_invitation" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "tableSessionId" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "presentedAt" TIMESTAMP(3),
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "feedback_invitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "feedback_invitation_tableSessionId_key"
  ON "feedback_invitation"("tableSessionId");
CREATE INDEX "feedback_invitation_paymentId_idx"
  ON "feedback_invitation"("paymentId");
CREATE INDEX "feedback_invitation_restaurantId_createdAt_idx"
  ON "feedback_invitation"("restaurantId", "createdAt");
CREATE INDEX "feedback_invitation_expiresAt_idx"
  ON "feedback_invitation"("expiresAt");
CREATE UNIQUE INDEX "feedback_invitationId_key"
  ON "feedback"("invitationId");

ALTER TABLE "feedback_invitation"
  ADD CONSTRAINT "feedback_invitation_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "payment"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "feedback_invitation"
  ADD CONSTRAINT "feedback_invitation_tableSessionId_fkey"
  FOREIGN KEY ("tableSessionId") REFERENCES "table_session"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "feedback_invitation"
  ADD CONSTRAINT "feedback_invitation_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "restaurant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "feedback"
  ADD CONSTRAINT "feedback_invitationId_fkey"
  FOREIGN KEY ("invitationId") REFERENCES "feedback_invitation"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep existing seeded help content aligned with the post-payment flow. Match
-- the old seed copy so any administrator-customized content is left untouched.
UPDATE "help_content"
SET "title" = 'Collect optional customer ratings after successful payment, review feedback trends, and offer the same Google review link for every rating.',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "section" = 'dashboard' AND "categoryKey" = 'feedback'
  AND "itemKey" = 'guide-desc' AND "locale" = 'en'
  AND "title" = 'Collect customer ratings after checkout, review feedback trends, and redirect satisfied diners to leave Google reviews.';
UPDATE "help_content"
SET "title" = 'Събирайте оценки от клиенти по желание след успешно плащане, преглеждайте тенденциите в обратната връзка и предлагайте един и същ линк за отзив в Google при всяка оценка.',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "section" = 'dashboard' AND "categoryKey" = 'feedback'
  AND "itemKey" = 'guide-desc' AND "locale" = 'bg'
  AND "title" = 'Събирайте оценки от клиенти след плащане, преглеждайте тенденциите в обратната връзка и насочвайте доволните клиенти да оставят отзиви в Google.';
UPDATE "help_content"
SET "title" = 'Colectati optional evaluari dupa plata reusita, analizati tendintele de feedback si oferiti acelasi link de recenzie Google pentru fiecare evaluare.',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "section" = 'dashboard' AND "categoryKey" = 'feedback'
  AND "itemKey" = 'guide-desc' AND "locale" = 'ro'
  AND "title" = 'Colectati evaluari ale clientilor dupa plata, analizati tendintele de feedback si redirectionati clientii multumiti sa lase recenzii pe Google.';

UPDATE "help_content"
SET "title" = 'After successful payment, customers can optionally rate their experience on a 5-star scale and leave a text comment once their food has been served.',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "section" = 'dashboard' AND "categoryKey" = 'feedback'
  AND "itemKey" = 'guide-step-0' AND "locale" = 'en'
  AND "title" = 'Customer feedback is collected automatically after checkout. Customers rate their experience on a 5-star scale and can leave optional text comments.';
UPDATE "help_content"
SET "title" = 'След успешно плащане клиентите могат по желание да оценят преживяването си по 5-звездна скала и да оставят текстов коментар, след като храната им е сервирана.',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "section" = 'dashboard' AND "categoryKey" = 'feedback'
  AND "itemKey" = 'guide-step-0' AND "locale" = 'bg'
  AND "title" = 'Обратната връзка от клиенти се събира автоматично след плащане. Клиентите оценяват преживяването си по 5-звездна скала и могат да оставят текстови коментари по желание.';
UPDATE "help_content"
SET "title" = 'Dupa plata reusita, clientii isi pot evalua optional experienta pe o scara de 5 stele si pot lasa un comentariu dupa ce mancarea a fost servita.',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "section" = 'dashboard' AND "categoryKey" = 'feedback'
  AND "itemKey" = 'guide-step-0' AND "locale" = 'ro'
  AND "title" = 'Feedback-ul clientilor este colectat automat dupa plata. Clientii isi evalueaza experienta pe o scara de 5 stele si pot lasa comentarii text optionale.';

UPDATE "help_content"
SET "title" = 'Add your Google Business review link to offer every customer the same optional opportunity to share their experience, regardless of their rating.',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "section" = 'dashboard' AND "categoryKey" = 'feedback'
  AND "itemKey" = 'guide-step-2' AND "locale" = 'en'
  AND "title" = 'Enable Google Review redirect for satisfied customers. When a customer leaves a 4 or 5 star rating, the system prompts them to share their experience on your Google Business page.';
UPDATE "help_content"
SET "title" = 'Добавете линка за отзиви на вашата Google Business страница, за да предложите на всеки клиент еднаква възможност по желание да сподели преживяването си, независимо от оценката.',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "section" = 'dashboard' AND "categoryKey" = 'feedback'
  AND "itemKey" = 'guide-step-2' AND "locale" = 'bg'
  AND "title" = 'Активирайте пренасочване към Google Reviews за доволни клиенти. Когато клиент остави оценка от 4 или 5 звезди, системата го подканва да сподели преживяването си на вашата Google Business страница.';
UPDATE "help_content"
SET "title" = 'Adaugati linkul de recenzii Google Business pentru a oferi fiecarui client aceeasi optiune de a-si impartasi experienta, indiferent de evaluare.',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "section" = 'dashboard' AND "categoryKey" = 'feedback'
  AND "itemKey" = 'guide-step-2' AND "locale" = 'ro'
  AND "title" = 'Activati redirectionarea catre Google Reviews pentru clientii multumiti. Cand un client lasa o evaluare de 4 sau 5 stele, sistemul il indeamna sa-si impartaseasca experienta pe pagina dvs. Google Business.';

UPDATE "help_content"
SET "body" = 'After successful payment, the payment confirmation page offers an optional feedback form once the food has been served. Customers select a star rating from 1 to 5 and can optionally write a text comment. The app asks only once per guest visit.',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "section" = 'dashboard' AND "categoryKey" = 'feedback'
  AND "itemKey" = 'faq-1' AND "locale" = 'en'
  AND "body" = 'After completing an order or paying the bill, customers are automatically prompted with a feedback screen. They select a star rating from 1 to 5 and can optionally write a text comment. Feedback is submitted anonymously unless the customer is logged into their loyalty account.';
UPDATE "help_content"
SET "body" = 'След успешно плащане страницата за потвърждение предлага форма за обратна връзка по желание, когато храната е сервирана. Клиентите избират оценка от 1 до 5 звезди и могат да напишат коментар. Приложението пита само веднъж за всяко посещение на гост.',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "section" = 'dashboard' AND "categoryKey" = 'feedback'
  AND "itemKey" = 'faq-1' AND "locale" = 'bg'
  AND "body" = 'След завършване на поръчка или плащане на сметката, на клиентите автоматично се показва екран за обратна връзка. Те избират звездна оценка от 1 до 5 и могат по желание да напишат текстов коментар. Обратната връзка се изпраща анонимно, освен ако клиентът не е влязъл в акаунта си за лоялност.';
UPDATE "help_content"
SET "body" = 'Dupa plata reusita, pagina de confirmare ofera un formular optional de feedback dupa ce mancarea a fost servita. Clientii selecteaza o evaluare de la 1 la 5 stele si pot scrie un comentariu. Aplicatia intreaba o singura data pentru fiecare vizita.',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "section" = 'dashboard' AND "categoryKey" = 'feedback'
  AND "itemKey" = 'faq-1' AND "locale" = 'ro'
  AND "body" = 'Dupa finalizarea unei comenzi sau plata notei, clientilor li se afiseaza automat un ecran de feedback. Selecteaza o evaluare cu stele de la 1 la 5 si pot scrie optional un comentariu text. Feedback-ul este trimis anonim, cu exceptia cazului in care clientul este autentificat in contul de loialitate.';

UPDATE "help_content"
SET "title" = 'Can I offer customers a link to leave a Google review?',
    "body" = 'Yes. In Settings, add your Google Business review URL. After submitting in-app feedback, every customer sees the same optional link to share their experience on Google, regardless of the rating they selected.',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "section" = 'dashboard' AND "categoryKey" = 'feedback'
  AND "itemKey" = 'faq-2' AND "locale" = 'en'
  AND "title" = 'Can I redirect satisfied customers to leave a Google review?'
  AND "body" = 'Yes. In Settings, add your Google Business review URL. When a customer leaves a 4-star or 5-star rating on the in-app feedback screen, the system shows a follow-up prompt asking if they would like to share their experience on Google. This helps build your online reputation organically.';
UPDATE "help_content"
SET "title" = 'Мога ли да предложа на клиентите линк за отзив в Google?',
    "body" = 'Да. В Настройки добавете URL адреса за отзиви на вашата Google Business страница. След изпращане на обратната връзка в приложението всеки клиент вижда един и същ линк по желание за споделяне на преживяването в Google, независимо от избраната оценка.',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "section" = 'dashboard' AND "categoryKey" = 'feedback'
  AND "itemKey" = 'faq-2' AND "locale" = 'bg'
  AND "title" = 'Мога ли да пренасоча доволните клиенти да оставят отзив в Google?'
  AND "body" = 'Да. В Настройки добавете URL адреса за отзиви на вашата Google Business страница. Когато клиент остави оценка от 4 или 5 звезди на екрана за обратна връзка, системата показва последващо съобщение с предложение да сподели преживяването си в Google. Това помага за органично изграждане на онлайн репутацията ви.';
UPDATE "help_content"
SET "title" = 'Pot oferi clientilor un link pentru o recenzie Google?',
    "body" = 'Da. In Setari, adaugati URL-ul de recenzii al paginii dvs. Google Business. Dupa trimiterea feedback-ului in aplicatie, fiecare client vede acelasi link optional pentru a-si impartasi experienta pe Google, indiferent de evaluarea aleasa.',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "section" = 'dashboard' AND "categoryKey" = 'feedback'
  AND "itemKey" = 'faq-2' AND "locale" = 'ro'
  AND "title" = 'Pot redirectiona clientii multumiti sa lase o recenzie pe Google?'
  AND "body" = 'Da. In Setari, adaugati URL-ul de recenzii al paginii dvs. Google Business. Cand un client lasa o evaluare de 4 sau 5 stele pe ecranul de feedback din aplicatie, sistemul afiseaza o invitatie de urmarire care il intreaba daca doreste sa-si impartaseasca experienta pe Google. Acest lucru ajuta la construirea organica a reputatiei dvs. online.';
