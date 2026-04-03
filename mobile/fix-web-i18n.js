const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'web', 'lib', 'i18n.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Translations to add per language
const missingTranslations = {
  de: {
    messages: null, // already has messages
    dashboard: "{ clients: 'Kunden', jobs: 'Aufträge', details: 'Details: ', newJob: 'Neuer Auftrag', newClient: 'Neuer Kunde', addCost: 'Kosten hinzufügen', addClient: 'Kunden hinzufügen', addJob: 'Auftrag hinzufügen', clientName: 'Kundenname', jobTitle: 'Auftragsbezeichnung', selectClient: 'Kunden wählen', description: 'Beschreibung', quantity: 'Menge', unitPrice: 'Stückpreis', cancel: 'Abbrechen', save: 'Speichern', creating: 'Wird erstellt...', delete: 'Löschen', deleteConfirm: 'Sind Sie sicher?', deleted: 'Gelöscht', searchClient: 'Kunde suchen...' }",
    listini: "{ title: 'Preislisten', newListino: 'Neue Preisliste', uploadCsv: 'CSV/Excel hochladen', addManual: 'Element manuell hinzufügen', items: 'Einträge: ', description: 'Beschreibung', price: 'Preis', markup: 'Aufschlag %', listiniCreated: 'Preisliste erstellt', itemsAdded: 'Einträge hinzugefügt', itemAdded: 'Eintrag hinzugefügt', promptNewListino: 'Name der Preisliste:', newItem: 'Neuer Eintrag', cancel: 'Abbrechen', save: 'Speichern', delete: 'Löschen', deleteConfirm: 'Sind Sie sicher?', deleted: 'Gelöscht', actions: 'Aktionen' }",
    quote: "{ approve: 'Genehmigen', approved: 'Angebot genehmigt', send: 'Senden', client: 'Kunde: ', preview: 'Vorschau - Rev. ', validateApprove: 'Validieren und genehmigen', downloadPdf: 'PDF herunterladen', downloadHtml: 'HTML herunterladen', sendEmail: 'E-Mail senden', confirmEmail: 'E-Mail-Versand bestätigen', recipient: 'Empfänger:', subject: 'Betreff: ', cancel: 'Abbrechen', approveBefore: 'Zuerst das Angebot genehmigen', emailSent: 'E-Mail gesendet' }",
  },
  fr: {
    messages: null,
    dashboard: "{ clients: 'Clients', jobs: 'Chantiers', details: 'Détails : ', newJob: 'Nouveau chantier', newClient: 'Nouveau client', addCost: 'Ajouter un coût', addClient: 'Ajouter un client', addJob: 'Ajouter un chantier', clientName: 'Nom du client', jobTitle: 'Titre du chantier', selectClient: 'Sélectionner un client', description: 'Description', quantity: 'Quantité', unitPrice: 'Prix unitaire', cancel: 'Annuler', save: 'Enregistrer', creating: 'Création...', delete: 'Supprimer', deleteConfirm: 'Êtes-vous sûr ?', deleted: 'Supprimé', searchClient: 'Rechercher un client...' }",
    listini: "{ title: 'Tarifs', newListino: 'Nouvelle grille', uploadCsv: 'Charger CSV/Excel', addManual: 'Ajouter manuellement', items: 'Éléments : ', description: 'Description', price: 'Prix', markup: 'Majoration %', listiniCreated: 'Grille créée', itemsAdded: 'éléments ajoutés', itemAdded: 'Élément ajouté', promptNewListino: 'Nom de la grille :', newItem: 'Nouvel élément', cancel: 'Annuler', save: 'Enregistrer', delete: 'Supprimer', deleteConfirm: 'Êtes-vous sûr ?', deleted: 'Supprimé', actions: 'Actions' }",
    quote: "{ approve: 'Approuver', approved: 'Devis approuvé', send: 'Envoyer', client: 'Client : ', preview: 'Aperçu - Rév. ', validateApprove: 'Valider et approuver', downloadPdf: 'Télécharger PDF', downloadHtml: 'Télécharger HTML', sendEmail: 'Envoyer email', confirmEmail: 'Confirmer envoi email', recipient: 'Destinataire :', subject: 'Objet : ', cancel: 'Annuler', approveBefore: \"Approuver d'abord le devis\", emailSent: 'Email envoyé' }",
  },
  es: {
    messages: null,
    dashboard: "{ clients: 'Clientes', jobs: 'Trabajos', details: 'Detalles: ', newJob: 'Nuevo trabajo', newClient: 'Nuevo cliente', addCost: 'Añadir coste', addClient: 'Añadir cliente', addJob: 'Añadir trabajo', clientName: 'Nombre del cliente', jobTitle: 'Título del trabajo', selectClient: 'Seleccionar cliente', description: 'Descripción', quantity: 'Cantidad', unitPrice: 'Precio unitario', cancel: 'Cancelar', save: 'Guardar', creating: 'Creando...', delete: 'Eliminar', deleteConfirm: '¿Estás seguro?', deleted: 'Eliminado', searchClient: 'Buscar cliente...' }",
    listini: "{ title: 'Tarifas', newListino: 'Nueva lista', uploadCsv: 'Cargar CSV/Excel', addManual: 'Añadir manualmente', items: 'Elementos: ', description: 'Descripción', price: 'Precio', markup: 'Recargo %', listiniCreated: 'Lista creada', itemsAdded: 'elementos añadidos', itemAdded: 'Elemento añadido', promptNewListino: 'Nombre de la lista:', newItem: 'Nuevo elemento', cancel: 'Cancelar', save: 'Guardar', delete: 'Eliminar', deleteConfirm: '¿Estás seguro?', deleted: 'Eliminado', actions: 'Acciones' }",
    quote: "{ approve: 'Aprobar', approved: 'Presupuesto aprobado', send: 'Enviar', client: 'Cliente: ', preview: 'Vista previa - Rev. ', validateApprove: 'Validar y aprobar', downloadPdf: 'Descargar PDF', downloadHtml: 'Descargar HTML', sendEmail: 'Enviar email', confirmEmail: 'Confirmar envío de email', recipient: 'Destinatario:', subject: 'Asunto: ', cancel: 'Cancelar', approveBefore: 'Aprueba primero el presupuesto', emailSent: 'Email enviado' }",
  },
  pt: {
    messages: null,
    dashboard: "{ clients: 'Clientes', jobs: 'Trabalhos', details: 'Detalhes: ', newJob: 'Novo trabalho', newClient: 'Novo cliente', addCost: 'Adicionar custo', addClient: 'Adicionar cliente', addJob: 'Adicionar trabalho', clientName: 'Nome do cliente', jobTitle: 'Título do trabalho', selectClient: 'Selecionar cliente', description: 'Descrição', quantity: 'Quantidade', unitPrice: 'Preço unitário', cancel: 'Cancelar', save: 'Salvar', creating: 'Criando...', delete: 'Excluir', deleteConfirm: 'Tem certeza?', deleted: 'Excluído', searchClient: 'Pesquisar cliente...' }",
    listini: "{ title: 'Tarifas', newListino: 'Nova lista', uploadCsv: 'Carregar CSV/Excel', addManual: 'Adicionar manualmente', items: 'Itens: ', description: 'Descrição', price: 'Preço', markup: 'Acréscimo %', listiniCreated: 'Lista criada', itemsAdded: 'itens adicionados', itemAdded: 'Item adicionado', promptNewListino: 'Nome da lista:', newItem: 'Novo item', cancel: 'Cancelar', save: 'Salvar', delete: 'Excluir', deleteConfirm: 'Tem certeza?', deleted: 'Excluído', actions: 'Ações' }",
    quote: "{ approve: 'Aprovar', approved: 'Orçamento aprovado', send: 'Enviar', client: 'Cliente: ', preview: 'Pré-visualização - Rev. ', validateApprove: 'Validar e aprovar', downloadPdf: 'Baixar PDF', downloadHtml: 'Baixar HTML', sendEmail: 'Enviar email', confirmEmail: 'Confirmar envio de email', recipient: 'Destinatário:', subject: 'Assunto: ', cancel: 'Cancelar', approveBefore: 'Aprove o orçamento primeiro', emailSent: 'Email enviado' }",
  },
  pl: {
    messages: "{ loading: 'Ładowanie...', saving: 'Zapisywanie...', saved: 'Profil zapisany', logout: 'Wyloguj', address: 'Adres', city: 'Miasto', postalCode: 'Kod pocztowy', notAuthenticated: 'Nie uwierzytelniony', save: 'Zapisz' }",
    dashboard: "{ clients: 'Klienci', jobs: 'Zlecenia', details: 'Szczegóły: ', newJob: 'Nowe zlecenie', newClient: 'Nowy klient', addCost: 'Dodaj koszt', addClient: 'Dodaj klienta', addJob: 'Dodaj zlecenie', clientName: 'Nazwa klienta', jobTitle: 'Tytuł zlecenia', selectClient: 'Wybierz klienta', description: 'Opis', quantity: 'Ilość', unitPrice: 'Cena jednostkowa', cancel: 'Anuluj', save: 'Zapisz', creating: 'Tworzenie...', delete: 'Usuń', deleteConfirm: 'Jesteś pewien?', deleted: 'Usunięto', searchClient: 'Szukaj klienta...' }",
    listini: "{ title: 'Cenniki', newListino: 'Nowy cennik', uploadCsv: 'Wgraj CSV/Excel', addManual: 'Dodaj ręcznie', items: 'Pozycje: ', description: 'Opis', price: 'Cena', markup: 'Narzut %', listiniCreated: 'Cennik utworzony', itemsAdded: 'pozycji dodanych', itemAdded: 'Pozycja dodana', promptNewListino: 'Nazwa cennika:', newItem: 'Nowa pozycja', cancel: 'Anuluj', save: 'Zapisz', delete: 'Usuń', deleteConfirm: 'Jesteś pewien?', deleted: 'Usunięto', actions: 'Akcje' }",
    quote: "{ approve: 'Zatwierdź', approved: 'Wycena zatwierdzona', send: 'Wyślij', client: 'Klient: ', preview: 'Podgląd - Wersja ', validateApprove: 'Zatwierdź i zaakceptuj', downloadPdf: 'Pobierz PDF', downloadHtml: 'Pobierz HTML', sendEmail: 'Wyślij email', confirmEmail: 'Potwierdź wysłanie emaila', recipient: 'Odbiorca:', subject: 'Temat: ', cancel: 'Anuluj', approveBefore: 'Najpierw zatwierdź wycenę', emailSent: 'Email wysłany' }",
  },
  nl: {
    messages: "{ loading: 'Laden...', saving: 'Opslaan...', saved: 'Profiel opgeslagen', logout: 'Uitloggen', address: 'Adres', city: 'Stad', postalCode: 'Postcode', notAuthenticated: 'Niet geverifieerd', save: 'Opslaan' }",
    dashboard: "{ clients: 'Klanten', jobs: 'Opdrachten', details: 'Details: ', newJob: 'Nieuwe opdracht', newClient: 'Nieuwe klant', addCost: 'Kosten toevoegen', addClient: 'Klant toevoegen', addJob: 'Opdracht toevoegen', clientName: 'Klantnaam', jobTitle: 'Opdrachtnaam', selectClient: 'Klant kiezen', description: 'Beschrijving', quantity: 'Aantal', unitPrice: 'Eenheidsprijs', cancel: 'Annuleren', save: 'Opslaan', creating: 'Aanmaken...', delete: 'Verwijderen', deleteConfirm: 'Weet u het zeker?', deleted: 'Verwijderd', searchClient: 'Klant zoeken...' }",
    listini: "{ title: 'Prijslijsten', newListino: 'Nieuwe prijslijst', uploadCsv: 'CSV/Excel uploaden', addManual: 'Handmatig toevoegen', items: 'Items: ', description: 'Beschrijving', price: 'Prijs', markup: 'Opslag %', listiniCreated: 'Prijslijst aangemaakt', itemsAdded: 'items toegevoegd', itemAdded: 'Item toegevoegd', promptNewListino: 'Naam prijslijst:', newItem: 'Nieuw item', cancel: 'Annuleren', save: 'Opslaan', delete: 'Verwijderen', deleteConfirm: 'Weet u het zeker?', deleted: 'Verwijderd', actions: 'Acties' }",
    quote: "{ approve: 'Goedkeuren', approved: 'Offerte goedgekeurd', send: 'Verzenden', client: 'Klant: ', preview: 'Voorbeeld - Rev. ', validateApprove: 'Valideren en goedkeuren', downloadPdf: 'PDF downloaden', downloadHtml: 'HTML downloaden', sendEmail: 'Email verzenden', confirmEmail: 'Bevestig email verzending', recipient: 'Ontvanger:', subject: 'Onderwerp: ', cancel: 'Annuleren', approveBefore: 'Keur eerst de offerte goed', emailSent: 'Email verzonden' }",
  },
  zh: {
    messages: "{ loading: '加载中...', saving: '保存中...', saved: '资料已保存', logout: '退出', address: '地址', city: '城市', postalCode: '邮政编码', notAuthenticated: '未认证', save: '保存' }",
    dashboard: "{ clients: '客户', jobs: '项目', details: '详情：', newJob: '新项目', newClient: '新客户', addCost: '添加费用', addClient: '添加客户', addJob: '添加项目', clientName: '客户名称', jobTitle: '项目名称', selectClient: '选择客户', description: '描述', quantity: '数量', unitPrice: '单价', cancel: '取消', save: '保存', creating: '创建中...', delete: '删除', deleteConfirm: '确定吗？', deleted: '已删除', searchClient: '搜索客户...' }",
    listini: "{ title: '价目表', newListino: '新价目表', uploadCsv: '上传CSV/Excel', addManual: '手动添加', items: '条目：', description: '描述', price: '价格', markup: '加价 %', listiniCreated: '价目表已创建', itemsAdded: '条目已添加', itemAdded: '条目已添加', promptNewListino: '价目表名称：', newItem: '新条目', cancel: '取消', save: '保存', delete: '删除', deleteConfirm: '确定吗？', deleted: '已删除', actions: '操作' }",
    quote: "{ approve: '批准', approved: '报价已批准', send: '发送', client: '客户：', preview: '预览 - 版本 ', validateApprove: '验证并批准', downloadPdf: '下载PDF', downloadHtml: '下载HTML', sendEmail: '发送邮件', confirmEmail: '确认发送邮件', recipient: '收件人：', subject: '主题：', cancel: '取消', approveBefore: '请先批准报价', emailSent: '邮件已发送' }",
  },
  ru: {
    messages: "{ loading: 'Загрузка...', saving: 'Сохранение...', saved: 'Профиль сохранён', logout: 'Выход', address: 'Адрес', city: 'Город', postalCode: 'Индекс', notAuthenticated: 'Не аутентифицирован', save: 'Сохранить' }",
    dashboard: "{ clients: 'Клиенты', jobs: 'Работы', details: 'Детали: ', newJob: 'Новая работа', newClient: 'Новый клиент', addCost: 'Добавить затрату', addClient: 'Добавить клиента', addJob: 'Добавить работу', clientName: 'Имя клиента', jobTitle: 'Название работы', selectClient: 'Выберите клиента', description: 'Описание', quantity: 'Количество', unitPrice: 'Цена за единицу', cancel: 'Отмена', save: 'Сохранить', creating: 'Создание...', delete: 'Удалить', deleteConfirm: 'Вы уверены?', deleted: 'Удалено', searchClient: 'Поиск клиента...' }",
    listini: "{ title: 'Прайс-листы', newListino: 'Новый прайс-лист', uploadCsv: 'Загрузить CSV/Excel', addManual: 'Добавить вручную', items: 'Позиции: ', description: 'Описание', price: 'Цена', markup: 'Наценка %', listiniCreated: 'Прайс-лист создан', itemsAdded: 'позиций добавлено', itemAdded: 'Позиция добавлена', promptNewListino: 'Название прайс-листа:', newItem: 'Новая позиция', cancel: 'Отмена', save: 'Сохранить', delete: 'Удалить', deleteConfirm: 'Вы уверены?', deleted: 'Удалено', actions: 'Действия' }",
    quote: "{ approve: 'Утвердить', approved: 'Смета утверждена', send: 'Отправить', client: 'Клиент: ', preview: 'Предпросмотр - Версия ', validateApprove: 'Проверить и утвердить', downloadPdf: 'Скачать PDF', downloadHtml: 'Скачать HTML', sendEmail: 'Отправить email', confirmEmail: 'Подтвердить отправку email', recipient: 'Получатель:', subject: 'Тема: ', cancel: 'Отмена', approveBefore: 'Сначала утвердите смету', emailSent: 'Email отправлен' }",
  },
  cs: {
    messages: "{ loading: 'Načítání...', saving: 'Ukládání...', saved: 'Profil uložen', logout: 'Odhlásit', address: 'Adresa', city: 'Město', postalCode: 'PSČ', notAuthenticated: 'Neověřen', save: 'Uložit' }",
    dashboard: "{ clients: 'Zákazníci', jobs: 'Zakázky', details: 'Podrobnosti: ', newJob: 'Nová zakázka', newClient: 'Nový zákazník', addCost: 'Přidat náklad', addClient: 'Přidat zákazníka', addJob: 'Přidat zakázku', clientName: 'Jméno zákazníka', jobTitle: 'Název zakázky', selectClient: 'Vyberte zákazníka', description: 'Popis', quantity: 'Množství', unitPrice: 'Jednotková cena', cancel: 'Zrušit', save: 'Uložit', creating: 'Vytváření...', delete: 'Smazat', deleteConfirm: 'Jste si jistí?', deleted: 'Smazáno', searchClient: 'Hledat klienta...' }",
    listini: "{ title: 'Ceníky', newListino: 'Nový ceník', uploadCsv: 'Nahrát CSV/Excel', addManual: 'Přidat ručně', items: 'Položky: ', description: 'Popis', price: 'Cena', markup: 'Přirážka %', listiniCreated: 'Ceník vytvořen', itemsAdded: 'položek přidáno', itemAdded: 'Položka přidána', promptNewListino: 'Název ceníku:', newItem: 'Nová položka', cancel: 'Zrušit', save: 'Uložit', delete: 'Smazat', deleteConfirm: 'Jste si jistí?', deleted: 'Smazáno', actions: 'Akce' }",
    quote: "{ approve: 'Schválit', approved: 'Nabídka schválena', send: 'Odeslat', client: 'Zákazník: ', preview: 'Náhled - Rev. ', validateApprove: 'Ověřit a schválit', downloadPdf: 'Stáhnout PDF', downloadHtml: 'Stáhnout HTML', sendEmail: 'Odeslat email', confirmEmail: 'Potvrdit odeslání emailu', recipient: 'Příjemce:', subject: 'Předmět: ', cancel: 'Zrušit', approveBefore: 'Nejdříve schvalte nabídku', emailSent: 'Email odeslán' }",
  },
  hu: {
    messages: "{ loading: 'Betöltés...', saving: 'Mentés...', saved: 'Profil mentve', logout: 'Kijelentkezés', address: 'Cím', city: 'Város', postalCode: 'Irányítószám', notAuthenticated: 'Nincs hitelesítve', save: 'Mentés' }",
    dashboard: "{ clients: 'Ügyfelek', jobs: 'Munkák', details: 'Részletek: ', newJob: 'Új munka', newClient: 'Új ügyfél', addCost: 'Költség hozzáadása', addClient: 'Ügyfél hozzáadása', addJob: 'Munka hozzáadása', clientName: 'Ügyfél neve', jobTitle: 'Munka neve', selectClient: 'Válasszon ügyfelet', description: 'Leírás', quantity: 'Mennyiség', unitPrice: 'Egységár', cancel: 'Mégse', save: 'Mentés', creating: 'Létrehozás...', delete: 'Törlés', deleteConfirm: 'Biztos benne?', deleted: 'Törölve', searchClient: 'Ügyfél keresése...' }",
    listini: "{ title: 'Árlisták', newListino: 'Új árlista', uploadCsv: 'CSV/Excel feltöltése', addManual: 'Kézi hozzáadás', items: 'Tételek: ', description: 'Leírás', price: 'Ár', markup: 'Felár %', listiniCreated: 'Árlista létrehozva', itemsAdded: 'tétel hozzáadva', itemAdded: 'Tétel hozzáadva', promptNewListino: 'Árlista neve:', newItem: 'Új tétel', cancel: 'Mégse', save: 'Mentés', delete: 'Törlés', deleteConfirm: 'Biztos benne?', deleted: 'Törölve', actions: 'Műveletek' }",
    quote: "{ approve: 'Jóváhagyás', approved: 'Árajánlat jóváhagyva', send: 'Küldés', client: 'Ügyfél: ', preview: 'Előnézet - Verzió ', validateApprove: 'Érvényesítés és jóváhagyás', downloadPdf: 'PDF letöltése', downloadHtml: 'HTML letöltése', sendEmail: 'Email küldése', confirmEmail: 'Email küldés megerősítése', recipient: 'Címzett:', subject: 'Tárgy: ', cancel: 'Mégse', approveBefore: 'Előbb hagyja jóvá az árajánlatot', emailSent: 'Email elküldve' }",
  },
  ro: {
    messages: "{ loading: 'Se încarcă...', saving: 'Se salvează...', saved: 'Profil salvat', logout: 'Deconectare', address: 'Adresă', city: 'Oraș', postalCode: 'Cod poștal', notAuthenticated: 'Neautentificat', save: 'Salvează' }",
    dashboard: "{ clients: 'Clienți', jobs: 'Lucrări', details: 'Detalii: ', newJob: 'Lucrare nouă', newClient: 'Client nou', addCost: 'Adaugă cost', addClient: 'Adaugă client', addJob: 'Adaugă lucrare', clientName: 'Nume client', jobTitle: 'Titlu lucrare', selectClient: 'Selectează client', description: 'Descriere', quantity: 'Cantitate', unitPrice: 'Preț unitar', cancel: 'Anulare', save: 'Salvează', creating: 'Se creează...', delete: 'Șterge', deleteConfirm: 'Ești sigur?', deleted: 'Șters', searchClient: 'Caută client...' }",
    listini: "{ title: 'Liste prețuri', newListino: 'Listă nouă', uploadCsv: 'Încarcă CSV/Excel', addManual: 'Adaugă manual', items: 'Articole: ', description: 'Descriere', price: 'Preț', markup: 'Adaos %', listiniCreated: 'Listă creată', itemsAdded: 'articole adăugate', itemAdded: 'Articol adăugat', promptNewListino: 'Numele listei:', newItem: 'Articol nou', cancel: 'Anulare', save: 'Salvează', delete: 'Șterge', deleteConfirm: 'Ești sigur?', deleted: 'Șters', actions: 'Acțiuni' }",
    quote: "{ approve: 'Aprobă', approved: 'Ofertă aprobată', send: 'Trimite', client: 'Client: ', preview: 'Previzualizare - Rev. ', validateApprove: 'Validează și aprobă', downloadPdf: 'Descarcă PDF', downloadHtml: 'Descarcă HTML', sendEmail: 'Trimite email', confirmEmail: 'Confirmă trimiterea emailului', recipient: 'Destinatar:', subject: 'Subiect: ', cancel: 'Anulare', approveBefore: 'Aprobă mai întâi oferta', emailSent: 'Email trimis' }",
  },
  uk: {
    messages: "{ loading: 'Завантаження...', saving: 'Збереження...', saved: 'Профіль збережено', logout: 'Вихід', address: 'Адреса', city: 'Місто', postalCode: 'Поштовий індекс', notAuthenticated: 'Не автентифіковано', save: 'Зберегти' }",
    dashboard: "{ clients: 'Клієнти', jobs: 'Роботи', details: 'Деталі: ', newJob: 'Нова робота', newClient: 'Новий клієнт', addCost: 'Додати витрату', addClient: 'Додати клієнта', addJob: 'Додати роботу', clientName: 'Ім\\'я клієнта', jobTitle: 'Назва роботи', selectClient: 'Оберіть клієнта', description: 'Опис', quantity: 'Кількість', unitPrice: 'Ціна за одиницю', cancel: 'Скасувати', save: 'Зберегти', creating: 'Створення...', delete: 'Видалити', deleteConfirm: 'Ви впевнені?', deleted: 'Видалено', searchClient: 'Пошук клієнта...' }",
    listini: "{ title: 'Прайс-листи', newListino: 'Новий прайс-лист', uploadCsv: 'Завантажити CSV/Excel', addManual: 'Додати вручну', items: 'Позиції: ', description: 'Опис', price: 'Ціна', markup: 'Націнка %', listiniCreated: 'Прайс-лист створено', itemsAdded: 'позицій додано', itemAdded: 'Позицію додано', promptNewListino: 'Назва прайс-листа:', newItem: 'Нова позиція', cancel: 'Скасувати', save: 'Зберегти', delete: 'Видалити', deleteConfirm: 'Ви впевнені?', deleted: 'Видалено', actions: 'Дії' }",
    quote: "{ approve: 'Затвердити', approved: 'Кошторис затверджено', send: 'Надіслати', client: 'Клієнт: ', preview: 'Попередній перегляд - Версія ', validateApprove: 'Перевірити і затвердити', downloadPdf: 'Завантажити PDF', downloadHtml: 'Завантажити HTML', sendEmail: 'Надіслати email', confirmEmail: 'Підтвердити відправку email', recipient: 'Одержувач:', subject: 'Тема: ', cancel: 'Скасувати', approveBefore: 'Спочатку затвердіть кошторис', emailSent: 'Email надіслано' }",
  },
  hr: {
    messages: "{ loading: 'Učitavanje...', saving: 'Spremanje...', saved: 'Profil spremljen', logout: 'Odjava', address: 'Adresa', city: 'Grad', postalCode: 'Poštanski broj', notAuthenticated: 'Nije autentificiran', save: 'Spremi' }",
    dashboard: "{ clients: 'Klijenti', jobs: 'Poslovi', details: 'Detalji: ', newJob: 'Novi posao', newClient: 'Novi klijent', addCost: 'Dodaj trošak', addClient: 'Dodaj klijenta', addJob: 'Dodaj posao', clientName: 'Ime klijenta', jobTitle: 'Naziv posla', selectClient: 'Odaberite klijenta', description: 'Opis', quantity: 'Količina', unitPrice: 'Jedinična cijena', cancel: 'Odustani', save: 'Spremi', creating: 'Kreiranje...', delete: 'Obriši', deleteConfirm: 'Jeste li sigurni?', deleted: 'Obrisano', searchClient: 'Traži klijenta...' }",
    listini: "{ title: 'Cjenici', newListino: 'Novi cjenik', uploadCsv: 'Učitaj CSV/Excel', addManual: 'Dodaj ručno', items: 'Stavke: ', description: 'Opis', price: 'Cijena', markup: 'Marža %', listiniCreated: 'Cjenik kreiran', itemsAdded: 'stavki dodano', itemAdded: 'Stavka dodana', promptNewListino: 'Naziv cjenika:', newItem: 'Nova stavka', cancel: 'Odustani', save: 'Spremi', delete: 'Obriši', deleteConfirm: 'Jeste li sigurni?', deleted: 'Obrisano', actions: 'Akcije' }",
    quote: "{ approve: 'Odobri', approved: 'Ponuda odobrena', send: 'Pošalji', client: 'Klijent: ', preview: 'Pregled - Rev. ', validateApprove: 'Provjeri i odobri', downloadPdf: 'Preuzmi PDF', downloadHtml: 'Preuzmi HTML', sendEmail: 'Pošalji email', confirmEmail: 'Potvrdi slanje emaila', recipient: 'Primatelj:', subject: 'Predmet: ', cancel: 'Odustani', approveBefore: 'Prvo odobrite ponudu', emailSent: 'Email poslan' }",
  },
  sk: {
    messages: "{ loading: 'Načítava sa...', saving: 'Ukladá sa...', saved: 'Profil uložený', logout: 'Odhlásiť', address: 'Adresa', city: 'Mesto', postalCode: 'PSČ', notAuthenticated: 'Neoverený', save: 'Uložiť' }",
    dashboard: "{ clients: 'Zákazníci', jobs: 'Zákazky', details: 'Podrobnosti: ', newJob: 'Nová zákazka', newClient: 'Nový zákazník', addCost: 'Pridať náklad', addClient: 'Pridať zákazníka', addJob: 'Pridať zákazku', clientName: 'Meno zákazníka', jobTitle: 'Názov zákazky', selectClient: 'Vyberte zákazníka', description: 'Popis', quantity: 'Množstvo', unitPrice: 'Jednotková cena', cancel: 'Zrušiť', save: 'Uložiť', creating: 'Vytvára sa...', delete: 'Zmazať', deleteConfirm: 'Ste si istí?', deleted: 'Zmazané', searchClient: 'Hľadať klienta...' }",
    listini: "{ title: 'Cenníky', newListino: 'Nový cenník', uploadCsv: 'Nahrať CSV/Excel', addManual: 'Pridať ručne', items: 'Položky: ', description: 'Popis', price: 'Cena', markup: 'Prirážka %', listiniCreated: 'Cenník vytvorený', itemsAdded: 'položiek pridaných', itemAdded: 'Položka pridaná', promptNewListino: 'Názov cenníka:', newItem: 'Nová položka', cancel: 'Zrušiť', save: 'Uložiť', delete: 'Zmazať', deleteConfirm: 'Ste si istí?', deleted: 'Zmazané', actions: 'Akcie' }",
    quote: "{ approve: 'Schváliť', approved: 'Ponuka schválená', send: 'Odoslať', client: 'Zákazník: ', preview: 'Náhľad - Rev. ', validateApprove: 'Overiť a schváliť', downloadPdf: 'Stiahnuť PDF', downloadHtml: 'Stiahnuť HTML', sendEmail: 'Odoslať email', confirmEmail: 'Potvrdiť odoslanie emailu', recipient: 'Príjemca:', subject: 'Predmet: ', cancel: 'Zrušiť', approveBefore: 'Najskôr schváľte ponuku', emailSent: 'Email odoslaný' }",
  },
  bg: {
    messages: "{ loading: 'Зареждане...', saving: 'Запазване...', saved: 'Профилът е запазен', logout: 'Изход', address: 'Адрес', city: 'Град', postalCode: 'Пощенски код', notAuthenticated: 'Не е удостоверен', save: 'Запази' }",
    dashboard: "{ clients: 'Клиенти', jobs: 'Работи', details: 'Подробности: ', newJob: 'Нова работа', newClient: 'Нов клиент', addCost: 'Добави разход', addClient: 'Добави клиент', addJob: 'Добави работа', clientName: 'Име на клиента', jobTitle: 'Заглавие на работата', selectClient: 'Изберете клиент', description: 'Описание', quantity: 'Количество', unitPrice: 'Единична цена', cancel: 'Отказ', save: 'Запази', creating: 'Създаване...', delete: 'Изтрий', deleteConfirm: 'Сигурни ли сте?', deleted: 'Изтрито', searchClient: 'Търсене на клиент...' }",
    listini: "{ title: 'Ценови листи', newListino: 'Нова ценова листа', uploadCsv: 'Качи CSV/Excel', addManual: 'Добави ръчно', items: 'Позиции: ', description: 'Описание', price: 'Цена', markup: 'Надценка %', listiniCreated: 'Ценова листа създадена', itemsAdded: 'позиции добавени', itemAdded: 'Позиция добавена', promptNewListino: 'Име на ценовата листа:', newItem: 'Нова позиция', cancel: 'Отказ', save: 'Запази', delete: 'Изтрий', deleteConfirm: 'Сигурни ли сте?', deleted: 'Изтрито', actions: 'Действия' }",
    quote: "{ approve: 'Одобри', approved: 'Офертата е одобрена', send: 'Изпрати', client: 'Клиент: ', preview: 'Преглед - Версия ', validateApprove: 'Валидирай и одобри', downloadPdf: 'Изтегли PDF', downloadHtml: 'Изтегли HTML', sendEmail: 'Изпрати email', confirmEmail: 'Потвърди изпращане на email', recipient: 'Получател:', subject: 'Тема: ', cancel: 'Отказ', approveBefore: 'Първо одобрете офертата', emailSent: 'Emailът е изпратен' }",
  },
  sl: {
    messages: "{ loading: 'Nalaganje...', saving: 'Shranjevanje...', saved: 'Profil shranjen', logout: 'Odjava', address: 'Naslov', city: 'Mesto', postalCode: 'Poštna številka', notAuthenticated: 'Ni overjen', save: 'Shrani' }",
    dashboard: "{ clients: 'Stranke', jobs: 'Dela', details: 'Podrobnosti: ', newJob: 'Novo delo', newClient: 'Nova stranka', addCost: 'Dodaj strošek', addClient: 'Dodaj stranko', addJob: 'Dodaj delo', clientName: 'Ime stranke', jobTitle: 'Naziv dela', selectClient: 'Izberite stranko', description: 'Opis', quantity: 'Količina', unitPrice: 'Cena na enoto', cancel: 'Prekliči', save: 'Shrani', creating: 'Ustvarjanje...', delete: 'Izbriši', deleteConfirm: 'Ste prepričani?', deleted: 'Izbrisano', searchClient: 'Išči stranko...' }",
    listini: "{ title: 'Ceniki', newListino: 'Nov cenik', uploadCsv: 'Naloži CSV/Excel', addManual: 'Dodaj ročno', items: 'Postavke: ', description: 'Opis', price: 'Cena', markup: 'Pribitek %', listiniCreated: 'Cenik ustvarjen', itemsAdded: 'postavk dodanih', itemAdded: 'Postavka dodana', promptNewListino: 'Ime cenika:', newItem: 'Nova postavka', cancel: 'Prekliči', save: 'Shrani', delete: 'Izbriši', deleteConfirm: 'Ste prepričani?', deleted: 'Izbrisano', actions: 'Dejanja' }",
    quote: "{ approve: 'Odobri', approved: 'Ponudba odobrena', send: 'Pošlji', client: 'Stranka: ', preview: 'Predogled - Rev. ', validateApprove: 'Preveri in odobri', downloadPdf: 'Prenesi PDF', downloadHtml: 'Prenesi HTML', sendEmail: 'Pošlji email', confirmEmail: 'Potrdi pošiljanje emaila', recipient: 'Prejemnik:', subject: 'Zadeva: ', cancel: 'Prekliči', approveBefore: 'Najprej odobrite ponudbo', emailSent: 'Email poslan' }",
  },
  el: {
    messages: "{ loading: 'Φόρτωση...', saving: 'Αποθήκευση...', saved: 'Προφίλ αποθηκεύτηκε', logout: 'Αποσύνδεση', address: 'Διεύθυνση', city: 'Πόλη', postalCode: 'Τ.Κ.', notAuthenticated: 'Μη πιστοποιημένος', save: 'Αποθήκευση' }",
    dashboard: "{ clients: 'Πελάτες', jobs: 'Έργα', details: 'Λεπτομέρειες: ', newJob: 'Νέο έργο', newClient: 'Νέος πελάτης', addCost: 'Προσθήκη κόστους', addClient: 'Προσθήκη πελάτη', addJob: 'Προσθήκη έργου', clientName: 'Όνομα πελάτη', jobTitle: 'Τίτλος έργου', selectClient: 'Επιλέξτε πελάτη', description: 'Περιγραφή', quantity: 'Ποσότητα', unitPrice: 'Τιμή μονάδας', cancel: 'Ακύρωση', save: 'Αποθήκευση', creating: 'Δημιουργία...', delete: 'Διαγραφή', deleteConfirm: 'Είστε σίγουρος;', deleted: 'Διαγράφτηκε', searchClient: 'Αναζήτηση πελάτη...' }",
    listini: "{ title: 'Τιμοκατάλογοι', newListino: 'Νέος τιμοκατάλογος', uploadCsv: 'Ανέβασμα CSV/Excel', addManual: 'Χειροκίνητη προσθήκη', items: 'Στοιχεία: ', description: 'Περιγραφή', price: 'Τιμή', markup: 'Προσαύξηση %', listiniCreated: 'Τιμοκατάλογος δημιουργήθηκε', itemsAdded: 'στοιχεία προστέθηκαν', itemAdded: 'Στοιχείο προστέθηκε', promptNewListino: 'Όνομα τιμοκαταλόγου:', newItem: 'Νέο στοιχείο', cancel: 'Ακύρωση', save: 'Αποθήκευση', delete: 'Διαγραφή', deleteConfirm: 'Είστε σίγουρος;', deleted: 'Διαγράφτηκε', actions: 'Ενέργειες' }",
    quote: "{ approve: 'Έγκριση', approved: 'Προσφορά εγκρίθηκε', send: 'Αποστολή', client: 'Πελάτης: ', preview: 'Προεπισκόπηση - Αναθ. ', validateApprove: 'Επικύρωση και έγκριση', downloadPdf: 'Λήψη PDF', downloadHtml: 'Λήψη HTML', sendEmail: 'Αποστολή email', confirmEmail: 'Επιβεβαίωση αποστολής email', recipient: 'Παραλήπτης:', subject: 'Θέμα: ', cancel: 'Ακύρωση', approveBefore: 'Πρώτα εγκρίνετε την προσφορά', emailSent: 'Το email στάλθηκε' }",
  },
  ja: {
    messages: "{ loading: '読み込み中...', saving: '保存中...', saved: 'プロフィール保存済み', logout: 'ログアウト', address: '住所', city: '市区町村', postalCode: '郵便番号', notAuthenticated: '未認証', save: '保存' }",
    dashboard: "{ clients: '顧客', jobs: '仕事', details: '詳細：', newJob: '新しい仕事', newClient: '新しい顧客', addCost: '費用を追加', addClient: '顧客を追加', addJob: '仕事を追加', clientName: '顧客名', jobTitle: '仕事名', selectClient: '顧客を選択', description: '説明', quantity: '数量', unitPrice: '単価', cancel: 'キャンセル', save: '保存', creating: '作成中...', delete: '削除', deleteConfirm: '本当ですか？', deleted: '削除済み', searchClient: '顧客を検索...' }",
    listini: "{ title: '価格表', newListino: '新しい価格表', uploadCsv: 'CSV/Excelアップロード', addManual: '手動で追加', items: '項目：', description: '説明', price: '価格', markup: 'マークアップ %', listiniCreated: '価格表を作成しました', itemsAdded: '項目を追加しました', itemAdded: '項目を追加しました', promptNewListino: '価格表名：', newItem: '新しい項目', cancel: 'キャンセル', save: '保存', delete: '削除', deleteConfirm: '本当ですか？', deleted: '削除済み', actions: 'アクション' }",
    quote: "{ approve: '承認', approved: '見積もり承認済み', send: '送信', client: '顧客：', preview: 'プレビュー - Rev. ', validateApprove: '検証して承認', downloadPdf: 'PDFダウンロード', downloadHtml: 'HTMLダウンロード', sendEmail: 'メール送信', confirmEmail: 'メール送信を確認', recipient: '宛先：', subject: '件名：', cancel: 'キャンセル', approveBefore: '先に見積もりを承認してください', emailSent: 'メール送信済み' }",
  },
  ko: {
    messages: "{ loading: '로딩 중...', saving: '저장 중...', saved: '프로필 저장됨', logout: '로그아웃', address: '주소', city: '도시', postalCode: '우편번호', notAuthenticated: '인증되지 않음', save: '저장' }",
    dashboard: "{ clients: '고객', jobs: '작업', details: '상세：', newJob: '새 작업', newClient: '새 고객', addCost: '비용 추가', addClient: '고객 추가', addJob: '작업 추가', clientName: '고객명', jobTitle: '작업명', selectClient: '고객 선택', description: '설명', quantity: '수량', unitPrice: '단가', cancel: '취소', save: '저장', creating: '생성 중...', delete: '삭제', deleteConfirm: '확실합니까?', deleted: '삭제됨', searchClient: '고객 검색...' }",
    listini: "{ title: '가격표', newListino: '새 가격표', uploadCsv: 'CSV/Excel 업로드', addManual: '수동 추가', items: '항목：', description: '설명', price: '가격', markup: '마크업 %', listiniCreated: '가격표 생성됨', itemsAdded: '항목 추가됨', itemAdded: '항목 추가됨', promptNewListino: '가격표 이름:', newItem: '새 항목', cancel: '취소', save: '저장', delete: '삭제', deleteConfirm: '확실합니까?', deleted: '삭제됨', actions: '작업' }",
    quote: "{ approve: '승인', approved: '견적 승인됨', send: '전송', client: '고객：', preview: '미리보기 - Rev. ', validateApprove: '검증 및 승인', downloadPdf: 'PDF 다운로드', downloadHtml: 'HTML 다운로드', sendEmail: '이메일 전송', confirmEmail: '이메일 전송 확인', recipient: '수신자:', subject: '제목：', cancel: '취소', approveBefore: '먼저 견적을 승인해주세요', emailSent: '이메일 전송됨' }",
  },
};

// Group 1: languages that already have messages (de, fr, es, pt)
// Need to add dashboard, listini, quote after messages line
const withMessages = ['de', 'fr', 'es', 'pt'];

// Group 2: languages that only have up to main
// Need to add messages, dashboard, listini, quote after main line
const withoutMessages = ['pl', 'nl', 'zh', 'ru', 'cs', 'hu', 'ro', 'uk', 'hr', 'sk', 'bg', 'sl', 'el', 'ja', 'ko'];

for (const lang of withMessages) {
  const t = missingTranslations[lang];
  // Find the pattern: messages: { ... },\n    },\n  },\n  NEXT_LANG (or end)
  // We need to add lines after the messages line
  const regex = new RegExp(`(  ${lang}: \\{[\\s\\S]*?messages: \\{[^}]+\\},)\\n(    \\},\\n  \\},)`);
  const match = content.match(regex);
  if (match) {
    const replacement = match[1] + '\n' +
      `      dashboard: ${t.dashboard},\n` +
      `      listini: ${t.listini},\n` +
      `      quote: ${t.quote},\n` +
      match[2];
    content = content.replace(regex, replacement);
    console.log('Updated ' + lang + ' (added dashboard, listini, quote)');
  } else {
    console.log('WARNING: Could not find pattern for ' + lang);
  }
}

for (const lang of withoutMessages) {
  const t = missingTranslations[lang];
  // Find the pattern: main: { ... },\n    },\n  },
  const regex = new RegExp(`(  ${lang}: \\{[\\s\\S]*?main: \\{[^}]+\\},)\\n(    \\},\\n  \\},)`);
  const match = content.match(regex);
  if (match) {
    const replacement = match[1] + '\n' +
      `      messages: ${t.messages},\n` +
      `      dashboard: ${t.dashboard},\n` +
      `      listini: ${t.listini},\n` +
      `      quote: ${t.quote},\n` +
      match[2];
    content = content.replace(regex, replacement);
    console.log('Updated ' + lang + ' (added messages, dashboard, listini, quote)');
  } else {
    console.log('WARNING: Could not find pattern for ' + lang);
  }
}

fs.writeFileSync(filePath, content);
console.log('\nAll done. File saved.');
