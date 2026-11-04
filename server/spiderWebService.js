const API_BASE_URL = process.env.SPIDER_WEB_BASE_URL || 'https://spiderwebargapi.com.ar/api/v1';
const DATABASE = process.env.SPIDER_WEB_DATABASE;
const API_KEY = process.env.SPIDER_WEB_API_KEY;

if (!DATABASE) {
  throw new Error('Falta configurar SPIDER_WEB_DATABASE.');
}

if (!API_KEY) {
  throw new Error('Falta configurar SPIDER_WEB_API_KEY. Creá una API Key restringida a la base indicada en SPIDER_WEB_DATABASE.');
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'X-API-Key': API_KEY,
      Accept: 'application/json',
      ...options.headers
    },
    signal: AbortSignal.timeout(12000)
  });
  const responseText = await response.text();
  let payload;

  try {
    payload = responseText ? JSON.parse(responseText) : {};
  } catch {
    throw new Error(`Spider-Web devolvió una respuesta no JSON (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    const message = payload.message || payload.error || `HTTP ${response.status}`;
    throw new Error(`Spider-Web API: ${message}`);
  }

  return payload;
}

async function query(sql, params = []) {
  const payload = await request('/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ database: DATABASE, query: sql, params })
  });

  if (!Object.prototype.hasOwnProperty.call(payload, 'result')) {
    throw new Error('Spider-Web API no devolvió el campo result esperado.');
  }

  return payload.result;
}

async function rows(sql, params = []) {
  const result = await query(sql, params);
  if (!Array.isArray(result)) {
    throw new Error('Spider-Web API devolvió un resultado de consulta con formato inesperado.');
  }
  return result;
}

async function ensureSchema() {
  const payload = await request(`/databases/${encodeURIComponent(DATABASE)}/tables`);
  const tables = payload.tables || payload.result;

  if (!Array.isArray(tables)) {
    throw new Error('Spider-Web API no devolvió el inventario de tablas esperado.');
  }

  const names = tables.map((table) => typeof table === 'string' ? table : table.name);
  const required = ['invitados', 'confirmaciones', 'canciones', 'usuarios_admin'];
  const missing = required.filter((name) => !names.includes(name));

  if (missing.length) {
    throw new Error(`Faltan tablas en Spider-Web: ${missing.join(', ')}. Ejecutá el SQL de configuración documentado.`);
  }
}

module.exports = {
  DATABASE,
  query,
  rows,
  ensureSchema
};
