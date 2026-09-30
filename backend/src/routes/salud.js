const express = require('express');
const { HeadBucketCommand } = require('@aws-sdk/client-s3');
const { DescribeTableCommand } = require('@aws-sdk/client-dynamodb');
const { GetFunctionConfigurationCommand } = require('@aws-sdk/client-lambda');
const cfg = require('../config');
const { pool, s3, dynamoLow, lambda } = require('../clients');
const { asyncHandler } = require('../errores');

const router = express.Router();

router.get('/live', (req, res) => res.json({ ok: true, instancia: cfg.instancia }));

const medir = async (fn) => {
  const t = Date.now();
  try {
    await fn(AbortSignal.timeout(4000));
    return { ok: true, ms: Date.now() - t };
  } catch (e) {
    return { ok: false, ms: Date.now() - t, error: e.message };
  }
};

router.get('/health', asyncHandler(async (req, res) => {
  const [rds, dynamodb, s3r, lambdar] = await Promise.all([
    medir(() => pool.query('SELECT 1')),
    medir((abortSignal) => dynamoLow.send(new DescribeTableCommand({ TableName: cfg.tablaAtributos }), { abortSignal })),
    medir((abortSignal) => Promise.all([
      s3.send(new HeadBucketCommand({ Bucket: cfg.bucketOriginales }), { abortSignal }),
      s3.send(new HeadBucketCommand({ Bucket: cfg.bucketMiniaturas }), { abortSignal }),
    ])),
    medir((abortSignal) => lambda.send(new GetFunctionConfigurationCommand({ FunctionName: cfg.funcionLambda }), { abortSignal })),
  ]);
  const servicios = { rds, dynamodb, s3: s3r, lambda: lambdar };
  const ok = Object.values(servicios).every((s) => s.ok);
  res.status(ok ? 200 : 503).json({ estado: ok ? 'ok' : 'degradado', instancia: cfg.instancia, servicios });
}));

module.exports = router;