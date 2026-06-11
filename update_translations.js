const fs = require('fs');
const path = require('path');

const locales = {
  en: {
    payment: {
      sourceYou: "You",
      sourceStaff: "Staff",
      paymentFailed: "Payment failed",
      subtotal: "Subtotal",
      tip: "Tip",
      total: "Total",
      processing: "Processing...",
      pay: "Pay",
      failedToLoad: "Failed to load payment options",
      yourBill: "Your Bill",
      payment: "Payment",
      thankYou: "Thank You",
      loading: "Loading...",
      addTip: "Add a tip",
      noTip: "No tip",
      custom: "Custom",
      tipAmount: "Tip amount",
      continue: "Continue",
      paymentReceived: "Payment received successfully",
      backToMenu: "Back to Menu"
    },
    common: {
      cancel: "Cancel",
      retry: "Retry"
    }
  },
  ro: {
    payment: {
      sourceYou: "Tu",
      sourceStaff: "Personal",
      paymentFailed: "Plata a eșuat",
      subtotal: "Subtotal",
      tip: "Bacșiș",
      total: "Total",
      processing: "Se procesează...",
      pay: "Plătește",
      failedToLoad: "Eroare la încărcarea opțiunilor de plată",
      yourBill: "Nota ta",
      payment: "Plată",
      thankYou: "Mulțumim",
      loading: "Se încarcă...",
      addTip: "Adaugă un bacșiș",
      noTip: "Fără bacșiș",
      custom: "Personalizat",
      tipAmount: "Valoare bacșiș",
      continue: "Continuă",
      paymentReceived: "Plată primită cu succes",
      backToMenu: "Înapoi la Meniu"
    },
    common: {
      cancel: "Anulare",
      retry: "Încearcă din nou"
    }
  },
  bg: {
    payment: {
      sourceYou: "Вие",
      sourceStaff: "Персонал",
      paymentFailed: "Плащането е неуспешно",
      subtotal: "Междинна сума",
      tip: "Бакшиш",
      total: "Общо",
      processing: "Обработка...",
      pay: "Плащане",
      failedToLoad: "Неуспешно зареждане на опциите за плащане",
      yourBill: "Вашата сметка",
      payment: "Плащане",
      thankYou: "Благодарим ви",
      loading: "Зареждане...",
      addTip: "Добавете бакшиш",
      noTip: "Без бакшиш",
      custom: "По избор",
      tipAmount: "Размер на бакшиша",
      continue: "Продължи",
      paymentReceived: "Плащането е получено успешно",
      backToMenu: "Обратно към менюто"
    },
    common: {
      cancel: "Отказ",
      retry: "Опитай отново"
    }
  }
};

const localesDir = path.join(__dirname, 'apps/frontend/src/locales');

for (const [lang, translations] of Object.entries(locales)) {
  const filePath = path.join(localesDir, lang, 'translation.json');
  if (fs.existsSync(filePath)) {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // Ensure root objects exist
    if (!data.payment) data.payment = {};
    if (!data.common) data.common = {};

    // Merge payment keys
    for (const [key, value] of Object.entries(translations.payment)) {
      if (!data.payment[key]) {
        data.payment[key] = value;
      }
    }

    // Merge common keys
    for (const [key, value] of Object.entries(translations.common)) {
      if (!data.common[key]) {
        data.common[key] = value;
      }
    }

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`Updated ${lang}/translation.json`);
  } else {
    console.warn(`File not found: ${filePath}`);
  }
}
