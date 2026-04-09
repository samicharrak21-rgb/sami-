import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import pkg from 'pg';

dotenv.config();
const { Pool } = pkg;
const app = express();
const PORT = Number(process.env.PORT || 8080);
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_super_secret';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

app.use(cors({ origin: true, credentials: false }));
app.use(express.json({ limit: '4mb' }));

async function query(text, params = []) { return pool.query(text, params); }

async function initDb() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      preferred_language TEXT NOT NULL DEFAULT 'ar',
      theme TEXT NOT NULL DEFAULT 'dark',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS profiles (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      avatar TEXT DEFAULT '🎬',
      is_kids BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS catalog (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      media_type TEXT NOT NULL,
      poster_url TEXT,
      backdrop_url TEXT,
      overview TEXT,
      year TEXT,
      content_language TEXT DEFAULT 'ar',
      is_featured BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS stream_servers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      region TEXT,
      provider TEXT,
      base_url TEXT NOT NULL,
      playback_type TEXT NOT NULL DEFAULT 'hls',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      health_status TEXT NOT NULL DEFAULT 'unknown',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS stream_sources (
      id SERIAL PRIMARY KEY,
      catalog_id INTEGER NOT NULL REFERENCES catalog(id) ON DELETE CASCADE,
      server_id INTEGER REFERENCES stream_servers(id) ON DELETE SET NULL,
      label TEXT NOT NULL,
      playback_url TEXT NOT NULL,
      subtitle_url TEXT,
      quality TEXT DEFAULT '1080p',
      is_default BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS favorites (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      profile_id INTEGER REFERENCES profiles(id) ON DELETE SET NULL,
      catalog_id INTEGER NOT NULL REFERENCES catalog(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, profile_id, catalog_id)
    );

    CREATE TABLE IF NOT EXISTS watch_progress (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      profile_id INTEGER REFERENCES profiles(id) ON DELETE SET NULL,
      catalog_id INTEGER NOT NULL REFERENCES catalog(id) ON DELETE CASCADE,
      progress_seconds INTEGER NOT NULL DEFAULT 0,
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, profile_id, catalog_id)
    );
  `);

  const adminEmail = process.env.DEFAULT_ADMIN_EMAIL || 'admin@cinemai.local';
  const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@12345';
  const existing = await query('SELECT id FROM users WHERE email = $1', [adminEmail.toLowerCase()]);
  if (existing.rowCount === 0) {
    const hash = await bcrypt.hash(adminPassword, 10);
    const inserted = await query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id',
      ['Cinemai Admin', adminEmail.toLowerCase(), hash, 'admin']
    );
    await query('INSERT INTO profiles (user_id, name, avatar, is_kids) VALUES ($1, $2, $3, $4)', [inserted.rows[0].id, 'Main', '👑', false]);
  }

  const count = await query('SELECT COUNT(*)::int AS total FROM catalog');
  if (count.rows[0].total === 0) {
    const server = await query(
      'INSERT INTO stream_servers (name, region, provider, base_url, playback_type, is_active, health_status) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      ['Main HLS Edge', 'eu-central', 'Cloud CDN', 'https://test-streams.mux.dev', 'hls', true, 'healthy']
    );

    const c1 = await query(
      'INSERT INTO catalog (title, media_type, poster_url, backdrop_url, overview, year, content_language, is_featured) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
      ['Cinemai Originals', 'movie', 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=600&q=80', 'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?auto=format&fit=crop&w=1600&q=80', 'منصة عربية بطابع نتفلكس مع تشغيل HLS وحسابات وملفات شخصية ولوحة إدارة.', '2026', 'ar', true]
    );

    const c2 = await query(
      'INSERT INTO catalog (title, media_type, poster_url, backdrop_url, overview, year, content_language, is_featured) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
      ['Night Server', 'series', 'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?auto=format&fit=crop&w=600&q=80', 'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?auto=format&fit=crop&w=1600&q=80', 'مثال لمسلسل مرتبط بسيرفر تشغيل HLS خارجي.', '2025', 'en', false]
    );

    await query(
      'INSERT INTO stream_sources (catalog_id, server_id, label, playback_url, quality, is_default) VALUES ($1,$2,$3,$4,$5,$6)',
      [c1.rows[0].id, server.rows[0].id, '1080p HLS', 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', '1080p', true]
    );
    await query(
      'INSERT INTO stream_sources (catalog_id, server_id, label, playback_url, quality, is_default) VALUES ($1,$2,$3,$4,$5,$6)',
      [c2.rows[0].id, server.rows[0].id, 'Adaptive HLS', 'https://test-streams.mux.dev/test_001/stream.m3u8', 'Auto', true]
    );
  }
}

function tokenFor(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
}

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}
function admin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

app.get('/api/health', async (_req, res) => {
  const servers = await query('SELECT COUNT(*)::int AS total FROM stream_servers');
  res.json({ ok: true, servers: servers.rows[0].total, ts: new Date().toISOString() });
});

app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Missing fields' });
  const e = email.toLowerCase();
  const exists = await query('SELECT id FROM users WHERE email=$1', [e]);
  if (exists.rowCount) return res.status(409).json({ error: 'Email already exists' });
  const hash = await bcrypt.hash(password, 10);
  const inserted = await query('INSERT INTO users (name, email, password_hash) VALUES ($1,$2,$3) RETURNING id,name,email,role,preferred_language,theme', [name, e, hash]);
  await query('INSERT INTO profiles (user_id, name, avatar, is_kids) VALUES ($1,$2,$3,$4)', [inserted.rows[0].id, 'Main', '🎬', false]);
  res.json({ token: tokenFor(inserted.rows[0]), user: inserted.rows[0] });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await query('SELECT * FROM users WHERE email=$1', [(email || '').toLowerCase()]);
  if (!user.rowCount) return res.status(401).json({ error: 'Invalid credentials' });
  const row = user.rows[0];
  const ok = await bcrypt.compare(password || '', row.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  res.json({ token: tokenFor(row), user: { id: row.id, name: row.name, email: row.email, role: row.role, preferred_language: row.preferred_language, theme: row.theme } });
});

app.get('/api/auth/me', auth, async (req, res) => {
  const user = await query('SELECT id,name,email,role,preferred_language,theme,created_at FROM users WHERE id=$1', [req.user.id]);
  const profiles = await query('SELECT id,name,avatar,is_kids FROM profiles WHERE user_id=$1 ORDER BY id ASC', [req.user.id]);
  res.json({ user: user.rows[0], profiles: profiles.rows });
});

app.put('/api/users/me', auth, async (req, res) => {
  const { name, preferred_language, theme } = req.body;
  await query('UPDATE users SET name=COALESCE($1,name), preferred_language=COALESCE($2,preferred_language), theme=COALESCE($3,theme) WHERE id=$4', [name || null, preferred_language || null, theme || null, req.user.id]);
  const user = await query('SELECT id,name,email,role,preferred_language,theme FROM users WHERE id=$1', [req.user.id]);
  res.json({ user: user.rows[0] });
});

app.post('/api/profiles', auth, async (req, res) => {
  const { name, avatar, is_kids } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const profile = await query('INSERT INTO profiles (user_id,name,avatar,is_kids) VALUES ($1,$2,$3,$4) RETURNING *', [req.user.id, name, avatar || '🎬', !!is_kids]);
  res.json(profile.rows[0]);
});

app.delete('/api/profiles/:id', auth, async (req, res) => {
  await query('DELETE FROM profiles WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
  res.json({ ok: true });
});

app.get('/api/catalog', async (_req, res) => {
  const items = await query('SELECT * FROM catalog ORDER BY is_featured DESC, id DESC');
  res.json(items.rows);
});

app.post('/api/catalog', auth, admin, async (req, res) => {
  const { title, media_type, poster_url, backdrop_url, overview, year, content_language, is_featured } = req.body;
  const item = await query('INSERT INTO catalog (title,media_type,poster_url,backdrop_url,overview,year,content_language,is_featured) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *', [title, media_type, poster_url || null, backdrop_url || null, overview || null, year || null, content_language || 'ar', !!is_featured]);
  res.json(item.rows[0]);
});

app.get('/api/catalog/:id/sources', async (req, res) => {
  const sources = await query(`SELECT ss.*, sv.name AS server_name, sv.provider, sv.region, sv.health_status
    FROM stream_sources ss
    LEFT JOIN stream_servers sv ON sv.id = ss.server_id
    WHERE ss.catalog_id=$1
    ORDER BY ss.is_default DESC, ss.id ASC`, [req.params.id]);
  res.json(sources.rows);
});

app.post('/api/catalog/:id/sources', auth, admin, async (req, res) => {
  const { server_id, label, playback_url, subtitle_url, quality, is_default } = req.body;
  const item = await query('INSERT INTO stream_sources (catalog_id,server_id,label,playback_url,subtitle_url,quality,is_default) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *', [req.params.id, server_id || null, label, playback_url, subtitle_url || null, quality || '1080p', !!is_default]);
  res.json(item.rows[0]);
});

app.get('/api/servers', async (_req, res) => {
  const items = await query('SELECT * FROM stream_servers ORDER BY id DESC');
  res.json(items.rows);
});

app.post('/api/servers', auth, admin, async (req, res) => {
  const { name, region, provider, base_url, playback_type, is_active } = req.body;
  const item = await query('INSERT INTO stream_servers (name,region,provider,base_url,playback_type,is_active,health_status) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *', [name, region || null, provider || null, base_url, playback_type || 'hls', is_active !== false, 'healthy']);
  res.json(item.rows[0]);
});

app.get('/api/favorites', auth, async (req, res) => {
  const items = await query(`SELECT c.* FROM favorites f JOIN catalog c ON c.id = f.catalog_id WHERE f.user_id=$1 ORDER BY f.id DESC`, [req.user.id]);
  res.json(items.rows);
});

app.post('/api/favorites', auth, async (req, res) => {
  const { catalog_id, profile_id } = req.body;
  await query('INSERT INTO favorites (user_id, profile_id, catalog_id) VALUES ($1,$2,$3) ON CONFLICT (user_id, profile_id, catalog_id) DO NOTHING', [req.user.id, profile_id || null, catalog_id]);
  res.json({ ok: true });
});

app.delete('/api/favorites/:catalogId', auth, async (req, res) => {
  await query('DELETE FROM favorites WHERE user_id=$1 AND catalog_id=$2', [req.user.id, req.params.catalogId]);
  res.json({ ok: true });
});

app.get('/api/progress', auth, async (req, res) => {
  const items = await query(`SELECT wp.*, c.title, c.poster_url, c.media_type FROM watch_progress wp JOIN catalog c ON c.id = wp.catalog_id WHERE wp.user_id=$1 ORDER BY wp.updated_at DESC`, [req.user.id]);
  res.json(items.rows);
});

app.post('/api/progress', auth, async (req, res) => {
  const { catalog_id, profile_id, progress_seconds, duration_seconds } = req.body;
  await query(`INSERT INTO watch_progress (user_id,profile_id,catalog_id,progress_seconds,duration_seconds,updated_at)
      VALUES ($1,$2,$3,$4,$5,NOW())
      ON CONFLICT (user_id, profile_id, catalog_id)
      DO UPDATE SET progress_seconds=EXCLUDED.progress_seconds, duration_seconds=EXCLUDED.duration_seconds, updated_at=NOW()`,
      [req.user.id, profile_id || null, catalog_id, progress_seconds || 0, duration_seconds || 0]);
  res.json({ ok: true });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
  app.use(express.static("../frontend"));
});

await initDb();
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// عرض ملفات الواجهة
app.use(express.static(path.join(__dirname, "../frontend")));

// عند فتح الموقع
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});
app.listen(PORT, () => console.log(`Cinemai API listening on ${PORT}`));
