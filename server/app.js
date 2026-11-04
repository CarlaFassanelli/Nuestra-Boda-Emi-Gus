require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const express = require('express');
const cookieSession = require('cookie-session');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const { query, ensureSchema } = require('./spiderWebService');
const { router } = require('./routes');

const root = path.resolve(__dirname, '..');
const invitationTemplate = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = express();
const port = Number(process.env.PORT || 3000);
const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
const sessionSecret = process.env.SESSION_SECRET;
const appOrigin = process.env.APP_ORIGIN;

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT debe ser un puerto válido.');
}
if (!adminEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
  throw new Error('Configurá un ADMIN_EMAIL válido.');
}
if (!adminPasswordHash || bcrypt.getRounds(adminPasswordHash) < 12) {
  throw new Error('Configurá ADMIN_PASSWORD_HASH con un hash bcrypt de al menos 12 rondas usando npm run hash-password.');
}
if (!sessionSecret || sessionSecret.length < 48) {
  throw new Error('SESSION_SECRET debe contener al menos 48 caracteres aleatorios.');
}
if (!appOrigin) {
  throw new Error('Configurá APP_ORIGIN (por ejemplo, http://localhost:3000).');
}

app.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : false);
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", 'https://fonts.googleapis.com'],
      styleSrcAttr: ["'unsafe-inline'"]
    }
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(express.json({ limit: '20kb', strict: true }));
app.use(cookieSession({
  name: 'emiygus_admin',
  keys: [sessionSecret],
  maxAge: 8 * 60 * 60 * 1000,
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict'
}));

function sameOrigin(req, res, next) {
  const origin = req.get('origin');
  if (!origin) {
    next();
    return;
  }
  try {
    if (new URL(origin).origin !== new URL(appOrigin).origin) {
      res.status(403).json({ error: 'Origen de solicitud no permitido.' });
      return;
    }
  } catch {
    res.status(403).json({ error: 'Origen de solicitud inválido.' });
    return;
  }
  next();
}

const publicFormLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Se alcanzó el límite de envíos. Probá de nuevo más tarde.' }
});
const guestLookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Se alcanzó el límite de búsquedas. Probá de nuevo más tarde.' }
});
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Esperá unos minutos antes de volver a probar.' }
});

app.use('/assets', express.static(path.join(root, 'assets'), { maxAge: '7d' }));
app.use('/css', express.static(path.join(root, 'css'), { maxAge: '1d' }));
app.use('/js', express.static(path.join(root, 'js'), { maxAge: '1d' }));
app.use('/admin-assets', express.static(path.join(root, 'public'), { maxAge: '1d' }));

app.get('/', (req, res) => {
  if (req.session && req.session.guestId) {
    const session = { ...req.session };
    delete session.guestId;
    req.session = Object.keys(session).length ? session : null;
  }
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
  res.type('html').send(invitationTemplate
    .replace('__GIFT_ALIAS__', escapeHtml(process.env.GIFT_ALIAS || 'Consultar con los novios'))
    .replace('__GIFT_CBU__', escapeHtml(process.env.GIFT_CBU || 'Consultar con los novios')));
});
app.get('/admin', (req, res) => res.sendFile(path.join(root, 'public', 'admin.html')));
app.get('/admin/*', (req, res) => res.sendFile(path.join(root, 'public', 'admin.html')));

app.use('/api/public/guest/identify', guestLookupLimiter);
app.use('/api/public/rsvp', publicFormLimiter);
app.use('/api/public/songs', publicFormLimiter);
app.use('/api/auth/login', sameOrigin, loginLimiter);
app.use('/api/auth/logout', sameOrigin);
app.use('/api', (req, res, next) => {
  initializeBackend().then(() => next(), next);
});
app.use('/api', router);

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Endpoint no encontrado.' });
});
app.use((req, res) => {
  res.status(404).send('Página no encontrada.');
});

app.use((error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  const status = Number.isInteger(error.status) ? error.status : 502;
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}: ${error.message}`);
  res.status(status).json({
    error: status >= 500 ? 'No se pudo completar la operación. Revisá la conexión con Spider-Web API e intentá nuevamente.' : error.message
  });
});

async function ensureAdminUser() {
  await query(
    'INSERT INTO usuarios_admin (id, email, password_hash, activo) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), activo = 1',
    [randomUUID(), adminEmail, adminPasswordHash]
  );
}

let backendInitialization;

function initializeBackend() {
  if (!backendInitialization) {
    backendInitialization = ensureSchema()
      .then(ensureAdminUser)
      .catch((error) => {
        backendInitialization = null;
        throw error;
      });
  }
  return backendInitialization;
}

async function start() {
  await initializeBackend();
  app.listen(port, () => {
    console.log(`Invitación y panel disponibles en ${appOrigin}`);
  });
}

if (require.main === module) {
  start().catch((error) => {
    console.error(`No se pudo iniciar el servidor: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { app, start };
