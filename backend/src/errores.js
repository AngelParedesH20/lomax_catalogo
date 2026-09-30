const cfg = require('./config');

class ApiError extends Error {
  constructor(status, mensaje, { paso = 'api', detalle, detalles, extra } = {}) {
    super(mensaje);
    this.status = status;
    this.paso = paso;
    this.detalle = detalle;
    this.detalles = detalles;
    this.extra = extra;
  }
}

const CODIGOS_CONEXION = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE']);

function esConexion(e) {
  return (
    CODIGOS_CONEXION.has(e?.code) ||
    CODIGOS_CONEXION.has(e?.cause?.code) ||
    ['TimeoutError', 'AbortError'].includes(e?.name) ||
    /timeout|ECONNREFUSED|getaddrinfo|Connection terminated/i.test(e?.message || '')
  );
}

// Ejecuta fn; si falla, lo convierte en 503 (sin conexion) o 502 (el servicio respondio con error)
async function conPaso(paso, fn, extra) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError) throw e;
    const sinConexion = esConexion(e);
    throw new ApiError(
      sinConexion ? 503 : 502,
      `Falla en el paso ${paso}: ${sinConexion ? 'servicio no disponible' : 'el servicio respondio con error'}`,
      { paso, detalle: `${e.name}: ${e.message}`, extra }
    );
  }
}

const MAPA_PG = {
  '23505': [409, 'Ya existe un producto con ese codigo'],
  '23503': [400, 'La categoria indicada no existe'],
  '23502': [400, 'Falta un campo obligatorio'],
  '23514': [400, 'Un valor incumple una restriccion (por ejemplo precio negativo o texto vacio)'],
  '22P02': [400, 'Formato de dato invalido'],
  '22001': [400, 'Un texto excede el largo permitido'],
  '22003': [400, 'Valor numerico fuera de rango'],
};

async function enRds(fn, extra) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError) throw e;
    const t = MAPA_PG[e.code];
    if (t) throw new ApiError(t[0], t[1], { paso: 'rds', detalle: e.constraint || e.column, extra });
    return conPaso('rds', async () => { throw e; }, extra);
  }
}

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function manejadorErrores(err, req, res, _next) {
  let e = err;
  if (e.type === 'entity.parse.failed') e = new ApiError(400, 'El cuerpo no es un JSON valido', { paso: 'validacion' });
  else if (e.type === 'entity.too.large') e = new ApiError(413, 'El cuerpo de la solicitud es demasiado grande', { paso: 'validacion' });
  if (!(e instanceof ApiError)) {
    console.error('[error no controlado]', err);
    e = new ApiError(500, 'Error interno del servidor', { paso: 'api' });
  }
  res.status(e.status).json({
    error: e.message,
    paso: e.paso,
    ...(e.detalles ? { detalles: e.detalles } : {}),
    ...(e.detalle ? { detalle: e.detalle } : {}),
    ...(e.extra || {}),
    instancia: cfg.instancia,
  });
}

module.exports = { ApiError, conPaso, enRds, asyncHandler, manejadorErrores };