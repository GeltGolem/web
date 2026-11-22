// Вкладки языков на главной: JavaScript / Pascal / C# / C++ / Python.
// Каждая вкладка переключает реальный курс, а не только меняет заголовок.
document.addEventListener('DOMContentLoaded', () => {
    const buttons = document.querySelectorAll('#home .page-header-btns .btnsList button');

    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            const key = (window.normalizeLangKey || ((text) => String(text).trim().toLowerCase()))(btn.textContent);
            if (window.switchLang) window.switchLang(key);
        });
    });

    // Подсветим вкладку, на которой остановился пользователь
    const current = window.getCourseLang ? window.getCourseLang() : 'pascal';
    buttons.forEach(btn => {
        const key = (window.normalizeLangKey || ((text) => String(text).trim().toLowerCase()))(btn.textContent);
        btn.classList.toggle('active', key === current);
    });
});
