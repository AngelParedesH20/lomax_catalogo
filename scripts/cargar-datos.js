const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');

const TABLA = process.env.DYNAMO_TABLE || 'ProductosAtributos';
const productos = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'seed', 'productos.json'), 'utf8')
);

async function cargarRds() {
  const pg = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 7001),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  await pg.connect();
  let nuevos = 0;
  try {
    await pg.query('BEGIN');
    for (const nombre of new Set(productos.map((p) => p.categoria))) {
      await pg.query(
        'INSERT INTO categorias (nombre) VALUES ($1) ON CONFLICT (nombre) DO NOTHING',
        [nombre]
      );
    }
    for (const p of productos) {
      const r = await pg.query(
        `INSERT INTO productos (producto_id, codigo, nombre, descripcion, precio, categoria_id)
         VALUES ($1, $2, $3, $4, $5, (SELECT categoria_id FROM categorias WHERE nombre = $6))
         ON CONFLICT (codigo) DO NOTHING`,
        [p.producto_id, p.codigo, p.nombre, p.descripcion, p.precio, p.categoria]
      );
      nuevos += r.rowCount;
    }
    await pg.query('COMMIT');
  } catch (e) {
    await pg.query('ROLLBACK');
    throw e;
  } finally {
    await pg.end();
  }
  return { nuevos, existentes: productos.length - nuevos };
}

async function cargarDynamo() {
  const ddb = DynamoDBDocumentClient.from(
    new DynamoDBClient({
      region: process.env.AWS_DEFAULT_REGION || 'us-east-1',
      endpoint: process.env.AWS_ENDPOINT_URL || 'http://localhost:4566',
    }),
    { marshallOptions: { removeUndefinedValues: true } }
  );
  let nuevos = 0;
  let existentes = 0;
  for (const p of productos) {
    try {
      await ddb.send(
        new PutCommand({
          TableName: TABLA,
          Item: {
            producto_id: p.producto_id,
            atributos: p.atributos,
            imagen_original_key: null,
            miniatura_key: null,
            estado_procesamiento: 'PENDIENTE',
            actualizado: new Date().toISOString(),
          },
          // No pisa un ítem existente (conserva el estado de imagen ya procesado)
          ConditionExpression: 'attribute_not_exists(producto_id)',
        })
      );
      nuevos++;
    } catch (e) {
      if (e.name === 'ConditionalCheckFailedException') existentes++;
      else throw e;
    }
  }
  return { nuevos, existentes };
}

(async () => {
  try {
    const rds = await cargarRds();
    const ddb = await cargarDynamo();
    console.log(`RDS:      ${rds.nuevos} nuevos, ${rds.existentes} ya existían`);
    console.log(`DynamoDB: ${ddb.nuevos} nuevos, ${ddb.existentes} ya existían`);
  } catch (e) {
    console.error('ERROR en la carga:', e.message);
    process.exit(1);
  }
})();