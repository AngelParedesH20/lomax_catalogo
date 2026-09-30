const multer = require('multer');
const cfg = require('../config');
const { ApiError } = require('../errores');

const subir = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: cfg.maxBytes, files: 1, fields: 5 },
}).single('imagen');

module.exports = function recibirImagen(req, res, next) {
  subir(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(new ApiError(413, 'La imagen supera el máximo de 5 MB', { paso: 'validacion' }));
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return next(new ApiError(400, 'El archivo debe enviarse en el campo "imagen"', { paso: 'validacion' }));
    }
    return next(new ApiError(400, 'Solicitud multipart inválida', { paso: 'validacion', detalle: err.message }));
  });
};