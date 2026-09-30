const { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const Jimp = require('jimp');

const cfg = {
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: process.env.FLOCI_ENDPOINT || process.env.AWS_ENDPOINT_URL || undefined,
  credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
};
const s3 = new S3Client({ ...cfg, forcePathStyle: true });
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient(cfg));

const TABLA = process.env.TABLA_ATRIBUTOS || 'ProductosAtributos';
const BUCKET_MINIATURAS = process.env.BUCKET_MINIATURAS || 'lomax-miniaturas';
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_LADO = 300;

class ErrorNegocio extends Error {}

const esJpeg = (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
const esPng = (b) =>
  b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

async function actualizarDynamo(productoId, campos) {
  const claves = Object.keys(campos);
  await ddb.send(new UpdateCommand({
    TableName: TABLA,
    Key: { producto_id: productoId },
    UpdateExpression: 'SET ' + claves.map((k) => `#${k} = :${k}`).join(', '),
    ExpressionAttributeNames: Object.fromEntries(claves.map((k) => [`#${k}`, k])),
    ExpressionAttributeValues: Object.fromEntries(claves.map((k) => [`:${k}`, campos[k]])),
    ConditionExpression: 'attribute_exists(producto_id)',
  }));
}

async function registrarError(productoId, key, motivo) {
  try {
    await actualizarDynamo(productoId, {
      imagen_original_key: key,
      miniatura_key: null,
      estado_procesamiento: 'ERROR',
      error_procesamiento: motivo,
      actualizado: new Date().toISOString(),
    });
  } catch (_) { /* el producto puede no existir en DynamoDB */ }
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET_MINIATURAS, Key: `miniaturas/${productoId}.jpg` }));
  } catch (_) { /* nada que borrar */ }
}

exports.handler = async (event) => {
  const { producto_id: productoId, bucket, key } = event || {};
  if (!productoId || !bucket || !key) {
    return { ok: false, estado: 'ERROR', motivo: 'Evento incompleto: se requiere producto_id, bucket y key' };
  }
  const claveMiniatura = `miniaturas/${productoId}.jpg`;

  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const original = Buffer.from(await obj.Body.transformToByteArray());

    if (original.length > MAX_BYTES) throw new ErrorNegocio('La imagen supera el máximo de 5 MB');
    if (!esJpeg(original) && !esPng(original)) throw new ErrorNegocio('Formato no permitido: solo JPEG o PNG');

    let imagen;
    try {
      imagen = await Jimp.read(original);
    } catch (_) {
      throw new ErrorNegocio('El archivo está dañado o no es una imagen válida');
    }

    const { width, height } = imagen.bitmap;
    const escala = Math.min(1, MAX_LADO / width, MAX_LADO / height);
    const w = Math.max(1, Math.round(width * escala));
    const h = Math.max(1, Math.round(height * escala));
    imagen.resize(w, h);
    const lienzo = new Jimp(w, h, 0xffffffff);
    lienzo.composite(imagen, 0, 0);
    const salida = await lienzo.quality(85).getBufferAsync(Jimp.MIME_JPEG);

    await s3.send(new PutObjectCommand({
      Bucket: BUCKET_MINIATURAS, Key: claveMiniatura, Body: salida, ContentType: 'image/jpeg',
    }));

    await actualizarDynamo(productoId, {
      imagen_original_key: key,
      miniatura_key: claveMiniatura,
      estado_procesamiento: 'LISTA',
      error_procesamiento: null,
      actualizado: new Date().toISOString(),
    });

    return {
      ok: true,
      estado: 'LISTA',
      producto_id: productoId,
      original: { clave: key, ancho: width, alto: height, bytes: original.length },
      miniatura: { bucket: BUCKET_MINIATURAS, clave: claveMiniatura, ancho: w, alto: h, bytes: salida.length },
    };
  } catch (e) {
    const conocido = e instanceof ErrorNegocio || e.name === 'NoSuchKey';
    const motivo = e.name === 'NoSuchKey' ? 'El objeto original no existe en S3' : e.message;
    await registrarError(productoId, key, motivo);
    if (!conocido) throw e;
    return { ok: false, estado: 'ERROR', producto_id: productoId, motivo };
  }
};