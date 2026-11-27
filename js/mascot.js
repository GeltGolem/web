'use strict';

const MASCOT_DIR = 'img/mascot/';
const SPRITES = ['idle', 'wave', 'celebrate', 'think', 'sad', 'wow'];
const FALLBACK = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
    '<circle cx="32" cy="33" r="28" fill="#58CC02"/>' +
    '<circle cx="45" cy="24" r="4.5" fill="#fff"/><circle cx="19" cy="24" r="4.5" fill="#fff"/>' +
    '<circle cx="32" cy="28.5" r="2.5" fill="#fff"/></svg>');
const WIN_POSES = [['wow', 110], ['celebrate', 650], ['wave', 350], ['idle']];
const FAIL_POSES = [['wow', 110], ['sad', 800], ['think']];
const TAP_POSES = [['wave', 180], ['celebrate', 260], ['idle']];

const MascotController = {
    emotion: 'idle',
    root: null,
    _inited: false,
    _timer: null,
    _glowTimer: null,
    _audio: null,

    init() {
        if (this._inited) return this;
        this._inited = true;
        SPRITES.forEach(name => { const img = new Image(); img.src = MASCOT_DIR + name + '.webp'; });
        return this;
    },

    mountLesson(slot) {
        if (!slot) return this;
        this.init();
        if (!this.root) {
            const img = document.createElement('img');
            img.alt = '';
            img.className = 'mascot-sprite';
            img.onerror = () => { img.onerror = null; img.src = FALLBACK; };
            this.root = document.createElement('div');
            this.root.className = 'mascot mascot-lesson';
            this.root.setAttribute('role', 'img');
            this.root.setAttribute('aria-label', 'Маскот-голем');
            this.root.appendChild(img);
        }
        slot.replaceChildren(this.root);
        this.setEmotion(this.emotion);
        return this;
    },

    setEmotion(name) {
        if (!SPRITES.includes(name) || !this.root) return this;
        this.emotion = name;
        this.root.dataset.emotion = name;
        this.root.className = `mascot mascot-lesson mascot-${name}`;
        const img = this.root.firstElementChild;
        img.src = MASCOT_DIR + name + '.webp';
        img.classList.remove('mascot-pop');
        void img.offsetWidth;
        img.classList.add('mascot-pop');
        return this;
    },

    _play(poses, done) {
        clearTimeout(this._timer);
        let i = 0;
        const next = () => {
            const [name, ms] = poses[i++];
            this.setEmotion(name);
            if (i < poses.length) this._timer = setTimeout(next, ms);
            else if (done) done();
        };
        next();
        return this;
    },

    celebrate() {
        return this._play(WIN_POSES, () => this._glow());
    },

    fail() {
        return this._play(FAIL_POSES);
    },

    tap() {
        this._click();
        return this._play(TAP_POSES);
    },

    _glow() {
        const root = this.root;
        if (!root) return this;
        root.classList.remove('mascot-glow');
        void root.offsetWidth;
        root.classList.add('mascot-glow');
        clearTimeout(this._glowTimer);
        this._glowTimer = setTimeout(() => root.classList.remove('mascot-glow'), 700);
        return this;
    },

    _click() {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return this;
        try {
            if (!this._audio) this._audio = new Ctx();
            const ctx = this._audio;
            if (ctx.state === 'suspended') Promise.resolve(ctx.resume()).catch(() => {});
            const t = ctx.currentTime;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(1200, t);
            osc.frequency.exponentialRampToValueAtTime(600, t + 0.04);
            gain.gain.setValueAtTime(0.06, t);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
            osc.connect(gain).connect(ctx.destination);
            osc.start(t);
            osc.stop(t + 0.07);
        } catch (e) { this._audio = null; }
        return this;
    },

    bindEvents() {
        this.init();
        const on = (name, fn) => window.addEventListener('mascot-' + name, fn);
        on('success', () => this.celebrate());
        on('wrong', () => this.fail());
        on('error', () => this.fail());
        ['question', 'loading'].forEach(name => on(name, () => {
            clearTimeout(this._timer);
            this.setEmotion('think');
        }));
        document.addEventListener('click', e => {
            if (e.target.closest('.mascot')) this.tap();
        });
        return this;
    },
};

export default MascotController;
