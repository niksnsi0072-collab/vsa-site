const express = require('express');
const cookieParser = require('cookie-parser');
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

app.use(express.json());
app.use(cookieParser());
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
        res.cookie('session', token, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 });
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
