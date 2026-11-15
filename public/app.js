/* پیک — رابط کاربری (بدون وابستگی به کتابخانه‌ی خارجی) */
'use strict';

/* ═════════ ابزارهای عمومی ═════════ */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (n, cls = '') => `<svg class="i ${cls}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const FA = new Intl.NumberFormat('fa-IR');
const fa = (n) => FA.format(n);
const faDigits = (s) => String(s).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
const timeFmt = new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit', hour12: false });
const dayFmt = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { weekday: 'long', day: 'numeric', month: 'long' });
const dayYearFmt = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', day: 'numeric', month: 'long' });
const shortDateFmt = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { month: 'short', day: 'numeric' });
const weekdayFmt = new Intl.DateTimeFormat('fa-IR', { weekday: 'long' });
const sod = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const DAY = 864e5;
const fmtTime = (t) => timeFmt.format(t);
const sameDay = (a, b) => sod(a) === sod(b);
function dayLabel(t) {
  const today = sod(Date.now());
  const d = sod(t);
  if (d === today) return 'امروز';
  if (d === today - DAY) return 'دیروز';
  return new Date(t).getFullYear() === new Date().getFullYear() ? dayFmt.format(t) : dayYearFmt.format(t);
}
function listTime(t) {
  const today = sod(Date.now()), d = sod(t);
  if (d === today) return fmtTime(t);
  if (d === today - DAY) return 'دیروز';
  if (today - d < 6 * DAY) return weekdayFmt.format(t);
  return shortDateFmt.format(t);
}
function lastSeenText(u) {
  if (u.online) return 'آنلاین';
  const t = u.last_seen;
  if (!t) return 'اخیراً آنلاین بوده';
  const diff = Date.now() - t;
  if (diff < 60e3) return 'لحظاتی پیش آنلاین بود';
  if (diff < 3600e3) return `${fa(Math.floor(diff / 60e3))} دقیقه پیش آنلاین بود`;
  if (sameDay(t, Date.now())) return `آخرین بازدید امروز ${fmtTime(t)}`;
  if (sod(t) === sod(Date.now()) - DAY) return `آخرین بازدید دیروز ${fmtTime(t)}`;
  return `آخرین بازدید ${shortDateFmt.format(t)}`;
}
const fmtSize = (n) => (n < 1048576 ? `${fa(Math.max(1, Math.round(n / 1024)))} کیلوبایت` : `${fa(+(n / 1048576).toFixed(1))} مگابایت`);
const fmtDur = (s) => { s = Math.max(0, Math.round(s || 0)); return faDigits(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`); };
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const hueOf = (key) => { let h = 0; for (const c of String(key)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 360; };
function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

function toast(msg, isErr) {
  const t = el('div', 'toast' + (isErr ? ' err' : ''));
  t.textContent = msg;
  $('#toasts').append(t);
  setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = 0; setTimeout(() => t.remove(), 300); }, isErr ? 4500 : 2600);
}

class ApiError extends Error { constructor(m, status) { super(m); this.status = status; } }
async function api(method, url, body) {
  const opt = { method, headers: {} };
  if (body !== undefined) { opt.headers['content-type'] = 'application/json'; opt.body = JSON.stringify(body); }
  let r;
  try { r = await fetch(url, opt); } catch { throw new ApiError('ارتباط با سرور برقرار نشد. اینترنت خودت رو بررسی کن.', 0); }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401 && S.me && !url.startsWith('/api/me/') && url !== '/api/me') sessionExpired();
    throw new ApiError(data.error || 'مشکلی پیش آمد.', r.status);
  }
  return data;
}

/* ═════════ تنظیمات و تم ═════════ */
const THEMES = [
  { id: 'night', name: 'شب', bg: '#0f1424', panel: '#1d2640', accent: '#2fd0c0' },
  { id: 'day', name: 'روز', bg: '#f3f5fa', panel: '#ffffff', accent: '#14a898' },
  { id: 'aurora', name: 'شفق', bg: '#17102e', panel: '#2a1f58', accent: '#a78bfa' },
  { id: 'ocean', name: 'اقیانوس', bg: '#08202c', panel: '#0f3446', accent: '#38bdf8' },
  { id: 'forest', name: 'جنگل', bg: '#0e1d17', panel: '#17301f', accent: '#6ee7a0' },
  { id: 'sunset', name: 'غروب', bg: '#241512', panel: '#3a241e', accent: '#ff9b5e' },
  { id: 'paper', name: 'کاغذ', bg: '#f4efe4', panel: '#fffdf8', accent: '#2d6a5f' },
  { id: 'amoled', name: 'سیاه', bg: '#000000', panel: '#14161c', accent: '#2fd0c0' },
];
const ACCENTS = ['#2fd0c0', '#38bdf8', '#818cf8', '#a78bfa', '#f472b6', '#fb7185', '#ff9b5e', '#facc15', '#6ee7a0'];
const WALLS = [['none', 'ساده'], ['dots', 'نقطه‌ای'], ['grid', 'شطرنجی'], ['waves', 'موج'], ['stamps', 'تمبر'], ['glow', 'درخشش']];
const DEFAULTS = { theme: 'night', accent: null, wall: 'dots', shape: 'soft', fontSize: 16, density: 'cozy', sound: true, enterSend: true, notify: false };

function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('payk.settings') || '{}') }; } catch { return { ...DEFAULTS }; }
}
const S = {
  me: null, chats: new Map(), msgs: new Map(), active: null, typing: new Map(), pending: new Map(), settings: loadSettings(),
  ws: null, wsTry: 0, replyTo: null, editing: null, reactions: ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '👏'],
  drafts: new Map(), mounted: false, stick: true, unseenBelow: 0, sideQuery: '',
};
const mqLight = matchMedia('(prefers-color-scheme: light)');
mqLight.addEventListener?.('change', () => { if (S.settings.theme === 'auto') applySettings(); });

function onAccentColor(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#10131f' : '#ffffff';
}
function applySettings() {
  const s = S.settings, root = document.documentElement;
  const theme = s.theme === 'auto' ? (mqLight.matches ? 'day' : 'night') : s.theme;
  root.setAttribute('data-theme', theme);
  root.setAttribute('data-wall', s.wall);
  root.setAttribute('data-shape', s.shape);
  root.setAttribute('data-density', s.density);
  root.style.setProperty('--base', s.fontSize + 'px');
  if (s.accent) { root.style.setProperty('--accent', s.accent); root.style.setProperty('--on-accent', onAccentColor(s.accent)); }
  else { root.style.removeProperty('--accent'); root.style.removeProperty('--on-accent'); }
  const t = THEMES.find((x) => x.id === theme);
  $('meta[name=theme-color]')?.setAttribute('content', t ? t.bg : '#0f1424');
}
const pushSettings = debounce(() => { if (S.me) api('PUT', '/api/me/settings', { settings: S.settings }).catch(() => {}); }, 800);
function setSetting(k, v) {
  S.settings[k] = v;
  try { localStorage.setItem('payk.settings', JSON.stringify(S.settings)); } catch {}
  applySettings();
  pushSettings();
}

/* ═════════ کمک‌ها: آواتار، نام‌ها ═════════ */
function avatarHTML(u, size = '', online = false) {
  const hue = hueOf(u.username || u.id || u.name);
  const letter = [...String(u.display_name || u.name || '؟').trim()][0] || '؟';
  const inner = u.avatar ? `<img src="/files/${esc(u.avatar)}" alt="" loading="lazy">` : esc(letter);
  return `<span class="avatar ${size} ${online ? 'online' : ''}" style="--av:hsl(${hue} 55% 46%)">${inner}<i class="dot"></i></span>`;
}
function groupAvatarHTML(chat, size = '') {
  return `<span class="avatar ${size}" style="--av:hsl(${hueOf('g' + chat.id)} 50% 42%)">${icon('users')}</span>`;
}
const memberOf = (chat, id) => chat.members.find((m) => m.id === id);
const GONE = { id: 0, display_name: 'کاربر حذف‌شده', username: 'deleted', avatar: null, online: false };
const userOf = (chat, id) => memberOf(chat, id) || GONE;
const otherOf = (chat) => chat.members.find((m) => m.id !== S.me.id) || GONE;
const chatTitle = (chat) => (chat.type === 'group' ? chat.name : otherOf(chat).display_name);
function chatAvatar(chat, size = '') {
  if (chat.type === 'group') return groupAvatarHTML(chat, size);
  const o = otherOf(chat);
  return avatarHTML(o, size, o.online);
}
function previewOf(m) {
  if (!m) return { icon: '', text: 'هنوز پیامی نیست' };
  if (m.deleted) return { icon: '', text: 'این پیام حذف شد' };
  switch (m.type) {
    case 'voice': return { icon: 'mic', text: `پیام صوتی ${fmtDur(m.duration)}` };
    default: return { icon: '', text: m.body };
  }
}
function linkify(text) {
  const frag = document.createDocumentFragment();
  const re = /(https?:\/\/[^\s<]+[^\s<.,;:!?'"”)\]»])/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) frag.append(text.slice(last, m.index));
    const a = document.createElement('a');
    a.href = m[0]; a.textContent = m[0]; a.target = '_blank'; a.rel = 'noopener noreferrer nofollow'; a.className = 'ltr';
    a.style.display = 'inline'; a.style.unicodeBidi = 'isolate';
    frag.append(a);
    last = m.index + m[0].length;
  }
  if (last < text.length) frag.append(text.slice(last));
  return frag;
}

/* ═════════ صدا و اعلان ═════════ */
let audioCtx;
function blip(kind = 'in') {
  if (!S.settings.sound) return;
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const t = audioCtx.currentTime;
    const notes = kind === 'in' ? [660, 880] : [520];
    notes.forEach((f, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.09);
      g.gain.exponentialRampToValueAtTime(0.12, t + i * 0.09 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.22);
      o.connect(g).connect(audioCtx.destination);
      o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.25);
    });
  } catch {}
}
function notifyMessage(chat, m) {
  if (!S.settings.notify || !('Notification' in window) || Notification.permission !== 'granted' || !document.hidden) return;
  try {
    const p = previewOf(m);
    const n = new Notification(chatTitle(chat), { body: (chat.type === 'group' ? userOf(chat, m.sender_id).display_name + ': ' : '') + p.text, icon: '/icon.svg', tag: 'chat' + chat.id, lang: 'fa', dir: 'rtl' });
    n.onclick = () => { window.focus(); location.hash = '#/c/' + chat.id; n.close(); };
  } catch {}
}
function updateTitle() {
  const n = [...S.chats.values()].reduce((a, c) => a + (c.unread || 0), 0);
  document.title = (n ? `(${faDigits(n)}) ` : '') + 'پیک | پیام‌رسان';
}

/* ═════════ پنجره‌ها و منوها ═════════ */
const modalStack = [];
function openModal({ title, wide = false, tabs = null }) {
  const overlay = el('div', 'overlay');
  overlay.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="بستن">${icon('close')}</button></div>
    ${tabs ? `<div class="tabs" role="tablist">${tabs.map((t, i) => `<button role="tab" data-tab="${t.id}" aria-selected="${i === 0}">${icon(t.icon)}${esc(t.label)}</button>`).join('')}</div>` : ''}
    <div class="modal-body"></div></div>`;
  document.body.append(overlay);
  const handle = { overlay, body: $('.modal-body', overlay), modal: $('.modal', overlay), close() { overlay.remove(); const i = modalStack.indexOf(handle); if (i >= 0) modalStack.splice(i, 1); handle.onClose?.(); } };
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) handle.close(); });
  $('[data-close]', overlay).addEventListener('click', () => handle.close());
  modalStack.push(handle);
  return handle;
}
let popEl = null;
function closePop() { popEl?.remove(); popEl = null; }
function openPop(html, x, y, cls = '') {
  closePop();
  const p = el('div', 'pop ' + cls, html);
  p.style.visibility = 'hidden';
  document.body.append(p);
  const r = p.getBoundingClientRect();
  let left = x - (document.dir === 'rtl' ? 0 : 0);
  left = Math.min(Math.max(8, left), innerWidth - r.width - 8);
  let top = y + 6;
  if (top + r.height > innerHeight - 8) top = y - r.height - 6;
  top = Math.max(8, top);
  p.style.left = left + 'px'; p.style.top = top + 'px'; p.style.visibility = '';
  popEl = p;
  return p;
}
document.addEventListener('mousedown', (e) => { if (popEl && !popEl.contains(e.target) && !e.target.closest('[data-keep-pop]')) closePop(); });
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (popEl) return closePop();
  const lb = $('.lightbox'); if (lb) return lb.remove();
  if (modalStack.length) return modalStack.at(-1).close();
  if (S.editing || S.replyTo) { cancelComposerMode(); }
});
function confirmBox(title, text, okLabel, danger = true) {
  return new Promise((res) => {
    const m = openModal({ title });
    m.body.innerHTML = `<p style="margin:.2rem 0 1.2rem;color:var(--muted)">${esc(text)}</p><div style="display:flex;gap:.6rem;justify-content:flex-end"><button class="btn" data-no>انصراف</button><button class="btn ${danger ? 'danger' : 'primary'}" data-yes>${esc(okLabel)}</button></div>`;
    let done = false;
    const fin = (v) => { if (done) return; done = true; m.close(); res(v); };
    $('[data-no]', m.body).onclick = () => fin(false);
    $('[data-yes]', m.body).onclick = () => fin(true);
    m.onClose = () => fin(false);
  });
}

/* ═════════ مسیریابی ═════════ */
async function boot() {
  applySettings();
  try {
    const d = await api('GET', '/api/me');
    S.me = d.user; S.reactions = d.reactions || S.reactions;
    if (d.user.settings && Object.keys(d.user.settings).length) { S.settings = { ...S.settings, ...d.user.settings }; localStorage.setItem('payk.settings', JSON.stringify(S.settings)); applySettings(); }
  } catch {}
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('/sw.js').catch(() => {});
  addEventListener('hashchange', route);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) markReadSoon(); });
  addEventListener('focus', markReadSoon);
  route();
}
function route() {
  closePop();
  const h = location.hash.replace(/^#\/?/, '');
  if (!S.me) {
    teardownApp();
    if (h === 'login' || h === 'signup' || h === 'recover') return renderAuth(h);
    return renderLanding();
  }
  stopDemo();
  if (!S.mounted) return mountApp();
  const m = h.match(/^c\/(\d+)/);
  openChat(m ? Number(m[1]) : null);
}
function sessionExpired() {
  if (!S.me) return;
  teardownApp(); S.me = null;
  toast('نشست شما تمام شده؛ دوباره وارد شوید.', true);
  location.hash = '#/login'; route();
}

/* ═════════ صفحه‌ی اول ═════════ */
let demoTimers = [];
function stopDemo() { demoTimers.forEach(clearTimeout); demoTimers = []; }
function logoHTML() {
  return `<a class="logo" href="#/"><svg viewBox="0 0 48 48" aria-hidden="true"><circle class="ring" cx="24" cy="24" r="19" fill="none" stroke-width="2.4" stroke-dasharray="1 5.2" stroke-linecap="round"/><path class="plane" d="M13 25 35 14 29 36 25 29z"/><path d="M25 29 35 14" stroke="var(--bg)" stroke-width="2" stroke-linecap="round" fill="none"/></svg>پیک</a>`;
}
const STAMP_SVG = `<svg viewBox="0 0 120 120" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="60" cy="60" r="52" stroke-width="2.5" stroke-dasharray="2 7" stroke-linecap="round"/><circle cx="60" cy="60" r="40" stroke-width="2"/><path d="M36 64 84 40 72 88 61 72z" fill="currentColor" stroke="none" opacity=".9"/><path d="M12 60h18M90 60h18" stroke-width="2" stroke-linecap="round" opacity=".5"/></svg>`;

function renderLanding() {
  stopDemo();
  const app = $('#app');
  app.innerHTML = `<div class="landing">
    <nav class="nav">${logoHTML()}<div class="nav-actions"><a class="btn ghost" href="#/login">ورود</a><a class="btn primary" href="#/signup">ساخت حساب</a></div></nav>
    <header class="hero">
      <div>
        <h1>پیام بده، همین حالا.</h1>
        <p class="lead">پیک یک پیام‌رسان سبک و تمیزه؛ پیام و ویس بفرست، تماس صوتی و تصویری بگیر، صفحه‌ات رو نشون بده و ظاهرش رو دقیقاً مطابق سلیقه‌ات تنظیم کن. فقط یک نام کاربری و رمز عبور لازمه.</p>
        <div class="cta"><a class="btn primary big" href="#/signup">شروع کن</a><a class="btn big" href="#/login">حساب دارم</a></div>
        <div class="theme-try"><span>تم رو همین‌جا امتحان کن:</span><div class="dots" id="theme-dots"></div></div>
      </div>
      <div class="demo-wrap">
        <div class="postmark">${STAMP_SVG}</div>
        <div class="demo" aria-label="نمونه‌ی گفتگو">
          <div class="demo-head">${avatarHTML({ display_name: 'سارا', username: 'sara' }, 'md', true)}<div><b>سارا</b><small id="demo-status">آنلاین</small></div></div>
          <div class="demo-body" id="demo-body"></div>
        </div>
      </div>
    </header>
    <section class="features">
      <div class="feat"><span class="ic">${icon('mic')}</span><h3>ویس و تماس زنده</h3><p>پیام صوتی بفرست یا با یک لمس تماس صوتی و تصویری بگیر و صفحه‌ات رو به اشتراک بذار.</p></div>
      <div class="feat"><span class="ic">${icon('palette')}</span><h3>ظاهر مال خودته</h3><p>هشت تم آماده، رنگ دلخواه، پس‌زمینه‌ی چت، شکل حباب و اندازه‌ی متن.</p></div>
      <div class="feat"><span class="ic">${icon('users')}</span><h3>گفتگوی خصوصی و گروه</h3><p>با نام کاربری دوستت رو پیدا کن، گروه بساز و به پیام‌ها واکنش بده یا جواب بده.</p></div>
      <div class="feat"><span class="ic">${icon('lock')}</span><h3>بدون ایمیل و شماره</h3><p>ثبت‌نام فقط با نام کاربری و رمز عبور انجام می‌شه. رمزها به‌صورت هش‌شده ذخیره می‌شن.</p></div>
      <div class="feat"><span class="ic">${icon('bolt')}</span><h3>لحظه‌ای و روان</h3><p>پیام‌ها همون لحظه می‌رسن، با نشانه‌ی دیده‌شدن و «در حال نوشتن…».</p></div>
      <div class="feat"><span class="ic">${icon('phone')}</span><h3>موبایل و کامپیوتر</h3><p>داخل مرورگر کار می‌کنه و روی گوشی می‌تونی به صفحه‌ی اصلی اضافه‌ش کنی.</p></div>
    </section>
    <section class="recovery-band"><div>
      <div><h2>رمزت رو فراموش کردی؟ مشکلی نیست.</h2><p>موقع ساخت حساب یک کد بازیابی می‌گیری. با اون و نام کاربری‌ات می‌تونی هر وقت خواستی رمز جدید بذاری.</p></div>
      <div class="code-sample" aria-hidden="true">K7QM-2XPA-9TRD-4WHF</div>
    </div></section>
    <footer class="foot">پیک · پیام‌رسانی برای حرف زدن، نه برای حاشیه</footer>
  </div>`;
  const dots = $('#theme-dots');
  const cur = S.settings.theme;
  dots.innerHTML = THEMES.map((t) => `<button style="--c:${t.bg};--c2:${t.accent}" data-theme="${t.id}" aria-label="تم ${t.name}" title="${t.name}" aria-pressed="${t.id === cur}"></button>`).join('');
  dots.onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    setSetting('theme', b.dataset.theme);
    $$('button', dots).forEach((x) => x.setAttribute('aria-pressed', x === b));
  };
  runDemo();
}
function runDemo() {
  const body = $('#demo-body'); if (!body) return;
  const script = [
    { w: 'in', t: 'علی، عکس‌های سفر رو دیدی؟', d: 900 },
    { w: 'out', t: 'آره! اون غروبه که گرفتی فوق‌العاده‌ست', d: 1700 },
    { w: 'in', voice: 12, d: 1500 },
    { w: 'out', t: 'الان گوشش می‌دم، یه لحظه صبر کن', d: 1800 },
    { w: 'in', t: 'راستی تم جدیدم رو ببین، چقدر قشنگ شد ✨', d: 1700 },
  ];
  const bubble = (s) => {
    const row = el('div', `row ${s.w} first`);
    const inner = s.voice
      ? `<div class="voice"><span class="pp">${icon('play')}</span><div class="wave">${Array.from({ length: 22 }, (_, i) => `<i style="--h:${30 + ((i * 37) % 70)}%"></i>`).join('')}</div><span class="dur">${fmtDur(s.voice)}</span></div>`
      : `<div class="text">${esc(s.t)}</div>`;
    row.innerHTML = `<div class="msg">${inner}<div class="meta">${faDigits(s.w === 'out' ? '۱۰:۲۳' : '۱۰:۲۲')}${s.w === 'out' ? icon('check2', 'seen') : ''}</div></div>`;
    return row;
  };
  let t = 400;
  const at = (ms, fn) => demoTimers.push(setTimeout(fn, ms));
  const cycle = () => {
    body.innerHTML = ''; t = 400;
    script.forEach((s) => {
      if (s.w === 'in') {
        at(t, () => { const tp = el('div', 'row in first'); tp.dataset.typing = 1; tp.innerHTML = `<div class="msg"><span class="typing-dots"><i></i><i></i><i></i></span></div>`; body.append(tp); const st = $('#demo-status'); if (st) st.textContent = 'در حال نوشتن…'; });
        t += 1100;
        at(t, () => { $('[data-typing]', body)?.remove(); body.append(bubble(s)); const st = $('#demo-status'); if (st) st.textContent = 'آنلاین'; });
      } else at(t, () => body.append(bubble(s)));
      t += s.d;
    });
    at(t + 3500, cycle);
  };
  cycle();
}

/* ═════════ ورود، ثبت‌نام، بازیابی ═════════ */
function strength(p) {
  let s = 0;
  if (p.length >= 8) s++;
  if (p.length >= 12) s++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
  if (/\d/.test(p) && /\D/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  return Math.min(s, 4);
}
const pwField = (id, label, ph = '', auto = 'current-password') => `<div class="field"><label for="${id}">${label}</label><div class="input-wrap"><input class="input ltr" id="${id}" type="password" autocomplete="${auto}" placeholder="${ph}" required><button type="button" class="icon-btn" data-eye="${id}" aria-label="نمایش رمز">${icon('eye')}</button></div></div>`;
function wireEyes(root) {
  $$('[data-eye]', root).forEach((b) => b.addEventListener('click', () => {
    const inp = $('#' + b.dataset.eye, root); const show = inp.type === 'password';
    inp.type = show ? 'text' : 'password'; b.innerHTML = icon(show ? 'eyeoff' : 'eye');
  }));
}
function wireMeter(input, meter, hint) {
  const labels = ['خیلی ضعیف', 'ضعیف', 'متوسط', 'خوب', 'قوی'];
  const cols = ['var(--danger)', 'var(--danger)', '#f5b83d', 'var(--ok)', 'var(--ok)'];
  input.addEventListener('input', () => {
    const s = input.value ? strength(input.value) : 0;
    $('i', meter).style.width = input.value ? ((s + 1) / 5) * 100 + '%' : '0';
    $('i', meter).style.background = cols[s];
    hint.textContent = input.value ? `قدرت رمز: ${labels[s]}` : 'حداقل ۸ کاراکتر؛ فقط عدد نباشه.';
  });
}
async function submitForm(form, btn, fn) {
  const errBox = $('.form-error', form);
  errBox.textContent = '';
  const label = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
  try { await fn(); } catch (e) { errBox.textContent = e.message; } finally { btn.disabled = false; btn.innerHTML = label; }
}
function renderAuth(mode) {
  stopDemo();
  const titles = { login: ['خوش برگشتی', 'نام کاربری و رمز عبورت رو وارد کن.'], signup: ['ساخت حساب', 'فقط یک نام کاربری و رمز عبور. ایمیل و شماره لازم نیست.'], recover: ['بازیابی رمز عبور', 'نام کاربری و کد بازیابی‌ای که موقع ثبت‌نام گرفتی رو وارد کن.'] };
  const [h, sub] = titles[mode];
  let fields = '', btn = '', links = '';
  if (mode === 'login') {
    fields = `<div class="field"><label for="f-user">نام کاربری</label><input class="input ltr" id="f-user" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="مثلاً ali_1" required></div>${pwField('f-pass', 'رمز عبور')}`;
    btn = 'ورود';
    links = `<a href="#/recover">رمز عبورم رو فراموش کردم</a><a href="#/signup">حساب ندارم</a>`;
  } else if (mode === 'signup') {
    fields = `<div class="field"><label for="f-name">نام نمایشی</label><input class="input" id="f-name" maxlength="40" autocomplete="nickname" placeholder="مثلاً علی"></div>
      <div class="field"><label for="f-user">نام کاربری</label><input class="input ltr" id="f-user" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="20" placeholder="ali_1" required><span class="hint">۳ تا ۲۰ حرف انگلیسی، عدد یا _ ؛ دوستانت با همین پیدات می‌کنن.</span></div>
      ${pwField('f-pass', 'رمز عبور', '', 'new-password')}<div class="meter" id="meter"><i></i></div><div class="hint" id="meter-hint" style="margin:-.6rem 0 1rem">حداقل ۸ کاراکتر؛ فقط عدد نباشه.</div>`;
    btn = 'ساخت حساب';
    links = `<span class="muted">قبلاً حساب ساخته‌ای؟</span><a href="#/login">ورود</a>`;
  } else {
    fields = `<div class="field"><label for="f-user">نام کاربری</label><input class="input ltr" id="f-user" autocomplete="username" autocapitalize="none" spellcheck="false" required></div>
      <div class="field"><label for="f-code">کد بازیابی</label><input class="input ltr" id="f-code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX" maxlength="24" style="letter-spacing:.08em" required></div>
      ${pwField('f-pass', 'رمز عبور جدید', '', 'new-password')}<div class="meter" id="meter"><i></i></div><div class="hint" id="meter-hint" style="margin:-.6rem 0 1rem">حداقل ۸ کاراکتر؛ فقط عدد نباشه.</div>`;
    btn = 'تنظیم رمز جدید';
    links = `<a href="#/login">بازگشت به ورود</a><span class="hint">کد بازیابی رو گم کردی؟ متأسفانه راهی برای برگردوندن حساب نیست.</span>`;
  }
  $('#app').innerHTML = `<div class="auth">
    <div class="auth-form"><div class="auth-card" id="auth-card">${logoHTML()}
      <h2>${h}</h2><p class="sub">${sub}</p>
      <form id="auth-form" novalidate><div class="form-error" role="alert"></div>${fields}<button class="btn primary block big" type="submit">${btn}</button></form>
      <div class="auth-links">${links}</div></div></div>
    <aside class="auth-art"><div class="stamp-bg">${STAMP_SVG}</div><blockquote>«پیام رو بفرست؛ بقیه‌ی کارها با ما.»<small>پیک، پیام‌رسان سبک برای حرف‌های هر روزه</small></blockquote></aside></div>`;
  const form = $('#auth-form');
  wireEyes(form);
  if ($('#meter')) wireMeter($('#f-pass'), $('#meter'), $('#meter-hint'));
  $('#f-user').focus();
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const sb = $('button[type=submit]', form);
    const user = $('#f-user').value.trim();
    const pass = $('#f-pass').value;
    submitForm(form, sb, async () => {
      if (!user || !pass) throw new Error('همه‌ی فیلدها رو پر کن.');
      if (mode === 'login') {
        const d = await api('POST', '/api/login', { username: user, password: pass });
        enter(d.user);
      } else if (mode === 'signup') {
        if (!/^[A-Za-z0-9_]{3,20}$/.test(user)) throw new Error('نام کاربری باید ۳ تا ۲۰ حرف انگلیسی، عدد یا _ باشد.');
        const d = await api('POST', '/api/signup', { username: user, password: pass, display_name: $('#f-name').value });
        showRecovery(d.recovery_code, d.user, 'حساب ساخته شد');
      } else {
        const d = await api('POST', '/api/recover', { username: user, code: $('#f-code').value, password: pass });
        showRecovery(d.recovery_code, d.user, 'رمز عبور عوض شد');
      }
    });
  });
}
function enter(user) {
  S.me = user;
  if (user.settings && Object.keys(user.settings).length) { S.settings = { ...S.settings, ...user.settings }; localStorage.setItem('payk.settings', JSON.stringify(S.settings)); applySettings(); }
  else pushSettings();
  location.hash = '#/';
  route();
}
function showRecovery(code, user, heading) {
  const card = $('#auth-card');
  card.innerHTML = `${logoHTML()}<div class="rc-box"><h2 style="margin:0 0 .4rem">${esc(heading)}</h2>
    <p class="sub" style="margin:0">این کد بازیابی توئه. اگه رمزت رو فراموش کنی، فقط با همین می‌تونی دوباره وارد بشی. <b>فقط همین یک بار نمایش داده می‌شه.</b></p>
    <div class="rc-code" id="rc">${esc(code)}</div>
    <div class="rc-actions"><button class="btn" id="rc-copy">${icon('copy')} کپی</button><button class="btn" id="rc-dl">${icon('download')} دانلود فایل</button></div>
    <label class="check-row"><input type="checkbox" id="rc-ok"><span>کد بازیابی رو جای امنی ذخیره کردم.</span></label>
    <button class="btn primary block big" id="rc-go" disabled>ورود به پیک</button></div>`;
  $('#rc-copy').onclick = async () => { try { await navigator.clipboard.writeText(code); toast('کد کپی شد'); } catch { toast('کپی نشد؛ دستی انتخابش کن', true); } };
  $('#rc-dl').onclick = () => {
    const blob = new Blob([`پیک — کد بازیابی\nنام کاربری: ${user.username}\nکد بازیابی: ${code}\n\nاین کد رو جای امنی نگه دار و با کسی به اشتراک نذار.\n`], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `payk-recovery-${user.username}.txt`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    $('#rc-ok').checked = true; $('#rc-go').disabled = false;
  };
  $('#rc-ok').onchange = (e) => { $('#rc-go').disabled = !e.target.checked; };
  $('#rc-go').onclick = () => enter(user);
}

/* ═════════ برنامه‌ی اصلی ═════════ */
async function mountApp() {
  $('#app').innerHTML = `<div class="splash"><span class="spinner"></span></div>`;
  S.mounted = true;
  try { await refreshChats(); } catch (e) { toast(e.message, true); }
  if (!S.me) return;
  renderShell();
  connectWS();
  const m = location.hash.match(/^#\/c\/(\d+)/);
  openChat(m ? Number(m[1]) : null);
}
function teardownApp() {
  S.mounted = false;
  if (S.ws) { S.ws.onclose = null; try { S.ws.close(); } catch {} S.ws = null; }
  clearTimeout(wsTimer);
  S.chats.clear(); S.msgs.clear(); S.active = null; S.typing.clear(); S.pending.clear(); S.drafts.clear();
  S.replyTo = null; S.editing = null; voices.forEach((v) => v.audio.pause()); voices.clear();
  stopRecording(true); callCleanup();
  modalStack.slice().forEach((m) => m.close()); closePop(); $('.lightbox')?.remove();
  document.title = 'پیک | پیام‌رسان';
}
async function refreshChats() {
  const d = await api('GET', '/api/chats');
  S.chats = new Map(d.chats.map((c) => [c.id, c]));
  if (S.mounted && $('#chat-list')) renderChatList();
  updateTitle();
}
async function logout() {
  try { await api('POST', '/api/logout'); } catch {}
  teardownApp(); S.me = null; location.hash = '#/'; route();
}

function renderShell() {
  $('#app').innerHTML = `<div class="shell" id="shell">
    <aside class="side">
      <div class="side-head">${logoHTML().replace('href="#/"', 'href="#/"')}
        <button class="icon-btn" id="btn-new" title="گفتگوی تازه" aria-label="گفتگوی تازه">${icon('plus')}</button>
        <button class="icon-btn" id="btn-settings" title="تنظیمات" aria-label="تنظیمات">${icon('sliders')}</button>
        <button id="btn-me" aria-label="پروفایل من" title="پروفایل من"></button>
      </div>
      <div class="search">${icon('search')}<input class="input" id="side-search" placeholder="جستجوی گفتگو یا کاربر…" autocomplete="off"></div>
      <div class="conn-bar hidden" id="conn-bar"><span class="spinner"></span> در حال اتصال…</div>
      <div class="chat-list" id="chat-list"></div>
    </aside>
    <section class="main" id="main"></section></div>`;
  renderMeButton();
  renderChatList();
  $('#btn-new').onclick = () => openNewChat();
  $('#btn-settings').onclick = () => openSettings();
  $('#btn-me').onclick = () => openSettings('account');
  $('#side-search').addEventListener('input', onSideSearch);
  $('#chat-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-chat]'); if (b) location.hash = '#/c/' + b.dataset.chat;
    const u = e.target.closest('[data-user]'); if (u) startDM(u.dataset.user);
  });
}
function renderMeButton() {
  const b = $('#btn-me'); if (b) b.innerHTML = avatarHTML(S.me, 'md');
}

/* ───── فهرست گفتگوها ───── */
const sortedChats = () => [...S.chats.values()].sort((a, b) => (b.last_message?.created_at ?? b.created_at) - (a.last_message?.created_at ?? a.created_at));
function renderChatList() {
  const list = $('#chat-list'); if (!list) return;
  const q = S.sideQuery.trim().toLowerCase();
  let chats = sortedChats();
  if (q) chats = chats.filter((c) => chatTitle(c).toLowerCase().includes(q) || (c.type === 'dm' && otherOf(c).username.includes(q.replace(/^@/, ''))));
  let html = chats.map((c) => {
    const lm = c.last_message, p = previewOf(lm);
    const typing = typingNames(c);
    let prefix = '';
    if (lm && lm.type !== 'system' && !lm.deleted) {
      if (lm.sender_id === S.me.id) prefix = 'شما: ';
      else if (c.type === 'group') prefix = userOf(c, lm.sender_id).display_name.split(' ')[0] + ': ';
    }
    return `<button class="chat-item ${c.id === S.active ? 'active' : ''}" data-chat="${c.id}">
      ${chatAvatar(c, '')}
      <div class="mid"><div class="top"><span class="name">${esc(chatTitle(c))}</span></div>
        <div class="prev ${typing ? 'typing' : ''}">${typing ? `<span class="typing-dots"><i></i><i></i><i></i></span> در حال نوشتن…` : `${p.icon ? icon(p.icon) : ''}<span style="overflow:hidden;text-overflow:ellipsis">${esc(prefix + p.text)}</span>`}</div></div>
      <div class="end"><span class="time">${lm ? listTime(lm.created_at) : ''}</span>${c.unread ? `<span class="badge">${fa(c.unread)}</span>` : '<span style="height:1.4rem"></span>'}</div></button>`;
  }).join('');
  if (!chats.length && !q) html = `<div class="empty"><div class="stamp">${STAMP_SVG}</div><b>هنوز گفتگویی نداری</b><span>با دکمه‌ی + دوستت رو با نام کاربری‌اش پیدا کن و اولین پیام رو بفرست.</span><button class="btn primary" id="empty-new">گفتگوی تازه</button></div>`;
  if (q && !chats.length) html = '';
  html += `<div id="side-users"></div>`;
  list.innerHTML = html;
  $('#empty-new')?.addEventListener('click', () => openNewChat());
  if (q) searchSideUsers();
}
function onSideSearch(e) { S.sideQuery = e.target.value; renderChatList(); }
const searchSideUsers = debounce(async () => {
  const q = S.sideQuery.trim();
  const box = $('#side-users'); if (!box) return;
  if (q.length < 2) { box.innerHTML = ''; return; }
  try {
    const { users } = await api('GET', '/api/users/search?q=' + encodeURIComponent(q));
    if (S.sideQuery.trim() !== q || !$('#side-users')) return;
    const known = new Set([...S.chats.values()].filter((c) => c.type === 'dm').map((c) => otherOf(c).id));
    const fresh = users.filter((u) => !known.has(u.id));
    $('#side-users').innerHTML = fresh.length ? `<div class="sect" style="padding:0 .6rem">کاربران</div>` + fresh.map((u) => `<button class="user-row" data-user="${esc(u.username)}">${avatarHTML(u, 'md', u.online)}<div class="info"><b>${esc(u.display_name)}</b><small class="ltr">@${esc(u.username)}</small></div></button>`).join('') : '';
  } catch {}
}, 280);
const typingNames = (chat) => {
  const t = S.typing.get(chat.id); if (!t || !t.size) return '';
  return [...t.keys()].map((id) => userOf(chat, id).display_name.split(' ')[0]).join('، ');
};

/* ───── باز کردن گفتگو ───── */
let viewChatId = null;
async function openChat(id) {
  const shell = $('#shell'); if (!shell) return;
  if (id && !S.chats.has(id)) { try { await refreshChats(); } catch {} }
  if (id && !S.chats.has(id)) { toast('این گفتگو پیدا نشد.', true); location.hash = '#/'; return; }
  const switched = viewChatId !== id;
  if (viewChatId && switched) { saveDraft(); stopRecording(true); }
  S.active = id;
  shell.classList.toggle('show-chat', !!id);
  if (!id) { viewChatId = null; $('#main').innerHTML = `<div class="welcome"><div class="stamp">${STAMP_SVG}</div><h2>یک گفتگو رو انتخاب کن</h2><p>از فهرست کنار، گفتگویی رو باز کن یا با دکمه‌ی + یک گفتگوی تازه شروع کن.</p></div>`; renderChatList(); return; }
  if (viewChatId !== id) { cancelComposerMode(true); renderChatView(S.chats.get(id)); viewChatId = id; }
  renderChatList();
  if (!switched && msgStore(id).loaded && $('#messages')?.children.length) { markReadSoon(); return; }
  await loadInitial(id);
}
function saveDraft() {
  const inp = $('#input');
  if (inp && viewChatId) { if (inp.value.trim() && !S.editing) S.drafts.set(viewChatId, inp.value); else S.drafts.delete(viewChatId); }
}
function renderChatView(chat) {
  const main = $('#main');
  main.innerHTML = `<header class="chat-head">
      <button class="icon-btn back-btn" id="btn-back" aria-label="بازگشت">${icon('chev')}</button>
      <button class="who-wrap" id="head-info">${chatAvatar(chat, 'md')}<span class="who"><b></b><small></small></span></button>
      ${chat.type === 'dm' && window.RTCPeerConnection ? `<button class="icon-btn" id="btn-call" title="تماس صوتی" aria-label="تماس صوتی">${icon('call')}</button><button class="icon-btn" id="btn-vcall" title="تماس تصویری" aria-label="تماس تصویری">${icon('video')}</button>` : ''}
      <button class="icon-btn" id="btn-find" title="جستجو در گفتگو" aria-label="جستجو در گفتگو">${icon('search')}</button>
      <button class="icon-btn" id="btn-info" title="اطلاعات" aria-label="اطلاعات">${icon('info')}</button>
    </header>
    <div class="messages" id="messages" tabindex="-1"></div>
    <button class="to-bottom hide" id="to-bottom" aria-label="رفتن به آخرین پیام">${icon('chev-down')}</button>
    <div class="composer-wrap">
      <div id="replybar"></div>
      <div class="composer" id="composer">
        <button class="icon-btn" id="btn-emoji" data-keep-pop title="شکلک" aria-label="شکلک">${icon('smile')}</button>
        <textarea id="input" rows="1" placeholder="پیام بنویس…" enterkeyhint="send" aria-label="متن پیام" maxlength="4000"></textarea>
        <button class="icon-btn" id="btn-mic" title="ضبط صدا" aria-label="ضبط پیام صوتی">${icon('mic')}</button>
        <button class="icon-btn send-btn hidden" id="btn-send" title="ارسال" aria-label="ارسال">${icon('send')}</button>
      </div>
    </div>`;
  updateHeader();
  $('#btn-back').onclick = () => { location.hash = '#/'; };
  $('#head-info').onclick = $('#btn-info').onclick = () => openChatInfo(S.active);
  $('#btn-find').onclick = () => openChatSearch(S.active);
  $('#btn-call')?.addEventListener('click', () => startCall(S.active, false));
  $('#btn-vcall')?.addEventListener('click', () => startCall(S.active, true));
  wireComposer();
  wireMessages();
  const d = S.drafts.get(chat.id);
  if (d) { $('#input').value = d; autoGrow(); toggleSendMic(); }
}
function updateHeader() {
  const chat = S.chats.get(S.active); if (!chat || !$('.chat-head')) return;
  const b = $('.chat-head .who b'), s = $('.chat-head .who small');
  b.textContent = chatTitle(chat);
  const tn = typingNames(chat);
  s.className = '';
  if (tn) { s.textContent = chat.type === 'group' ? `${tn} در حال نوشتن…` : 'در حال نوشتن…'; s.classList.add('typing'); }
  else if (chat.type === 'group') { const on = chat.members.filter((m) => m.online).length; s.textContent = `${fa(chat.members.length)} عضو${on ? `، ${fa(on)} نفر آنلاین` : ''}`; }
  else { const o = otherOf(chat); s.textContent = o.id ? lastSeenText(o) : ''; if (o.online) s.classList.add('on'); }
  const av = $('#head-info .avatar'); if (av) av.outerHTML = chatAvatar(chat, 'md');
}

/* ───── پیام‌ها: بارگذاری و رندر ───── */
const msgStore = (id) => { let s = S.msgs.get(id); if (!s) { s = { list: [], hasMore: false, loaded: false }; S.msgs.set(id, s); } return s; };
async function loadInitial(id) {
  const st = msgStore(id);
  if (!st.loaded) {
    const box = $('#messages'); if (box) box.innerHTML = `<div class="more-loader muted" style="margin:auto"><span class="spinner"></span></div>`;
    try {
      const d = await api('GET', `/api/chats/${id}/messages?limit=40`);
      st.list = d.messages; st.hasMore = d.has_more; st.loaded = true;
    } catch (e) { toast(e.message, true); return; }
  }
  if (S.active !== id) return;
  renderMessages(true);
  markReadSoon();
}
function runStarts(prev, m) {
  return !(prev && prev.type !== 'system' && m.type !== 'system' && prev.sender_id === m.sender_id && m.created_at - prev.created_at < 5 * 60e3 && sameDay(prev.created_at, m.created_at));
}
function renderMessages(toBottom = false) {
  const box = $('#messages'); if (!box) return;
  const chat = S.chats.get(S.active), st = msgStore(S.active);
  const prevH = box.scrollHeight, prevTop = box.scrollTop;
  box.innerHTML = '';
  if (st.hasMore) box.append(el('div', 'more-loader muted', '<span class="spinner"></span>'));
  if (!st.list.length && !st.hasMore) box.append(el('div', 'sys-msg', 'هنوز پیامی نیست. اولین پیام رو بفرست!'));
  let prev = null;
  for (const m of st.list) { appendRowTo(box, m, prev, chat); prev = m; }
  for (const p of (S.pending.get(S.active) || [])) box.append(buildPending(p));
  if (toBottom) { box.scrollTop = box.scrollHeight; S.stick = true; }
  else box.scrollTop = prevTop + (box.scrollHeight - prevH);
  updateToBottom();
}
function appendRowTo(box, m, prev, chat) {
  if (!prev || !sameDay(prev.created_at, m.created_at)) box.append(el('div', 'day-sep', esc(dayLabel(m.created_at))));
  box.append(buildRow(m, prev, chat));
}
function tickHTML(m, chat) {
  if (m.sender_id !== S.me.id || m.deleted) return '';
  const others = chat.members.filter((x) => x.id !== S.me.id);
  const seen = others.length > 0 && others.every((x) => x.last_read_id >= m.id);
  return seen ? icon('check2', 'seen') : icon('check');
}
function quoteHTML(r, chat) {
  const who = r.sender_id === S.me.id ? 'شما' : userOf(chat, r.sender_id).display_name;
  const p = r.deleted ? { text: 'این پیام حذف شد', icon: '' } : previewOf({ type: r.type, body: r.body, file_name: '', duration: 0 });
  return `<button class="quote" data-act="quote" data-id="${r.id}"><b>${esc(who)}</b><span>${esc(p.text)}</span></button>`;
}
function waveBars(id, n = 30) {
  let a = (id * 2654435761) >>> 0, out = '';
  for (let i = 0; i < n; i++) { a = (a * 1664525 + 1013904223) >>> 0; const v = 28 + ((a >>> 8) % 72); out += `<i style="--h:${v}%"></i>`; }
  return out;
}
function buildRow(m, prev, chat) {
  if (m.type === 'system') { const d = el('div', 'sys-msg'); d.textContent = m.body; d.dataset.id = m.id; return d; }
  const mine = m.sender_id === S.me.id;
  const row = el('div', `row ${mine ? 'out' : 'in'} ${runStarts(prev, m) ? 'first' : 'cont'}`);
  row.dataset.id = m.id;
  const first = row.classList.contains('first');
  const group = chat.type === 'group';
  if (!mine && group) { const u = userOf(chat, m.sender_id); row.innerHTML = `<div class="av-slot">${first ? avatarHTML(u, 'sm') : ''}</div>`; }
  const b = el('div', `msg ${m.deleted ? 'deleted' : ''}`);
  let h = '';
  if (!mine && group && first) h += `<div class="sender" style="--sc:color-mix(in srgb,hsl(${hueOf(userOf(chat, m.sender_id).username)} 75% 58%) 78%,var(--in-text))">${esc(userOf(chat, m.sender_id).display_name)}</div>`;
  if (m.reply && !m.deleted) h += quoteHTML(m.reply, chat);
  if (m.deleted) h += `<div class="text">${icon('trash')} این پیام حذف شد</div>`;
  else {
    if (m.type === 'voice') h += `<div class="voice" data-voice="${m.id}"><button class="pp" data-act="play" aria-label="پخش">${icon('play')}</button><div class="wave" data-act="seek">${waveBars(m.id)}</div><span class="dur">${fmtDur(m.duration)}</span><button class="spd" data-act="speed" aria-label="سرعت پخش">۱×</button></div>`;
    if (m.body) h += `<div class="text"></div>`;
  }
  const reacts = (m.reactions || []).map((r) => `<button class="react ${r.users.includes(S.me.id) ? 'mine' : ''}" data-act="react" data-emoji="${r.emoji}" title="${esc(r.users.map((u) => (u === S.me.id ? 'شما' : userOf(chat, u).display_name)).join('، '))}">${r.emoji}<span>${fa(r.users.length)}</span></button>`).join('');
  if (reacts) h += `<div class="reacts">${reacts}</div>`;
  h += `<div class="meta">${m.edited && !m.deleted ? 'ویرایش‌شده · ' : ''}${fmtTime(m.created_at)}${tickHTML(m, chat)}</div>`;
  if (!m.deleted) h += `<button class="menu-btn" data-act="menu" aria-label="گزینه‌های پیام">${icon('chev-down')}</button>`;
  b.innerHTML = h;
  if (m.body && !m.deleted) $('.text', b).append(linkify(m.body));
  const v = $('[data-voice]', b); if (v) bindVoice(v, m);
  row.append(b);
  return row;
}
function buildPending(p) {
  const row = el('div', 'row out first'); row.dataset.temp = p.tmp;
  const label = p.type === 'text' ? '' : `<div class="file-card"><span class="ico">${icon(p.type === 'image' ? 'image' : p.type === 'video' ? 'video' : p.type === 'voice' ? 'mic' : 'file')}</span><span><b>${esc(p.name || 'در حال ارسال')}</b><small>${p.size ? fmtSize(p.size) : ''}</small></span></div><div class="pend-bar"><i style="width:${p.progress || 0}%"></i></div>`;
  row.innerHTML = `<div class="msg pending">${label}${p.type === 'text' ? '<div class="text"></div>' : ''}<div class="meta">${p.failed ? `<button data-act="retry" style="text-decoration:underline">ارسال نشد؛ دوباره</button>` : '<span class="spinner" style="width:.8rem;height:.8rem;border-width:2px"></span>'}</div></div>`;
  if (p.type === 'text') $('.text', row).append(linkify(p.body));
  return row;
}

function insertMessage(m) {
  const chat = S.chats.get(m.chat_id); if (!chat) return;
  const st = msgStore(m.chat_id);
  if (st.loaded && !st.list.some((x) => x.id === m.id)) st.list.push(m);
  if (!chat.last_message || chat.last_message.id <= m.id) chat.last_message = m;
  if (m.chat_id !== S.active || !st.loaded) return;
  const box = $('#messages'); if (!box || $(`[data-id="${m.id}"]`, box)) return;
  $('.sys-msg:not([data-id])', box)?.remove();
  const prev = st.list.length > 1 ? st.list[st.list.length - 2] : null;
  const wasNear = box.scrollHeight - box.scrollTop - box.clientHeight < 160;
  const pend = $$('[data-temp]', box);
  // ورودی‌های در حال ارسال همیشه آخرِ فهرست می‌مانند
  const anchor = pend[0] || null;
  const tmp = document.createDocumentFragment();
  appendRowTo(tmp, m, prev, chat);
  box.insertBefore(tmp, anchor);
  if (m.sender_id === S.me.id || (wasNear && S.stick)) { box.scrollTop = box.scrollHeight; }
  else if (m.sender_id !== S.me.id) { S.unseenBelow++; }
  updateToBottom();
}
function replaceMessage(m) {
  const chat = S.chats.get(m.chat_id); if (!chat) return;
  const st = msgStore(m.chat_id);
  const i = st.list.findIndex((x) => x.id === m.id);
  if (i >= 0) st.list[i] = m;
  if (chat.last_message?.id === m.id) chat.last_message = m;
  if (m.chat_id !== S.active) return;
  const row = $(`#messages [data-id="${m.id}"]`);
  if (row && i >= 0) { const nr = buildRow(m, st.list[i - 1] || null, chat); row.replaceWith(nr); }
}
function refreshTicks() {
  const chat = S.chats.get(S.active), box = $('#messages'); if (!chat || !box) return;
  const st = msgStore(S.active);
  for (const m of st.list) {
    if (m.sender_id !== S.me.id || m.deleted) continue;
    const meta = $(`[data-id="${m.id}"] .meta`, box); if (!meta) continue;
    const tick = tickHTML(m, chat);
    const cur = $('svg', meta);
    if (cur && (cur.classList.contains('seen') === tick.includes('seen'))) continue;
    cur?.remove(); meta.insertAdjacentHTML('beforeend', tick);
  }
}
function updateToBottom() {
  const box = $('#messages'), btn = $('#to-bottom'); if (!box || !btn) return;
  const far = box.scrollHeight - box.scrollTop - box.clientHeight > 260;
  S.stick = !far;
  if (!far) S.unseenBelow = 0;
  btn.classList.toggle('hide', !far);
  btn.innerHTML = icon('chev-down') + (S.unseenBelow ? `<span class="badge">${fa(S.unseenBelow)}</span>` : '');
}
async function loadOlder() {
  const id = S.active, st = msgStore(id);
  if (!st.hasMore || st.loading) return false;
  st.loading = true;
  try {
    const d = await api('GET', `/api/chats/${id}/messages?limit=40&before=${st.list[0].id}`);
    st.list = [...d.messages, ...st.list]; st.hasMore = d.has_more;
    if (S.active === id) renderMessages(false);
  } catch (e) { toast(e.message, true); }
  finally { st.loading = false; }
  return true;
}
async function jumpTo(id) {
  const st = msgStore(S.active);
  let guard = 0;
  while (!st.list.some((m) => m.id === id) && st.hasMore && guard++ < 30) await loadOlder();
  const row = $(`#messages [data-id="${id}"] .msg`);
  if (!row) return toast('پیام اصلی پیدا نشد.', true);
  row.scrollIntoView({ block: 'center', behavior: 'smooth' });
  row.classList.add('flash'); setTimeout(() => row.classList.remove('flash'), 1400);
}

/* ───── رخدادهای ناحیه‌ی پیام‌ها ───── */
function wireMessages() {
  const box = $('#messages');
  box.addEventListener('scroll', () => { updateToBottom(); if (box.scrollTop < 120) loadOlder(); markReadSoon(); }, { passive: true });
  box.addEventListener('load', () => { if (S.stick) box.scrollTop = box.scrollHeight; }, true);
  $('#to-bottom').onclick = () => { box.scrollTo({ top: box.scrollHeight, behavior: 'smooth' }); };
  box.addEventListener('click', onMessageClick);
  box.addEventListener('contextmenu', (e) => {
    const row = e.target.closest('.row[data-id]'); if (!row || e.target.closest('a,video')) return;
    e.preventDefault(); openMsgMenu(Number(row.dataset.id), e.clientX, e.clientY);
  });
  let pressT, sx, sy;
  box.addEventListener('touchstart', (e) => {
    const row = e.target.closest('.row[data-id]'); if (!row || e.target.closest('a,video,.voice,button')) return;
    const t = e.touches[0]; sx = t.clientX; sy = t.clientY;
    pressT = setTimeout(() => { navigator.vibrate?.(12); openMsgMenu(Number(row.dataset.id), sx, sy); }, 480);
  }, { passive: true });
  const cancel = () => clearTimeout(pressT);
  box.addEventListener('touchend', cancel); box.addEventListener('touchcancel', cancel);
  box.addEventListener('touchmove', (e) => { const t = e.touches[0]; if (Math.abs(t.clientX - sx) + Math.abs(t.clientY - sy) > 10) cancel(); }, { passive: true });
}
function findMsg(id) { return msgStore(S.active).list.find((m) => m.id === id); }
function onMessageClick(e) {
  const t = e.target.closest('[data-act]'); if (!t) return;
  const row = t.closest('[data-id]'); const id = row ? Number(row.dataset.id) : null;
  switch (t.dataset.act) {
    case 'menu': { e.preventDefault(); const r = t.getBoundingClientRect(); openMsgMenu(id, r.left, r.bottom); break; }
    case 'react': reactTo(id, t.dataset.emoji); break;
    case 'quote': jumpTo(Number(t.dataset.id)); break;
    case 'play': toggleVoice(t.closest('[data-voice]')); break;
    case 'seek': seekVoice(t.closest('[data-voice]'), e); break;
    case 'speed': cycleSpeed(t.closest('[data-voice]')); break;
    case 'retry': { const tmp = t.closest('[data-temp]').dataset.temp; retryPending(tmp); break; }
  }
}
function openMsgMenu(id, x, y) {
  const m = findMsg(id); if (!m || m.type === 'system') return;
  const mine = m.sender_id === S.me.id;
  const mineReact = (m.reactions || []).find((r) => r.users.includes(S.me.id))?.emoji;
  let h = '';
  if (!m.deleted) h += `<div class="quick">${S.reactions.map((e) => `<button data-q="${e}" class="${e === mineReact ? 'on' : ''}">${e}</button>`).join('')}</div>`;
  if (!m.deleted) h += `<button class="item" data-a="reply">${icon('reply')} پاسخ</button>`;
  if (m.body && !m.deleted) h += `<button class="item" data-a="copy">${icon('copy')} کپی متن</button>`;
  if (m.file && !m.deleted) h += `<a class="item" href="/files/${encodeURIComponent(m.file)}?dl=1" download="${esc(m.file_name || 'file')}" data-a="x" style="text-decoration:none;color:inherit">${icon('download')} دانلود</a>`;
  if (mine && !m.deleted && m.type !== 'voice') h += `<button class="item" data-a="edit">${icon('edit')} ویرایش</button>`;
  if (mine && !m.deleted) h += `<button class="item danger" data-a="delete">${icon('trash')} حذف</button>`;
  if (!h) return;
  const p = openPop(h, x, y);
  p.addEventListener('click', async (e) => {
    const q = e.target.closest('[data-q]');
    if (q) { closePop(); return reactTo(id, q.dataset.q); }
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
    if (a === 'x') { setTimeout(closePop, 80); return; }
    closePop();
    if (a === 'reply') setReply(m);
    else if (a === 'copy') { try { await navigator.clipboard.writeText(m.body); toast('کپی شد'); } catch { toast('کپی نشد', true); } }
    else if (a === 'edit') setEditing(m);
    else if (a === 'delete') { if (await confirmBox('حذف پیام', 'این پیام برای همه حذف می‌شه و برگشتی نداره.', 'حذف')) api('DELETE', '/api/messages/' + id).then((d) => { replaceMessage(d.message); renderChatList(); }).catch((er) => toast(er.message, true)); }
  });
}
async function reactTo(id, emoji) {
  try { const d = await api('POST', `/api/messages/${id}/react`, { emoji }); replaceMessage(d.message); } catch (e) { toast(e.message, true); }
}
/* ───── پخش پیام صوتی ───── */
const voices = new Map();
function getVoice(m) {
  let v = voices.get(m.id);
  if (!v) { v = { audio: new Audio(), speed: 1, dur: m.duration || 0 }; v.audio.preload = 'none'; v.audio.src = '/files/' + encodeURIComponent(m.file); voices.set(m.id, v); }
  return v;
}
function bindVoice(root, m) {
  const v = getVoice(m);
  const paint = () => {
    const a = v.audio, total = isFinite(a.duration) && a.duration > 0 ? a.duration : v.dur;
    const bars = $$('.wave i', root), ratio = total ? a.currentTime / total : 0;
    const on = Math.round(bars.length * ratio);
    bars.forEach((b, i) => b.classList.toggle('on', i < on));
    $('.pp', root).innerHTML = icon(a.paused ? 'play' : 'pause');
    $('.dur', root).textContent = fmtDur(a.paused && a.currentTime === 0 ? total : Math.max(0, total - a.currentTime));
    $('.spd', root).textContent = faDigits(String(v.speed)).replace('.', '٫') + '×';
  };
  v.paint = paint;
  ['play', 'pause', 'ended', 'timeupdate', 'loadedmetadata'].forEach((ev) => { v.audio['on' + ev] = () => { if (ev === 'ended') v.audio.currentTime = 0; paint(); }; });
  paint();
}
const voiceOf = (root) => voices.get(Number(root.dataset.voice));
function toggleVoice(root) {
  const v = voiceOf(root); if (!v) return;
  if (v.audio.paused) { voices.forEach((o) => { if (o !== v) o.audio.pause(); }); v.audio.playbackRate = v.speed; v.audio.play().catch(() => toast('پخش نشد.', true)); }
  else v.audio.pause();
}
function seekVoice(root, e) {
  const v = voiceOf(root); if (!v) return;
  const r = e.currentTarget?.getBoundingClientRect?.() || $('.wave', root).getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  const go = () => { const total = isFinite(v.audio.duration) ? v.audio.duration : v.dur; v.audio.currentTime = total * ratio; v.paint(); };
  if (v.audio.readyState < 1) { v.audio.preload = 'metadata'; v.audio.load(); v.audio.addEventListener('loadedmetadata', go, { once: true }); } else go();
}
function cycleSpeed(root) {
  const v = voiceOf(root); if (!v) return;
  const order = [1, 1.5, 2]; v.speed = order[(order.indexOf(v.speed) + 1) % order.length];
  v.audio.playbackRate = v.speed; v.paint();
}

/* ═════════ نوشتن و ارسال ═════════ */
function autoGrow() { const t = $('#input'); if (!t) return; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 144) + 'px'; }
function toggleSendMic() {
  const has = $('#input').value.trim().length > 0;
  $('#btn-send').classList.toggle('hidden', !has);
  $('#btn-mic').classList.toggle('hidden', has);
}
let lastTypingSent = 0;
function wireComposer() {
  const inp = $('#input');
  inp.addEventListener('input', () => {
    autoGrow(); toggleSendMic();
    if (Date.now() - lastTypingSent > 3000 && inp.value.trim() && S.ws?.readyState === 1) { lastTypingSent = Date.now(); S.ws.send(JSON.stringify({ t: 'typing', chat_id: S.active })); }
  });
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && S.settings.enterSend && !matchMedia('(pointer: coarse)').matches) { e.preventDefault(); submitComposer(); }
  });
  $('#btn-send').onclick = submitComposer;
  $('#btn-mic').onclick = startRecording;
  $('#btn-emoji').onclick = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const EMOJI = '😀😃😄😁😆😅😂🤣🥲😊😇🙂😉😍🥰😘😋😜🤪😎🤩🥳😏😒😔😢😭😤😠😱😨🤔🫡🤗🤭🫢😴🤤😷🤒🤯🥵🥶😬🙄😐😑😶👍👎👌✌️🤞🤝👏🙌🙏💪👀🧠❤️🧡💛💚💙💜🖤💔💕💯🔥✨⭐🌟🎉🎁🎂☕🍕🍔🍟🍫🍉🌹🌸☀️🌙⚡🌈🚀✈️🚗⚽🎮🎧📷📌✅❌❓❗'.match(/\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*/gu);
    const p = openPop(`<div class="emoji-grid">${EMOJI.map((x) => `<button type="button">${x}</button>`).join('')}</div>`, r.left, r.top - 250, 'emoji-pop');
    p.addEventListener('click', (ev) => {
      const b = ev.target.closest('button'); if (!b) return;
      const t = $('#input'); const s = t.selectionStart ?? t.value.length;
      t.setRangeText(b.textContent, s, t.selectionEnd ?? s, 'end'); t.focus(); autoGrow(); toggleSendMic();
    });
  };
  inp.focus({ preventScroll: true });
}
function setReply(m) {
  S.editing = null; S.replyTo = m; renderModeBar(); $('#input')?.focus();
}
function setEditing(m) {
  S.replyTo = null; S.editing = m; renderModeBar();
  const t = $('#input'); t.value = m.body; autoGrow(); toggleSendMic(); t.focus();
}
function cancelComposerMode(silent) {
  const wasEditing = !!S.editing;
  S.replyTo = null; S.editing = null;
  if (!silent) { renderModeBar(); if (wasEditing && $('#input')) { $('#input').value = ''; autoGrow(); toggleSendMic(); } }
  else if ($('#replybar')) $('#replybar').innerHTML = '';
}
function renderModeBar() {
  const bar = $('#replybar'); if (!bar) return;
  const chat = S.chats.get(S.active);
  if (S.replyTo) {
    const m = S.replyTo, who = m.sender_id === S.me.id ? 'شما' : userOf(chat, m.sender_id).display_name;
    bar.innerHTML = `<div class="reply-bar">${icon('reply')}<div class="quote"><b>پاسخ به ${esc(who)}</b><span>${esc(previewOf(m).text)}</span></div><button class="icon-btn" id="mode-x" aria-label="لغو">${icon('close')}</button></div>`;
  } else if (S.editing) {
    bar.innerHTML = `<div class="reply-bar">${icon('edit')}<div class="quote"><b>ویرایش پیام</b><span>${esc(S.editing.body)}</span></div><button class="icon-btn" id="mode-x" aria-label="لغو">${icon('close')}</button></div>`;
  } else bar.innerHTML = '';
  $('#mode-x')?.addEventListener('click', () => cancelComposerMode());
}
async function submitComposer() {
  const inp = $('#input'); const text = inp.value.trim();
  if (!text) return;
  const chatId = S.active;
  if (S.editing) {
    const m = S.editing;
    if (text === m.body) return cancelComposerMode();
    try { const d = await api('PATCH', '/api/messages/' + m.id, { body: text }); replaceMessage(d.message); renderChatList(); cancelComposerMode(); }
    catch (e) { toast(e.message, true); }
    return;
  }
  const reply = S.replyTo?.id || null;
  inp.value = ''; autoGrow(); toggleSendMic(); S.drafts.delete(chatId);
  cancelComposerMode();
  const p = { tmp: 't' + Date.now() + Math.random().toString(36).slice(2, 6), chatId, type: 'text', body: text, reply };
  queuePending(p);
  sendPending(p);
  blip('out');
}
function queuePending(p) {
  if (!S.pending.has(p.chatId)) S.pending.set(p.chatId, []);
  S.pending.get(p.chatId).push(p);
  if (p.chatId === S.active) { const box = $('#messages'); $('.sys-msg:not([data-id])', box)?.remove(); box.append(buildPending(p)); box.scrollTop = box.scrollHeight; }
}
function dropPending(p) {
  const arr = S.pending.get(p.chatId) || [];
  const i = arr.indexOf(p); if (i >= 0) arr.splice(i, 1);
  $(`[data-temp="${p.tmp}"]`)?.remove();
}
async function sendPending(p) {
  p.failed = false;
  try {
    let payload = { type: p.type, body: p.body || '', reply_to: p.reply || undefined };
    if (p.blob) {
      const up = await uploadFile(p.blob, p.kind || p.type, p.name, p.mime, (pct) => { p.progress = pct; const bar = $(`[data-temp="${p.tmp}"] .pend-bar i`); if (bar) bar.style.width = pct + '%'; });
      payload.file = up.file; if (p.type === 'voice') payload.duration = p.duration;
    }
    const d = await api('POST', `/api/chats/${p.chatId}/messages`, payload);
    dropPending(p);
    insertMessage(d.message);
    renderChatList();
  } catch (e) {
    p.failed = true;
    toast(e.message, true);
    if (p.type === 'text' && !p.retried) { /* دکمه‌ی «دوباره» در خود حباب نمایش داده می‌شود */ }
    const row = $(`[data-temp="${p.tmp}"]`); if (row) row.replaceWith(buildPending(p));
  }
}
function retryPending(tmp) {
  for (const arr of S.pending.values()) { const p = arr.find((x) => x.tmp === tmp); if (p) { const row = $(`[data-temp="${tmp}"]`); if (row) row.replaceWith(buildPending(p)); sendPending(p); return; } }
}
function uploadFile(blob, kind, name, mime, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/upload?kind=${encodeURIComponent(kind)}&name=${encodeURIComponent(name || 'file')}`);
    xhr.setRequestHeader('Content-Type', (mime || blob.type || 'application/octet-stream').split(';')[0]);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      let d = {}; try { d = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(d);
      else { if (xhr.status === 401) sessionExpired(); reject(new ApiError(d.error || 'آپلود انجام نشد.', xhr.status)); }
    };
    xhr.onerror = () => reject(new ApiError('ارتباط با سرور قطع شد.', 0));
    xhr.send(blob);
  });
}
/* ───── ضبط صدا ───── */
let rec = null;
async function startRecording() {
  if (rec) return;
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast('مرورگر شما از ضبط صدا پشتیبانی نمی‌کند.', true);
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
  catch { return toast('اجازه‌ی استفاده از میکروفون داده نشد. از تنظیمات مرورگر فعالش کن.', true); }
  const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
  const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks = []; mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const an = ctx.createAnalyser(); an.fftSize = 256; ctx.createMediaStreamSource(stream).connect(an);
  rec = { mr, stream, chunks, ctx, an, start: Date.now(), chatId: S.active, mime: mr.mimeType || mime || 'audio/webm', send: false };
  const comp = $('#composer');
  rec.saved = comp.innerHTML;
  comp.innerHTML = `<button class="icon-btn" id="rec-cancel" aria-label="لغو ضبط" style="color:var(--danger)">${icon('trash')}</button>
    <div class="recorder"><span class="rec-dot"></span><span class="rec-time" id="rec-time">${fmtDur(0)}</span><div class="rec-level" id="rec-level"></div></div>
    <button class="icon-btn send-btn" id="rec-send" aria-label="ارسال پیام صوتی">${icon('send')}</button>`;
  $('#rec-cancel').onclick = () => stopRecording(true);
  $('#rec-send').onclick = () => stopRecording(false);
  const lv = $('#rec-level'); const data = new Uint8Array(an.frequencyBinCount);
  rec.timer = setInterval(() => {
    const sec = (Date.now() - rec.start) / 1000; $('#rec-time').textContent = fmtDur(sec);
    an.getByteTimeDomainData(data);
    let peak = 0; for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
    const i = document.createElement('i'); i.style.setProperty('--h', Math.max(4, Math.min(26, peak / 4)) + 'px');
    lv.append(i); while (lv.children.length > 60) lv.firstChild.remove();
    if (sec >= 600) stopRecording(false);
  }, 90);
  mr.start(250);
}
function stopRecording(cancel) {
  const r = rec; if (!r) return;
  rec = null;
  clearInterval(r.timer);
  r.send = !cancel;
  r.mr.onstop = () => {
    r.stream.getTracks().forEach((t) => t.stop()); r.ctx.close().catch(() => {});
    const dur = (Date.now() - r.start) / 1000;
    if (!r.send) return;
    if (dur < 1) return toast('پیام صوتی خیلی کوتاه بود.', true);
    const blob = new Blob(r.chunks, { type: r.mime });
    const ext = r.mime.includes('mp4') ? 'm4a' : r.mime.includes('ogg') ? 'ogg' : 'webm';
    const p = { tmp: 't' + Date.now(), chatId: r.chatId, type: 'voice', kind: 'voice', blob, name: `voice.${ext}`, mime: r.mime, size: blob.size, progress: 0, duration: dur };
    queuePending(p); sendPending(p);
  };
  try { if (r.mr.state !== 'inactive') r.mr.stop(); else r.mr.onstop(); } catch { r.mr.onstop?.(); }
  const comp = $('#composer');
  if (comp && r.saved != null) { comp.innerHTML = r.saved; wireComposerAfterRestore(); }
}
function wireComposerAfterRestore() {
  wireComposer();
  autoGrow(); toggleSendMic();
}

/* ───── خوانده شدن ───── */
const markReadSoon = debounce(async () => {
  const id = S.active; if (!id || document.hidden || !S.me) return;
  const chat = S.chats.get(id), st = msgStore(id), box = $('#messages');
  if (!chat || !st.loaded || !box) return;
  const near = box.scrollHeight - box.scrollTop - box.clientHeight < 200;
  if (!near) return;
  const last = [...st.list].reverse().find((m) => m.sender_id !== S.me.id && m.type !== 'system');
  const mine = memberOf(chat, S.me.id);
  if (!last || !mine || last.id <= mine.last_read_id) { if (chat.unread) { chat.unread = 0; renderChatList(); updateTitle(); } return; }
  mine.last_read_id = last.id; chat.unread = 0;
  renderChatList(); updateTitle();
  api('POST', `/api/chats/${id}/read`, { upto: last.id }).catch(() => {});
}, 250);

/* ═════════ وب‌سوکت ═════════ */
let wsTimer;
function connectWS() {
  if (!S.me) return;
  clearTimeout(wsTimer);
  const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
  S.ws = ws;
  ws.onopen = () => {
    const reconnected = S.wsTry > 0; S.wsTry = 0; $('#conn-bar')?.classList.add('hidden');
    if (reconnected) resync();
  };
  ws.onmessage = (e) => { let d; try { d = JSON.parse(e.data); } catch { return; } onEvent(d); };
  ws.onclose = () => {
    if (!S.me || S.ws !== ws) return;
    $('#conn-bar')?.classList.remove('hidden');
    S.wsTry++;
    wsTimer = setTimeout(connectWS, Math.min(1000 * 2 ** Math.min(S.wsTry, 4), 15000));
  };
}
async function resync() {
  try {
    await refreshChats();
    const id = S.active;
    if (id && S.chats.has(id)) {
      const st = msgStore(id);
      const d = await api('GET', `/api/chats/${id}/messages?limit=40`);
      const have = new Set(st.list.map((m) => m.id));
      for (const m of d.messages) if (!have.has(m.id)) st.list.push(m);
      st.list.sort((a, b) => a.id - b.id); st.loaded = true;
      renderMessages(false); updateHeader();
    }
  } catch {}
}
function onEvent(d) {
  switch (d.event) {
    case 'message:new': return onNewMessage(d.message);
    case 'message:update': replaceMessage(d.message); renderChatList(); return;
    case 'chat:new': S.chats.set(d.chat.id, d.chat); renderChatList(); updateTitle(); return;
    case 'chat:update': refreshChats().then(() => { if (S.active) { if (!S.chats.has(S.active)) location.hash = '#/'; else updateHeader(); } }); return;
    case 'chat:remove': S.chats.delete(d.chat_id); S.msgs.delete(d.chat_id); if (S.active === d.chat_id) location.hash = '#/'; renderChatList(); updateTitle(); return;
    case 'call': return onCallEvent(d);
    case 'typing': return onTyping(d);
    case 'presence': return onPresence(d);
    case 'read': {
      const chat = S.chats.get(d.chat_id), m = chat && memberOf(chat, d.user_id);
      if (m) { m.last_read_id = d.last_read_id; if (d.chat_id === S.active) refreshTicks(); }
      return;
    }
    case 'user:update': {
      const u = d.user;
      for (const c of S.chats.values()) { const m = memberOf(c, u.id); if (m) Object.assign(m, { display_name: u.display_name, avatar: u.avatar, bio: u.bio }); }
      if (d.self) { Object.assign(S.me, u); renderMeButton(); }
      renderChatList(); if (S.active) { updateHeader(); if (!d.self) renderMessages(false); } return;
    }
  }
}
function onNewMessage(m) {
  let chat = S.chats.get(m.chat_id);
  if (!chat) { refreshChats().then(() => { const c = S.chats.get(m.chat_id); if (c) onNewMessage(m); }); return; }
  const mine = m.sender_id === S.me.id;
  const t = S.typing.get(m.chat_id); if (t?.has(m.sender_id)) { clearTimeout(t.get(m.sender_id)); t.delete(m.sender_id); }
  const visible = m.chat_id === S.active && !document.hidden;
  const st = msgStore(m.chat_id);
  const dup = st.list.some((x) => x.id === m.id);
  insertMessage(m);
  if (!dup && !mine && m.type !== 'system') {
    const atBottom = visible && S.stick;
    if (!atBottom) chat.unread = (chat.unread || 0) + 1;
    if (!visible) notifyMessage(chat, m);
    blip('in');
  }
  if (visible) markReadSoon();
  renderChatList(); updateTitle(); if (m.chat_id === S.active) updateHeader();
}
function onTyping({ chat_id, user_id }) {
  let t = S.typing.get(chat_id); if (!t) S.typing.set(chat_id, (t = new Map()));
  clearTimeout(t.get(user_id));
  t.set(user_id, setTimeout(() => { t.delete(user_id); renderChatList(); if (chat_id === S.active) updateHeader(); }, 4500));
  renderChatList(); if (chat_id === S.active) updateHeader();
}
function onPresence({ user_id, online, last_seen }) {
  for (const c of S.chats.values()) { const m = memberOf(c, user_id); if (m) { m.online = online; if (last_seen) m.last_seen = last_seen; } }
  renderChatList(); if (S.active) updateHeader();
}
setInterval(() => { if (S.active && S.me) updateHeader(); }, 60000);

/* ═════════ گفتگوی تازه، گروه ═════════ */
async function startDM(username) {
  try {
    const d = await api('POST', '/api/chats/dm', { username });
    S.chats.set(d.chat.id, d.chat);
    modalStack.slice().forEach((m) => m.close());
    S.sideQuery = ''; const si = $('#side-search'); if (si) si.value = '';
    renderChatList(); location.hash = '#/c/' + d.chat.id;
    setTimeout(() => $('#input')?.focus(), 350);
  } catch (e) { toast(e.message, true); }
}
function userPicker(host, { onPick, exclude = () => false, emptyText = 'نام کاربری یا نام دوستت رو بنویس.' }) {
  host.innerHTML = `<div class="search" style="margin:0 0 .6rem">${icon('search')}<input class="input" placeholder="جستجوی نام یا نام کاربری…" autocomplete="off" autocapitalize="none"></div><div class="results"><div class="hint" style="text-align:center;padding:1rem">${emptyText}</div></div>`;
  const inp = $('input', host), res = $('.results', host);
  const run = debounce(async () => {
    const q = inp.value.trim();
    if (q.length < 1) { res.innerHTML = `<div class="hint" style="text-align:center;padding:1rem">${emptyText}</div>`; return; }
    try {
      const { users } = await api('GET', '/api/users/search?q=' + encodeURIComponent(q));
      const list = users.filter((u) => !exclude(u));
      res.innerHTML = list.length ? list.map((u) => `<button class="user-row" data-u="${esc(u.username)}">${avatarHTML(u, 'md', u.online)}<div class="info"><b>${esc(u.display_name)}</b><small class="ltr">@${esc(u.username)}</small></div></button>`).join('') : `<div class="hint" style="text-align:center;padding:1rem">کاربری پیدا نشد. نام کاربری رو دقیق بنویس.</div>`;
    } catch (e) { res.innerHTML = `<div class="form-error">${esc(e.message)}</div>`; }
  }, 250);
  inp.addEventListener('input', run);
  res.addEventListener('click', (e) => { const b = e.target.closest('[data-u]'); if (b) onPick(b.dataset.u, b); });
  setTimeout(() => inp.focus(), 50);
}
function openNewChat() {
  const m = openModal({ title: 'گفتگوی تازه', tabs: [{ id: 'dm', label: 'گفتگوی خصوصی', icon: 'user' }, { id: 'group', label: 'گروه جدید', icon: 'users' }] });
  const picked = new Map();
  const show = (tab) => {
    $$('.tabs button', m.overlay).forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === tab));
    if (tab === 'dm') { m.body.innerHTML = '<div id="pk"></div>'; userPicker($('#pk', m.body), { onPick: (u) => startDM(u) }); }
    else {
      m.body.innerHTML = `<div class="field"><label for="g-name">نام گروه</label><input class="input" id="g-name" maxlength="40" placeholder="مثلاً دوستان دانشگاه"></div><div class="chips" id="chips"></div><div id="pk"></div><div class="form-error" id="g-err" style="margin-top:.8rem"></div><button class="btn primary block" id="g-go" style="margin-top:.8rem">ساخت گروه</button>`;
      const drawChips = () => { $('#chips', m.body).innerHTML = [...picked.values()].map((u) => `<span class="chip">${esc(u.display_name)}<button class="icon-btn" data-rm="${esc(u.username)}" style="width:1.5rem;height:1.5rem" aria-label="حذف">${icon('close')}</button></span>`).join(''); };
      $('#chips', m.body).onclick = (e) => { const r = e.target.closest('[data-rm]'); if (r) { picked.delete(r.dataset.rm); drawChips(); } };
      userPicker($('#pk', m.body), { exclude: (u) => picked.has(u.username), onPick: (name, btn) => { picked.set(name, { username: name, display_name: $('b', btn).textContent }); btn.remove(); drawChips(); } });
      $('#g-go', m.body).onclick = async () => {
        const err = $('#g-err', m.body); err.textContent = '';
        try {
          const d = await api('POST', '/api/chats/group', { name: $('#g-name', m.body).value, members: [...picked.keys()] });
          S.chats.set(d.chat.id, d.chat); m.close(); renderChatList(); location.hash = '#/c/' + d.chat.id;
        } catch (e) { err.textContent = e.message; }
      };
    }
  };
  $('.tabs', m.overlay).onclick = (e) => { const b = e.target.closest('[data-tab]'); if (b) show(b.dataset.tab); };
  show('dm');
}

/* ═════════ اطلاعات گفتگو و جستجو ═════════ */
function openChatInfo(id) {
  const chat = S.chats.get(id); if (!chat) return;
  const m = openModal({ title: chat.type === 'group' ? 'اطلاعات گروه' : 'اطلاعات کاربر' });
  const isOwner = chat.type === 'group' && chat.owner_id === S.me.id;
  const draw = () => {
    const c = S.chats.get(id); if (!c) return m.close();
    if (c.type === 'dm') {
      const o = otherOf(c);
      m.body.innerHTML = `<div class="profile-top">${avatarHTML(o, 'xl', o.online)}<h2 style="margin:0">${esc(o.display_name)}</h2><span class="muted ltr">@${esc(o.username)}</span><span class="${o.online ? '' : 'muted'}" style="${o.online ? 'color:var(--ok)' : ''}">${esc(lastSeenText(o))}</span>${o.bio ? `<p style="max-width:22rem;margin:.6rem 0 0;white-space:pre-wrap">${esc(o.bio)}</p>` : ''}</div>`;
      return;
    }
    m.body.innerHTML = `<div class="profile-top">${groupAvatarHTML(c, 'xl')}<h2 style="margin:0">${esc(c.name)}</h2><span class="muted">${fa(c.members.length)} عضو</span></div>
      ${isOwner ? `<div class="field"><label for="gi-name">نام گروه</label><div style="display:flex;gap:.5rem"><input class="input" id="gi-name" maxlength="40" value="${esc(c.name)}"><button class="btn" id="gi-save">ذخیره</button></div></div>` : ''}
      <div class="sect">اعضا</div>
      ${c.members.map((u) => `<div class="user-row">${avatarHTML(u, 'md', u.online)}<div class="info"><b>${esc(u.display_name)}${u.id === S.me.id ? ' (شما)' : ''}</b><small class="ltr">@${esc(u.username)}</small></div>${u.role === 'owner' ? '<span class="chip" style="padding:.15rem .7rem">سازنده</span>' : ''}</div>`).join('')}
      ${isOwner ? `<div class="sect">افزودن عضو</div><div id="gi-add"></div>` : ''}
      <button class="btn danger block" id="gi-leave" style="margin-top:1.2rem">${icon('logout')} ترک گروه</button>`;
    if (isOwner) {
      $('#gi-save', m.body).onclick = async () => { try { await api('PATCH', '/api/chats/' + id, { name: $('#gi-name', m.body).value }); toast('نام گروه عوض شد'); } catch (e) { toast(e.message, true); } };
      userPicker($('#gi-add', m.body), { exclude: (u) => c.members.some((x) => x.id === u.id), onPick: async (name) => { try { await api('POST', `/api/chats/${id}/members`, { username: name }); await refreshChats(); draw(); } catch (e) { toast(e.message, true); } } });
    }
    $('#gi-leave', m.body).onclick = async () => {
      if (!(await confirmBox('ترک گروه', 'از این گروه خارج می‌شی و پیام‌های قبلی رو دیگه نمی‌بینی.', 'ترک گروه'))) return;
      try { await api('DELETE', `/api/chats/${id}/membership`); m.close(); } catch (e) { toast(e.message, true); }
    };
  };
  draw();
}
function openChatSearch(id) {
  const m = openModal({ title: 'جستجو در گفتگو' });
  m.body.innerHTML = `<div class="search" style="margin:0 0 .6rem">${icon('search')}<input class="input" placeholder="حداقل ۲ حرف بنویس…" autocomplete="off"></div><div id="sr"></div>`;
  const inp = $('input', m.body), sr = $('#sr', m.body), chat = S.chats.get(id);
  const run = debounce(async () => {
    const q = inp.value.trim(); if (q.length < 2) { sr.innerHTML = ''; return; }
    try {
      const { messages } = await api('GET', `/api/chats/${id}/search?q=` + encodeURIComponent(q));
      sr.innerHTML = messages.length ? messages.map((x) => `<button class="user-row" data-m="${x.id}"><div class="info"><b>${esc(x.sender_id === S.me.id ? 'شما' : userOf(chat, x.sender_id).display_name)}</b><small style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.body)}</small></div><small class="muted">${esc(listTime(x.created_at))}</small></button>`).join('') : '<div class="hint" style="text-align:center;padding:1rem">چیزی پیدا نشد.</div>';
    } catch (e) { sr.innerHTML = `<div class="form-error">${esc(e.message)}</div>`; }
  }, 250);
  inp.addEventListener('input', run);
  sr.addEventListener('click', (e) => { const b = e.target.closest('[data-m]'); if (b) { m.close(); jumpTo(Number(b.dataset.m)); } });
  setTimeout(() => inp.focus(), 50);
}

/* ═════════ تنظیمات ═════════ */
function openSettings(tab = 'look') {
  const m = openModal({ title: 'تنظیمات', wide: true, tabs: [
    { id: 'look', label: 'ظاهر', icon: 'palette' }, { id: 'chat', label: 'گفتگو و اعلان', icon: 'bell' },
    { id: 'account', label: 'حساب', icon: 'user' }, { id: 'security', label: 'امنیت', icon: 'shield' }] });
  const show = (t) => {
    $$('.tabs button', m.overlay).forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === t));
    const sc = m.body.scrollTop;
    ({ look: tabLook, chat: tabChat, account: tabAccount, security: tabSecurity })[t](m);
    m.body.dataset.tab = t; m.body.scrollTop = sc;
  };
  $('.tabs', m.overlay).onclick = (e) => { const b = e.target.closest('[data-tab]'); if (b) show(b.dataset.tab); };
  m.show = show;
  show(tab);
}
function tabLook(m) {
  const s = S.settings;
  const resolved = document.documentElement.getAttribute('data-theme');
  m.body.innerHTML = `
    <div class="sect">تم</div>
    <div class="theme-grid">
      ${THEMES.map((t) => `<button class="theme-card" data-set="theme" data-v="${t.id}" aria-pressed="${s.theme === t.id}"><div class="theme-prev" style="--pb:${t.bg};--pi:${t.panel};--pa:${t.accent}"><i></i><i></i><i></i></div>${t.name}</button>`).join('')}
      <button class="theme-card" data-set="theme" data-v="auto" aria-pressed="${s.theme === 'auto'}"><div class="theme-prev" style="--pb:linear-gradient(110deg,#f3f5fa 50%,#0f1424 50%);--pi:#8883;--pa:#2fd0c0"><i></i><i></i><i></i></div>خودکار (مثل سیستم)</button>
    </div>
    <div class="sect">رنگ اصلی</div>
    <div class="swatches">
      <button style="--c:var(--accent-default,#888);background:conic-gradient(#2fd0c0,#38bdf8,#a78bfa,#f472b6,#ff9b5e,#2fd0c0)" data-set="accent" data-v="" aria-pressed="${!s.accent}" title="رنگ پیش‌فرض تم" aria-label="رنگ پیش‌فرض تم"></button>
      ${ACCENTS.map((c) => `<button style="--c:${c}" data-set="accent" data-v="${c}" aria-pressed="${s.accent === c}" aria-label="رنگ ${c}"></button>`).join('')}
      <label title="رنگ دلخواه" style="display:grid"><input type="color" id="accent-custom" value="${s.accent || '#2fd0c0'}" aria-label="رنگ دلخواه"></label>
    </div>
    <div class="sect">پس‌زمینه‌ی گفتگو</div>
    <div class="wall-grid">${WALLS.map(([k, n]) => `<button class="wall-card" data-w="${k}" data-set="wall" data-v="${k}" aria-pressed="${s.wall === k}">${n}</button>`).join('')}</div>
    <div class="sect">شکل حباب پیام</div>
    <div class="seg" role="group">${[['soft', 'نرم'], ['pill', 'گرد'], ['sharp', 'تیز']].map(([k, n]) => `<button data-set="shape" data-v="${k}" aria-pressed="${s.shape === k}">${n}</button>`).join('')}</div>
    <div class="sect">اندازه‌ی متن</div>
    <div style="display:flex;align-items:center;gap:1rem"><span style="font-size:.85rem">آ</span><input type="range" min="13" max="21" step="1" value="${s.fontSize}" id="fs" aria-label="اندازه‌ی متن"><span style="font-size:1.3rem">آ</span><span class="muted" style="min-width:2.5rem;text-align:center">${fa(s.fontSize)}</span></div>
    <div class="sect">فشردگی پیام‌ها</div>
    <div class="seg" role="group">${[['cozy', 'راحت'], ['compact', 'فشرده']].map(([k, n]) => `<button data-set="density" data-v="${k}" aria-pressed="${s.density === k}">${n}</button>`).join('')}</div>
    <div class="sect">پیش‌نمایش</div>
    <div class="mini-preview"><div class="row in first"><div class="msg"><div class="text">سلام! تم جدیدم رو دیدی؟</div><div class="meta">${faDigits('۱۰:۲۲')}</div></div></div><div class="row out first"><div class="msg"><div class="text">آره، خیلی قشنگه</div><div class="meta">${faDigits('۱۰:۲۳')}${icon('check2', 'seen')}</div></div></div></div>`;
  const fs = $('#fs', m.body);
  fs.oninput = () => { setSetting('fontSize', Number(fs.value)); fs.nextElementSibling.nextElementSibling.textContent = fa(fs.value); };
  $('#accent-custom', m.body).oninput = (e) => { setSetting('accent', e.target.value); $$('[data-set=accent]', m.body).forEach((b) => b.setAttribute('aria-pressed', 'false')); };
  m.body.onclick = (e) => {
    const b = e.target.closest('[data-set]'); if (!b) return;
    const k = b.dataset.set; let v = b.dataset.v; if (k === 'accent' && v === '') v = null;
    setSetting(k, v); tabLook(m);
  };
}
function toggleRow(key, title, desc) {
  return `<div class="setting-row"><div><b>${title}</b><small>${desc}</small></div><label class="switch"><input type="checkbox" data-tg="${key}" ${S.settings[key] ? 'checked' : ''}><i></i></label></div>`;
}
function tabChat(m) {
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  m.body.innerHTML = `<div class="sect">گفتگو</div>
    ${toggleRow('enterSend', 'ارسال با Enter', 'با Shift+Enter خط جدید می‌شه. روی موبایل، Enter همیشه خط جدیده.')}
    ${toggleRow('sound', 'صدای پیام', 'وقتی پیام تازه می‌رسه یا می‌فرستی، صدای کوتاهی پخش می‌شه.')}
    <div class="sect">اعلان‌ها</div>
    ${toggleRow('notify', 'اعلان روی دسکتاپ', perm === 'denied' ? 'اعلان‌ها در مرورگر مسدود شده‌اند؛ از تنظیمات سایت فعالشان کن.' : perm === 'unsupported' ? 'مرورگر شما از اعلان پشتیبانی نمی‌کند.' : 'وقتی پیک در پس‌زمینه است، پیام‌های تازه رو نشون می‌ده.')}`;
  m.body.onchange = async (e) => {
    const k = e.target.dataset.tg; if (!k) return;
    if (k === 'notify' && e.target.checked) {
      if (!('Notification' in window)) { e.target.checked = false; return toast('مرورگر شما از اعلان پشتیبانی نمی‌کند.', true); }
      const r = await Notification.requestPermission();
      if (r !== 'granted') { e.target.checked = false; setSetting('notify', false); return toast('اجازه‌ی اعلان داده نشد.', true); }
    }
    setSetting(k, e.target.checked);
  };
}
function tabAccount(m) {
  const u = S.me;
  m.body.innerHTML = `<div class="profile-top"><div class="avatar-edit">${avatarHTML(u, 'xl')}<button class="badge-btn" id="av-pick" aria-label="تغییر عکس">${icon('image')}</button></div>
      <span class="muted ltr">@${esc(u.username)}</span>${u.avatar ? '<button class="btn ghost" id="av-del" style="padding:.2rem .8rem">حذف عکس</button>' : ''}<input type="file" id="av-file" accept="image/png,image/jpeg,image/webp,image/gif" hidden></div>
    <form id="prof"><div class="form-error" role="alert"></div>
      <div class="field"><label for="p-name">نام نمایشی</label><input class="input" id="p-name" maxlength="40" value="${esc(u.display_name)}" required></div>
      <div class="field"><label for="p-bio">درباره‌ی من</label><textarea class="input" id="p-bio" maxlength="160" rows="3" placeholder="یک جمله‌ی کوتاه درباره‌ی خودت">${esc(u.bio || '')}</textarea></div>
      <button class="btn primary block" type="submit">ذخیره</button></form>
    <div class="sect" style="margin-top:1.6rem">خروج</div>
    <button class="btn block" id="do-logout">${icon('logout')} خروج از حساب</button>`;
  const patch = async (body) => { const d = await api('PATCH', '/api/me', body); Object.assign(S.me, d.user); renderMeButton(); renderChatList(); tabAccount(m); };
  $('#av-pick', m.body).onclick = () => $('#av-file', m.body).click();
  $('#av-file', m.body).onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const up = await uploadFile(f, 'avatar', f.name, f.type); await patch({ avatar: up.file }); toast('عکس پروفایل عوض شد'); } catch (er) { toast(er.message, true); }
  };
  $('#av-del', m.body)?.addEventListener('click', () => patch({ avatar: null }).catch((er) => toast(er.message, true)));
  const form = $('#prof', m.body);
  form.onsubmit = (e) => { e.preventDefault(); submitForm(form, $('button[type=submit]', form), async () => { const d = await api('PATCH', '/api/me', { display_name: $('#p-name', m.body).value, bio: $('#p-bio', m.body).value }); Object.assign(S.me, d.user); renderMeButton(); toast('ذخیره شد'); }); };
  $('#do-logout', m.body).onclick = () => { m.close(); logout(); };
}
function tabSecurity(m) {
  m.body.innerHTML = `<div class="sect">تغییر رمز عبور</div>
    <form id="pw"><div class="form-error" role="alert"></div>${pwField('pw-cur', 'رمز عبور فعلی')}${pwField('pw-new', 'رمز عبور جدید', '', 'new-password')}
      <button class="btn primary block" type="submit">تغییر رمز</button><p class="hint">با تغییر رمز، دستگاه‌های دیگر از حساب خارج می‌شن.</p></form>
    <div class="sect" style="margin-top:1.6rem">کد بازیابی</div>
    <p class="hint" style="margin-top:0">کد بازیابی فقط موقع ساخت نمایش داده می‌شه. اگه گمش کردی، با وارد کردن رمزت یک کد تازه بساز؛ کد قبلی باطل می‌شه.</p>
    <form id="rc"><div class="form-error" role="alert"></div>${pwField('rc-pw', 'رمز عبور')}<button class="btn block" type="submit">${icon('key')} ساخت کد بازیابی تازه</button></form><div id="rc-out"></div>
    <div class="sect" style="margin-top:1.6rem">حذف حساب</div>
    <p class="hint" style="margin-top:0">با حذف حساب، همه‌ی پیام‌ها و فایل‌های تو پاک می‌شه و برگشتی نداره.</p>
    <form id="del"><div class="form-error" role="alert"></div>${pwField('del-pw', 'رمز عبور برای تأیید')}<button class="btn danger block" type="submit">${icon('trash')} حذف حساب من</button></form>`;
  wireEyes(m.body);
  const pw = $('#pw', m.body);
  pw.onsubmit = (e) => { e.preventDefault(); submitForm(pw, $('button[type=submit]', pw), async () => { await api('POST', '/api/me/password', { current: $('#pw-cur', m.body).value, password: $('#pw-new', m.body).value }); $('#pw-cur', m.body).value = $('#pw-new', m.body).value = ''; toast('رمز عبور عوض شد'); }); };
  const rc = $('#rc', m.body);
  rc.onsubmit = (e) => { e.preventDefault(); submitForm(rc, $('button[type=submit]', rc), async () => {
    const d = await api('POST', '/api/me/recovery', { password: $('#rc-pw', m.body).value }); $('#rc-pw', m.body).value = '';
    $('#rc-out', m.body).innerHTML = `<div class="rc-box"><div class="rc-code">${esc(d.recovery_code)}</div><div class="rc-actions"><button class="btn" id="rc-c">${icon('copy')} کپی</button></div><p class="hint">این کد رو الان جای امنی ذخیره کن؛ دوباره نمایش داده نمی‌شه.</p></div>`;
    $('#rc-c', m.body).onclick = async () => { try { await navigator.clipboard.writeText(d.recovery_code); toast('کپی شد'); } catch { toast('کپی نشد', true); } };
  }); };
  const del = $('#del', m.body);
  del.onsubmit = (e) => { e.preventDefault(); submitForm(del, $('button[type=submit]', del), async () => {
    if (!(await confirmBox('حذف حساب', 'مطمئنی؟ این کار برگشت‌پذیر نیست.', 'بله، حذف شود'))) return;
    await api('DELETE', '/api/me', { password: $('#del-pw', m.body).value });
    modalStack.slice().forEach((x) => x.close()); teardownApp(); S.me = null; location.hash = '#/'; route(); toast('حساب حذف شد');
  }); };
}

/* ═════════ تماس صوتی و تصویری (WebRTC) ═════════ */
let CALL = null;       // تماس فعلی
let ringTimer = null;
const CALL_TEXT = {
  rejected: 'تماس رد شد.', missed: 'پاسخی داده نشد.', busy: 'کاربر در تماس دیگری است.', unavailable: 'کاربر الان آنلاین نیست.',
  ended: 'تماس تمام شد.', disconnect: 'ارتباط قطع شد.',
};
const callSig = (op, extra = {}) => { if (S.ws?.readyState === 1 && CALL) S.ws.send(JSON.stringify({ t: 'call', op, call_id: CALL.id, chat_id: CALL.chatId, ...extra })); };
const callData = (data) => callSig('signal', { data });
const callState = () => { if (!CALL) return; callSig('state', { data: { mic: CALL.micOn, cam: !!CALL.cam, screen: !!CALL.screen } }); };
const newCallId = () => (crypto.randomUUID ? crypto.randomUUID() : 'c' + Date.now() + Math.random().toString(36).slice(2));

function ringStart(incoming) {
  ringStop();
  const play = () => {
    try {
      audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const t = audioCtx.currentTime;
      const seq = incoming ? [[523, 0], [659, 0.18], [784, 0.36], [659, 0.7], [784, 0.88]] : [[440, 0], [440, 0.5]];
      for (const [f, at] of seq) {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = incoming ? 'triangle' : 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + at); g.gain.exponentialRampToValueAtTime(incoming ? 0.2 : 0.08, t + at + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + at + (incoming ? 0.2 : 0.4));
        o.connect(g).connect(audioCtx.destination); o.start(t + at); o.stop(t + at + 0.45);
      }
    } catch {}
    if (incoming) navigator.vibrate?.([300, 200, 300]);
  };
  play(); ringTimer = setInterval(play, incoming ? 2400 : 3000);
}
function ringStop() { clearInterval(ringTimer); ringTimer = null; navigator.vibrate?.(0); }

async function fetchIce() {
  try { return (await api('GET', '/api/ice')).iceServers; } catch { return [{ urls: 'stun:stun.l.google.com:19302' }]; }
}
async function getMedia(video) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('مرورگر شما از تماس پشتیبانی نمی‌کند (برای تماس باید سایت با HTTPS باز شده باشد).');
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: video ? { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } : false });
  } catch (e) {
    if (e.name === 'NotAllowedError') throw new Error('اجازه‌ی میکروفون' + (video ? ' و دوربین' : '') + ' داده نشد. از تنظیمات مرورگر فعالش کن.');
    if (e.name === 'NotFoundError') throw new Error('میکروفون' + (video ? ' یا دوربین' : '') + ' پیدا نشد.');
    throw new Error('دسترسی به میکروفون' + (video ? ' یا دوربین' : '') + ' ممکن نشد.');
  }
}
function newCall(fields) {
  return { micOn: true, cam: null, screen: null, mic: null, peer: { mic: true, cam: false, screen: false }, chain: Promise.resolve(), making: false, ignore: false, attached: false, remote: new MediaStream(), startedAt: 0, ...fields };
}

async function startCall(chatId, video) {
  if (CALL) return toast('الان در یک تماس هستی.', true);
  const chat = S.chats.get(chatId); if (!chat || chat.type !== 'dm') return;
  if (!S.ws || S.ws.readyState !== 1) return toast('اتصال برقرار نیست؛ چند لحظه بعد دوباره امتحان کن.', true);
  const peer = otherOf(chat);
  let stream;
  try { stream = await getMedia(video); } catch (e) { return toast(e.message, true); }
  if (CALL) { stream.getTracks().forEach((t) => t.stop()); return; }
  CALL = newCall({ id: newCallId(), chatId, role: 'caller', video, peerUser: peer, state: 'ringing', mic: stream.getAudioTracks()[0], cam: stream.getVideoTracks()[0] || null, polite: false });
  callSig('invite', { video });
  renderCallUI(); ringStart(false);
}
async function acceptCall() {
  const c = CALL; if (!c || c.state !== 'incoming') return;
  ringStop();
  let stream;
  try { stream = await getMedia(c.video); }
  catch (e) {
    if (c.video) { try { stream = await getMedia(false); toast('دوربین در دسترس نبود؛ فقط با صدا وصل شدی.', true); } catch (e2) { toast(e2.message, true); return declineCall(); } }
    else { toast(e.message, true); return declineCall(); }
  }
  if (CALL !== c) { stream.getTracks().forEach((t) => t.stop()); return; }
  c.mic = stream.getAudioTracks()[0]; c.cam = stream.getVideoTracks()[0] || null;
  c.state = 'connecting'; c.polite = true;
  c.ice = await fetchIce();
  if (CALL !== c) return;
  setupPeer(c);
  callSig('accept');
  renderCallUI();
}
function declineCall() { if (!CALL) return; callSig('reject'); callCleanup(); }
function hangUp() { if (!CALL) return; callSig('end'); callCleanup(); }

function setupPeer(c) {
  const pc = new RTCPeerConnection({ iceServers: c.ice });
  c.pc = pc;
  pc.onicecandidate = ({ candidate }) => { if (candidate) callData({ cand: candidate.toJSON() }); };
  pc.ontrack = (e) => {
    c.remote.addTrack(e.track);
    const v = $('#call-remote'); if (v && v.srcObject !== c.remote) v.srcObject = c.remote;
    v?.play?.().catch(() => {});
  };
  pc.onnegotiationneeded = async () => {
    try { c.making = true; await pc.setLocalDescription(); callData({ desc: pc.localDescription.toJSON() }); }
    catch (e) { console.warn('negotiation', e); } finally { c.making = false; }
  };
  pc.onconnectionstatechange = () => {
    if (CALL !== c) return;
    const st = pc.connectionState;
    if (st === 'connected') { if (!c.startedAt) { c.startedAt = Date.now(); c.state = 'active'; c.tick = setInterval(updateCallUI, 1000); callState(); } c.note = ''; ringStop(); }
    else if (st === 'disconnected') { c.note = 'اتصال ضعیف شد…'; try { pc.restartIce(); } catch {} }
    else if (st === 'failed') {
      if (!c.retried) { c.retried = true; c.note = 'در حال تلاش دوباره…'; try { pc.restartIce(); } catch {} }
      else { toast('اتصال صدا و تصویر برقرار نشد. ممکنه شبکه‌ی یکی از شما مانع شده باشه.', true); hangUp(); return; }
    }
    updateCallUI();
  };
  if (c.role === 'caller') {
    const a = pc.addTransceiver('audio', { direction: 'sendrecv' });
    const v = pc.addTransceiver('video', { direction: 'sendrecv' });
    a.sender.replaceTrack(c.mic);
    v.sender.replaceTrack(c.screen || c.cam || null);
    c.attached = true;
  }
}
// طرف پاسخ‌دهنده: بعد از دریافت offer، رسانه‌ی خودش را روی همان transceiverها می‌گذارد
function attachLocal(c) {
  if (c.attached) return; c.attached = true;
  for (const t of c.pc.getTransceivers()) {
    const kind = t.receiver.track.kind;
    t.direction = 'sendrecv';
    t.sender.replaceTrack(kind === 'audio' ? c.mic : (c.screen || c.cam || null));
  }
}
function handleSignal(c, { desc, cand }) {
  c.chain = c.chain.then(async () => {
    const pc = c.pc; if (!pc || CALL !== c) return;
    try {
      if (desc) {
        const collision = desc.type === 'offer' && (c.making || pc.signalingState !== 'stable');
        c.ignore = !c.polite && collision;
        if (c.ignore) return;
        await pc.setRemoteDescription(desc);
        if (desc.type === 'offer') {
          attachLocal(c);
          await pc.setLocalDescription();
          callData({ desc: pc.localDescription.toJSON() });
          callState();
        }
      } else if (cand) {
        try { await pc.addIceCandidate(cand); } catch (e) { if (!c.ignore) throw e; }
      }
    } catch (e) { console.warn('signal', e); }
  });
}
const videoSender = (c) => c.pc?.getTransceivers().find((t) => t.receiver.track.kind === 'video')?.sender;

function toggleMic() {
  const c = CALL; if (!c?.mic) return;
  c.micOn = !c.micOn; c.mic.enabled = c.micOn; callState(); updateCallUI();
}
async function toggleCam() {
  const c = CALL; if (!c || !c.pc) return;
  try {
    if (c.cam) {
      c.cam.stop(); c.cam = null;
      if (!c.screen) await videoSender(c)?.replaceTrack(null);
    } else {
      const s = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } });
      c.cam = s.getVideoTracks()[0];
      if (!c.screen) await videoSender(c)?.replaceTrack(c.cam);
    }
  } catch (e) { toast(e.name === 'NotAllowedError' ? 'اجازه‌ی دوربین داده نشد.' : 'دوربین در دسترس نیست.', true); }
  callState(); updateCallUI();
}
async function toggleScreen() {
  const c = CALL; if (!c || !c.pc) return;
  if (c.screen) return stopScreen();
  if (!navigator.mediaDevices?.getDisplayMedia) return toast('این مرورگر یا دستگاه از اشتراک صفحه پشتیبانی نمی‌کند. روی کامپیوتر امتحان کن.', true);
  try {
    const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30 } }, audio: false });
    const t = s.getVideoTracks()[0]; t.contentHint = 'detail';
    t.onended = () => { if (CALL === c && c.screen === t) stopScreen(); };
    c.screen = t;
    await videoSender(c)?.replaceTrack(t);
    callState(); updateCallUI();
  } catch (e) { if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') toast('اشتراک صفحه شروع نشد.', true); }
}
async function stopScreen() {
  const c = CALL; if (!c?.screen) return;
  c.screen.onended = null; c.screen.stop(); c.screen = null;
  try { await videoSender(c)?.replaceTrack(c.cam || null); } catch {}
  callState(); updateCallUI();
}

function callCleanup() {
  const c = CALL; CALL = null;
  ringStop();
  $('#call')?.remove(); $('#call-incoming')?.remove();
  if (!c) return;
  clearInterval(c.tick);
  for (const t of [c.mic, c.cam, c.screen]) { try { if (t) { t.onended = null; t.stop(); } } catch {} }
  try { c.pc?.close(); } catch {}
}

function onCallEvent(d) {
  const { op } = d;
  if (op === 'incoming') {
    if (CALL) return; // سرور خودش «مشغول» را برمی‌گرداند
    const chat = S.chats.get(d.chat_id);
    CALL = newCall({ id: d.call_id, chatId: d.chat_id, role: 'callee', video: !!d.video, peerUser: chat ? otherOf(chat) : d.from, state: 'incoming' });
    renderIncoming(d.from);
    ringStart(true);
    if (document.hidden && S.settings.notify && 'Notification' in window && Notification.permission === 'granted') {
      try { const n = new Notification(d.from.display_name, { body: d.video ? 'تماس تصویری ورودی' : 'تماس صوتی ورودی', icon: '/icon.svg', tag: 'call', requireInteraction: true, lang: 'fa', dir: 'rtl' }); n.onclick = () => { window.focus(); n.close(); }; } catch {}
    }
    return;
  }
  const c = CALL; if (!c || c.id !== d.call_id) return;
  if (op === 'accepted' && c.role === 'caller') {
    ringStop(); c.state = 'connecting';
    fetchIce().then((ice) => { if (CALL !== c) return; c.ice = ice; setupPeer(c); callState(); updateCallUI(); });
  } else if (op === 'taken') { toast('تماس روی دستگاه دیگرت پاسخ داده شد.'); callCleanup(); }
  else if (op === 'signal') handleSignal(c, d.data);
  else if (op === 'state') { c.peer = { ...c.peer, ...d.data }; updateCallUI(); }
  else if (op === 'ended') {
    const r = d.reason;
    const dur = c.startedAt ? ' · ' + fmtDur((Date.now() - c.startedAt) / 1000) : '';
    let text = CALL_TEXT[r] || CALL_TEXT.ended;
    if (r === 'missed' && c.role === 'callee') text = 'تماس از دست رفت.';
    if (r === 'rejected' && c.role === 'callee') text = 'تماس لغو شد.';
    if (r === 'ended' && c.startedAt) text = 'تماس تمام شد' + dur;
    callCleanup(); toast(text, r === 'unavailable' || r === 'busy'); blip('out');
  }
}

/* ───── رابط تماس ───── */
function renderIncoming(from) {
  $('#call-incoming')?.remove();
  const u = from || {};
  const box = el('div', 'overlay');
  box.id = 'call-incoming'; box.style.zIndex = 150;
  box.innerHTML = `<div class="modal call-in" role="alertdialog" aria-label="تماس ورودی"><div class="call-in-body">
    <div class="ring-av">${avatarHTML(u, 'xl')}</div><h2>${esc(u.display_name || 'کاربر')}</h2>
    <p class="muted">${CALL.video ? 'تماس تصویری ورودی…' : 'تماس صوتی ورودی…'}</p>
    <div class="call-in-actions"><button class="call-btn hang" id="ci-no" aria-label="رد تماس">${icon('call')}</button><button class="call-btn ok" id="ci-yes" aria-label="پاسخ">${icon(CALL.video ? 'video' : 'call')}</button></div></div></div>`;
  document.body.append(box);
  $('#ci-no').onclick = () => { box.remove(); declineCall(); };
  $('#ci-yes').onclick = () => { box.remove(); acceptCall(); };
  $('#ci-yes').focus();
}
function renderCallUI() {
  $('#call')?.remove();
  const c = CALL; if (!c) return;
  const canShare = !!navigator.mediaDevices?.getDisplayMedia;
  const root = el('div', 'call');
  root.id = 'call';
  root.innerHTML = `<video id="call-remote" autoplay playsinline></video>
    <div class="call-center" id="call-center"><div class="ring-av">${avatarHTML(c.peerUser || {}, 'xl')}</div><h2>${esc((c.peerUser || {}).display_name || '')}</h2></div>
    <div class="call-top"><b>${esc((c.peerUser || {}).display_name || '')}</b><span id="call-status"></span></div>
    <video id="call-local" class="pip" autoplay playsinline muted></video>
    <div class="call-bar">
      <button class="call-btn" id="cb-mic" aria-label="میکروفون"></button>
      <button class="call-btn" id="cb-cam" aria-label="دوربین"></button>
      ${canShare ? '<button class="call-btn" id="cb-scr" aria-label="اشتراک صفحه"></button>' : ''}
      <button class="call-btn hang" id="cb-end" aria-label="پایان تماس">${icon('call')}</button>
    </div>`;
  document.body.append(root);
  $('#cb-mic').onclick = toggleMic; $('#cb-cam').onclick = toggleCam; $('#cb-scr')?.addEventListener('click', toggleScreen); $('#cb-end').onclick = hangUp;
  const rv = $('#call-remote'); rv.srcObject = c.remote; rv.play?.().catch(() => {});
  updateCallUI();
}
function updateCallUI() {
  const c = CALL, root = $('#call'); if (!c || !root) return;
  const status = $('#call-status');
  status.textContent = c.state === 'ringing' ? 'در حال زنگ زدن…' : c.state === 'connecting' ? 'در حال اتصال…' : (c.note || (c.startedAt ? fmtDur((Date.now() - c.startedAt) / 1000) : 'در حال اتصال…'));
  const showRemote = c.peer.cam || c.peer.screen;
  root.classList.toggle('has-remote', !!showRemote);
  root.classList.toggle('contain', !!c.peer.screen);
  const local = c.screen || c.cam;
  const lv = $('#call-local');
  root.classList.toggle('has-local', !!local);
  if (lv) { const want = local ? new MediaStream([local]) : null; if ((lv.srcObject?.getVideoTracks?.()[0] || null) !== (local || null)) lv.srcObject = want; lv.classList.toggle('screen', !!c.screen); }
  const ready = !!c.pc;
  const set = (id, on, ic, label, off) => { const b = $(id); if (!b) return; b.classList.toggle('off', off); b.classList.toggle('on', on); b.disabled = !ready; b.innerHTML = icon(ic); b.setAttribute('aria-label', label); b.title = label; b.setAttribute('aria-pressed', on); };
  set('#cb-mic', !c.micOn, c.micOn ? 'mic' : 'mic-off', c.micOn ? 'بی‌صدا کردن میکروفون' : 'روشن کردن میکروفون', !c.micOn);
  set('#cb-cam', !!c.cam, c.cam ? 'video' : 'video-off', c.cam ? 'خاموش کردن دوربین' : 'روشن کردن دوربین', !c.cam);
  set('#cb-scr', !!c.screen, 'screen', c.screen ? 'توقف اشتراک صفحه' : 'اشتراک صفحه', false);
  if (c.screen) $('#cb-scr')?.classList.add('on');
}

boot();
