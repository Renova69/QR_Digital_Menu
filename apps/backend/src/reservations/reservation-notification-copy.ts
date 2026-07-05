import { SUPPORTED_TARGET_LANGUAGE_CODES } from '../restaurants/restaurant-languages';

export type ReservationNotificationKind =
  | 'RECEIVED'
  | 'CONFIRMED'
  | 'DECLINED'
  | 'CANCELLED'
  | 'REMINDER'
  | 'MODIFIED';

export type ReservationNotificationLocale =
  (typeof SUPPORTED_TARGET_LANGUAGE_CODES)[number];

interface NotificationCopy {
  subjects: Record<ReservationNotificationKind, string>;
  messages: Record<ReservationNotificationKind, string>;
  reference: string;
  refShort: string;
  manage: string;
  manageHelp: string;
}

const COPY: Record<ReservationNotificationLocale, NotificationCopy> = {
  en: {
    subjects: {
      RECEIVED: 'Reservation request received — {restaurant}',
      CONFIRMED: 'Reservation confirmed — {restaurant}',
      DECLINED: 'Reservation update — {restaurant}',
      CANCELLED: 'Reservation cancelled — {restaurant}',
      REMINDER: 'Reminder: your reservation tomorrow — {restaurant}',
      MODIFIED: 'Reservation updated — {restaurant}',
    },
    messages: {
      RECEIVED:
        "Hi {name}, we've received your reservation request at <strong>{restaurant}</strong>. We'll confirm shortly — this is not yet a confirmation.",
      CONFIRMED:
        'Hi {name}, your reservation at <strong>{restaurant}</strong> is <strong>confirmed</strong>. See you soon!',
      DECLINED:
        'Hi {name}, unfortunately your reservation request at <strong>{restaurant}</strong> could not be accepted. Please contact us for other options.',
      CANCELLED:
        'Hi {name}, your reservation at <strong>{restaurant}</strong> has been <strong>cancelled</strong>. If this is unexpected, please contact us.',
      REMINDER:
        'Hi {name}, this is a reminder of your reservation at <strong>{restaurant}</strong>. We look forward to seeing you!',
      MODIFIED:
        'Hi {name}, your reservation at <strong>{restaurant}</strong> has been <strong>updated</strong>. Here are your new details:',
    },
    reference: 'Reference',
    refShort: 'Ref',
    manage: 'Manage your reservation',
    manageHelp:
      'Use this private link to change the time, party size, or cancel.',
  },
  bg: {
    subjects: {
      RECEIVED: 'Заявката за резервация е получена — {restaurant}',
      CONFIRMED: 'Резервацията е потвърдена — {restaurant}',
      DECLINED: 'Промяна по резервацията — {restaurant}',
      CANCELLED: 'Резервацията е отменена — {restaurant}',
      REMINDER: 'Напомняне: резервацията ви е утре — {restaurant}',
      MODIFIED: 'Резервацията е променена — {restaurant}',
    },
    messages: {
      RECEIVED:
        'Здравейте, {name}. Получихме заявката ви за резервация в <strong>{restaurant}</strong>. Ще я потвърдим скоро — това все още не е потвърждение.',
      CONFIRMED:
        'Здравейте, {name}. Вашата резервация е потвърдена за <strong>{restaurant}</strong>. До скоро!',
      DECLINED:
        'Здравейте, {name}. За съжаление заявката ви за резервация в <strong>{restaurant}</strong> не може да бъде приета. Свържете се с нас за други възможности.',
      CANCELLED:
        'Здравейте, {name}. Резервацията ви в <strong>{restaurant}</strong> е <strong>отменена</strong>. Ако това е неочаквано, свържете се с нас.',
      REMINDER:
        'Здравейте, {name}. Напомняме ви за резервацията ви в <strong>{restaurant}</strong>. Очакваме ви!',
      MODIFIED:
        'Здравейте, {name}. Вашата резервация в <strong>{restaurant}</strong> беше <strong>променена</strong>. Ето новите данни:',
    },
    reference: 'Референтен номер',
    refShort: 'Реф.',
    manage: 'Управление на резервацията',
    manageHelp:
      'Използвайте тази лична връзка, за да промените часа, броя гости или да отмените.',
  },
  de: {
    subjects: {
      RECEIVED: 'Reservierungsanfrage erhalten — {restaurant}',
      CONFIRMED: 'Reservierung bestätigt — {restaurant}',
      DECLINED: 'Reservierungsaktualisierung — {restaurant}',
      CANCELLED: 'Reservierung storniert — {restaurant}',
      REMINDER: 'Erinnerung: Ihre Reservierung ist morgen — {restaurant}',
      MODIFIED: 'Reservierung aktualisiert — {restaurant}',
    },
    messages: {
      RECEIVED:
        'Hallo {name}, wir haben Ihre Reservierungsanfrage bei <strong>{restaurant}</strong> erhalten. Wir bestätigen sie in Kürze — dies ist noch keine Bestätigung.',
      CONFIRMED:
        'Hallo {name}, Ihre Reservierung bei <strong>{restaurant}</strong> ist <strong>bestätigt</strong>. Bis bald!',
      DECLINED:
        'Hallo {name}, leider konnte Ihre Reservierungsanfrage bei <strong>{restaurant}</strong> nicht angenommen werden. Bitte kontaktieren Sie uns für andere Möglichkeiten.',
      CANCELLED:
        'Hallo {name}, Ihre Reservierung bei <strong>{restaurant}</strong> wurde <strong>storniert</strong>. Falls dies unerwartet ist, kontaktieren Sie uns bitte.',
      REMINDER:
        'Hallo {name}, dies ist eine Erinnerung an Ihre Reservierung bei <strong>{restaurant}</strong>. Wir freuen uns auf Ihren Besuch!',
      MODIFIED:
        'Hallo {name}, Ihre Reservierung bei <strong>{restaurant}</strong> wurde <strong>aktualisiert</strong>. Hier sind Ihre neuen Details:',
    },
    reference: 'Referenz',
    refShort: 'Ref.',
    manage: 'Reservierung verwalten',
    manageHelp:
      'Über diesen privaten Link können Sie Uhrzeit oder Personenzahl ändern oder stornieren.',
  },
  es: {
    subjects: {
      RECEIVED: 'Solicitud de reserva recibida — {restaurant}',
      CONFIRMED: 'Reserva confirmada — {restaurant}',
      DECLINED: 'Actualización de la reserva — {restaurant}',
      CANCELLED: 'Reserva cancelada — {restaurant}',
      REMINDER: 'Recordatorio: tu reserva es mañana — {restaurant}',
      MODIFIED: 'Reserva actualizada — {restaurant}',
    },
    messages: {
      RECEIVED:
        'Hola {name}, hemos recibido tu solicitud de reserva en <strong>{restaurant}</strong>. La confirmaremos en breve; todavía no está confirmada.',
      CONFIRMED:
        'Hola {name}, tu reserva en <strong>{restaurant}</strong> está <strong>confirmada</strong>. ¡Hasta pronto!',
      DECLINED:
        'Hola {name}, lamentablemente no se ha podido aceptar tu solicitud de reserva en <strong>{restaurant}</strong>. Contáctanos para consultar otras opciones.',
      CANCELLED:
        'Hola {name}, tu reserva en <strong>{restaurant}</strong> ha sido <strong>cancelada</strong>. Si no lo esperabas, contáctanos.',
      REMINDER:
        'Hola {name}, te recordamos tu reserva en <strong>{restaurant}</strong>. ¡Te esperamos!',
      MODIFIED:
        'Hola {name}, tu reserva en <strong>{restaurant}</strong> ha sido <strong>actualizada</strong>. Estos son tus nuevos datos:',
    },
    reference: 'Referencia',
    refShort: 'Ref.',
    manage: 'Gestionar la reserva',
    manageHelp:
      'Usa este enlace privado para cambiar la hora, el número de personas o cancelar.',
  },
  fr: {
    subjects: {
      RECEIVED: 'Demande de réservation reçue — {restaurant}',
      CONFIRMED: 'Réservation confirmée — {restaurant}',
      DECLINED: 'Mise à jour de la réservation — {restaurant}',
      CANCELLED: 'Réservation annulée — {restaurant}',
      REMINDER: 'Rappel : votre réservation est demain — {restaurant}',
      MODIFIED: 'Réservation modifiée — {restaurant}',
    },
    messages: {
      RECEIVED:
        "Bonjour {name}, nous avons reçu votre demande de réservation chez <strong>{restaurant}</strong>. Nous la confirmerons bientôt — ce message n'est pas encore une confirmation.",
      CONFIRMED:
        'Bonjour {name}, votre réservation chez <strong>{restaurant}</strong> est <strong>confirmée</strong>. À bientôt !',
      DECLINED:
        "Bonjour {name}, malheureusement votre demande de réservation chez <strong>{restaurant}</strong> n'a pas pu être acceptée. Contactez-nous pour connaître les autres possibilités.",
      CANCELLED:
        'Bonjour {name}, votre réservation chez <strong>{restaurant}</strong> a été <strong>annulée</strong>. Si cela est inattendu, contactez-nous.',
      REMINDER:
        'Bonjour {name}, voici un rappel de votre réservation chez <strong>{restaurant}</strong>. Nous avons hâte de vous accueillir !',
      MODIFIED:
        'Bonjour {name}, votre réservation chez <strong>{restaurant}</strong> a été <strong>modifiée</strong>. Voici vos nouvelles informations :',
    },
    reference: 'Référence',
    refShort: 'Réf.',
    manage: 'Gérer la réservation',
    manageHelp:
      "Utilisez ce lien privé pour modifier l'heure, le nombre de personnes ou annuler.",
  },
  it: {
    subjects: {
      RECEIVED: 'Richiesta di prenotazione ricevuta — {restaurant}',
      CONFIRMED: 'Prenotazione confermata — {restaurant}',
      DECLINED: 'Aggiornamento della prenotazione — {restaurant}',
      CANCELLED: 'Prenotazione cancellata — {restaurant}',
      REMINDER: 'Promemoria: la tua prenotazione è domani — {restaurant}',
      MODIFIED: 'Prenotazione aggiornata — {restaurant}',
    },
    messages: {
      RECEIVED:
        'Ciao {name}, abbiamo ricevuto la tua richiesta di prenotazione presso <strong>{restaurant}</strong>. La confermeremo a breve — non è ancora una conferma.',
      CONFIRMED:
        'Ciao {name}, la tua prenotazione presso <strong>{restaurant}</strong> è <strong>confermata</strong>. A presto!',
      DECLINED:
        'Ciao {name}, purtroppo la tua richiesta di prenotazione presso <strong>{restaurant}</strong> non è stata accettata. Contattaci per altre opzioni.',
      CANCELLED:
        'Ciao {name}, la tua prenotazione presso <strong>{restaurant}</strong> è stata <strong>cancellata</strong>. Se non te lo aspettavi, contattaci.',
      REMINDER:
        'Ciao {name}, questo è un promemoria per la tua prenotazione presso <strong>{restaurant}</strong>. Ti aspettiamo!',
      MODIFIED:
        'Ciao {name}, la tua prenotazione presso <strong>{restaurant}</strong> è stata <strong>aggiornata</strong>. Ecco i tuoi nuovi dettagli:',
    },
    reference: 'Riferimento',
    refShort: 'Rif.',
    manage: 'Gestisci la prenotazione',
    manageHelp:
      "Usa questo link privato per cambiare l'orario, il numero di persone o cancellare.",
  },
  ro: {
    subjects: {
      RECEIVED: 'Cerere de rezervare primită — {restaurant}',
      CONFIRMED: 'Rezervare confirmată — {restaurant}',
      DECLINED: 'Actualizare rezervare — {restaurant}',
      CANCELLED: 'Rezervare anulată — {restaurant}',
      REMINDER: 'Memento: rezervarea ta este mâine — {restaurant}',
      MODIFIED: 'Rezervare actualizată — {restaurant}',
    },
    messages: {
      RECEIVED:
        'Bună, {name}. Am primit cererea ta de rezervare la <strong>{restaurant}</strong>. O vom confirma în curând — aceasta nu este încă o confirmare.',
      CONFIRMED:
        'Bună, {name}. Rezervarea ta la <strong>{restaurant}</strong> este <strong>confirmată</strong>. Pe curând!',
      DECLINED:
        'Bună, {name}. Din păcate, cererea ta de rezervare la <strong>{restaurant}</strong> nu a putut fi acceptată. Contactează-ne pentru alte opțiuni.',
      CANCELLED:
        'Bună, {name}. Rezervarea ta la <strong>{restaurant}</strong> a fost <strong>anulată</strong>. Dacă nu te așteptai la aceasta, contactează-ne.',
      REMINDER:
        'Bună, {name}. Îți reamintim de rezervarea ta la <strong>{restaurant}</strong>. Te așteptăm!',
      MODIFIED:
        'Bună, {name}. Rezervarea ta la <strong>{restaurant}</strong> a fost <strong>actualizată</strong>. Iată noile detalii:',
    },
    reference: 'Referință',
    refShort: 'Ref.',
    manage: 'Gestionează rezervarea',
    manageHelp:
      'Folosește acest link privat pentru a schimba ora, numărul de persoane sau pentru a anula.',
  },
  zh: {
    subjects: {
      RECEIVED: '已收到预订请求 — {restaurant}',
      CONFIRMED: '预订已确认 — {restaurant}',
      DECLINED: '预订状态更新 — {restaurant}',
      CANCELLED: '预订已取消 — {restaurant}',
      REMINDER: '提醒：您的预订在明天 — {restaurant}',
      MODIFIED: '预订已更新 — {restaurant}',
    },
    messages: {
      RECEIVED:
        '您好，{name}。我们已收到您在 <strong>{restaurant}</strong> 的预订请求。我们将尽快确认——目前尚未确认。',
      CONFIRMED:
        '您好，{name}。您在 <strong>{restaurant}</strong> 的预订已<strong>确认</strong>。期待您的光临！',
      DECLINED:
        '您好，{name}。很抱歉，<strong>{restaurant}</strong> 无法接受您的预订请求。请联系我们了解其他选择。',
      CANCELLED:
        '您好，{name}。您在 <strong>{restaurant}</strong> 的预订已<strong>取消</strong>。如果这并非您的预期，请联系我们。',
      REMINDER:
        '您好，{name}。提醒您在 <strong>{restaurant}</strong> 的预订。期待您的光临！',
      MODIFIED:
        '您好，{name}。您在 <strong>{restaurant}</strong> 的预订已<strong>更新</strong>。以下是您的最新信息：',
    },
    reference: '预订编号',
    refShort: '编号',
    manage: '管理预订',
    manageHelp: '使用此私人链接更改时间、人数或取消预订。',
  },
  el: {
    subjects: {
      RECEIVED: 'Το αίτημα κράτησης ελήφθη — {restaurant}',
      CONFIRMED: 'Η κράτηση επιβεβαιώθηκε — {restaurant}',
      DECLINED: 'Ενημέρωση κράτησης — {restaurant}',
      CANCELLED: 'Η κράτηση ακυρώθηκε — {restaurant}',
      REMINDER: 'Υπενθύμιση: η κράτησή σας είναι αύριο — {restaurant}',
      MODIFIED: 'Η κράτηση ενημερώθηκε — {restaurant}',
    },
    messages: {
      RECEIVED:
        'Γεια σας {name}, λάβαμε το αίτημα κράτησής σας στο <strong>{restaurant}</strong>. Θα το επιβεβαιώσουμε σύντομα — δεν αποτελεί ακόμη επιβεβαίωση.',
      CONFIRMED:
        'Γεια σας {name}, η κράτησή σας στο <strong>{restaurant}</strong> έχει <strong>επιβεβαιωθεί</strong>. Τα λέμε σύντομα!',
      DECLINED:
        'Γεια σας {name}, δυστυχώς το αίτημα κράτησής σας στο <strong>{restaurant}</strong> δεν έγινε δεκτό. Επικοινωνήστε μαζί μας για άλλες επιλογές.',
      CANCELLED:
        'Γεια σας {name}, η κράτησή σας στο <strong>{restaurant}</strong> έχει <strong>ακυρωθεί</strong>. Αν αυτό είναι απρόσμενο, επικοινωνήστε μαζί μας.',
      REMINDER:
        'Γεια σας {name}, σας υπενθυμίζουμε την κράτησή σας στο <strong>{restaurant}</strong>. Σας περιμένουμε!',
      MODIFIED:
        'Γεια σας {name}, η κράτησή σας στο <strong>{restaurant}</strong> <strong>ενημερώθηκε</strong>. Τα νέα σας στοιχεία:',
    },
    reference: 'Αριθμός αναφοράς',
    refShort: 'Αρ.',
    manage: 'Διαχείριση κράτησης',
    manageHelp:
      'Χρησιμοποιήστε αυτόν τον ιδιωτικό σύνδεσμο για αλλαγή ώρας, αριθμού ατόμων ή ακύρωση.',
  },
  ja: {
    subjects: {
      RECEIVED: '予約リクエストを受け付けました — {restaurant}',
      CONFIRMED: '予約が確定しました — {restaurant}',
      DECLINED: '予約状況のお知らせ — {restaurant}',
      CANCELLED: '予約がキャンセルされました — {restaurant}',
      REMINDER: '明日のご予約のお知らせ — {restaurant}',
      MODIFIED: 'ご予約内容を更新しました — {restaurant}',
    },
    messages: {
      RECEIVED:
        '{name} 様、<strong>{restaurant}</strong> への予約リクエストを受け付けました。まもなく確認いたします。現時点ではまだ確定していません。',
      CONFIRMED:
        '{name} 様、<strong>{restaurant}</strong> へのご予約が<strong>確定しました</strong>。ご来店をお待ちしております。',
      DECLINED:
        '{name} 様、申し訳ありませんが、<strong>{restaurant}</strong> への予約リクエストをお受けできませんでした。ほかの候補について店舗へお問い合わせください。',
      CANCELLED:
        '{name} 様、<strong>{restaurant}</strong> へのご予約は<strong>キャンセルされました</strong>。お心当たりがない場合は店舗へお問い合わせください。',
      REMINDER:
        '{name} 様、<strong>{restaurant}</strong> へのご予約のお知らせです。ご来店をお待ちしております。',
      MODIFIED:
        '{name} 様、<strong>{restaurant}</strong> へのご予約内容を<strong>更新しました</strong>。新しい内容は次のとおりです：',
    },
    reference: '予約番号',
    refShort: '番号',
    manage: '予約を管理',
    manageHelp:
      'この専用リンクから時間・人数の変更、またはキャンセルができます。',
  },
  ru: {
    subjects: {
      RECEIVED: 'Запрос на бронирование получен — {restaurant}',
      CONFIRMED: 'Бронирование подтверждено — {restaurant}',
      DECLINED: 'Обновление бронирования — {restaurant}',
      CANCELLED: 'Бронирование отменено — {restaurant}',
      REMINDER: 'Напоминание: ваше бронирование завтра — {restaurant}',
      MODIFIED: 'Бронирование обновлено — {restaurant}',
    },
    messages: {
      RECEIVED:
        'Здравствуйте, {name}. Мы получили ваш запрос на бронирование в <strong>{restaurant}</strong>. Скоро мы его подтвердим — это сообщение пока не является подтверждением.',
      CONFIRMED:
        'Здравствуйте, {name}. Ваше бронирование в <strong>{restaurant}</strong> <strong>подтверждено</strong>. До встречи!',
      DECLINED:
        'Здравствуйте, {name}. К сожалению, ваш запрос на бронирование в <strong>{restaurant}</strong> не удалось принять. Свяжитесь с нами, чтобы узнать о других вариантах.',
      CANCELLED:
        'Здравствуйте, {name}. Ваше бронирование в <strong>{restaurant}</strong> <strong>отменено</strong>. Если это произошло неожиданно, свяжитесь с нами.',
      REMINDER:
        'Здравствуйте, {name}. Напоминаем о вашем бронировании в <strong>{restaurant}</strong>. Ждём вас!',
      MODIFIED:
        'Здравствуйте, {name}. Ваше бронирование в <strong>{restaurant}</strong> было <strong>обновлено</strong>. Ваши новые данные:',
    },
    reference: 'Номер брони',
    refShort: '№',
    manage: 'Управлять бронированием',
    manageHelp:
      'Используйте эту личную ссылку, чтобы изменить время, количество гостей или отменить бронирование.',
  },
  ar: {
    subjects: {
      RECEIVED: 'تم استلام طلب الحجز — {restaurant}',
      CONFIRMED: 'تم تأكيد الحجز — {restaurant}',
      DECLINED: 'تحديث الحجز — {restaurant}',
      CANCELLED: 'تم إلغاء الحجز — {restaurant}',
      REMINDER: 'تذكير: حجزك غداً — {restaurant}',
      MODIFIED: 'تم تحديث الحجز — {restaurant}',
    },
    messages: {
      RECEIVED:
        'مرحباً {name}، استلمنا طلب حجزك لدى <strong>{restaurant}</strong>. سنؤكده قريباً — هذه الرسالة ليست تأكيداً بعد.',
      CONFIRMED:
        'مرحباً {name}، تم <strong>تأكيد</strong> حجزك لدى <strong>{restaurant}</strong>. نراك قريباً!',
      DECLINED:
        'مرحباً {name}، للأسف لم نتمكن من قبول طلب حجزك لدى <strong>{restaurant}</strong>. تواصل معنا لمعرفة الخيارات الأخرى.',
      CANCELLED:
        'مرحباً {name}، تم <strong>إلغاء</strong> حجزك لدى <strong>{restaurant}</strong>. إذا لم تكن تتوقع ذلك، فتواصل معنا.',
      REMINDER:
        'مرحباً {name}، نذكّرك بحجزك لدى <strong>{restaurant}</strong>. نتطلع لاستقبالك!',
      MODIFIED:
        'مرحباً {name}، تم <strong>تحديث</strong> حجزك لدى <strong>{restaurant}</strong>. إليك بياناتك الجديدة:',
    },
    reference: 'المرجع',
    refShort: 'المرجع',
    manage: 'إدارة الحجز',
    manageHelp:
      'استخدم هذا الرابط الخاص لتغيير الوقت أو عدد الضيوف أو إلغاء الحجز.',
  },
};

// ── Booking-detail labels (party size, occasion, preferences, seating, notes,
// allergies). Kept in a separate map so the lifecycle COPY above stays a clean
// diff. Occasion values mirror the Prisma `ReservationOccasion` enum (NONE is
// never rendered). Counts are labelled (`Adults: 3`) rather than inflected into
// the noun so no locale needs plural-form handling.
export type ReservationOccasionKey =
  | 'BIRTHDAY'
  | 'ANNIVERSARY'
  | 'BUSINESS'
  | 'FAMILY'
  | 'OTHER';

export interface ReservationDetailLabels {
  guests: string;
  adults: string;
  children: string;
  occasion: string;
  preferences: string;
  seating: string;
  notes: string;
  allergies: string;
  occasions: Record<ReservationOccasionKey, string>;
}

const DETAILS: Record<ReservationNotificationLocale, ReservationDetailLabels> =
  {
    en: {
      guests: 'Guests',
      adults: 'Adults',
      children: 'Children',
      occasion: 'Occasion',
      preferences: 'Preferences',
      seating: 'Preferred area',
      notes: 'Notes',
      allergies: 'Allergies / dietary',
      occasions: {
        BIRTHDAY: 'Birthday',
        ANNIVERSARY: 'Anniversary',
        BUSINESS: 'Business',
        FAMILY: 'Family',
        OTHER: 'Other',
      },
    },
    bg: {
      guests: 'Гости',
      adults: 'Възрастни',
      children: 'Деца',
      occasion: 'Повод',
      preferences: 'Предпочитания',
      seating: 'Предпочитана зона',
      notes: 'Бележки',
      allergies: 'Алергии / диета',
      occasions: {
        BIRTHDAY: 'Рожден ден',
        ANNIVERSARY: 'Годишнина',
        BUSINESS: 'Бизнес',
        FAMILY: 'Семейство',
        OTHER: 'Друго',
      },
    },
    de: {
      guests: 'Gäste',
      adults: 'Erwachsene',
      children: 'Kinder',
      occasion: 'Anlass',
      preferences: 'Präferenzen',
      seating: 'Bevorzugter Bereich',
      notes: 'Anmerkungen',
      allergies: 'Allergien / Ernährung',
      occasions: {
        BIRTHDAY: 'Geburtstag',
        ANNIVERSARY: 'Jahrestag',
        BUSINESS: 'Geschäftlich',
        FAMILY: 'Familie',
        OTHER: 'Sonstiges',
      },
    },
    es: {
      guests: 'Comensales',
      adults: 'Adultos',
      children: 'Niños',
      occasion: 'Ocasión',
      preferences: 'Preferencias',
      seating: 'Zona preferida',
      notes: 'Notas',
      allergies: 'Alergias / dieta',
      occasions: {
        BIRTHDAY: 'Cumpleaños',
        ANNIVERSARY: 'Aniversario',
        BUSINESS: 'Negocios',
        FAMILY: 'Familia',
        OTHER: 'Otro',
      },
    },
    fr: {
      guests: 'Convives',
      adults: 'Adultes',
      children: 'Enfants',
      occasion: 'Occasion',
      preferences: 'Préférences',
      seating: 'Zone préférée',
      notes: 'Remarques',
      allergies: 'Allergies / régime',
      occasions: {
        BIRTHDAY: 'Anniversaire',
        ANNIVERSARY: 'Anniversaire de mariage',
        BUSINESS: 'Affaires',
        FAMILY: 'Famille',
        OTHER: 'Autre',
      },
    },
    it: {
      guests: 'Ospiti',
      adults: 'Adulti',
      children: 'Bambini',
      occasion: 'Occasione',
      preferences: 'Preferenze',
      seating: 'Zona preferita',
      notes: 'Note',
      allergies: 'Allergie / dieta',
      occasions: {
        BIRTHDAY: 'Compleanno',
        ANNIVERSARY: 'Anniversario',
        BUSINESS: 'Lavoro',
        FAMILY: 'Famiglia',
        OTHER: 'Altro',
      },
    },
    ro: {
      guests: 'Oaspeți',
      adults: 'Adulți',
      children: 'Copii',
      occasion: 'Ocazie',
      preferences: 'Preferințe',
      seating: 'Zonă preferată',
      notes: 'Observații',
      allergies: 'Alergii / dietă',
      occasions: {
        BIRTHDAY: 'Zi de naștere',
        ANNIVERSARY: 'Aniversare',
        BUSINESS: 'Afaceri',
        FAMILY: 'Familie',
        OTHER: 'Altele',
      },
    },
    zh: {
      guests: '客人',
      adults: '成人',
      children: '儿童',
      occasion: '场合',
      preferences: '偏好',
      seating: '偏好区域',
      notes: '备注',
      allergies: '过敏 / 饮食',
      occasions: {
        BIRTHDAY: '生日',
        ANNIVERSARY: '纪念日',
        BUSINESS: '商务',
        FAMILY: '家庭',
        OTHER: '其他',
      },
    },
    el: {
      guests: 'Άτομα',
      adults: 'Ενήλικες',
      children: 'Παιδιά',
      occasion: 'Περίσταση',
      preferences: 'Προτιμήσεις',
      seating: 'Προτιμώμενη ζώνη',
      notes: 'Σημειώσεις',
      allergies: 'Αλλεργίες / διατροφή',
      occasions: {
        BIRTHDAY: 'Γενέθλια',
        ANNIVERSARY: 'Επέτειος',
        BUSINESS: 'Επαγγελματικό',
        FAMILY: 'Οικογένεια',
        OTHER: 'Άλλο',
      },
    },
    ja: {
      guests: '人数',
      adults: '大人',
      children: '子供',
      occasion: 'ご利用シーン',
      preferences: 'ご希望',
      seating: '希望エリア',
      notes: '備考',
      allergies: 'アレルギー / 食事制限',
      occasions: {
        BIRTHDAY: '誕生日',
        ANNIVERSARY: '記念日',
        BUSINESS: 'ビジネス',
        FAMILY: '家族',
        OTHER: 'その他',
      },
    },
    ru: {
      guests: 'Гости',
      adults: 'Взрослые',
      children: 'Дети',
      occasion: 'Повод',
      preferences: 'Предпочтения',
      seating: 'Предпочтительная зона',
      notes: 'Примечания',
      allergies: 'Аллергии / питание',
      occasions: {
        BIRTHDAY: 'День рождения',
        ANNIVERSARY: 'Годовщина',
        BUSINESS: 'Деловая встреча',
        FAMILY: 'Семья',
        OTHER: 'Другое',
      },
    },
    ar: {
      guests: 'الضيوف',
      adults: 'البالغون',
      children: 'الأطفال',
      occasion: 'المناسبة',
      preferences: 'التفضيلات',
      seating: 'المنطقة المفضلة',
      notes: 'ملاحظات',
      allergies: 'الحساسية / النظام الغذائي',
      occasions: {
        BIRTHDAY: 'عيد ميلاد',
        ANNIVERSARY: 'ذكرى سنوية',
        BUSINESS: 'عمل',
        FAMILY: 'عائلة',
        OTHER: 'أخرى',
      },
    },
  };

export function getReservationDetailLabels(
  locale: string | null | undefined,
): ReservationDetailLabels {
  return DETAILS[normalizeReservationNotificationLocale(locale)];
}

// ── Terse SMS status lines. The email carries the full lifecycle prose; SMS
// gets a short status phrase to keep the segment count (and cost) down. Kept in
// its own map so the long-form COPY stays untouched.
const SMS_STATUS: Record<
  ReservationNotificationLocale,
  Record<ReservationNotificationKind, string>
> = {
  en: {
    RECEIVED: 'Booking request received',
    CONFIRMED: 'Booking confirmed',
    DECLINED: 'Booking not available',
    CANCELLED: 'Booking cancelled',
    REMINDER: 'Reminder: booking tomorrow',
    MODIFIED: 'Booking updated',
  },
  bg: {
    RECEIVED: 'Заявка за резервация получена',
    CONFIRMED: 'Резервацията е потвърдена',
    DECLINED: 'Резервацията не е възможна',
    CANCELLED: 'Резервацията е отменена',
    REMINDER: 'Напомняне: резервация утре',
    MODIFIED: 'Резервацията е променена',
  },
  de: {
    RECEIVED: 'Reservierungsanfrage erhalten',
    CONFIRMED: 'Reservierung bestätigt',
    DECLINED: 'Reservierung nicht möglich',
    CANCELLED: 'Reservierung storniert',
    REMINDER: 'Erinnerung: Reservierung morgen',
    MODIFIED: 'Reservierung aktualisiert',
  },
  es: {
    RECEIVED: 'Solicitud de reserva recibida',
    CONFIRMED: 'Reserva confirmada',
    DECLINED: 'Reserva no disponible',
    CANCELLED: 'Reserva cancelada',
    REMINDER: 'Recordatorio: reserva mañana',
    MODIFIED: 'Reserva actualizada',
  },
  fr: {
    RECEIVED: 'Demande de réservation reçue',
    CONFIRMED: 'Réservation confirmée',
    DECLINED: 'Réservation indisponible',
    CANCELLED: 'Réservation annulée',
    REMINDER: 'Rappel : réservation demain',
    MODIFIED: 'Réservation modifiée',
  },
  it: {
    RECEIVED: 'Richiesta di prenotazione ricevuta',
    CONFIRMED: 'Prenotazione confermata',
    DECLINED: 'Prenotazione non disponibile',
    CANCELLED: 'Prenotazione annullata',
    REMINDER: 'Promemoria: prenotazione domani',
    MODIFIED: 'Prenotazione aggiornata',
  },
  ro: {
    RECEIVED: 'Cerere de rezervare primită',
    CONFIRMED: 'Rezervare confirmată',
    DECLINED: 'Rezervare indisponibilă',
    CANCELLED: 'Rezervare anulată',
    REMINDER: 'Memento: rezervare mâine',
    MODIFIED: 'Rezervare actualizată',
  },
  zh: {
    RECEIVED: '预订请求已收到',
    CONFIRMED: '预订已确认',
    DECLINED: '预订不可用',
    CANCELLED: '预订已取消',
    REMINDER: '提醒：明天的预订',
    MODIFIED: '预订已更新',
  },
  el: {
    RECEIVED: 'Ελήφθη αίτημα κράτησης',
    CONFIRMED: 'Κράτηση επιβεβαιώθηκε',
    DECLINED: 'Κράτηση μη διαθέσιμη',
    CANCELLED: 'Κράτηση ακυρώθηκε',
    REMINDER: 'Υπενθύμιση: κράτηση αύριο',
    MODIFIED: 'Κράτηση ενημερώθηκε',
  },
  ja: {
    RECEIVED: '予約リクエスト受付',
    CONFIRMED: '予約確定',
    DECLINED: '予約不可',
    CANCELLED: '予約キャンセル',
    REMINDER: '明日のご予約リマインド',
    MODIFIED: '予約更新',
  },
  ru: {
    RECEIVED: 'Запрос на бронирование получен',
    CONFIRMED: 'Бронирование подтверждено',
    DECLINED: 'Бронирование недоступно',
    CANCELLED: 'Бронирование отменено',
    REMINDER: 'Напоминание: бронь завтра',
    MODIFIED: 'Бронирование обновлено',
  },
  ar: {
    RECEIVED: 'تم استلام طلب الحجز',
    CONFIRMED: 'تم تأكيد الحجز',
    DECLINED: 'الحجز غير متاح',
    CANCELLED: 'تم إلغاء الحجز',
    REMINDER: 'تذكير: حجز غداً',
    MODIFIED: 'تم تحديث الحجز',
  },
};

export function getReservationSmsStatus(
  locale: string | null | undefined,
  kind: ReservationNotificationKind,
): string {
  return SMS_STATUS[normalizeReservationNotificationLocale(locale)][kind];
}

export function normalizeReservationNotificationLocale(
  locale: string | null | undefined,
): ReservationNotificationLocale {
  const normalized = (locale ?? '').trim().toLowerCase().split(/[-_]/)[0];
  return (SUPPORTED_TARGET_LANGUAGE_CODES as readonly string[]).includes(
    normalized,
  )
    ? (normalized as ReservationNotificationLocale)
    : 'en';
}

export function getReservationNotificationCopy(
  locale: string | null | undefined,
): NotificationCopy {
  return COPY[normalizeReservationNotificationLocale(locale)];
}
