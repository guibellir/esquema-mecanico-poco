import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pg from 'pg';

const { Pool } = pg;

const PORT = Number(process.env.PORT || 3000);
const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET || 'troque-este-segredo';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

if (!DATABASE_URL) {
  console.error('Falta DATABASE_URL');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  // EasyPanel interno costuma ser sem SSL
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

const app = express();

const allowedOrigins = CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      // permite tools sem Origin (curl/health)
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        return cb(null, true);
      }
      return cb(new Error('CORS bloqueado: ' + origin));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '5mb' }));

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: '30d',
  });
}

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Não autenticado' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, db: true });
  } catch (err) {
    res.status(500).json({ ok: false, db: false, error: String(err.message) });
  }
});

app.post('/auth/register', async (req, res) => {
  try {
    const email = String(req.body?.email || '')
      .trim()
      .toLowerCase();
    const password = String(req.body?.password || '');
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Email inválido' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Senha deve ter ao menos 6 caracteres' });
    }
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       RETURNING id, email, created_at`,
      [email, hash]
    );
    const user = result.rows[0];
    const token = signToken(user);
    res.status(201).json({ token, user: { id: user.id, email: user.email } });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email já cadastrado' });
    }
    console.error(err);
    res.status(500).json({ error: 'Erro ao registrar' });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const email = String(req.body?.email || '')
      .trim()
      .toLowerCase();
    const password = String(req.body?.password || '');
    const result = await pool.query(
      `SELECT id, email, password_hash FROM users WHERE email = $1`,
      [email]
    );
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Email ou senha incorretos' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Email ou senha incorretos' });
    const token = signToken(user);
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao entrar' });
  }
});

app.get('/auth/me', auth, async (req, res) => {
  res.json({ user: req.user });
});

app.get('/projects', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, created_at, updated_at
       FROM projects
       WHERE user_id = $1
       ORDER BY updated_at DESC`,
      [req.user.id]
    );
    res.json({ projects: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar projetos' });
  }
});

app.get('/projects/:id', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, data, created_at, updated_at
       FROM projects
       WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Projeto não encontrado' });
    res.json({ project: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao abrir projeto' });
  }
});

app.post('/projects', auth, async (req, res) => {
  try {
    const name = String(req.body?.name || 'Sem nome').trim() || 'Sem nome';
    const data = req.body?.data;
    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: 'Campo data (JSON do poço) é obrigatório' });
    }
    const result = await pool.query(
      `INSERT INTO projects (user_id, name, data)
       VALUES ($1, $2, $3::jsonb)
       RETURNING id, name, data, created_at, updated_at`,
      [req.user.id, name, JSON.stringify(data)]
    );
    res.status(201).json({ project: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao salvar projeto' });
  }
});

app.put('/projects/:id', auth, async (req, res) => {
  try {
    const name = req.body?.name != null ? String(req.body.name).trim() : null;
    const data = req.body?.data;
    const result = await pool.query(
      `UPDATE projects
       SET
         name = COALESCE($3, name),
         data = COALESCE($4::jsonb, data),
         updated_at = now()
       WHERE id = $1 AND user_id = $2
       RETURNING id, name, data, created_at, updated_at`,
      [
        req.params.id,
        req.user.id,
        name || null,
        data != null ? JSON.stringify(data) : null,
      ]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Projeto não encontrado' });
    res.json({ project: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar projeto' });
  }
});

app.delete('/projects/:id', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM projects WHERE id = $1 AND user_id = $2 RETURNING id`,
      [req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Projeto não encontrado' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao apagar projeto' });
  }
});

app.use((err, _req, res, _next) => {
  if (err?.message?.startsWith('CORS')) {
    return res.status(403).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: 'Erro interno' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`API escutando na porta ${PORT}`);
});
