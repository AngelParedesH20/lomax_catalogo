const crypto = require('crypto');
const { Client } = require('pg');

const INS = `INSERT INTO productos (producto_id, codigo, nombre, descripcion, precio, categoria_id)
             VALUES ($1, $2, $3, $4, $5, $6)`;

(async () => {
  const c = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 7001),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  await c.connect();

  const contar = async () => Number((await c.query('SELECT count(*) FROM productos')).rows[0].count);
  const params = (p) => [p.id, p.codigo, p.nombre, p.desc, p.precio, p.cat];

  await c.query("DELETE FROM productos WHERE codigo LIKE 'TEST-%'");
  const cat = (await c.query('SELECT categoria_id FROM categorias ORDER BY categoria_id LIMIT 1')).rows[0].categoria_id;
  const nuevo = (codigo, o = {}) => ({
    id: crypto.randomUUID(), codigo, nombre: 'Producto de prueba',
    desc: 'Descripción de prueba', precio: 10.5, cat, ...o,
  });

  const casos = [
    ['1. Inserción válida', nuevo('TEST-OK')],
    ['2. Código duplicado (TEC-001)', nuevo('TEC-001')],
    ['3. Precio negativo', nuevo('TEST-NEG', { precio: -5 })],
    ['4. Categoría inexistente', nuevo('TEST-CAT', { cat: 99999 })],
    ['5. Nombre vacío', nuevo('TEST-VACIO', { nombre: '   ' })],
    ['6. Descripción nula', nuevo('TEST-NULO', { desc: null })],
  ];

  const filas = [];
  for (const [caso, p] of casos) {
    const antes = await contar();
    let resultado = 'ACEPTADO';
    let detalle = '-';
    try {
      await c.query(INS, params(p));
    } catch (e) {
      resultado = 'RECHAZADO';
      detalle = `${e.code} ${e.constraint || e.column || ''}`.trim();
    }
    filas.push({ caso, resultado, detalle, filas_antes: antes, filas_despues: await contar() });
  }

  // 7. Transacción: el segundo INSERT es inválido -> nada debe quedar guardado
  const antes7 = await contar();
  let resultado7 = 'ACEPTADO';
  let detalle7 = '-';
  try {
    await c.query('BEGIN');
    await c.query(INS, params(nuevo('TEST-TX1')));
    await c.query(INS, params(nuevo('TEST-TX2', { precio: -1 })));
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK');
    resultado7 = 'RECHAZADO (ROLLBACK)';
    detalle7 = `${e.code} ${e.constraint || ''}`.trim();
  }
  filas.push({
    caso: '7. Transacción con 2 inserts (2.º inválido)',
    resultado: resultado7, detalle: detalle7, filas_antes: antes7, filas_despues: await contar(),
  });

  console.table(filas);

  const restos = (await c.query("SELECT codigo FROM productos WHERE codigo LIKE 'TEST-%' ORDER BY codigo")).rows;
  console.log('Registros TEST-* presentes (solo debe estar TEST-OK):', restos.map((r) => r.codigo).join(', '));

  await c.query("DELETE FROM productos WHERE codigo LIKE 'TEST-%'");
  console.log('Total final de productos (debe ser 20):', await contar());
  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });