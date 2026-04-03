const fs = require('fs');

// Missing translations per language for the 24 keys
const translations = {
  bg: {
    auth: { passwordMismatch: 'Паролите не съвпадат', registrationComplete: 'Регистрацията е завършена. Проверете имейла си за потвърждение.' },
    buttons: { generatePreview: 'Генериране на визуализация', openBrowser: 'Отвори в браузъра', send: 'Изпрати', sendEmail: 'Изпрати имейл', validateApprove: 'Валидирай и одобри' },
    dashboard: { noMaterialFound: 'Не е намерен материал в ценовите листи', notFoundTitle: 'Не е намерено', quantity: 'Количество', resultsFound: 'Намерени {{count}} резултата. Изберете от кой ценови лист:', searchClient: 'Търсене на клиент...', selectMaterial: 'Избери материал', selectionRequiredMessage: 'Намерени са множество материали. Изберете правилния ценови лист.', selectionRequiredTitle: 'Необходим е избор', unitPrice: 'Единична цена', unknownListino: 'Неизвестен ценови лист' },
    messages: { emailSent: 'Имейлът е изпратен', notAuthenticated: 'Не е удостоверен', permission: 'Разрешение', permissionDescription: 'Необходимо е разрешение за микрофона.' },
    profile: { iban: 'IBAN', vatPercent: 'ДДС %' },
    sections: { description: 'Описание' }
  },
  cs: {
    auth: { passwordMismatch: 'Hesla se neshodují', registrationComplete: 'Registrace dokončena. Zkontrolujte svůj e-mail.' },
    buttons: { generatePreview: 'Generovat náhled', openBrowser: 'Otevřít v prohlížeči', send: 'Odeslat', sendEmail: 'Odeslat e-mail', validateApprove: 'Ověřit a schválit' },
    dashboard: { noMaterialFound: 'V cenících nebyl nalezen žádný materiál', notFoundTitle: 'Nenalezeno', quantity: 'Množství', resultsFound: 'Nalezeno {{count}} výsledků. Vyberte z jakého ceníku:', searchClient: 'Hledat klienta...', selectMaterial: 'Vybrat materiál', selectionRequiredMessage: 'Bylo nalezeno více materiálů. Vyberte správný ceník.', selectionRequiredTitle: 'Výběr je povinný', unitPrice: 'Jednotková cena', unknownListino: 'Neznámý ceník' },
    messages: { emailSent: 'E-mail odeslán', notAuthenticated: 'Neověřen', permission: 'Oprávnění', permissionDescription: 'Je vyžadováno oprávnění mikrofonu.' },
    profile: { iban: 'IBAN', vatPercent: 'DPH %' },
    sections: { description: 'Popis' }
  },
  de: {
    auth: { passwordMismatch: 'Passwörter stimmen nicht überein', registrationComplete: 'Registrierung abgeschlossen. Überprüfen Sie Ihre E-Mail.' },
    buttons: { generatePreview: 'Vorschau generieren', openBrowser: 'Im Browser öffnen', send: 'Senden', sendEmail: 'E-Mail senden', validateApprove: 'Validieren und genehmigen' },
    dashboard: { noMaterialFound: 'Kein Material in den Preislisten gefunden', notFoundTitle: 'Nicht gefunden', quantity: 'Menge', resultsFound: '{{count}} Ergebnisse gefunden. Wählen Sie die Preisliste:', searchClient: 'Kunde suchen...', selectMaterial: 'Material auswählen', selectionRequiredMessage: 'Mehrere Materialien gefunden. Wählen Sie die richtige Preisliste.', selectionRequiredTitle: 'Auswahl erforderlich', unitPrice: 'Stückpreis', unknownListino: 'Unbekannte Preisliste' },
    messages: { emailSent: 'E-Mail gesendet', notAuthenticated: 'Nicht authentifiziert', permission: 'Berechtigung', permissionDescription: 'Mikrofonberechtigung erforderlich.' },
    profile: { iban: 'IBAN', vatPercent: 'MwSt. %' },
    sections: { description: 'Beschreibung' }
  },
  el: {
    auth: { passwordMismatch: 'Οι κωδικοί δεν ταιριάζουν', registrationComplete: 'Η εγγραφή ολοκληρώθηκε. Ελέγξτε το email σας.' },
    buttons: { generatePreview: 'Δημιουργία προεπισκόπησης', openBrowser: 'Άνοιγμα στον browser', send: 'Αποστολή', sendEmail: 'Αποστολή email', validateApprove: 'Επικύρωση και έγκριση' },
    dashboard: { noMaterialFound: 'Δεν βρέθηκε υλικό στους τιμοκαταλόγους', notFoundTitle: 'Δεν βρέθηκε', quantity: 'Ποσότητα', resultsFound: 'Βρέθηκαν {{count}} αποτελέσματα. Επιλέξτε τιμοκατάλογο:', searchClient: 'Αναζήτηση πελάτη...', selectMaterial: 'Επιλογή υλικού', selectionRequiredMessage: 'Βρέθηκαν πολλαπλά υλικά. Επιλέξτε τον σωστό τιμοκατάλογο.', selectionRequiredTitle: 'Απαιτείται επιλογή', unitPrice: 'Τιμή μονάδας', unknownListino: 'Άγνωστος τιμοκατάλογος' },
    messages: { emailSent: 'Το email στάλθηκε', notAuthenticated: 'Μη πιστοποιημένος', permission: 'Άδεια', permissionDescription: 'Απαιτείται άδεια μικροφώνου.' },
    profile: { iban: 'IBAN', vatPercent: 'ΦΠΑ %' },
    sections: { description: 'Περιγραφή' }
  },
  es: {
    auth: { passwordMismatch: 'Las contraseñas no coinciden', registrationComplete: 'Registro completado. Revisa tu correo electrónico.' },
    buttons: { generatePreview: 'Generar vista previa', openBrowser: 'Abrir en el navegador', send: 'Enviar', sendEmail: 'Enviar correo', validateApprove: 'Validar y aprobar' },
    dashboard: { noMaterialFound: 'No se encontró material en las listas de precios', notFoundTitle: 'No encontrado', quantity: 'Cantidad', resultsFound: 'Se encontraron {{count}} resultados. Selecciona la lista de precios:', searchClient: 'Buscar cliente...', selectMaterial: 'Seleccionar material', selectionRequiredMessage: 'Se encontraron múltiples materiales. Selecciona la lista de precios correcta.', selectionRequiredTitle: 'Selección necesaria', unitPrice: 'Precio unitario', unknownListino: 'Lista de precios desconocida' },
    messages: { emailSent: 'Correo enviado', notAuthenticated: 'No autenticado', permission: 'Permiso', permissionDescription: 'Se requiere permiso del micrófono.' },
    profile: { iban: 'IBAN', vatPercent: 'IVA %' },
    sections: { description: 'Descripción' }
  },
  fr: {
    auth: { passwordMismatch: 'Les mots de passe ne correspondent pas', registrationComplete: 'Inscription terminée. Vérifiez votre e-mail.' },
    buttons: { generatePreview: 'Générer un aperçu', openBrowser: 'Ouvrir dans le navigateur', send: 'Envoyer', sendEmail: 'Envoyer un e-mail', validateApprove: 'Valider et approuver' },
    dashboard: { noMaterialFound: 'Aucun matériau trouvé dans les listes de prix', notFoundTitle: 'Non trouvé', quantity: 'Quantité', resultsFound: '{{count}} résultats trouvés. Sélectionnez la liste de prix :', searchClient: 'Rechercher un client...', selectMaterial: 'Sélectionner le matériau', selectionRequiredMessage: 'Plusieurs matériaux trouvés. Sélectionnez la bonne liste de prix.', selectionRequiredTitle: 'Sélection requise', unitPrice: 'Prix unitaire', unknownListino: 'Liste de prix inconnue' },
    messages: { emailSent: 'E-mail envoyé', notAuthenticated: 'Non authentifié', permission: 'Permission', permissionDescription: 'La permission du microphone est requise.' },
    profile: { iban: 'IBAN', vatPercent: 'TVA %' },
    sections: { description: 'Description' }
  },
  hr: {
    auth: { passwordMismatch: 'Lozinke se ne podudaraju', registrationComplete: 'Registracija dovršena. Provjerite svoj e-mail.' },
    buttons: { generatePreview: 'Generiraj pregled', openBrowser: 'Otvori u pregledniku', send: 'Pošalji', sendEmail: 'Pošalji e-mail', validateApprove: 'Provjeri i odobri' },
    dashboard: { noMaterialFound: 'Nema materijala u cjenicima', notFoundTitle: 'Nije pronađeno', quantity: 'Količina', resultsFound: 'Pronađeno {{count}} rezultata. Odaberite cjenik:', searchClient: 'Traži klijenta...', selectMaterial: 'Odaberi materijal', selectionRequiredMessage: 'Pronađeno više materijala. Odaberite ispravan cjenik.', selectionRequiredTitle: 'Potreban odabir', unitPrice: 'Jedinična cijena', unknownListino: 'Nepoznat cjenik' },
    messages: { emailSent: 'E-mail poslan', notAuthenticated: 'Nije autentificiran', permission: 'Dozvola', permissionDescription: 'Potrebna je dozvola za mikrofon.' },
    profile: { iban: 'IBAN', vatPercent: 'PDV %' },
    sections: { description: 'Opis' }
  },
  hu: {
    auth: { passwordMismatch: 'A jelszavak nem egyeznek', registrationComplete: 'Regisztráció kész. Ellenőrizze e-mailjét.' },
    buttons: { generatePreview: 'Előnézet generálása', openBrowser: 'Megnyitás böngészőben', send: 'Küldés', sendEmail: 'E-mail küldése', validateApprove: 'Érvényesítés és jóváhagyás' },
    dashboard: { noMaterialFound: 'Nem található anyag az árlistákban', notFoundTitle: 'Nem található', quantity: 'Mennyiség', resultsFound: '{{count}} eredmény található. Válassza ki az árlistát:', searchClient: 'Ügyfél keresése...', selectMaterial: 'Anyag kiválasztása', selectionRequiredMessage: 'Több anyag található. Válassza ki a megfelelő árlistát.', selectionRequiredTitle: 'Kiválasztás szükséges', unitPrice: 'Egységár', unknownListino: 'Ismeretlen árlista' },
    messages: { emailSent: 'E-mail elküldve', notAuthenticated: 'Nincs hitelesítve', permission: 'Engedély', permissionDescription: 'Mikrofon engedély szükséges.' },
    profile: { iban: 'IBAN', vatPercent: 'ÁFA %' },
    sections: { description: 'Leírás' }
  },
  ja: {
    auth: { passwordMismatch: 'パスワードが一致しません', registrationComplete: '登録完了。メールを確認してください。' },
    buttons: { generatePreview: 'プレビュー生成', openBrowser: 'ブラウザで開く', send: '送信', sendEmail: 'メール送信', validateApprove: '検証して承認' },
    dashboard: { noMaterialFound: '価格表に資材が見つかりません', notFoundTitle: '見つかりません', quantity: '数量', resultsFound: '{{count}}件の結果。価格表を選択してください：', searchClient: '顧客を検索...', selectMaterial: '資材を選択', selectionRequiredMessage: '複数の資材が見つかりました。正しい価格表を選択してください。', selectionRequiredTitle: '選択が必要です', unitPrice: '単価', unknownListino: '不明な価格表' },
    messages: { emailSent: 'メール送信済み', notAuthenticated: '未認証', permission: '許可', permissionDescription: 'マイクの許可が必要です。' },
    profile: { iban: 'IBAN', vatPercent: '消費税 %' },
    sections: { description: '説明' }
  },
  ko: {
    auth: { passwordMismatch: '비밀번호가 일치하지 않습니다', registrationComplete: '등록 완료. 이메일을 확인하세요.' },
    buttons: { generatePreview: '미리보기 생성', openBrowser: '브라우저에서 열기', send: '보내기', sendEmail: '이메일 보내기', validateApprove: '검증 및 승인' },
    dashboard: { noMaterialFound: '가격표에서 자재를 찾을 수 없습니다', notFoundTitle: '찾을 수 없음', quantity: '수량', resultsFound: '{{count}}개의 결과. 가격표를 선택하세요:', searchClient: '고객 검색...', selectMaterial: '자재 선택', selectionRequiredMessage: '여러 자재가 발견되었습니다. 올바른 가격표를 선택하세요.', selectionRequiredTitle: '선택 필요', unitPrice: '단가', unknownListino: '알 수 없는 가격표' },
    messages: { emailSent: '이메일 전송됨', notAuthenticated: '인증되지 않음', permission: '권한', permissionDescription: '마이크 권한이 필요합니다.' },
    profile: { iban: 'IBAN', vatPercent: '부가세 %' },
    sections: { description: '설명' }
  },
  nl: {
    auth: { passwordMismatch: 'Wachtwoorden komen niet overeen', registrationComplete: 'Registratie voltooid. Controleer uw e-mail.' },
    buttons: { generatePreview: 'Voorbeeld genereren', openBrowser: 'Openen in browser', send: 'Verzenden', sendEmail: 'E-mail verzenden', validateApprove: 'Valideren en goedkeuren' },
    dashboard: { noMaterialFound: 'Geen materiaal gevonden in de prijslijsten', notFoundTitle: 'Niet gevonden', quantity: 'Aantal', resultsFound: '{{count}} resultaten gevonden. Selecteer de prijslijst:', searchClient: 'Klant zoeken...', selectMaterial: 'Materiaal selecteren', selectionRequiredMessage: 'Meerdere materialen gevonden. Selecteer de juiste prijslijst.', selectionRequiredTitle: 'Selectie vereist', unitPrice: 'Eenheidsprijs', unknownListino: 'Onbekende prijslijst' },
    messages: { emailSent: 'E-mail verzonden', notAuthenticated: 'Niet geverifieerd', permission: 'Toestemming', permissionDescription: 'Microfoontoestemming is vereist.' },
    profile: { iban: 'IBAN', vatPercent: 'BTW %' },
    sections: { description: 'Beschrijving' }
  },
  pl: {
    auth: { passwordMismatch: 'Hasła nie są identyczne', registrationComplete: 'Rejestracja zakończona. Sprawdź swój e-mail.' },
    buttons: { generatePreview: 'Generuj podgląd', openBrowser: 'Otwórz w przeglądarce', send: 'Wyślij', sendEmail: 'Wyślij e-mail', validateApprove: 'Zatwierdź i zaakceptuj' },
    dashboard: { noMaterialFound: 'Nie znaleziono materiału w cennikach', notFoundTitle: 'Nie znaleziono', quantity: 'Ilość', resultsFound: 'Znaleziono {{count}} wyników. Wybierz cennik:', searchClient: 'Szukaj klienta...', selectMaterial: 'Wybierz materiał', selectionRequiredMessage: 'Znaleziono wiele materiałów. Wybierz właściwy cennik.', selectionRequiredTitle: 'Wymagany wybór', unitPrice: 'Cena jednostkowa', unknownListino: 'Nieznany cennik' },
    messages: { emailSent: 'E-mail wysłany', notAuthenticated: 'Nie uwierzytelniony', permission: 'Uprawnienie', permissionDescription: 'Wymagane uprawnienie do mikrofonu.' },
    profile: { iban: 'IBAN', vatPercent: 'VAT %' },
    sections: { description: 'Opis' }
  },
  pt: {
    auth: { passwordMismatch: 'As senhas não coincidem', registrationComplete: 'Registo concluído. Verifique o seu e-mail.' },
    buttons: { generatePreview: 'Gerar pré-visualização', openBrowser: 'Abrir no navegador', send: 'Enviar', sendEmail: 'Enviar e-mail', validateApprove: 'Validar e aprovar' },
    dashboard: { noMaterialFound: 'Nenhum material encontrado nas listas de preços', notFoundTitle: 'Não encontrado', quantity: 'Quantidade', resultsFound: '{{count}} resultados encontrados. Selecione a lista de preços:', searchClient: 'Pesquisar cliente...', selectMaterial: 'Selecionar material', selectionRequiredMessage: 'Vários materiais encontrados. Selecione a lista de preços correta.', selectionRequiredTitle: 'Seleção necessária', unitPrice: 'Preço unitário', unknownListino: 'Lista de preços desconhecida' },
    messages: { emailSent: 'E-mail enviado', notAuthenticated: 'Não autenticado', permission: 'Permissão', permissionDescription: 'Permissão do microfone é necessária.' },
    profile: { iban: 'IBAN', vatPercent: 'IVA %' },
    sections: { description: 'Descrição' }
  },
  ro: {
    auth: { passwordMismatch: 'Parolele nu se potrivesc', registrationComplete: 'Înregistrare finalizată. Verificați e-mailul.' },
    buttons: { generatePreview: 'Generează previzualizare', openBrowser: 'Deschide în browser', send: 'Trimite', sendEmail: 'Trimite e-mail', validateApprove: 'Validează și aprobă' },
    dashboard: { noMaterialFound: 'Nu s-a găsit material în listele de prețuri', notFoundTitle: 'Negăsit', quantity: 'Cantitate', resultsFound: '{{count}} rezultate găsite. Selectați lista de prețuri:', searchClient: 'Caută client...', selectMaterial: 'Selectează material', selectionRequiredMessage: 'S-au găsit mai multe materiale. Selectați lista de prețuri corectă.', selectionRequiredTitle: 'Selecție necesară', unitPrice: 'Preț unitar', unknownListino: 'Listă de prețuri necunoscută' },
    messages: { emailSent: 'E-mail trimis', notAuthenticated: 'Neautentificat', permission: 'Permisiune', permissionDescription: 'Este necesară permisiunea microfonului.' },
    profile: { iban: 'IBAN', vatPercent: 'TVA %' },
    sections: { description: 'Descriere' }
  },
  ru: {
    auth: { passwordMismatch: 'Пароли не совпадают', registrationComplete: 'Регистрация завершена. Проверьте вашу почту.' },
    buttons: { generatePreview: 'Сгенерировать превью', openBrowser: 'Открыть в браузере', send: 'Отправить', sendEmail: 'Отправить email', validateApprove: 'Проверить и утвердить' },
    dashboard: { noMaterialFound: 'Материал не найден в прайс-листах', notFoundTitle: 'Не найдено', quantity: 'Количество', resultsFound: 'Найдено {{count}} результатов. Выберите прайс-лист:', searchClient: 'Поиск клиента...', selectMaterial: 'Выбрать материал', selectionRequiredMessage: 'Найдено несколько материалов. Выберите правильный прайс-лист.', selectionRequiredTitle: 'Необходим выбор', unitPrice: 'Цена за единицу', unknownListino: 'Неизвестный прайс-лист' },
    messages: { emailSent: 'Email отправлен', notAuthenticated: 'Не аутентифицирован', permission: 'Разрешение', permissionDescription: 'Требуется разрешение на микрофон.' },
    profile: { iban: 'IBAN', vatPercent: 'НДС %' },
    sections: { description: 'Описание' }
  },
  sk: {
    auth: { passwordMismatch: 'Heslá sa nezhodujú', registrationComplete: 'Registrácia dokončená. Skontrolujte svoj e-mail.' },
    buttons: { generatePreview: 'Generovať náhľad', openBrowser: 'Otvoriť v prehliadači', send: 'Odoslať', sendEmail: 'Odoslať e-mail', validateApprove: 'Overiť a schváliť' },
    dashboard: { noMaterialFound: 'V cenníkoch sa nenašiel žiadny materiál', notFoundTitle: 'Nenájdené', quantity: 'Množstvo', resultsFound: 'Nájdených {{count}} výsledkov. Vyberte cenník:', searchClient: 'Hľadať klienta...', selectMaterial: 'Vybrať materiál', selectionRequiredMessage: 'Nájdených viac materiálov. Vyberte správny cenník.', selectionRequiredTitle: 'Výber je povinný', unitPrice: 'Jednotková cena', unknownListino: 'Neznámy cenník' },
    messages: { emailSent: 'E-mail odoslaný', notAuthenticated: 'Neoverený', permission: 'Oprávnenie', permissionDescription: 'Je vyžadované oprávnenie mikrofónu.' },
    profile: { iban: 'IBAN', vatPercent: 'DPH %' },
    sections: { description: 'Popis' }
  },
  sl: {
    auth: { passwordMismatch: 'Gesli se ne ujemata', registrationComplete: 'Registracija zaključena. Preverite svoj e-mail.' },
    buttons: { generatePreview: 'Ustvari predogled', openBrowser: 'Odpri v brskalniku', send: 'Pošlji', sendEmail: 'Pošlji e-pošto', validateApprove: 'Preveri in odobri' },
    dashboard: { noMaterialFound: 'V cenikih ni najdenega materiala', notFoundTitle: 'Ni najdeno', quantity: 'Količina', resultsFound: 'Najdenih {{count}} rezultatov. Izberite cenik:', searchClient: 'Išči stranko...', selectMaterial: 'Izberi material', selectionRequiredMessage: 'Najdenih več materialov. Izberite pravi cenik.', selectionRequiredTitle: 'Potrebna izbira', unitPrice: 'Cena na enoto', unknownListino: 'Neznan cenik' },
    messages: { emailSent: 'E-pošta poslana', notAuthenticated: 'Ni overjen', permission: 'Dovoljenje', permissionDescription: 'Potrebno je dovoljenje za mikrofon.' },
    profile: { iban: 'IBAN', vatPercent: 'DDV %' },
    sections: { description: 'Opis' }
  },
  uk: {
    auth: { passwordMismatch: 'Паролі не збігаються', registrationComplete: 'Реєстрацію завершено. Перевірте свою пошту.' },
    buttons: { generatePreview: 'Згенерувати попередній перегляд', openBrowser: 'Відкрити в браузері', send: 'Надіслати', sendEmail: 'Надіслати email', validateApprove: 'Перевірити і затвердити' },
    dashboard: { noMaterialFound: 'Матеріал не знайдено в прайс-листах', notFoundTitle: 'Не знайдено', quantity: 'Кількість', resultsFound: 'Знайдено {{count}} результатів. Оберіть прайс-лист:', searchClient: 'Пошук клієнта...', selectMaterial: 'Обрати матеріал', selectionRequiredMessage: 'Знайдено кілька матеріалів. Оберіть правильний прайс-лист.', selectionRequiredTitle: 'Необхідний вибір', unitPrice: 'Ціна за одиницю', unknownListino: 'Невідомий прайс-лист' },
    messages: { emailSent: 'Email надіслано', notAuthenticated: 'Не автентифіковано', permission: 'Дозвіл', permissionDescription: 'Потрібен дозвіл на мікрофон.' },
    profile: { iban: 'IBAN', vatPercent: 'ПДВ %' },
    sections: { description: 'Опис' }
  },
  zh: {
    auth: { passwordMismatch: '密码不匹配', registrationComplete: '注册完成。请查看您的邮箱。' },
    buttons: { generatePreview: '生成预览', openBrowser: '在浏览器中打开', send: '发送', sendEmail: '发送邮件', validateApprove: '验证并批准' },
    dashboard: { noMaterialFound: '在价格表中未找到材料', notFoundTitle: '未找到', quantity: '数量', resultsFound: '找到 {{count}} 个结果。请选择价格表：', searchClient: '搜索客户...', selectMaterial: '选择材料', selectionRequiredMessage: '找到多个材料。请选择正确的价格表。', selectionRequiredTitle: '需要选择', unitPrice: '单价', unknownListino: '未知价格表' },
    messages: { emailSent: '邮件已发送', notAuthenticated: '未认证', permission: '权限', permissionDescription: '需要麦克风权限。' },
    profile: { iban: 'IBAN', vatPercent: '增值税 %' },
    sections: { description: '描述' }
  }
};

function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (typeof source[key] === 'object' && source[key] !== null && typeof target[key] === 'object' && target[key] !== null) {
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

const langs = Object.keys(translations);
for (const lang of langs) {
  const filePath = 'locales/' + lang + '.json';
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  deepMerge(data, translations[lang]);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
  console.log('Updated: ' + filePath);
}

console.log('All done.');
