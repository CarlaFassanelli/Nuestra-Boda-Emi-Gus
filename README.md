# Invitación de Emilce y Gustavo

La invitación está servida por Express. El mismo servidor entrega la página, sus recursos estáticos, el panel privado y las rutas de la API. Vercel detecta `app.js` como punto de entrada y `vercel.json` incluye los archivos que Express necesita en su función.

## Desarrollo local

1. Usá Node.js 20 o superior y ejecutá `npm install`.
2. Copiá `.env.example` a `.env` y completá las credenciales de Spider-Web y del panel.
3. Iniciá el sitio con `npm start` y abrí `http://localhost:3000`.

Para configurar el panel, generá un hash con `npm run hash-password` y guardá el resultado en `ADMIN_PASSWORD_HASH`. La contraseña original no debe guardarse en el repositorio.

## Despliegue en Vercel

1. Importá el proyecto en Vercel manteniendo la raíz del proyecto en esta carpeta. No hace falta configurar un comando de build; Vercel detecta la aplicación Express.
2. En **Settings → Environment Variables**, agregá las variables de `.env.example`:
   - `NODE_ENV=production`
   - `APP_ORIGIN`: origen exacto del dominio público, por ejemplo `https://tu-dominio.vercel.app`, sin barra final.
   - `SPIDER_WEB_BASE_URL`, `SPIDER_WEB_DATABASE` y `SPIDER_WEB_API_KEY`.
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` y `SESSION_SECRET`.
   - `GIFT_ALIAS` y `GIFT_CBU`, para que los datos bancarios se inyecten al servir la tarjeta sin guardarlos en Git.
   - `ALLOW_OVER_CAPACITY=true` solo si querés permitir confirmaciones por encima de la capacidad invitada.
3. Creá en Spider-Web las tablas que usa la aplicación (`invitados`, `confirmaciones`, `canciones` y `usuarios_admin`) y cargá los invitados antes de probar los formularios. La conexión y las credenciales deben ser válidas desde Vercel.
4. Generá el `ADMIN_PASSWORD_HASH` con `npm run hash-password` y un `SESSION_SECRET` aleatorio de al menos 48 caracteres. No subas `.env` ni compartas estos valores.
5. Hacé el deploy y comprobá la invitación, la identificación de invitados, el envío de RSVP y el acceso a `/admin`.

La inicialización de la base se ejecuta de forma diferida al recibir solicitudes de la API, por lo que la función de Vercel no depende de un proceso de servidor permanente. Los datos se guardan en Spider-Web, no en el sistema de archivos efímero de Vercel. No publiques `.env` ni cargues credenciales o datos bancarios en GitHub; configurá los valores reales como variables de entorno en Vercel.

La página de la invitación puede servirse aunque todavía falte la configuración de la API. Si una búsqueda de invitado, confirmación o acceso al panel falla por variables ausentes, el endpoint devuelve un mensaje explícito con el nombre de la variable que hay que configurar.
