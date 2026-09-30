const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const TABLA = process.env.DYNAMO_TABLE || 'ProductosAtributos';
const ordenar = (v) =>
  Array.isArray(v) ? v.map(ordenar)
  : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, ordenar(v[k])]))
    : v;

(async () => {
  const maestro = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'seed', 'productos.json'), 'utf8'));
  const esperadas = {};
  for (const p of maestro) esperadas[p.categoria] = Object.keys(p.atributos).sort().join(',');

  const pg = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 7001),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  await pg.connect();
  const { rows } = await pg.query(
    `SELECT p.producto_id, p.codigo, p.nombre, p.descripcion, p.precio::text AS precio,
            c.nombre AS categoria, p.estado, p.fecha_registro
       FROM productos p JOIN categorias c USING (categoria_id) ORDER BY p.codigo`
  );
  await pg.end();

  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({
    region: process.env.AWS_DEFAULT_REGION || 'us-east-1',
    endpoint: process.env.AWS_ENDPOINT_URL || 'http://localhost:4566',
  }));
  const scan = await ddb.send(new ScanCommand({ TableName: TABLA }));
  const items = new Map(scan.Items.map((i) => [i.producto_id, i]));

  let fallas = 0;
  const huella = [];
  for (const r of rows) {
    const it = items.get(r.producto_id);
    const claves = it ? Object.keys(it.atributos || {}).sort().join(',') : '';
    const ok = Boolean(it) && claves === esperadas[r.categoria];
    if (!ok) fallas++;
    console.log(
      `${r.codigo.padEnd(8)}| ${r.categoria.padEnd(11)}| ${r.estado.padEnd(10)}| ` +
      `${it ? 'DDB presente ' : 'DDB AUSENTE  '}| ${claves || '-'} | ${ok ? 'OK' : 'FALLA'}`
    );
    huella.push(JSON.stringify([
      r.producto_id, r.codigo, r.nombre, r.descripcion, r.precio, r.categoria, r.estado,
      new Date(r.fecha_registro).toISOString(), ordenar(it || null),
    ]));
  }
  const ids = new Set(rows.map((r) => r.producto_id));
  const huerfanos = [...items.keys()].filter((id) => !ids.has(id));

  console.log(`RDS: ${rows.length} productos | DynamoDB: ${items.size} ítems | huérfanos: ${huerfanos.length} | fallas: ${fallas}`);
  console.log('HUELLA:', crypto.createHash('sha256').update(huella.join('\n')).digest('hex').slice(0, 16));
  if (fallas || huerfanos.length) process.exit(1);
})().catch((e) => { console.error(e.message); process.exit(1); });