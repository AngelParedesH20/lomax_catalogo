const { randomUUID } = require('crypto');
const { PutCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const cfg = require('../config');
const { pool, ddb } = require('../clients');
const { ApiError, conPaso, enRds } = require('../errores');

const SQL_BASE = `
  SELECT p.producto_id, p.codigo, p.nombre, p.descripcion, p.precio::float8 AS precio,
         p.categoria_id, c.nombre AS categoria, p.estado, p.fecha_registro
    FROM productos p JOIN categorias c ON c.categoria_id = p.categoria_id`;

async function obtenerItem(id) {
  const r = await ddb.send(new GetCommand({ TableName: cfg.tablaAtributos, Key: { producto_id: id } }));
  return r.Item || null;
}

async function guardarAtributos(id, atributos, extra) {
  await conPaso('dynamodb', () => ddb.send(new PutCommand({
    TableName: cfg.tablaAtributos,
    Item: {
      producto_id: id,
      atributos,
      imagen_original_key: null,
      miniatura_key: null,
      estado_procesamiento: 'PENDIENTE',
      error_procesamiento: null,
      actualizado: new Date().toISOString(),
    },
    ConditionExpression: 'attribute_not_exists(producto_id)',
  })), { producto_id: id, estado_producto: 'PENDIENTE', ...extra });
}

async function listarCategorias() {
  const r = await enRds(() => pool.query('SELECT categoria_id, nombre FROM categorias ORDER BY nombre'));
  return r.rows;
}

async function obtenerRds(id) {
  const r = await enRds(() => pool.query(`${SQL_BASE} WHERE p.producto_id = $1`, [id]));
  return r.rows[0] || null;
}

async function marcarEstado(id, estado) {
  await enRds(() => pool.query('UPDATE productos SET estado = $2 WHERE producto_id = $1', [id, estado]));
}

async function crearProducto(v) {
  const id = randomUUID();
  try {
    await enRds(() => pool.query(
      `INSERT INTO productos (producto_id, codigo, nombre, descripcion, precio, categoria_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, v.codigo, v.nombre, v.descripcion, v.precio, v.categoria_id]
    ));
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) {
      const r = await enRds(() => pool.query('SELECT producto_id, estado FROM productos WHERE codigo = $1', [v.codigo]));
      const fila = r.rows[0];
      if (fila) {
        const item = await conPaso('dynamodb', () => obtenerItem(fila.producto_id));
        if (fila.estado === 'PENDIENTE' && !item) {
          // Registro incompleto: se completa DynamoDB sin duplicar el producto
          await guardarAtributos(fila.producto_id, v.atributos);
          return { producto_id: fila.producto_id, codigo: v.codigo, estado: 'PENDIENTE', reanudado: true, pasos: { rds: 'existente', dynamodb: 'ok' } };
        }
        e.extra = { producto_id: fila.producto_id, estado_producto: fila.estado };
      }
    }
    throw e;
  }
  await guardarAtributos(id, v.atributos);
  return { producto_id: id, codigo: v.codigo, estado: 'PENDIENTE', reanudado: false, pasos: { rds: 'ok', dynamodb: 'ok' } };
}

function armarProducto(r, item) {
  return {
    producto_id: r.producto_id,
    codigo: r.codigo,
    nombre: r.nombre,
    descripcion: r.descripcion,
    precio: r.precio,
    categoria: { id: r.categoria_id, nombre: r.categoria },
    estado: r.estado,
    fecha_registro: r.fecha_registro,
    atributos: item?.atributos || {},
    imagen: {
      estado_procesamiento: item?.estado_procesamiento || 'PENDIENTE',
      original_key: item?.imagen_original_key || null,
      miniatura_key: item?.miniatura_key || null,
      ruta: item?.miniatura_key ? `/productos/${r.producto_id}/imagen` : null,
      error: item?.error_procesamiento || null,
    },
  };
}

async function listarPublicados(categoriaId) {
  const params = [];
  let filtro = '';
  if (categoriaId) { params.push(categoriaId); filtro = ' AND p.categoria_id = $1'; }
  const r = await enRds(() => pool.query(
    `${SQL_BASE} WHERE p.estado = 'PUBLICADO'${filtro} ORDER BY c.nombre, p.nombre`, params
  ));
  const items = await conPaso('dynamodb', () => Promise.all(r.rows.map((f) => obtenerItem(f.producto_id))));
  return r.rows.map((f, i) => armarProducto(f, items[i]));
}

async function detalle(id) {
  const fila = await obtenerRds(id);
  if (!fila) return null;
  const item = await conPaso('dynamodb', () => obtenerItem(id), { producto_id: id, estado_producto: fila.estado });
  return armarProducto(fila, item);
}

module.exports = { obtenerItem, listarCategorias, obtenerRds, marcarEstado, crearProducto, listarPublicados, detalle };