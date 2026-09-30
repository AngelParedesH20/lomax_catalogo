const express = require('express');
const { ApiError, asyncHandler } = require('../errores');
const { UUID_RE, validarProducto, detectarFormato } = require('../validaciones');
const productos = require('../services/productos.service');
const imagen = require('../services/imagen.service');
const recibirImagen = require('../middleware/upload');

const router = express.Router();

router.param('id', (req, res, next, id) => {
  if (!UUID_RE.test(id)) {
    return next(new ApiError(400, 'El identificador del producto no es válido', { paso: 'validacion' }));
  }
  next();
});

router.get('/', asyncHandler(async (req, res) => {
  let categoriaId;
  if (req.query.categoria_id !== undefined) {
    categoriaId = Number(req.query.categoria_id);
    if (!Number.isInteger(categoriaId) || categoriaId < 1) {
      throw new ApiError(400, 'categoria_id debe ser un entero positivo', { paso: 'validacion' });
    }
  }
  const lista = await productos.listarPublicados(categoriaId);
  res.set('X-Total-Count', String(lista.length));
  res.json(lista);
}));

router.post('/', asyncHandler(async (req, res) => {
  const { valor, errores } = validarProducto(req.body);
  if (errores) throw new ApiError(400, 'Datos de producto inválidos', { paso: 'validacion', detalles: errores });
  const r = await productos.crearProducto(valor);
  res.status(r.reanudado ? 200 : 201).json(r);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const p = await productos.detalle(req.params.id);
  if (!p) throw new ApiError(404, 'El producto no existe', { paso: 'rds' });
  res.json(p);
}));

router.post('/:id/imagen', recibirImagen, asyncHandler(async (req, res) => {
  const producto = await productos.obtenerRds(req.params.id);
  if (!producto) throw new ApiError(404, 'El producto no existe', { paso: 'rds' });
  if (!req.file) {
    throw new ApiError(400, 'Debe enviar el archivo en el campo "imagen" (multipart/form-data)', { paso: 'validacion' });
  }
  const formato = detectarFormato(req.file.buffer);
  if (!formato) throw new ApiError(415, 'Formato no permitido: solo JPEG o PNG válidos', { paso: 'validacion' });
  res.json(await imagen.registrarYProcesar(producto, req.file.buffer, formato));
}));

router.post('/:id/reprocesar', asyncHandler(async (req, res) => {
  const producto = await productos.obtenerRds(req.params.id);
  if (!producto) throw new ApiError(404, 'El producto no existe', { paso: 'rds' });
  res.json(await imagen.reprocesar(producto));
}));

router.get('/:id/imagen', asyncHandler(async (req, res) => {
  const version = req.query.version === 'original' ? 'original' : 'miniatura';
  const img = await imagen.leerImagen(req.params.id, version);
  if (!img) throw new ApiError(404, 'La imagen no está disponible', { paso: 's3' });
  res.set({
    'Content-Type': img.tipo,
    'Content-Length': String(img.bytes.length),
    'Cache-Control': 'no-cache',
    'X-Objeto-S3': img.key,
  });
  res.end(img.bytes);
}));

module.exports = router;