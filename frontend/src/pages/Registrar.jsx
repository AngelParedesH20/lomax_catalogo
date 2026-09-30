import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Database, Layers, HardDrive, Zap, ShieldCheck, Rocket, Copy, Check, RefreshCw,
  AlertTriangle, CheckCircle2, ArrowRight, ArrowLeft, Loader2, XCircle,
} from 'lucide-react';
import { api } from '../api.js';
import { urlImagen, copiar } from '../util.js';
import ImageDropzone from '../components/ImageDropzone.jsx';
import DynamicAttributes from '../components/DynamicAttributes.jsx';

const PASOS = [
  { k: 'validacion', t: 'Validación', d: 'Campos y formato del formulario', Icono: ShieldCheck },
  { k: 'rds', t: 'RDS · PostgreSQL', d: 'Producto registrado como PENDIENTE', Icono: Database },
  { k: 'dynamodb', t: 'DynamoDB', d: 'Atributos variables guardados', Icono: Layers },
  { k: 's3', t: 'S3 · originales', d: 'Fotografía almacenada', Icono: HardDrive },
  { k: 'lambda', t: 'Lambda · miniatura', d: 'Miniatura de hasta 300×300', Icono: Zap },
  { k: 'publicado', t: 'Publicación', d: 'Verificación y estado PUBLICADO', Icono: Rocket },
];
const flujoInicial = () => Object.fromEntries(PASOS.map((p) => [p.k, { estado: 'espera' }]));
const FORM0 = { codigo: '', nombre: '', descripcion: '', precio: '', categoria_id: '' };

function Campo({ etiqueta, error, ayuda, children }) {
  return (
    <label className={`campo ${error ? 'con-error' : ''}`}>
      <span className="campo-et">{etiqueta}</span>
      {children}
      {error ? <small className="campo-err">{error}</small> : ayuda ? <small className="suave">{ayuda}</small> : null}
    </label>
  );
}

export default function Registrar() {
  const [paso, setPaso] = useState(1);
  const [cats, setCats] = useState([]);
  const [form, setForm] = useState(FORM0);
  const [attrs, setAttrs] = useState({});
  const [extras, setExtras] = useState([]);
  const [archivo, setArchivo] = useState(null);
  const [errores, setErrores] = useState({});
  const [flujo, setFlujo] = useState(flujoInicial());
  const [productoId, setProductoId] = useState(null);
  const [enCurso, setEnCurso] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => { api('GET', '/categorias').then((r) => r.ok && setCats(r.data)); }, []);

  const cat = cats.find((c) => String(c.categoria_id) === form.categoria_id);
  const sugeridos = useMemo(() => cat?.atributos_sugeridos || [], [cat]);
  useEffect(() => {
    setAttrs(Object.fromEntries(sugeridos.map((s) => [s.clave, s.tipo === 'boolean' ? false : ''])));
  }, [sugeridos]);

  const setCampo = (k, v) => { setForm({ ...form, [k]: v }); setErrores({ ...errores, [k]: undefined }); };

  function validarDatos() {
    const e = {};
    const codigo = form.codigo.trim();
    if (!codigo) e.codigo = 'Ingrese un código';
    else if (!/^[A-Za-z0-9._-]{1,20}$/.test(codigo)) e.codigo = 'Máx. 20 caracteres: letras, números, . _ -';
    if (!form.nombre.trim()) e.nombre = 'Ingrese un nombre';
    if (!form.descripcion.trim()) e.descripcion = 'Ingrese una descripción';
    const pr = Number(form.precio);
    if (form.precio === '' || Number.isNaN(pr)) e.precio = 'Ingrese un precio';
    else if (pr < 0) e.precio = 'No puede ser negativo';
    if (!form.categoria_id) e.categoria_id = 'Seleccione una categoría';
    return e;
  }

  function armarAtributos() {
    const out = {};
    for (const s of sugeridos) {
      const v = attrs[s.clave];
      if (s.tipo === 'boolean') out[s.clave] = Boolean(v);
      else if (v !== undefined && v !== '') out[s.clave] = s.tipo === 'number' ? Number(v) : v;
    }
    for (const { k, v } of extras) {
      const clave = k.trim();
      const val = String(v).trim();
      if (!clave && !val) continue;
      if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(clave)) return { error: `Nombre de atributo inválido: "${clave}"` };
      if (!val) return { error: `Falta el valor de "${clave}"` };
      out[clave] = val === 'true' ? true : val === 'false' ? false : (!Number.isNaN(Number(val)) ? Number(val) : val);
    }
    if (Object.keys(out).length === 0) return { error: 'Agregue al menos un atributo' };
    return { valor: out };
  }

  const siguiente = () => {
    if (paso === 1) {
      const e = validarDatos();
      if (Object.keys(e).length) { setErrores(e); return; }
      setPaso(2);
    } else if (paso === 2) {
      const { error } = armarAtributos();
      if (error) { setErrores({ atributos: error }); return; }
      setErrores({}); setPaso(3);
    }
  };

  const marcar = (k, dato) => setFlujo((f) => ({ ...f, [k]: dato }));

  function fallo(r, id, titulo) {
    const d = r.data || {};
    const donde = d.paso || 'red';
    if (donde === 'validacion' && !id) {
      marcar('validacion', { estado: 'error', http: r.status, nota: d.error });
      marcar('rds', { estado: 'espera' }); marcar('dynamodb', { estado: 'espera' });
      const e = {};
      (d.detalles || []).forEach((x) => { e[x.campo] = x.mensaje; });
      setErrores(e);
      setPaso(1);
    } else if (!id) {
      const k = r.status === 409 ? 'rds' : ['rds', 'dynamodb'].includes(donde) ? donde : 'rds';
      marcar('rds', k === 'rds' ? { estado: 'error', http: r.status, nota: r.status === 409 ? 'Código duplicado' : d.error } : { estado: 'ok' });
      marcar('dynamodb', k === 'dynamodb' ? { estado: 'error', http: r.status, nota: d.error } : { estado: 'espera' });
      if (r.status === 409) { setErrores({ codigo: 'Ya existe un producto con este código' }); }
    } else {
      const stored = donde === 'lambda' || donde === 'dynamodb';
      marcar('s3', stored ? { estado: 'ok', http: r.status } : { estado: 'error', http: r.status, nota: d.error });
      marcar('lambda', donde === 'lambda' ? { estado: 'error', http: r.status, nota: d.error } : { estado: 'espera' });
      if (donde === 'dynamodb') marcar('dynamodb', { estado: 'error', http: r.status, nota: d.error });
    }
    setResultado({
      tipo: 'error', titulo, mensaje: d.error || 'Error desconocido', status: r.status, paso: donde,
      id: id || d.producto_id || null, existente: r.status === 409 ? d.producto_id : null,
    });
  }

  async function enviar() {
    const eD = validarDatos();
    const { valor: atributos, error: eA } = armarAtributos();
    if (Object.keys(eD).length) { setErrores(eD); setPaso(1); return; }
    if (eA) { setErrores({ atributos: eA }); setPaso(2); return; }
    if (!archivo) { setErrores({ archivo: 'Seleccione una fotografía' }); return; }

    setEnCurso(true); setResultado(null); setErrores({});
    try {
      let id = productoId;
      if (!id) {
        setFlujo({ ...flujoInicial(), validacion: { estado: 'ok' }, rds: { estado: 'curso' }, dynamodb: { estado: 'curso' } });
        const r = await api('POST', '/productos', {
          json: {
            codigo: form.codigo.trim(), nombre: form.nombre.trim(), descripcion: form.descripcion.trim(),
            precio: Number(form.precio), categoria_id: Number(form.categoria_id), atributos,
          },
        });
        if (!r.ok) { fallo(r, null, r.status === 409 ? 'Código duplicado' : 'No se pudo registrar el producto'); return; }
        id = r.data.producto_id;
        setProductoId(id);
        marcar('rds', { estado: 'ok', http: r.status, nota: r.data.reanudado ? 'Producto existente completado' : 'Fila creada como PENDIENTE' });
        marcar('dynamodb', { estado: 'ok', http: r.status, nota: `${Object.keys(atributos).length} atributos guardados` });
      }
      marcar('s3', { estado: 'curso' }); marcar('lambda', { estado: 'curso' }); marcar('publicado', { estado: 'espera' });
      const fd = new FormData();
      fd.append('imagen', archivo);
      const r2 = await api('POST', `/productos/${id}/imagen`, { form: fd });
      if (!r2.ok) { fallo(r2, id, 'No se pudo procesar la fotografía'); return; }
      const im = r2.data.imagen;
      marcar('s3', { estado: 'ok', http: r2.status, ms: r2.ms, nota: im.original_key });
      marcar('lambda', { estado: 'ok', nota: `Miniatura ${im.miniatura.ancho}×${im.miniatura.alto} px` });
      marcar('publicado', { estado: 'ok', nota: 'Estado PUBLICADO verificado' });
      setResultado({ tipo: 'ok', id });
    } finally {
      setEnCurso(false);
    }
  }

  const reiniciar = () => {
    setForm(FORM0); setExtras([]); setArchivo(null); setErrores({}); setFlujo(flujoInicial());
    setProductoId(null); setResultado(null); setPaso(1);
  };
  const otraImagen = () => { setArchivo(null); setResultado(null); setPaso(3); };
  const copiarId = async (t) => { setCopiado(await copiar(t)); setTimeout(() => setCopiado(false), 1500); };

  return (
    <>
      <div className="cab-pagina">
        <h1>Registrar producto</h1>
        <p className="suave">Complete los datos, los atributos y la fotografía. A la derecha verá cada servicio que interviene.</p>
      </div>

      <div className="reg-grid">
        <section className="card-vidrio">
          {resultado?.tipo === 'ok' ? (
            <div className="exito">
              <div className="exito-ico"><CheckCircle2 size={34} /></div>
              <h2>¡Producto publicado!</h2>
              <p className="suave">{form.nombre} ya está disponible en el catálogo.</p>
              <img src={urlImagen(resultado.id)} alt="Miniatura" className="exito-img" />
              <div className="idbox">
                <span>producto_id</span><code>{resultado.id}</code>
                <button className="icono" onClick={() => copiarId(resultado.id)}>{copiado ? <Check size={15} /> : <Copy size={15} />}</button>
              </div>
              <div className="acciones">
                <Link className="btn primario" to={`/producto/${resultado.id}`}>Ver detalle</Link>
                <Link className="btn" to="/">Ir al catálogo</Link>
                <button className="btn" onClick={reiniciar}>Registrar otro</button>
              </div>
            </div>
          ) : (
            <>
              <ol className="stepper">
                {['Datos', 'Atributos', 'Fotografía'].map((t, i) => (
                  <li key={t} className={paso === i + 1 ? 'act' : paso > i + 1 ? 'hecho' : ''}>
                    <span>{paso > i + 1 ? <Check size={14} /> : i + 1}</span>{t}
                  </li>
                ))}
              </ol>

              {resultado?.tipo === 'error' && (
                <div className="alerta mal">
                  <div className="alerta-tit"><AlertTriangle size={18} /> {resultado.titulo}</div>
                  <p>{resultado.mensaje}</p>
                  <ul className="alerta-datos">
                    <li>HTTP <b>{resultado.status || 'sin respuesta'}</b></li>
                    <li>Paso fallido <b>{resultado.paso}</b></li>
                    {resultado.id && <li>producto_id <code>{resultado.id}</code></li>}
                    {resultado.id && <li>Estado <b>PENDIENTE</b> · no aparece en el catálogo</li>}
                  </ul>
                  <div className="acciones">
                    {resultado.id ? (
                      <>
                        <button className="btn primario" onClick={enviar} disabled={enCurso}><RefreshCw size={15} /> Reintentar</button>
                        <button className="btn" onClick={otraImagen}>Elegir otra imagen</button>
                      </>
                    ) : resultado.status === 409 ? (
                      <>
                        <button className="btn primario" onClick={() => { setResultado(null); setPaso(1); }}>Corregir código</button>
                        {resultado.existente && <Link className="btn" to={`/producto/${resultado.existente}`}>Ver el producto existente</Link>}
                      </>
                    ) : (
                      <button className="btn primario" onClick={enviar} disabled={enCurso}><RefreshCw size={15} /> Reintentar</button>
                    )}
                    <button className="btn-txt" onClick={reiniciar}>Empezar de nuevo</button>
                  </div>
                </div>
              )}

              {paso === 1 && (
                <div className="form-grid">
                  <Campo etiqueta="Código" error={errores.codigo} ayuda="Único por producto, ej. LMX-001">
                    <input value={form.codigo} onChange={(e) => setCampo('codigo', e.target.value)} placeholder="LMX-001" disabled={Boolean(productoId)} />
                  </Campo>
                  <Campo etiqueta="Categoría" error={errores.categoria_id}>
                    <select value={form.categoria_id} onChange={(e) => setCampo('categoria_id', e.target.value)} disabled={Boolean(productoId)}>
                      <option value="">Seleccione…</option>
                      {cats.map((c) => <option key={c.categoria_id} value={c.categoria_id}>{c.nombre}</option>)}
                    </select>
                  </Campo>
                  <div className="span2">
                    <Campo etiqueta="Nombre" error={errores.nombre}>
                      <input value={form.nombre} onChange={(e) => setCampo('nombre', e.target.value)} placeholder="Nombre comercial del producto" />
                    </Campo>
                  </div>
                  <div className="span2">
                    <Campo etiqueta="Descripción" error={errores.descripcion}>
                      <textarea rows={3} value={form.descripcion} onChange={(e) => setCampo('descripcion', e.target.value)} placeholder="Características principales" />
                    </Campo>
                  </div>
                  <Campo etiqueta="Precio (USD)" error={errores.precio}>
                    <input type="number" step="0.01" min="0" value={form.precio} onChange={(e) => setCampo('precio', e.target.value)} placeholder="0.00" />
                  </Campo>
                </div>
              )}

              {paso === 2 && (
                <DynamicAttributes sugeridos={sugeridos} attrs={attrs} setAttrs={setAttrs}
                                   extras={extras} setExtras={setExtras} error={errores.atributos} />
              )}

              {paso === 3 && <ImageDropzone archivo={archivo} onChange={(f) => { setArchivo(f); setErrores({}); }} error={errores.archivo} />}

              <div className="acciones fin">
                {paso > 1 && <button className="btn" onClick={() => setPaso(paso - 1)} disabled={enCurso}><ArrowLeft size={15} /> Atrás</button>}
                {paso < 3 && <button className="btn primario" onClick={siguiente}>Siguiente <ArrowRight size={15} /></button>}
                {paso === 3 && (
                  <button className="btn primario" onClick={enviar} disabled={enCurso}>
                    {enCurso ? <><Loader2 size={15} className="gira" /> Procesando…</> : <>Registrar y publicar</>}
                  </button>
                )}
              </div>
            </>
          )}
        </section>

        <aside className="card-vidrio recorrido">
          <h3>Recorrido del registro</h3>
          <ol>
            {PASOS.map(({ k, t, d, Icono }) => {
              const s = flujo[k];
              return (
                <li key={k} className={`pi pi-${s.estado}`}>
                  <span className="pi-ico">
                    {s.estado === 'curso' ? <Loader2 className="gira" size={16} />
                      : s.estado === 'ok' ? <Check size={16} />
                      : s.estado === 'error' ? <XCircle size={16} /> : <Icono size={16} />}
                  </span>
                  <div><b>{t}</b><small>{s.nota || d}</small></div>
                  {s.http ? <span className={`st st-${Math.floor(s.http / 100)}`}>{s.http}</span> : null}
                </li>
              );
            })}
          </ol>
          {productoId && (
            <div className="idbox">
              <span>producto_id</span><code>{productoId}</code>
              <button className="icono" onClick={() => copiarId(productoId)}>{copiado ? <Check size={15} /> : <Copy size={15} />}</button>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}