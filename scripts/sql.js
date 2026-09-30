// Uso:  node scripts/sql.js "SELECT 1"      |      node scripts/sql.js -f db/schema.sql
const fs = require('fs');
const { Client } = require('pg');

const args = process.argv.slice(2);
const sql = args[0] === '-f' ? fs.readFileSync(args[1], 'utf8') : args.join(' ');
if (!sql.trim()) {
  console.error('Uso: node scripts/sql.js "<consulta>"  |  node scripts/sql.js -f <archivo.sql>');
  process.exit(1);
}

const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 7001),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

(async () => {
  try {
    await client.connect();
    const res = await client.query(sql);
    for (const r of Array.isArray(res) ? res : [res]) {
      if (r.rows && r.rows.length) console.table(r.rows);
      else console.log(`${r.command} OK${r.rowCount != null ? ` (${r.rowCount} filas)` : ''}`);
    }
  } catch (e) {
    console.error(`ERROR [${e.code || 'n/a'}] ${e.message}`);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
})();