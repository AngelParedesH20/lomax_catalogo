const { PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { InvokeCommand } = require('@aws-sdk/client-lambda');
const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const cfg = require('../config');
const { s3, ddb, lambda } = require('../clients');
const { ApiError, conPaso } = require('../errores');
const productos = require('./productos.service');

const noExiste = (e) => e?.name === 'NotFound' || e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404;

async function existeObjeto(bucket, key, extra) {
  return conPaso('s3', async () => {
    try {
      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return true;
    } catch (e) {
      if (noExiste(e)) return false;
      throw e;
    }
  }, extra);
}

function estadoDesdeMotivo(m = '') {
  if (/5 MB/.test(m)) return 413;
  if (/no existe en S3/.test(m)) return 409;
  if (/Formato|dañado|imagen válida/.test(m)) return 415;
  return 422;
}

async function procesar(producto, key) {
  const id = producto.producto_id;
  const extra = { producto_id: id, estado_producto: producto.estado };

  // 1. Lambda (invocación síncrona)
  const resp = await conPaso('lambda', () => lambda.send(
    new InvokeCommand({
      FunctionName: cfg.funcionLambda,
      InvocationType: 'RequestResponse',
      Payload: Buffer.from(JSON.stringify({ producto_id: id, bucket: cfg.bucketOriginales, key })),
    }),
    { abortSignal: AbortSignal.timeout(40000) }
  ), extra);

  const texto = resp.Payload ? Buffer.from(resp.Payload).toString('utf8') : '';
  let salida = null;
  try { salida = JSON.parse(texto); } catch (_) { /* respuesta no JSON */ }

  if (resp.FunctionError) {
    throw new ApiError(502, 'La función Lambda terminó con error', {
      paso: 'lambda', detalle: salida?.errorMessage || texto.slice(0, 300), extra,
    });
  }
  if (!salida || salida.ok !== true) {
    await productos.marcarEstado(id, 'PENDIENTE').catch(() => {});
    const motivo = salida?.motivo || 'La imagen no pudo procesarse';
    throw new ApiError(estadoDesdeMotivo(motivo), motivo, {
      paso: 'lambda',
      extra: { producto_id: id, estado_producto: 'PENDIENTE', estado_procesamiento: 'ERROR' },
    });
  }

  // 2. Verificación directa: atributos y estado en DynamoDB, miniatura en S3
  const item = await conPaso('dynamodb', () => productos.obtenerItem(id), extra);
  if (!item || !item.atributos || Object.keys(item.atributos).length === 0) {
    throw new ApiError(502, 'No se pudieron confirmar los atributos del producto en DynamoDB', { paso: 'dynamodb', extra });
  }
  if (item.estado_procesamiento !== 'LISTA' || !item.miniatura_key) {
    throw new ApiError(502, 'DynamoDB no registra la miniatura como LISTA', { paso: 'dynamodb', extra });
  }
  if (!(await existeObjeto(cfg.bucketMiniaturas, item.miniatura_key, extra))) {
    await productos.marcarEstado(id, 'PENDIENTE').catch(() => {});
    throw new ApiError(502, 'La miniatura no está disponible en S3', { paso: 's3', extra });
  }

  // 3. Publicación en RDS
  await productos.marcarEstado(id, 'PUBLICADO');
  return {
    producto_id: id,
    codigo: producto.codigo,
    estado: 'PUBLICADO',
    imagen: {
      original_key: key,
      miniatura_key: item.miniatura_key,
      ruta: `/productos/${id}/imagen`,
      original: salida.original,
      miniatura: salida.miniatura,
    },
    verificaciones: { atributos_dynamodb: true, miniatura_s3: true, estado_procesamiento: item.estado_procesamiento },
  };
}

async function registrarYProcesar(producto, buffer, formato) {
  const id = producto.producto_id;
  const extra = { producto_id: id, estado_producto: producto.estado };

  const item = await conPaso('dynamodb', () => productos.obtenerItem(id), extra);
  if (!item) {
    throw new ApiError(409, 'El producto no tiene atributos en DynamoDB; repita POST /productos con el mismo código para completarlo', { paso: 'dynamodb', extra });
  }

  const key = `originales/${id}.${formato.ext}`;
  await conPaso('s3', () => s3.send(new PutObjectCommand({
    Bucket: cfg.bucketOriginales, Key: key, Body: buffer, ContentType: formato.mime,
  })), extra);
  await conPaso('dynamodb', () => ddb.send(new UpdateCommand({
    TableName: cfg.tablaAtributos,
    Key: { producto_id: id },
    UpdateExpression: 'SET imagen_original_key = :k, estado_procesamiento = :p, error_procesamiento = :n, actualizado = :a',
    ExpressionAttributeValues: { ':k': key, ':p': 'PENDIENTE', ':n': null, ':a': new Date().toISOString() },
    ConditionExpression: 'attribute_exists(producto_id)',
  })), extra);

  const previa = item.imagen_original_key;
  if (previa && previa !== key) {
    try { await s3.send(new DeleteObjectCommand({ Bucket: cfg.bucketOriginales, Key: previa })); } catch (_) { /* opcional */ }
  }
  return procesar(producto, key);
}

async function reprocesar(producto) {
  const id = producto.producto_id;
  const extra = { producto_id: id, estado_producto: producto.estado };
  const item = await conPaso('dynamodb', () => productos.obtenerItem(id), extra);
  const key = item?.imagen_original_key;
  const hay = key ? await existeObjeto(cfg.bucketOriginales, key, extra) : false;
  if (!hay) {
    throw new ApiError(409, 'No existe una imagen original guardada; suba una con POST /productos/{id}/imagen', { paso: 's3', extra });
  }
  return procesar(producto, key);
}

async function leerImagen(id, version) {
  const item = await conPaso('dynamodb', () => productos.obtenerItem(id));
  const original = version === 'original';
  const key = original ? item?.imagen_original_key : item?.miniatura_key;
  if (!key) return null;
  return conPaso('s3', async () => {
    try {
      const r = await s3.send(new GetObjectCommand({
        Bucket: original ? cfg.bucketOriginales : cfg.bucketMiniaturas, Key: key,
      }));
      return { key, tipo: r.ContentType || 'application/octet-stream', bytes: Buffer.from(await r.Body.transformToByteArray()) };
    } catch (e) {
      if (noExiste(e)) return null;
      throw e;
    }
  });
}

module.exports = { registrarYProcesar, reprocesar, leerImagen };