const fs = require('fs');
const path = require('path');
const Jimp = require('jimp');

const RAIZ = path.join(__dirname, '..');
const DIR_IMG = path.join(RAIZ, 'seed', 'imagenes');
const DIR_PRUEBAS = path.join(RAIZ, 'seed', 'pruebas');
const productos = JSON.parse(fs.readFileSync(path.join(RAIZ, 'seed', 'productos.json'), 'utf8'));

const PALETAS = {
  Teclados: [[99, 102, 241], [168, 85, 247]],
  Monitores: [[14, 165, 233], [16, 185, 129]],
  Televisores: [[244, 63, 94], [249, 115, 22]],
};
const PALETA_PRUEBA = [[71, 85, 105], [30, 41, 59]];
const W = 1200;
const H = 800;
let fuentes;

async function dibujar(etiqueta, titulo, subtitulo, [c1, c2]) {
  fuentes = fuentes || {
    grande: await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE),
    media: await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE),
  };
  const img = new Jimp(W, H, 0x000000ff);
  img.scan(0, 0, W, H, function (x, y, idx) {
    const t = (x / W + y / H) / 2;
    this.bitmap.data[idx] = Math.round(c1[0] + (c2[0] - c1[0]) * t);
    this.bitmap.data[idx + 1] = Math.round(c1[1] + (c2[1] - c1[1]) * t);
    this.bitmap.data[idx + 2] = Math.round(c1[2] + (c2[2] - c1[2]) * t);
    this.bitmap.data[idx + 3] = 255;
  });
  img.print(fuentes.media, 60, 60, subtitulo.toUpperCase());
  img.print(fuentes.grande, 60, 300, { text: etiqueta }, W - 120);
  img.print(fuentes.media, 60, 430, { text: titulo }, W - 120, 220);
  return img;
}

const existeFoto = (codigo) =>
  ['.jpg', '.png'].some((ext) => fs.existsSync(path.join(DIR_IMG, codigo + ext)));

(async () => {
  fs.mkdirSync(DIR_IMG, { recursive: true });
  fs.mkdirSync(DIR_PRUEBAS, { recursive: true });

  let creadas = 0;
  let omitidas = 0;
  for (const p of productos) {
    if (existeFoto(p.codigo)) { omitidas++; continue; }
    const img = await dibujar(p.codigo, p.nombre, p.categoria, PALETAS[p.categoria] || PALETA_PRUEBA);
    await img.quality(88).writeAsync(path.join(DIR_IMG, `${p.codigo}.jpg`));
    creadas++;
  }
  console.log(`Fotos de productos: ${creadas} creadas, ${omitidas} ya existían (no se sobrescriben)`);

  const jpg = path.join(DIR_PRUEBAS, 'original-1200x800.jpg');
  if (!fs.existsSync(jpg)) {
    await (await dibujar('PRUEBA', 'Original de prueba 1200 x 800', 'Prueba E3', PALETA_PRUEBA)).quality(90).writeAsync(jpg);
  }
  const png = path.join(DIR_PRUEBAS, 'png-valido.png');
  if (!fs.existsSync(png)) {
    await (await dibujar('PNG', 'PNG valido 1200 x 800', 'Prueba E3', PALETAS.Monitores)).writeAsync(png);
  }
  const invalido = path.join(DIR_PRUEBAS, 'invalido.jpg');
  if (!fs.existsSync(invalido)) {
    fs.writeFileSync(invalido, 'Esto es texto plano renombrado como .jpg, no una imagen.');
  }
  const grande = path.join(DIR_PRUEBAS, 'grande-6mb.jpg');
  if (!fs.existsSync(grande)) {
    const base = await dibujar('GRANDE', 'Archivo de mas de 5 MB', 'Prueba E3', PALETA_PRUEBA);
    const buf = await base.quality(85).getBufferAsync(Jimp.MIME_JPEG);
    fs.writeFileSync(grande, Buffer.concat([buf, Buffer.alloc(6 * 1024 * 1024)]));
  }
  console.log('Archivos de prueba listos en seed/pruebas');
})().catch((e) => { console.error(e.message); process.exit(1); });