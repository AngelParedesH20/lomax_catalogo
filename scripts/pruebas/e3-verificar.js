// Uso: node scripts/pruebas/e3-verificar.js <producto_id> <original> <miniatura>
const Jimp = require('jimp');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');

const [, , productoId, rutaOriginal, rutaMiniatura] = process.argv;
const TABLA = process.env.DYNAMO_TABLE || 'ProductosAtributos';

(async () => {
  const o = (await Jimp.read(rutaOriginal)).bitmap;
  const m = (await Jimp.read(rutaMiniatura)).bitmap;

  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({
    region: process.env.AWS_DEFAULT_REGION || 'us-east-1',
    endpoint: process.env.AWS_ENDPOINT_URL || 'http://localhost:4566',
  }));
  const { Item } = await ddb.send(new GetCommand({ TableName: TABLA, Key: { producto_id: productoId } }));

  const claveEsperada = `miniaturas/${productoId}.jpg`;
  const dentroDeLimite = m.width <= 300 && m.height <= 300;
  const proporcional = Math.abs(o.width / o.height - m.width / m.height) < 0.02;
  const coincide = Item?.miniatura_key === claveEsperada;

  console.table([
    { comprobacion: 'Original descargado (px)', valor: `${o.width} x ${o.height}` },
    { comprobacion: 'Miniatura descargada (px)', valor: `${m.width} x ${m.height}` },
    { comprobacion: 'Miniatura <= 300 x 300', valor: dentroDeLimite ? 'SI' : 'NO' },
    { comprobacion: 'Proporcion conservada', valor: proporcional ? 'SI' : 'NO' },
    { comprobacion: 'miniatura_key en DynamoDB', valor: Item?.miniatura_key },
    { comprobacion: 'Coincide con la clave descargada', valor: coincide ? 'SI' : 'NO' },
    { comprobacion: 'estado_procesamiento', valor: Item?.estado_procesamiento },
    { comprobacion: 'atributos (leidos con el SDK)', valor: JSON.stringify(Item?.atributos) },
  ]);

  const ok = dentroDeLimite && proporcional && coincide && Item?.estado_procesamiento === 'LISTA';
  console.log(ok ? 'RESULTADO: OK' : 'RESULTADO: FALLA');
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e.message); process.exit(1); });