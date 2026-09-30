const { Pool } = require('pg');
const { S3Client } = require('@aws-sdk/client-s3');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const { LambdaClient } = require('@aws-sdk/client-lambda');
const cfg = require('./config');

const aws = {
  region: cfg.aws.region,
  endpoint: cfg.aws.endpoint,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
  },
  maxAttempts: 2,
};

const pool = new Pool({
  ...cfg.db,
  max: 5,
  connectionTimeoutMillis: 4000,
  idleTimeoutMillis: 30000,
  query_timeout: 8000,
});
pool.on('error', (e) => console.error('[pg] error en conexion inactiva:', e.message));

const dynamoLow = new DynamoDBClient(aws);

module.exports = {
  pool,
  s3: new S3Client({ ...aws, forcePathStyle: true }),
  dynamoLow,
  ddb: DynamoDBDocumentClient.from(dynamoLow, { marshallOptions: { removeUndefinedValues: true } }),
  lambda: new LambdaClient(aws),
};