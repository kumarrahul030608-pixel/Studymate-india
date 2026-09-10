import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

const app = express();
const PORT = process.env.PORT || 3000;
const JUDGE0_URL = (process.env.JUDGE0_URL || 'https://ce.judge0.com').replace(/\/$/, '');
const JUDGE0_KEY = process.env.JUDGE0_KEY || '';

app.set('trust proxy', 1);
app.use(cors({ origin: true, methods: ['GET','POST','OPTIONS'] }));
app.use(express.json({ limit: '64kb' }));
app.use(rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false }));

const allowedLanguages = new Set([66,82,91,102,103,105,109]);

function authHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (JUDGE0_KEY) h['X-Auth-Token'] = JUDGE0_KEY;
  return h;
}

app.get('/health', (_req, res) => res.json({ ok: true, service: 'StudyMate Compiler', provider: 'Judge0' }));

app.post('/api/execute', async (req, res) => {
  try {
    const body = req.body || {};
    // Accept both camelCase (frontend) and snake_case (API) field names.
    const language_id = body.language_id ?? body.languageId;
    const source_code = body.source_code ?? body.sourceCode;
    const stdin = body.stdin ?? '';

    if (!Number.isInteger(language_id) || !allowedLanguages.has(language_id)) {
      return res.status(400).json({ error: 'Unsupported language.' });
    }
    if (typeof source_code !== 'string' || source_code.length === 0 || source_code.length > 50_000) {
      return res.status(400).json({ error: 'Source code must be 1–50,000 characters.' });
    }
    if (typeof stdin !== 'string' || stdin.length > 10_000) {
      return res.status(400).json({ error: 'Input is too large.' });
    }

    const response = await fetch(`${JUDGE0_URL}/submissions/?base64_encoded=false&wait=false`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        language_id,
        source_code,
        stdin,
        cpu_time_limit: 3,
        wall_time_limit: 5,
        memory_limit: 256000,
        enable_network: false
      })
    });
    const text = await response.text();
    let data; try { data = JSON.parse(text); } catch { data = { error: text }; }
    if (!response.ok) return res.status(response.status).json(data);
    res.json({ token: data.token });
  } catch (error) {
    res.status(502).json({ error: 'Compiler provider unavailable.' });
  }
});

app.get('/api/result/:token', async (req, res) => {
  try {
    if (!/^[A-Za-z0-9_-]{10,200}$/.test(req.params.token)) return res.status(400).json({ error: 'Invalid token.' });
    const response = await fetch(`${JUDGE0_URL}/submissions/${encodeURIComponent(req.params.token)}?base64_encoded=false`, { headers: JUDGE0_KEY ? { 'X-Auth-Token': JUDGE0_KEY } : {} });
    const text = await response.text();
    let data; try { data = JSON.parse(text); } catch { data = { error: text }; }
    if (!response.ok) return res.status(response.status).json(data);
    res.json(data);
  } catch { res.status(502).json({ error: 'Compiler provider unavailable.' }); }
});

app.listen(PORT, () => console.log(`StudyMate compiler backend listening on ${PORT}`));
