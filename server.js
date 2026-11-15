// پیک — سرور پیام‌رسان
// Express + WebSocket + SQLite (node:sqlite) | بدون وابستگی به سرویس خارجی
import express from 'express';
import { WebSocketServer } from 'ws';
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const SESSION_DAYS = 30;
const MAX_UPLOAD = 15 * 1024 * 1024;
const MAX_AVATAR = 3 * 1024 * 1024;
const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '👏'];

/* ───────────── پایگاه داده ───────────── */
const db = new DatabaseSync(path.join(DATA_DIR, 'payk.db'));
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  pass_hash TEXT NOT NULL,
  recovery_hash TEXT NOT NULL,
  avatar TEXT,
  bio TEXT NOT NULL DEFAULT '',
  settings TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions(
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS chats(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  name TEXT,
  owner_id INTEGER,
  dm_key TEXT UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS chat_members(
  chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  last_read_id INTEGER NOT NULL DEFAULT 0,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY(chat_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_cm_user ON chat_members(user_id);
CREATE TABLE IF NOT EXISTS messages(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  file TEXT,
  file_name TEXT,
  file_size INTEGER,
  file_mime TEXT,
  duration REAL,
  reply_to INTEGER,
  edited_at INTEGER,
  deleted INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_msg_chat ON messages(chat_id, id);
CREATE TABLE IF NOT EXISTS reactions(
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL,
  emoji TEXT NOT NULL,
  PRIMARY KEY(message_id, user_id)
);
CREATE TABLE IF NOT EXISTS uploads(
  name TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  orig_name TEXT,
  created_at INTEGER NOT NULL
);
`);

const q = (sql) => db.prepare(sql);
const tx = (fn) => {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
};

/* ───────────── ابزارهای امنیتی ───────────── */
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

async function hashSecret(secret) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(secret, salt, 64);
  return salt.toString('hex') + ':' + key.toString('hex');
}
async function verifySecret(secret, stored) {
  const [saltHex, keyHex] = String(stored).split(':');
  const key = await scrypt(secret, Buffer.from(saltHex, 'hex'), 64);
  const expected = Buffer.from(keyHex, 'hex');
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}
const DUMMY_HASH = await hashSecret('dummy-password-for-timing');

const RC_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeRecoveryCode() {
  const bytes = crypto.randomBytes(16);
  let s = '';
  for (let i = 0; i < 16; i++) s += RC_ALPHABET[bytes[i] % RC_ALPHABET.length];
  return s.match(/.{4}/g).join('-');
}
const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const rateBuckets = new Map();
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  let b = rateBuckets.get(key);
  if (!b || b.reset < now) { b = { count: 0, reset: now + windowMs }; rateBuckets.set(key, b); }
  b.count++;
  return b.count <= max;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of rateBuckets) if (b.reset < now) rateBuckets.delete(k);
  q('DELETE FROM sessions WHERE expires_at < ?').run(now);
}, 10 * 60 * 1000).unref();

function parseCookies(h = '') {
  const out = {};
  for (const part of h.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function createSession(res, req, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  q('INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)')
    .run(sha(token), userId, now, now + SESSION_DAYS * 864e5);
  const flags = ['HttpOnly', 'SameSite=Lax', 'Path=/', `Max-Age=${SESSION_DAYS * 86400}`];
  if (req.secure) flags.push('Secure');
  res.setHeader('Set-Cookie', `sid=${token}; ${flags.join('; ')}`);
}
function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
}
function sessionUser(cookieHeader) {
  const sid = parseCookies(cookieHeader).sid;
  if (!sid) return null;
  const row = q('SELECT user_id, expires_at FROM sessions WHERE token_hash=?').get(sha(sid));
  if (!row || row.expires_at < Date.now()) return null;
  return row.user_id;
}

/* ───────────── اعتبارسنجی ───────────── */
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F‪-‮⁦-⁩]/g, '').trim().slice(0, max);
const fail = (res, code, error) => res.status(code).json({ error });

function checkPassword(p) {
  if (typeof p !== 'string' || p.length < 8) return 'رمز عبور باید حداقل ۸ کاراکتر باشد.';
  if (p.length > 128) return 'رمز عبور خیلی طولانی است.';
  if (/^\d+$/.test(p)) return 'رمز عبور نباید فقط عدد باشد.';
  return null;
}

/* ───────────── حضور آنلاین و وب‌سوکت ───────────── */
const sockets = new Map(); // userId -> Set<ws>
const isOnline = (id) => (sockets.get(id)?.size || 0) > 0;

function sendTo(userId, event, payload) {
  const set = sockets.get(userId);
  if (!set) return;
  const data = JSON.stringify({ event, ...payload });
  for (const ws of set) if (ws.readyState === 1) ws.send(data);
}
const memberIds = (chatId) => q('SELECT user_id FROM chat_members WHERE chat_id=?').all(chatId).map((r) => r.user_id);
function emitChat(chatId, event, payload, exceptUid) {
  for (const uid of memberIds(chatId)) if (uid !== exceptUid) sendTo(uid, event, payload);
}
function contactIds(uid) {
  return q(`SELECT DISTINCT user_id FROM chat_members WHERE chat_id IN (SELECT chat_id FROM chat_members WHERE user_id=?) AND user_id!=?`)
    .all(uid, uid).map((r) => r.user_id);
}

/* ───────────── مدل‌ها ───────────── */
const userPublic = (u) => ({
  id: u.id, username: u.username, display_name: u.display_name, avatar: u.avatar || null,
  bio: u.bio || '', last_seen: u.last_seen, online: isOnline(u.id),
});
const getUser = (id) => q('SELECT * FROM users WHERE id=?').get(id);
const isMember = (chatId, uid) => !!q('SELECT 1 x FROM chat_members WHERE chat_id=? AND user_id=?').get(chatId, uid);

function messageOut(m) {
  const rs = q('SELECT emoji, user_id FROM reactions WHERE message_id=?').all(m.id);
  const grouped = {};
  for (const r of rs) (grouped[r.emoji] ||= []).push(r.user_id);
  let reply = null;
  if (m.reply_to) {
    const r = q('SELECT id, sender_id, type, body, deleted FROM messages WHERE id=?').get(m.reply_to);
    if (r) reply = { id: r.id, sender_id: r.sender_id, type: r.type, deleted: !!r.deleted, body: r.deleted ? '' : r.body.slice(0, 140) };
  }
  return {
    id: m.id, chat_id: m.chat_id, sender_id: m.sender_id, type: m.type,
    body: m.deleted ? '' : m.body,
    file: m.deleted ? null : m.file, file_name: m.file_name, file_size: m.file_size, file_mime: m.file_mime,
    duration: m.duration, reply, edited: !!m.edited_at, deleted: !!m.deleted, created_at: m.created_at,
    reactions: Object.entries(grouped).map(([emoji, users]) => ({ emoji, users })),
  };
}

function chatOut(chatId, uid) {
  const c = q('SELECT * FROM chats WHERE id=?').get(chatId);
  if (!c) return null;
  const members = q(`SELECT u.id,u.username,u.display_name,u.avatar,u.bio,u.last_seen,cm.role,cm.last_read_id
    FROM chat_members cm JOIN users u ON u.id=cm.user_id WHERE cm.chat_id=? ORDER BY cm.joined_at`).all(chatId)
    .map((m) => ({ ...m, online: isOnline(m.id) }));
  const mine = members.find((m) => m.id === uid);
  if (!mine) return null;
  const last = q('SELECT * FROM messages WHERE chat_id=? ORDER BY id DESC LIMIT 1').get(chatId);
  const unread = q(`SELECT COUNT(*) n FROM messages WHERE chat_id=? AND id>? AND sender_id!=? AND deleted=0 AND type!='system'`)
    .get(chatId, mine.last_read_id, uid).n;
  return {
    id: c.id, type: c.type, name: c.name, owner_id: c.owner_id, created_at: c.created_at,
    members, unread, last_message: last ? messageOut(last) : null,
  };
}

function addMessage(chatId, senderId, fields) {
  const m = {
    type: 'text', body: '', file: null, file_name: null, file_size: null, file_mime: null,
    duration: null, reply_to: null, ...fields,
  };
  const wasEmpty = !q('SELECT 1 x FROM messages WHERE chat_id=? LIMIT 1').get(chatId);
  const info = q(`INSERT INTO messages(chat_id,sender_id,type,body,file,file_name,file_size,file_mime,duration,reply_to,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
    .run(chatId, senderId, m.type, m.body, m.file, m.file_name, m.file_size, m.file_mime, m.duration, m.reply_to, Date.now());
  const row = q('SELECT * FROM messages WHERE id=?').get(info.lastInsertRowid);
  const out = messageOut(row);
  // اولین پیام یک گفتگوی خصوصی: برای طرف مقابل گفتگو تازه ساخته می‌شود
  if (wasEmpty) for (const uid of memberIds(chatId)) if (uid !== senderId) sendTo(uid, 'chat:new', { chat: chatOut(chatId, uid) });
  emitChat(chatId, 'message:new', { message: out });
  return out;
}

/* ───────────── اپلیکیشن ───────────── */
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), geolocation=(), microphone=(self), display-capture=(self)');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; " +
    "script-src 'self'; connect-src 'self' ws: wss:; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  next();
});

// جلوگیری از درخواست‌های مشکوک بین‌سایتی
app.use('/api', (req, res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origin = req.headers.origin;
    if (origin) {
      try { if (new URL(origin).host !== req.headers.host) return fail(res, 403, 'درخواست نامعتبر است.'); }
      catch { return fail(res, 403, 'درخواست نامعتبر است.'); }
    }
  }
  next();
});

const auth = (req, res, next) => {
  const uid = sessionUser(req.headers.cookie);
  if (!uid) return fail(res, 401, 'ابتدا وارد حساب خود شوید.');
  req.uid = uid;
  next();
};

/* آپلود فایل (بدنه‌ی خام) */
const MIME_EXT = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif',
  'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav',
  'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/x-wav': 'wav',
};
// فقط ویس و عکس پروفایل قابل آپلود است
const KIND_RULES = {
  avatar: (m) => m.startsWith('image/') && MIME_EXT[m],
  voice: (m) => m.startsWith('audio/') && MIME_EXT[m],
};
app.post('/api/upload', auth, express.raw({ type: () => true, limit: MAX_UPLOAD }), (req, res) => {
  if (!rateLimit('up:' + req.uid, 60, 10 * 60 * 1000)) return fail(res, 429, 'تعداد آپلودها زیاد است؛ کمی صبر کنید.');
  const kind = String(req.query.kind || '');
  const rule = KIND_RULES[kind];
  if (!rule) return fail(res, 400, 'نوع فایل نامعتبر است.');
  const body = req.body;
  if (!Buffer.isBuffer(body) || !body.length) return fail(res, 400, 'فایلی دریافت نشد.');
  if (kind === 'avatar' && body.length > MAX_AVATAR) return fail(res, 413, 'حجم عکس پروفایل حداکثر ۳ مگابایت است.');
  const mime = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (!rule(mime)) return fail(res, 415, 'قالب این فایل برای این بخش پشتیبانی نمی‌شود.');
  const origName = clean(String(req.query.name || 'file'), 120).replace(/[\\/]/g, '_') || 'file';
  let ext = MIME_EXT[mime];
  if (!ext) ext = (origName.split('.').pop() || 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 8).toLowerCase() || 'bin';
  const name = crypto.randomBytes(18).toString('base64url') + '.' + ext;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), body);
  const storedMime = MIME_EXT[mime] ? mime : 'application/octet-stream';
  q('INSERT INTO uploads(name,user_id,mime,size,orig_name,created_at) VALUES(?,?,?,?,?,?)')
    .run(name, req.uid, storedMime, body.length, origName, Date.now());
  res.json({ file: name, name: origName, size: body.length, mime: storedMime });
});

/* دانلود/نمایش فایل (فقط کاربران واردشده) */
app.get('/files/:name', auth, (req, res) => {
  const row = q('SELECT * FROM uploads WHERE name=?').get(req.params.name);
  if (!row) return res.status(404).end();
  const full = path.join(UPLOAD_DIR, row.name);
  if (!fs.existsSync(full)) return res.status(404).end();
  const inline = row.mime !== 'application/octet-stream';
  res.setHeader('Content-Type', row.mime);
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  const encoded = encodeURIComponent(row.orig_name || row.name);
  res.setHeader('Content-Disposition', `${inline && !req.query.dl ? 'inline' : 'attachment'}; filename*=UTF-8''${encoded}`);
  res.sendFile(full, { headers: {}, dotfiles: 'allow' });
});

app.use('/api', express.json({ limit: '64kb' }));

/* ───────────── حساب کاربری ───────────── */
app.post('/api/signup', async (req, res) => {
  try {
    if (!rateLimit('signup:' + req.ip, 10, 60 * 60 * 1000)) return fail(res, 429, 'تعداد تلاش‌ها زیاد است؛ بعداً دوباره امتحان کنید.');
    const username = clean(req.body.username, 20).toLowerCase();
    const display = clean(req.body.display_name, 40) || username;
    const password = req.body.password;
    if (!USERNAME_RE.test(username)) return fail(res, 400, 'نام کاربری باید ۳ تا ۲۰ حرف انگلیسی، عدد یا خط‌زیر (_) باشد.');
    const pwErr = checkPassword(password);
    if (pwErr) return fail(res, 400, pwErr);
    if (q('SELECT 1 x FROM users WHERE username=?').get(username)) return fail(res, 409, 'این نام کاربری قبلاً گرفته شده است.');
    const recovery = makeRecoveryCode();
    const [passHash, recHash] = await Promise.all([hashSecret(password), hashSecret(normCode(recovery))]);
    const now = Date.now();
    const info = q('INSERT INTO users(username,display_name,pass_hash,recovery_hash,created_at,last_seen) VALUES(?,?,?,?,?,?)')
      .run(username, display, passHash, recHash, now, now);
    createSession(res, req, info.lastInsertRowid);
    res.json({ user: { ...userPublic(getUser(info.lastInsertRowid)), settings: {} }, recovery_code: recovery });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return fail(res, 409, 'این نام کاربری قبلاً گرفته شده است.');
    console.error(e); fail(res, 500, 'مشکلی پیش آمد.');
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const username = clean(req.body.username, 20).toLowerCase();
    const password = String(req.body.password ?? '');
    if (!rateLimit(`login:${req.ip}:${username}`, 8, 10 * 60 * 1000) || !rateLimit('login-ip:' + req.ip, 40, 10 * 60 * 1000))
      return fail(res, 429, 'تلاش‌های ناموفق زیاد بود؛ چند دقیقه بعد دوباره امتحان کنید.');
    const u = q('SELECT * FROM users WHERE username=?').get(username);
    const ok = await verifySecret(password, u ? u.pass_hash : DUMMY_HASH);
    if (!u || !ok) return fail(res, 401, 'نام کاربری یا رمز عبور درست نیست.');
    createSession(res, req, u.id);
    res.json({ user: { ...userPublic(u), settings: JSON.parse(u.settings || '{}') } });
  } catch (e) { console.error(e); fail(res, 500, 'مشکلی پیش آمد.'); }
});

app.post('/api/recover', async (req, res) => {
  try {
    const username = clean(req.body.username, 20).toLowerCase();
    const code = normCode(req.body.code);
    const password = req.body.password;
    if (!rateLimit(`recover:${req.ip}:${username}`, 5, 30 * 60 * 1000) || !rateLimit('recover-ip:' + req.ip, 20, 60 * 60 * 1000))
      return fail(res, 429, 'تلاش‌های ناموفق زیاد بود؛ بعداً دوباره امتحان کنید.');
    const pwErr = checkPassword(password);
    if (pwErr) return fail(res, 400, pwErr);
    const u = q('SELECT * FROM users WHERE username=?').get(username);
    const ok = await verifySecret(code, u ? u.recovery_hash : DUMMY_HASH);
    if (!u || !ok) return fail(res, 401, 'نام کاربری یا کد بازیابی درست نیست.');
    const newRecovery = makeRecoveryCode();
    const [passHash, recHash] = await Promise.all([hashSecret(password), hashSecret(normCode(newRecovery))]);
    tx(() => {
      q('UPDATE users SET pass_hash=?, recovery_hash=? WHERE id=?').run(passHash, recHash, u.id);
      q('DELETE FROM sessions WHERE user_id=?').run(u.id);
    });
    createSession(res, req, u.id);
    res.json({ user: { ...userPublic(getUser(u.id)), settings: JSON.parse(u.settings || '{}') }, recovery_code: newRecovery });
  } catch (e) { console.error(e); fail(res, 500, 'مشکلی پیش آمد.'); }
});

app.post('/api/logout', (req, res) => {
  const sid = parseCookies(req.headers.cookie).sid;
  if (sid) q('DELETE FROM sessions WHERE token_hash=?').run(sha(sid));
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get('/api/me', auth, (req, res) => {
  const u = getUser(req.uid);
  res.json({ user: { ...userPublic(u), settings: JSON.parse(u.settings || '{}'), created_at: u.created_at }, reactions: REACTIONS });
});

app.patch('/api/me', auth, (req, res) => {
  const u = getUser(req.uid);
  const display = req.body.display_name !== undefined ? clean(req.body.display_name, 40) : u.display_name;
  if (!display) return fail(res, 400, 'نام نمایشی نمی‌تواند خالی باشد.');
  const bio = req.body.bio !== undefined ? clean(req.body.bio, 160) : u.bio;
  let avatar = u.avatar;
  if (req.body.avatar !== undefined) {
    if (req.body.avatar === null) avatar = null;
    else {
      const up = q('SELECT * FROM uploads WHERE name=? AND user_id=?').get(String(req.body.avatar), req.uid);
      if (!up || !up.mime.startsWith('image/')) return fail(res, 400, 'عکس پروفایل نامعتبر است.');
      avatar = up.name;
    }
  }
  q('UPDATE users SET display_name=?, bio=?, avatar=? WHERE id=?').run(display, bio, avatar, req.uid);
  const out = userPublic(getUser(req.uid));
  for (const cid of contactIds(req.uid)) sendTo(cid, 'user:update', { user: out });
  sendTo(req.uid, 'user:update', { user: out, self: true });
  res.json({ user: out });
});

app.put('/api/me/settings', auth, (req, res) => {
  const s = req.body.settings;
  if (!s || typeof s !== 'object' || Array.isArray(s)) return fail(res, 400, 'تنظیمات نامعتبر است.');
  const json = JSON.stringify(s);
  if (json.length > 4096) return fail(res, 400, 'تنظیمات خیلی بزرگ است.');
  q('UPDATE users SET settings=? WHERE id=?').run(json, req.uid);
  res.json({ ok: true });
});

app.post('/api/me/password', auth, async (req, res) => {
  try {
    if (!rateLimit('pw:' + req.uid, 8, 15 * 60 * 1000)) return fail(res, 429, 'تلاش‌های زیاد؛ بعداً امتحان کنید.');
    const u = getUser(req.uid);
    if (!(await verifySecret(String(req.body.current ?? ''), u.pass_hash))) return fail(res, 401, 'رمز عبور فعلی درست نیست.');
    const err = checkPassword(req.body.password);
    if (err) return fail(res, 400, err);
    const hash = await hashSecret(req.body.password);
    const keep = sha(parseCookies(req.headers.cookie).sid || '');
    q('UPDATE users SET pass_hash=? WHERE id=?').run(hash, req.uid);
    q('DELETE FROM sessions WHERE user_id=? AND token_hash!=?').run(req.uid, keep);
    res.json({ ok: true });
  } catch (e) { console.error(e); fail(res, 500, 'مشکلی پیش آمد.'); }
});

app.post('/api/me/recovery', auth, async (req, res) => {
  try {
    if (!rateLimit('rc:' + req.uid, 8, 15 * 60 * 1000)) return fail(res, 429, 'تلاش‌های زیاد؛ بعداً امتحان کنید.');
    const u = getUser(req.uid);
    if (!(await verifySecret(String(req.body.password ?? ''), u.pass_hash))) return fail(res, 401, 'رمز عبور درست نیست.');
    const code = makeRecoveryCode();
    q('UPDATE users SET recovery_hash=? WHERE id=?').run(await hashSecret(normCode(code)), req.uid);
    res.json({ recovery_code: code });
  } catch (e) { console.error(e); fail(res, 500, 'مشکلی پیش آمد.'); }
});

app.delete('/api/me', auth, async (req, res) => {
  try {
    const u = getUser(req.uid);
    if (!(await verifySecret(String(req.body.password ?? ''), u.pass_hash))) return fail(res, 401, 'رمز عبور درست نیست.');
    const chats = q('SELECT chat_id FROM chat_members WHERE user_id=?').all(req.uid).map((r) => r.chat_id);
    const files = q('SELECT name FROM uploads WHERE user_id=?').all(req.uid).map((r) => r.name);
    tx(() => {
      q('DELETE FROM messages WHERE sender_id=?').run(req.uid);
      q('DELETE FROM reactions WHERE user_id=?').run(req.uid);
      q('DELETE FROM chats WHERE owner_id=? AND type=\'dm\'').run(req.uid);
      q('DELETE FROM uploads WHERE user_id=?').run(req.uid);
      q('DELETE FROM users WHERE id=?').run(req.uid);
    });
    for (const f of files) fs.rm(path.join(UPLOAD_DIR, f), { force: true }, () => {});
    for (const cid of chats) {
      if (q('SELECT 1 x FROM chats WHERE id=?').get(cid)) emitChat(cid, 'chat:update', { chat_id: cid });
    }
    sockets.get(req.uid)?.forEach((w) => w.close());
    clearSessionCookie(res);
    res.json({ ok: true });
  } catch (e) { console.error(e); fail(res, 500, 'مشکلی پیش آمد.'); }
});

/* ───────────── کاربران ───────────── */
app.get('/api/users/search', auth, (req, res) => {
  const term = clean(req.query.q, 40).toLowerCase().replace(/^@/, '');
  if (!term) return res.json({ users: [] });
  const esc = term.replace(/[\\%_]/g, (c) => '\\' + c);
  const rows = q(`SELECT * FROM users WHERE id!=? AND (username LIKE ? ESCAPE '\\' OR lower(display_name) LIKE ? ESCAPE '\\')
    ORDER BY (username=?) DESC, length(username) LIMIT 20`).all(req.uid, esc + '%', '%' + esc + '%', term);
  res.json({ users: rows.map(userPublic) });
});

/* ───────────── گفتگوها ───────────── */
app.get('/api/chats', auth, (req, res) => {
  const ids = q(`SELECT c.id FROM chats c JOIN chat_members cm ON cm.chat_id=c.id AND cm.user_id=?
    WHERE c.type='group' OR c.owner_id=? OR EXISTS(SELECT 1 FROM messages m WHERE m.chat_id=c.id)`).all(req.uid, req.uid);
  const chats = ids.map((r) => chatOut(r.id, req.uid)).filter(Boolean);
  chats.sort((a, b) => (b.last_message?.created_at ?? b.created_at) - (a.last_message?.created_at ?? a.created_at));
  res.json({ chats });
});

app.post('/api/chats/dm', auth, (req, res) => {
  const other = q('SELECT * FROM users WHERE username=?').get(clean(req.body.username, 20).toLowerCase());
  if (!other) return fail(res, 404, 'کاربری با این نام پیدا نشد.');
  if (other.id === req.uid) return fail(res, 400, 'نمی‌توانید با خودتان گفتگو بسازید.');
  const key = [req.uid, other.id].sort((a, b) => a - b).join(':');
  let chat = q('SELECT * FROM chats WHERE dm_key=?').get(key);
  if (!chat) {
    tx(() => {
      const info = q('INSERT INTO chats(type,owner_id,dm_key,created_at) VALUES(\'dm\',?,?,?)').run(req.uid, key, Date.now());
      const now = Date.now();
      q('INSERT INTO chat_members(chat_id,user_id,joined_at) VALUES(?,?,?)').run(info.lastInsertRowid, req.uid, now);
      q('INSERT INTO chat_members(chat_id,user_id,joined_at) VALUES(?,?,?)').run(info.lastInsertRowid, other.id, now);
      chat = { id: info.lastInsertRowid };
    });
  }
  res.json({ chat: chatOut(chat.id, req.uid) });
});

app.post('/api/chats/group', auth, (req, res) => {
  const name = clean(req.body.name, 40);
  if (!name) return fail(res, 400, 'برای گروه یک نام بنویسید.');
  const usernames = Array.isArray(req.body.members) ? req.body.members.slice(0, 60).map((s) => clean(s, 20).toLowerCase()) : [];
  const users = [...new Set(usernames)].map((n) => q('SELECT id FROM users WHERE username=?').get(n)).filter((u) => u && u.id !== req.uid);
  if (!users.length) return fail(res, 400, 'حداقل یک عضو دیگر انتخاب کنید.');
  let chatId;
  tx(() => {
    const now = Date.now();
    const info = q('INSERT INTO chats(type,name,owner_id,created_at) VALUES(\'group\',?,?,?)').run(name, req.uid, now);
    chatId = info.lastInsertRowid;
    q('INSERT INTO chat_members(chat_id,user_id,role,joined_at) VALUES(?,?,\'owner\',?)').run(chatId, req.uid, now);
    for (const u of users) q('INSERT INTO chat_members(chat_id,user_id,joined_at) VALUES(?,?,?)').run(chatId, u.id, now);
  });
  addMessage(chatId, req.uid, { type: 'system', body: `گروه «${name}» ساخته شد.` });
  for (const uid of memberIds(chatId)) if (uid !== req.uid) sendTo(uid, 'chat:new', { chat: chatOut(chatId, uid) });
  res.json({ chat: chatOut(chatId, req.uid) });
});

app.patch('/api/chats/:id', auth, (req, res) => {
  const id = Number(req.params.id);
  const c = q('SELECT * FROM chats WHERE id=?').get(id);
  if (!c || !isMember(id, req.uid)) return fail(res, 404, 'گفتگو پیدا نشد.');
  if (c.type !== 'group' || c.owner_id !== req.uid) return fail(res, 403, 'فقط سازنده‌ی گروه می‌تواند آن را تغییر دهد.');
  const name = clean(req.body.name, 40);
  if (!name) return fail(res, 400, 'نام گروه نمی‌تواند خالی باشد.');
  q('UPDATE chats SET name=? WHERE id=?').run(name, id);
  addMessage(id, req.uid, { type: 'system', body: `نام گروه به «${name}» تغییر کرد.` });
  emitChat(id, 'chat:update', { chat_id: id });
  res.json({ chat: chatOut(id, req.uid) });
});

app.post('/api/chats/:id/members', auth, (req, res) => {
  const id = Number(req.params.id);
  const c = q('SELECT * FROM chats WHERE id=?').get(id);
  if (!c || !isMember(id, req.uid)) return fail(res, 404, 'گفتگو پیدا نشد.');
  if (c.type !== 'group' || c.owner_id !== req.uid) return fail(res, 403, 'فقط سازنده‌ی گروه می‌تواند عضو اضافه کند.');
  const u = q('SELECT * FROM users WHERE username=?').get(clean(req.body.username, 20).toLowerCase());
  if (!u) return fail(res, 404, 'کاربری با این نام پیدا نشد.');
  if (isMember(id, u.id)) return fail(res, 409, 'این کاربر از قبل عضو گروه است.');
  if (memberIds(id).length >= 100) return fail(res, 400, 'ظرفیت گروه تکمیل است.');
  q('INSERT INTO chat_members(chat_id,user_id,joined_at,last_read_id) VALUES(?,?,?,?)')
    .run(id, u.id, Date.now(), q('SELECT COALESCE(MAX(id),0) m FROM messages WHERE chat_id=?').get(id).m);
  addMessage(id, req.uid, { type: 'system', body: `${u.display_name} به گروه اضافه شد.` });
  sendTo(u.id, 'chat:new', { chat: chatOut(id, u.id) });
  emitChat(id, 'chat:update', { chat_id: id }, u.id);
  res.json({ chat: chatOut(id, req.uid) });
});

app.delete('/api/chats/:id/membership', auth, (req, res) => {
  const id = Number(req.params.id);
  const c = q('SELECT * FROM chats WHERE id=?').get(id);
  if (!c || !isMember(id, req.uid)) return fail(res, 404, 'گفتگو پیدا نشد.');
  if (c.type !== 'group') return fail(res, 400, 'از گفتگوی خصوصی نمی‌توان خارج شد.');
  const me = getUser(req.uid);
  q('DELETE FROM chat_members WHERE chat_id=? AND user_id=?').run(id, req.uid);
  const rest = q('SELECT user_id FROM chat_members WHERE chat_id=? ORDER BY joined_at').all(id);
  if (!rest.length) q('DELETE FROM chats WHERE id=?').run(id);
  else {
    if (c.owner_id === req.uid) {
      q('UPDATE chats SET owner_id=? WHERE id=?').run(rest[0].user_id, id);
      q('UPDATE chat_members SET role=\'owner\' WHERE chat_id=? AND user_id=?').run(id, rest[0].user_id);
    }
    addMessage(id, req.uid, { type: 'system', body: `${me.display_name} گروه را ترک کرد.` });
    emitChat(id, 'chat:update', { chat_id: id });
  }
  sendTo(req.uid, 'chat:remove', { chat_id: id });
  res.json({ ok: true });
});

app.get('/api/chats/:id/messages', auth, (req, res) => {
  const id = Number(req.params.id);
  if (!isMember(id, req.uid)) return fail(res, 404, 'گفتگو پیدا نشد.');
  const before = Number(req.query.before) || Number.MAX_SAFE_INTEGER;
  const limit = Math.min(Number(req.query.limit) || 40, 100);
  const rows = q('SELECT * FROM messages WHERE chat_id=? AND id<? ORDER BY id DESC LIMIT ?').all(id, before, limit + 1);
  const has_more = rows.length > limit;
  res.json({ messages: rows.slice(0, limit).reverse().map(messageOut), has_more });
});

app.get('/api/chats/:id/search', auth, (req, res) => {
  const id = Number(req.params.id);
  if (!isMember(id, req.uid)) return fail(res, 404, 'گفتگو پیدا نشد.');
  const term = clean(req.query.q, 60);
  if (term.length < 2) return res.json({ messages: [] });
  const esc = term.replace(/[\\%_]/g, (c) => '\\' + c);
  const rows = q(`SELECT * FROM messages WHERE chat_id=? AND deleted=0 AND type!='system' AND body LIKE ? ESCAPE '\\' ORDER BY id DESC LIMIT 40`)
    .all(id, '%' + esc + '%');
  res.json({ messages: rows.map(messageOut) });
});

app.post('/api/chats/:id/read', auth, (req, res) => {
  const id = Number(req.params.id);
  if (!isMember(id, req.uid)) return fail(res, 404, 'گفتگو پیدا نشد.');
  const upto = Number(req.body.upto) || 0;
  q('UPDATE chat_members SET last_read_id=MAX(last_read_id,?) WHERE chat_id=? AND user_id=?').run(upto, id, req.uid);
  const cur = q('SELECT last_read_id FROM chat_members WHERE chat_id=? AND user_id=?').get(id, req.uid).last_read_id;
  emitChat(id, 'read', { chat_id: id, user_id: req.uid, last_read_id: cur }, req.uid);
  res.json({ ok: true });
});

/* ───────────── پیام‌ها ───────────── */
app.post('/api/chats/:id/messages', auth, (req, res) => {
  const id = Number(req.params.id);
  if (!isMember(id, req.uid)) return fail(res, 404, 'گفتگو پیدا نشد.');
  if (!rateLimit('msg:' + req.uid, 120, 60 * 1000)) return fail(res, 429, 'خیلی سریع پیام می‌فرستید؛ کمی صبر کنید.');
  const type = String(req.body.type || 'text');
  if (!['text', 'voice'].includes(type)) return fail(res, 400, 'نوع پیام نامعتبر است.');
  const body = String(req.body.body ?? '').replace(/\u0000/g, '').trim().slice(0, 4000);
  const fields = { type, body };
  if (type === 'text') {
    if (!body) return fail(res, 400, 'پیام خالی است.');
  } else {
    const up = q('SELECT * FROM uploads WHERE name=? AND user_id=?').get(String(req.body.file || ''), req.uid);
    if (!up) return fail(res, 400, 'فایل پیدا نشد؛ دوباره آپلود کنید.');
    const okMime = up.mime.startsWith('audio/');
    if (!okMime) return fail(res, 400, 'نوع فایل با نوع پیام هم‌خوانی ندارد.');
    Object.assign(fields, { file: up.name, file_name: up.orig_name, file_size: up.size, file_mime: up.mime });
    if (type === 'voice') fields.duration = Math.max(0, Math.min(Number(req.body.duration) || 0, 3600));
  }
  if (req.body.reply_to) {
    const r = q('SELECT id FROM messages WHERE id=? AND chat_id=?').get(Number(req.body.reply_to), id);
    if (r) fields.reply_to = r.id;
  }
  const msg = addMessage(id, req.uid, fields);
  q('UPDATE chat_members SET last_read_id=MAX(last_read_id,?) WHERE chat_id=? AND user_id=?').run(msg.id, id, req.uid);
  res.json({ message: msg });
});

const ownMessage = (req, res) => {
  const m = q('SELECT * FROM messages WHERE id=?').get(Number(req.params.id));
  if (!m || !isMember(m.chat_id, req.uid)) { fail(res, 404, 'پیام پیدا نشد.'); return null; }
  return m;
};

app.patch('/api/messages/:id', auth, (req, res) => {
  const m = ownMessage(req, res); if (!m) return;
  if (m.sender_id !== req.uid || m.deleted || m.type === 'system' || m.type === 'voice') return fail(res, 403, 'این پیام قابل ویرایش نیست.');
  const body = String(req.body.body ?? '').trim().slice(0, 4000);
  if (!body && m.type === 'text') return fail(res, 400, 'پیام خالی است.');
  q('UPDATE messages SET body=?, edited_at=? WHERE id=?').run(body, Date.now(), m.id);
  const out = messageOut(q('SELECT * FROM messages WHERE id=?').get(m.id));
  emitChat(m.chat_id, 'message:update', { message: out });
  res.json({ message: out });
});

app.delete('/api/messages/:id', auth, (req, res) => {
  const m = ownMessage(req, res); if (!m) return;
  if (m.sender_id !== req.uid || m.type === 'system') return fail(res, 403, 'فقط پیام‌های خودتان را می‌توانید حذف کنید.');
  q('UPDATE messages SET deleted=1, body=\'\', edited_at=NULL WHERE id=?').run(m.id);
  q('DELETE FROM reactions WHERE message_id=?').run(m.id);
  if (m.file && !q('SELECT 1 x FROM messages WHERE file=? AND id!=? AND deleted=0').get(m.file, m.id)) {
    q('DELETE FROM uploads WHERE name=?').run(m.file);
    fs.rm(path.join(UPLOAD_DIR, m.file), { force: true }, () => {});
  }
  const out = messageOut(q('SELECT * FROM messages WHERE id=?').get(m.id));
  emitChat(m.chat_id, 'message:update', { message: out });
  res.json({ message: out });
});

app.post('/api/messages/:id/react', auth, (req, res) => {
  const m = ownMessage(req, res); if (!m) return;
  const emoji = String(req.body.emoji || '');
  if (!REACTIONS.includes(emoji) || m.deleted || m.type === 'system') return fail(res, 400, 'واکنش نامعتبر است.');
  const cur = q('SELECT emoji FROM reactions WHERE message_id=? AND user_id=?').get(m.id, req.uid);
  if (cur && cur.emoji === emoji) q('DELETE FROM reactions WHERE message_id=? AND user_id=?').run(m.id, req.uid);
  else q('INSERT OR REPLACE INTO reactions(message_id,user_id,emoji) VALUES(?,?,?)').run(m.id, req.uid, emoji);
  const out = messageOut(m);
  emitChat(m.chat_id, 'message:update', { message: out });
  res.json({ message: out });
});

/* تنظیمات ICE برای WebRTC: STUN همیشه، TURN اگر در محیط تنظیم شده باشد */
app.get('/api/ice', auth, (req, res) => {
  const list = (v) => String(v || '').split(',').map((x) => x.trim()).filter(Boolean);
  const stun = list(process.env.STUN_URLS);
  const iceServers = [{ urls: stun.length ? stun : ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  const turn = list(process.env.TURN_URLS);
  if (turn.length && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL)
    iceServers.push({ urls: turn, username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL });
  res.json({ iceServers });
});

app.use('/api', (req, res) => fail(res, 404, 'یافت نشد.'));

/* ───────────── فایل‌های ایستا ───────────── */
app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html'],
  setHeaders(res, p) {
    if (p.endsWith('.woff2')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    else if (p.endsWith('sw.js')) res.setHeader('Cache-Control', 'no-cache');
    else res.setHeader('Cache-Control', 'no-cache');
  },
}));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') return fail(res, 413, 'حجم فایل بیش از حد مجاز است (حداکثر ۱۵ مگابایت).');
  if (err.type === 'entity.parse.failed') return fail(res, 400, 'درخواست نامعتبر است.');
  console.error(err);
  fail(res, 500, 'مشکلی پیش آمد.');
});


/* ───────────── تماس (هماهنگی WebRTC) ───────────── */
const calls = new Map();      // callId -> call
const userCall = new Map();   // userId -> call
const RING_MS = 45000;
const DISCONNECT_GRACE = 10000;

function callSend(uid, payload, exceptWs) {
  const set = sockets.get(uid); if (!set) return;
  const data = JSON.stringify({ event: 'call', ...payload });
  for (const w of set) if (w !== exceptWs && w.readyState === 1) w.send(data);
}
const fmtDuration = (ms) => {
  const s = Math.max(1, Math.round(ms / 1000));
  const d = (n) => String(n).padStart(2, '0');
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return (h ? `${h}:${d(m)}:${d(r)}` : `${m}:${d(r)}`).replace(/\d/g, (x) => '۰۱۲۳۴۵۶۷۸۹'[x]);
};
function endCall(call, reason) {
  if (!calls.has(call.id)) return;
  calls.delete(call.id);
  clearTimeout(call.timer);
  for (const uid of [call.caller, call.callee]) {
    if (userCall.get(uid) === call) userCall.delete(uid);
    clearTimeout(call.grace?.[uid]);
  }
  const kind = call.video ? 'تصویری' : 'صوتی';
  let log;
  if (call.answeredAt) log = `تماس ${kind} · ${fmtDuration(Date.now() - call.answeredAt)}`;
  else if (reason === 'rejected') log = `تماس ${kind} رد شد`;
  else log = `تماس ${kind} بی‌پاسخ`;
  for (const uid of [call.caller, call.callee]) callSend(uid, { op: 'ended', call_id: call.id, chat_id: call.chat, reason });
  try { addMessage(call.chat, call.caller, { type: 'system', body: log }); } catch (e) { console.error(e); }
}
function otherParty(call, uid) { return call.caller === uid ? call.callee : call.caller; }

function handleCall(ws, d) {
  const uid = ws.uid;
  const op = String(d.op || '');
  const callId = String(d.call_id || '').slice(0, 64);
  if (!callId) return;

  if (op === 'invite') {
    if (!Number.isInteger(d.chat_id) || !rateLimit('invite:' + uid, 12, 60 * 1000)) return;
    const chat = q('SELECT * FROM chats WHERE id=?').get(d.chat_id);
    if (!chat || chat.type !== 'dm' || !isMember(chat.id, uid)) return;
    const peer = memberIds(chat.id).find((x) => x !== uid); if (!peer) return;
    const video = !!d.video;
    const call = { id: callId, chat: chat.id, caller: uid, callee: peer, video, answeredAt: 0, grace: {} };
    if (calls.has(callId) || userCall.has(uid)) return callSend(uid, { op: 'ended', call_id: callId, reason: 'busy' });
    if (userCall.has(peer)) { callSend(uid, { op: 'ended', call_id: callId, reason: 'busy' }); addMessage(chat.id, uid, { type: 'system', body: `تماس ${video ? 'تصویری' : 'صوتی'} بی‌پاسخ (مشغول)` }); return; }
    if (!isOnline(peer)) { callSend(uid, { op: 'ended', call_id: callId, reason: 'unavailable' }); addMessage(chat.id, uid, { type: 'system', body: `تماس ${video ? 'تصویری' : 'صوتی'} بی‌پاسخ` }); return; }
    calls.set(callId, call); userCall.set(uid, call); userCall.set(peer, call);
    call.timer = setTimeout(() => endCall(call, 'missed'), RING_MS);
    const me = getUser(uid);
    callSend(peer, { op: 'incoming', call_id: callId, chat_id: chat.id, video, from: { id: me.id, display_name: me.display_name, avatar: me.avatar || null, username: me.username } });
    return;
  }

  const call = calls.get(callId);
  if (!call || (call.caller !== uid && call.callee !== uid)) return;

  if (op === 'accept' && call.callee === uid && !call.answeredAt) {
    clearTimeout(call.timer);
    call.answeredAt = Date.now();
    callSend(call.caller, { op: 'accepted', call_id: callId });
    callSend(uid, { op: 'taken', call_id: callId }, ws); // دستگاه‌های دیگر کاربر دیگر زنگ نزنند
  } else if (op === 'reject' && call.callee === uid && !call.answeredAt) {
    endCall(call, 'rejected');
  } else if (op === 'end') {
    endCall(call, call.answeredAt ? 'ended' : (call.caller === uid ? 'missed' : 'rejected'));
  } else if ((op === 'signal' || op === 'state') && call.answeredAt) {
    const data = d.data;
    if (!data || typeof data !== 'object' || JSON.stringify(data).length > 60000) return;
    callSend(otherParty(call, uid), { op, call_id: callId, data });
  }
}

/* ───────────── وب‌سوکت ───────────── */
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true, maxPayload: 65536 });

server.on('upgrade', (req, socket, head) => {
  if (!req.url.startsWith('/ws')) return socket.destroy();
  const origin = req.headers.origin;
  if (origin) {
    try { if (new URL(origin).host !== req.headers.host) return socket.destroy(); } catch { return socket.destroy(); }
  }
  const uid = sessionUser(req.headers.cookie);
  if (!uid) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); return socket.destroy(); }
  wss.handleUpgrade(req, socket, head, (ws) => { ws.uid = uid; wss.emit('connection', ws); });
});

wss.on('connection', (ws) => {
  const uid = ws.uid;
  ws.isAlive = true;
  const wasOnline = isOnline(uid);
  if (!sockets.has(uid)) sockets.set(uid, new Set());
  sockets.get(uid).add(ws);
  const live = userCall.get(uid); if (live) clearTimeout(live.grace[uid]);
  if (!wasOnline) for (const c of contactIds(uid)) sendTo(c, 'presence', { user_id: uid, online: true });

  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (raw) => {
    let d; try { d = JSON.parse(raw); } catch { return; }
    if (d.t === 'call') return handleCall(ws, d);
    if (d.t === 'typing' && Number.isInteger(d.chat_id) && isMember(d.chat_id, uid)) {
      if (rateLimit(`typing:${uid}:${d.chat_id}`, 6, 5000)) emitChat(d.chat_id, 'typing', { chat_id: d.chat_id, user_id: uid }, uid);
    }
  });
  ws.on('close', () => {
    const set = sockets.get(uid);
    set?.delete(ws);
    if (set && !set.size) {
      sockets.delete(uid);
      const live = userCall.get(uid);
      if (live) live.grace[uid] = setTimeout(() => { if (!isOnline(uid)) endCall(live, 'disconnect'); }, DISCONNECT_GRACE);
      const now = Date.now();
      q('UPDATE users SET last_seen=? WHERE id=?').run(now, uid);
      for (const c of contactIds(uid)) sendTo(c, 'presence', { user_id: uid, online: false, last_seen: now });
    }
  });
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000).unref();

server.listen(PORT, () => console.log(`پیک روی پورت ${PORT} در حال اجراست → http://localhost:${PORT}`));

const shutdown = () => { try { db.close(); } catch {} process.exit(0); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
