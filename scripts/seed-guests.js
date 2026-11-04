require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { query, rows } = require('../server/spiderWebService');
const guestSeedPath = path.join(__dirname, '..', 'server', 'guestSeed.js');

if (!fs.existsSync(guestSeedPath)) {
  throw new Error('Falta server/guestSeed.js. La lista privada de invitados no se incluye en el repositorio público.');
}

const guests = require(guestSeedPath);

async function seed() {
  const total = guests.reduce((sum, [, count]) => sum + count, 0);
  const uniqueNames = new Set(guests.map(([name]) => name));

  if (guests.length !== 60 || total !== 101 || uniqueNames.size !== 60) {
    throw new Error(`La lista semilla debe contener 60 grupos y 101 personas; se encontró ${guests.length} y ${total}.`);
  }

  for (let start = 0; start < guests.length; start += 20) {
    const batch = guests.slice(start, start + 20);
    const values = [];
    const params = [];

    for (const [fullName, expectedCount] of batch) {
      const [name, ...surnameParts] = fullName.split(' ');
      const surname = surnameParts.join(' ') || null;
      values.push('(?, ?, ?, ?, ?, 0, ?)');
      params.push(randomUUID(), name, surname, escapeIdentifierValue(fullName), expectedCount, 'Pendiente');
    }

    const placeholders = values.join(', ');
    await query(
      `INSERT INTO invitados (id, nombre, apellido, nombre_completo, cantidad_invitada, cantidad_confirmada, estado) VALUES ${placeholders} ON DUPLICATE KEY UPDATE nombre_completo = VALUES(nombre_completo)`,
      params
    );
  }

  const placeholders = guests.map(() => '?').join(', ');
  const summary = await rows(
    `SELECT COUNT(DISTINCT nombre_completo) AS grupos, SUM(cantidad_invitada) AS personas FROM invitados WHERE nombre_completo IN (${placeholders})`,
    guests.map(([name]) => name)
  );
  const result = summary[0];

  if (Number(result.grupos) !== guests.length) {
    throw new Error(`Verificación de carga incompleta: ${result.grupos} grupos, ${result.personas} personas.`);
  }

  process.stdout.write(`Carga verificada: ${result.grupos} grupos semilla encontrados, con ${result.personas} personas previstas.\n`);
}

seed().catch((error) => {
  process.stderr.write(`No se pudo cargar la lista inicial: ${error.message}\n`);
  process.exitCode = 1;
});
