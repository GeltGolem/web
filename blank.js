window.eelib = {
    nav: {
        leftBtn: 'nav',
        downStyle: 'floating',
        noName: false,
        noIcon: false,
    },
    theme: {
        blackDown: true,
    }
};

window.eelib.pages = [
    {
        id: 'home',
        title: 'Main',
        description: 'General Elements',
        icon: 'img/ui/home.svg',
        btns: [
            ['search'],
        ],
    },
    {
        id: 'demo',
        title: 'Demo',
        icon: 'img/ui/text.svg',
        active: true,
        btns: [
            ['search'],
            ['add'],
            ['test', 'img/ui/code', 'window.notification.info("Test", "Clicked button")', 'Test'],
            ['test', 'img/ui/code', 'window.notification.info("Test", "Clicked button")', 'Test'],
            ['test', 'img/ui/code', 'window.notification.info("Test", "Clicked button")', 'Test'],
        ],
        subcategories: ['all', 'horizontal', 'vertical', 'special'],
        subpages: [
            'media',
            'tables',
        ],
        subpagesmode: 'default',
    },
    {
        id: 'about',
        title: 'About',
        icon: 'img/ui/user.svg',
        leftBtn: 'back',
        btns: [
            ['search'],
            ['add'],
            ['test', 'img/ui/code'],
        ],
        subpages: [
            'seek',
        ],
        subpagesmode: 'modal',
        noNav: true,
    },
    {
        id: 'cards',
        title: 'Cards',
        icon: 'img/ui/edit.svg',
    },
    {
        id: 'buttons',
        title: 'Buttons',
        icon: 'img/ui/edit.svg',
        leftBtn: 'none',
    },
    {
        id: 'seek',
        title: 'SeekBar',
        icon: 'img/ui/spliter.svg',
        subcategories: ['all', 'horizontal', 'vertical', 'special'],
        leftBtn: 'back',
    },
    {
        id: 'media',
        title: 'Медиа',
        icon: 'img/ui/image.svg',
        leftBtn: 'back',
    },
    {
        id: 'tables',
        title: 'Таблицы',
        icon: 'img/ui/list/list.svg',
        leftBtn: 'back',
    },
    {
        id: 'settings',
        title: 'Настройки',
        icon: 'img/ui/settings.svg',
        noBottom: true,
    },
]

window.eelib.translations = {}

window.eelib.settingsConfig = {
    storageKey: 'appSettings',
    defaultSettings: {
        weather: {
            town: '',
            location: [0, 0],
            unit: "C",
            background: false,
            pageBackground: false,
            },
        clock: {
            clockFormat: "24",
            showSeconds: false,
            showDate: true,
            dateFormat: "DDMMYYYY",
            timeZone: "local",
            showDayOfWeek: true,
            leadingZero: true,
            amPm: false,
            showYear: true,
            monthAsText: false,
            dateSeparator: "/",
            jucheCalendar: false,
        },
        main: {
            theme: "dark",
        },
    },
    schema: {
        clock: {
            title: "Clock",
            items: [
                {
                    type: "select",
                    key: "clockFormat",
                    label: "Clock Format",
                    options: { "12": "12-hour", "24": "24-hour" }
                },
                { type: "toggle", key: "showSeconds", label: "Show Seconds" },
                { type: "toggle", key: "showDate", label: "Show Date" }
            ]
        },
        weather: {
            title: "Weather",
            items: [
                { type: "toggle", key: "background", label: "Weather Background" },
                { type: "toggle", key: "pageBackground", label: "Page Background" }
            ]
        },
        main: {
            title: "Main",
            items: [
                {
                    type: "select",
                    key: "theme",
                    label: "Theme",
                    options: { "dark": "Dark", "light": "Light", "oled": "Black OLED" }
                },
            ]
        },
    },
    onChange: (settings) => {
        // Вызывается при любом изменении настроек
        if (typeof updateTimeDisplay === 'function') {
        updateTimeDisplay();
        }
    }
}