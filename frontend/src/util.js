const HUES = { Teclados: 265, Monitores: 195, Televisores: 340 };
export const hueDe = (n = '') => HUES[n] ?? ([...n].reduce((a, c) => a + c.charCodeAt(0), 0) % 360);

export const dinero = (n) => new Intl.NumberFormat('es-BO', { style: 'currency', currency: 'USD' }).format(n);

const ETIQ = {
  conexion: 'Conexión', distribucion: 'Distribución', retroiluminado: 'Retroiluminado',
  pulgadas: 'Pulgadas', resolucion: 'Resolución', frecuencia_hz: 'Frecuencia',
};
export const etiqueta = (k) => ETIQ[k] || k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

export const valor = (k, v) => {
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (k === 'frecuencia_hz') return `${v} Hz`;
  if (k === 'pulgadas') return `${v}"`;
  return String(v);
};
export const chip = (k, v) =>
  typeof v === 'boolean' ? (v ? etiqueta(k) : `Sin ${etiqueta(k).toLowerCase()}`) : valor(k, v);

export const urlImagen = (id, version) => `/api/productos/${id}/imagen${version ? `?version=${version}` : ''}`;
export const fechaLarga = (iso) => new Date(iso).toLocaleString('es-BO', { dateStyle: 'medium', timeStyle: 'short' });

export async function copiar(texto) {
  try { await navigator.clipboard.writeText(texto); return true; } catch (_) { return false; }
}