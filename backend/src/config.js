const os = require('os');
const num = (v, d) => (v === undefined || v === '' ? d : Number(v));

module.exports = {
  puerto: num(process.env.PORT, 3000),
  instancia: process.env.INSTANCE_ID || os.hostname(),
  db: {
    host: process.env.DB_HOST || 'floci',
    port: num(process.env.DB_PORT, 7001),
    user: process.env.DB_USER || 'lomax_admin',
    password: process.env.DB_PASSWORD || 'LomaxAdmin2026',
    database: process.env.DB_NAME || 'lomax',
  },
  aws: {
    endpoint: process.env.AWS_ENDPOINT_URL || 'http://floci:4566',
    region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1',
  },
  bucketOriginales: process.env.BUCKET_ORIGINALES || 'lomax-originales',
  bucketMiniaturas: process.env.BUCKET_MINIATURAS || 'lomax-miniaturas',
  tablaAtributos: process.env.TABLA_ATRIBUTOS || 'ProductosAtributos',
  funcionLambda: process.env.LAMBDA_FUNCION || 'generar-miniatura',
  maxBytes: 5 * 1024 * 1024,
};