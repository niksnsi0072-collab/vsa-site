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
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'vsa2026admin';
const SESSION_SECRET = process.env.SESSION_SECRET || 'vsa-secret';
const DATA_FILE = path.join(__dirname, 'data', 'vacancies.json');

// Behind nginx: lets req.secure reflect the original HTTPS request (X-Forwarded-Proto)
app.set('trust proxy', 1);

app.use(express.json());
app.use(cookieParser());

// The site is served straight from the project folder, so keep server-side files private:
// data/ holds draft and closed vacancies, the rest is source code and docs
const PRIVATE_PATHS = /^\/(data|node_modules)(\/|$)|^\/(server\.js|package(-lock)?\.json|[^/]+\.md)$/i;
app.use((req, res, next) => {
    if (PRIVATE_PATHS.test(req.path)) return res.status(404).end();
    next();
});

app.use(express.static(__dirname));

// --- Session ---
const sessions = {};

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

function requireAuth(req, res, next) {
    const token = req.cookies.session;
    if (token && sessions[token]) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
}

// --- Data helpers ---
function readVacancies() {
    if (!fs.existsSync(DATA_FILE)) return [];
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
}

function writeVacancies(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function generateId() {
    return 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// --- Auth API ---
app.post('/api/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        const token = generateToken();
        sessions[token] = { createdAt: Date.now() };
        res.cookie('session', token, { httpOnly: true, sameSite: 'strict', secure: req.secure, maxAge: 24 * 60 * 60 * 1000 });
        res.json({ success: true });
    } else {
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
    const token = req.cookies.session;
    res.json({ authenticated: !!(token && sessions[token]) });
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
    const vacancies = readVacancies();
    const { title, subtitle, city, sections, tags, status } = req.body;
    const now = new Date().toISOString().split('T')[0];
    const newVac = {
        id: generateId(),
        title: title || '',
        subtitle: subtitle || '',
        city: city || '',
        sections: sections || [],
        tags: tags || [],
        status: status || 'draft',
        order: vacancies.length + 1,
        createdAt: now,
        updatedAt: now
    };
    vacancies.push(newVac);
    writeVacancies(vacancies);
    res.json(newVac);
});

app.put('/api/admin/vacancies/:id', requireAuth, (req, res) => {
    const vacancies = readVacancies();
    const idx = vacancies.findIndex(v => v.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });

    const { title, subtitle, city, sections, tags, status, order } = req.body;
    if (title !== undefined) vacancies[idx].title = title;
    if (subtitle !== undefined) vacancies[idx].subtitle = subtitle;
    if (city !== undefined) vacancies[idx].city = city;
    if (sections !== undefined) vacancies[idx].sections = sections;
    if (tags !== undefined) vacancies[idx].tags = tags;
    if (status !== undefined) vacancies[idx].status = status;
    if (order !== undefined) vacancies[idx].order = order;
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
const PARTNERS_FILE = path.join(__dirname, 'data', 'partners.json');
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

function renderPartnerCards(partners) {
    const visible = partners.filter(p => p.visible).sort((a, b) => a.order - b.order);
    return visible.map((p, i) => {
        const logoClass = p.logoLarge ? 'partner-card__logo partner-card__logo--lg' : 'partner-card__logo';
        return `
            <a href="${escapeHtml(p.url)}" target="_blank" rel="noopener" class="partner-card" data-category="${escapeHtml(p.category)}" data-animate="fade-up" data-delay="${(i + 1) * 100}">
                <img class="${logoClass}" src="${escapeHtml(p.logo)}" alt="${escapeHtml(p.name)}">
                <div class="partner-card__info">
                    <h3 class="partner-card__name">${escapeHtml(p.name)}</h3>
                    <span class="partner-card__type">${escapeHtml(p.type)}</span>
                    <p class="partner-card__desc">${escapeHtml(p.description)}</p>
                </div>
                <span class="partner-card__link">Подробнее &rarr;</span>
            </a>
`;
    }).join('');
}

// Rebuilds the card block between PARTNERS:START and PARTNERS:END in partners.html
function writePartners(data) {
    fs.writeFileSync(PARTNERS_FILE, JSON.stringify(data, null, 2), 'utf-8');
    const html = fs.readFileSync(PARTNERS_HTML, 'utf-8');
    const re = /(<!-- PARTNERS:START[^>]*-->\n)[\s\S]*?(\n[ \t]*<!-- PARTNERS:END -->)/;
    if (!re.test(html)) throw new Error('В partners.html не найдены метки PARTNERS:START / PARTNERS:END');
    fs.writeFileSync(PARTNERS_HTML, html.replace(re, (_, start, end) => start + renderPartnerCards(data) + end), 'utf-8');
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

const PARTNER_FIELDS = ['name', 'type', 'description', 'url', 'category', 'logo', 'logoLarge', 'visible'];

function pickPartnerFields(body) {
    const out = {};
    for (const key of PARTNER_FIELDS) {
        if (body[key] === undefined) continue;
        out[key] = typeof body[key] === 'string' ? body[key].trim() : body[key];
    }
    if (out.logoLarge !== undefined) out.logoLarge = !!out.logoLarge;
    if (out.visible !== undefined) out.visible = !!out.visible;
    return out;
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
    const partners = readPartners();
    const newPartner = {
        id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name: '', type: '', description: '', url: '', category: '', logo: '',
        logoLarge: false,
        visible: true,
        ...pickPartnerFields(req.body),
        order: partners.length + 1
    };
    const error = validatePartner(newPartner);
    if (error) return res.status(400).json({ message: error });

    partners.push(newPartner);
    writePartners(partners);
    res.json(newPartner);
});

app.put('/api/admin/partners/:id', requireAuth, (req, res) => {
    const partners = readPartners();
    const idx = partners.findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ message: 'Партнёр не найден' });

    const oldLogo = partners[idx].logo;
    const updated = { ...partners[idx], ...pickPartnerFields(req.body) };
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

// --- Save map marker positions ---
app.post('/api/save-markers', (req, res) => {
    const { positions } = req.body;
    if (!positions) return res.status(400).json({ error: 'No positions' });

    const htmlPath = path.join(__dirname, 'index.html');
    let html = fs.readFileSync(htmlPath, 'utf-8');

    for (const [city, coords] of Object.entries(positions)) {
        const regex = new RegExp(`(data-city="${city}"\\s+style=")top:[^;]+;left:[^"]+"`);
        html = html.replace(regex, `$1top:${coords.top};left:${coords.left}"`);
    }

    fs.writeFileSync(htmlPath, html, 'utf-8');
    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`ВСА сервер запущен: http://localhost:${PORT}`);
    console.log(`Админ-панель: http://localhost:${PORT}/admin.html`);
});
