const express = require('express');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Load .env manually (no dotenv dependency needed for simple case)
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
        const [key, ...val] = line.split('=');
        if (key && val.length) process.env[key.trim()] = val.join('=').trim();
    });
}

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'vacancies.json');

// No built-in fallback: a guessable default password would open the admin panel to anyone
if (!ADMIN_PASSWORD) {
    console.error('Не задан ADMIN_PASSWORD в файле .env — сервер не запущен. См. INSTALL.md, раздел 4.');
    process.exit(1);
}
if (ADMIN_PASSWORD.length < 10) {
    console.warn('Внимание: пароль админки короче 10 символов — задайте более надёжный в .env');
}

// Behind nginx: lets req.secure and req.ip reflect the original request (X-Forwarded-*)
app.set('trust proxy', 1);

app.use(express.json());
app.use(cookieParser());

// Static files are served from an allowlist, never the whole project folder:
// data/ (draft vacancies), .env, server.js and node_modules must stay unreachable,
// and a denylist can be bypassed with URL-encoded paths (/%64ata/...)
const PUBLIC_DIRS = ['css', 'js', 'fonts', 'images', 'docs'];
for (const dir of PUBLIC_DIRS) {
    app.use('/' + dir, express.static(path.join(__dirname, dir)));
}

// Top-level pages: only plain "name.html" (and "/" → index.html)
const PAGE_PATH = /^\/[A-Za-z0-9_-]+\.html$/;
const servePages = express.static(__dirname, { index: 'index.html' });
app.use((req, res, next) => {
    if (req.path === '/' || PAGE_PATH.test(req.path)) return servePages(req, res, next);
    next();
});

// --- Session ---
const SESSION_TTL = 24 * 60 * 60 * 1000;
const sessions = {};

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

// A token is valid only while it exists and has not outlived SESSION_TTL
function isValidSession(token) {
    const session = token && sessions[token];
    if (!session) return false;
    if (Date.now() - session.createdAt > SESSION_TTL) {
        delete sessions[token];
        return false;
    }
    return true;
}

// Drop expired sessions so the in-memory store does not grow forever
setInterval(() => {
    const now = Date.now();
    for (const [token, session] of Object.entries(sessions)) {
        if (now - session.createdAt > SESSION_TTL) delete sessions[token];
    }
}, 60 * 60 * 1000).unref();

function requireAuth(req, res, next) {
    if (isValidSession(req.cookies.session)) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
}

// --- Login rate limit: 5 failed attempts per IP per 15 minutes ---
const LOGIN_WINDOW = 15 * 60 * 1000;
const LOGIN_MAX_FAILS = 5;
const loginFails = new Map();

function tooManyLoginFails(ip) {
    const entry = loginFails.get(ip);
    if (!entry) return false;
    if (Date.now() - entry.first > LOGIN_WINDOW) {
        loginFails.delete(ip);
        return false;
    }
    return entry.count >= LOGIN_MAX_FAILS;
}

function registerLoginFail(ip) {
    const entry = loginFails.get(ip);
    if (!entry || Date.now() - entry.first > LOGIN_WINDOW) {
        loginFails.set(ip, { first: Date.now(), count: 1 });
    } else {
        entry.count++;
    }
}

// Constant-time comparison so the response time does not leak how much of the password matched
function passwordMatches(input) {
    if (typeof input !== 'string') return false;
    const a = crypto.createHash('sha256').update(input).digest();
    const b = crypto.createHash('sha256').update(ADMIN_PASSWORD).digest();
    return crypto.timingSafeEqual(a, b);
}

// --- Data helpers ---

// Writes to a temp file first and renames it, so an interrupted write never leaves a half-written file
function writeFileAtomic(file, content) {
    const tmp = file + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
    fs.writeFileSync(tmp, content, 'utf-8');
    fs.renameSync(tmp, file);
}

function writeJsonAtomic(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    writeFileAtomic(file, JSON.stringify(data, null, 2));
}

function readVacancies() {
    if (!fs.existsSync(DATA_FILE)) return [];
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
}

function writeVacancies(data) {
    writeJsonAtomic(DATA_FILE, data);
}

function generateId() {
    return 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

const VACANCY_STATUSES = ['published', 'draft', 'closed'];
const isString = v => typeof v === 'string';

// Checks the vacancy fields present in the request body.
// Returns { error } or { fields } with only the fields that were sent, trimmed.
function pickVacancyFields(body) {
    const fields = {};
    for (const key of ['title', 'subtitle', 'city']) {
        if (body[key] === undefined) continue;
        if (!isString(body[key])) return { error: `Поле «${key}» должно быть строкой` };
        fields[key] = body[key].trim();
    }
    if (body.sections !== undefined) {
        const ok = Array.isArray(body.sections) && body.sections.every(s => s && isString(s.title) && isString(s.body));
        if (!ok) return { error: 'Секции должны быть списком с заголовком и текстом' };
        fields.sections = body.sections.map(s => ({ title: s.title.trim(), body: s.body.trim() }));
    }
    if (body.tags !== undefined) {
        if (!Array.isArray(body.tags) || !body.tags.every(isString)) return { error: 'Теги должны быть списком строк' };
        fields.tags = body.tags.map(t => t.trim()).filter(Boolean);
    }
    if (body.status !== undefined) {
        if (!VACANCY_STATUSES.includes(body.status)) return { error: 'Неизвестный статус вакансии' };
        fields.status = body.status;
    }
    if (body.order !== undefined) {
        if (!Number.isInteger(body.order)) return { error: 'Порядок должен быть целым числом' };
        fields.order = body.order;
    }
    return { fields };
}

// --- Auth API ---
app.post('/api/login', (req, res) => {
    if (tooManyLoginFails(req.ip)) {
        return res.status(429).json({ message: 'Слишком много попыток входа. Попробуйте через 15 минут.' });
    }
    if (passwordMatches(req.body && req.body.password)) {
        loginFails.delete(req.ip);
        const token = generateToken();
        sessions[token] = { createdAt: Date.now() };
        res.cookie('session', token, { httpOnly: true, sameSite: 'strict', secure: req.secure, maxAge: SESSION_TTL });
        res.json({ success: true });
    } else {
        registerLoginFail(req.ip);
        res.status(401).json({ error: 'Wrong password' });
    }
});

app.post('/api/logout', (req, res) => {
    const token = req.cookies.session;
    if (token) delete sessions[token];
    res.clearCookie('session');
    res.json({ success: true });
});

app.get('/api/auth/check', (req, res) => {
    res.json({ authenticated: isValidSession(req.cookies.session) });
});

// --- Public API ---
app.get('/api/vacancies', (req, res) => {
    const vacancies = readVacancies();
    // Public: return only published, sorted by order
    const published = vacancies
        .filter(v => v.status === 'published')
        .sort((a, b) => a.order - b.order);
    res.json(published);
});

// --- Admin API ---
app.get('/api/admin/vacancies', requireAuth, (req, res) => {
    const vacancies = readVacancies().sort((a, b) => a.order - b.order);
    res.json(vacancies);
});

app.post('/api/admin/vacancies', requireAuth, (req, res) => {
    const { error, fields } = pickVacancyFields(req.body || {});
    if (error) return res.status(400).json({ message: error });

    const vacancies = readVacancies();
    const now = new Date().toISOString().split('T')[0];
    const newVac = {
        id: generateId(),
        title: '',
        subtitle: '',
        city: '',
        sections: [],
        tags: [],
        status: 'draft',
        ...fields,
        order: vacancies.length + 1,
        createdAt: now,
        updatedAt: now
    };
    vacancies.push(newVac);
    writeVacancies(vacancies);
    res.json(newVac);
});

app.put('/api/admin/vacancies/:id', requireAuth, (req, res) => {
    const { error, fields } = pickVacancyFields(req.body || {});
    if (error) return res.status(400).json({ message: error });

    const vacancies = readVacancies();
    const idx = vacancies.findIndex(v => v.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });

    Object.assign(vacancies[idx], fields);
    vacancies[idx].updatedAt = new Date().toISOString().split('T')[0];

    writeVacancies(vacancies);
    res.json(vacancies[idx]);
});

app.delete('/api/admin/vacancies/:id', requireAuth, (req, res) => {
    let vacancies = readVacancies();
    vacancies = vacancies.filter(v => v.id !== req.params.id);
    // Re-order
    vacancies.sort((a, b) => a.order - b.order).forEach((v, i) => v.order = i + 1);
    writeVacancies(vacancies);
    res.json({ success: true });
});

// Reorder
app.put('/api/admin/vacancies/:id/reorder', requireAuth, (req, res) => {
    const vacancies = readVacancies();
    const { direction } = req.body; // 'up' or 'down'
    vacancies.sort((a, b) => a.order - b.order);
    const idx = vacancies.findIndex(v => v.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= vacancies.length) return res.json({ success: false });

    const tmpOrder = vacancies[idx].order;
    vacancies[idx].order = vacancies[swapIdx].order;
    vacancies[swapIdx].order = tmpOrder;

    writeVacancies(vacancies);
    res.json({ success: true });
});

// --- Partners ---
const PARTNERS_FILE = path.join(DATA_DIR, 'partners.json');
const PARTNERS_HTML = path.join(__dirname, 'partners.html');
const LOGO_DIR = path.join(__dirname, 'images', 'partners-logo');
const LOGO_URL_PREFIX = 'images/partners-logo/';
const UPLOADED_LOGO_PREFIX = 'partner-';
const PARTNER_CATEGORIES = ['measuring', 'analytics', 'communications', 'fittings'];
const LOGO_TYPES = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };

function readPartners() {
    if (!fs.existsSync(PARTNERS_FILE)) return [];
    return JSON.parse(fs.readFileSync(PARTNERS_FILE, 'utf-8'));
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderPartnerCards(partners, eol) {
    const visible = partners.filter(p => p.visible).sort((a, b) => a.order - b.order);
    return visible.map((p, i) => {
        const logoClass = p.logoLarge ? 'partner-card__logo partner-card__logo--lg' : 'partner-card__logo';
        return [
            '',
            `            <a href="${escapeHtml(p.url)}" target="_blank" rel="noopener" class="partner-card" data-category="${escapeHtml(p.category)}" data-animate="fade-up" data-delay="${(i + 1) * 100}">`,
            `                <img class="${logoClass}" src="${escapeHtml(p.logo)}" alt="${escapeHtml(p.name)}">`,
            '                <div class="partner-card__info">',
            `                    <h3 class="partner-card__name">${escapeHtml(p.name)}</h3>`,
            `                    <span class="partner-card__type">${escapeHtml(p.type)}</span>`,
            `                    <p class="partner-card__desc">${escapeHtml(p.description)}</p>`,
            '                </div>',
            '                <span class="partner-card__link">Подробнее &rarr;</span>',
            '            </a>',
            ''
        ].join(eol);
    }).join('');
}

// Rebuilds the card block between PARTNERS:START and PARTNERS:END in partners.html.
// The page is rendered before anything is written, so JSON and HTML never get out of sync.
// Works with both LF and CRLF line endings (files copied through Windows/git get CRLF).
function writePartners(data) {
    const html = fs.readFileSync(PARTNERS_HTML, 'utf-8');
    const eol = html.includes('\r\n') ? '\r\n' : '\n';
    const re = /(<!-- PARTNERS:START[^>]*-->)[\s\S]*?(\r?\n[ \t]*<!-- PARTNERS:END -->)/;
    if (!re.test(html)) throw new Error('В partners.html не найдены метки PARTNERS:START / PARTNERS:END');
    const newHtml = html.replace(re, (_, start, end) => start + eol + renderPartnerCards(data, eol) + end);

    writeJsonAtomic(PARTNERS_FILE, data);
    writeFileAtomic(PARTNERS_HTML, newHtml);
}

function isUploadedLogo(logo) {
    return typeof logo === 'string' && logo.startsWith(LOGO_URL_PREFIX + UPLOADED_LOGO_PREFIX);
}

// Removes a logo uploaded via the admin panel once no partner references it
function removeLogoIfUnused(logo, partners) {
    if (!isUploadedLogo(logo) || partners.some(p => p.logo === logo)) return;
    const file = path.join(LOGO_DIR, path.basename(logo));
    if (fs.existsSync(file)) fs.unlinkSync(file);
}

// Returns an error message, or null if the fields are valid
function validatePartner(p) {
    if (!p.name || !p.name.trim()) return 'Укажите название партнёра';
    if (!p.logo) return 'Загрузите логотип';
    if (!p.logo.startsWith(LOGO_URL_PREFIX) || p.logo.includes('..')) return 'Некорректный путь к логотипу';
    if (!/^https?:\/\/\S+$/i.test(p.url || '')) return 'Ссылка должна начинаться с http:// или https://';
    if (!PARTNER_CATEGORIES.includes(p.category)) return 'Выберите категорию';
    return null;
}

const PARTNER_TEXT_FIELDS = ['name', 'type', 'description', 'url', 'category', 'logo'];
const PARTNER_FLAG_FIELDS = ['logoLarge', 'visible'];

// Returns { error } or { fields } with only the fields that were sent
function pickPartnerFields(body) {
    const fields = {};
    for (const key of PARTNER_TEXT_FIELDS) {
        if (body[key] === undefined) continue;
        if (!isString(body[key])) return { error: `Поле «${key}» должно быть строкой` };
        fields[key] = body[key].trim();
    }
    for (const key of PARTNER_FLAG_FIELDS) {
        if (body[key] === undefined) continue;
        if (typeof body[key] !== 'boolean') return { error: `Поле «${key}» должно быть да/нет` };
        fields[key] = body[key];
    }
    return { fields };
}

const logoUpload = multer({
    storage: multer.diskStorage({
        destination: LOGO_DIR,
        filename: (req, file, cb) => {
            cb(null, UPLOADED_LOGO_PREFIX + Date.now().toString(36) + crypto.randomBytes(3).toString('hex') + LOGO_TYPES[file.mimetype]);
        }
    }),
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (req, file, cb) => cb(null, !!LOGO_TYPES[file.mimetype])
}).single('logo');

// Without partners.json the first save would wipe every card from partners.html
app.use('/api/admin/partners', (req, res, next) => {
    if (fs.existsSync(PARTNERS_FILE)) return next();
    res.status(500).json({ message: 'На сервере нет файла data/partners.json — загрузите его вместе с сайтом' });
});

app.get('/api/admin/partners', requireAuth, (req, res) => {
    res.json(readPartners().sort((a, b) => a.order - b.order));
});

app.post('/api/admin/partners/logo', requireAuth, (req, res) => {
    try { cleanupOrphanLogos(); } catch (e) { console.error('Очистка логотипов:', e.message); }
    logoUpload(req, res, (err) => {
        if (err) {
            const message = err.code === 'LIMIT_FILE_SIZE' ? 'Файл больше 2 МБ' : 'Не удалось загрузить файл';
            return res.status(400).json({ message });
        }
        if (!req.file) return res.status(400).json({ message: 'Нужен файл PNG, JPG или WebP' });
        res.json({ logo: LOGO_URL_PREFIX + req.file.filename });
    });
});

app.post('/api/admin/partners', requireAuth, (req, res) => {
    const { error: fieldError, fields } = pickPartnerFields(req.body || {});
    if (fieldError) return res.status(400).json({ message: fieldError });

    const partners = readPartners();
    const newPartner = {
        id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name: '', type: '', description: '', url: '', category: '', logo: '',
        logoLarge: false,
        visible: true,
        ...fields,
        order: partners.length + 1
    };
    const error = validatePartner(newPartner);
    if (error) return res.status(400).json({ message: error });

    partners.push(newPartner);
    writePartners(partners);
    res.json(newPartner);
});

app.put('/api/admin/partners/:id', requireAuth, (req, res) => {
    const { error: fieldError, fields } = pickPartnerFields(req.body || {});
    if (fieldError) return res.status(400).json({ message: fieldError });

    const partners = readPartners();
    const idx = partners.findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ message: 'Партнёр не найден' });

    const oldLogo = partners[idx].logo;
    const updated = { ...partners[idx], ...fields };
    const error = validatePartner(updated);
    if (error) return res.status(400).json({ message: error });

    partners[idx] = updated;
    writePartners(partners);
    if (oldLogo !== updated.logo) removeLogoIfUnused(oldLogo, partners);
    res.json(updated);
});

app.delete('/api/admin/partners/:id', requireAuth, (req, res) => {
    let partners = readPartners();
    const removed = partners.find(p => p.id === req.params.id);
    if (!removed) return res.status(404).json({ message: 'Партнёр не найден' });

    partners = partners.filter(p => p.id !== req.params.id);
    partners.sort((a, b) => a.order - b.order).forEach((p, i) => p.order = i + 1);
    writePartners(partners);
    removeLogoIfUnused(removed.logo, partners);
    res.json({ success: true });
});

app.put('/api/admin/partners/:id/reorder', requireAuth, (req, res) => {
    const partners = readPartners();
    const { direction } = req.body; // 'up' or 'down'
    partners.sort((a, b) => a.order - b.order);
    const idx = partners.findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ message: 'Партнёр не найден' });

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= partners.length) return res.json({ success: false });

    const tmpOrder = partners[idx].order;
    partners[idx].order = partners[swapIdx].order;
    partners[swapIdx].order = tmpOrder;

    writePartners(partners);
    res.json({ success: true });
});

// Abandoned uploads (logo picked, form cancelled) are cleaned up when the next upload happens
function cleanupOrphanLogos() {
    const used = new Set(readPartners().map(p => p.logo));
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    for (const name of fs.readdirSync(LOGO_DIR)) {
        if (!name.startsWith(UPLOADED_LOGO_PREFIX) || used.has(LOGO_URL_PREFIX + name)) continue;
        const file = path.join(LOGO_DIR, name);
        if (fs.statSync(file).mtimeMs < dayAgo) fs.unlinkSync(file);
    }
}

app.listen(PORT, () => {
    console.log(`ВСА сервер запущен: http://localhost:${PORT}`);
    console.log(`Админ-панель: http://localhost:${PORT}/admin.html`);
});
