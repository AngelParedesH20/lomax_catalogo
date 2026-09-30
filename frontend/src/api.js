import { useSyncExternalStore } from 'react';

let registro = [];
let ultimaInstancia = null;
let contador = 0;
const oyentes = new Set();
const avisar = () => oyentes.forEach((f) => f());
const suscribir = (f) => { oyentes.add(f); return () => oyentes.delete(f); };

export const useRegistro = () => useSyncExternalStore(suscribir, () => registro);
export const useInstancia = () => useSyncExternalStore(suscribir, () => ultimaInstancia);

function resumen(d) {
  if (d == null) return '(sin cuerpo JSON)';
  const s = JSON.stringify(d, null, 2);
  return s.length > 900 ? `${s.slice(0, 900)}\n…` : s;
}

export async function api(metodo, ruta, { json, form, silencioso = false } = {}) {
  const t0 = performance.now();
  const opts = { method: metodo, headers: {} };
  if (json !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(json); }
  if (form) opts.body = form;

  let res = { status: 0, ok: false, data: { error: 'No hay conexión con el servidor', paso: 'red' }, instancia: null };
  try {
    const r = await fetch(`/api${ruta}`, opts);
    let data = null;
    try { data = await r.json(); } catch (_) { /* respuesta sin JSON */ }
    res = { status: r.status, ok: r.ok, data, instancia: r.headers.get('x-instance-id') };
  } catch (_) { /* red caída */ }

  res.ms = Math.round(performance.now() - t0);
  if (res.instancia) ultimaInstancia = res.instancia;
  if (!silencioso) {
    registro = [{
      id: ++contador, metodo, url: `/api${ruta}`, status: res.status, ms: res.ms,
      instancia: res.instancia, hora: new Date().toLocaleTimeString('es-BO'), cuerpo: resumen(res.data),
    }, ...registro].slice(0, 40);
  }
  avisar();
  return res;
}