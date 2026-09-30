const fs = require('fs');
const path = require('path');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const TABLA = process.env.DYNAMO_TABLE || 'ProductosAtributos';
const productos = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'seed', 'productos.json'), 'utf8'));
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({
  region: process.env.AWS_DEFAULT_REGION || 'us-east-1',
  endpoint: process.env.AWS_ENDPOINT_URL || 'http://localhost:4566',
}));

(async () => {
  for (const p of productos) {
    await ddb.send(new UpdateCommand({
      TableName: TABLA,
      Key: { producto_id: p.producto_id },
      UpdateExpression:
        'SET imagen_original_key = :n, miniatura_key = :n, error_procesamiento = :n, estado_procesamiento = :p, actualizado = :a',
      ExpressionAttributeValues: { ':n': null, ':p': 'PENDIENTE', ':a': new Date().toISOString() },
    }));
  }
  console.log(`${productos.length} ítems de DynamoDB devueltos a PENDIENTE`);
})().catch((e) => { console.error(e.message); process.exit(1); });