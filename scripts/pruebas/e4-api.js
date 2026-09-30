const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { Pool } = require('pg');
const Jimp = require('jimp');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const {
  S3Client, ListObjectsV2Command, HeadObjectCommand, GetObjectCommand, DeleteObjectCommand,
} = require('@aws-sdk/client-s3');

const API = process.env.API_URL || 'http://localhost:3000';
const RAIZ = path.join(__dirname, '..', '..');
const EV = path.join(RAIZ, 'evidencias', 'E4');
const PRUEBAS = path.join(RAIZ, 'seed', 'pruebas');
const BK_ORIG = 'lomax-originales';
const BK_MINI = 'lomax-miniaturas';
const TABLA = 'ProductosAtributos';

const aws = {
  region: 'us-east-1',
  endpoint: process.env.AWS_ENDPOINT_URL || 'http://localhost:4566',
  credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
};
const s3 = new S3Client({ ...aws, forcePathStyle: true });
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient(aws));
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 7001),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  max: 2,
});

// ---------- acceso directo a los servicios ----------
const rds = async (sql, p = []) => (await pool.query(sql, p)).rows;
const item = async (id) => (await ddb.send(new GetCommand({ TableName: TABLA, Key: { producto_id: id } }))).Item || null;
const listar = async (bucket, prefix) =>
  ((await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }))).Contents || []).map((o) => o.Key);
const existe = async (bucket, key) => {
  try { await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key })); return true; } catch (_) { return false; }
};
const bajar = async (bucket, key) =>
  Buffer.from(await (await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))).Body.transformToByteArray());
const objetosDe = async (id) => ({
  originales: await listar(BK_ORIG, `originales/${id}`),
  miniaturas: await listar(BK_MINI, `miniaturas/${id}`),
});
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);

// ---------- cliente HTTP ----------
async function http(metodo, ruta, { json, form } = {}) {
  const opts = { method: metodo, headers: {} };
  if (json !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(json); }
  if (form) opts.body = form;
  const r = await fetch(API + ruta, opts);
  const bytes = Buffer.from(await r.arrayBuffer());
  let cuerpo = null;
  try { cuerpo = JSON.parse(bytes.toString('utf8')); } catch (_) { /* no es JSON */ }
  return { status: r.status, tipo: r.headers.get('content-type'), instancia: r.headers.get('x-instance-id'), cuerpo, bytes };
}
const formImagen = (buf, tipo = 'image/jpeg', nombre = 'foto.jpg') => {
  const f = new FormData();
  f.append('imagen', new Blob([buf], { type: tipo }), nombre);
  return f;
};
function estadoConCurl(ruta, archivo) {
  const cmd = process.platform === 'win32' ? 'curl.exe' : 'curl';
  const nulo = process.platform === 'win32' ? 'NUL' : '/dev/null';
  return Number(execFileSync(cmd, ['-s', '-o', nulo, '-w', '%{http_code}', '-X', 'POST', '-F', `imagen=@${archivo}`, API + ruta]).toString().trim());
}

// ---------- registro de resultados ----------
const resultados = [];
async function caso(nombre, peticion, esperado, fn) {
  try {
    const r = await fn();
    resultados.push({ nombre, peticion, esperado, http: r.status, detalle: r.detalle, ok: r.status === esperado && r.ok });
  } catch (e) {
    resultados.push({ nombre, peticion, esperado, http: 'ERROR', detalle: e.message, ok: false });
  }
}

function escribirReporte() {
  const okN = resultados.filter((r) => r.ok).length;
  const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const lineas = [
    '# Reporte E4 - Verificación de la API', '',
    `- Fecha: ${new Date().toISOString()}`,
    `- API: ${API}`,
    `- Casos correctos: ${okN} de ${resultados.length}`, '',
    '| # | Caso | Petición | Esperado | HTTP | Verificación directa (RDS / DynamoDB / S3) | Resultado |',
    '|---|------|----------|----------|------|--------------------------------------------|-----------|',
    ...resultados.map((r, i) =>
      `| ${i + 1} | ${esc(r.nombre)} | ${esc(r.peticion)} | ${r.esperado} | ${r.http} | ${esc(r.detalle)} | ${r.ok ? 'OK' : 'FALLA'} |`),
  ];
  fs.writeFileSync(path.join(EV, 'reporte-e4.md'), lineas.join('\n'), 'utf8');
  fs.writeFileSync(path.join(EV, 'reporte-e4.json'), JSON.stringify(resultados, null, 2), 'utf8');
  console.table(resultados.map((r, i) => ({
    '#': i + 1, caso: r.nombre, esperado: r.esperado, http: r.http, resultado: r.ok ? 'OK' : 'FALLA',
  })));
  console.log(`Casos correctos: ${okN} de ${resultados.length}`);
  return okN === resultados.length;
}

async function limpiar(id) {
  if (!id) return;
  const o = await objetosDe(id);
  for (const k of o.originales) await s3.send(new DeleteObjectCommand({ Bucket: BK_ORIG, Key: k }));
  for (const k of o.miniaturas) await s3.send(new DeleteObjectCommand({ Bucket: BK_MINI, Key: k }));
  await ddb.send(new DeleteCommand({ TableName: TABLA, Key: { producto_id: id } }));
  await pool.query('DELETE FROM productos WHERE producto_id = $1', [id]);
}

// ---------- pruebas ----------
(async () => {
  fs.mkdirSync(EV, { recursive: true });
  const codigo = `E4-${Date.now().toString(36).toUpperCase()}`;
  const jpg = fs.readFileSync(path.join(PRUEBAS, 'original-1200x800.jpg'));
  const png = fs.readFileSync(path.join(PRUEBAS, 'png-valido.png'));
  const invalido = fs.readFileSync(path.join(PRUEBAS, 'invalido.jpg'));
  let id;
  let categoriaId;
  let miniS3;
  let antes;

  await caso('Listar categorías', 'GET /categorias', 200, async () => {
    const r = await http('GET', '/categorias');
    const filas = await rds('SELECT categoria_id, nombre FROM categorias ORDER BY nombre');
    categoriaId = filas[0].categoria_id;
    const f = (a) => a.map((c) => `${c.categoria_id}:${c.nombre}`).sort().join('|');
    const coincide = Array.isArray(r.cuerpo) && f(r.cuerpo) === f(filas);
    return { status: r.status, ok: coincide && filas.length >= 3, detalle: `API=${r.cuerpo?.length} categorías; RDS=${filas.length}; coinciden=${coincide}` };
  });

  const valido = {
    codigo, nombre: 'Producto de prueba E4', descripcion: 'Producto creado por la verificación E4',
    precio: 123.45, categoria_id: categoriaId, atributos: { conexion: 'USB', distribucion: 'Español', retroiluminado: true },
  };

  await caso('Crear producto válido', 'POST /productos', 201, async () => {
    const r = await http('POST', '/productos', { json: valido });
    id = r.cuerpo?.producto_id;
    const fila = id ? (await rds('SELECT * FROM productos WHERE producto_id = $1', [id]))[0] : null;
    const it = id ? await item(id) : null;
    const ok = r.cuerpo?.estado === 'PENDIENTE' && fila?.estado === 'PENDIENTE' && fila?.codigo === codigo &&
      Number(fila?.precio) === 123.45 && it?.atributos?.conexion === 'USB' && it?.estado_procesamiento === 'PENDIENTE';
    return { status: r.status, ok, detalle: `HTTP estado=${r.cuerpo?.estado}; RDS estado=${fila?.estado}, código=${fila?.codigo}; DynamoDB atributos=${JSON.stringify(it?.atributos)}, estado_procesamiento=${it?.estado_procesamiento}` };
  });

  if (!id) {
    console.error('No se pudo crear el producto de prueba; se aborta.');
    escribirReporte();
    await pool.end();
    process.exit(1);
  }

  await caso('Código duplicado', 'POST /productos (mismo código)', 409, async () => {
    const r = await http('POST', '/productos', { json: valido });
    const n = (await rds('SELECT count(*)::int AS n FROM productos WHERE codigo = $1', [codigo]))[0].n;
    return { status: r.status, ok: n === 1 && r.cuerpo?.producto_id === id, detalle: `RDS filas con ese código=${n}; paso=${r.cuerpo?.paso}; devuelve el producto_id existente=${r.cuerpo?.producto_id === id}` };
  });

  const rechazado = async (etiqueta, cuerpo, codigoBuscado) => {
    const r = await http('POST', '/productos', { json: cuerpo });
    const n = (await rds('SELECT count(*)::int AS n FROM productos WHERE codigo = $1', [codigoBuscado]))[0].n;
    return { status: r.status, ok: n === 0 && r.cuerpo?.paso === 'validacion' || (n === 0 && r.cuerpo?.paso === 'rds'), detalle: `${etiqueta}; RDS filas creadas=${n}; paso=${r.cuerpo?.paso}; detalles=${JSON.stringify(r.cuerpo?.detalles || r.cuerpo?.detalle || '')}` };
  };
  await caso('Precio negativo', 'POST /productos (precio -5)', 400, () => rechazado('precio negativo', { ...valido, codigo: `${codigo}-N`, precio: -5 }, `${codigo}-N`));
  await caso('Categoría inexistente', 'POST /productos (categoria_id 99999)', 400, () => rechazado('categoría inexistente', { ...valido, codigo: `${codigo}-C`, categoria_id: 99999 }, `${codigo}-C`));
  await caso('Campos obligatorios ausentes', 'POST /productos ({codigo})', 400, () => rechazado('faltan campos', { codigo: `${codigo}-F` }, `${codigo}-F`));
  await caso('Atributos vacíos', 'POST /productos (atributos {})', 400, () => rechazado('atributos vacíos', { ...valido, codigo: `${codigo}-A`, atributos: {} }, `${codigo}-A`));

  await caso('Detalle de producto pendiente', 'GET /productos/{id}', 200, async () => {
    const r = await http('GET', `/productos/${id}`);
    const fila = (await rds('SELECT estado FROM productos WHERE producto_id = $1', [id]))[0];
    return { status: r.status, ok: r.cuerpo?.estado === 'PENDIENTE' && fila?.estado === 'PENDIENTE' && r.cuerpo?.atributos?.conexion === 'USB', detalle: `HTTP estado=${r.cuerpo?.estado}; RDS estado=${fila?.estado}; atributos vía DynamoDB=${JSON.stringify(r.cuerpo?.atributos)}` };
  });

  await caso('La lista solo trae publicados', 'GET /productos', 200, async () => {
    const r = await http('GET', '/productos');
    const pub = (await rds("SELECT count(*)::int AS n FROM productos WHERE estado = 'PUBLICADO'"))[0].n;
    const lista = Array.isArray(r.cuerpo) ? r.cuerpo : [];
    const ok = lista.every((p) => p.estado === 'PUBLICADO') && !lista.some((p) => p.producto_id === id) && lista.length === pub;
    return { status: r.status, ok, detalle: `HTTP devuelve ${lista.length}; RDS publicados=${pub}; el pendiente no aparece=${!lista.some((p) => p.producto_id === id)}` };
  });

  await caso('Producto inexistente', 'GET /productos/{uuid inexistente}', 404, async () => {
    const r = await http('GET', '/productos/00000000-0000-4000-8000-000000000000');
    return { status: r.status, ok: r.cuerpo?.paso === 'rds', detalle: `paso=${r.cuerpo?.paso}` };
  });
  await caso('Identificador mal formado', 'GET /productos/no-es-uuid', 400, async () => {
    const r = await http('GET', '/productos/no-es-uuid');
    return { status: r.status, ok: r.cuerpo?.paso === 'validacion', detalle: `paso=${r.cuerpo?.paso}` };
  });

  await caso('Imagen no disponible', 'GET /productos/{id}/imagen (sin imagen)', 404, async () => {
    const r = await http('GET', `/productos/${id}/imagen`);
    const o = await objetosDe(id);
    return { status: r.status, ok: o.miniaturas.length === 0, detalle: `S3 miniaturas del producto=${o.miniaturas.length}` };
  });

  await caso('Reprocesar sin original', 'POST /productos/{id}/reprocesar', 409, async () => {
    const r = await http('POST', `/productos/${id}/reprocesar`);
    const o = await objetosDe(id);
    return { status: r.status, ok: o.originales.length === 0, detalle: `S3 originales del producto=${o.originales.length}; paso=${r.cuerpo?.paso}` };
  });

  await caso('Imagen con formato no permitido', 'POST /productos/{id}/imagen (texto renombrado .jpg)', 415, async () => {
    const r = await http('POST', `/productos/${id}/imagen`, { form: formImagen(invalido) });
    const fila = (await rds('SELECT estado FROM productos WHERE producto_id = $1', [id]))[0];
    const o = await objetosDe(id);
    return { status: r.status, ok: fila.estado === 'PENDIENTE' && o.originales.length === 0, detalle: `RDS estado=${fila.estado}; S3 originales=${o.originales.length}` };
  });

  await caso('Imagen de más de 5 MB', 'POST /productos/{id}/imagen (6 MB)', 413, async () => {
    const status = estadoConCurl(`/productos/${id}/imagen`, path.join(PRUEBAS, 'grande-6mb.jpg'));
    const fila = (await rds('SELECT estado FROM productos WHERE producto_id = $1', [id]))[0];
    const o = await objetosDe(id);
    return { status, ok: fila.estado === 'PENDIENTE' && o.originales.length === 0, detalle: `RDS estado=${fila.estado}; S3 originales=${o.originales.length}` };
  });

  await caso('Publicar con imagen válida', 'POST /productos/{id}/imagen (JPEG 1200x800)', 200, async () => {
    const r = await http('POST', `/productos/${id}/imagen`, { form: formImagen(jpg) });
    const fila = (await rds('SELECT estado FROM productos WHERE producto_id = $1', [id]))[0];
    const it = await item(id);
    const claveMini = `miniaturas/${id}.jpg`;
    const hayOrig = await existe(BK_ORIG, `originales/${id}.jpg`);
    const hayMini = await existe(BK_MINI, claveMini);
    miniS3 = hayMini ? await bajar(BK_MINI, claveMini) : Buffer.alloc(0);
    const dim = hayMini ? (await Jimp.read(miniS3)).bitmap : {};
    const ok = r.cuerpo?.estado === 'PUBLICADO' && fila?.estado === 'PUBLICADO' && it?.estado_procesamiento === 'LISTA' &&
      it?.miniatura_key === claveMini && hayOrig && hayMini && dim.width === 300 && dim.height === 200;
    return { status: r.status, ok, detalle: `RDS estado=${fila?.estado}; DynamoDB estado_procesamiento=${it?.estado_procesamiento}, miniatura_key=${it?.miniatura_key}; S3 original=${hayOrig}, miniatura=${hayMini} (${dim.width}x${dim.height})` };
  });

  await caso('Obtener miniatura', 'GET /productos/{id}/imagen', 200, async () => {
    const r = await http('GET', `/productos/${id}/imagen`);
    fs.writeFileSync(path.join(EV, 'imagen-endpoint.jpg'), r.bytes);
    fs.writeFileSync(path.join(EV, 'imagen-s3.jpg'), miniS3);
    const iguales = sha(r.bytes) === sha(miniS3);
    return { status: r.status, ok: iguales && r.tipo === 'image/jpeg', detalle: `Content-Type=${r.tipo}; SHA-256 endpoint=${sha(r.bytes)} / S3=${sha(miniS3)}; idénticos=${iguales}; ${r.bytes.length} bytes` };
  });

  await caso('Catálogo combina RDS + DynamoDB', 'GET /productos', 200, async () => {
    const r = await http('GET', '/productos');
    const p = (r.cuerpo || []).find((x) => x.producto_id === id);
    const it = await item(id);
    const ok = Boolean(p) && p.estado === 'PUBLICADO' && JSON.stringify(p.atributos) === JSON.stringify(it.atributos) &&
      p.imagen?.ruta === `/productos/${id}/imagen` && p.imagen?.miniatura_key === it.miniatura_key;
    return { status: r.status, ok, detalle: `aparece=${Boolean(p)}; atributos HTTP = DynamoDB: ${JSON.stringify(p?.atributos) === JSON.stringify(it?.atributos)}; miniatura_key HTTP = DynamoDB: ${p?.imagen?.miniatura_key === it?.miniatura_key}` };
  });

  await caso('Detalle de producto publicado', 'GET /productos/{id}', 200, async () => {
    const r = await http('GET', `/productos/${id}`);
    const fila = (await rds('SELECT estado FROM productos WHERE producto_id = $1', [id]))[0];
    return { status: r.status, ok: r.cuerpo?.estado === 'PUBLICADO' && fila.estado === 'PUBLICADO', detalle: `HTTP estado=${r.cuerpo?.estado}; RDS estado=${fila.estado}; instancia=${r.instancia}` };
  });

  antes = await objetosDe(id);
  await caso('Reprocesar (sin duplicar objetos)', 'POST /productos/{id}/reprocesar', 200, async () => {
    const r = await http('POST', `/productos/${id}/reprocesar`);
    const despues = await objetosDe(id);
    const igual = JSON.stringify(antes) === JSON.stringify(despues);
    return { status: r.status, ok: r.cuerpo?.estado === 'PUBLICADO' && igual, detalle: `S3 antes=${JSON.stringify(antes)}; después=${JSON.stringify(despues)}; sin objetos extra=${igual}` };
  });

  await caso('Repetir la carga de la misma imagen', 'POST /productos/{id}/imagen (repetida)', 200, async () => {
    const r = await http('POST', `/productos/${id}/imagen`, { form: formImagen(jpg) });
    const despues = await objetosDe(id);
    const igual = JSON.stringify(antes) === JSON.stringify(despues);
    return { status: r.status, ok: r.cuerpo?.estado === 'PUBLICADO' && igual, detalle: `S3 originales=${despues.originales.length}, miniaturas=${despues.miniaturas.length}; sin objetos extra=${igual}` };
  });

  await caso('Reemplazar JPEG por PNG', 'POST /productos/{id}/imagen (PNG)', 200, async () => {
    const r = await http('POST', `/productos/${id}/imagen`, { form: formImagen(png, 'image/png', 'foto.png') });
    const o = await objetosDe(id);
    const it = await item(id);
    const ok = r.cuerpo?.estado === 'PUBLICADO' && o.originales.length === 1 && o.originales[0].endsWith('.png') &&
      o.miniaturas.length === 1 && it.imagen_original_key === o.originales[0];
    return { status: r.status, ok, detalle: `S3 originales=${JSON.stringify(o.originales)}, miniaturas=${JSON.stringify(o.miniaturas)}; DynamoDB imagen_original_key=${it?.imagen_original_key}` };
  });

  // Limpieza: se elimina el producto de prueba para dejar el catálogo intacto
  await limpiar(id);
  const total = (await rds('SELECT count(*)::int AS n FROM productos'))[0].n;
  resultados.push({
    nombre: 'Limpieza del producto de prueba', peticion: '(directo a RDS, DynamoDB y S3)', esperado: 20, http: total,
    detalle: `RDS productos tras la limpieza=${total}`, ok: total === 20,
  });

  const todoOk = escribirReporte();
  await pool.end();
  process.exit(todoOk ? 0 : 1);
})().catch(async (e) => { console.error(e); try { await pool.end(); } catch (_) { /* nada */ } process.exit(1); });