const bcrypt = require('bcryptjs');

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  throw new Error('Ejecutá este comando directamente en una terminal interactiva.');
}

process.stdout.write('Ingresá una contraseña nueva (no se mostrará): ');
process.stdin.setRawMode(true);
process.stdin.resume();

let password = '';

process.stdin.on('data', async (chunk) => {
  for (const character of chunk.toString('utf8')) {
    if (character === '\u0003') {
      process.stdout.write('\nCancelado.\n');
      process.exit(1);
    }

    if (character === '\r' || character === '\n') {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');

      if (password.length < 12) {
        process.stderr.write('Usá una contraseña de al menos 12 caracteres.\n');
        process.exit(1);
      }

      const hash = await bcrypt.hash(password, 12);
      password = '';
      process.stdout.write(`${hash}\n`);
      process.exit(0);
    }

    if (character === '\u007f' || character === '\b') {
      password = password.slice(0, -1);
    } else if (character >= ' ') {
      password += character;
    }
  }
});
