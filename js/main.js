import { PASCAL_MODULES, JS_MODULES, PY_MODULES, CS_MODULES, CPP_MODULES } from './courses.js';
import MascotController from './mascot.js';
import { GLOSSARY, linkTerms } from './glossary.js?v=20261128j';

// ─── STATE ────────────────────────────────────────────────────────────────────
let xp = 0;
let hearts = 3;
let currentModuleIdx = 0;
let currentLessonIdx = 0;
let currentQIdx = 0;
let lessonIntroPending = false;
let selectedOption = null;
let shuffledQuestions = [];
// lessonCompleted[moduleIdx][lessonIdx]
let lessonCompleted = [
    [false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false]
];
// trophyTestDone[moduleIdx]
let trophyTestDone = [false, false, false, false, false];
let lessonErrors = 0;
let answered = false;
let errorQuestions = []; // questions answered wrongly, shown at end
let isReviewMode = false; // true when replaying error questions
let reviewRound = 0; // how many review rounds have happened
let isIntroLesson = false; // подготовительный урок для полных новичков
let introDone = false;

// perfectLessons[moduleIdx][lessonIdx] = true if completed with 0 errors ever
let perfectLessons = [
    [false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false]
];
// perfectTests[moduleIdx] = true if trophy test done with 0 errors
let perfectTests = [false, false, false, false, false];
let trophyScores = [0, 0, 0, 0, 0];
let lessonRunXP = 0;
let trophyRunXP = 0;
let trophyFirstAttempt = true;
let lessonStartTs = 0;
let fastestLessonMs = 0;
let totalStudyMs = 0;
let typedCorrectInTest = false;
let unlockedAchievements = new Set();

// ─── TROPHY TEST STATE ────────────────────────────────────────────────────────
let trophyQuestions = [];
let trophyQIdx = 0;
let trophyHearts = 3;
let trophyErrors = 0;
let trophyCorrect = 0;
let trophyAnswered = false;
let trophyTypedAnswer = '';
const usedTrophyChips = new Set();

// ─── CHARACTER STATE ──────────────────────────────────────────────────────────
let charState = {
    body: 0, outfit: 0, mask: 0, bg: 0,
    tempBody: 0, tempOutfit: 0, tempMask: 0, tempBg: 0,
};

// ─── SAVE / LOAD ──────────────────────────────────────────────────────────────
const SAVE_KEY = 'geltcode_save_v2';
const LEGACY_SAVE_KEY = 'geltcode_save_v1';
const SAVE_VERSION = 2;
const DAILY_KEY = 'geltcode_daily_v2';

function todayKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function emptyDaily() {
    return {
        date: todayKey(),
        lessons: 0,
        tasks: 0,
        correct: 0,
        goal: 15,
        history: {}
    };
}

function loadDaily() {
    try {
        const raw = localStorage.getItem(DAILY_KEY);
        const data = raw ? JSON.parse(raw) : null;
        if (!data || data.date !== todayKey()) return emptyDaily();
        return Object.assign(emptyDaily(), data, { date: todayKey() });
    } catch (e) { return emptyDaily(); }
}

let dailyStats = loadDaily();

function saveDaily() {
    try { localStorage.setItem(DAILY_KEY, JSON.stringify(dailyStats)); } catch (e) { }
}

function recordAnswer(correct) {
    dailyStats.tasks++;
    if (correct) dailyStats.correct++;
    const key = todayKey();
    dailyStats.history[key] = (dailyStats.history[key] || 0) + (correct ? 12 : 4);
    saveDaily();
}

function recordLessonDone() {
    dailyStats.lessons++;
    const key = todayKey();
    dailyStats.history[key] = (dailyStats.history[key] || 0) + 20;
    saveDaily();
}

function saveState() {
    try {
        const data = {
            saveVersion: SAVE_VERSION,
            xp, hearts,
            lessonCompleted,
            trophyTestDone, trophyErrors, trophyScores,
            perfectLessons, perfectTests,
            charState: { body: charState.body, outfit: charState.outfit, mask: charState.mask, bg: charState.bg },
            unlockedSecrets: [...unlockedSecrets],
            profileData,
            level: profileData.level || 'zero',
            lang: currentLang,
            introDone,
            testMode,
            fastestLessonMs, totalStudyMs, typedCorrectInTest,
            unlockedAchievements: [...unlockedAchievements],
            progressByLang: serializeProgress(),
            emperorMode: _emperorMode,
            avatarPhoto: _avaImg ? (() => { try { const c = document.getElementById('ava-upload-canvas'); return c ? c.toDataURL('image/jpeg', 0.85) : null; } catch (e) { return null; } })() : null,
        };
        localStorage.setItem(SAVE_KEY, JSON.stringify(data));
        localStorage.removeItem(LEGACY_SAVE_KEY);
        // Cloud save if user has a username (тестовый режим, только локально)
        if (profileData.username && !testMode && window._fb) {
            window._fb.saveCloud(profileData.username, data);
        }
    } catch (e) { }
}

function loadState() {
    try {
        let raw = localStorage.getItem(SAVE_KEY);
        let legacy = false;
        if (!raw) {
            raw = localStorage.getItem(LEGACY_SAVE_KEY);
            legacy = !!raw;
        }
        if (!raw) return;
        let d;
        try { d = JSON.parse(raw); } catch (e) { return; }
        if (d.xp !== undefined) xp = d.xp;
        if (d.hearts !== undefined) hearts = Math.min(d.hearts, 3);
        if (d.lessonCompleted) {
            // migrate old flat array to new nested
            if (Array.isArray(d.lessonCompleted) && !Array.isArray(d.lessonCompleted[0])) {
                lessonCompleted[0] = d.lessonCompleted;
            } else {
                lessonCompleted = d.lessonCompleted;
                // Migrate old 5-lesson arrays to 10 by padding with false
                for (let mi = 0; mi < lessonCompleted.length; mi++) {
                    while (lessonCompleted[mi].length < 10) lessonCompleted[mi].push(false);
                }
            }
        }
        if (d.trophyTestDone !== undefined) {
            if (typeof d.trophyTestDone === 'boolean') {
                trophyTestDone[0] = d.trophyTestDone;
            } else {
                trophyTestDone = d.trophyTestDone;
            }
        }
        if (d.trophyErrors !== undefined) trophyErrors = d.trophyErrors;
        if (d.trophyScores !== undefined) trophyScores = normalizeScores(d.trophyScores, trophyTestDone.length);
        if (Number.isFinite(d.fastestLessonMs)) fastestLessonMs = Math.max(0, d.fastestLessonMs);
        if (Number.isFinite(d.totalStudyMs)) totalStudyMs = Math.max(0, d.totalStudyMs);
        typedCorrectInTest = !!d.typedCorrectInTest;
        if (Array.isArray(d.unlockedAchievements)) unlockedAchievements = new Set(d.unlockedAchievements);
        if (d.perfectLessons) {
            perfectLessons = d.perfectLessons;
            for (let mi = 0; mi < perfectLessons.length; mi++) {
                while (perfectLessons[mi].length < 10) perfectLessons[mi].push(false);
            }
        }
        if (d.perfectTests) perfectTests = d.perfectTests;
        if (d.charState) {
            charState.body = d.charState.body || 0;
            charState.outfit = d.charState.outfit || 0;
            charState.mask = d.charState.mask || 0;
            charState.bg = d.charState.bg || 0;
        }
        if (d.unlockedSecrets) unlockedSecrets = new Set(d.unlockedSecrets);
        if (d.profileData) profileData = Object.assign(profileData, d.profileData);
        if (d.level) profileData.level = d.level;
        if (d.testMode !== undefined) {
            testMode = !!d.testMode;
            if (testMode) localStorage.setItem(TEST_MODE_KEY, '1');
            else localStorage.removeItem(TEST_MODE_KEY);
        }
        if (d.lang && COURSES[d.lang]) {
            currentLang = d.lang;
            MODULES = COURSES[d.lang];
        }
        if (d.progressByLang) hydrateProgress(d.progressByLang);
        else {
            const lang = d.lang && COURSES[d.lang] ? d.lang : 'pascal';
            const progress = snapshotLangProgress();
            progress.introDone = !!d.introDone;
            PROGRESS_BY_LANG[lang] = progress;
        }
        applyLangProgress(currentLang);
        if (legacy) saveState();
        // Re-register username in registry (in case of first load on new device)
        if (profileData.username) {
            try {
                const reg = JSON.parse(localStorage.getItem(USERNAME_REGISTRY_KEY) || '{}');
                const norm = profileData.username.toLowerCase().replace(/[^a-z0-9_.]/g, '');
                if (!reg[norm]) { reg[norm] = { saveId: SAVE_KEY, registeredAt: new Date().toISOString() }; localStorage.setItem(USERNAME_REGISTRY_KEY, JSON.stringify(reg)); }
            } catch (e) { }
        }
        // Restore saved photo if any (works for all users now)
        const photoData = d.avatarPhoto || d.emperorPhoto;
        if (photoData) {
            setTimeout(() => {
                const img = new Image();
                img.onload = function () {
                    _avaImg = img;
                    const canvas = document.getElementById('ava-upload-canvas');
                    if (canvas) { canvas.style.display = 'block'; drawAvaUpload(); }
                    syncAvaChrome();
                };
                img.src = photoData;
            }, 400);
        }
    } catch (e) { }
}


const CHAR_BODIES = [
    // idx 0 – Dragon Anonymous (default)
    { label: '🐲', colors: ['#1e6b10', '#0f3a06'], name: 'Дракон', special: 'dragon_anon' },
    // idx 1-5 – standard humans
    { label: '🧑', colors: ['#FDBCB4', '#c97b5a'], name: 'Светлый' },
    { label: '🧑🏻', colors: ['#F0C896', '#b07a3a'], name: 'Загорелый' },
    { label: '🧑🏿', colors: ['#8D5524', '#5c3010'], name: 'Тёмный' },
    { label: '🤖', colors: ['#4A41C0', '#2C2763'], name: 'Робот' },
    { label: '👽', colors: ['#1a6b2a', '#0a3015'], name: 'Инопланетянин' },
    { label: '💀', colors: ['#333', '#111'], name: 'Скелет' },
    // idx 7 – SECRET: Raccoon Dev (code: RACCOONDEV)
    { label: '🦝', colors: ['#555566', '#333344'], name: '???', special: 'raccoon_dev', secret: true },
    // idx 8 – SECRET: Emperor (code: EMPEROR77)
    { label: '⚔️', colors: ['#f2e4da', '#d4b8a8'], name: '???', special: 'emperor', secret: true },
];

// Secret character unlock codes
const SECRET_CODES = {
    'RACCOONDEV': 7,
    'EMPEROR77': 8,
};
let unlockedSecrets = new Set();

// ─── DEVELOPER ACCOUNTS (reserved usernames, cannot be claimed by others) ────
const DEV_ACCOUNTS = {
    'imperor': { displayName: 'Imperor', role: 'Основатель & Frontend', icon: '👑', color: '#ffc800', titleId: 'dev_blood', pwdHash: 'f7a3c2e1b4d6a8f0' /* EMPEROR77 secret */ },
    'eenot': { displayName: 'EEnot', role: 'Backend & Sandbox', icon: '⚙️', color: '#1CB0F6', titleId: 'dev_tech', pwdHash: 'a9c3d5e7b1f2a4c6' /* RACCOONDEV secret */ },
};
const USERNAME_REGISTRY_KEY = 'geltcode_usernames_v1';

// ─── PASSWORD SYSTEM ──────────────────────────────────────────────────────────
// Simple non-cryptographic hash (djb2 variant), good enough for local storage
function hashPassword(pwd) {
    let h = 5381;
    for (let i = 0; i < pwd.length; i++) h = ((h << 5) + h) ^ pwd.charCodeAt(i);
    return (h >>> 0).toString(16).padStart(8, '0');
}

// Единая нормализация имени пользователя (строчный, без небезопасных символов)
function normalizeUsername(username) {
    return (username || '').toLowerCase().replace(/[^a-z0-9_.]/g, '');
}


let _pendingSetupUsername = '';
let _pendingSetupName = '';
let _pendingSetupBio = '';

function showPasswordLoginModal(username) {
    document.getElementById('pwd-modal-username').textContent = '@' + username;
    document.getElementById('pwd-modal-input').value = '';
    document.getElementById('pwd-modal-error').textContent = '';
    document.getElementById('password-login-modal').style.display = 'flex';
    setTimeout(() => document.getElementById('pwd-modal-input').focus(), 150);
}

function closePasswordLoginModal() {
    document.getElementById('password-login-modal').style.display = 'none';
    _pendingSetupUsername = '';
}

function confirmPasswordLogin() {
    const pwd = document.getElementById('pwd-modal-input').value;
    const errEl = document.getElementById('pwd-modal-error');
    const username = _pendingSetupUsername;
    if (!pwd) { errEl.textContent = '❗ Введи пароль'; return; }

    const normalized = username.toLowerCase().replace(/[^a-z0-9_.]/g, '');
    const enteredHash = hashPassword(pwd);


    errEl.textContent = '⏳ Проверяем...';
    document.getElementById('pwd-modal-input').disabled = true;

    const checkAndLoad = async () => {
        mascotEvent('loading');
        // Check password via Firebase if available
        let pwdResult = 'error';
        if (window._fb) {
            pwdResult = await window._fb.checkPwd(username, enteredHash);
        } else {
            // Fallback: local registry
            try {
                const reg = JSON.parse(localStorage.getItem(USERNAME_REGISTRY_KEY) || '{}');
                const entry = reg[normalized];
                if (!entry) pwdResult = 'not_found';
                else if (!entry.pwdHash) pwdResult = 'ok'; // old account, no password
                else pwdResult = entry.pwdHash === enteredHash ? 'ok' : 'wrong';
            } catch (e) { pwdResult = 'error'; }
        }

        if (pwdResult === 'wrong') {
            errEl.textContent = '❌ Неверный пароль';
            document.getElementById('pwd-modal-input').disabled = false;
            vibrateWrong();
            return;
        }
        if (pwdResult === 'not_found') {
            errEl.textContent = '❌ Аккаунт не найден';
            document.getElementById('pwd-modal-input').disabled = false;
            return;
        }

        // Password OK, load cloud save
        errEl.textContent = '⏳ Загружаем прогресс...';
        let cloudData = null;
        if (window._fb) cloudData = await window._fb.loadCloud(username);

        closePasswordLoginModal();
        document.getElementById('pwd-modal-input').disabled = false;

        if (cloudData) {
            // Apply cloud save to local storage and reload
            try { localStorage.setItem(SAVE_KEY, JSON.stringify(cloudData)); } catch (e) { }
            showToast('☁️ Прогресс загружен!', 2000);
            setTimeout(() => location.reload(), 1500);
        } else {
            // No cloud save, just apply username
            applyUsername(username, _pendingSetupName, _pendingSetupBio);
            showToast('✅ Вход выполнен!', 1800);
        }
    };

    checkAndLoad().catch(() => {
        mascotEvent('error');
        errEl.textContent = '❌ Ошибка соединения';
        document.getElementById('pwd-modal-input').disabled = false;
    });
}

function applyUsername(username, name, bio) {
    profileData.name = name || profileData.name;
    profileData.username = username;
    profileData.bio = bio !== undefined ? bio : profileData.bio;
    // Update UI
    const editName = document.getElementById('edit-name');
    const editUser = document.getElementById('edit-username');
    const editBio = document.getElementById('edit-bio');
    if (editName) editName.value = profileData.name;
    if (editUser) editUser.value = username;
    if (editBio) editBio.value = profileData.bio;
    const dispName = document.querySelector('#profile .page-header h1');
    const dispUser = document.querySelector('#profile .page-header h3');
    if (dispName) dispName.textContent = profileData.name;
    if (dispUser) dispUser.textContent = '@' + username;
    renderDevBadgeIfNeeded();
    saveState();
    // Close setup screen if open
    const setupScreen = document.getElementById('profile-setup-screen');
    if (setupScreen && !setupScreen.classList.contains('hidden')) {
        setupScreen.classList.add('hidden');
        vibrateSuccess();
        setTimeout(() => checkAndShowStreak(), 400);
    } else {
        showToast('✅ Вход выполнен!', 1800);
    }
}

// Returns { taken: bool, isOwn: bool, isDev: bool }
function checkUsernameAvailability(username, currentSaveId) {
    const normalized = username.toLowerCase().replace(/[^a-z0-9_.]/g, '');
    if (DEV_ACCOUNTS.hasOwnProperty(normalized)) {
        // Dev username, only allow if current save has dev secret (secret codes still required to *register*)
        const isImperor = normalized === 'imperor' && unlockedSecrets.has(8);
        const isEEnot = normalized === 'eenot' && unlockedSecrets.has(7);
        if (isImperor || isEEnot) return { taken: false, isOwn: true, isDev: true };
        // Not owning secret, show password modal (can login via dev password)
        return { taken: true, isOwn: false, isDev: true };
    }
    try {
        const reg = JSON.parse(localStorage.getItem(USERNAME_REGISTRY_KEY) || '{}');
        const entry = reg[normalized];
        if (!entry) return { taken: false, isOwn: false, isDev: false };
        if (entry.saveId === currentSaveId) return { taken: false, isOwn: true, isDev: false };
        return { taken: true, isOwn: false, isDev: false, registeredAt: entry.registeredAt };
    } catch (e) {
        return { taken: false, isOwn: false, isDev: false };
    }
}

function registerUsername(username, saveId, pwdHash) {
    try {
        const normalized = username.toLowerCase().replace(/[^a-z0-9_.]/g, '');
        const reg = JSON.parse(localStorage.getItem(USERNAME_REGISTRY_KEY) || '{}');
        // Free previous username if changed
        Object.keys(reg).forEach(k => { if (reg[k].saveId === saveId && k !== normalized) delete reg[k]; });
        // Preserve existing password if not provided
        const existing = reg[normalized] || {};
        reg[normalized] = { saveId, registeredAt: existing.registeredAt || new Date().toISOString(), pwdHash: pwdHash || existing.pwdHash };
        localStorage.setItem(USERNAME_REGISTRY_KEY, JSON.stringify(reg));
    } catch (e) { }
}

function applyDevAccount(username) {
    const normalized = username.toLowerCase().replace(/[^a-z0-9_.]/g, '');
    const dev = DEV_ACCOUNTS[normalized];
    if (!dev) return;
    // Auto-equip dev title
    profileData.equippedTitleId = dev.titleId;
    updateEquippedTitle();
}

function isDevUsername(username) {
    return DEV_ACCOUNTS.hasOwnProperty(username.toLowerCase().replace(/[^a-z0-9_.]/g, ''));
}

// Outfits: full SVG torso drawn in buildCharSVG based on id
const CHAR_OUTFITS = [
    { id: 'tshirt_blue', name: 'Синяя футболка', c1: '#3a7bd5', c2: '#2a5ba5', c3: '#1e4a8a' },
    { id: 'tshirt_green', name: 'Зелёная футболка', c1: '#27ae60', c2: '#1e8a48', c3: '#145e30' },
    { id: 'hoodie', name: 'Худи', c1: '#555e6b', c2: '#3a434f', c3: '#252d38' },
    { id: 'robe', name: 'Мантия', c1: '#1a1a5a', c2: '#10103a', c3: '#0a0a28' },
    { id: 'armor', name: 'Броня', c1: '#8a9aaa', c2: '#6a7a8a', c3: '#4a5a6a' },
    { id: 'ninja', name: 'Костюм ниндзя', c1: '#1a1a1a', c2: '#111', c3: '#000' },
    { id: 'wizard', name: 'Мантия мага', c1: '#6b2fa0', c2: '#4a1a70', c3: '#2a0a40' },
    { id: 'king', name: 'Королевский наряд', c1: '#c0880a', c2: '#906000', c3: '#603e00' },
    // SECRET: Raccoon Dev hoodie (only for raccoon_dev body)
    { id: 'dev_hoodie', name: 'Худи разраба', c1: '#1a1a2a', c2: '#0d0d1a', c3: '#050510', secret: 'raccoon_dev' },
    // SECRET: Emperor cloak (only for emperor body)
    { id: 'emperor_cloak', name: 'Форма Ракузана', c1: '#8b0000', c2: '#6a0000', c3: '#440000', secret: 'emperor' },
];

// Masks: each has an svg() function that draws it directly on face coords
const CHAR_MASKS = [
    {
        id: 'none', name: 'Нет маски', noMask: true,
        svg: () => ''
    },
    {
        id: 'glasses', name: 'Очки',
        preview: '😎',
        svg: () => `
      <!-- Glasses sitting right on eyes (eyes at y~31) -->
      <rect x="27" y="26" width="18" height="12" rx="6" fill="none" stroke="#111" stroke-width="2.5"/>
      <rect x="55" y="26" width="18" height="12" rx="6" fill="none" stroke="#111" stroke-width="2.5"/>
      <rect x="27" y="26" width="18" height="12" rx="6" fill="#111" opacity="0.25"/>
      <rect x="55" y="26" width="18" height="12" rx="6" fill="#111" opacity="0.25"/>
      <line x1="45" y1="32" x2="55" y2="32" stroke="#333" stroke-width="2"/>
      <line x1="27" y1="32" x2="21" y2="30" stroke="#333" stroke-width="2"/>
      <line x1="73" y1="32" x2="79" y2="30" stroke="#333" stroke-width="2"/>
    `
    },
    {
        id: 'fox', name: 'Маска лисы',
        preview: '🦊',
        svg: () => `
      <!-- Fox ear horns -->
      <path d="M23 22 L31 12 L39 22 Z" fill="#e0681a" stroke="#c04a00" stroke-width="0.8"/>
      <path d="M77 22 L69 12 L61 22 Z" fill="#e0681a" stroke="#c04a00" stroke-width="0.8"/>
      <path d="M26 22 L31 16 L36 22 Z" fill="#f5a87a"/>
      <path d="M74 22 L69 16 L64 22 Z" fill="#f5a87a"/>
      <!-- Fox face mask covering eyes+nose -->
      <path d="M24 18 Q50 10 76 18 Q78 28 76 40 Q50 48 24 40 Q22 28 24 18Z" fill="#e0681a" opacity="0.9"/>
      <!-- Eye holes -->
      <ellipse cx="37" cy="30" rx="9" ry="9" fill="#1a0800" opacity="0.85"/>
      <ellipse cx="63" cy="30" rx="9" ry="9" fill="#1a0800" opacity="0.85"/>
      <ellipse cx="37" cy="30" rx="6.5" ry="6.5" fill="#ffc060" opacity="0.95"/>
      <ellipse cx="63" cy="30" rx="6.5" ry="6.5" fill="#ffc060" opacity="0.95"/>
      <circle cx="37" cy="30" r="4" fill="#1a0800"/>
      <circle cx="63" cy="30" r="4" fill="#1a0800"/>
      <circle cx="38.5" cy="28.5" r="1.5" fill="white" opacity="0.85"/>
      <circle cx="64.5" cy="28.5" r="1.5" fill="white" opacity="0.85"/>
      <!-- White muzzle area -->
      <ellipse cx="50" cy="42" rx="12" ry="7" fill="#fff5ee" opacity="0.9"/>
      <!-- Nose -->
      <ellipse cx="50" cy="40" rx="4" ry="3" fill="#c04a00"/>
      <circle cx="50" cy="39" r="2" fill="#8a2800"/>
      <!-- Smile -->
      <path d="M43 44 Q50 50 57 44" stroke="#8a2800" stroke-width="1.5" fill="none"/>
      <!-- Whiskers -->
      <line x1="30" y1="42" x2="43" y2="43" stroke="#8a2800" stroke-width="0.8" opacity="0.7"/>
      <line x1="57" y1="43" x2="70" y2="42" stroke="#8a2800" stroke-width="0.8" opacity="0.7"/>
      <line x1="30" y1="44" x2="43" y2="44" stroke="#8a2800" stroke-width="0.8" opacity="0.5"/>
      <line x1="57" y1="44" x2="70" y2="44" stroke="#8a2800" stroke-width="0.8" opacity="0.5"/>
    `
    },
    {
        id: 'skull', name: 'Маска черепа',
        preview: '💀',
        svg: () => `
      <!-- Full skull mask -->
      <ellipse cx="50" cy="32" rx="26" ry="28" fill="#eeeee0" opacity="0.97"/>
      <ellipse cx="50" cy="44" rx="15" ry="13" fill="#eeeee0" opacity="0.97"/>
      <!-- Cracks -->
      <path d="M50 8 L48 14 L52 20 L49 26" stroke="#ccc" stroke-width="1.2" fill="none"/>
      <path d="M36 12 Q30 16 32 24" stroke="#ccc" stroke-width="1" fill="none"/>
      <!-- Eye sockets -->
      <ellipse cx="36" cy="30" rx="10" ry="11" fill="#1a1a1a" opacity="0.95"/>
      <ellipse cx="64" cy="30" rx="10" ry="11" fill="#1a1a1a" opacity="0.95"/>
      <circle cx="36" cy="30" r="4" fill="#2a2aff" opacity="0.35"/>
      <circle cx="64" cy="30" r="4" fill="#2a2aff" opacity="0.35"/>
      <!-- Nose hole -->
      <path d="M46 40 L50 46 L54 40 Q50 36 46 40Z" fill="#222" opacity="0.7"/>
      <!-- Teeth grin -->
      <rect x="33" y="50" width="34" height="13" rx="5" fill="#ddd"/>
      <rect x="37" y="50" width="5" height="13" fill="#1a1a1a" opacity="0.8"/>
      <rect x="46" y="50" width="5" height="13" fill="#1a1a1a" opacity="0.8"/>
      <rect x="55" y="50" width="5" height="13" fill="#1a1a1a" opacity="0.8"/>
      <!-- Jaw detail -->
      <path d="M33 50 Q50 47 67 50" stroke="#bbb" stroke-width="1.5" fill="none"/>
    `
    },
    {
        id: 'lightning', name: 'Маска молнии',
        preview: '⚡',
        svg: () => `
      <!-- Full lightning mask -->
      <path d="M24 16 Q50 8 76 16 Q80 32 76 52 Q50 58 24 52 Q20 32 24 16Z" fill="rgba(15,15,55,0.92)"/>
      <!-- Eye lenses glowing -->
      <ellipse cx="37" cy="31" rx="10" ry="9" fill="rgba(0,0,0,0.4)"/>
      <ellipse cx="63" cy="31" rx="10" ry="9" fill="rgba(0,0,0,0.4)"/>
      <ellipse cx="37" cy="31" rx="8" ry="7" fill="#ffd700" opacity="0.92"/>
      <ellipse cx="63" cy="31" rx="8" ry="7" fill="#ffd700" opacity="0.92"/>
      <ellipse cx="37" cy="31" rx="5" ry="4" fill="#ff8c00"/>
      <ellipse cx="63" cy="31" rx="5" ry="4" fill="#ff8c00"/>
      <circle cx="37" cy="31" r="2.5" fill="#1a0500"/>
      <circle cx="63" cy="31" r="2.5" fill="#1a0500"/>
      <circle cx="38.5" cy="29.5" r="1.2" fill="white" opacity="0.7"/>
      <circle cx="64.5" cy="29.5" r="1.2" fill="white" opacity="0.7"/>
      <!-- Lightning bolt center -->
      <polygon points="53,16 48,28 53,27 47,44 56,28 51,29" fill="#ffd700" opacity="0.98"/>
      <!-- Glowing mouth slit -->
      <path d="M36 48 Q50 54 64 48" stroke="#ffd700" stroke-width="2.5" fill="none" opacity="0.8"/>
      <!-- Side accents -->
      <circle cx="23" cy="32" r="3" fill="#ffd700" opacity="0.6"/>
      <circle cx="77" cy="32" r="3" fill="#ffd700" opacity="0.6"/>
    `
    },
    {
        id: 'dragon', name: 'Маска дракона',
        preview: '🐲',
        svg: () => `
      <!-- Dragon horns -->
      <path d="M28 16 Q24 4 32 8 Q36 16 38 20 Z" fill="#2d7a1a" stroke="#1a5010" stroke-width="0.8"/>
      <path d="M72 16 Q76 4 68 8 Q64 16 62 20 Z" fill="#2d7a1a" stroke="#1a5010" stroke-width="0.8"/>
      <!-- Scales top -->
      <ellipse cx="40" cy="14" rx="6" ry="4" fill="#3a8a20" opacity="0.7"/>
      <ellipse cx="50" cy="11" rx="7" ry="4" fill="#3a8a20" opacity="0.7"/>
      <ellipse cx="60" cy="14" rx="6" ry="4" fill="#3a8a20" opacity="0.7"/>
      <!-- Main mask face -->
      <path d="M22 18 Q50 10 78 18 Q82 34 78 52 Q50 60 22 52 Q18 34 22 18Z" fill="#2d7a1a" opacity="0.95"/>
      <!-- Eye sockets -->
      <ellipse cx="37" cy="31" rx="11" ry="10" fill="#1a3a0a" opacity="0.95"/>
      <ellipse cx="63" cy="31" rx="11" ry="10" fill="#1a3a0a" opacity="0.95"/>
      <ellipse cx="37" cy="31" rx="8" ry="7" fill="#ff4400" opacity="0.97"/>
      <ellipse cx="63" cy="31" rx="8" ry="7" fill="#ff4400" opacity="0.97"/>
      <ellipse cx="37" cy="32" rx="5" ry="7" fill="#1a0000"/>
      <ellipse cx="63" cy="32" rx="5" ry="7" fill="#1a0000"/>
      <circle cx="38.5" cy="29.5" r="2" fill="#ff8800" opacity="0.8"/>
      <circle cx="64.5" cy="29.5" r="2" fill="#ff8800" opacity="0.8"/>
      <!-- Snout -->
      <path d="M36 46 Q50 54 64 46 Q64 56 50 60 Q36 56 36 46Z" fill="#1f6012"/>
      <!-- Nostrils -->
      <ellipse cx="46" cy="49" rx="3" ry="2" fill="#0f3a08"/>
      <ellipse cx="54" cy="49" rx="3" ry="2" fill="#0f3a08"/>
      <!-- Teeth -->
      <path d="M38 48 L41 55 M50 50 L50 57 M62 48 L59 55" stroke="#ddd" stroke-width="2" stroke-linecap="round"/>
      <!-- Scale texture lines -->
      <path d="M28 28 Q32 24 36 28" stroke="#1a5010" stroke-width="0.8" fill="none" opacity="0.5"/>
      <path d="M64 28 Q68 24 72 28" stroke="#1a5010" stroke-width="0.8" fill="none" opacity="0.5"/>
    `
    },
    {
        id: 'robot', name: 'Робо-маска',
        preview: '🤖',
        svg: () => `
      <!-- Robot mask full face plate -->
      <rect x="22" y="14" width="56" height="46" rx="10" fill="#1e2d3d" opacity="0.97" stroke="#4a5a6a" stroke-width="1.5"/>
      <rect x="22" y="14" width="56" height="12" rx="10" fill="#2a3d52" opacity="0.8"/>
      <!-- Side ear nodes -->
      <rect x="18" y="26" width="6" height="12" rx="3" fill="#1e2d3d" stroke="#4a5a6a" stroke-width="1"/>
      <rect x="76" y="26" width="6" height="12" rx="3" fill="#1e2d3d" stroke="#4a5a6a" stroke-width="1"/>
      <circle cx="21" cy="32" r="2" fill="#00e5ff" opacity="0.7"/>
      <circle cx="79" cy="32" r="2" fill="#00e5ff" opacity="0.7"/>
      <!-- Visor bar across eyes -->
      <rect x="26" y="22" width="48" height="20" rx="5" fill="#001a2a" opacity="0.9"/>
      <!-- Eye screens -->
      <rect x="28" y="24" width="19" height="16" rx="3" fill="#00e5ff" opacity="0.85"/>
      <rect x="53" y="24" width="19" height="16" rx="3" fill="#00e5ff" opacity="0.85"/>
      <circle cx="37" cy="32" r="5" fill="#003a4a"/>
      <circle cx="63" cy="32" r="5" fill="#003a4a"/>
      <circle cx="37" cy="32" r="3" fill="#00e5ff" opacity="0.7"/>
      <circle cx="63" cy="32" r="3" fill="#00e5ff" opacity="0.7"/>
      <circle cx="38" cy="31" r="1.5" fill="white" opacity="0.85"/>
      <circle cx="64" cy="31" r="1.5" fill="white" opacity="0.85"/>
      <!-- Scanning line animation hint -->
      <rect x="28" y="31" width="19" height="2" rx="1" fill="white" opacity="0.3"/>
      <rect x="53" y="31" width="19" height="2" rx="1" fill="white" opacity="0.3"/>
      <!-- Grill mouth -->
      <rect x="30" y="47" width="40" height="10" rx="5" fill="#001a2a" opacity="0.9"/>
      <rect x="34" y="49" width="5" height="6" rx="1" fill="#00e5ff" opacity="0.55"/>
      <rect x="42" y="49" width="5" height="6" rx="1" fill="#00e5ff" opacity="0.55"/>
      <rect x="50" y="49" width="5" height="6" rx="1" fill="#00e5ff" opacity="0.55"/>
      <rect x="58" y="49" width="5" height="6" rx="1" fill="#00e5ff" opacity="0.55"/>
      <!-- Top vents -->
      <rect x="36" y="16" width="6" height="2" rx="1" fill="#4a5a6a" opacity="0.7"/>
      <rect x="45" y="16" width="6" height="2" rx="1" fill="#4a5a6a" opacity="0.7"/>
      <rect x="54" y="16" width="6" height="2" rx="1" fill="#4a5a6a" opacity="0.7"/>
    `
    },
    {
        id: 'moon', name: 'Лунная маска',
        preview: '🌙',
        svg: () => `
      <!-- Moon mask – dark with star eyes -->
      <path d="M23 16 Q50 8 77 16 Q81 32 77 52 Q50 60 23 52 Q19 32 23 16Z" fill="#050520" opacity="0.94"/>
      <!-- Crescent detail on side -->
      <path d="M23 24 Q16 32 23 44 Q19 32 23 24Z" fill="#ffc800" opacity="0.5"/>
      <!-- Star/moon eyes -->
      <ellipse cx="37" cy="31" rx="10" ry="9" fill="#0a0a20"/>
      <ellipse cx="63" cy="31" rx="10" ry="9" fill="#0a0a20"/>
      <ellipse cx="37" cy="31" rx="8" ry="7" fill="#c8d8ff" opacity="0.9"/>
      <ellipse cx="63" cy="31" rx="8" ry="7" fill="#c8d8ff" opacity="0.9"/>
      <ellipse cx="35" cy="30" rx="5" ry="4" fill="#8898ff" opacity="0.55"/>
      <ellipse cx="61" cy="30" rx="5" ry="4" fill="#8898ff" opacity="0.55"/>
      <circle cx="37" cy="31" r="3" fill="#1a1a3a"/>
      <circle cx="63" cy="31" r="3" fill="#1a1a3a"/>
      <circle cx="38.5" cy="29.5" r="1.2" fill="#c8d8ff" opacity="0.7"/>
      <circle cx="64.5" cy="29.5" r="1.2" fill="#c8d8ff" opacity="0.7"/>
      <!-- Moon smile -->
      <path d="M38 48 Q50 56 62 48" stroke="#8898ff" stroke-width="2.5" fill="none" opacity="0.9"/>
      <!-- Stars scattered on mask -->
      <circle cx="30" cy="22" r="1.5" fill="#ffc800" opacity="0.9"/>
      <circle cx="70" cy="22" r="1.5" fill="#ffc800" opacity="0.9"/>
      <polygon points="50,14 51.5,18 56,18 52.5,20.5 54,25 50,22.5 46,25 47.5,20.5 44,18 48.5,18" fill="#ffc800" opacity="0.7" transform="scale(0.55) translate(41,6)"/>
      <circle cx="74" cy="36" r="1" fill="#c8d8ff" opacity="0.5"/>
      <circle cx="26" cy="44" r="1" fill="#c8d8ff" opacity="0.4"/>
    `
    },
];

const CHAR_BGS = [
    { id: 'dark', name: 'Тёмный', fill: '#1A222C' },
    { id: 'blue', name: 'Синий', fill: '#1e2d6b' },
    { id: 'purple', name: 'Фиолетовый', fill: '#3b1f6b' },
    { id: 'green', name: 'Зелёный', fill: '#0e3d1e' },
    { id: 'red', name: 'Красный', fill: '#5a1a1a' },
    { id: 'gold', name: 'Золотой', fill: '#4a3800' },
    { id: 'space', name: 'Космос', fill: '#0d0d1a', dots: true, reqXP: 200 },
    { id: 'forest', name: 'Лес', fill: '#0a2010', lines: '#1a4a20', reqXP: 200 },
    { id: 'volcano', name: 'Вулкан', fill: '#1a0808', lines: '#4a1a00', reqXP: 400 },
    { id: 'ocean', name: 'Океан', fill: '#001a3a', lines: '#003060', reqXP: 400 },
    { id: 'galaxy', name: 'Галактика', fill: '#0d0020', lines: '#3a1a60', reqXP: 800 },
    { id: 'golden', name: 'Золото', fill: '#1a1000', lines: '#5a3a00', reqXP: 1500 },
];

const BANNER_COLORS = [
    { id: 'blue', g: 'linear-gradient(160deg,#1e2d6b,#0d1b3e,var(--bg))', color: '#3a5fbf' },
    { id: 'purple', g: 'linear-gradient(160deg,#3b1f6b,#1a0d3e,var(--bg))', color: '#6b3fbf' },
    { id: 'green', g: 'linear-gradient(160deg,#0e3d1e,#071a0d,var(--bg))', color: '#1a6b30' },
    { id: 'red', g: 'linear-gradient(160deg,#5a1a1a,#280d0d,var(--bg))', color: '#8b2020' },
    { id: 'teal', g: 'linear-gradient(160deg,#0d3a3a,#051f1f,var(--bg))', color: '#1a6b6b' },
    { id: 'gold', g: 'linear-gradient(160deg,#4a3800,#221900,var(--bg))', color: '#8b6a00' },
];

const BANNER_PATTERNS = [
    { id: 'none', label: 'Нет', class: '' },
    { id: 'dots', label: 'Точки', class: 'pattern-dots' },
    { id: 'grid', label: 'Сетка', class: 'pattern-grid' },
    { id: 'diag', label: 'Диаг', class: 'pattern-diag' },
    { id: 'waves', label: 'Волны', class: 'pattern-waves' },
];

let profileData = {
    name: '', username: '', bio: '',
    bannerId: 'blue', patternId: 'none',
    equippedTitleId: null,
    artifact: null,
    level: 'zero',
    lang: 'pascal',
};

// ─── УРОВНИ ПОДГОТОВКИ ────────────────────────────────────────────────────────
const LEVELS = {
    zero: { icon: '🌱', title: 'Новичок', desc: 'Только начинаю, объясняй по шагам', color: '#58CC02' },
    some: { icon: '📘', title: 'Продолжающий', desc: 'Знаю основы, давай больше практики', color: '#1CB0F6' },
    good: { icon: '⚡', title: 'Профи', desc: 'Пишу код уверенно, дай сложные задачи', color: '#FFC800' },
};

// Тестовый режим: все модули, уроки и финальные тесты доступны сразу.
const TEST_MODE_KEY = 'geltcode_test_mode';
let testMode = localStorage.getItem(TEST_MODE_KEY) === '1';

// ─── ИКОНКИ В СТИЛЕ ONE UI (чистые outline SVG) ───────────────────────────────
const UI_ICONS = {
    'arrow-left': '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
    'trophy': '<path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M17 5h3v2a3 3 0 0 1-3 3"/><path d="M7 5H4v2a3 3 0 0 0 3 3"/>',
    'heart': '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8Z"/>',
    'bulb': '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2Z"/>',
    'keyboard': '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"/>',
    'check': '<path d="m5 13 4 4L19 7"/>',
    'camera': '<path d="M4 7h3l2-3h6l2 3h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z"/><circle cx="12" cy="13" r="4"/>',
    'trash': '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6"/>',
    'crown': '<path d="m3 7 4 4 5-7 5 7 4-4-2 12H5L3 7Z"/>',
    'gear': '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>',
    'books': '<path d="M4 5h6v14H4zM14 5h6v14h-6zM10 8l4-2v12l-4 2"/>',
    'close': '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    'lock': '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    'book': '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>',
    'code': '<path d="m8 17-5-5 5-5"/><path d="m16 7 5 5-5 5"/><path d="m14 4-4 16"/>',
    'layers': '<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
    'rocket': '<path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2 0-2.7-.7-.7-1.9-.7-3-.3Z"/><path d="m12 15-3-3a22 22 0 0 1 7-7c2.5-1.5 5-1 5-1s.5 2.5-1 5a22 22 0 0 1-7 7Z"/><path d="M9 12H5s.5-3 3-4"/><path d="M12 15v4s3-.5 4-3"/>',
    'star': '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1L12 2Z"/>',
    'play': '<path d="m8 5 11 7-11 7V5Z"/>',
    'rune': '<path d="M6 2v20M6 7l12-4M6 14l12-5"/>',
    'runeLit': '<path d="M6 2v20M6 5l12 5M6 13l12 5"/>',
    'rune2': '<path d="M5 2v20M5 2h11l4 6H5M5 10l14 12"/>',
    'rune3': '<path d="M12 2v20M12 10 4 2M12 10l8-8"/>',
    'shard': '<path d="M6 2v20M6 5l12 7-12 7"/>'
};
const MODULE_ICON_NAMES = ['rune', 'shard', 'rune2', 'rune3', 'runeLit'];

function iconSvg(name, cls = '') {
    return `<svg class="ui-icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${UI_ICONS[name] || UI_ICONS.rune}</svg>`;
}
function renderIcons(root = document) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('[data-icon]').forEach(el => {
        if (el.dataset.iconDone) return;
        el.innerHTML = iconSvg(el.dataset.icon);
        el.dataset.iconDone = '1';
    });
}
window.iconSvg = iconSvg;
window.renderIcons = renderIcons;

const LANG_ENERGY = {
    javascript: '#2fe08a',
    cpp: '#6cd8ff',
    pascal: '#4f7cff',
    csharp: '#b073ff',
    python: '#4fd1c5',
};
const LANG_RUNES = {
    javascript: ['kenaz', 'othala', 'algiz', 'thurisaz', 'isa'],
    cpp: ['isa', 'berkano', 'othala', 'kenaz', 'algiz'],
    pascal: ['kenaz', 'algiz', 'othala', 'sowilo', 'isa'],
    csharp: ['thurisaz', 'sowilo', 'kenaz', 'isa', 'algiz'],
    python: ['raido', 'kenaz', 'othala', 'sowilo', 'isa'],
};
const NODE_RUNES = {
    fehu: 'M4 7L20 4M4 14L20 11M4 21L20 18M7 4L4 21',
    ansuz: 'M4 6L20 10M4 14L20 18M7 4L4 21',
    raido: 'M5 4L18 9L6 14M6 14L18 21',
    kenaz: 'M19 3L5 13L19 23',
    algiz: 'M12 3L8 23M11 10L3 5M10 14L21 6M9 17L19 22',
    othala: 'M13 2L22 10L13 18L4 10ZM4 10L2 24M22 10L24 24',
    thurisaz: 'M6 5L19 12L6 19M6 12L3 23',
    sowilo: 'M5 4L17 4L8 12L18 12L6 22L19 22',
    isa: 'M12 3L7 23',
    berkano: 'M6 3L18 8L6 14L19 21M6 14L4 23',
};

function runePath(name) {
    return NODE_RUNES[name] || NODE_RUNES.fehu;
}

function lessonNodeSvg(name) {
    const d = runePath(name);
    return `<svg class="stone-node lesson-node" viewBox="0 0 82 64" fill="none" aria-hidden="true">
    <ellipse class="stone-shadow" cx="41" cy="60" rx="33" ry="3.5"/>
    <g class="stone-pebbles">
      <path class="pebble-face" d="M0 49L4 46L8 49V57L4 60L0 57Z"/>
      <path class="pebble-top" d="M0 49L4 46L8 49L4 52Z"/>
      <path class="pebble-side" d="M0 49L4 52V60L0 57Z"/>
      <path class="pebble-shade" d="M8 49L4 52V60L8 57Z"/>
      <path class="pebble-face" d="M74 49L78 46L82 49V57L78 60L74 57Z"/>
      <path class="pebble-top" d="M74 49L78 46L82 49L78 52Z"/>
      <path class="pebble-side" d="M74 49L78 52V60L74 57Z"/>
      <path class="pebble-face" d="M35 58L39 56L43 58V64L39 67L35 64Z"/>
      <path class="pebble-top" d="M35 58L39 56L43 58L39 61Z"/>
      <path class="pebble-side" d="M35 58L39 61V67L35 64Z"/>
    </g>
    <path class="stone-bottom" d="M16 16H66L76 26V52L66 62H16L6 52V26Z"/>
    <path class="stone-face" d="M16 6H66L76 16V42L66 52H16L6 42V16Z"/>
    <path class="stone-side" d="M6 16L16 8V52L6 42Z"/>
    <path class="stone-shade" d="M66 8L76 18V42L66 52Z"/>
    <path class="stone-top" d="M16 6H66L76 16V21L66 11H16L6 21V16Z"/>
    <path class="stone-highlight" d="M16 6H66L76 16"/>
    <path class="stone-chip" d="M22 8L28 10L25 12"/>
    <path class="stone-chip" d="M52 8L58 9L56 11"/>
    <path class="stone-chip" d="M68 17L71 19L68 20"/>
    <path class="stone-inner" d="M18 12H64L72 20V40L64 48H18L10 40V20Z"/>
    <path class="stone-outline" d="M16 6H66L76 16V42L66 52H16L6 42V16Z"/>
    <path class="hit-crack" d="M12 26L19 31L16 39"/>
    <path class="hit-crack" d="M70 25L63 31L66 39"/>
    <path class="hit-crack" d="M32 49L38 45L44 49"/>
    <g transform="translate(27 15) scale(1.1)">
      <path class="rune-cavity" d="${d}"/>
      <path class="rune-edge" d="${d}"/>
      <path class="rune-glyph" d="${d}"/>
    </g>
  </svg>`;
}

function practiceNodeSvg(first, second) {
    const a = runePath(first);
    const b = runePath(second);
    return `<svg class="stone-node practice-node" viewBox="0 0 86 64" fill="none" aria-hidden="true">
    <ellipse class="stone-shadow" cx="43" cy="61" rx="35" ry="3.5"/>
    <g class="stone-pebbles">
      <path class="pebble-face" d="M0 48L4 45L8 48V56L4 59L0 56Z"/>
      <path class="pebble-top" d="M0 48L4 45L8 48L4 51Z"/>
      <path class="pebble-side" d="M0 48L4 51V59L0 56Z"/>
      <path class="pebble-shade" d="M8 48L4 51V59L8 56Z"/>
      <path class="pebble-face" d="M78 48L82 45L86 48V56L82 59L78 56Z"/>
      <path class="pebble-top" d="M78 48L82 45L86 48L82 51Z"/>
      <path class="pebble-side" d="M78 48L82 51V59L78 56Z"/>
      <path class="pebble-face" d="M37 58L41 56L45 58V64L41 67L37 64Z"/>
      <path class="pebble-top" d="M37 58L41 56L45 58L41 61Z"/>
    </g>
    <path class="stone-bottom" d="M43 13L77 20V45L70 57L43 64L16 57L9 45V20Z"/>
    <path class="stone-face" d="M43 5L75 12V37L68 49L43 56L18 49L11 37V12Z"/>
    <path class="stone-side" d="M11 12L18 9V49L11 37Z"/>
    <path class="stone-shade" d="M75 9L68 12V49L75 37Z"/>
    <path class="stone-top" d="M43 5L75 12V18L43 11L11 18V12Z"/>
    <path class="stone-highlight" d="M43 5L75 12"/>
    <path class="stone-chip" d="M24 8L30 10L27 12"/>
    <path class="stone-chip" d="M55 8L61 9L59 11"/>
    <path class="stone-inner" d="M43 11L70 16V36L64 46L43 52L22 46L16 36V16Z"/>
    <path class="stone-outline" d="M43 5L75 12V37L68 49L43 56L18 49L11 37V12Z"/>
    <path class="hit-crack" d="M16 25L22 30L19 38"/>
    <path class="hit-crack" d="M70 25L64 30L67 38"/>
    <g transform="translate(14 17) scale(0.85)">
      <path class="rune-cavity" d="${a}"/>
      <path class="rune-edge" d="${a}"/>
      <path class="rune-glyph" d="${a}"/>
    </g>
    <g transform="translate(47 17) scale(0.85)">
      <path class="rune-cavity" d="${b}"/>
      <path class="rune-edge" d="${b}"/>
      <path class="rune-glyph" d="${b}"/>
    </g>
  </svg>`;
}

function trophyNodeSvg(name, level) {
    const d = runePath(name);
    const levelClass = level ? ` monument-${level}` : '';
    const body = level
        ? `<ellipse class="stone-shadow" cx="39" cy="71" rx="29" ry="3"/>
    <g class="stone-pebbles">
      <path class="pebble-face" d="M0 48L5 45L10 48V56L5 60L0 56Z"/>
      <path class="pebble-top" d="M0 48L5 45L10 48L5 52Z"/>
      <path class="pebble-side" d="M0 48L5 52V60L0 56Z"/>
      <path class="pebble-face" d="M68 45L73 42L78 45V53L73 57L68 53Z"/>
      <path class="pebble-top" d="M68 45L73 42L78 45L73 49Z"/>
      <path class="pebble-side" d="M68 45L73 49V57L68 53Z"/>
      <path class="pebble-face" d="M58 64L63 61L68 64V70L63 74L58 70Z"/>
      <path class="pebble-top" d="M58 64L63 61L68 64L63 67Z"/>
    </g>
    <path class="stone-bottom" d="M20 17H58L66 26V63L58 73H20L12 63V26Z"/>
    <path class="stone-face" d="M20 8H58L66 17V54L58 63H20L12 54V17Z"/>
    <path class="stone-side" d="M12 17L20 9V63L12 54Z"/>
    <path class="stone-shade" d="M58 9L66 18V54L58 63Z"/>
    <path class="stone-top" d="M20 8H58L66 17V23L58 14H20L12 23V17Z"/>
    <path class="stone-highlight" d="M20 8H58L66 17"/>
    <path class="stone-chip" d="M26 10L32 12L29 14"/>
    <path class="stone-chip" d="M52 10L58 11L56 13"/>
    <path class="stone-inner" d="M22 14H56L62 21V51L56 57H22L16 51V21Z"/>
    <path class="stone-outline" d="M20 8H58L66 17V54L58 63H20L12 54V17Z"/>
    <path class="hit-crack" d="M20 30L27 35L24 43"/>
    <path class="hit-crack" d="M58 28L51 35L54 43"/>`
        : `<ellipse class="stone-shadow" cx="39" cy="71" rx="31" ry="3"/>
    <g class="stone-pebbles">
      <path class="pebble-face" d="M0 52L5 49L10 52V60L5 64L0 60Z"/>
      <path class="pebble-top" d="M0 52L5 49L10 52L5 56Z"/>
      <path class="pebble-side" d="M0 52L5 56V64L0 60Z"/>
      <path class="pebble-face" d="M68 50L73 47L78 50V58L73 62L68 58Z"/>
      <path class="pebble-top" d="M68 50L73 47L78 50L73 54Z"/>
      <path class="pebble-side" d="M68 50L73 54V62L68 58Z"/>
      <path class="pebble-face" d="M53 64L58 61L63 64V70L58 74L53 70Z"/>
      <path class="pebble-top" d="M53 64L58 61L63 64L58 67Z"/>
    </g>
    <path class="stone-bottom" d="M12 54H66L72 62V72H6V62Z"/>
    <path class="stone-face" d="M12 45H66L72 53V62H6V53Z"/>
    <path class="stone-top" d="M12 45H66L72 53H6Z"/>
    <path class="stone-highlight" d="M12 45H66L72 53"/>
    <path class="stone-chip" d="M18 47L24 49L21 51"/>
    <path class="stone-chip" d="M56 47L62 49L59 51"/>
    <path class="stone-pillar" d="M24 26H54V46H24Z"/>
    <path class="stone-pillar-top" d="M24 26H54L58 31H20Z"/>
    <path class="stone-outline" d="M12 45H66L72 53V62H6V53Z"/>
    <path class="hit-crack" d="M20 55L26 58L31 54"/>`;
    return `<svg class="stone-node trophy-node${levelClass}" viewBox="0 0 78 74" fill="none" aria-hidden="true">
    ${body}
    <g transform="translate(24 19) scale(1.1)">
      <path class="rune-cavity" d="${d}"/>
      <path class="rune-edge" d="${d}"/>
      <path class="rune-glyph" d="${d}"/>
    </g>
  </svg>`;
}

function nodeClass(status) {
    if (status === 'active') return 'node active';
    if (status === 'done') return 'node done';
    return 'node locked';
}

function monumentLevel(pct) {
    if (pct >= 90) return 100;
    if (pct >= 50) return 67;
    return 33;
}

// ─── CHARACTER SVG BUILDER (Duolingo-style) ────────────────────────────────────
function buildCharSVG(bodyIdx, outfitIdx, maskIdx, bgIdx) {
    const body = CHAR_BODIES[bodyIdx] || CHAR_BODIES[0];
    const outfit = CHAR_OUTFITS[outfitIdx] || CHAR_OUTFITS[0];
    const maskDef = CHAR_MASKS[maskIdx] || CHAR_MASKS[0];
    const bgDef = CHAR_BGS[bgIdx] || CHAR_BGS[0];

    const sk = body.special === 'dragon_anon' ? '#1e6b10' : (body.special === 'emperor' ? '#f5e8e0' : (body.special === 'raccoon_dev' ? '#7a8090' : body.colors[0]));
    const skd = body.special === 'dragon_anon' ? '#0f3a06' : (body.special === 'emperor' ? '#e0c8b8' : (body.special === 'raccoon_dev' ? '#555566' : body.colors[1]));
    const c1 = outfit.c1 || '#3a7bd5';
    const c2 = outfit.c2 || '#2a5ba5';
    const c3 = outfit.c3 || '#1e4a8a';

    const isDragonAnon = body.special === 'dragon_anon';
    const isRaccoonDev = body.special === 'raccoon_dev';
    const isEmperor = body.special === 'emperor';
    const isRobot = bodyIdx === 4;
    const isAlien = bodyIdx === 5;
    const isSkeleton = bodyIdx === 6;

    // Background
    const bgFill = bgDef.fill || '#1A222C';
    const bgLines = bgDef.lines || null;
    const bgDots = bgDef.dots || false;
    let bgSVG = `<rect width="100" height="100" fill="${bgFill}"/>`;
    if (bgDots) {
        bgSVG += `<circle cx="15" cy="15" r="1" fill="white" opacity="0.5"/>
    <circle cx="35" cy="8" r="0.8" fill="white" opacity="0.4"/>
    <circle cx="60" cy="20" r="1.2" fill="white" opacity="0.6"/>
    <circle cx="80" cy="10" r="0.7" fill="white" opacity="0.3"/>
    <circle cx="90" cy="40" r="1" fill="white" opacity="0.5"/>
    <circle cx="10" cy="70" r="0.8" fill="white" opacity="0.4"/>
    <circle cx="75" cy="85" r="1" fill="white" opacity="0.3"/>
    <circle cx="25" cy="90" r="0.6" fill="white" opacity="0.4"/>`;
    } else if (bgLines) {
        bgSVG += `<path d="M0 70 Q25 60 50 72 Q75 84 100 70" stroke="${bgLines}" stroke-width="1.5" fill="none" opacity="0.6"/>
    <path d="M0 80 Q30 70 55 82 Q80 92 100 80" stroke="${bgLines}" stroke-width="1" fill="none" opacity="0.4"/>`;
    }

    // Arms (behind body), use special dark tones for secret chars
    const armSk = (isDragonAnon || isEmperor) ? '#0d0d1a' : (isRaccoonDev ? '#6a7080' : sk);
    const leftArm = `
    <rect x="10" y="66" width="20" height="22" rx="9" fill="${c1}"/>
    <rect x="10" y="66" width="20" height="10" rx="9" fill="${c2}" opacity="0.5"/>
    <ellipse cx="19" cy="89" rx="9" ry="6" fill="${armSk}"/>`;
    const rightArm = `
    <rect x="70" y="66" width="20" height="22" rx="9" fill="${c1}"/>
    <rect x="70" y="66" width="20" height="10" rx="9" fill="${c2}" opacity="0.5"/>
    <ellipse cx="81" cy="89" rx="9" ry="6" fill="${armSk}"/>`;

    // Torso / Outfit
    let torsoExtra = '';
    let collarSVG = '';
    if (outfit.id === 'armor') {
        torsoExtra = `
      <rect x="27" y="66" width="46" height="6" rx="3" fill="${c3}" opacity="0.8"/>
      <rect x="30" y="72" width="17" height="12" rx="3" fill="${c2}"/>
      <rect x="53" y="72" width="17" height="12" rx="3" fill="${c2}"/>
      <rect x="27" y="84" width="46" height="5" rx="2" fill="${c3}" opacity="0.7"/>
      <ellipse cx="25" cy="67" rx="10" ry="5" fill="${c1}"/>
      <ellipse cx="75" cy="67" rx="10" ry="5" fill="${c1}"/>
      <ellipse cx="25" cy="66" rx="8" ry="3.5" fill="${c2}"/>
      <ellipse cx="75" cy="66" rx="8" ry="3.5" fill="${c2}"/>`;
        collarSVG = `<rect x="43" y="62" width="14" height="2" rx="1" fill="${c3}"/>`;
    } else if (outfit.id === 'hoodie') {
        torsoExtra = `
      <rect x="37" y="80" width="26" height="8" rx="4" fill="${c2}" opacity="0.7"/>
      <line x1="46" y1="65" x2="44" y2="80" stroke="${c3}" stroke-width="1.5"/>
      <line x1="54" y1="65" x2="56" y2="80" stroke="${c3}" stroke-width="1.5"/>`;
        collarSVG = `<path d="M40 63 Q50 69 60 63" stroke="${c3}" stroke-width="2" fill="none"/>`;
    } else if (outfit.id === 'robe') {
        torsoExtra = `
      <rect x="27" y="79" width="46" height="5" rx="2" fill="${c3}" opacity="0.9"/>
      <rect x="47" y="64" width="6" height="25" fill="${c3}" opacity="0.5"/>`;
        collarSVG = `<path d="M37 64 Q50 72 63 64" stroke="${c3}" stroke-width="2.5" fill="${c2}" opacity="0.8"/>`;
    } else if (outfit.id === 'ninja') {
        torsoExtra = `
      <rect x="27" y="75" width="46" height="7" rx="3" fill="#ff3030" opacity="0.85"/>
      <rect x="27" y="74" width="46" height="3" rx="1" fill="#cc0000"/>
      <line x1="50" y1="63" x2="50" y2="89" stroke="#333" stroke-width="1.5" opacity="0.7"/>`;
        collarSVG = `<rect x="43" y="62" width="14" height="6" rx="3" fill="#111"/>`;
    } else if (outfit.id === 'wizard') {
        torsoExtra = `
      <circle cx="38" cy="74" r="3" fill="#ffc800" opacity="0.85"/>
      <circle cx="62" cy="74" r="3" fill="#ffc800" opacity="0.85"/>
      <rect x="27" y="80" width="46" height="4" rx="2" fill="${c3}"/>`;
        collarSVG = `<path d="M36 64 Q50 73 64 64" fill="${c3}" stroke="${c3}" stroke-width="1"/>`;
    } else if (outfit.id === 'king') {
        torsoExtra = `
      <rect x="27" y="63" width="46" height="6" rx="3" fill="#f5f0e8"/>
      <circle cx="36" cy="66" r="2" fill="#111" opacity="0.7"/>
      <circle cx="46" cy="66" r="2" fill="#111" opacity="0.7"/>
      <circle cx="56" cy="66" r="2" fill="#111" opacity="0.7"/>
      <circle cx="66" cy="66" r="2" fill="#111" opacity="0.7"/>
      <rect x="27" y="80" width="46" height="6" rx="3" fill="#ffc800"/>
      <rect x="46" y="80" width="8" height="6" rx="2" fill="#ff9900"/>
      <ellipse cx="26" cy="67" rx="9" ry="4" fill="#ffc800"/>
      <ellipse cx="74" cy="67" rx="9" ry="4" fill="#ffc800"/>`;
    } else if (outfit.id === 'dev_hoodie') {
        torsoExtra = `
      <rect x="27" y="75" width="46" height="8" rx="4" fill="#0d0d1a" opacity="0.9"/>
      <rect x="37" y="76" width="26" height="8" rx="4" fill="#050510" opacity="0.8"/>
      <line x1="50" y1="63" x2="50" y2="89" stroke="#00ff88" stroke-width="1" opacity="0.6"/>
      <rect x="30" y="68" width="16" height="9" rx="2" fill="#001a0d" stroke="#00ff88" stroke-width="0.8" opacity="0.9"/>
      <text x="31.5" y="74" font-size="3.5" fill="#00ff88" font-family="monospace">&lt;/&gt;</text>
      <rect x="27" y="63" width="3" height="37" rx="1" fill="#00ff88" opacity="0.15"/>
      <rect x="70" y="63" width="3" height="37" rx="1" fill="#00ff88" opacity="0.15"/>`;
        collarSVG = `<path d="M40 63 Q50 69 60 63" stroke="#00ff88" stroke-width="1.5" fill="none" opacity="0.7"/>`;
    } else if (outfit.id === 'emperor_cloak') {
        // ── RAKUZAN HIGH BASKETBALL JERSEY – Akashi #4, peak form ──
        torsoExtra = `
      <!-- Jersey base top layer: slightly darker upper chest panel -->
      <rect x="27" y="63" width="46" height="16" rx="8" fill="#990000" opacity="0.5"/>
      <!-- Sides gold pinstripes -->
      <rect x="27" y="63" width="2.5" height="37" fill="#cc8800" opacity="0.9"/>
      <rect x="70.5" y="63" width="2.5" height="37" fill="#cc8800" opacity="0.9"/>
      <!-- Secondary inner pinstripe -->
      <rect x="30.5" y="63" width="1" height="37" fill="#ffcc44" opacity="0.4"/>
      <rect x="68.5" y="63" width="1" height="37" fill="#ffcc44" opacity="0.4"/>
      <!-- Rakuzan "R" crest on left chest -->
      <circle cx="37" cy="72" r="5.5" fill="#7a0000" stroke="#cc8800" stroke-width="1.2"/>
      <circle cx="37" cy="72" r="4" fill="#8b0000"/>
      <text x="37" y="74.5" text-anchor="middle" font-size="5.5" font-weight="900" fill="#cc8800" font-family="Georgia, serif">R</text>
      <!-- Jersey number 4 – bold center -->
      <text x="50" y="86" text-anchor="middle" font-size="20" font-weight="900" fill="white" font-family="Arial Black, Impact, sans-serif" opacity="0.95">4</text>
      <!-- Number outline for depth -->
      <text x="50.5" y="86.5" text-anchor="middle" font-size="20" font-weight="900" fill="#cc8800" font-family="Arial Black, Impact, sans-serif" opacity="0.25">4</text>
      <!-- Shoulder panels – sporty raglan style -->
      <path d="M27 63 Q35 59 42 63 L42 74 Q35 70 27 74Z" fill="#7a0000" opacity="0.85"/>
      <path d="M73 63 Q65 59 58 63 L58 74 Q65 70 73 74Z" fill="#7a0000" opacity="0.85"/>
      <!-- Shoulder gold edge -->
      <path d="M27 63 Q35 59 42 63" stroke="#cc8800" stroke-width="1.2" fill="none"/>
      <path d="M73 63 Q65 59 58 63" stroke="#cc8800" stroke-width="1.2" fill="none"/>
      <!-- Captain armband on left arm -->
      <rect x="10" y="70" width="18" height="7" rx="3" fill="#cc8800"/>
      <rect x="11" y="71" width="16" height="5" rx="2" fill="#e8aa00"/>
      <text x="19" y="76" text-anchor="middle" font-size="5" font-weight="900" fill="#660000" font-family="Arial Black, sans-serif">C</text>
      <!-- Emperor Eye glow mark on right chest (subtle power aura) -->
      <circle cx="63" cy="72" r="4" fill="#cc0000" opacity="0.18"/>
      <circle cx="63" cy="72" r="2.5" fill="#ff2222" opacity="0.22"/>
      <circle cx="63" cy="72" r="1.2" fill="#ff6666" opacity="0.3"/>
      <!-- Bottom hem gold stripe -->
      <rect x="27" y="96" width="46" height="4" rx="2" fill="#cc8800" opacity="0.7"/>`;
        collarSVG = `
      <!-- Deep V-neck collar – dark red with gold trim -->
      <path d="M35 63 L50 75 L65 63" fill="#8b0000" stroke="none"/>
      <path d="M35 63 L50 75 L65 63" fill="none" stroke="#cc8800" stroke-width="1.5"/>
      <!-- Inner collar shadow -->
      <path d="M38 63 L50 72 L62 63" fill="#660000" opacity="0.4"/>`;
    } else {
        collarSVG = `<path d="M44 63 L50 67 L56 63" stroke="${c2}" stroke-width="1.5" fill="none" opacity="0.8"/>`;
    }

    const torsoSVG = `
    <rect x="27" y="63" width="46" height="37" rx="10" fill="${c1}"/>
    <rect x="27" y="63" width="46" height="14" rx="10" fill="${c2}" opacity="0.4"/>
    ${torsoExtra}
    ${collarSVG}`;

    // Neck
    const neckSVG = `
    <rect x="44" y="58" width="12" height="10" rx="5" fill="${sk}"/>
    <rect x="44" y="62" width="12" height="5" fill="${skd}" opacity="0.25"/>`;

    // Head – big & round Duolingo style
    let headSVG = '';
    if (isRobot) {
        headSVG = `
      <rect x="22" y="12" width="56" height="48" rx="14" fill="${sk}"/>
      <rect x="22" y="12" width="56" height="16" rx="14" fill="${skd}" opacity="0.35"/>
      <rect x="48" y="4" width="4" height="10" rx="2" fill="${skd}"/>
      <circle cx="50" cy="3" r="5" fill="#FFC800"/>
      <circle cx="22" cy="36" r="5" fill="${skd}"/>
      <circle cx="78" cy="36" r="5" fill="${skd}"/>
      <rect x="28" y="22" width="18" height="14" rx="4" fill="#001a2a"/>
      <rect x="54" y="22" width="18" height="14" rx="4" fill="#001a2a"/>
      <rect x="29" y="23" width="16" height="12" rx="3" fill="#00E5FF" opacity="0.9"/>
      <rect x="55" y="23" width="16" height="12" rx="3" fill="#00E5FF" opacity="0.9"/>
      <circle cx="37" cy="29" r="4.5" fill="#001a2a"/>
      <circle cx="63" cy="29" r="4.5" fill="#001a2a"/>
      <circle cx="38.5" cy="27.5" r="1.8" fill="white" opacity="0.8"/>
      <circle cx="64.5" cy="27.5" r="1.8" fill="white" opacity="0.8"/>
      <rect x="30" y="43" width="40" height="10" rx="5" fill="#00E5FF" opacity="0.15" stroke="#00E5FF" stroke-width="0.8"/>
      <rect x="33" y="45" width="6" height="6" rx="1" fill="#001a2a"/>
      <rect x="42" y="45" width="6" height="6" rx="1" fill="#001a2a"/>
      <rect x="52" y="45" width="6" height="6" rx="1" fill="#001a2a"/>
      <rect x="61" y="45" width="6" height="6" rx="1" fill="#001a2a"/>`;
    } else if (isAlien) {
        headSVG = `
      <ellipse cx="50" cy="30" rx="28" ry="32" fill="${sk}"/>
      <ellipse cx="50" cy="24" rx="24" ry="20" fill="${sk}"/>
      <ellipse cx="50" cy="28" rx="26" ry="28" fill="${skd}" opacity="0.2"/>
      <ellipse cx="36" cy="32" rx="10" ry="12" fill="#40e080"/>
      <ellipse cx="64" cy="32" rx="10" ry="12" fill="#40e080"/>
      <ellipse cx="36" cy="32" rx="6" ry="8" fill="#003318"/>
      <ellipse cx="64" cy="32" rx="6" ry="8" fill="#003318"/>
      <ellipse cx="34" cy="29" rx="2.5" ry="3" fill="#60ff90" opacity="0.5"/>
      <ellipse cx="62" cy="29" rx="2.5" ry="3" fill="#60ff90" opacity="0.5"/>
      <path d="M40 48 Q50 43 60 48" stroke="#40e080" stroke-width="2" fill="none" stroke-linecap="round"/>
      <ellipse cx="47" cy="44" rx="2" ry="1.5" fill="${skd}" opacity="0.5"/>
      <ellipse cx="53" cy="44" rx="2" ry="1.5" fill="${skd}" opacity="0.5"/>`;
    } else if (isSkeleton) {
        headSVG = `
      <ellipse cx="50" cy="32" rx="26" ry="28" fill="${sk}"/>
      <ellipse cx="50" cy="24" rx="24" ry="16" fill="${sk}"/>
      <ellipse cx="34" cy="42" rx="8" ry="5" fill="${skd}" opacity="0.3"/>
      <ellipse cx="66" cy="42" rx="8" ry="5" fill="${skd}" opacity="0.3"/>
      <ellipse cx="36" cy="30" rx="10" ry="11" fill="#111"/>
      <ellipse cx="64" cy="30" rx="10" ry="11" fill="#111"/>
      <ellipse cx="36" cy="30" rx="5" ry="5" fill="white" opacity="0.08"/>
      <ellipse cx="64" cy="30" rx="5" ry="5" fill="white" opacity="0.08"/>
      <path d="M45 40 L50 46 L55 40 Q50 37 45 40Z" fill="#111" opacity="0.6"/>
      <rect x="33" y="49" width="34" height="11" rx="4" fill="#111"/>
      <rect x="36" y="49" width="6" height="11" fill="${sk}"/>
      <rect x="46" y="49" width="6" height="11" fill="${sk}"/>
      <rect x="56" y="49" width="6" height="11" fill="${sk}"/>
      <path d="M50 10 L48 17 L52 23 L49 29" stroke="#aaa" stroke-width="1.2" fill="none" opacity="0.6"/>`;
    } else if (isDragonAnon) {
        // ─── FULL DRAGON HEAD – green scaled dragon with horns, snout, fangs ───
        headSVG = `
      <!-- Back horns -->
      <path d="M30 18 Q24 2 34 8 Q37 2 38 16 Z" fill="#1a5a0a" stroke="#0f3a06" stroke-width="0.8"/>
      <path d="M70 18 Q76 2 66 8 Q63 2 62 16 Z" fill="#1a5a0a" stroke="#0f3a06" stroke-width="0.8"/>
      <!-- Inner horn highlight -->
      <path d="M31 18 Q27 6 33 10 Q35 6 36 16 Z" fill="#2a7a18" opacity="0.7"/>
      <path d="M69 18 Q73 6 67 10 Q65 6 64 16 Z" fill="#2a7a18" opacity="0.7"/>
      <!-- Main dragon skull – wide and reptilian -->
      <ellipse cx="50" cy="28" rx="28" ry="22" fill="#1e6b10"/>
      <!-- Snout extends forward/down -->
      <path d="M30 36 Q50 52 70 36 Q72 48 68 56 Q50 66 32 56 Q28 48 30 36Z" fill="#1a6010"/>
      <!-- Scale texture rows on forehead -->
      <path d="M30 20 Q40 16 50 18 Q60 16 70 20" stroke="#0f3a06" stroke-width="1.2" fill="none" opacity="0.6"/>
      <path d="M28 26 Q38 21 50 23 Q62 21 72 26" stroke="#0f3a06" stroke-width="1" fill="none" opacity="0.5"/>
      <!-- Scale bumps top -->
      <circle cx="38" cy="19" r="2.5" fill="#2a8020" opacity="0.6"/>
      <circle cx="50" cy="16" r="3" fill="#2a8020" opacity="0.7"/>
      <circle cx="62" cy="19" r="2.5" fill="#2a8020" opacity="0.6"/>
      <!-- Brow ridges -->
      <path d="M26 28 Q35 22 44 26" stroke="#0f3a06" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <path d="M56 26 Q65 22 74 28" stroke="#0f3a06" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <!-- Eyes – vertical slit pupils, glowing amber -->
      <ellipse cx="36" cy="30" rx="10" ry="9" fill="#0a2a05"/>
      <ellipse cx="64" cy="30" rx="10" ry="9" fill="#0a2a05"/>
      <ellipse cx="36" cy="30" rx="7.5" ry="7" fill="#ff8c00" opacity="0.95"/>
      <ellipse cx="64" cy="30" rx="7.5" ry="7" fill="#ff8c00" opacity="0.95"/>
      <!-- Slit pupils -->
      <ellipse cx="36" cy="30" rx="2.5" ry="7" fill="#050a00"/>
      <ellipse cx="64" cy="30" rx="2.5" ry="7" fill="#050a00"/>
      <!-- Eye glow rim -->
      <ellipse cx="36" cy="30" rx="7.5" ry="7" fill="none" stroke="#ffcc00" stroke-width="0.7" opacity="0.7"/>
      <ellipse cx="64" cy="30" rx="7.5" ry="7" fill="none" stroke="#ffcc00" stroke-width="0.7" opacity="0.7"/>
      <circle cx="37.5" cy="27" r="2" fill="#ffe070" opacity="0.6"/>
      <circle cx="65.5" cy="27" r="2" fill="#ffe070" opacity="0.6"/>
      <!-- Nostrils -->
      <ellipse cx="44" cy="48" rx="3.5" ry="2.5" fill="#0a2a05"/>
      <ellipse cx="56" cy="48" rx="3.5" ry="2.5" fill="#0a2a05"/>
      <!-- Jaw / mouth line -->
      <path d="M30 50 Q50 58 70 50" stroke="#0a2a05" stroke-width="2" fill="none"/>
      <!-- Fangs -->
      <path d="M36 52 L33 62 L39 58 Z" fill="#e8e8d0"/>
      <path d="M44 55 L42 64 L48 60 Z" fill="#e8e8d0"/>
      <path d="M64 52 L67 62 L61 58 Z" fill="#e8e8d0"/>
      <path d="M56 55 L58 64 L52 60 Z" fill="#e8e8d0"/>
      <!-- Chin scales -->
      <ellipse cx="50" cy="60" rx="12" ry="6" fill="#2a8020" opacity="0.5"/>
      <!-- Side ear/jaw fins -->
      <path d="M22 28 Q16 24 18 36 Q22 32 26 34 Z" fill="#1a6010" stroke="#0f3a06" stroke-width="0.7"/>
      <path d="M78 28 Q84 24 82 36 Q78 32 74 34 Z" fill="#1a6010" stroke="#0f3a06" stroke-width="0.7"/>`;
    } else if (isRaccoonDev) {
        // ─── RACCOON DEVELOPER – masked hacker coder raccoon ───
        headSVG = `
      <!-- Fluffy raccoon head -->
      <ellipse cx="50" cy="32" rx="27" ry="29" fill="#7a8090"/>
      <!-- Ear tufts -->
      <path d="M27 14 Q23 3 31 8 Q33 3 35 12 Z" fill="#6a7080" stroke="#555" stroke-width="0.5"/>
      <path d="M73 14 Q77 3 69 8 Q67 3 65 12 Z" fill="#6a7080" stroke="#555" stroke-width="0.5"/>
      <path d="M28 14 Q25 7 30 10 Q32 7 33 13 Z" fill="#3a3040" opacity="0.6"/>
      <path d="M72 14 Q75 7 70 10 Q68 7 67 13 Z" fill="#3a3040" opacity="0.6"/>
      <!-- Classic raccoon bandit mask -->
      <path d="M22 23 Q37 17 50 22 Q63 17 78 23 Q80 36 76 42 Q63 48 50 44 Q37 48 24 42 Q20 36 22 23Z" fill="#2a2a35" opacity="0.95"/>
      <!-- White cheek patches -->
      <ellipse cx="35" cy="40" rx="8" ry="6" fill="#d0d0c0" opacity="0.9"/>
      <ellipse cx="65" cy="40" rx="8" ry="6" fill="#d0d0c0" opacity="0.9"/>
      <!-- Terminal/monitor eyes (dev theme) -->
      <rect x="27" y="24" width="18" height="14" rx="4" fill="#001a0d" stroke="#00ff88" stroke-width="1.2"/>
      <rect x="55" y="24" width="18" height="14" rx="4" fill="#001a0d" stroke="#00ff88" stroke-width="1.2"/>
      <!-- Screen glare -->
      <rect x="28" y="25" width="16" height="12" rx="3" fill="#001a0d" opacity="0.95"/>
      <rect x="56" y="25" width="16" height="12" rx="3" fill="#001a0d" opacity="0.95"/>
      <!-- Code text on eye-screens -->
      <text x="29" y="32" font-size="4" fill="#00ff88" font-family="monospace" opacity="0.9">&gt;_</text>
      <text x="57" y="32" font-size="4" fill="#00ff88" font-family="monospace" opacity="0.9">{ }</text>
      <rect x="29" y="33" width="10" height="1.5" rx="0.5" fill="#00ff88" opacity="0.5"/>
      <rect x="57" y="33" width="10" height="1.5" rx="0.5" fill="#00ff88" opacity="0.5"/>
      <!-- Snout -->
      <ellipse cx="50" cy="46" rx="10" ry="7" fill="#c0c0b0"/>
      <ellipse cx="50" cy="42" rx="4.5" ry="3" fill="#444455"/>
      <circle cx="50" cy="41" r="2" fill="#2a2a35"/>
      <!-- Dev logo badge on forehead -->
      <circle cx="50" cy="16" r="5" fill="#1a1a2a" stroke="#00ff88" stroke-width="1"/>
      <text x="47.5" y="19" font-size="5" fill="#00ff88" font-family="monospace" font-weight="bold">&lt;/&gt;</text>`;
    } else if (isEmperor) {
        // ─── AKASHI SEIJURO – Emperor Eye activated, peak form ───
        headSVG = `
      <!-- ── EMPEROR EYE AURA – outer crimson field ── -->
      <circle cx="64" cy="31" r="18" fill="#cc0000" opacity="0.07"/>
      <circle cx="64" cy="31" r="22" fill="#cc0000" opacity="0.04"/>
      <!-- ── HAIR – sharp crimson, swept right, anime style ── -->
      <!-- Back hair mass (deep burgundy) -->
      <path d="M23 30 Q21 12 27 7 Q31 2 35 9 Q38 3 42 10 Q46 3 50 9 Q55 3 60 9 Q64 4 68 11 Q73 6 77 16 Q79 24 78 31" fill="#6b0000"/>
      <!-- Mid hair layer -->
      <path d="M23 30 Q22 15 29 10 Q33 5 38 12 Q42 6 48 11 Q53 5 59 11 Q65 7 70 14 Q75 10 78 20 Q79 26 78 31" fill="#8b0000"/>
      <!-- Front hair sweep – Akashi's signature right-side part with bang -->
      <path d="M25 26 Q26 14 33 11 Q37 8 41 15 Q38 11 35 16 Q30 20 26 26Z" fill="#aa1111"/>
      <!-- Right side – hair falls over right shoulder -->
      <path d="M76 28 Q80 35 78 46 Q75 40 72 36 Q74 32 76 28Z" fill="#8b0000"/>
      <!-- Left side hair -->
      <path d="M23 30 Q19 36 21 44 Q23 38 27 35 Q24 33 23 30Z" fill="#8b0000"/>
      <!-- Hair highlight shine -->
      <path d="M34 10 Q42 6 50 10 Q43 8 35 13Z" fill="#cc2222" opacity="0.5"/>
      <path d="M55 8 Q63 5 70 11 Q63 8 56 13Z" fill="#cc2222" opacity="0.4"/>
      <!-- ── FACE – pale, sharp aristocratic ── -->
      <ellipse cx="50" cy="35" rx="25" ry="25" fill="#f2e4da"/>
      <!-- Jaw sharper/narrower (anime style) -->
      <path d="M29 44 Q33 58 50 63 Q67 58 71 44" fill="#f2e4da"/>
      <!-- Cheek shadows -->
      <ellipse cx="32" cy="43" rx="6" ry="4" fill="#ddb8a0" opacity="0.35"/>
      <ellipse cx="68" cy="43" rx="6" ry="4" fill="#ddb8a0" opacity="0.35"/>
      <!-- ── LEFT EYE – gold/amber (heterochromia) ── -->
      <!-- Eyelid shape (upper lid sharp for anime) -->
      <path d="M27 29 Q36 23 45 29 Q43 32 36 33 Q29 32 27 29Z" fill="white"/>
      <path d="M27 29 Q36 25 45 29" stroke="#8b4513" stroke-width="1.8" fill="none" stroke-linecap="round"/>
      <!-- Iris – warm amber gold -->
      <ellipse cx="36" cy="30" rx="6.5" ry="6.5" fill="#c8780a"/>
      <ellipse cx="36" cy="30" rx="5" ry="5" fill="#da8e14"/>
      <circle cx="36" cy="30" r="3.5" fill="#9b5800"/>
      <circle cx="36" cy="30" r="2.2" fill="#3a1a00"/>
      <!-- Gold shimmer -->
      <circle cx="37.5" cy="28" r="1.8" fill="white" opacity="0.9"/>
      <circle cx="35" cy="32" r="0.7" fill="white" opacity="0.4"/>
      <!-- Lower lid -->
      <path d="M27 29 Q36 35 45 29" stroke="#c09070" stroke-width="0.7" fill="none" opacity="0.6"/>
      <!-- ── RIGHT EYE – EMPEROR EYE activated (blazing crimson) ── -->
      <!-- Outer glow halos -->
      <circle cx="64" cy="30" r="14" fill="#cc0000" opacity="0.13"/>
      <circle cx="64" cy="30" r="12" fill="#ee0000" opacity="0.10"/>
      <!-- Eyelid white -->
      <path d="M55 28 Q64 22 73 28 Q71 32 64 33 Q57 32 55 28Z" fill="white"/>
      <!-- Red iris – Emperor Eye -->
      <ellipse cx="64" cy="30" rx="7" ry="7" fill="#dd0000"/>
      <ellipse cx="64" cy="30" rx="5.5" ry="5.5" fill="#ff1a1a"/>
      <!-- Pupil with depth -->
      <circle cx="64" cy="30" r="3.5" fill="#880000"/>
      <circle cx="64" cy="30" r="2" fill="#440000"/>
      <!-- Bright highlight -->
      <circle cx="66" cy="27.5" r="2.5" fill="white" opacity="0.92"/>
      <circle cx="62.5" cy="32" r="0.9" fill="white" opacity="0.5"/>
      <!-- Iris ring glow -->
      <ellipse cx="64" cy="30" rx="7" ry="7" fill="none" stroke="#ff5555" stroke-width="1.2" opacity="0.9"/>
      <ellipse cx="64" cy="30" rx="9" ry="9" fill="none" stroke="#cc0000" stroke-width="0.7" opacity="0.5"/>
      <!-- Emperor Eye light rays -->
      <line x1="64" y1="18" x2="64" y2="21" stroke="#ff4444" stroke-width="1.3" opacity="0.8"/>
      <line x1="73" y1="21" x2="71" y2="23" stroke="#ff4444" stroke-width="1.2" opacity="0.7"/>
      <line x1="76" y1="30" x2="73" y2="30" stroke="#ff4444" stroke-width="1.3" opacity="0.8"/>
      <line x1="73" y1="39" x2="71" y2="37" stroke="#ff3333" stroke-width="1" opacity="0.6"/>
      <!-- Upper eyelid line -->
      <path d="M55 28 Q64 22 73 28" stroke="#7a0000" stroke-width="2" fill="none" stroke-linecap="round"/>
      <!-- Lower lid -->
      <path d="M55 28 Q64 34 73 28" stroke="#c07070" stroke-width="0.8" fill="none" opacity="0.5"/>
      <!-- ── EYEBROWS – sharp, thin, aristocratic ── -->
      <path d="M26 22 Q36 17 44 21" stroke="#5a0000" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <path d="M56 21 Q64 16 74 22" stroke="#5a0000" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <!-- ── NOSE ── -->
      <path d="M48 43 Q50 47 52 43" stroke="#c09070" stroke-width="1" fill="none"/>
      <circle cx="48" cy="45" r="1.2" fill="#c09070" opacity="0.5"/>
      <circle cx="52" cy="45" r="1.2" fill="#c09070" opacity="0.5"/>
      <!-- ── LIPS – confident closed smirk ── -->
      <path d="M39 53 Q50 60 61 53" stroke="#bf7060" stroke-width="1.8" fill="none" stroke-linecap="round"/>
      <path d="M44 53 Q50 57 56 53" fill="#c07060" opacity="0.35"/>
      <!-- slight smirk right corner -->
      <path d="M58 53 Q62 51 63 53" stroke="#bf7060" stroke-width="1" fill="none" opacity="0.7"/>
      <!-- ── EARS ── -->
      <ellipse cx="24" cy="37" rx="4.5" ry="6.5" fill="#f0e0d0"/>
      <ellipse cx="24" cy="37" rx="2.5" ry="4" fill="#ddb8a0" opacity="0.5"/>
      <ellipse cx="76" cy="37" rx="4.5" ry="6.5" fill="#f0e0d0"/>
      <ellipse cx="76" cy="37" rx="2.5" ry="4" fill="#ddb8a0" opacity="0.5"/>`;
    } else {
        // Normal Duolingo-style head
        headSVG = `
      <ellipse cx="50" cy="63" rx="20" ry="5" fill="#000" opacity="0.12"/>
      <ellipse cx="50" cy="32" rx="27" ry="29" fill="${sk}"/>
      <ellipse cx="33" cy="42" rx="7" ry="4" fill="#ffaaaa" opacity="0.22"/>
      <ellipse cx="67" cy="42" rx="7" ry="4" fill="#ffaaaa" opacity="0.22"/>
      <ellipse cx="50" cy="55" rx="17" ry="5" fill="${skd}" opacity="0.28"/>
      <ellipse cx="37" cy="31" rx="8.5" ry="9.5" fill="white"/>
      <ellipse cx="63" cy="31" rx="8.5" ry="9.5" fill="white"/>
      <circle cx="37" cy="32" r="6" fill="#1a3a60"/>
      <circle cx="63" cy="32" r="6" fill="#1a3a60"/>
      <circle cx="37" cy="32" r="3.8" fill="#080e18"/>
      <circle cx="63" cy="32" r="3.8" fill="#080e18"/>
      <circle cx="39" cy="30" r="2" fill="white" opacity="0.95"/>
      <circle cx="65" cy="30" r="2" fill="white" opacity="0.95"/>
      <circle cx="36" cy="33" r="0.9" fill="white" opacity="0.5"/>
      <circle cx="62" cy="33" r="0.9" fill="white" opacity="0.5"/>
      <path d="M28 21 Q37 17 46 20" stroke="${skd}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <path d="M54 20 Q63 17 72 21" stroke="${skd}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <ellipse cx="50" cy="42" rx="3.5" ry="2.5" fill="${skd}" opacity="0.38"/>
      <path d="M38 49 Q50 59 62 49" stroke="${skd}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <path d="M40 49 Q50 57 60 49" stroke="white" stroke-width="1.5" fill="white" opacity="0.3"/>
      <ellipse cx="23" cy="34" rx="5" ry="8" fill="${sk}"/>
      <ellipse cx="23" cy="34" rx="3" ry="5" fill="${skd}" opacity="0.25"/>
      <ellipse cx="77" cy="34" rx="5" ry="8" fill="${sk}"/>
      <ellipse cx="77" cy="34" rx="3" ry="5" fill="${skd}" opacity="0.25"/>`;
    }

    // Hair (top of head, below mask)
    let hairSVG = '';
    if (!isRobot && !isSkeleton && !isDragonAnon && !isRaccoonDev && !isEmperor) {
        hairSVG = `
      <ellipse cx="50" cy="10" rx="27" ry="14" fill="${skd}"/>
      <ellipse cx="50" cy="12" rx="25" ry="12" fill="${skd}"/>
      <ellipse cx="32" cy="18" rx="10" ry="8" fill="${skd}"/>
      <ellipse cx="68" cy="18" rx="10" ry="8" fill="${skd}"/>`;
    }

    // Mask – sits ON TOP of everything (face layer)
    let maskSVG = '';
    if (!maskDef.noMask && maskDef.svg) {
        maskSVG = maskDef.svg();
    }

    return `
    <defs>
      <clipPath id="cclip"><rect x="0" y="0" width="100" height="115"/></clipPath>
    </defs>
    <g clip-path="url(#cclip)">
      ${bgSVG}
      ${leftArm}
      ${rightArm}
      ${torsoSVG}
      ${neckSVG}
      ${headSVG}
      ${hairSVG}
      ${maskSVG}
    </g>`;
}

function buildEmperorSVG() {
    return `
    <defs>
      <radialGradient id="emBg" cx="50%" cy="30%" r="75%">
        <stop offset="0%" stop-color="#1a0a1a"/>
        <stop offset="100%" stop-color="#08050a"/>
      </radialGradient>
      <radialGradient id="eyeR" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#ff2222" stop-opacity="0.7"/>
        <stop offset="100%" stop-color="#cc0000" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="eyeL" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#ff2222" stop-opacity="0.7"/>
        <stop offset="100%" stop-color="#cc0000" stop-opacity="0"/>
      </radialGradient>
    </defs>

    <!-- BG subtle dark -->
    <rect x="0" y="0" width="100" height="115" fill="url(#emBg)"/>

    <!-- ── BODY (small chibi) ── -->
    <!-- Legs / shorts – white with blue trim -->
    <rect x="37" y="97" width="10" height="14" rx="3" fill="#e8eef5"/>
    <rect x="53" y="97" width="10" height="14" rx="3" fill="#e8eef5"/>
    <rect x="36" y="105" width="12" height="3" rx="1" fill="#aac8e0"/>
    <rect x="52" y="105" width="12" height="3" rx="1" fill="#aac8e0"/>
    <!-- Shoes -->
    <ellipse cx="42" cy="112" rx="7" ry="3.5" fill="#f0f0f0"/>
    <ellipse cx="58" cy="112" rx="7" ry="3.5" fill="#f0f0f0"/>
    <rect x="36" y="109" width="12" height="4" rx="2" fill="#f0f0f0"/>
    <rect x="52" y="109" width="12" height="4" rx="2" fill="#f0f0f0"/>

    <!-- Arms -->
    <!-- Left arm -->
    <rect x="22" y="68" width="11" height="20" rx="5" fill="#f5e8e0"/>
    <ellipse cx="27" cy="88" rx="5.5" ry="4" fill="#f0e0d0"/>
    <!-- Right arm -->
    <rect x="67" y="68" width="11" height="20" rx="5" fill="#f5e8e0"/>
    <ellipse cx="73" cy="88" rx="5.5" ry="4" fill="#f0e0d0"/>

    <!-- Jersey body – white with blue accents -->
    <rect x="30" y="65" width="40" height="35" rx="7" fill="#f0f4f8"/>
    <!-- Jersey top shoulder panel dark -->
    <path d="M30 65 Q35 60 44 63 L44 70 Q35 68 30 72Z" fill="#1a1a2a"/>
    <path d="M70 65 Q65 60 56 63 L56 70 Q65 68 70 72Z" fill="#1a1a2a"/>
    <!-- Blue side stripes -->
    <rect x="30" y="65" width="3" height="35" rx="1" fill="#6ab0d8"/>
    <rect x="67" y="65" width="3" height="35" rx="1" fill="#6ab0d8"/>
    <!-- RAKUZAN text -->
    <text x="50" y="77" text-anchor="middle" font-size="5.5" font-weight="900" fill="#4a90c0" font-family="Arial Black, sans-serif" letter-spacing="0.5">RAKUZAN</text>
    <!-- Number 4 -->
    <text x="50" y="95" text-anchor="middle" font-size="19" font-weight="900" fill="#222" font-family="Arial Black, Impact, sans-serif">4</text>
    <!-- V-neck collar dark -->
    <path d="M40 65 L50 74 L60 65" fill="#1a1a2a"/>
    <path d="M40 65 L50 74 L60 65" fill="none" stroke="#1a1a2a" stroke-width="1"/>
    <!-- Captain armband -->
    <rect x="19" y="73" width="13" height="6" rx="2" fill="#cc8800"/>
    <text x="25.5" y="78" text-anchor="middle" font-size="5" font-weight="900" fill="#4a1a00" font-family="Arial Black">C</text>

    <!-- Neck -->
    <rect x="44" y="56" width="12" height="12" rx="5" fill="#f5e8e0"/>

    <!-- ── HEAD – big chibi, round ── -->
    <!-- Head base pale skin -->
    <ellipse cx="50" cy="36" rx="29" ry="28" fill="#f5e8e0"/>
    <!-- Cheek blush -->
    <ellipse cx="30" cy="44" rx="7" ry="4" fill="#f0a0a0" opacity="0.45"/>
    <ellipse cx="70" cy="44" rx="7" ry="4" fill="#f0a0a0" opacity="0.45"/>
    <!-- Ears -->
    <ellipse cx="21" cy="38" rx="4.5" ry="6" fill="#f5e0d0"/>
    <ellipse cx="21" cy="38" rx="2.5" ry="3.5" fill="#e8c8b8" opacity="0.5"/>
    <ellipse cx="79" cy="38" rx="4.5" ry="6" fill="#f5e0d0"/>
    <ellipse cx="79" cy="38" rx="2.5" ry="3.5" fill="#e8c8b8" opacity="0.5"/>

    <!-- ── HAIR – spiky red chibi style ── -->
    <!-- Back hair layer -->
    <ellipse cx="50" cy="18" rx="29" ry="22" fill="#7a1010"/>
    <!-- Spiky hair top – many sharp points -->
    <polygon points="50,2 53,10 58,1 60,11 65,3 66,12 71,6 70,14 74,10 72,18 50,16" fill="#8b1515"/>
    <polygon points="50,2 47,10 42,1 40,11 35,3 34,12 29,6 30,14 26,10 28,18 50,16" fill="#8b1515"/>
    <!-- Mid hair layer over forehead -->
    <ellipse cx="50" cy="22" rx="28" ry="18" fill="#8b1515"/>
    <!-- Front spikes over forehead -->
    <path d="M22 22 Q26 10 32 16 Q34 8 38 15 Q40 7 44 14 Q46 6 50 12 Q54 6 56 14 Q60 7 62 15 Q66 8 68 16 Q74 10 78 22" fill="#9b1818"/>
    <!-- Hair highlight -->
    <path d="M36 10 Q44 6 52 9 Q45 7 37 13Z" fill="#bb3333" opacity="0.6"/>
    <path d="M55 8 Q63 5 70 11 Q63 8 56 13Z" fill="#bb3333" opacity="0.4"/>

    <!-- ── EYEBROWS – sharp dark red, stern look ── -->
    <path d="M24 28 Q34 22 42 26" stroke="#5a0000" stroke-width="2.8" fill="none" stroke-linecap="round"/>
    <path d="M58 26 Q66 22 76 28" stroke="#5a0000" stroke-width="2.8" fill="none" stroke-linecap="round"/>
    <!-- Frown inner corners -->
    <path d="M38 27 Q40 25 42 26" stroke="#5a0000" stroke-width="1.5" fill="none"/>
    <path d="M58 26 Q60 25 62 27" stroke="#5a0000" stroke-width="1.5" fill="none"/>

    <!-- ── LEFT EYE – Emperor Eye red ── -->
    <ellipse cx="34" cy="35" rx="10" ry="9" fill="white"/>
    <!-- Aura glow -->
    <ellipse cx="34" cy="35" rx="13" ry="11" fill="url(#eyeL)"/>
    <ellipse cx="34" cy="35" rx="10" ry="9" fill="white"/>
    <!-- Red iris -->
    <ellipse cx="34" cy="35" rx="8" ry="7.5" fill="#cc0000"/>
    <ellipse cx="34" cy="35" rx="6.5" ry="6" fill="#ee1a1a"/>
    <ellipse cx="34" cy="35" rx="4.5" ry="4.5" fill="#aa0000"/>
    <circle cx="34" cy="35" r="2.8" fill="#660000"/>
    <!-- Iris rings -->
    <ellipse cx="34" cy="35" rx="8" ry="7.5" fill="none" stroke="#ff5555" stroke-width="1.2" opacity="0.9"/>
    <ellipse cx="34" cy="35" rx="10" ry="9" fill="none" stroke="#cc0000" stroke-width="0.7" opacity="0.5"/>
    <!-- Highlight -->
    <circle cx="37" cy="31.5" r="2.5" fill="white" opacity="0.95"/>
    <circle cx="32" cy="38.5" r="1" fill="white" opacity="0.4"/>
    <!-- Eyelid -->
    <path d="M24 33 Q34 26 44 33" stroke="#5a0000" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M24 35 Q34 43 44 35" stroke="#c09090" stroke-width="0.8" fill="none" opacity="0.5"/>

    <!-- ── RIGHT EYE – Emperor Eye red ── -->
    <ellipse cx="66" cy="35" rx="10" ry="9" fill="white"/>
    <!-- Aura glow -->
    <ellipse cx="66" cy="35" rx="13" ry="11" fill="url(#eyeR)"/>
    <ellipse cx="66" cy="35" rx="10" ry="9" fill="white"/>
    <!-- Red iris -->
    <ellipse cx="66" cy="35" rx="8" ry="7.5" fill="#cc0000"/>
    <ellipse cx="66" cy="35" rx="6.5" ry="6" fill="#ee1a1a"/>
    <ellipse cx="66" cy="35" rx="4.5" ry="4.5" fill="#aa0000"/>
    <circle cx="66" cy="35" r="2.8" fill="#660000"/>
    <!-- Iris rings -->
    <ellipse cx="66" cy="35" rx="8" ry="7.5" fill="none" stroke="#ff5555" stroke-width="1.2" opacity="0.9"/>
    <ellipse cx="66" cy="35" rx="10" ry="9" fill="none" stroke="#cc0000" stroke-width="0.7" opacity="0.5"/>
    <!-- Highlight -->
    <circle cx="69" cy="31.5" r="2.5" fill="white" opacity="0.95"/>
    <circle cx="64" cy="38.5" r="1" fill="white" opacity="0.4"/>
    <!-- Eyelid -->
    <path d="M56 33 Q66 26 76 33" stroke="#5a0000" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M56 35 Q66 43 76 35" stroke="#c09090" stroke-width="0.8" fill="none" opacity="0.5"/>

    <!-- Nose – tiny chibi dot -->
    <circle cx="50" cy="46" r="1.4" fill="#d0a898" opacity="0.7"/>

    <!-- Mouth – thin stern line -->
    <path d="M43 51 Q50 54 57 51" stroke="#c09080" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  `;
}

function renderCharSVG(svgEl, bodyIdx, outfitIdx, maskIdx, bgIdx) {
    if (!svgEl) return;
    const body = CHAR_BODIES[bodyIdx];
    if (body && body.special === 'emperor') {
        svgEl.innerHTML = buildEmperorSVG();
    } else {
        svgEl.innerHTML = buildCharSVG(bodyIdx, outfitIdx, maskIdx, bgIdx);
    }
}

let MODULES = PASCAL_MODULES;

// ─── КУРСЫ И ПРОГРЕСС ПО ЯЗЫКАМ ───────────────────────────────────────────────
// Pascal остаётся курсом по умолчанию, но вкладки вверху теперь переключают
// реальные программы. Прогресс хранится отдельно для каждого языка.
const COURSES = {
    pascal: MODULES,
    javascript: JS_MODULES,
    python: PY_MODULES,
    csharp: CS_MODULES,
    cpp: CPP_MODULES,
};

const COURSE_LABELS = {
    pascal: 'Pascal',
    javascript: 'JavaScript',
    python: 'Python',
    csharp: 'C#',
    cpp: 'C++',
};

const SUBCATEGORY_TO_LANG = {
    'pascal': 'pascal',
    'javascript': 'javascript',
    'js': 'javascript',
    'python': 'python',
    'c#': 'csharp',
    'csharp': 'csharp',
    'c++': 'cpp',
    'cpp': 'cpp',
};

let currentLang = 'pascal';

function normalizeLangKey(text) {
    return SUBCATEGORY_TO_LANG[String(text).trim().toLowerCase()] || 'pascal';
}

function makeEmptyProgress(course) {
    return {
        lessonCompleted: course.map(m => Array(m.lessons.length).fill(false)),
        trophyTestDone: course.map(() => false),
        trophyScores: course.map(() => 0),
        perfectLessons: course.map(m => Array(m.lessons.length).fill(false)),
        perfectTests: course.map(() => false),
        introDone: false,
    };
}

function snapshotProgress() {
    return {
        lessonCompleted: lessonCompleted.map(row => [...row]),
        trophyTestDone: [...trophyTestDone],
        trophyScores: [...trophyScores],
        perfectLessons: perfectLessons.map(row => [...row]),
        perfectTests: [...perfectTests],
        introDone,
    };
}

function normalizeMatrix(saved, sizes) {
    return sizes.map((n, i) => Array.from({ length: n }, (_, j) => !!(saved && saved[i] && saved[i][j])));
}

function normalizeFlags(saved, n) {
    return Array.from({ length: n }, (_, i) => !!(saved && saved[i]));
}

function normalizeScores(saved, n) {
    return Array.from({ length: n }, (_, i) => {
        const value = Number(saved && saved[i]);
        return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
    });
}

function hydrateProgress(saved) {
    Object.keys(COURSES).forEach(lang => {
        const p = saved[lang];
        if (!p) return;
        const course = COURSES[lang];
        PROGRESS_BY_LANG[lang] = {
            lessonCompleted: normalizeMatrix(p.lessonCompleted, course.map(m => m.lessons.length)),
            trophyTestDone: normalizeFlags(p.trophyTestDone, course.length),
            trophyScores: normalizeScores(p.trophyScores, course.length),
            perfectLessons: normalizeMatrix(p.perfectLessons, course.map(m => m.lessons.length)),
            perfectTests: normalizeFlags(p.perfectTests, course.length),
            lessonXP: normalizeMatrix(p.lessonXP, course.map(m => m.lessons.length)),
            introDone: !!p.introDone,
        };
    });
}

const PROGRESS_BY_LANG = {};
const LESSON_XP_BY_LANG = {};
Object.keys(COURSES).forEach(lang => {
    PROGRESS_BY_LANG[lang] = makeEmptyProgress(COURSES[lang]);
    LESSON_XP_BY_LANG[lang] = makeEmptyLessonXP(COURSES[lang]);
});

function makeEmptyLessonXP(course) {
    return course.map(m => Array(m.lessons.length).fill(0));
}

function snapshotLangProgress() {
    return { ...snapshotProgress(), lessonXP: LESSON_XP_BY_LANG[currentLang].map(row => [...row]) };
}

function serializeProgress() {
    PROGRESS_BY_LANG[currentLang] = snapshotLangProgress();
    const out = {};
    Object.keys(PROGRESS_BY_LANG).forEach(lang => {
        out[lang] = PROGRESS_BY_LANG[lang];
    });
    return out;
}

function applyLangProgress(lang) {
    const p = PROGRESS_BY_LANG[lang] || makeEmptyProgress(COURSES[lang]);
    lessonCompleted = p.lessonCompleted;
    trophyTestDone = p.trophyTestDone;
    trophyScores = normalizeScores(p.trophyScores, COURSES[lang].length);
    perfectLessons = p.perfectLessons;
    perfectTests = p.perfectTests;
    introDone = !!p.introDone;
}

function switchLang(lang) {
    if (!COURSES[lang]) return;
    PROGRESS_BY_LANG[currentLang] = snapshotLangProgress();
    currentLang = lang;
    MODULES = COURSES[lang];
    profileData.lang = lang;
    applyLangProgress(lang);
    if (currentModuleIdx >= MODULES.length) currentModuleIdx = 0;
    saveState();
    renderModulesList();
    updateStats();
    const h1 = document.querySelector('#home .page-header h1');
    if (h1) h1.textContent = COURSE_LABELS[lang] || lang;
    const h3 = document.querySelector('#home .page-header h3');
    if (h3) h3.textContent = `${trophyTestDone.filter(Boolean).length} из ${MODULES.length} модулей пройдено`;
    document.querySelectorAll('#home .page-header-btns .btnsList button').forEach(btn => {
        btn.classList.toggle('active', normalizeLangKey(btn.textContent) === lang);
    });
}
window.switchLang = switchLang
window.changeCourse = switchLang
window.getCourseLang = () => currentLang
window.normalizeLangKey = normalizeLangKey

// Build flat lessonsData for current module
function getLessonsForModule(mIdx) {
    return MODULES[mIdx].lessons;
}

// ─── TROPHY QUESTIONS now embedded in MODULES[i].trophyQuestions ────────────

// ─── ACHIEVEMENTS ─────────────────────────────────────────────────────────────
const ACHIEVEMENTS = {
    modules: [
        { id: 'mod0_done', icon: '<span data-icon="rune"></span>', name: 'Новичок-паскальщик', desc: 'Пройди модуль 1', check: () => !!MODULES[0] && MODULES[0].lessons.every((_, i) => lessonCompleted[0][i]) && trophyTestDone[0] },
        { id: 'mod1_done', icon: '<span data-icon="rune2"></span>', name: 'Логик', desc: 'Пройди модуль 2', check: () => !!MODULES[1] && MODULES[1].lessons.every((_, i) => lessonCompleted[1][i]) && trophyTestDone[1] },
        { id: 'mod2_done', icon: '<span data-icon="rune3"></span>', name: 'Циклопед', desc: 'Пройди модуль 3', check: () => !!MODULES[2] && MODULES[2].lessons.every((_, i) => lessonCompleted[2][i]) && trophyTestDone[2] },
        { id: 'mod3_done', icon: '<span data-icon="shard"></span>', name: 'Архивариус', desc: 'Пройди модуль 4', check: () => !!MODULES[3] && MODULES[3].lessons.every((_, i) => lessonCompleted[3][i]) && trophyTestDone[3] },
        { id: 'mod4_done', icon: '<span data-icon="runeLit"></span>', name: 'Программист', desc: 'Пройди модуль 5', check: () => !!MODULES[4] && MODULES[4].lessons.every((_, i) => lessonCompleted[4][i]) && trophyTestDone[4] },
        { id: 'all_modules', icon: '<span data-icon="rune"></span>', name: 'Мастер Pascal', desc: 'Пройди все модули курса', check: () => MODULES.length > 0 && MODULES.every((m, mi) => m.lessons.every((_, i) => lessonCompleted[mi][i]) && trophyTestDone[mi]) },
    ],
    xp: [
        { id: 'xp50', icon: '<span data-icon="rune2"></span>', name: 'Первый разряд', desc: '50 XP', check: () => xp >= 50 },
        { id: 'xp200', icon: '<span data-icon="rune3"></span>', name: 'Заряженный', desc: '200 XP', check: () => xp >= 200 },
        { id: 'xp500', icon: '<span data-icon="shard"></span>', name: 'Взрывной', desc: '500 XP', check: () => xp >= 500 },
        { id: 'xp1000', icon: '<span data-icon="runeLit"></span>', name: 'Звёздный', desc: '1000 XP', check: () => xp >= 1000 },
        { id: 'xp2000', icon: '<span data-icon="rune"></span>', name: 'Космонавт', desc: '2000 XP', check: () => xp >= 2000 },
    ],
    streak: [
        { id: 'streak3', icon: '<span data-icon="rune2"></span>', name: 'Горячо!', desc: '3 дня подряд', check: () => currentStreak() >= 3 },
        { id: 'no_errors', icon: '<span data-icon="rune3"></span>', name: 'Без ошибок', desc: 'Пройди урок идеально', check: () => perfectLessons.some(row => row.some(Boolean)) },
        { id: 'speed_run', icon: '<span data-icon="shard"></span>', name: 'Спринтер', desc: 'Пройди урок быстро', check: () => fastestLessonMs > 0 && fastestLessonMs <= 120000 },
        { id: 'hard_test', icon: '<span data-icon="runeLit"></span>', name: 'Испытание', desc: 'Пройди любой финальный тест', check: () => trophyTestDone.some(Boolean) },
        { id: 'all_tests', icon: '<span data-icon="rune"></span>', name: 'Экзаменатор', desc: 'Пройди все 5 тестов', check: () => trophyTestDone.every(Boolean) },
    ],
    mastery: [
        { id: 'first_lesson', icon: '<span data-icon="rune2"></span>', name: 'Первый шаг', desc: 'Пройди первый урок', check: () => lessonCompleted[0][0] },
        { id: 'typed_right', icon: '<span data-icon="rune3"></span>', name: 'Клавишник', desc: 'Правильно введи ответ в тесте', check: () => typedCorrectInTest },
        { id: 'trophy_perfect', icon: '<span data-icon="shard"></span>', name: 'Перфекционист', desc: 'Пройди финальный тест без ошибок', check: () => perfectTests.some(Boolean) },
        { id: 'all_lessons', icon: '<span data-icon="runeLit"></span>', name: 'Выпускник', desc: 'Пройди все уроки всех модулей', check: () => MODULES.every((m, mi) => m.lessons.every((_, i) => lessonCompleted[mi][i])) },
        { id: 'completionist', icon: '<span data-icon="rune"></span>', name: 'Абсолютный', desc: 'Пройди всё на 100%', check: () => MODULES.every((m, mi) => m.lessons.every((_, i) => lessonCompleted[mi][i])) && trophyTestDone.every(Boolean) },
        { id: 'perfect_all', icon: '<span data-icon="rune2"></span>', name: 'Мастер без ошибок', desc: 'Пройди ВСЕ уроки без единой ошибки', check: () => MODULES.every((m, mi) => m.lessons.every((_, i) => perfectLessons[mi][i])) },
        { id: 'perfect_test', icon: '<span data-icon="rune3"></span>', name: 'Перфекционист теста', desc: 'Пройди финальный тест без ошибок', check: () => perfectTests.some(Boolean) },
        { id: 'perfect_all_tests', icon: '<span data-icon="shard"></span>', name: 'Абсолютный перфекционист', desc: 'Все тесты без единой ошибки', check: () => perfectTests.every(Boolean) },
    ]
};

const TITLES = [
    { id: 'newbie', icon: '<span data-icon="runeLit"></span>', name: 'Новичок', req: 'Начни учиться', reqXP: 0, check: () => true },
    { id: 'coder', icon: '<span data-icon="rune"></span>', name: 'Кодер', req: 'Пройди первый урок', reqXP: 0, check: () => lessonCompleted[0][0] },
    { id: 'logician', icon: '<span data-icon="rune2"></span>', name: 'Логик', req: 'Пройди модуль "Условия"', reqXP: 0, check: () => trophyTestDone[1] },
    { id: 'looper', icon: '<span data-icon="rune3"></span>', name: 'Циклопед', req: 'Пройди модуль "Циклы"', reqXP: 0, check: () => trophyTestDone[2] },
    { id: 'archivist', icon: '<span data-icon="shard"></span>', name: 'Архивариус', req: 'Пройди модуль "Массивы"', reqXP: 0, check: () => trophyTestDone[3] },
    { id: 'champion', icon: '<span data-icon="runeLit"></span>', name: 'Чемпион', req: 'Пройди первый финальный тест', reqXP: 0, check: () => trophyTestDone[0] },
    { id: 'engineer', icon: '<span data-icon="rune"></span>', name: 'Инженер', req: 'Пройди модуль "Функции"', reqXP: 0, check: () => trophyTestDone[4] },
    { id: 'master', icon: '<span data-icon="rune2"></span>', name: 'Мастер Pascal', req: 'Пройди все 5 модулей', reqXP: 0, check: () => trophyTestDone.every(Boolean) },
    { id: 'perfectionist', icon: '<span data-icon="rune3"></span>', name: 'Перфекционист', req: 'Пройди все уроки без ошибок', reqXP: 0, check: () => MODULES.every((m, mi) => m.lessons.every((_, i) => perfectLessons[mi][i])) },
    { id: 'legend', icon: '<span data-icon="shard"></span>', name: 'Легенда', req: '500 XP', reqXP: 500, check: () => xp >= 500 },
    { id: 'star', icon: '<span data-icon="runeLit"></span>', name: 'Звезда', req: '1000 XP', reqXP: 1000, check: () => xp >= 1000 },
    { id: 'dev_blood', icon: '<span data-icon="rune"></span>', name: 'Основатель', req: '🔒 Только для разрабов', reqXP: 0, check: () => unlockedSecrets.has(8), neon: 'blood', secret: true },
    { id: 'dev_tech', icon: '<span data-icon="rune2"></span>', name: 'Разработчик', req: '🔒 Только для разрабов', reqXP: 0, check: () => unlockedSecrets.has(7), neon: 'tech', secret: true },
];

const MODULE_REWARDS = [
    { id: 'spark', icon: '<span data-icon="runeLit"></span>', name: 'Руна Искры', desc: 'Янтарное свечение рун в уроках', color: '#ffc800', check: () => trophyTestDone[0] },
    { id: 'stoneheart', icon: '<span data-icon="rune"></span>', name: 'Печать Каменного Сердца', desc: 'Изумрудное свечение рун в уроках', color: '#58cc02', check: () => trophyTestDone[1] },
    { id: 'amethyst', icon: '<span data-icon="rune2"></span>', name: 'Аметистовый Резонанс', desc: 'Фиолетовое свечение рун в уроках', color: '#b06cff', check: () => trophyTestDone[2] },
    { id: 'ancient', icon: '<span data-icon="rune3"></span>', name: 'Кристалл Древних', desc: 'Лазурное свечение рун в уроках', color: '#1cb0f6', check: () => trophyTestDone[3] },
    { id: 'dawn', icon: '<span data-icon="shard"></span>', name: 'Осколок Зари', desc: 'Коралловое свечение рун в уроках', color: '#ff7a59', check: () => trophyTestDone[4] },
    { id: 'core', icon: '<span data-icon="runeLit"></span>', name: 'Ядро Голема', desc: 'Бело-золотое свечение рун за все тесты', color: '#fff0a8', check: () => trophyTestDone.every(Boolean) }
];

function applyArtifactGlow() {
    const artifact = MODULE_REWARDS.find(reward => reward.id === profileData.artifact && reward.check());
    const root = document.documentElement;
    root.style.setProperty('--rune-glow', artifact ? artifact.color : '#58cc02');
    root.style.setProperty('--rune-glow-soft', artifact ? artifact.color + '55' : 'rgba(88, 204, 2, 0.55)');
}

function equipArtifact(id) {
    const artifact = MODULE_REWARDS.find(reward => reward.id === id && reward.check());
    if (!artifact) return;
    profileData.artifact = profileData.artifact === id ? null : id;
    applyArtifactGlow();
    saveState();
    renderAchievements();
}
window.equipArtifact = equipArtifact

// Outfit indices unlocked per module completion
const MODULE_OUTFIT_UNLOCKS = {
    0: 1, // blue tshirt
    1: 2, // hoodie
    2: 4, // armor
    3: 7, // king
    4: 5, // ninja
};

// Bg/mask unlocks
const MODULE_EXTRA_UNLOCKS = {
    4: { bg: 6, mask: 2 }, // module 5 unlocks galaxy + moon mask
};



// ─── UTILS ────────────────────────────────────────────────────────────────────
function shuffle(arr) {
    let a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function actClick() { if (!answered) checkAnswer(); }
window.actClick = actClick

function mascotEvent(name) {
    window.dispatchEvent(new Event('mascot-' + name));
}
function showToast(msg, duration = 1500) {
    /*window.notification.success(msg)
    return*/

    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), duration);
}

function dayWord(value) {
    const n = Number(value) || 0;
    const last = n % 10;
    const pair = n % 100;
    if (last === 1 && pair !== 11) return 'день';
    if (last >= 2 && last <= 4 && (pair < 12 || pair > 14)) return 'дня';
    return 'дней';
}

function dateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function currentStreak() {
    const now = new Date();
    let streak = 0;
    for (let i = 0; i < 30; i++) {
        const date = new Date(now);
        date.setDate(now.getDate() - i);
        if (!(dailyStats.history[dateKey(date)] > 0)) break;
        streak++;
    }
    return streak;
}

function uniqueProse(...parts) {
    const seen = new Set();
    const result = [];
    parts.forEach(part => String(part || '').split(/(?<=[.!?])\s+|\n+/).forEach(sentence => {
        const text = sentence.trim();
        const key = text.replace(/\s+/g, ' ').toLowerCase();
        if (!text || seen.has(key)) return;
        seen.add(key);
        result.push(text);
    }));
    return result.join(' ');
}

function shakeHearts() {
    document.querySelectorAll('.hearts-lesson, .trophy-hearts').forEach(el => {
        el.classList.remove('hit');
        void el.offsetWidth;
        el.classList.add('hit');
        setTimeout(() => el.classList.remove('hit'), 500);
    });
}

function setDailyGoal(minutes) {
    dailyStats.goal = minutes;
    saveDaily();
    renderHealthDashboard();
}
window.setDailyGoal = setDailyGoal

function renderHealthDashboard() {
    const card = document.getElementById('health-dashboard');
    if (!card) return;
    const accuracy = dailyStats.tasks ? Math.round(dailyStats.correct / dailyStats.tasks * 100) : 0;
    const dayPct = Math.min(100, Math.round((dailyStats.lessons * 10 + dailyStats.correct * 2) / Math.max(1, dailyStats.goal) * 100));
    const circles = [
        ['ring-lessons', 314.159, Math.min(100, dailyStats.lessons * 20)],
        ['ring-tasks', 251.327, Math.min(100, dailyStats.tasks * 5)],
        ['ring-accuracy', 188.496, accuracy]
    ];
    circles.forEach(([id, circumference, percent]) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.style.strokeDasharray = String(circumference);
        el.style.strokeDashoffset = String(circumference * (1 - percent / 100));
    });
    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = String(value);
    };
    setText('ring-center-value', dayPct + '%');
    setText('dash-lessons', dailyStats.lessons);
    setText('dash-tasks', dailyStats.tasks);
    setText('dash-accuracy', accuracy + '%');
    setText('dash-goal', dailyStats.goal);
    setText('p-xp', xp);
    setText('p-hearts', hearts);
    setText('p-accuracy', accuracy + '%');
    setText('p-time', Math.floor(totalStudyMs / 60000) + ' мин');

    const labels = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    const days = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(now.getDate() - i);
        const key = dateKey(date);
        days.push({ label: labels[(date.getDay() + 6) % 7], key, value: dailyStats.history[key] || 0 });
    }
    const weekTrack = document.getElementById('week-track');
    if (weekTrack) weekTrack.innerHTML = days.map(day => `<div class="week-day"><span>${day.label}</span><i class="week-dot ${day.value > 0 ? 'on' : ''}"></i></div>`).join('');
    const streak = currentStreak();
    const savedRecord = Number(localStorage.getItem('geltcode_streak') || 0);
    const record = Math.max(streak, savedRecord);
    if (record > savedRecord) localStorage.setItem('geltcode_streak', String(record));
    setText('p-streak', streak);
    setText('dash-streak', streak);
    setText('streak-record', record);
    setText('p-streak-word', dayWord(streak));
    setText('dash-streak-word', dayWord(streak));
    setText('streak-record-word', dayWord(record));
    const max = Math.max(20, ...days.map(day => day.value));
    const chart = document.getElementById('week-chart');
    if (chart) chart.innerHTML = days.map((day, i) => `<div class="chart-bar ${i === 6 ? 'today' : ''}" style="height:${Math.max(6, Math.round(day.value / max * 78))}px" title="${day.label}: ${day.value}"></div>`).join('');

    const langs = document.getElementById('dash-langs');
    if (langs) {
        langs.innerHTML = Object.keys(COURSES).map(lang => {
            const course = COURSES[lang];
            const progress = PROGRESS_BY_LANG[lang] || makeEmptyProgress(course);
            const total = course.reduce((sum, m) => sum + m.lessons.length, 0);
            const done = progress.lessonCompleted.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
            const pct = total ? Math.round(done / total * 100) : 0;
            return `<div class="lang-row"><span class="lang-name">${COURSE_LABELS[lang]}</span><span class="lang-line"><span class="lang-fill" style="width:${pct}%"></span></span><span class="lang-value">${pct}%</span></div>`;
        }).join('');
    }
    const runes = document.getElementById('dash-runes');
    if (runes) {
        const all = [...ACHIEVEMENTS.modules, ...ACHIEVEMENTS.xp, ...ACHIEVEMENTS.streak, ...ACHIEVEMENTS.mastery];
        const unlocked = new Set(all.filter(a => a.check()).map(a => a.id));
        const icons = ['rune', 'rune2', 'rune3', 'shard', 'runeLit', 'trophy'];
        runes.innerHTML = all.slice(0, 6).map((a, i) => `<div class="rune-card ${unlocked.has(a.id) ? 'unlocked' : 'locked-ach'}"><span class="rune-card-icon" data-icon="${icons[i]}"></span><div class="rune-card-text"><strong>${esc(a.name)}</strong><small>${esc(a.desc)}</small></div></div>`).join('');
        renderIcons(runes);
    }
    document.querySelectorAll('.goal-switch button').forEach(button => {
        button.classList.toggle('active', Number(button.textContent.replace(/\D/g, '')) === dailyStats.goal);
    });
    renderIcons(card);
}

function updateStats() {
    const totalLessons = MODULES.reduce((s, m) => s + m.lessons.length, 0);
    const doneLessons = MODULES.reduce((s, m, mi) => s + m.lessons.filter((_, i) => lessonCompleted[mi][i]).length, 0);
    const lessonHeart = document.getElementById('h-lesson');
    if (lessonHeart) lessonHeart.textContent = String(hearts);
    const lessonHeartBox = document.querySelector('.hearts-lesson');
    if (lessonHeartBox) lessonHeartBox.classList.toggle('empty', hearts <= 0);
    const pLessons = document.getElementById('p-lessons');
    if (pLessons) pLessons.textContent = `${doneLessons}/${totalLessons}`;
    const curL = getCurrentLeague ? getCurrentLeague() : null;
    const lEl = document.getElementById('p-league-val');
    if (lEl && curL) { lEl.textContent = curL.name.slice(0, 6); lEl.style.color = curL.color; }
    updateOverallStats();
    renderHealthDashboard();
}

function updateOverallStats() {
    const totalLessons = MODULES.reduce((s, m) => s + m.lessons.length, 0);
    const doneLessons = MODULES.reduce((s, m, mi) => s + m.lessons.filter((_, i) => lessonCompleted[mi][i]).length, 0);
    const totalTests = MODULES.length;
    const doneTests = trophyTestDone.filter(Boolean).length;
    const perfectL = MODULES.reduce((s, m, mi) => s + m.lessons.filter((_, i) => perfectLessons[mi][i]).length, 0);

    const lessonsPct = totalLessons ? Math.round(doneLessons / totalLessons * 100) : 0;
    const testsPct = totalTests ? Math.round(doneTests / totalTests * 100) : 0;
    const perfectPct = totalLessons ? Math.round(perfectL / totalLessons * 100) : 0;
    const totalPct = Math.round((lessonsPct * 0.5 + testsPct * 0.3 + perfectPct * 0.2));

    const el = id => document.getElementById(id);
    if (el('stat-lessons-pct')) el('stat-lessons-pct').textContent = lessonsPct + '%';
    if (el('stat-tests-pct')) el('stat-tests-pct').textContent = testsPct + '%';
    if (el('stat-perfect-pct')) el('stat-perfect-pct').textContent = perfectPct + '%';
    if (el('stat-total-bar')) el('stat-total-bar').style.width = totalPct + '%';
    if (el('stat-total-label')) el('stat-total-label').textContent = 'Общий прогресс: ' + totalPct + '%';
}

// ─── HOME / MODULES ───────────────────────────────────────────────────────────
function renderModulesList() {
    const el = document.getElementById('pascalModules');
    // CSS скрывает .langModule без класса active, карточки были в DOM, но не кликались.
    document.querySelectorAll('#langsModules .langModule').forEach(x => x.classList.remove('active'));
    if (el) {
        el.dataset.lang = currentLang;
        el.classList.add('active');
    }
    const totalDone = MODULES.reduce((s, m, mi) => s + (trophyTestDone[mi] ? 1 : 0), 0);
    let html = `<div class="modules-header">
    <p>${totalDone} из ${MODULES.length} модулей пройдено</p>
  </div>`;
    MODULES.forEach((m, mi) => {
        const lessons = m.lessons;
        const doneLessons = lessons.filter((_, li) => lessonCompleted[mi][li]).length;
        const perfectDoneLessons = lessons.filter((_, li) => perfectLessons[mi][li]).length;
        const pct = Math.round(doneLessons / lessons.length * 100);
        const modDone = trophyTestDone[mi];
        const unlocked = testMode || mi === 0 || trophyTestDone[mi - 1];
        const isActive = !modDone && unlocked;
        const cls = modDone ? 'completed' : (unlocked ? 'unlocked' : 'locked-mod');
        const iconName = MODULE_ICON_NAMES[mi] || 'star';
        const badge = modDone
            ? `<div class="mod-badge" style="background:var(--gold);color:#000;">✓ ПРОЙДЕН</div>`
            : (!unlocked
                ? `<div class="mod-badge" style="background:var(--surface-light);color:var(--text-muted);"><span data-icon="lock"></span></div>`
                : `<div class="mod-badge" style="background:rgba(88,204,2,0.15);color:var(--primary);">АКТИВЕН</div>`);
        html += `<div class="module-card ${cls}" onclick="${unlocked ? `window.changePage('langmodule', '${currentLang}-${mi}'); openModule(${mi})` : ''}">
      <div class="mod-accent" style="background:${m.color};"></div>
      <div class="mod-row">
        <div class="mod-icon" data-icon="${iconName}"></div>
        <div class="mod-info">
          <div class="mod-num">МОДУЛЬ ${mi + 1}</div>
          <div class="mod-title">${m.title}</div>
          <div class="mod-desc">${m.desc}</div>
          <div class="mod-xp-reward">⚡ +${m.xpReward} XP</div>
        </div>
      </div>
      ${badge}
      <div class="mod-prog">
        <div class="mod-prog-bar" style="position:relative;height:10px;">
          <div class="mod-prog-fill" style="width:${pct}%;background:${m.color};height:100%;border-radius:8px;position:absolute;"></div>
        </div>
        <div class="mod-prog-label" style="display:flex;justify-content:space-between;align-items:center;">
          <span>${doneLessons}/${lessons.length} уроков ${modDone ? '• ✓ Тест' : ''}</span>
          ${perfectDoneLessons > 0 ? `<span style="color:#9B59B6;font-size:11px;font-weight:800;"><span data-icon="runeLit"></span> ${perfectDoneLessons} идеально</span>` : ''}
        </div>
      </div>
    </div>`;
    });
    el.innerHTML = html;
    el.querySelectorAll('.module-card').forEach((c, i) => { c.style.animationDelay = (i * 0.08) + 's'; });
    renderIcons(el);
}

function openModule(mi) {
    currentModuleIdx = mi;
    //document.getElementById('module-path-view').style.display = 'block';
    const m = MODULES[mi];
    if (!m) return;
    const h1 = document.querySelector('#langmodule .page-header h1');
    if (h1) { h1.innerHTML = `<span data-icon="${MODULE_ICON_NAMES[mi] || 'star'}"></span> ${m.title}`; renderIcons(h1); }
    const _mpDone = m.lessons.filter((_, li) => lessonCompleted[mi][li]).length;
    const _mpPct = Math.round(_mpDone / m.lessons.length * 100);
    const _mpPerfect = m.lessons.filter((_, li) => perfectLessons[mi][li]).length;
    const h3 = document.querySelector('#langmodule .page-header h3');
    if (h3) h3.textContent = `Модуль ${mi + 1} • ${_mpPct}% пройдено${_mpPerfect > 0 ? ' • руна ' + _mpPerfect + ' идеально' : ''}`;
    renderPath();
}
window.openModule = openModule

function backToModules() {
    const pathView = document.getElementById('module-path-view');
    const listView = document.getElementById('modules-list-view');
    if (pathView) pathView.style.display = 'none';
    if (listView) listView.style.display = 'block';
    renderModulesList();
}

// Явно возвращаем: урок → модуль, модуль → главная.
function setupBackButtons() {
    const lessonBack = document.querySelector('#lesson .leftBtnsNav');
    if (lessonBack) lessonBack.onclick = () => window.changePage('langmodule');
    const moduleBack = document.querySelector('#langmodule .leftBtnsNav');
    if (moduleBack) moduleBack.onclick = () => { window.changePage('home'); backToModules(); };
}
window.setupBackButtons = setupBackButtons

function introGated() {
    return currentModuleIdx === 0 && profileData.level === 'zero' && !!MODULES[0]?.introLesson && !introDone;
}

function isLessonUnlocked(mi, li) {
    return testMode || !(mi === 0 && profileData.level === 'zero' && !!MODULES[0]?.introLesson && !introDone)
        && (li === 0 || !!lessonCompleted[mi]?.[li - 1]);
}

function rejectLocked(event) {
    const node = (event.currentTarget || event.target)?.closest?.('.node.locked');
    if (!node || node.classList.contains('locked-hit')) return false;
    node.classList.add('locked-hit', 'shake');
    showToast('Сначала пройди предыдущий урок');
    setTimeout(() => node.classList.remove('locked-hit', 'shake'), 450);
    return false;
}
window.rejectLocked = rejectLocked

function renderPath() {
    const container = document.getElementById('path-container');
    const m = MODULES[currentModuleIdx];
    const hasIntro = currentModuleIdx === 0 && profileData.level === 'zero' && !!m.introLesson;
    const runes = LANG_RUNES[currentLang] || LANG_RUNES.pascal;
    container.style.setProperty('--energy', LANG_ENERGY[currentLang] || LANG_ENERGY.pascal);
    let html = '';
    if (hasIntro) {
        const introStatus = introDone ? 'done' : 'active';
        html += `<div class="node-wrap" style="animation-delay:0s">
      <div class="${nodeClass(introStatus)}" onclick="${introDone ? '' : 'startIntroLesson()'}">${lessonNodeSvg(runes[(currentModuleIdx + 2) % runes.length])}</div>
      <div class="lesson-label">Подготовительный урок</div>
    </div>`;
    }
    m.lessons.forEach((lesson, i) => {
        const done = lessonCompleted[currentModuleIdx][i];
        const unlocked = isLessonUnlocked(currentModuleIdx, i);
        const status = done ? 'done' : unlocked ? 'active' : 'locked';
        const clickHandler = status === 'locked' ? 'return window.rejectLocked(event)' : `startLesson(${i})`;
        const practice = /^Практика:/i.test(lesson.title);
        const art = practice
            ? practiceNodeSvg(runes[i % runes.length], runes[(i + 1) % runes.length])
            : lessonNodeSvg(runes[i % runes.length]);
        html += `<div class="node-wrap" style="animation-delay:${(i * 0.09).toFixed(2)}s">
      <div class="${nodeClass(status)}${practice ? ' practice-node' : ''}" onclick="${clickHandler}">${art}</div>
      <div class="lesson-label">${lesson.title}</div>
    </div>`;
    });
    const allDone = m.lessons.every((_, i) => lessonCompleted[currentModuleIdx][i]);
    const trophyOpen = testMode || allDone;
    const trophyStatus = trophyTestDone[currentModuleIdx] ? 'done' : trophyOpen ? 'active' : 'locked';
    const trophyLevel = trophyStatus === 'done'
        ? monumentLevel(trophyScores[currentModuleIdx] || (perfectTests[currentModuleIdx] ? 100 : 50))
        : 0;
    const monument = trophyLevel ? ` monument-${trophyLevel}` : '';
    const trophyClick = trophyStatus === 'locked' ? 'return window.rejectLocked(event)' : 'startTrophyTest()';
    html += `<div class="node-wrap" style="animation-delay:${(m.lessons.length * 0.09).toFixed(2)}s">
    <div class="${nodeClass(trophyStatus)} trophy-node${monument}" onclick="${trophyClick}">${trophyNodeSvg(runes[(runes.length - 2) % runes.length], trophyLevel)}</div>
    <div class="lesson-label">Финальный тест</div>
  </div>`;
    container.innerHTML = html;
}

function lockedNodeForLesson(li) {
    const wraps = document.querySelectorAll('#path-container .node-wrap');
    const hasIntro = currentModuleIdx === 0 && profileData.level === 'zero' && !!MODULES[0]?.introLesson;
    return wraps[li + (hasIntro ? 1 : 0)]?.querySelector('.node.locked') || null;
}

const NAV_ICONS = {
    home: '<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    league: '<path d="M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4v2a3 3 0 0 0 3 3"/><path d="M17 6h3v2a3 3 0 0 1-3 3"/><path d="M12 14v4M8 21h8M10 18h4"/>',
    leaderboard: '<path d="M4 20h16"/><rect x="5" y="12" width="4" height="8"/><rect x="10" y="8" width="4" height="12"/><rect x="15" y="14" width="4" height="6"/>',
    achivements: '<path d="m12 3 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.2l5.9-.9L12 3Z"/>',
    profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
};

function syncNavIcons() {
    document.querySelectorAll('#navdown .navbtn').forEach(button => {
        const name = button.id.replace('-navd', '');
        const icon = NAV_ICONS[name];
        const image = button.querySelector('img');
        if (!icon || !image) return;
        const holder = document.createElement('div');
        holder.className = 'nav-icon';
        holder.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">${icon}</svg>`;
        image.replaceWith(holder);
    });
}

setTimeout(syncNavIcons, 200);
window.addEventListener('load', syncNavIcons);

// Старые имена экранов из игровой логики совпадают не со всеми id страниц.
// Небольшая карта сохраняет совместимость, не переписывая навигацию.
const SCREEN_TO_PAGE = {
    'scr-home': 'home',
    'scr-profile': 'profile',
    'scr-league': 'league',
    'scr-ach': 'achivements',
    'scr-lb': 'leaderboard',
    'scr-trophy': 'scr-trophy',
};

function setNavVisible(visible) {
    const navEl = document.querySelector('.nav') || document.getElementById('nav');
    if (navEl) navEl.style.display = visible ? 'flex' : 'none';
}

function resetPageScroll() {
    const content = document.getElementById('content');
    if (!content) return;
    content.scrollLeft = 0;
    if (content.parentElement) content.parentElement.scrollLeft = 0;
}

function showScreen(id) {
    const pageId = SCREEN_TO_PAGE[id] || id;
    if (document.getElementById(pageId)) window.changePage(pageId);
    if (id === 'scr-home') { renderModulesList(); updateStats(); }
    requestAnimationFrame(resetPageScroll);
    setTimeout(resetPageScroll, 450);
}

function goHome(el) {
    playClick();
    showScreenAnimated('scr-home');
    const lv = document.getElementById('modules-list-view');
    const pv = document.getElementById('module-path-view');
    if (lv) lv.style.display = 'block';
    if (pv) pv.style.display = 'none';
    renderModulesList(); updateStats();
    navActive(el);
}
function goProfile(el) {
    playClick();
    showScreenAnimated('scr-profile');
    updateStats(); renderProfileScreen();
    navActive(el);
}
function goLeague(el) {
    playClick();
    navActive(el);
    showScreenAnimated('scr-league');
    try { renderLeagueScreen(); } catch (e) { console.error('league error', e); }
}
function goAchievements(el) {
    playClick();
    navActive(el);
    showScreenAnimated('scr-ach');
    try { renderAchievements(); } catch (e) { console.error('ach error', e); }
}

function navActive(el) {
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    if (el) el.classList.add('active');
}

// ─── LESSON LOGIC ─────────────────────────────────────────────────────────────
function startLesson(idx) {
    if (!isLessonUnlocked(currentModuleIdx, idx)) {
        rejectLocked({ currentTarget: lockedNodeForLesson(idx) || document.querySelector('#path-container .node.locked') });
        return;
    }
    resetCombo();
    xp = Math.max(0, xp - lessonRunXP);
    lessonRunXP = 0;
    lessonStartTs = Date.now();
    currentLessonIdx = idx;
    currentQIdx = 0;
    hearts = 3;
    lessonErrors = 0;
    errorQuestions = [];
    isReviewMode = false;
    reviewRound = 0;
    answered = false;
    isIntroLesson = false;
    updateStats();
    saveState();
    const lesson = MODULES[currentModuleIdx].lessons[idx];
    const baseQuestions = shuffle([...lesson.questions]);
    if (lesson.practice) {
        if (currentModuleIdx === 0 && idx === 0 && profileData.level === 'good') {
            shuffledQuestions = [lesson.practice, ...baseQuestions];
        } else {
            shuffledQuestions = [...baseQuestions, lesson.practice];
        }
    } else {
        shuffledQuestions = baseQuestions;
    }
    if (!document.querySelector('#lesson .page-header-btns .lefthead .progress-track')) {
        document.querySelector('#lesson .page-header-btns .lefthead').innerHTML = `
            <div class="progress-track">
                <div class="progress-fill" id="prog" style="width: 0%;"></div>
            </div>
            <div class="hearts-lesson">❤️ <span id="h-lesson">3</span></div>
        `
    }
    lessonIntroPending = profileData.level === 'zero';
    window.changePage('lesson', idx)
    if (lessonIntroPending) renderLessonIntro();
    else renderQuestion();
}
window.startLesson = startLesson

function renderLessonIntro() {
    const lesson = MODULES[currentModuleIdx].lessons[currentLessonIdx];
    const first = lesson.questions[0] || {};
    const area = document.getElementById('q-area');
    const act = document.getElementById('act-area');
    act.style.display = 'none';
    const code = first.code || (lesson.practice && (lesson.practice.code || lesson.practice.starter)) || '';
    const text = uniqueProse(lesson.intro, first.theory);
    area.innerHTML = `
    <div class="lesson-intro">
      <div class="mascot-row">
        <div id="lesson-mascot-slot" class="mascot-slot"></div>
        <div class="bubble">🌱 Начнём с главного</div>
      </div>
      <div class="intro-label">ВВЕДЕНИЕ В УРОК</div>
      <div class="intro-title">${esc(lesson.title)}</div>
      <div class="intro-text">${linkTerms(text)}</div>
      ${code ? `<div class="code-box">${esc(code)}</div>` : ''}
      <button class="btn go intro-btn" onclick="dismissLessonIntro()">ПОНЯТНО, К ПРАКТИКЕ</button>
    </div>`;
    MascotController.mountLesson(area.querySelector('#lesson-mascot-slot'));
    mascotEvent('question');
}
window.renderLessonIntro = renderLessonIntro

function dismissLessonIntro() {
    lessonIntroPending = false;
    document.getElementById('act-area').style.display = '';
    renderQuestion();
}
window.dismissLessonIntro = dismissLessonIntro

function startIntroLesson() {
    const intro = MODULES[currentModuleIdx] && MODULES[currentModuleIdx].introLesson;
    if (!intro || introDone || profileData.level !== 'zero') {
        rejectLocked({ currentTarget: document.querySelector('#path-container .node.locked') });
        return;
    }
    resetCombo();
    xp = Math.max(0, xp - lessonRunXP);
    lessonRunXP = 0;
    lessonStartTs = Date.now();
    currentLessonIdx = -1;
    currentQIdx = 0;
    hearts = 3;
    lessonErrors = 0;
    errorQuestions = [];
    isReviewMode = false;
    reviewRound = 0;
    answered = false;
    isIntroLesson = true;
    updateStats();
    saveState();
    shuffledQuestions = [...intro.questions];
    if (!document.querySelector('#lesson .page-header-btns .lefthead .progress-track')) {
        document.querySelector('#lesson .page-header-btns .lefthead').innerHTML = `
            <div class="progress-track">
                <div class="progress-fill" id="prog" style="width: 0%;"></div>
            </div>
            <div class="hearts-lesson">❤️ <span id="h-lesson">3</span></div>
        `
    }
    window.changePage('lesson', 'intro')
    renderQuestion()
}
window.startIntroLesson = startIntroLesson

function closeLesson() {
    setNavVisible(true);
    showScreen('scr-home');
    openModule(currentModuleIdx);
    navActive(document.getElementById('nav-home'));
}

function resetUI() {
    selectedOption = null;
    answered = false;
    const act = document.getElementById('act-area');
    act.innerHTML = `<button class="btn go" id="act-btn" onclick="actClick()" disabled>ПРОВЕРИТЬ</button>`;
    act.classList.add('show');
}

function addLessonXP(gain) {
    xp += gain;
    lessonRunXP += gain;
    saveState();
}

function addTrophyXP(gain) {
    xp += gain;
    trophyRunXP += gain;
    saveState();
}

function restartLesson() {
    xp = Math.max(0, xp - lessonRunXP);
    lessonRunXP = 0;
    saveState();
    if (isIntroLesson) startIntroLesson();
    else startLesson(currentLessonIdx);
}

function abortLesson() {
    xp = Math.max(0, xp - lessonRunXP);
    lessonRunXP = 0;
    saveState();
    window.changePage('langmodule');
    openModule(currentModuleIdx);
    showToast('Не хватило сердец. Попробуй ещё раз!', 2400);
}

let comboCount = 0;

function comboMultiplier() {
    return Math.min(4, Math.max(1, comboCount));
}

function resetCombo() {
    comboCount = 0;
}

function comboMarkup() {
    return comboCount >= 2 ? `<div class="combo-badge"><span data-icon="runeLit"></span> СЕРИЯ x${comboMultiplier()}</div>` : '';
}

function formatRunValue(value) {
    if (typeof value === 'string') return value;
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    try { return JSON.stringify(value); } catch (e) { return String(value); }
}

function simulateOutput(code) {
    const lines = String(code || '').split('\n');
    const vars = {};
    lines.forEach(line => {
        const match = line.match(/\b(?:int|double|float|char|bool|string|var|auto)\s+([A-Za-z_]\w*)\s*=\s*([^;]+);/);
        if (match) vars[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
    });
    const result = [];
    lines.forEach(line => {
        if (!/cout|writeln|print|WriteLine/.test(line)) return;
        const clear = line.replace(/^.*?(?:cout|writeln|Console\.WriteLine|print)\s*(?:<<)?\s*/, '');
        const tokens = clear.split(/<<|,/).map(token => token.trim()).filter(token => token && token !== ';' && token !== 'endl');
        tokens.forEach(token => {
            const quoted = token.match(/^["'](.*)["']$/);
            if (quoted) { result.push(quoted[1]); return; }
            if (/^-?\d+(?:\.\d+)?$/.test(token)) { result.push(token); return; }
            if (vars[token] !== undefined) { result.push(vars[token]); return; }
            if (/^[\d\s+\-*/().%]+$/.test(token)) {
                try {
                    result.push(String(Function(`return (${token})`)()));
                } catch (e) { }
            }
        });
    });
    return result.join('\n');
}

function runPracticeCode() {
    const input = document.getElementById('practice-input');
    const terminal = document.getElementById('run-terminal');
    if (!input || !terminal) return;
    terminal.hidden = false;
    terminal.textContent = 'ЗАПУСК КОДА...';
    const code = input.value;
    if (currentLang !== 'javascript') {
        setTimeout(() => {
            terminal.textContent = simulateOutput(code) || 'ВЫВОДА НЕТ';
        }, 120);
        return;
    }
    const source = [
        'self.onmessage = function(e) {',
        '  var logs = [];',
        '  var log = function() {',
        '    logs.push(Array.prototype.map.call(arguments, function(v) {',
        '      if (typeof v === "string") return v;',
        '      try { return JSON.stringify(v); } catch (err) { return String(v); }',
        '    }).join(" "));',
        '  };',
        '  try {',
        '    var fn = new Function("console", e.data.code);',
        '    fn({ log: log, error: log, warn: log, info: log });',
        '    self.postMessage({ ok: true, logs: logs });',
        '  } catch (err) {',
        '    self.postMessage({ ok: false, error: String(err) });',
        '  }',
        '};'
    ].join('\n');
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    const worker = new Worker(url);
    let finished = false;
    const finish = text => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        worker.terminate();
        URL.revokeObjectURL(url);
        terminal.textContent = text || 'ВЫВОДА НЕТ';
    };
    const timer = setTimeout(() => finish('ТАЙМАУТ: код выполнялся дольше 1000 мс'), 1000);
    worker.onmessage = event => {
        finish(event.data.ok ? (event.data.logs.join('\n') || 'ВЫВОДА НЕТ') : ('ОШИБКА: ' + event.data.error));
    };
    worker.onerror = event => finish('ОШИБКА: ' + event.message);
    worker.postMessage({ code });
}
window.runPracticeCode = runPracticeCode

let currentShuffledCorrect = 0;

// Экранируем строки, которые попадают в innerHTML
function esc(value) {
    return String(value === undefined || value === null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

let termPopover = null;

function hideTermPopover() {
    if (!termPopover) return;
    const pop = termPopover;
    termPopover = null;
    pop.classList.add('closing');
    setTimeout(() => pop.remove(), 180);
}

function showTermPopover(link) {
    const key = link.dataset.term;
    if (termPopover && termPopover.dataset.term === key) {
        hideTermPopover();
        return;
    }
    hideTermPopover();
    const definition = GLOSSARY[key];
    if (!definition) return;
    const pop = document.createElement('div');
    pop.className = 'term-popover';
    pop.dataset.term = key;
    pop.innerHTML = `<button type="button" class="term-popover-close" aria-label="Закрыть">✕</button><strong>${esc(key)}</strong><p>${esc(definition)}</p>`;
    document.body.appendChild(pop);
    const rect = link.getBoundingClientRect();
    const width = pop.offsetWidth;
    const height = pop.offsetHeight;
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
    const above = rect.top - height - 10;
    const top = above >= 12 ? above : rect.bottom + 10;
    pop.style.left = `${left}px`;
    pop.style.top = `${Math.max(12, Math.min(top, window.innerHeight - height - 12))}px`;
    pop.addEventListener('click', event => event.stopPropagation());
    pop.querySelector('.term-popover-close').addEventListener('click', hideTermPopover);
    termPopover = pop;
}

document.addEventListener('click', event => {
    const link = event.target.closest('.term-link');
    if (link) {
        event.preventDefault();
        event.stopPropagation();
        showTermPopover(link);
        return;
    }
    if (termPopover && !event.target.closest('.term-popover')) hideTermPopover();
});

document.addEventListener('keydown', event => {
    if (event.key === 'Escape') hideTermPopover();
    if ((event.key === 'Enter' || event.key === ' ') && event.target.classList?.contains('term-link')) {
        event.preventDefault();
        showTermPopover(event.target);
    }
});

function safeInputAttrs(extra = '') {
    return [
        'autocomplete="off"',
        'autocorrect="off"',
        'autocapitalize="none"',
        'spellcheck="false"',
        'inputmode="text"',
        'data-lpignore="true"',
        extra,
    ].filter(Boolean).join(' ');
}

// Applies the same protection to static fields created in index.html.
function hardenTextInputs(root = document) {
    root.querySelectorAll('input[type="text"], textarea').forEach(el => {
        if (el.dataset.geltInputHardened) return;
        el.setAttribute('autocomplete', 'off');
        el.setAttribute('autocorrect', 'off');
        el.setAttribute('autocapitalize', 'none');
        el.setAttribute('spellcheck', 'false');
        el.setAttribute('inputmode', 'text');
        el.setAttribute('data-lpignore', 'true');
        el.dataset.geltInputHardened = '1';
    });
}

// Keyboard hint follows the device: phones have no hardware Enter key,
// Apple desktops/tablets use Command, other desktops use Ctrl.
function enterHintText() {
    const ua = navigator.userAgent;
    const platform = navigator.platform || '';
    const touchPoints = navigator.maxTouchPoints || 0;
    const isIPhone = /iPhone|iPod/i.test(ua);
    const isIPad = /iPad/i.test(ua) || (platform === 'MacIntel' && touchPoints > 1);
    const isMac = /Mac/i.test(platform) && !isIPad && !isIPhone;
    if (isIPhone || /Android.*Mobile/i.test(ua)) return '';
    if (isIPad || isMac) return '⌘ + Enter';
    const touchOnly = window.matchMedia('(pointer: coarse)').matches
        && !window.matchMedia('(pointer: fine)').matches;
    return touchOnly ? '' : 'Ctrl + Enter';
}

function handlePracticeKey(event) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') actClick();
}

// Minimal LCS line diff, enough to show a Git-style change without a library.
function diffLines(before, after) {
    const a = String(before || '').replace(/\r/g, '').split('\n');
    const b = String(after || '').replace(/\r/g, '').split('\n');
    const lcs = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
    for (let i = a.length - 1; i >= 0; i--) {
        for (let j = b.length - 1; j >= 0; j--) {
            lcs[i][j] = a[i] === b[j]
                ? lcs[i + 1][j + 1] + 1
                : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
        }
    }
    const rows = [];
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
        if (a[i] === b[j]) { rows.push([' ', a[i++]]); j++; }
        else if (lcs[i + 1][j] >= lcs[i][j + 1]) rows.push(['-', a[i++]]);
        else rows.push(['+', b[j++]]);
    }
    while (i < a.length) rows.push(['-', a[i++]]);
    while (j < b.length) rows.push(['+', b[j++]]);
    return rows;
}

function codeDiffHtml(userCode, correctCode) {
    const body = diffLines(userCode, correctCode).map(([sign, text]) => {
        const kind = sign === '+' ? 'add' : sign === '-' ? 'del' : 'ctx';
        return `<div class="diff-line diff-${kind}"><span class="diff-sign">${sign}</span><code>${esc(text)}</code></div>`;
    }).join('');
    return `<div class="code-diff">
      <div class="diff-head"><span>--- твой вариант</span><span>+++ правильный вариант</span></div>
      <div class="diff-body">${body}</div>
    </div>`;
}

// Подсказки текущего практического задания. Храним их отдельно, чтобы не
// вставлять произвольный текст прямо в HTML-атрибут onclick.
let currentPracticeChips = [];
const usedPracticeChips = new Set();

document.addEventListener('click', e => {
    const head = e.target.closest('.spoiler-head');
    if (!head) return;
    const box = head.closest('.spoiler');
    head.setAttribute('aria-expanded', String(box.classList.toggle('open')));
});

document.addEventListener('keydown', e => {
    if (!document.querySelector('#lesson.active') || e.repeat || e.target.matches('input, textarea')) return;
    const num = ['1', '2', '3'].indexOf(e.key);
    if (num >= 0 && !answered) {
        const opt = document.querySelectorAll('#opts-container .opt')[num];
        if (opt) { e.preventDefault(); opt.click(); }
        return;
    }
    if (e.key === 'Enter') {
        const btn = document.querySelector('#act-area .btn:not(:disabled)');
        if (!btn || e.target === btn) return;
        e.preventDefault();
        btn.click();
    }
});

function renderQuestion() {
    const actArea = document.getElementById('act-area');
    if (actArea) actArea.style.display = '';
    const q = isReviewMode ? errorQuestions[currentQIdx] : shuffledQuestions[currentQIdx];
    const total = isReviewMode ? errorQuestions.length : shuffledQuestions.length;
    const area = document.getElementById('q-area');
    const prog = document.getElementById('prog');
    if (prog) prog.style.width = `${(currentQIdx / total) * 100}%`;
    const safeCode = q.code ? esc(q.code) : '';
    const isPractice = q.type === 'practice';
    currentPracticeChips = isPractice && q.chips ? q.chips : [];
    usedPracticeChips.clear();
    const enterHint = enterHintText();

    let shuffledOpts = [];
    if (!isPractice && q.opts) {
        const indices = q.opts.map((_, i) => i);
        for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [indices[i], indices[j]] = [indices[j], indices[i]];
        }
        shuffledOpts = indices.map(i => q.opts[i]);
        currentShuffledCorrect = indices.indexOf(q.correct);
    }

    const reviewBanner = isReviewMode
        ? `<div class="review-banner">🔁 Исправь ошибку! ${currentQIdx + 1} из ${total}</div>`
        : '';

    const spoiler = (cls, label, text) => text
        ? `<div class="spoiler ${cls}">
             <button type="button" class="spoiler-head" aria-expanded="false">
               <span>${esc(label)}</span><span class="spoiler-arrow" aria-hidden="true">▾</span>
             </button>
             <div class="spoiler-body"><div class="spoiler-clip"><div class="spoiler-content">${linkTerms(text)}</div></div></div>
           </div>`
        : '';

    const theoryBlock = spoiler('spoiler-theory', 'First Principles', q.theory);
    const noteBlock = spoiler('spoiler-note', '💡 Подсказка', q.note);

    const answerBlock = isPractice
        ? `<div class="practice-card">
            <div class="practice-label">Допиши строку кода</div>
            <textarea id="practice-input" class="practice-input" rows="4"
              ${safeInputAttrs()} placeholder="Напиши код..."
              oninput="onPracticeInput(this)"
              onfocus="focusGap(this)"
              onkeydown="handlePracticeKey(event)">${esc(q.starter || '')}</textarea>
            ${currentPracticeChips.length ? `<div class="practice-chips">${currentPracticeChips.map((c, i) => `<button class="practice-chip" onclick="insertPracticeChip(${i})">${esc(c)}</button>`).join('')}</div>` : ''}
            <button type="button" class="btn run-btn" onclick="runPracticeCode()"><span data-icon="rune"></span> ЗАПУСТИТЬ КОД</button>
            <div id="run-terminal" class="run-terminal" hidden></div>
            ${enterHint ? `<div class="practice-foot">${esc(enterHint)}, чтобы проверить</div>` : ''}
          </div>`
        : `<div class="opts" id="opts-container">
            ${shuffledOpts.map((o, i) => `<button class="opt" data-key="${i + 1}" onclick="selectOption(${i})">${esc(o)}</button>`).join('')}
          </div>`;

    area.innerHTML = `
    ${reviewBanner}
    <div class="mascot-row">
      <div id="lesson-mascot-slot" class="mascot-slot"></div>
      <div class="bubble">${isReviewMode ? 'Сложное место, повторим' : isIntroLesson ? '🌱 Подготовка' : `Вопрос ${currentQIdx + 1} из ${total}`}</div>
    </div>
    <div class="q-title">${esc(q.q)}</div>
    ${theoryBlock}
    ${noteBlock}
    ${safeCode ? `<div class="code-box">${safeCode}</div>` : ''}
    ${answerBlock}
  `;
    renderIcons(area);
    MascotController.mountLesson(area.querySelector('#lesson-mascot-slot'));
    mascotEvent('question');
    resetUI();
}
window.renderQuestion = renderQuestion
window.handlePracticeKey = handlePracticeKey

function onPracticeInput(inp) {
    const btn = document.getElementById('act-btn');
    if (btn) btn.disabled = inp.value.trim().length === 0;
}
window.onPracticeInput = onPracticeInput

function gapRange(value, from, to) {
    if (from !== to) return { from, to };
    const gap = /_{3,}/.exec(value);
    if (gap) return { from: gap.index, to: gap.index + gap[0].length };
    const broken = /=\s*;/.exec(value);
    if (broken) {
        const at = broken.index + broken[0].indexOf(';');
        return { from: at, to: at };
    }
    return { from, to };
}

function insertIntoGap(inp, text) {
    if (!inp || typeof inp.setRangeText !== 'function') return false;
    const value = inp.value;
    const start = inp.selectionStart === null ? value.length : inp.selectionStart;
    const end = inp.selectionEnd === null ? start : inp.selectionEnd;
    const range = gapRange(value, start, end);
    inp.setRangeText(text, range.from, range.to, 'end');
    const next = /_{3,}/.exec(inp.value);
    if (next) inp.setSelectionRange(next.index, next.index + next[0].length);
    return true;
}

function focusGap(inp) {
    if (!inp || inp.selectionStart !== inp.selectionEnd) return;
    const gap = /_{3,}/.exec(inp.value);
    if (!gap) return;
    const pos = inp.selectionStart;
    if (pos < gap.index || pos > gap.index + gap[0].length) {
        inp.setSelectionRange(gap.index, gap.index + gap[0].length);
    }
}
window.focusGap = focusGap

function insertPracticeChip(idx) {
    const inp = document.getElementById('practice-input');
    const text = currentPracticeChips[idx];
    if (!inp || answered || text === undefined || usedPracticeChips.has(idx)) return;
    insertIntoGap(inp, text);
    inp.focus({ preventScroll: true });
    focusGap(inp);
    onPracticeInput(inp);
    usedPracticeChips.add(idx);
    const chip = document.querySelectorAll('.practice-chip')[idx];
    if (chip) chip.classList.add('used');
}
window.insertPracticeChip = insertPracticeChip

function selectOption(idx) {
    if (answered) return;
    selectedOption = idx;
    document.querySelectorAll('.opt').forEach((b, i) => b.classList.toggle('sel', i === idx));
    document.getElementById('act-btn').disabled = false;
}
window.selectOption = selectOption

function checkAnswer() {
    if (answered) return;
    const q = isReviewMode ? errorQuestions[currentQIdx] : shuffledQuestions[currentQIdx];
    if (q.type === 'practice') { checkPracticeAnswer(q); return; }
    if (selectedOption === null) return;
    answered = true;
    const btns = document.querySelectorAll('.opt');
    const act = document.getElementById('act-area');
    document.getElementById('opts-container').classList.add('answered');
    if (selectedOption === currentShuffledCorrect) {
        btns[selectedOption].classList.add('ok');
        comboCount++;
        recordAnswer(true);
        const gain = 10 * comboMultiplier();
        addLessonXP(gain);
        updateStats();
        flashCorrect(btns[selectedOption]);
        showXPPopup(gain);
        mascotEvent('success');
        if (comboMultiplier() >= 2) MascotController.celebrate();
        act.innerHTML = `
      <div class="feedback-title">✅ Верно!</div>
      ${comboMarkup()}
      <button class="btn go" onclick="nextQuestion()">ПРОДОЛЖИТЬ</button>`;
        renderIcons(act);
    } else {
        resetCombo();
        recordAnswer(false);
        btns[selectedOption].classList.add('err');
        btns[currentShuffledCorrect].classList.add('ok');
        hearts = Math.max(0, hearts - 1);
        lessonErrors++;
        updateStats();
        saveState();
        shakeHearts();
        flashWrong(btns[selectedOption]);
        mascotEvent('wrong');
        // Track error question for review
        if (!isReviewMode) {
            errorQuestions.push(q);
        } else {
            q._hadErrorThisRound = true; // mark for next loop iteration
        }
        if (hearts === 0) {
            // In review mode, finish lesson anyway (no hearts but tried)
            if (isReviewMode) {
                act.innerHTML = `
          <div class="feedback-title bad">💔 Нет сердец!</div>
          <div class="feedback-exp">Закончились сердца. Урок завершён.</div>
          <button class="btn bad" onclick="abortLesson()">ЗАВЕРШИТЬ УРОК</button>`;
                act.classList.add('show');
                return;
            }
            act.innerHTML = `
        <div class="feedback-title bad">💔 Нет сердец!</div>
        <div class="feedback-exp">Урок начнётся заново.</div>
        <button class="btn bad" onclick="restartLesson()">НАЧАТЬ ЗАНОВО</button>`;
            act.classList.add('show');
            return;
        }
        act.innerHTML = `
      <div class="feedback-title bad">❌ Ошибка</div>
      <div class="feedback-exp">💡 ${esc(q.exp)}</div>
      <button class="btn bad" onclick="nextQuestion()">ПРОДОЛЖИТЬ</button>`;
    }
    act.classList.add('show');
}

function normalizePracticeCode(s, caseSensitive) {
    let out = String(s).replace(/\r/g, '').trim()
        .replace(/[ \t]+/g, ' ')
        .replace(/ *\n */g, '\n')
        .replace(/;+\s*$/, '');
    if (!caseSensitive) out = out.toLowerCase();
    return out;
}

function checkPracticeAnswer(q) {
    answered = true;
    const inp = document.getElementById('practice-input');
    const act = document.getElementById('act-area');
    const caseSensitive = q.caseSensitive !== false;
    const userAnswer = normalizePracticeCode(inp ? inp.value : '', caseSensitive);
    const rightAnswer = normalizePracticeCode(q.answer || '', caseSensitive);
    if (inp) inp.disabled = true;

    if (userAnswer === rightAnswer) {
        comboCount++;
        recordAnswer(true);
        const gain = 10 * comboMultiplier();
        addLessonXP(gain);
        updateStats();
        if (inp) inp.classList.add('ok');
        flashCorrect(inp || document.getElementById('q-area'));
        showXPPopup(gain);
        mascotEvent('success');
        if (comboMultiplier() >= 2) MascotController.celebrate();
        act.innerHTML = `
      <div class="feedback-title">✅ Верно! +${gain} XP</div>
      ${comboMarkup()}
      <div class="feedback-exp">💡 ${esc(q.exp || '')}</div>
      <button class="btn go" onclick="nextQuestion()">ПРОДОЛЖИТЬ</button>`;
        renderIcons(act);
        act.classList.add('show');
        return;
    }

    resetCombo();
    recordAnswer(false);
    hearts = Math.max(0, hearts - 1);
    lessonErrors++;
    updateStats();
    saveState();
    shakeHearts();
    if (inp) inp.classList.add('err');
    flashWrong(inp || document.getElementById('q-area'));
    mascotEvent('wrong');
    if (!isReviewMode) errorQuestions.push(q);
    else q._hadErrorThisRound = true;

    if (hearts === 0) {
        if (isIntroLesson) {
            act.innerHTML = `
          <div class="feedback-title bad">💔 Нет сердец!</div>
          <div class="feedback-exp">Начнём подготовку заново.</div>
          <button class="btn bad" onclick="restartLesson()">НАЧАТЬ ЗАНОВО</button>`;
        } else if (isReviewMode) {
            act.innerHTML = `
          <div class="feedback-title bad">💔 Нет сердец!</div>
          <div class="feedback-exp">Урок завершён, попробуй ещё раз позже.</div>
          <button class="btn bad" onclick="abortLesson()">ЗАВЕРШИТЬ УРОК</button>`;
        } else {
            act.innerHTML = `
          <div class="feedback-title bad">💔 Нет сердец!</div>
          <div class="feedback-exp">Урок начнётся заново.</div>
          <button class="btn bad" onclick="restartLesson()">НАЧАТЬ ЗАНОВО</button>`;
        }
        act.classList.add('show');
        return;
    }

    act.innerHTML = `
      <div class="feedback-title bad">❌ Почти!</div>
      ${codeDiffHtml(inp ? inp.value : '', q.answer || '')}
      <div class="feedback-exp">💡 ${esc(q.exp || '')}</div>
      <button class="btn bad" onclick="nextQuestion()">ПРОДОЛЖИТЬ</button>`;
    act.classList.add('show');
}

function _showReviewTransition(count, round) {
    const area = document.getElementById('q-area');
    const msg = round === 1
        ? `Ты допустил ${count} ошибок(-ку). Исправляй, пока не ответишь правильно!`
        : `Ещё ${count} вопрос(-ов) неверно. Продолжай!`;
    area.innerHTML = `
    <div style="text-align:center;padding:30px 10px;">
      <div style="font-size:64px;margin-bottom:16px;">🔁</div>
      <div style="font-size:22px;font-weight:900;margin-bottom:10px;color:var(--danger);">Исправим ошибки!</div>
      <div style="font-size:15px;color:var(--text-muted);line-height:1.6;">${msg}</div>
      <div style="margin-top:14px;font-size:13px;color:var(--text-muted);">Осталось сердец: ${hearts}</div>
    </div>`;
    const act = document.getElementById('act-area');
    act.innerHTML = '<button class="btn go" onclick="renderQuestion()">НАЧАТЬ ИСПРАВЛЕНИЕ</button>';
    act.classList.add('show');
    document.getElementById('prog').style.width = '0%';
}

function _finishLesson() {
    const isPerfect = lessonErrors === 0;
    const mi = currentModuleIdx;
    const li = currentLessonIdx;
    const elapsed = Date.now() - lessonStartTs;
    if (elapsed > 0 && elapsed < 3600000) {
        totalStudyMs += elapsed;
        if (!fastestLessonMs || elapsed < fastestLessonMs) fastestLessonMs = elapsed;
    }
    if (isIntroLesson) {
        introDone = true;
        xp += 10;
        saveState();
        updateStats();
        vibrateSuccess(); playLevelUp(); mascotEvent('success');
        showXPPopup(10);
        window.changePage('langmodule')
        openModule(currentModuleIdx);
        showToast('🌱 Подготовка пройдена! Можно начинать с первого урока. +10 XP', 2400);
        isIntroLesson = false;
        lessonRunXP = 0;
        checkNewAchievements();
        return;
    }
    const wasPerfect = perfectLessons[mi][li];
    if (isPerfect) perfectLessons[mi][li] = true;
    lessonCompleted[mi][li] = true;
    recordLessonDone();
    const row = LESSON_XP_BY_LANG[currentLang][mi];
    const prev = Number(row[li]) || 0;
    const target = lessonRunXP + 20 + (isPerfect && !wasPerfect ? 10 : 0);
    const finalXP = Math.max(prev, target);
    const delta = finalXP - prev - lessonRunXP;
    xp = Math.max(0, xp + delta);
    row[li] = finalXP;
    lessonRunXP = 0;
    saveState();
    updateStats();
    vibrateSuccess(); playLevelUp(); mascotEvent('success');
    if (delta > 0) showXPPopup(delta);
    showScreenAnimated('scr-home');
    openModule(currentModuleIdx);
    const mTitle = MODULES[mi].lessons[li].title;
    const perfMsg = isPerfect ? ' <span data-icon="runeLit"></span> Идеально!' : '';
    showToast('🏅 Урок "' + mTitle + '" пройден!' + (delta > 0 ? ' +' + delta + ' XP' : '') + perfMsg, 2200);
    window.changePage('langmodule')
    checkNewAchievements();
}

function nextQuestion() {
    currentQIdx++;
    const total = isReviewMode ? errorQuestions.length : shuffledQuestions.length;
    if (currentQIdx < total) {
        renderQuestion();
    } else if (!isReviewMode && errorQuestions.length > 0) {
        isReviewMode = true;
        reviewRound = 1;
        currentQIdx = 0;
        hearts = Math.min(hearts + 1, 3);
        updateStats();
        _showReviewTransition(errorQuestions.length, 1);
    } else if (isReviewMode) {
        const newErrors = errorQuestions.filter(q => q._hadErrorThisRound);
        errorQuestions.forEach(q => delete q._hadErrorThisRound);
        if (newErrors.length > 0 && hearts > 0) {
            errorQuestions = newErrors;
            reviewRound++;
            currentQIdx = 0;
            updateStats();
            _showReviewTransition(newErrors.length, reviewRound);
        } else {
            _finishLesson();
        }
    } else {
        _finishLesson();
    }
}
window.nextQuestion = nextQuestion


function finishModule() {
    showScreen('scr-home');
    navActive(document.getElementById('nav-home'));
}

// ─── TROPHY TEST ──────────────────────────────────────────────────────────────
function startTrophyTest() {
    if (!testMode && !MODULES[currentModuleIdx].lessons.every((_, i) => lessonCompleted[currentModuleIdx][i])) {
        rejectLocked({ currentTarget: document.querySelector('#path-container .trophy-node.locked') });
        return;
    }
    xp = Math.max(0, xp - trophyRunXP);
    trophyRunXP = 0;
    trophyFirstAttempt = !trophyTestDone[currentModuleIdx];
    saveState();
    trophyQuestions = shuffle(MODULES[currentModuleIdx].trophyQuestions);
    trophyQIdx = 0;
    trophyHearts = 3;
    trophyErrors = 0;
    trophyCorrect = 0;
    trophyAnswered = false;
    trophyTypedAnswer = '';
    showScreen('scr-trophy');
    setNavVisible(false);
    renderTrophyQuestion();
}

function closeTrophy() {
    setNavVisible(true);
    showScreen('scr-home');
    openModule(currentModuleIdx);
    navActive(document.getElementById('nav-home'));
}

function trophyActClick() {
    if (!trophyAnswered) checkTrophyAnswer();
}

function updateTrophyHead() {
    document.getElementById('trophy-prog').style.width = `${(trophyQIdx / trophyQuestions.length) * 100}%`;
    const hNum = document.getElementById('trophy-hearts-num');
    if (hNum) hNum.textContent = String(trophyHearts);
    const hDisp = document.getElementById('trophy-hearts-disp');
    if (hDisp) hDisp.classList.toggle('empty', trophyHearts <= 0);
}

function renderTrophyQuestion() {
    const q = trophyQuestions[trophyQIdx];
    trophyAnswered = false;
    trophyTypedAnswer = '';
    usedTrophyChips.clear();
    updateTrophyHead();
    const area = document.getElementById('trophy-area');
    const isPractice = q.type === 'practice';
    const chips = q.chips || [];
    const safeCode = !isPractice && q.code ? esc(q.code) : '';
    const chipAttrs = c => `onclick="insertChip(${esc(JSON.stringify(c))})"`;
    const answerField = isPractice
        ? `<div class="trophy-field">
             <div class="trophy-field-label">Твой ответ</div>
             <textarea id="trophy-type-input" class="practice-input" rows="4"
               ${safeInputAttrs()} oninput="onTrophyType(this)" onfocus="focusGap(this)"
               onkeydown="if((event.ctrlKey||event.metaKey)&&event.key==='Enter'&&!trophyAnswered) checkTrophyAnswer()">${esc(q.starter || q.code || '')}</textarea>
             <div class="practice-chips">${chips.map((c, i) => `<button type="button" class="practice-chip" ${chipAttrs(c)} id="chip-${i}">${esc(c)}</button>`).join('')}</div>
           </div>`
        : `<div class="trophy-field">
             <div class="trophy-field-label">Твой ответ</div>
             <div class="type-input-wrap">
               <input type="text" class="type-input" id="trophy-type-input"
                 ${safeInputAttrs('enterkeyhint="done"')}
                 oninput="onTrophyType(this)"
                 onkeydown="if(event.key==='Enter' && !trophyAnswered) checkTrophyAnswer()"/>
             </div>
           </div>
           <div class="trophy-field">
             <div class="trophy-field-label"><span data-icon="bulb"></span> Подсказки</div>
             <div class="hint-chips" id="hint-chips-row">
               ${chips.map((c, i) => `<button type="button" class="hint-chip" ${chipAttrs(c)} id="chip-${i}">${esc(c)}</button>`).join('')}
             </div>
           </div>`;
    area.innerHTML = `
    <div class="trophy-question-card">
      <div class="trophy-q-top">
        <span class="trophy-q-label">Вопрос ${trophyQIdx + 1} из ${trophyQuestions.length}</span>
        <span class="trophy-q-step">${Math.round(((trophyQIdx + 1) / trophyQuestions.length) * 100)}%</span>
      </div>
      <div class="trophy-q-title">${esc(q.q)}</div>
      ${safeCode ? `<div class="code-box">${safeCode}</div>` : ''}
      ${answerField}
    </div>`;
    renderIcons(area);
    resetTrophyAct();
    requestAnimationFrame(() => {
        const inp = document.getElementById('trophy-type-input');
        if (inp) {
            inp.focus({ preventScroll: true });
            focusGap(inp);
        }
    });
}

function resetTrophyAct() {
    const act = document.getElementById('trophy-act-area');
    act.innerHTML = `<button class="btn trophy-btn" id="trophy-act-btn" onclick="trophyActClick()" disabled><span data-icon="check"></span> ПРОВЕРИТЬ</button>`;
    renderIcons(act);
    act.classList.add('show');
}

function onTrophyType(inp) {
    trophyTypedAnswer = inp.value;
    document.getElementById('trophy-act-btn').disabled = inp.value.trim().length === 0;
}

function insertChip(text, idx) {
    const inp = document.getElementById('trophy-type-input');
    if (!inp || trophyAnswered) return;
    const buttons = Array.from(document.querySelectorAll('#trophy-area .hint-chip, #trophy-area .practice-chip'));
    let chip = idx === undefined ? buttons.find(b => b.textContent === text && !b.classList.contains('used')) : document.getElementById(`chip-${idx}`);
    if (!chip) return;
    const position = buttons.indexOf(chip);
    if (position < 0 || usedTrophyChips.has(position)) return;
    let token = text;
    if (!/_{3,}/.test(inp.value) && inp.value.trim() && !/\s$/.test(inp.value)) token = ' ' + token;
    if (!insertIntoGap(inp, token)) {
        inp.value += token;
        inp.setSelectionRange(inp.value.length, inp.value.length);
    }
    usedTrophyChips.add(position);
    trophyTypedAnswer = inp.value;
    chip.classList.add('used');
    const actBtn = document.getElementById('trophy-act-btn');
    if (actBtn) actBtn.disabled = !inp.value.trim();
    inp.focus({ preventScroll: true });
    focusGap(inp);
}

function normalizeAnswer(s) {
    return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function checkTrophyAnswer() {
    if (trophyAnswered) return;
    const inp = document.getElementById('trophy-type-input');
    const q = trophyQuestions[trophyQIdx];
    const isPractice = q.type === 'practice';
    const normalize = isPractice
        ? s => normalizePracticeCode(s, q.caseSensitive !== false)
        : normalizeAnswer;
    const userAns = normalize(inp ? inp.value : trophyTypedAnswer);
    const accepted = [q.answer, ...(q.accept || [])].map(normalize);
    trophyAnswered = true;
    const act = document.getElementById('trophy-act-area');
    if (inp) inp.disabled = true;
    if (accepted.includes(userAns)) {
        trophyCorrect++;
        typedCorrectInTest = true;
        addTrophyXP(15);
        updateStats();
        if (inp) inp.classList.add('ok');
        flashCorrect(inp || document.getElementById('trophy-area'));
        showXPPopup(15);
        act.innerHTML = `
      <div style="color:var(--primary);font-weight:800;font-size:17px;margin-bottom:4px;">✅ Верно!</div>
      <div style="color:var(--text-muted);font-size:13px;margin-bottom:12px;line-height:1.4;">💡 ${esc(q.exp)}</div>
      <button class="btn trophy-btn" onclick="nextTrophyQuestion()">ДАЛЕЕ</button>`;
    } else {
        trophyErrors++;
        trophyHearts = Math.max(0, trophyHearts - 1);
        updateTrophyHead();
        saveState();
        shakeHearts();
        if (inp) inp.classList.add('err');
        flashWrong(inp || document.getElementById('trophy-area'));
        act.innerHTML = `
      <div style="color:var(--danger);font-weight:800;font-size:17px;margin-bottom:4px;">❌ Ошибка</div>
      <div style="color:var(--text-muted);font-size:13px;margin-bottom:4px;">Правильный ответ: <span style="color:var(--primary);font-family:monospace;">${esc([q.answer, ...(q.accept || [])].join(' или '))}</span></div>
      <div style="color:var(--text-muted);font-size:13px;margin-bottom:12px;line-height:1.4;">💡 ${esc(q.exp)}</div>
      <button class="btn bad" onclick="nextTrophyQuestion()">ПРОДОЛЖИТЬ</button>`;
    }
    act.classList.add('show');
}

function nextTrophyQuestion() {
    trophyQIdx++;
    if (trophyQIdx < trophyQuestions.length) {
        renderTrophyQuestion();
    } else {
        showTrophyResult();
    }
}

function showTrophyResult() {
    const m = MODULES[currentModuleIdx];
    const mi = currentModuleIdx;
    const passed = trophyHearts > 0;
    const totalQ = trophyQuestions.length;
    const pct = Math.round((trophyCorrect / totalQ) * 100);
    const prevScore = trophyScores[mi] || 0;
    const stars = trophyErrors === 0 ? 3 : trophyErrors === 1 ? 2 : 1;
    const starStr = Array.from({ length: 3 }, (_, i) => `<span data-icon="${i < stars ? 'runeLit' : 'rune'}"></span>`).join('');
    const pctColor = pct === 100 ? 'var(--primary)' : pct >= 80 ? 'var(--gold)' : pct >= 60 ? 'var(--secondary)' : 'var(--danger)';
    const area = document.getElementById('trophy-area');
    let bonusXP = 0;
    if (passed) {
        trophyTestDone[mi] = true;
        trophyScores[mi] = Math.max(prevScore, pct);
        if (trophyErrors === 0) perfectTests[mi] = true;
        bonusXP = trophyFirstAttempt ? m.xpReward : Math.round(m.xpReward * Math.max(0, pct - prevScore) / 100);
        if (!trophyFirstAttempt) xp = Math.max(0, xp - trophyRunXP);
        trophyRunXP = 0;
        xp += bonusXP;
        unlockModuleRewards(mi);
        renderPath();
        document.querySelector('#path-container .trophy-node')?.classList.add('monument-rise');
    } else {
        xp = Math.max(0, xp - trophyRunXP);
        trophyRunXP = 0;
    }
    updateStats();
    saveState();
    checkNewAchievements();
    if (passed) {
        vibrateSuccess(); playLevelUp(); mascotEvent('success');
        if (bonusXP > 0) showXPPopup(bonusXP);
    }
    const resultIcon = passed ? 'runeLit' : 'rune';
    const modIcon = MODULE_ICON_NAMES[mi] || 'star';
    const scoreBlock = passed ? `
      <div class="score-stars">${starStr}</div>
      <div style="margin:12px 0 6px;font-size:42px;font-weight:900;color:${pctColor};">${pct}%</div>
      <div style="font-size:13px;color:var(--text-muted);margin-bottom:12px;">правильных ответов</div>
      <div class="trophy-score-detail">
        <div class="trophy-score-item"><div class="ts-val" style="color:var(--primary);">${trophyCorrect}</div><div class="ts-lbl">ВЕРНО</div></div>
        <div class="trophy-score-item"><div class="ts-val" style="color:var(--danger);">${trophyErrors}</div><div class="ts-lbl">ОШИБОК</div></div>
        <div class="trophy-score-item"><div class="ts-val" style="color:var(--gold);">+${bonusXP}</div><div class="ts-lbl">БОНУС XP</div></div>
      </div>` : `
      <div style="margin:16px 0;font-size:48px;">💔</div>
      <div style="font-size:14px;color:var(--text-muted);line-height:1.6;">Сердца закончились. Тест не засчитан, попробуй ещё раз.</div>`;
    area.innerHTML = `
    <div class="trophy-result-box">
      <span class="big-icon" data-icon="${resultIcon}"></span>
      <h2 style="color:${passed ? 'var(--gold)' : 'var(--danger)'};">${passed ? 'Модуль пройден!' : 'Не хватило сердец!'}</h2>
      ${scoreBlock}
      <p style="color:var(--text-muted);margin:10px 0 4px;">Завершён: <strong style="color:${m.color};display:inline-flex;align-items:center;gap:6px;"><span data-icon="${modIcon}"></span>${m.title}</strong></p>
      ${passed ? '<p style="color:var(--text-muted);font-size:13px;">Наряд разблокирован в редакторе персонажа!</p>' : ''}
      <button class="btn trophy-btn" style="margin-top:20px;" onclick="${passed ? 'closeTrophyFinish()' : 'startTrophyTest()'}">${passed ? 'НА КАРТУ КУРСА' : 'ПРОЙТИ ЗАНОВО'}</button>
    </div>`;
    renderIcons(area);
    const act = document.getElementById('trophy-act-area');
    act.innerHTML = '';
    act.classList.remove('show');
}

function unlockModuleRewards(mi) {
    // unlock outfit
    // Outfit reqXP is bypassed if module completed
    // We just track via lessonCompleted/trophyTestDone, the outfit grid already checks xp
    // For extra unlocks (galaxy bg, moon mask)
    if (MODULE_EXTRA_UNLOCKS[mi]) {
        // These are available in char customizer by req logic
    }
}

function closeTrophyFinish() {
    setNavVisible(true);
    showScreen('scr-home');
    backToModules();
    navActive(document.getElementById('nav-home'));
}

// main.js, ES-модуль, поэтому функции для inline-обработчиков нужно
// явно выставлять в window (иначе кнопки теста молча не работают).
window.startTrophyTest = startTrophyTest;
window.closeTrophy = closeTrophy;
window.trophyActClick = trophyActClick;
window.onTrophyType = onTrophyType;
window.insertChip = insertChip;
window.checkTrophyAnswer = checkTrophyAnswer;
window.nextTrophyQuestion = nextTrophyQuestion;
window.closeTrophyFinish = closeTrophyFinish;

// ─── ACHIEVEMENTS ─────────────────────────────────────────────────────────────
function checkNewAchievements(silent = false) {
    const all = [...ACHIEVEMENTS.modules, ...ACHIEVEMENTS.xp, ...ACHIEVEMENTS.streak, ...ACHIEVEMENTS.mastery];
    const fresh = all.filter(a => a.check() && !unlockedAchievements.has(a.id));
    if (fresh.length) {
        fresh.forEach(a => unlockedAchievements.add(a.id));
        saveState();
        if (!silent) {
            renderHealthDashboard();
            renderAchievements();
            showToast('🏆 ' + fresh[0].name + (fresh.length > 1 ? ` и ещё ${fresh.length - 1}` : ''), 2200);
        }
    }
    if (!profileData.equippedTitleId) {
        let bestTitle = null;
        TITLES.forEach(t => { if (!t.secret && t.check()) bestTitle = t; });
        if (bestTitle) profileData.equippedTitleId = bestTitle.id;
    }
    updateEquippedTitle();
}

function countUnlocked() {
    return [...ACHIEVEMENTS.modules, ...ACHIEVEMENTS.xp, ...ACHIEVEMENTS.streak, ...ACHIEVEMENTS.mastery]
        .filter(a => a.check()).length;
}

function renderAchievements() {
    const total = Object.values(ACHIEVEMENTS).reduce((s, arr) => s + arr.length, 0);
    document.querySelector('#achivements .page-header h3').textContent = `${countUnlocked()} из ${total} разблокировано`;

    function renderGroup(arr, elId) {
        const el = document.getElementById(elId);
        el.innerHTML = arr.map(a => {
            const ok = a.check();
            return `<div class="ach-card ${ok ? 'unlocked' : 'locked-ach'}">
        ${!ok ? '<div class="ach-locked-icon">🔒</div>' : ''}
        <span class="ach-icon">${a.icon}</span>
        <div class="ach-name">${a.name}</div>
        <div class="ach-desc">${a.desc}</div>
      </div>`;
        }).join('');
        renderIcons(el);
    }
    renderGroup(ACHIEVEMENTS.modules, 'ach-grid-modules');
    renderGroup(ACHIEVEMENTS.xp, 'ach-grid-xp');
    renderGroup(ACHIEVEMENTS.streak, 'ach-grid-streak');
    renderGroup(ACHIEVEMENTS.mastery, 'ach-grid-mastery');

    // Titles
    const tList = document.getElementById('titles-list');
    tList.innerHTML = TITLES.map(t => {
        const ok = t.check();
        const equipped = profileData.equippedTitleId === t.id;
        const neonClass = t.neon === 'blood' ? 'title-neon-blood' : t.neon === 'tech' ? 'title-neon-tech' : '';
        const nameStyle = neonClass ? `class="t-name ${neonClass}"` : `class="t-name"`;
        if (t.secret && !ok) return '';
        const reqText = t.secret ? '🔒 Секретный код' : t.req;
        return `<div class="title-card ${ok ? 'unlocked' : 'locked-title'} ${equipped ? 'equipped' : ''}" onclick="${ok ? `equipTitle('${t.id}')` : ''}">
      <div class="t-icon">${t.icon}</div>
      <div class="t-info"><div ${nameStyle}>${t.name}</div><div class="t-req">${reqText}</div></div>
      ${equipped ? '<div class="t-equipped">АКТИВЕН</div>' : (ok ? '<div style="font-size:11px;color:var(--text-muted);font-weight:700;">Нажми чтобы надеть</div>' : '<div style="font-size:11px;color:var(--text-muted);">🔒</div>')}
    </div>`;
    }).join('');
    renderIcons(tList);

    const rList = document.getElementById('rewards-list');
    rList.innerHTML = MODULE_REWARDS.map(r => {
        const earned = r.check();
        const equipped = profileData.artifact === r.id;
        return `<div class="reward-card ${earned ? 'earned' : ''} ${equipped ? 'equipped' : ''}" ${earned ? `onclick="equipArtifact('${r.id}')"` : ''}>
      <div class="r-icon">${r.icon}</div>
      <div class="r-info"><div class="r-name">${r.name}</div><div class="r-desc">${r.desc}</div></div>
      <div class="r-status ${earned ? 'earned-badge' : 'locked-badge'}">${earned ? (equipped ? 'АКТИВЕН' : 'НАДЕТЬ') : '🔒'}</div>
    </div>`;
    }).join('');
    renderIcons(rList);
}

function equipTitle(id) {
    profileData.equippedTitleId = profileData.equippedTitleId === id ? null : id;
    updateEquippedTitle();
    renderAchievements();
    saveState();
    showToast('✨ Титул изменён!');
}

function updateEquippedTitle() {
    const badge = document.getElementById('equipped-title-badge');
    const iconEl = document.getElementById('equipped-title-icon');
    const textEl = document.getElementById('equipped-title-text');
    if (!badge) return;
    const t = TITLES.find(t => t.id === profileData.equippedTitleId);
    badge.classList.remove('title-badge-blood', 'title-badge-tech');
    if (t) {
        badge.classList.remove('none-title');
        iconEl.innerHTML = t.icon;
        renderIcons(iconEl);
        textEl.textContent = t.name;
        if (t.neon === 'blood') badge.classList.add('title-badge-blood');
        else if (t.neon === 'tech') badge.classList.add('title-badge-tech');
    } else {
        badge.classList.add('none-title');
        iconEl.textContent = '🎖️';
        textEl.textContent = 'Нет титула';
    }
}


function isOutfitUnlockedByModule(outfitIdx) {
    for (const [mi, oIdx] of Object.entries(MODULE_OUTFIT_UNLOCKS)) {
        if (parseInt(oIdx) === outfitIdx && trophyTestDone[parseInt(mi)]) return true;
    }
    return false;
}
function isBgUnlockedByModule(bgIdx) {
    for (const [mi, extras] of Object.entries(MODULE_EXTRA_UNLOCKS)) {
        if (extras.bg === bgIdx && trophyTestDone[parseInt(mi)]) return true;
    }
    return false;
}
function isMaskUnlockedByModule(maskIdx) {
    for (const [mi, extras] of Object.entries(MODULE_EXTRA_UNLOCKS)) {
        if (extras.mask === maskIdx && trophyTestDone[parseInt(mi)]) return true;
    }
    return false;
}

// ─── PROFILE ──────────────────────────────────────────────────────────────────
function switchProfTab(tab) {
    ['edit', 'look', 'devs'].forEach(t => {
        document.getElementById(`ptab-${t}`).classList.toggle('active', t === tab);
        document.getElementById(`ptab-content-${t}`).style.display = t === tab ? 'block' : 'none';
    });
    if (tab === 'devs') renderDevsTab();
}

function renderProfileScreen() {
    document.getElementById('edit-name').value = profileData.name;
    document.getElementById('edit-username').value = profileData.username;
    document.getElementById('edit-bio').value = profileData.bio;
    document.querySelector('#profile .page-header h1').textContent = profileData.name || ', ';
    document.querySelector('#profile .page-header h3').textContent = '@' + (profileData.username || 'username');



    if (!document.querySelector('.ava-wrap')) {
        const avaContainer = document.createElement('div')
        avaContainer.className = 'ava-wrap'
        avaContainer.innerHTML = `
            <div class="ava" id="prof-ava" onclick="onAvaTap()">
                <canvas id="ava-upload-canvas" width="200" height="200" style="width:100%;height:100%;border-radius:50%;display:block;"></canvas>
                <span class="ava-placeholder-icon" id="ava-placeholder-icon">${iconSvg('camera')}</span>
                <div class="ava-edit-badge" id="ava-edit-badge" style="display:none;">${iconSvg('camera')}</div>
            </div>
            <input type="file" id="ava-file-input" accept="image/*" style="display:none;">
        `
        document.querySelector('#profile .page-header').prepend(avaContainer)
    }
    if (!document.querySelector('profileHalfBg')) {
        const halfbg = document.createElement('div')
        halfbg.className = 'profileHalfBg'
        document.querySelector('#profile .page-header').prepend(halfbg)
    }
    if (!document.querySelector('#badgeContainer')) {
        const badgeContainer = document.createElement('div')
        badgeContainer.id = 'badgeContainer'
        badgeContainer.innerHTML = `
            <div class="title-badge-display none-title" id="equipped-title-badge"
                onclick="goAchievements(document.getElementById('nav-ach'))">
                <span id="equipped-title-icon">🎖️</span>
                <span id="equipped-title-text">Нет титула</span>
            </div>
        `
        document.querySelector('#profile .page-header').appendChild(badgeContainer)
    }
    if (!document.querySelector('#profile .page-header #prof-banner-pattern')) {
        const el = document.createElement('div')
        el.id = 'prof-banner-pattern'
        document.querySelector('#profile .page-header').prepend(el)
    }
    // Main avatar is now photo-only (canvas), no SVG render here
    // Restore photo if no image loaded yet (placeholder shown by initAvaUpload)
    if (!_avaImg) {
        const canvas = document.getElementById('ava-upload-canvas');
        drawAvaPlaceholder(canvas);
    }
    syncAvaChrome();
    renderDevBadgeIfNeeded();

    // Banner
    const banner = document.querySelector('#profile .page-header')
    const bc = BANNER_COLORS.find(c => c.id === profileData.bannerId) || BANNER_COLORS[0];
    banner.style.background = bc.g;
    const pat = BANNER_PATTERNS.find(p => p.id === profileData.patternId) || BANNER_PATTERNS[0];
    const patEl = document.getElementById('prof-banner-pattern');
    patEl.className = pat.class;
    patEl.style.cssText = 'position:absolute;inset:0;pointer-events:none;';

    // Banner color row
    const bgRow = document.getElementById('banner-bg-row');
    bgRow.innerHTML = BANNER_COLORS.map(c => `
    <div style="width:36px;height:36px;border-radius:50%;background:${c.color};cursor:pointer;
      border:3px solid ${c.id === profileData.bannerId ? 'white' : 'transparent'};
      transform:${c.id === profileData.bannerId ? 'scale(1.15)' : 'scale(1)'};transition:all 0.15s;
      display:flex;align-items:center;justify-content:center;font-size:12px;"
      onclick="pickBannerColor('${c.id}')">
      ${c.id === profileData.bannerId ? '✓' : ''}
    </div>`).join('');

    // Pattern row
    const patRow = document.getElementById('banner-pattern-row');
    patRow.innerHTML = BANNER_PATTERNS.map(p => `
    <div style="padding:8px 14px;border-radius:10px;background:var(--surface);border:2px solid ${p.id === profileData.patternId ? 'var(--secondary)' : 'var(--surface-light)'};
      font-size:12px;font-weight:800;cursor:pointer;color:${p.id === profileData.patternId ? 'var(--secondary)' : 'var(--text-muted)'};"
      onclick="pickBannerPattern('${p.id}')">${p.label}</div>`).join('');

    updateEquippedTitle();
}

function trySecretCode() {
    const input = document.getElementById('secret-code-input');
    const result = document.getElementById('secret-result');
    const code = input.value.trim().toUpperCase();
    if (SECRET_CODES.hasOwnProperty(code)) {
        const idx = SECRET_CODES[code];
        if (unlockedSecrets.has(idx)) {
            result.style.color = 'var(--gold)';
            result.textContent = '✨ Этот персонаж уже разблокирован!';
        } else {
            unlockedSecrets.add(idx);
            if (idx === 8) {
                // EMPEROR77: skip SVG character entirely, go straight to photo upload
                result.style.color = 'var(--primary)';
                result.textContent = '🔓 👑 Режим Императора активирован!';
                showToast('📷 Загрузи своё фото!', 2500);
                saveState();
                initAvaUpload();
            } else {
                charState.tempBody = idx;
                charState.body = idx;
                // auto-equip matching secret outfit
                const specialId = CHAR_BODIES[idx].special;
                const secretOutfitIdx = CHAR_OUTFITS.findIndex(o => o.secret === specialId);
                if (secretOutfitIdx !== -1) {
                    charState.outfit = secretOutfitIdx;
                    charState.tempOutfit = secretOutfitIdx;
                }
                renderCharSVG(document.getElementById('char-display-svg'), charState.body, charState.outfit, charState.mask, charState.bg);
                result.style.color = 'var(--primary)';
                const charName = '🦝 Разраб Енот разблокирован!';
                result.textContent = '🔓 ' + charName;
                showToast('✨ Секретный персонаж открыт!');
                switchCharTab('body');
                saveState();
            }
        }
    } else {
        result.style.color = 'var(--danger)';
        result.textContent = '❌ Неверный код';
        setTimeout(() => { result.textContent = ''; }, 2000);
    }
    input.value = '';
}
window.trySecretCode = trySecretCode

// ─── EMPEROR AVATAR UPLOAD ────────────────────────────────────────────────────
let _avaImg = null;
let _emperorMode = false;

function onAvaTap() {
    document.getElementById('ava-file-input').click();
}
window.onAvaTap = onAvaTap

function syncAvaChrome() {
    const badge = document.getElementById('ava-edit-badge');
    const icon = document.getElementById('ava-placeholder-icon');
    const wrap = document.querySelector('.ava-wrap');
    if (badge) badge.style.display = _avaImg ? 'flex' : 'none';
    if (icon) icon.style.display = _avaImg ? 'none' : 'flex';
    if (wrap) wrap.classList.toggle('has-photo', !!_avaImg);
}

function initAvaUpload() {
    _emperorMode = true;
    // Hide SVG if present
    const svg = document.getElementById('char-display-svg');
    if (svg) svg.style.display = 'none';
    const canvas = document.getElementById('ava-upload-canvas');
    // Draw placeholder
    if (!_avaImg) drawAvaPlaceholder(canvas);
    syncAvaChrome();

    const fileInput = document.getElementById('ava-file-input');
    if (fileInput._bound) return;
    fileInput._bound = true;
    fileInput.addEventListener('change', function (e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function (ev) {
            _avaImg = new Image();
            _avaImg.onload = function () {
                const canvas = document.getElementById('ava-upload-canvas');
                canvas.style.display = 'block';
                syncAvaChrome();
                document.getElementById('ava-crop-controls').style.display = 'block';
                document.getElementById('ava-zoom').value = 100;
                document.getElementById('ava-ox').value = 0;
                document.getElementById('ava-oy').value = 0;
                drawAvaUpload();
            };
            _avaImg.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    });
}

function drawAvaPlaceholder(canvas) {
    if (!canvas) return;
    const S = 200;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = '#252F3B';
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); ctx.fill();
}

function drawAvaUpload() {
    if (!_avaImg) return;
    const canvas = document.getElementById('ava-upload-canvas');
    const ctx = canvas.getContext('2d');
    const S = 200;
    const zoom = parseInt(document.getElementById('ava-zoom').value);
    const ox = parseInt(document.getElementById('ava-ox').value);
    const oy = parseInt(document.getElementById('ava-oy').value);
    document.getElementById('ava-zoom-val').textContent = zoom + '%';
    ctx.clearRect(0, 0, S, S);
    const scale = zoom / 100;
    const short = Math.min(_avaImg.naturalWidth, _avaImg.naturalHeight);
    const drawW = (_avaImg.naturalWidth / short) * S * scale;
    const drawH = (_avaImg.naturalHeight / short) * S * scale;
    const dx = (S - drawW) / 2 + ox * 2;
    const dy = (S - drawH) / 2 + oy * 2;
    ctx.drawImage(_avaImg, dx, dy, drawW, drawH);
}

function applyAvaUpload() {
    document.getElementById('ava-crop-controls').style.display = 'none';
    showToast('✨ Аватар обновлён!');
}

function pickBannerColor(id) {
    profileData.bannerId = id;
    const bc = BANNER_COLORS.find(c => c.id === id);
    document.querySelector('#profile .page-header').style.background = bc.g;
    renderProfileScreen();
}

function pickBannerPattern(id) {
    profileData.patternId = id;
    const pat = BANNER_PATTERNS.find(p => p.id === id);
    const patEl = document.getElementById('prof-banner-pattern');
    patEl.className = pat.class;
    renderProfileScreen();
}
window.pickBannerPattern = pickBannerPattern
window.pickBannerColor   = pickBannerColor

function confirmReset() {
    document.getElementById('reset-modal-step1').style.display = 'block';
    document.getElementById('reset-modal-step2').style.display = 'none';
    document.getElementById('reset-confirm-input').value = '';
    document.getElementById('reset-final-btn').disabled = true;
    document.getElementById('reset-final-btn').style.opacity = '0.4';
    document.getElementById('reset-modal-bg').classList.add('open');
}

function closeResetModal() {
    document.getElementById('reset-modal-bg').classList.remove('open');
}

function resetStep2() {
    document.getElementById('reset-modal-step1').style.display = 'none';
    document.getElementById('reset-modal-step2').style.display = 'block';
    setTimeout(() => document.getElementById('reset-confirm-input').focus(), 100);
}

function checkResetWord() {
    const val = document.getElementById('reset-confirm-input').value.trim().toUpperCase();
    const ok = (val === 'СБРОС');
    const btn = document.getElementById('reset-final-btn');
    btn.disabled = !ok;
    btn.style.opacity = ok ? '1' : '0.4';
}

function doReset() {
    closeResetModal();
    try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(LEGACY_SAVE_KEY); localStorage.removeItem(TEST_MODE_KEY); } catch (e) { }
    showToast('🗑️ Прогресс сброшен! Перезагружаю...', 2000);
    setTimeout(() => location.reload(), 1500);
}

function saveProfile() {
    const name = document.getElementById('edit-name').value.trim().replace(/<[^>]*>/g, '');
    const user = normalizeUsername(document.getElementById('edit-username').value.trim());
    const bio = document.getElementById('edit-bio').value.trim();
    if (!name) { showToast('❗ Введи имя'); return; }
    if (!user) { showToast('❗ Введи юзернейм'); return; }
    if (user === profileData.username) {
        // Username unchanged, just save name/bio
        profileData.name = name; profileData.bio = bio;
        document.querySelector('#profile .page-header h1').textContent = name;
        saveState();
        showToast('✅ Профиль сохранён!', 1800);
        return;
    }
    const avail = checkUsernameAvailability(user, SAVE_KEY);
    if (avail.isDev && !avail.isOwn) {
        _pendingSetupUsername = user;
        _pendingSetupName = name;
        _pendingSetupBio = bio;
        showPasswordLoginModal(user);
        return;
    }
    if (avail.taken) {
        _pendingSetupUsername = user;
        _pendingSetupName = name;
        _pendingSetupBio = bio;
        showPasswordLoginModal(user);
        return;
    }
    profileData.name = name; profileData.username = user; profileData.bio = bio;
    registerUsername(user, SAVE_KEY, null /* preserve existing hash */);
    document.querySelector('#profile .page-header h1').textContent = name;
    document.querySelector('#profile .page-header h3').textContent = '@' + user;
    if (isDevUsername(user)) applyDevAccount(user);
    renderDevBadgeIfNeeded();
    saveState();
    showToast('✅ Профиль сохранён!', 1800);
}

// ─── CHARACTER CUSTOMIZER ─────────────────────────────────────────────────────
function openAvaModal() {
    charState.tempBody = charState.body;
    charState.tempOutfit = charState.outfit;
    charState.tempMask = charState.mask;
    charState.tempBg = charState.bg;
    switchCharTab('body');
    document.getElementById('ava-modal').classList.add('open');
    updateModalPreview();
}

function closeAvaModal(e) {
    if (e.target === document.getElementById('ava-modal'))
        document.getElementById('ava-modal').classList.remove('open');
}

function confirmAvatar() {
    charState.body = charState.tempBody;
    charState.outfit = charState.tempOutfit;
    charState.mask = charState.tempMask;
    charState.bg = charState.tempBg;
    // Update main avatar
    renderCharSVG(document.getElementById('char-display-svg'), charState.body, charState.outfit, charState.mask, charState.bg);
    document.getElementById('ava-modal').classList.remove('open');
    saveState();
    showToast('✨ Персонаж обновлён!');
}

function updateModalPreview() {
    renderCharSVG(document.getElementById('modal-char-svg'), charState.tempBody, charState.tempOutfit, charState.tempMask, charState.tempBg);
}

function switchCharTab(tab) {
    ['body', 'outfit', 'mask', 'bg'].forEach(t => {
        const el = document.getElementById(`char-tab-${t}`);
        if (el) el.style.display = t === tab ? 'block' : 'none';
    });
    document.querySelectorAll('.char-tab').forEach((btn, i) => {
        const tabs = ['body', 'outfit', 'mask', 'bg'];
        btn.classList.toggle('active', tabs[i] === tab);
    });
    if (tab === 'body') renderBodyGrid();
    else if (tab === 'outfit') renderOutfitGrid();
    else if (tab === 'mask') renderMaskGrid();
    else if (tab === 'bg') renderBgGrid();
}

function renderBodyGrid() {
    const grid = document.getElementById('body-grid');
    grid.innerHTML = CHAR_BODIES.map((b, i) => {
        if (b.secret && !unlockedSecrets.has(i)) return ''; // hide secret chars
        const locked = b.reqXP && xp < b.reqXP && !isBgUnlockedByModule(i);
        const isSecret = b.secret && unlockedSecrets.has(i);
        const borderStyle = isSecret ? 'border-color:#ffc800;background:rgba(255,200,0,0.08);' : '';
        return `
      <div class="custom-item ${charState.tempBody === i ? 'picked' : ''}" 
           style="${borderStyle}" 
           onclick="${!locked ? `pickBody(${i})` : ''}">
        <span style="font-size:28px;">${b.label}</span>
        ${isSecret ? '<div style="position:absolute;top:3px;right:3px;font-size:8px;color:#ffc800;font-weight:900;">★</div>' : ''}
        ${locked ? `<div class="locked-over">🔒</div>` : ''}
      </div>
    `;
    }).join('');
}

function renderOutfitGrid() {
    const OUTFIT_ICONS = { 'tshirt_blue': '👕', 'tshirt_green': '💚', 'hoodie': '🧥', 'robe': '🎓', 'armor': '🛡️', 'ninja': '🥷', 'wizard': '🧙', 'king': '👑', 'dev_hoodie': '💻', 'emperor_cloak': '🔮' };
    const currentBody = CHAR_BODIES[charState.tempBody];
    const grid = document.getElementById('outfit-grid');
    grid.innerHTML = CHAR_OUTFITS.map((o, i) => {
        // hide secret outfits unless current body matches
        if (o.secret && o.secret !== currentBody.special) return '';
        const locked = o.reqXP && xp < o.reqXP && !isOutfitUnlockedByModule(i);
        const icon = OUTFIT_ICONS[o.id] || '👕';
        const isSecret = !!o.secret;
        const borderStyle = isSecret ? 'border:2px solid #ffc800;' : '';
        return `
      <div class="custom-item ${charState.tempOutfit === i ? 'picked' : ''}" onclick="${!locked ? `pickOutfit(${i})` : ''}" style="position:relative;${borderStyle}">
        <div style="width:100%;height:100%;border-radius:10px;background:linear-gradient(135deg,${o.c1},${o.c3});display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;">
          <span style="font-size:22px;">${icon}</span>
          <span style="font-size:7px;font-weight:900;color:rgba(255,255,255,0.85);text-align:center;line-height:1.1;padding:0 2px;">${o.name}</span>
        </div>
        ${isSecret ? '<div style="position:absolute;top:3px;right:3px;font-size:8px;color:#ffc800;font-weight:900;">★</div>' : ''}
        ${locked ? `<div class="locked-over">🔒</div>` : ''}
      </div>
    `;
    }).join('');
}

function renderMaskGrid() {
    const grid = document.getElementById('mask-grid');
    grid.innerHTML = CHAR_MASKS.map((m, i) => {
        const locked = m.reqXP && xp < m.reqXP && !isMaskUnlockedByModule(i);
        const icon = m.noMask ? '🚫' : (m.preview || '🎭');
        return `
      <div class="custom-item ${charState.tempMask === i ? 'picked' : ''}" onclick="${!locked ? `pickMask(${i})` : ''}">
        <span style="font-size:24px;">${icon}</span>
        <div style="font-size:8px;font-weight:800;color:var(--text-muted);position:absolute;bottom:4px;left:0;right:0;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 2px;">${m.name}</div>
        ${locked ? `<div class="locked-over">🔒</div>` : ''}
      </div>
    `;
    }).join('');
}

function renderBgGrid() {
    const grid = document.getElementById('bg-grid');
    grid.innerHTML = CHAR_BGS.map((b, i) => {
        const locked = b.reqXP && xp < b.reqXP;
        return `
      <div class="custom-item bg-item ${charState.tempBg === i ? 'picked' : ''}" 
           style="background:${b.fill};"
           onclick="${!locked ? `pickBg(${i})` : ''}">
        ${charState.tempBg === i ? '<span style="font-size:18px;">✓</span>' : ''}
        ${locked ? `<div class="locked-over">🔒</div>` : ''}
      </div>
    `;
    }).join('');
}

function pickBody(i) { charState.tempBody = i; renderBodyGrid(); updateModalPreview(); }
function pickOutfit(i) { charState.tempOutfit = i; renderOutfitGrid(); updateModalPreview(); }
function pickMask(i) { charState.tempMask = i; renderMaskGrid(); updateModalPreview(); }
function pickBg(i) { charState.tempBg = i; renderBgGrid(); updateModalPreview(); }

// ─── LEAGUE SYSTEM ────────────────────────────────────────────────────────────
const LEAGUES = [
    {
        id: 'stone', name: 'Каменная', minXP: 0, color: '#7a8a9a',
        barColor: 'linear-gradient(90deg,#7a8a9a,#aab8c2)',
        bannerBg: 'linear-gradient(160deg,#2a3a4a,#0f1419)',
        trophy: `<svg viewBox="0 0 80 90" xmlns="http://www.w3.org/2000/svg"><ellipse cx="40" cy="82" rx="22" ry="6" fill="#3a4a5a" opacity="0.5"/><rect x="30" y="68" width="20" height="10" rx="4" fill="#5a6a7a"/><rect x="22" y="62" width="36" height="8" rx="4" fill="#6a7a8a"/><path d="M18 20 Q18 60 40 60 Q62 60 62 20 Z" fill="#8a9aaa"/><path d="M18 20 Q18 48 40 52 Q62 48 62 20 Z" fill="#aab8c2"/><rect x="14" y="16" width="52" height="8" rx="4" fill="#6a7a8a"/><rect x="10" y="20" width="12" height="18" rx="6" fill="#7a8a9a"/><rect x="58" y="20" width="12" height="18" rx="6" fill="#7a8a9a"/><circle cx="40" cy="36" r="8" fill="#c8d8e8" opacity="0.6"/><text x="40" y="42" text-anchor="middle" font-size="10" font-weight="900" fill="#3a4a5a">I</text></svg>`,
    },
    {
        id: 'bronze', name: 'Бронзовая', minXP: 100, color: '#cd7f32',
        barColor: 'linear-gradient(90deg,#cd7f32,#e8a96a)',
        bannerBg: 'linear-gradient(160deg,#3a2010,#0f1419)',
        trophy: `<svg viewBox="0 0 80 90" xmlns="http://www.w3.org/2000/svg"><ellipse cx="40" cy="82" rx="22" ry="6" fill="#3a2010" opacity="0.5"/><rect x="30" y="68" width="20" height="10" rx="4" fill="#8b5520"/><rect x="22" y="62" width="36" height="8" rx="4" fill="#a06030"/><path d="M18 20 Q18 60 40 60 Q62 60 62 20 Z" fill="#cd7f32"/><path d="M18 20 Q18 48 40 52 Q62 48 62 20 Z" fill="#e8a96a"/><rect x="14" y="16" width="52" height="8" rx="4" fill="#a06030"/><rect x="10" y="20" width="12" height="18" rx="6" fill="#cd7f32"/><rect x="58" y="20" width="12" height="18" rx="6" fill="#cd7f32"/><circle cx="40" cy="36" r="8" fill="#ffd080" opacity="0.7"/><text x="40" y="42" text-anchor="middle" font-size="9" font-weight="900" fill="#6a3800">II</text></svg>`,
    },
    {
        id: 'silver', name: 'Серебряная', minXP: 300, color: '#a8b8c8',
        barColor: 'linear-gradient(90deg,#8898a8,#d0e0f0)',
        bannerBg: 'linear-gradient(160deg,#1e2e3e,#0f1419)',
        trophy: `<svg viewBox="0 0 80 90" xmlns="http://www.w3.org/2000/svg"><ellipse cx="40" cy="82" rx="22" ry="6" fill="#1a2a3a" opacity="0.5"/><rect x="30" y="68" width="20" height="10" rx="4" fill="#607080"/><rect x="22" y="62" width="36" height="8" rx="4" fill="#8898a8"/><path d="M18 20 Q18 60 40 60 Q62 60 62 20 Z" fill="#a8b8c8"/><path d="M18 20 Q18 48 40 52 Q62 48 62 20 Z" fill="#d0e0f0"/><rect x="14" y="16" width="52" height="8" rx="4" fill="#8898a8"/><rect x="10" y="20" width="12" height="18" rx="6" fill="#a8b8c8"/><rect x="58" y="20" width="12" height="18" rx="6" fill="#a8b8c8"/><circle cx="40" cy="36" r="9" fill="white" opacity="0.5"/><polygon points="40,28 42.5,35 50,35 44,39.5 46,47 40,43 34,47 36,39.5 30,35 37.5,35" fill="white" opacity="0.9"/></svg>`,
    },
    {
        id: 'gold', name: 'Золотая', minXP: 600, color: '#ffc800',
        barColor: 'linear-gradient(90deg,#e0a800,#ffe066)',
        bannerBg: 'linear-gradient(160deg,#3a2e00,#0f1419)',
        trophy: `<svg viewBox="0 0 80 90" xmlns="http://www.w3.org/2000/svg"><ellipse cx="40" cy="82" rx="22" ry="6" fill="#3a2a00" opacity="0.6"/><rect x="30" y="68" width="20" height="10" rx="4" fill="#a07800"/><rect x="22" y="62" width="36" height="8" rx="4" fill="#c89800"/><path d="M18 20 Q18 60 40 60 Q62 60 62 20 Z" fill="#e0a800"/><path d="M18 20 Q18 48 40 52 Q62 48 62 20 Z" fill="#ffe066"/><rect x="14" y="16" width="52" height="8" rx="4" fill="#c89800"/><rect x="10" y="20" width="12" height="20" rx="6" fill="#e0a800"/><rect x="58" y="20" width="12" height="20" rx="6" fill="#e0a800"/><circle cx="40" cy="36" r="10" fill="#fff8d0" opacity="0.6"/><polygon points="40,26 43,33 51,33 45,38 47,46 40,41 33,46 35,38 29,33 37,33" fill="#fff8d0"/></svg>`,
    },
    {
        id: 'sapphire', name: 'Сапфировая', minXP: 1000, color: '#1cb0f6',
        barColor: 'linear-gradient(90deg,#0d80c0,#60d0ff)',
        bannerBg: 'linear-gradient(160deg,#002a4a,#0f1419)',
        trophy: `<svg viewBox="0 0 80 90" xmlns="http://www.w3.org/2000/svg"><ellipse cx="40" cy="82" rx="22" ry="6" fill="#001a3a" opacity="0.6"/><rect x="30" y="68" width="20" height="10" rx="4" fill="#0050a0"/><rect x="22" y="62" width="36" height="8" rx="4" fill="#0080c8"/><path d="M18 20 Q18 60 40 60 Q62 60 62 20 Z" fill="#0d80c0"/><path d="M18 20 Q18 48 40 52 Q62 48 62 20 Z" fill="#60d0ff"/><rect x="14" y="16" width="52" height="8" rx="4" fill="#0070b0"/><rect x="10" y="20" width="12" height="20" rx="6" fill="#0d80c0"/><rect x="58" y="20" width="12" height="20" rx="6" fill="#0d80c0"/><polygon points="40,24 46,32 54,32 48,38 50,46 40,42 30,46 32,38 26,32 34,32" fill="#a0e8ff" opacity="0.9"/><circle cx="40" cy="14" r="6" fill="#60d0ff"/></svg>`,
    },
    {
        id: 'obsidian', name: 'Обсидиановая', minXP: 3000, color: '#ff4b4b',
        barColor: 'linear-gradient(90deg,#c00,#ff8060)',
        bannerBg: 'linear-gradient(160deg,#2a0000,#0f1419)',
        trophy: `<svg viewBox="0 0 80 90" xmlns="http://www.w3.org/2000/svg"><ellipse cx="40" cy="82" rx="22" ry="6" fill="#1a0000" opacity="0.7"/><rect x="30" y="68" width="20" height="10" rx="4" fill="#3a0000"/><rect x="22" y="62" width="36" height="8" rx="4" fill="#5a0808"/><path d="M18 20 Q18 60 40 60 Q62 60 62 20 Z" fill="#1a0808"/><path d="M18 20 Q18 48 40 52 Q62 48 62 20 Z" fill="#3a1010"/><rect x="14" y="16" width="52" height="8" rx="4" fill="#4a0808"/><path d="M30 30 L38 38 L32 46" stroke="#ff4b4b" stroke-width="1.5" fill="none" opacity="0.8"/><path d="M50 28 L44 36 L48 44" stroke="#ff8060" stroke-width="1.5" fill="none" opacity="0.8"/><circle cx="40" cy="38" r="5" fill="#ff4b4b" opacity="0.25"/><circle cx="40" cy="10" r="9" fill="#1a0808" stroke="#ff4b4b" stroke-width="1.5"/><polygon points="40,1 43.5,7 51,5 47,12 52,17 40,14 28,17 33,12 29,5 36.5,7" fill="#ff4b4b" opacity="0.9"/></svg>`,
    },
];

function getCurrentLeague() {
    let league = LEAGUES[0];
    for (let i = LEAGUES.length - 1; i >= 0; i--) {
        if (xp >= LEAGUES[i].minXP) { league = LEAGUES[i]; break; }
    }
    return league;
}

function getLeagueIndex(id) { return LEAGUES.findIndex(l => l.id === id); }

function renderLeagueScreen() {
    const cur = getCurrentLeague();
    const curIdx = getLeagueIndex(cur.id);
    const next = LEAGUES[curIdx + 1] || null;

    const leagueBanner  = document.querySelector('#league .page-header')
    const leagueName    = document.querySelector('#league .page-header h1')
    const leagueXP      = document.querySelector('#league .page-header h3')
    const trophyImg     = document.querySelector('#league .page-header img')

    leagueBanner.style.background = cur.bannerBg;
    trophyImg.innerHTML = cur.trophy;
    leagueName.textContent = cur.name + ' лига';
    leagueName.style.color = cur.color;
    leagueXP.textContent = next
        ? cur.minXP + ' – ' + (next.minXP - 1) + ' XP'
        : cur.minXP + '+ XP (максимальная!)';
    if (next) {
        const range = next.minXP - cur.minXP;
        const earned = xp - cur.minXP;
        const pct = Math.min(100, Math.round((earned / range) * 100));
        document.getElementById('league-bar').style.width = pct + '%';
        document.getElementById('league-bar').style.background = cur.barColor;
        document.getElementById('league-pct').textContent = pct + '%';
        document.getElementById('league-next-label').textContent = 'До ' + next.name.toLowerCase() + ' лиги: ' + Math.max(0, next.minXP - xp) + ' XP';
    } else {
        document.getElementById('league-bar').style.width = '100%';
        document.getElementById('league-bar').style.background = cur.barColor;
        document.getElementById('league-pct').textContent = '100%';
        document.getElementById('league-next-label').textContent = '🏅 Высшая лига достигнута!';
    }
    const list = document.getElementById('all-leagues');
    list.innerHTML = LEAGUES.map((l, i) => {
        const isCur = l.id === cur.id;
        const isDone = i < curIdx;
        const isLocked = i > curIdx;
        const badge = isCur
            ? '<span class="league-badge badge-current">ТЕКУЩАЯ</span>'
            : isDone ? '<span class="league-badge badge-done">✓ ПРОЙДЕНА</span>'
                : '<span class="league-badge badge-locked">🔒 ' + l.minXP + ' XP</span>';
        return `
      <div class="league-row ${isCur ? 'current' : ''} ${isLocked ? 'locked-league' : ''}">
        <div class="league-trophy-sm" style="filter:drop-shadow(0 2px 8px ${l.color}66)">${l.trophy}</div>
        <div class="league-info">
          <div class="league-row-name" style="color:${isCur ? l.color : isLocked ? 'var(--text-muted)' : 'var(--text)'}">${l.name}</div>
          <div class="league-row-req">${l.minXP === 0 ? 'Начальная лига' : 'от ' + l.minXP + ' XP'}</div>
        </div>
        ${badge}
      </div>`;
    }).join('');
}


// ─── SOUND ENGINE ─────────────────────────────────────────────────────────────
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let _actx = null;
function getACtx() {
    if (!_actx) { try { _actx = new AudioCtx(); } catch (e) { } }
    return _actx;
}
function playTone(freq, dur, type = 'sine', vol = 0.18, decay = 0.9) {
    try {
        const ctx = getACtx(); if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = type; osc.frequency.value = freq;
        gain.gain.setValueAtTime(vol, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur * decay);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + dur);
    } catch (e) { }
}
function playCorrect() {
    playTone(523, 0.12, 'sine', 0.15);
    setTimeout(() => playTone(659, 0.12, 'sine', 0.15), 80);
    setTimeout(() => playTone(784, 0.18, 'sine', 0.15), 160);
}
function playWrong() {
    playTone(220, 0.15, 'sawtooth', 0.12);
    setTimeout(() => playTone(180, 0.2, 'sawtooth', 0.1), 100);
}
function playLevelUp() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => playTone(f, 0.18, 'sine', 0.18), i * 80));
}
function playClick() { playTone(880, 0.06, 'sine', 0.07); }
function playXP() { playTone(1047, 0.1, 'sine', 0.12); setTimeout(() => playTone(1319, 0.15, 'sine', 0.12), 60); }

// ─── VIBRATION ────────────────────────────────────────────────────────────────
function vibrate(pattern) {
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { }
}
function vibrateOk() { vibrate([30]); }
function vibrateWrong() { vibrate([40, 20, 40]); }
function vibrateSuccess() { vibrate([20, 10, 20, 10, 80]); }

// ─── XP POPUP ─────────────────────────────────────────────────────────────────
function showXPPopup(amount) {
    try {
    const el = document.getElementById('xp-popup');
    el.textContent = '+' + amount + ' XP';
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 1500);
    playXP();
    } catch(e) { console.warn(e) }
}

// ─── STREAK MODAL ─────────────────────────────────────────────────────────────
function checkAndShowStreak() {
    const today = new Date().toDateString();
    const lastSeen = localStorage.getItem('geltcode_last_seen');
    const streak = parseInt(localStorage.getItem('geltcode_streak') || '1');
    if (lastSeen !== today) {
        localStorage.setItem('geltcode_last_seen', today);
        if (streak > 1) {
            document.getElementById('streak-modal-days').textContent = streak;
            document.getElementById('streak-modal-title').textContent = streak >= 7 ? '🔥 Огненная серия!' : 'Серия продолжается!';
            document.getElementById('streak-modal-bg').classList.add('open');
        }
    }
}
function closeStreakModal() {
    document.getElementById('streak-modal-bg').classList.remove('open');
}

// ─── SPLASH SCREEN ────────────────────────────────────────────────────────────
function runSplash(cb) {
    const bar = document.getElementById('splash-bar');
    let p = 0;
    const iv = setInterval(() => {
        p += Math.random() * 15 + 5;
        if (p >= 100) { p = 100; clearInterval(iv); }
        bar.style.width = p + '%';
        if (p >= 100) setTimeout(() => {
            document.getElementById('splash').classList.add('hiding');
            setTimeout(() => {
                document.getElementById('splash').style.display = 'none';
                cb();
            }, 500);
        }, 200);
    }, 80);
}

// ─── ONBOARDING ───────────────────────────────────────────────────────────────
const ONBOARD_STEPS = [
    { graphic: '🐲', title: 'Добро пожаловать!', sub: 'Изучай Pascal через короткие уроки, как игру. Прокачивай персонажа и собирай достижения.' },
    { graphic: '⚡', title: 'Зарабатывай XP', sub: 'За каждый правильный ответ ты получаешь опыт. Поднимайся по лигам, от Каменной до Обсидиановой.' },
    { graphic: '🔥', title: 'Поддерживай серию', sub: 'Занимайся каждый день, не теряй огонь! Серия даёт бонусы и открывает секретный контент.' },
    { graphic: '🎮', title: 'Готов начать?', sub: 'Выбери имя и создай своего персонажа. Первый урок займёт всего 2 минуты!' },
];
let onboardStep = 0;

function onboardNext() {
    playClick();
    onboardStep++;
    if (onboardStep >= ONBOARD_STEPS.length) { finishOnboard(); return; }
    const s = ONBOARD_STEPS[onboardStep];
    document.getElementById('ob-graphic').textContent = s.graphic;
    document.getElementById('ob-graphic').style.animation = 'none';
    setTimeout(() => document.getElementById('ob-graphic').style.animation = 'bounceIn 0.5s', 10);
    document.getElementById('ob-title').textContent = s.title;
    document.getElementById('ob-sub').textContent = s.sub;
    ONBOARD_STEPS.forEach((_, i) => {
        const d = document.getElementById('od' + i);
        if (d) d.classList.toggle('active', i === onboardStep);
    });
    if (onboardStep === ONBOARD_STEPS.length - 1) {
        document.querySelector('#welcome .btn.go').textContent = 'НАЧАТЬ! 🚀';
    }
}
window.onboardNext = onboardNext

function skipOnboard() {
    finishOnboard();
}

function finishOnboard() {
    window.changePage('registration')
    vibrateSuccess(); playLevelUp(); mascotEvent('success');
    // Show profile setup if user has no name yet
    if (!profileData.name) {
        setTimeout(() => {
            window.changePage('registration')
        }, 300);
    } else {
        setTimeout(() => checkAndShowStreak(), 400);
    }
}

function selectLevel(level, silent) {
    if (!LEVELS[level]) return;
    profileData.level = level;
    document.querySelectorAll('#registration .level-card[data-level]').forEach(card => {
        card.classList.toggle('selected', card.dataset.level === level);
    });
    if (!silent) playClick();
}
window.selectLevel = selectLevel

function updateTestModeBadge() {
    const badge = document.getElementById('test-mode-badge');
    if (badge) badge.style.display = testMode ? 'flex' : 'none';
    const btn = document.getElementById('profile-test-mode-btn');
    if (btn) btn.textContent = testMode ? '🧪 Выйти из тестового режима' : '🧪 Включить тестовый режим';
}

function enterTestMode() {
    testMode = true;
    localStorage.setItem(TEST_MODE_KEY, '1');
    localStorage.setItem('geltcode_onboarded', '1');
    if (!profileData.name) profileData.name = 'Тестер';
    if (!profileData.username) profileData.username = 'test_mode';
    const chosen = document.querySelector('#registration .level-card[data-level].selected');
    if (chosen) profileData.level = chosen.dataset.level;
    saveState();
    renderModulesList();
    updateStats();
    updateTestModeBadge();
    window.changePage('home');
    showToast('🧪 Тестовый режим: все модули и уроки открыты', 2600);
}

function exitTestMode() {
    testMode = false;
    localStorage.removeItem(TEST_MODE_KEY);
    saveState();
    renderModulesList();
    updateStats();
    updateTestModeBadge();
    window.changePage('home');
    showToast('Тестовый режим выключен', 1800);
}

function toggleTestMode() {
    if (testMode) exitTestMode();
    else enterTestMode();
}

window.enterTestMode = enterTestMode;
window.exitTestMode = exitTestMode;
window.toggleTestMode = toggleTestMode;
window.updateTestModeBadge = updateTestModeBadge;

function finishProfileSetup() {
    localStorage.setItem('geltcode_onboarded', '1');
    const name = document.getElementById('setup-name').value.trim();
    const user = document.getElementById('setup-username').value.trim();
    const bio = document.getElementById('setup-bio').value.trim();
    const pwd = document.getElementById('setup-password').value;
    const errEl = document.getElementById('setup-error');
    if (!name) { errEl.textContent = '❗ Введи своё имя'; return; }
    if (!user) { errEl.textContent = '❗ Введи имя пользователя'; return; }
    if (!pwd || pwd.length < 4) { errEl.textContent = '❗ Пароль должен быть не менее 4 символов'; return; }
    const chosenLevel = document.querySelector('#registration .level-card.selected');
    if (!chosenLevel) { errEl.textContent = '❗ Выбери, с чего начать обучение'; return; }
    profileData.level = chosenLevel.dataset.level;

    const pwdHash = hashPassword(pwd);
    const normalized = user.toLowerCase().replace(/[^a-z0-9_.]/g, '');

    // Check dev accounts first
    const avail = checkUsernameAvailability(user, SAVE_KEY);
    if (avail.isDev && !avail.isOwn) {
        _pendingSetupUsername = user;
        _pendingSetupName = name;
        _pendingSetupBio = bio;
        showPasswordLoginModal(user);
        return;
    }

    errEl.textContent = '⏳ Проверяем ник...';
    document.querySelector('#registration .btn.go').disabled = true;

    // Check Firebase if available, else fall back to localStorage
    const doCheck = window._fb
        ? window._fb.usernameExists(user)
        : Promise.resolve(false);

    doCheck.then(existsInCloud => {
        const localAvail = checkUsernameAvailability(user, SAVE_KEY);
        const taken = existsInCloud || localAvail.taken;

        if (taken) {
            _pendingSetupUsername = user;
            _pendingSetupName = name;
            _pendingSetupBio = bio;
            errEl.textContent = '';
            document.querySelector('#profile-setup-screen .btn.go').disabled = false;
            showPasswordLoginModal(user);
            return;
        }

        // Free, register
        errEl.textContent = '';
        document.querySelector('#profile-setup-screen .btn.go').disabled = false;
        profileData.name = name;
        profileData.username = user;
        profileData.bio = bio;
        registerUsername(user, SAVE_KEY, pwdHash);
        // Save password to cloud
        if (window._fb) window._fb.savePwd(user, pwdHash);
        document.getElementById('edit-name').value = name;
        document.getElementById('edit-username').value = user;
        document.getElementById('edit-bio').value = bio;
        document.querySelector('#profile .page-header h1').textContent = name;
        document.querySelector('#profile .page-header h3').textContent = '@' + user;
        if (isDevUsername(user)) applyDevAccount(user);
        renderDevBadgeIfNeeded();
        saveState();
        window.changePage('home')
        vibrateSuccess();
        setTimeout(() => checkAndShowStreak(), 400);
    }).catch(() => {
        errEl.textContent = '';
        document.querySelector('#registration .btn.go').disabled = false;
        // Fallback: just use local check
        const localAvail = checkUsernameAvailability(user, SAVE_KEY);
        if (localAvail.taken) {
            _pendingSetupUsername = user; _pendingSetupName = name; _pendingSetupBio = bio;
            showPasswordLoginModal(user); return;
        }
        profileData.name = name; profileData.username = user; profileData.bio = bio;
        registerUsername(user, SAVE_KEY, pwdHash);
        try {
            document.getElementById('edit-name').value = name;
            document.getElementById('edit-username').value = user;
            document.getElementById('edit-bio').value = bio;
            document.querySelector('#profile .page-header h1').textContent = name;
            document.querySelector('#profile .page-header h3').textContent = '@' + user;
        } catch(e) { console.warn(e) }
        if (isDevUsername(user)) applyDevAccount(user);
        renderDevBadgeIfNeeded();
        saveState();
        window.changePage('home')
        vibrateSuccess();
        setTimeout(() => checkAndShowStreak(), 400);
    });
}
window.finishProfileSetup = finishProfileSetup

// Остальные inline-обработчики профиля и редактора персонажа.
window.switchProfTab = switchProfTab;
window.saveProfile = saveProfile;
window.confirmReset = confirmReset;
window.closeAvaModal = closeAvaModal;
window.switchCharTab = switchCharTab;
window.drawAvaUpload = drawAvaUpload;
window.applyAvaUpload = applyAvaUpload;
window.confirmAvatar = confirmAvatar;

// Модальные окна: пароль, конфликт юзернейма, сброс, серия дней.
window.showPasswordLoginModal = showPasswordLoginModal;
window.closePasswordLoginModal = closePasswordLoginModal;
window.confirmPasswordLogin = confirmPasswordLogin;
window.showUsernameConflictModal = showUsernameConflictModal;
window.closeUsernameConflictModal = closeUsernameConflictModal;
window.closeResetModal = closeResetModal;
window.resetStep2 = resetStep2;
window.checkResetWord = checkResetWord;
window.doReset = doReset;
window.closeStreakModal = closeStreakModal;
window.checkAndShowStreak = checkAndShowStreak;
window.showXPPopup = showXPPopup;
window.restartLesson = restartLesson;
window.abortLesson = abortLesson;
window.checkNewAchievements = checkNewAchievements;

function showOnboardingIfNeeded() {
    if (!localStorage.getItem('geltcode_onboarded')) {
        window.changePage('welcome')
    } else if (!profileData.name) {
        // Already onboarded but no profile name (legacy save or reset)
        window.changePage('registration')
        setTimeout(() => selectLevel(profileData.level || 'zero', true), 0)
    } else {
        setTimeout(() => checkAndShowStreak(), 600);
        window.changePage('home')
        selectLevel(profileData.level || 'zero', true)
        const h1 = document.querySelector('#home .page-header h1');
        if (h1) h1.textContent = COURSE_LABELS[currentLang] || currentLang;
    }
}

// ─── USERNAME CONFLICT MODAL ─────────────────────────────────────────────────
function showUsernameConflictModal(username) {
    document.getElementById('conflict-username').textContent = '@' + username;
    document.getElementById('username-conflict-modal').style.display = 'flex';
}
function closeUsernameConflictModal() {
    document.getElementById('username-conflict-modal').style.display = 'none';
}

// ─── DEVS TAB RENDERER ───────────────────────────────────────────────────────
function renderDevsTab() {
    const container = document.getElementById('devs-cards-list');
    if (!container) return;

    const devList = [
        {
            key: 'imperor',
            displayName: 'Imperor',
            role: 'Основатель & Frontend / UI',
            desc: 'Автор концепции, методология, дизайн интерфейса, мобильная адаптация и анимации.',
            icon: 'crown',
            color: '#ffc800',
            bg: 'linear-gradient(135deg,rgba(255,200,0,0.12),rgba(255,140,0,0.05))',
            border: 'rgba(255,200,0,0.35)',
            iconBg: 'linear-gradient(135deg,#ffc800,#ff8c00)',
            titleLabel: 'Основатель',
        },
        {
            key: 'eenot',
            displayName: 'EEnot',
            role: 'Backend & Sandbox',
            desc: 'Серверная логика, безопасный sandbox для выполнения задач.',
            icon: 'gear',
            color: '#1CB0F6',
            bg: 'var(--surface)',
            border: 'var(--surface-light)',
            iconBg: 'linear-gradient(135deg,#3a7bd5,#1CB0F6)',
            titleLabel: 'Разработчик',
        },
    ];

    container.innerHTML = devList.map(dev => {
        const isMe = (profileData.username || '').toLowerCase().replace(/[^a-z0-9_.]/g, '') === dev.key;
        const meBadge = isMe
            ? `<span style="background:rgba(88,204,2,0.15);color:var(--primary);border:1px solid var(--primary);border-radius:10px;padding:2px 8px;font-size:10px;font-weight:800;margin-left:6px;">ЭТО ТЫ</span>`
            : '';
        const titleBadge = `<span class="dev-title-badge" style="display:inline-flex;align-items:center;gap:4px;background:rgba(0,0,0,0.3);border:1px solid ${dev.color};border-radius:10px;padding:2px 8px;font-size:10px;font-weight:800;color:${dev.color};"><span data-icon="${dev.icon}"></span> ${dev.titleLabel}</span>`;
        return `
    <div style="background:${dev.bg};border:1.5px solid ${dev.border};border-radius:18px;padding:18px;margin-bottom:12px;">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:10px;">
        <div class="dev-icon-circle" style="width:48px;height:48px;border-radius:50%;background:${dev.iconBg};display:flex;align-items:center;justify-content:center;flex-shrink:0;"><span data-icon="${dev.icon}"></span></div>
        <div style="flex:1;">
          <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px;">
            <span style="font-size:15px;font-weight:900;color:${dev.color};">${dev.displayName}</span>
            ${meBadge}
          </div>
          <div style="font-size:11px;color:var(--text-muted);font-weight:700;margin-top:2px;">@${dev.key}</div>
          <div style="margin-top:5px;">${titleBadge}</div>
        </div>
      </div>
      <div style="font-size:11px;color:var(--text-muted);font-weight:800;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">${dev.role}</div>
      <div style="font-size:12px;color:var(--text-muted);line-height:1.5;">${dev.desc}</div>
    </div>`;
    }).join('');
    renderIcons(container);
}

// ─── DEV BADGE in profile display ─────────────────────────────────────────────
function renderDevBadgeIfNeeded() {
    const normalized = (profileData.username || '').toLowerCase().replace(/[^a-z0-9_.]/g, '');
    const dev = DEV_ACCOUNTS[normalized];
    const badge = document.getElementById('dev-role-badge');
    if (!badge) return;
    if (dev) {
        badge.style.display = 'flex';
        badge.innerHTML = `<span style="font-size:14px;">${dev.icon}</span><span>${dev.role}</span>`;
        badge.style.borderColor = dev.color;
        badge.style.color = dev.color;
    } else {
        badge.style.display = 'none';
    }
}

// ─── LEADERBOARD ─────────────────────────────────────────────────────────────
const LB_BOTS = [
    { name: 'PascalMaster', username: 'pascal_pro', xp: 2840, ava: '🤖' },
    { name: 'CodeDragon', username: 'c0d3dragon', xp: 2310, ava: '🐲' },
    { name: 'AlgoKing', username: 'algoking99', xp: 1980, ava: '👑' },
    { name: 'ByteNinja', username: 'byte_ninja', xp: 1650, ava: '🥷' },
    { name: 'StackFox', username: 'stack_fox', xp: 1320, ava: '🦊' },
    { name: 'VarGhost', username: 'var_ghost', xp: 980, ava: '👻' },
    { name: 'LoopWizard', username: 'loopwiz', xp: 740, ava: '🧙' },
    { name: 'DebugRaccoon', username: 'debug_rac', xp: 510, ava: '🦝' },
    { name: 'NullPointer', username: 'null_ptr', xp: 280, ava: '💀' },
];

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderLeaderboard() {
    const myName = profileData.name || 'Ты';
    const myEntry = { name: myName, username: profileData.username || 'me', xp, ava: null, isMe: true };
    const all = [...LB_BOTS, myEntry].sort((a, b) => b.xp - a.xp);
    const myRank = all.findIndex(e => e.isMe) + 1;
    document.querySelector('#leaderboard .page-header h3').textContent = `Твоё место: #${myRank} из ${all.length}`;

    const medals = ['🥇', '🥈', '🥉'];
    document.getElementById('lb-list').innerHTML = all.map((e, i) => {
        const rank = i + 1;
        const cls = e.isMe ? 'me' : rank === 1 ? 'top1' : rank === 2 ? 'top2' : rank === 3 ? 'top3' : '';
        const medal = medals[i] || rank;
        return `<div class="lb-row ${cls}">
      <div class="lb-rank">${medal}</div>
      <div class="lb-ava">${e.isMe && _avaImg ? `<canvas id="lb-me-canvas" width="42" height="42" style="width:42px;height:42px;border-radius:50%;"></canvas>` : `<span style="font-size:20px;">${e.ava || '👤'}</span>`}</div>
      <div class="lb-info">
        <div class="lb-name">${escapeHtml(e.name)}${e.isMe ? ' <span style="color:var(--secondary);font-size:10px;">ВЫ</span>' : ''}</div>
        <div class="lb-sub">@${escapeHtml(e.username)}</div>
      </div>
      <div class="lb-xp">⚡${e.xp}</div>
    </div>`;
    }).join('');
    // Draw user photo on lb canvas
    if (_avaImg) {
        requestAnimationFrame(() => {
            const lbC = document.getElementById('lb-me-canvas');
            if (lbC) {
                const ctx = lbC.getContext('2d');
                const S = 42;
                ctx.clearRect(0, 0, S, S);
                ctx.save();
                ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); ctx.clip();
                const short = Math.min(_avaImg.naturalWidth, _avaImg.naturalHeight);
                const drawW = (_avaImg.naturalWidth / short) * S;
                const drawH = (_avaImg.naturalHeight / short) * S;
                ctx.drawImage(_avaImg, (S - drawW) / 2, (S - drawH) / 2, drawW, drawH);
                ctx.restore();
            }
        });
    }
}

function goLeaderboard(el) {
    playClick();
    navActive(el);
    showScreenAnimated('scr-lb');
    try { renderLeaderboard(); } catch (e) { console.error('lb error', e); }
}

// ─── ANIMATED SCREEN TRANSITIONS ─────────────────────────────────────────────
function showScreenAnimated(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const next = document.getElementById(id);
    if (next) next.classList.add('active');
}

// ─── ENHANCED ANSWER FEEDBACK ────────────────────────────────────────────────
function flashCorrect(el) {
    el.classList.add('pop');
    setTimeout(() => el.classList.remove('pop'), 350);
    vibrateOk(); playCorrect();
}
function flashWrong(el) {
    el.classList.add('shake');
    setTimeout(() => el.classList.remove('shake'), 450);
    vibrateWrong(); playWrong();
}



// The mobile keyboard fires many visualViewport events per frame. Coalesce
// them into one rAF and write styles only when the value actually changes.
let keyboardFrame = 0;
let keyboardOffsetPx = -1;
let keyboardIsOpen = false;

function setupKeyboardOffset() {
    const root = document.documentElement;
    const vv = window.visualViewport;
    const scheduleSync = () => {
        if (keyboardFrame) return;
        keyboardFrame = requestAnimationFrame(() => {
            keyboardFrame = 0;
            const overlap = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
            const px = Math.round(overlap);
            if (px !== keyboardOffsetPx) {
                root.style.setProperty('--kb-offset', `${px}px`);
                keyboardOffsetPx = px;
            }
            const open = overlap > 80;
            if (open !== keyboardIsOpen) {
                root.classList.toggle('kb-open', open);
                keyboardIsOpen = open;
            }
            keepActionVisible();
        });
    };
    if (vv) {
        vv.addEventListener('resize', scheduleSync, { passive: true });
        vv.addEventListener('scroll', scheduleSync, { passive: true });
    }
    window.addEventListener('resize', scheduleSync, { passive: true });
    document.addEventListener('focusin', (event) => {
        if (event.target instanceof Element && event.target.matches('input, textarea')) keepActionVisible();
    });
    scheduleSync();
}

function keepActionVisible() {
    const active = document.activeElement;
    if (!active || !active.matches('input, textarea')) return;
    const scroller = active.closest('.pageContent, .trophy-content');
    const button = scroller && scroller.querySelector('.action.show');
    if (!button) return;
    let attempts = 0;
    const tick = () => {
        const vv = window.visualViewport;
        const keyboard = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
        if (!keyboard) {
            button.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            return;
        }
        // The visual viewport shrinks but the layout viewport does not, so
        // scrollIntoView() alone leaves the button under the keyboard.
        const visibleBottom = vv.height + vv.offsetTop - 24;
        const overflow = button.getBoundingClientRect().bottom - visibleBottom;
        if (overflow > 0) scroller.scrollTop += overflow;
        // Two extra passes cover the layout shift caused by the keyboard padding.
        if (++attempts < 3) setTimeout(tick, 110);
    };
    tick();
}

loadState();
applyArtifactGlow();

await window.waitForVariable(() => window.eelibMgr?.isLoaded, true)
MODULES = COURSES[currentLang] || MODULES;
applyLangProgress(currentLang);
renderModulesList();
renderIcons();
hardenTextInputs();
setupBackButtons();
setupKeyboardOffset();
updateTestModeBadge();
updateStats();
const homeTitle = document.querySelector('#home .page-header h1');
if (homeTitle) homeTitle.textContent = COURSE_LABELS[currentLang] || currentLang;
const homeSubtitle = document.querySelector('#home .page-header h3');
if (homeSubtitle) homeSubtitle.textContent = `${trophyTestDone.filter(Boolean).length} из ${MODULES.length} модулей пройдено`;
charState.bg = 0;

// Splash → onboarding → app
runSplash(() => {
    showOnboardingIfNeeded();
});

window.renderProfileScreen  = renderProfileScreen
window.renderLeagueScreen   = renderLeagueScreen
window.renderLeaderboard    = renderLeaderboard

const initMascot = () => {
    setTimeout(() => { initAvaUpload() }, 200);
    MascotController.bindEvents();
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initMascot);
else initMascot();

renderProfileScreen()
renderLeagueScreen()
renderLeaderboard()
renderAchievements()
checkNewAchievements(true)

const profileTabs = ['edit', 'look', 'devs']
document.querySelectorAll('#profile .page-header-btns .btnsList button').forEach((btn, index) => {
    btn.addEventListener('click', () => {
        switchProfTab(profileTabs[index])
    })
})