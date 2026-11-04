const express = require('express');
const { randomUUID } = require('node:crypto');
const { rows, query } = require('./spiderWebService');

const router = express.Router();
const STATUSES = new Set(['Pendiente', 'Confirmado', 'No asiste']);
const RESPONSES = new Set(['Confirmado', 'No asiste']);
const HOST_NAMES = new Map([
  ['emilce fassanelli', 'Emilce Fassanelli'],
  ['gustavo olguin', 'Gustavo Olguín']
]);

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function text(value, field, maxLength, required = false) {
  if (typeof value !== 'string') {
    if (required) throw Object.assign(new Error(`${field} es obligatorio.`), { status: 400 });
    return null;
  }
  const result = value.trim();
  if (required && !result) throw Object.assign(new Error(`${field} es obligatorio.`), { status: 400 });
  if (result.length > maxLength) throw Object.assign(new Error(`${field} supera el largo permitido.`), { status: 400 });
  return result || null;
}

function integer(value, field, min, max) {
  const result = Number(value);
  if (!Number.isInteger(result) || result < min || result > max) {
    throw Object.assign(new Error(`${field} debe ser un número entre ${min} y ${max}.`), { status: 400 });
  }
  return result;
}

function uuid(value, field = 'Identificador') {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw Object.assign(new Error(`${field} inválido.`), { status: 400 });
  }
  return value;
}

function normalizeName(value) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function splitName(fullName) {
  const [nombre, ...surname] = fullName.trim().split(/\s+/);
  return { nombre, apellido: surname.join(' ') || null };
}

function clearGuestSession(req) {
  const session = { ...(req.session || {}) };
  delete session.guestId;
  req.session = Object.keys(session).length ? session : null;
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.adminId) {
    res.status(401).json({ error: 'Necesitás iniciar sesión nuevamente.' });
    return;
  }
  next();
}

function csvCell(value) {
  let cell = value == null ? '' : String(value);
  if (/^[=+\-@]/.test(cell)) cell = `'${cell}`;
  return `"${cell.replace(/"/g, '""')}"`;
}

function sendCsv(res, filename, columns, data) {
  const content = [
    columns.map(([, title]) => csvCell(title)).join(','),
    ...data.map((row) => columns.map(([field]) => csvCell(row[field])).join(','))
  ].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(`\uFEFF${content}`);
}

router.post('/public/guest/identify', asyncRoute(async (req, res) => {
  const fullName = text(req.body.nombreCompleto, 'Nombre y apellido', 201, true);
  const guests = await rows('SELECT id, nombre_completo, cantidad_invitada FROM invitados');
  const matches = guests.filter((guest) => normalizeName(guest.nombre_completo) === normalizeName(fullName));

  if (matches.length > 1) {
    clearGuestSession(req);
    res.status(409).json({
      code: 'ambiguous',
      error: 'Encontramos más de una invitación con ese nombre. Probá otra forma de escribir tu nombre y apellido.'
    });
    return;
  }

  if (matches.length === 0) {
    const hostName = HOST_NAMES.get(normalizeName(fullName));
    clearGuestSession(req);
    if (hostName) {
      res.json({ host: true, guest: { nombreCompleto: hostName } });
      return;
    }
    res.status(404).json({
      code: 'not_found',
      error: 'No encontramos una invitación con ese nombre. Revisá que hayas escrito correctamente tu nombre y apellido.'
    });
    return;
  }

  const guest = matches[0];
  req.session = { ...(req.session || {}), guestId: guest.id };
  res.json({
    guest: {
      nombreCompleto: guest.nombre_completo,
      cantidadInvitada: Number(guest.cantidad_invitada)
    }
  });
}));

router.get('/public/guest/current', asyncRoute(async (req, res) => {
  if (!req.session || !req.session.guestId) {
    res.json({ guest: null });
    return;
  }

  const guests = await rows(
    'SELECT id, nombre_completo, cantidad_invitada FROM invitados WHERE id = ? LIMIT 1',
    [req.session.guestId]
  );
  const guest = guests[0];
  if (!guest) {
    clearGuestSession(req);
    res.json({ guest: null });
    return;
  }

  res.json({
    guest: {
      nombreCompleto: guest.nombre_completo,
      cantidadInvitada: Number(guest.cantidad_invitada)
    }
  });
}));

router.post('/public/rsvp', asyncRoute(async (req, res) => {
  const submissionKey = uuid(req.body.submissionKey, 'Clave de envío');
  if (!req.session || !req.session.guestId) {
    throw Object.assign(new Error('Identificá tu invitación antes de confirmar asistencia.'), { status: 401 });
  }

  const invited = await rows(
    'SELECT id, nombre_completo, cantidad_invitada FROM invitados WHERE id = ? LIMIT 1',
    [req.session.guestId]
  );
  const guest = invited[0];
  if (!guest) {
    clearGuestSession(req);
    throw Object.assign(new Error('No pudimos recuperar tu invitación. Volvé a identificarte.'), { status: 401 });
  }

  const asistencia = req.body.asistencia;
  if (!RESPONSES.has(asistencia)) throw Object.assign(new Error('Seleccioná si vas a asistir.'), { status: 400 });

  const cantidadPersonas = asistencia === 'Confirmado'
    ? integer(req.body.cantidadPersonas, 'Cantidad de personas', 1, Number(guest.cantidad_invitada))
    : 0;
  const telefono = text(req.body.telefono, 'Teléfono', 40);
  const acompanantes = text(req.body.acompanantes, 'Acompañantes', 500);
  const mensaje = text(req.body.mensaje, 'Mensaje', 1000);
  const existing = await rows('SELECT id FROM confirmaciones WHERE submission_key = ? LIMIT 1', [submissionKey]);
  if (existing.length) {
    res.json({ ok: true, duplicate: true, linked: true });
    return;
  }

  const { nombre, apellido } = splitName(guest.nombre_completo);
  const id = randomUUID();
  await query(
    'INSERT INTO confirmaciones (id, invitado_id, submission_key, nombre, apellido, telefono, asistencia, cantidad_personas, acompanantes, mensaje) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE id = id',
    [id, guest.id, submissionKey, nombre, apellido, telefono, asistencia, cantidadPersonas, acompanantes, mensaje]
  );

  await query(
    'UPDATE invitados SET estado = ?, cantidad_confirmada = ?, telefono = ?, acompanantes = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?',
    [asistencia, cantidadPersonas, telefono, acompanantes, guest.id]
  );

  res.status(201).json({ ok: true, linked: true });
}));

router.post('/public/songs', asyncRoute(async (req, res) => {
  const submissionKey = uuid(req.body.submissionKey, 'Clave de envío');
  const song = text(req.body.cancion, 'Canción', 200, true);
  const artist = text(req.body.artista, 'Artista', 200, true);
  const guestName = text(req.body.nombreInvitado, 'Nombre', 201);
  const comment = text(req.body.comentario, 'Comentario', 500);
  const id = randomUUID();

  await query(
    'INSERT INTO canciones (id, submission_key, nombre_invitado, cancion, artista, comentario) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE id = id',
    [id, submissionKey, guestName, song, artist, comment]
  );
  res.status(201).json({ ok: true });
}));

router.get('/auth/session', (req, res) => {
  res.json({
    authenticated: Boolean(req.session && req.session.adminId),
    email: req.session?.adminEmail || null
  });
});

router.post('/auth/login', asyncRoute(async (req, res) => {
  const email = text(req.body.email, 'Correo electrónico', 254, true).toLowerCase();
  const password = text(req.body.password, 'Contraseña', 200, true);
  const users = await rows(
    'SELECT id, email, password_hash FROM usuarios_admin WHERE email = ? AND activo = 1 LIMIT 1',
    [email]
  );

  if (!users.length) {
    res.status(401).json({ error: 'El correo o la contraseña no son correctos.' });
    return;
  }

  const bcrypt = require('bcryptjs');
  const valid = await bcrypt.compare(password, users[0].password_hash);
  if (!valid) {
    res.status(401).json({ error: 'El correo o la contraseña no son correctos.' });
    return;
  }

  req.session = null;
  req.session = { adminId: users[0].id, adminEmail: users[0].email };
  res.json({ ok: true, email: users[0].email });
}));

router.post('/auth/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

router.get('/admin/summary', requireAdmin, asyncRoute(async (req, res) => {
  const [stats] = await rows(
    `SELECT
      COUNT(*) AS grupos_invitados,
      COALESCE(SUM(cantidad_invitada), 0) AS personas_invitadas,
      SUM(estado = 'Confirmado') AS grupos_confirmados,
      SUM(estado = 'Pendiente') AS grupos_pendientes,
      SUM(estado = 'No asiste') AS grupos_no_asisten,
      COALESCE(SUM(CASE WHEN estado = 'Confirmado' THEN cantidad_confirmada ELSE 0 END), 0) AS personas_confirmadas
    FROM invitados`
  );
  const [songCount] = await rows('SELECT COUNT(*) AS canciones_recibidas FROM canciones');
  const activity = await rows(
    'SELECT id, nombre, apellido, asistencia, cantidad_personas, fecha_registro FROM confirmaciones ORDER BY fecha_registro DESC LIMIT 8'
  );
  res.json({ ...stats, ...songCount, actividad: activity });
}));

router.get('/admin/guests', requireAdmin, asyncRoute(async (req, res) => {
  const search = text(req.query.search, 'Búsqueda', 100);
  const status = req.query.status || '';
  if (status && !STATUSES.has(status)) throw Object.assign(new Error('Filtro de estado inválido.'), { status: 400 });
  const conditions = [];
  const params = [];
  if (status) {
    conditions.push('estado = ?');
    params.push(status);
  }
  if (search) {
    conditions.push('nombre_completo LIKE ?');
    params.push(`%${search}%`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const guests = await rows(
    `SELECT id, nombre, apellido, nombre_completo, cantidad_invitada, cantidad_confirmada, estado, telefono, acompanantes, observaciones, fecha_creacion, fecha_actualizacion FROM invitados ${where} ORDER BY nombre_completo ASC`,
    params
  );
  res.json({ invitados: guests });
}));

router.post('/admin/guests', requireAdmin, asyncRoute(async (req, res) => {
  const fullName = text(req.body.nombreCompleto, 'Nombre completo', 201, true);
  const { nombre, apellido } = splitName(fullName);
  const amount = integer(req.body.cantidadInvitada, 'Cantidad prevista', 1, 20);
  const id = randomUUID();
  await query(
    'INSERT INTO invitados (id, nombre, apellido, nombre_completo, cantidad_invitada, cantidad_confirmada, estado, telefono, acompanantes, observaciones) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)',
    [id, nombre, apellido, fullName, amount, 'Pendiente', text(req.body.telefono, 'Teléfono', 40), text(req.body.acompanantes, 'Acompañantes', 500), text(req.body.observaciones, 'Observaciones', 1000)]
  );
  res.status(201).json({ id });
}));

router.patch('/admin/guests/:id', requireAdmin, asyncRoute(async (req, res) => {
  const id = uuid(req.params.id);
  const fullName = text(req.body.nombreCompleto, 'Nombre completo', 201, true);
  const { nombre, apellido } = splitName(fullName);
  const invited = integer(req.body.cantidadInvitada, 'Cantidad prevista', 1, 20);
  const confirmed = integer(req.body.cantidadConfirmada, 'Cantidad confirmada', 0, 20);
  const status = req.body.estado;
  if (!STATUSES.has(status)) throw Object.assign(new Error('Estado inválido.'), { status: 400 });
  if (status === 'Confirmado' && confirmed < 1) throw Object.assign(new Error('Un grupo confirmado debe tener al menos una persona.'), { status: 400 });
  if (status === 'No asiste' && confirmed !== 0) throw Object.assign(new Error('Un grupo que no asiste debe tener 0 personas confirmadas.'), { status: 400 });
  const overCapacity = status === 'Confirmado' && confirmed > invited;
  if (overCapacity && process.env.ALLOW_OVER_CAPACITY !== 'true') {
    throw Object.assign(new Error('La cantidad confirmada supera la prevista; habilitá ALLOW_OVER_CAPACITY para aceptar excepciones.'), { status: 400 });
  }

  await query(
    'UPDATE invitados SET nombre = ?, apellido = ?, nombre_completo = ?, cantidad_invitada = ?, cantidad_confirmada = ?, estado = ?, telefono = ?, acompanantes = ?, observaciones = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?',
    [nombre, apellido, fullName, invited, confirmed, status, text(req.body.telefono, 'Teléfono', 40), text(req.body.acompanantes, 'Acompañantes', 500), text(req.body.observaciones, 'Observaciones', 1000), id]
  );
  res.json({ ok: true });
}));

router.delete('/admin/guests/:id', requireAdmin, asyncRoute(async (req, res) => {
  const id = uuid(req.params.id);
  const linked = await rows('SELECT id FROM confirmaciones WHERE invitado_id = ? LIMIT 1', [id]);
  if (linked.length) throw Object.assign(new Error('No se puede eliminar un grupo con respuestas registradas.'), { status: 409 });
  await query('DELETE FROM invitados WHERE id = ?', [id]);
  res.json({ ok: true });
}));

router.get('/admin/confirmations', requireAdmin, asyncRoute(async (req, res) => {
  const status = req.query.status || '';
  if (status && !RESPONSES.has(status)) throw Object.assign(new Error('Filtro de asistencia inválido.'), { status: 400 });
  const search = text(req.query.search, 'Búsqueda', 100);
  const conditions = [];
  const params = [];
  if (status) {
    conditions.push('c.asistencia = ?');
    params.push(status);
  }
  if (search) {
    conditions.push('(c.nombre LIKE ? OR c.apellido LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const data = await rows(
    `SELECT c.id, c.invitado_id, c.nombre, c.apellido, c.telefono, c.asistencia, c.cantidad_personas, c.acompanantes, c.mensaje, c.fecha_registro, i.nombre_completo AS invitado_vinculado FROM confirmaciones c LEFT JOIN invitados i ON i.id = c.invitado_id ${where} ORDER BY c.fecha_registro DESC`,
    params
  );
  res.json({ confirmaciones: data });
}));

router.get('/admin/songs', requireAdmin, asyncRoute(async (req, res) => {
  const search = text(req.query.search, 'Búsqueda', 100);
  const where = search ? 'WHERE nombre_invitado LIKE ? OR cancion LIKE ? OR artista LIKE ?' : '';
  const params = search ? [`%${search}%`, `%${search}%`, `%${search}%`] : [];
  const songs = await rows(
    `SELECT id, nombre_invitado, cancion, artista, comentario, seleccionada, escuchada, fecha_registro FROM canciones ${where} ORDER BY fecha_registro DESC`,
    params
  );
  res.json({ canciones: songs });
}));

router.patch('/admin/songs/:id', requireAdmin, asyncRoute(async (req, res) => {
  const id = uuid(req.params.id);
  if (typeof req.body.seleccionada !== 'boolean' || typeof req.body.escuchada !== 'boolean') {
    throw Object.assign(new Error('Los campos seleccionada y escuchada deben ser booleanos.'), { status: 400 });
  }
  await query(
    'UPDATE canciones SET seleccionada = ?, escuchada = ? WHERE id = ?',
    [req.body.seleccionada ? 1 : 0, req.body.escuchada ? 1 : 0, id]
  );
  res.json({ ok: true });
}));

router.delete('/admin/songs/:id', requireAdmin, asyncRoute(async (req, res) => {
  const id = uuid(req.params.id);
  await query('DELETE FROM canciones WHERE id = ?', [id]);
  res.json({ ok: true });
}));

router.get('/admin/export', requireAdmin, asyncRoute(async (req, res) => {
  const type = req.query.type;
  const exports = {
    guests: {
      filename: 'invitados.csv',
      columns: [['nombre_completo', 'Invitado'], ['cantidad_invitada', 'Personas previstas'], ['cantidad_confirmada', 'Cantidad confirmada'], ['estado', 'Estado'], ['telefono', 'Teléfono'], ['acompanantes', 'Acompañantes'], ['observaciones', 'Observaciones'], ['fecha_actualizacion', 'Fecha actualización']],
      sql: 'SELECT nombre_completo, cantidad_invitada, cantidad_confirmada, estado, telefono, acompanantes, observaciones, fecha_actualizacion FROM invitados ORDER BY nombre_completo'
    },
    pending: {
      filename: 'pendientes.csv',
      columns: [['nombre_completo', 'Invitado'], ['cantidad_invitada', 'Personas previstas'], ['estado', 'Estado']],
      sql: 'SELECT nombre_completo, cantidad_invitada, estado FROM invitados WHERE estado = ? ORDER BY nombre_completo',
      params: ['Pendiente']
    },
    declined: {
      filename: 'no-asisten.csv',
      columns: [['nombre_completo', 'Invitado'], ['cantidad_invitada', 'Personas previstas'], ['estado', 'Estado']],
      sql: 'SELECT nombre_completo, cantidad_invitada, estado FROM invitados WHERE estado = ? ORDER BY nombre_completo',
      params: ['No asiste']
    },
    confirmations: {
      filename: 'confirmaciones.csv',
      columns: [['nombre', 'Nombre'], ['apellido', 'Apellido'], ['asistencia', 'Asistencia'], ['cantidad_personas', 'Personas'], ['acompanantes', 'Acompañantes'], ['telefono', 'Teléfono'], ['mensaje', 'Mensaje'], ['fecha_registro', 'Fecha']],
      sql: 'SELECT nombre, apellido, asistencia, cantidad_personas, acompanantes, telefono, mensaje, fecha_registro FROM confirmaciones ORDER BY fecha_registro DESC'
    },
    songs: {
      filename: 'canciones.csv',
      columns: [['nombre_invitado', 'Invitado'], ['cancion', 'Canción'], ['artista', 'Artista'], ['comentario', 'Comentario'], ['seleccionada', 'Favorita'], ['escuchada', 'Escuchada'], ['fecha_registro', 'Fecha']],
      sql: 'SELECT nombre_invitado, cancion, artista, comentario, seleccionada, escuchada, fecha_registro FROM canciones ORDER BY fecha_registro DESC'
    }
  };
  const config = exports[type];
  if (!config) throw Object.assign(new Error('Tipo de exportación inválido.'), { status: 400 });
  const data = await rows(config.sql, config.params || []);
  sendCsv(res, config.filename, config.columns, data);
}));

module.exports = {
  router,
  requireAdmin,
  asyncRoute
};
