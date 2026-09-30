const express = require('express');
const cfg = require('./config');
const { ApiError, manejadorErrores } = require('./errores');

const app = express();
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('X-Instance-Id', cfg.instancia);
  const t = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - t} ms) [${cfg.instancia}]`);
  });
  next();
});

app.use(express.json({ limit: '100kb' }));

app.use(require('./routes/salud'));
app.use('/categorias', require('./routes/categorias'));
app.use('/productos', require('./routes/productos'));

app.use((req, res, next) => next(new ApiError(404, 'Ruta no encontrada', { paso: 'api' })));
app.use(manejadorErrores);

const server = app.listen(cfg.puerto, () => {
  console.log(`API Lomax escuchando en :${cfg.puerto} (instancia ${cfg.instancia})`);
});
process.on('SIGTERM', () => server.close(() => process.exit(0)));