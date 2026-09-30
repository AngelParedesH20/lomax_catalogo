const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ESQUEMAS = {
  Teclados: [
    { clave: 'conexion', etiqueta: 'Conexión', tipo: 'select', opciones: ['USB', 'Bluetooth', 'Inalámbrico 2.4 GHz'] },
    { clave: 'distribucion', etiqueta: 'Distribución', tipo: 'select', opciones: ['Español', 'Inglés (US)'] },
    { clave: 'retroiluminado', etiqueta: 'Retroiluminado', tipo: 'boolean' },
  ],
  Monitores: [
    { clave: 'pulgadas', etiqueta: 'Pulgadas', tipo: 'number' },
    { clave: 'resolucion', etiqueta: 'Resolución', tipo: 'select', opciones: ['1366x768', '1920x1080', '2560x1440', '3840x2160'] },
    { clave: 'frecuencia_hz', etiqueta: 'Frecuencia (Hz)', tipo: 'number' },
  ],
};
ESQUEMAS.Televisores = ESQUEMAS.Monitores;

const esquemaPara = (nombre) => ESQUEMAS[nombre] || [];

function validarProducto(b) {
  const errores = [];
  const err = (campo, mensaje) => errores.push({ campo, mensaje });
  if (!b || typeof b !== 'object' || Array.isArray(b)) {
    return { errores: [{ campo: 'body', mensaje: 'Se esperaba un objeto JSON' }] };
  }

  const texto = (campo, max) => {
    const v = b[campo];
    if (typeof v !== 'string' || v.trim() === '') { err(campo, 'Es obligatorio y debe ser un texto no vacío'); return undefined; }
    if (v.trim().length > max) { err(campo, `Máximo ${max} caracteres`); return undefined; }
    return v.trim();
  };

  const codigo = texto('codigo', 20);
  if (codigo && !/^[A-Za-z0-9._-]+$/.test(codigo)) err('codigo', 'Solo letras, números, punto, guion y guion bajo');
  const nombre = texto('nombre', 120);
  const descripcion = texto('descripcion', 2000);

  let precio = b.precio;
  if (typeof precio === 'string' && precio.trim() !== '') precio = Number(precio);
  if (typeof precio !== 'number' || !Number.isFinite(precio)) err('precio', 'Es obligatorio y debe ser numérico');
  else if (precio < 0) err('precio', 'No puede ser negativo');
  else if (precio > 99999999.99) err('precio', 'Excede el máximo permitido');
  else if (Math.round(precio * 100) / 100 !== precio) err('precio', 'Máximo 2 decimales');

  let categoriaId = b.categoria_id;
  if (typeof categoriaId === 'string' && /^\d+$/.test(categoriaId.trim())) categoriaId = Number(categoriaId);
  if (!Number.isInteger(categoriaId) || categoriaId < 1) err('categoria_id', 'Es obligatorio y debe ser un entero positivo');

  const limpios = {};
  const atr = b.atributos;
  if (!atr || typeof atr !== 'object' || Array.isArray(atr)) {
    err('atributos', 'Es obligatorio y debe ser un objeto');
  } else {
    const claves = Object.keys(atr);
    if (claves.length === 0) err('atributos', 'Debe incluir al menos un atributo');
    if (claves.length > 20) err('atributos', 'Máximo 20 atributos');
    for (const k of claves) {
      const v = atr[k];
      if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(k)) err(`atributos.${k}`, 'Nombre inválido (letras, números y guion bajo)');
      else if (typeof v === 'string') {
        if (v.trim() === '' || v.length > 200) err(`atributos.${k}`, 'Texto vacío o de más de 200 caracteres');
        else limpios[k] = v.trim();
      } else if (typeof v === 'number') {
        if (!Number.isFinite(v)) err(`atributos.${k}`, 'Número inválido');
        else limpios[k] = v;
      } else if (typeof v === 'boolean') limpios[k] = v;
      else err(`atributos.${k}`, 'Solo se admite texto, número o booleano');
    }
  }

  if (errores.length) return { errores };
  return { valor: { codigo, nombre, descripcion, precio, categoria_id: categoriaId, atributos: limpios } };
}

function detectarFormato(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { ext: 'png', mime: 'image/png' };
  }
  return null;
}

module.exports = { UUID_RE, esquemaPara, validarProducto, detectarFormato };