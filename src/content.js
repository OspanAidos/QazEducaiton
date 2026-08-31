/**
 * Весь текст страницы: RU и ҚАЗ.
 * Тон подачи v2: короткие утверждения, без рекламных обещаний.
 * Юридические формулировки из ТЗ сохранены по смыслу дословно.
 */

/** Маршруты совпадают с адресами боевого сайта qazeducation.kz */
export const routes = {
  home: "/",
  apply: "/register",
  login: "/login",
  about: "/about",
  who: "/eligibility",
  what: "/benefits",
  university: "/match",
  stages: "/stages",
  dates: "/dates",
  faq: "/faq",
  payment: "/payment",
  transparency: "/transparency",
  documents: "/documents",
  results: "/results",
};

export const content = {
  ru: {
    a11y: {
      skip: "Перейти к содержимому",
      openMenu: "Открыть меню",
      closeMenu: "Закрыть меню",
      langSwitch: "Выбор языка",
      main: "Главное содержимое",
      primaryNav: "Основная навигация",
    },
    nav: {
      about: "О программе",
      who: "Кто может участвовать",
      what: "Что можно получить",
      more: "Ещё",
      moreItems: [{ label: "Подбор вуза", href: routes.university }],
      menuItems: [
        { label: "Главная", href: routes.home },
        { label: "О программе", href: routes.about },
        { label: "Кто может участвовать", href: routes.who },
        { label: "Что можно получить", href: routes.what },
        { label: "Этапы", href: routes.stages },
        { label: "Результаты", href: routes.results },
        { label: "Документы для заявки", href: routes.documents },
        { label: "Подбор вуза", href: routes.university },
        { label: "Прозрачность", href: routes.transparency },
        { label: "Вопросы", href: routes.faq },
      ],
    },
    actions: {
      login: "Войти",
      apply: "Подать заявку",
      account: "Личный кабинет",
      admin: "Админ-панель",
      commission: "Панель комиссии",
    },
    hero: {
      label: "ежегодная частная программа · Казахстан",
      titleLines: ["Грант.", "Стипендия.", "Top-30."],
      subtitle:
        "Ежегодный конкурс для тех, кто готов проходить отбор, а не ждать удачи.",
      imageAlt: "Студенты на территории университетского кампуса",
      stats: [
        { value: "10", label: "вузов в образовательном справочнике" },
        { value: "30", label: "стипендий по 50 000 ₸ в месяц" },
        { value: "Top-30", label: "кадровый резерв лучших участников" },
      ],
    },
    partners: {
      label: "вузы в справочнике",
      title: "Образовательные\nтраектории.",
      prev: "Предыдущие вузы",
      next: "Следующие вузы",
      note: "Справочник используется для выбора образовательной траектории. Размещение вуза не означает официального партнёрства без подписанного соглашения.",
      universities: [
        { short: "АУНГ", logo: "/logos/aung.png", name: "Атырауский университет нефти и газа имени Сафи Утебаева", city: "Атырау" },
        { short: "АУ", logo: "/logos/au.png", name: "Атырауский университет имени Халела Досмухамедова", city: "Атырау" },
        { short: "МУТиГ", logo: "/logos/iuth.png", name: "Международный университет туризма и гостеприимства", city: "Туркестан" },
        { short: "ВКУ", logo: "/logos/vku.png", name: "Восточно-Казахстанский университет им. С. Аманжолова", city: "Усть-Каменогорск" },
        { short: "ВКТУ", logo: "/logos/vktu.png", name: "Восточно-Казахстанский технический университет им. Д. Серикбаева", city: "Усть-Каменогорск" },
        { short: "ABU", logo: "/logos/abu.png", name: "Alikhan Bokeikhan University", city: "Семей" },
        { short: "УШ", logo: "/logos/ush.png", name: "Университет имени Шакарима города Семей", city: "Семей" },
        { short: "КТУ", logo: "/logos/ktu.png", name: "Карагандинский технический университет имени Абылкаса Сагинова", city: "Караганда" },
        { short: "ЮКУ", logo: "/logos/auezov.png", name: "Южно-Казахстанский университет им. М. Ауэзова", city: "Шымкент" },
        { short: "КУ", logo: "/logos/bu.png", name: "Костанайский университет имени А. Байтурсынова", city: "Костанай" },
      ],
    },
    benefits: {
      label: "что можно получить",
      title: "Три исхода.\nОдин конкурс.",
      items: [
        {
          index: "01",
          name: "Образовательный грант",
          lead: "10 образовательных грантов.",
          text: "Покрытие обучения для самых сильных и мотивированных участников по итогам конкурсного отбора.",
        },
        {
          index: "02",
          name: "Стипендия",
          lead: "30 стипендий.",
          text: "Каждая — по 50 000 ₸ в месяц по итогам конкурсного отбора.",
        },
        {
          index: "03",
          name: "Кадровый резерв Top-30",
          lead: "30 имён. Один список.",
          text: "Статус одного из 30 лучших участников и доступ к возможностям программы.",
        },
      ],
    },
    selection: {
      title: "Решает комиссия,\nа не связи.",
      text: "Заявки проходят конкурсный отбор. Оценку даёт независимая комиссия программы.",
      marquee: ["Прозрачный конкурс", "Независимая оценка комиссией", "Top-30"],
      imageAlt: "Заседание отборочной комиссии программы",
      imageCaption: "Независимая комиссия программы",
    },
    notices: {
      label: "без мелкого шрифта",
      title: "Скажем прямо.",
      items: [
        {
          id: "payment",
          lead: "Платёж не покупает результат.",
          title: "Важно об оплате",
          text: "Организационный платёж 10 000 ₸ не гарантирует получение гранта, стипендии, прохождение в финал или включение в Top-30.",
        },
        {
          id: "status",
          lead: "Мы не государство.",
          title: "О статусе программы",
          text: "QazEducation является частной программой. Это не государственная программа, не государственный грант и не государственная стипендия.",
        },
      ],
    },
    closing: {
      title: "Заявка открыта.",
      text: "Дальше только отбор.",
    },
    footer: {
      about:
        "Ежегодная частная образовательная и стипендиальная программа поддержки молодёжи Казахстана.",
      organizer: "Организатор: ТОО «Business International Group Partners».",
      contacts: {
        title: "Контакты",
        support: { label: "Техподдержка", value: "+7 775 080 8041", href: "tel:+77750808041" },
        whatsapp: { label: "WhatsApp", value: "+7 775 080 8051", href: "https://wa.me/77750808051" },
        instagram: { label: "Instagram", value: "@edugrant.kz", href: "https://www.instagram.com/edugrant.kz" },
        website: { label: "Сайт", value: "qazeducation.kz", href: "https://qazeducation.kz" },
      },
      docsTitle: "Документы",
      columns: [
        {
          title: "Программа",
          links: [
            { label: "О программе", href: routes.about },
            { label: "Кто может участвовать", href: routes.who },
            { label: "Что можно получить", href: routes.what },
            { label: "Этапы", href: routes.stages },
            { label: "Результаты", href: routes.results },
            { label: "Вопросы", href: routes.faq },
          ],
        },
        {
          title: "Документы",
          links: [
            { label: "Прозрачность", href: routes.transparency },
            { label: "Документы для заявки", href: routes.documents },
          ],
        },
      ],
      disclaimer:
        "QazEducation является частной программой. Это не государственная программа, не государственный грант и не государственная стипендия.",
      copyright: "© 2026 ТОО «Business International Group Partners».",
    },
  },

  kk: {
    a11y: {
      skip: "Мазмұнға өту",
      openMenu: "Мәзірді ашу",
      closeMenu: "Мәзірді жабу",
      langSwitch: "Тілді таңдау",
      main: "Негізгі мазмұн",
      primaryNav: "Негізгі навигация",
    },
    nav: {
      about: "Бағдарлама туралы",
      who: "Кім қатыса алады",
      what: "Не алуға болады",
      more: "Тағы",
      moreItems: [{ label: "ЖОО таңдау", href: routes.university }],
      menuItems: [
        { label: "Басты бет", href: routes.home },
        { label: "Бағдарлама туралы", href: routes.about },
        { label: "Кім қатыса алады", href: routes.who },
        { label: "Не алуға болады", href: routes.what },
        { label: "Кезеңдер", href: routes.stages },
        { label: "Нәтижелер", href: routes.results },
        { label: "Өтінімге арналған құжаттар", href: routes.documents },
        { label: "ЖОО таңдау", href: routes.university },
        { label: "Ашықтық", href: routes.transparency },
        { label: "Сұрақтар", href: routes.faq },
      ],
    },
    actions: {
      login: "Кіру",
      apply: "Өтінім беру",
      account: "Жеке кабинет",
      admin: "Әкімші панелі",
      commission: "Комиссия панелі",
    },
    hero: {
      label: "жыл сайынғы жеке бағдарлама · Қазақстан",
      titleLines: ["Грант.", "Стипендия.", "Top-30."],
      subtitle:
        "Сәттілікті күтпей, іріктеуден өтуге дайын жастарға арналған жыл сайынғы конкурс.",
      imageAlt: "Университет кампусындағы студенттер",
      stats: [
        { value: "10", label: "білім беру анықтамалығындағы жоо" },
        { value: "30", label: "айына 50 000 ₸ көлеміндегі стипендия" },
        { value: "Top-30", label: "үздік қатысушылардың кадр резерві" },
      ],
    },
    partners: {
      label: "анықтамалықтағы жоо",
      title: "Білім беру\nбағыттары.",
      prev: "Алдыңғы жоо",
      next: "Келесі жоо",
      note: "Анықтамалық білім беру бағытын таңдау үшін пайдаланылады. Қол қойылған келісімсіз жоо-ны орналастыру ресми серіктестікті білдірмейді.",
      universities: [
        { short: "АУМГ", logo: "/logos/aung.png", name: "Сафи Өтебаев атындағы Атырау мұнай және газ университеті", city: "Атырау" },
        { short: "АУ", logo: "/logos/au.png", name: "Халел Досмұхамедов атындағы Атырау университеті", city: "Атырау" },
        { short: "ХТҚУ", logo: "/logos/iuth.png", name: "Халықаралық туризм және меймандостық университеті", city: "Түркістан" },
        { short: "ШҚУ", logo: "/logos/vku.png", name: "С. Аманжолов атындағы Шығыс Қазақстан университеті", city: "Өскемен" },
        { short: "ШҚТУ", logo: "/logos/vktu.png", name: "Д. Серікбаев атындағы Шығыс Қазақстан техникалық университеті", city: "Өскемен" },
        { short: "ABU", logo: "/logos/abu.png", name: "Alikhan Bokeikhan University", city: "Семей" },
        { short: "ШУ", logo: "/logos/ush.png", name: "Семей қаласының Шәкәрім атындағы университеті", city: "Семей" },
        { short: "ҚТУ", logo: "/logos/ktu.png", name: "Әбілқас Сағынов атындағы Қарағанды техникалық университеті", city: "Қарағанды" },
        { short: "ОҚУ", logo: "/logos/auezov.png", name: "М. Әуезов атындағы Оңтүстік Қазақстан университеті", city: "Шымкент" },
        { short: "ҚУ", logo: "/logos/bu.png", name: "А. Байтұрсынов атындағы Қостанай университеті", city: "Қостанай" },
      ],
    },
    benefits: {
      label: "не алуға болады",
      title: "Үш нәтиже.\nБір конкурс.",
      items: [
        {
          index: "01",
          name: "Білім беру гранты",
          lead: "10 білім беру гранты.",
          text: "Конкурстық іріктеу қорытындысы бойынша ең күшті және уәжді қатысушылардың оқуын жабу.",
        },
        {
          index: "02",
          name: "Стипендия",
          lead: "30 стипендия.",
          text: "Әрқайсысы конкурстық іріктеу қорытындысы бойынша айына 50 000 ₸.",
        },
        {
          index: "03",
          name: "Top-30 кадр резерві",
          lead: "30 есім. Бір тізім.",
          text: "30 үздік қатысушының бірі мәртебесі және бағдарлама мүмкіндіктеріне қолжетімділік.",
        },
      ],
    },
    selection: {
      title: "Байланыс емес,\nкомиссия шешеді.",
      text: "Өтінімдер конкурстық іріктеуден өтеді. Бағаны бағдарламаның тәуелсіз комиссиясы береді.",
      marquee: ["Ашық конкурс", "Комиссияның тәуелсіз бағалауы", "Top-30"],
      imageAlt: "Бағдарламаның іріктеу комиссиясының отырысы",
      imageCaption: "Бағдарламаның тәуелсіз комиссиясы",
    },
    notices: {
      label: "ұсақ қаріпсіз",
      title: "Ашығын айтамыз.",
      items: [
        {
          id: "payment",
          lead: "Төлем нәтиже сатып алмайды.",
          title: "Төлем туралы маңызды ақпарат",
          text: "10 000 ₸ ұйымдастыру төлемі грант, стипендия алуға, финалға өтуге немесе Top-30 қатарына енуге кепілдік бермейді.",
        },
        {
          id: "status",
          lead: "Біз мемлекет емеспіз.",
          title: "Бағдарлама мәртебесі туралы",
          text: "QazEducation жеке бағдарлама болып табылады. Бұл мемлекеттік бағдарлама емес, мемлекеттік грант емес және мемлекеттік стипендия емес.",
        },
      ],
    },
    closing: {
      title: "Өтінім ашық.",
      text: "Әрі қарай тек іріктеу.",
    },
    footer: {
      about:
        "Қазақстан жастарын қолдауға арналған жыл сайынғы жеке білім беру және стипендиялық бағдарлама.",
      organizer: "Ұйымдастырушы: «Business International Group Partners» ЖШС.",
      contacts: {
        title: "Байланыс",
        support: { label: "Техқолдау", value: "+7 775 080 8041", href: "tel:+77750808041" },
        whatsapp: { label: "WhatsApp", value: "+7 775 080 8051", href: "https://wa.me/77750808051" },
        instagram: { label: "Instagram", value: "@edugrant.kz", href: "https://www.instagram.com/edugrant.kz" },
        website: { label: "Сайт", value: "qazeducation.kz", href: "https://qazeducation.kz" },
      },
      docsTitle: "Құжаттар",
      columns: [
        {
          title: "Бағдарлама",
          links: [
            { label: "Бағдарлама туралы", href: routes.about },
            { label: "Кім қатыса алады", href: routes.who },
            { label: "Не алуға болады", href: routes.what },
            { label: "Кезеңдер", href: routes.stages },
            { label: "Нәтижелер", href: routes.results },
            { label: "Сұрақтар", href: routes.faq },
          ],
        },
        {
          title: "Құжаттар",
          links: [
            { label: "Ашықтық", href: routes.transparency },
            { label: "Өтінімге арналған құжаттар", href: routes.documents },
          ],
        },
      ],
      disclaimer:
        "QazEducation жеке бағдарлама болып табылады. Бұл мемлекеттік бағдарлама емес, мемлекеттік грант емес және мемлекеттік стипендия емес.",
      copyright: "© 2026 «Business International Group Partners» ЖШС.",
    },
  },
};
