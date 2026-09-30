const express = require('express');
const { asyncHandler } = require('../errores');
const { esquemaPara } = require('../validaciones');
const productos = require('../services/productos.service');

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  const filas = await productos.listarCategorias();
  res.set('X-Total-Count', String(filas.length));
  res.json(filas.map((c) => ({ ...c, atributos_sugeridos: esquemaPara(c.nombre) })));
}));

module.exports = router;