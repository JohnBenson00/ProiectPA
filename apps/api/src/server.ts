/** Node server: serves the API (shared route table) and the built web app. */
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './node-db.js';
import { seed } from './core/seed.js';
import { handle } from './core/routes.js';

openDatabase();
seed(false);

const app = express();
app.use(express.json({ limit: '200kb' }));

app.all('/api/*', (req, res) => {
  const r = handle(req.method, req.path, req.query as Record<string, string>, req.body, req.headers.authorization);
  res.status(r.status).json(r.body);
});

const webDist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web', 'dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get('*', (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
}

const PORT = Number(process.env.PORT ?? 3001);
app.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));
