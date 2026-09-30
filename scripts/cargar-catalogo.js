const fs = require('fs');
const path = require('path');

const API = process.env.API_URL || 'http://localhost:3000';
const RAIZ = path.join(__dirname, '..');
const productos = JSON.parse(fs.readFileSync(path.join(RAIZ, 'seed', 'productos.json'), 'utf8'));
const forzar = process.argv.includes('--forzar');
const solo = (process.argv.find((a) => a.startsWith('--solo=')) || '').split('=')[1];

async function llamar(metodo, ruta, opciones = {}) {
  const r = await fetch(API + ruta, { method: metodo, ...opciones });
  let cuerpo = null;
  try { cuerpo = await r.json(); } catch (_) { /* sin JSON */ }
  return { status: r.status, cuerpo };
}

function buscarFoto(codigo) {
  for (const ext of ['.jpg', '.jpeg', '.png']) {
    const ruta = path.join(RAIZ, 'seed', 'imagenes', codigo + ext);
    if (fs.existsSync(ruta)) return ruta;
  }
  return null;
}

(async () => {
  const cats = await llamar('GET', '/categorias');
  if (cats.status !== 200) { console.error('No se pudo leer /categorias. ¿Está arriba la API?'); process.exit(1); }
  const idCat = Object.fromEntries(cats.cuerpo.map((c) => [c.nombre, c.categoria_id]));

  const filas = [];
  for (const p of productos.filter((x) => !solo || x.codigo === solo)) {
    let id = p.producto_id;
    let accion = 'imagen cargada';
    try {
      const actual = await llamar('GET', `/productos/${id}`);
      if (actual.status === 404) {
        const c = await llamar('POST', '/productos', {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            codigo: p.codigo, nombre: p.nombre, descripcion: p.descripcion, precio: p.precio,
            categoria_id: idCat[p.categoria], atributos: p.atributos,
          }),
        });
        if (![200, 201].includes(c.status)) throw new Error(`crear: HTTP ${c.status} ${c.cuerpo?.error}`);
        id = c.cuerpo.producto_id;
        accion = 'creado + imagen';
      } else if (actual.status === 200 && actual.cuerpo.estado === 'PUBLICADO' &&
                 actual.cuerpo.imagen.estado_procesamiento === 'LISTA' && !forzar) {
        filas.push({ codigo: p.codigo, accion: 'ya publicado (omitido)', http: 200, estado: 'PUBLICADO' });
        continue;
      }
      const foto = buscarFoto(p.codigo);
      if (!foto) throw new Error('no hay foto en seed/imagenes');
      const fd = new FormData();
      fd.append('imagen', new Blob([fs.readFileSync(foto)], { type: foto.endsWith('.png') ? 'image/png' : 'image/jpeg' }), path.basename(foto));
      const r = await llamar('POST', `/productos/${id}/imagen`, { body: fd });
      filas.push({ codigo: p.codigo, accion, http: r.status, estado: r.cuerpo?.estado || r.cuerpo?.error });
    } catch (e) {
      filas.push({ codigo: p.codigo, accion: 'ERROR', http: '-', estado: e.message });
    }
  }
  console.table(filas);
  const lista = await llamar('GET', '/productos');
  console.log(`Publicados en el catálogo: ${lista.cuerpo?.length ?? '?'}`);
  process.exit(filas.every((f) => f.http === 200) ? 0 : 1);
})();