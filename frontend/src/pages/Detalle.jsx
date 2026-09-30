import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Copy, Check, Database, Layers, HardDrive, Zap, Rocket, RefreshCw, AlertTriangle, ImageOff } from 'lucide-react';
import { api } from '../api.js';
import { dinero, hueDe, etiqueta, valor, urlImagen, fechaLarga, copiar } from '../util.js';

export default function Detalle() {
  const { id } = useParams();
  const [p, setP] = useState(null);
  const [error, setError] = useState(null);
  const [copiado, setCopiado] = useState(false);
  const [src, setSrc] = useState('original');
  const [reproc, setReproc] = useState({ curso: false, error: null });

  const cargar = async () => {
    const r = await api('GET', `/productos/${id}`);
    if (r.ok) setP(r.data); else setError({ status: r.status, ...r.data });
  };
  useEffect(() => { setP(null); setError(null); setSrc('original'); cargar(); }, [id]);

  const reprocesar = async () => {
    setReproc({ curso: true, error: null });
    const r = await api('POST', `/productos/${id}/reprocesar`);
    setReproc({ curso: false, error: r.ok ? null : r.data?.error });
    setSrc('original');
    cargar();
  };

  if (error) {
    return (
      <div className="vacio">
        <AlertTriangle size={40} />
        <h2>{error.status === 404 ? 'Producto no encontrado' : 'No se pudo cargar el producto'}</h2>
        <p className="suave">{error.error} {error.paso ? `(paso: ${error.paso})` : ''}</p>
        <Link className="btn primario" to="/">Volver al catálogo</Link>
      </div>
    );
  }
  if (!p) return <div className="det-grid"><div className="det-img sk" /><div className="det-info sk" style={{ minHeight: 420 }} /></div>;

  const atributos = Object.entries(p.atributos || {});
  const img = p.imagen;
  const hitos = [
    { Icono: Database, t: 'RDS · PostgreSQL', d: `Registrado el ${fechaLarga(p.fecha_registro)}`, ok: true },
    { Icono: Layers, t: 'DynamoDB · atributos', d: `${atributos.length} atributos almacenados`, ok: atributos.length > 0 },
    { Icono: HardDrive, t: 'S3 · original', d: img.original_key || 'Sin fotografía original', ok: Boolean(img.original_key) },
    {
      Icono: Zap, t: 'Lambda · miniatura',
      d: img.estado_procesamiento === 'ERROR' ? `Error: ${img.error}` : img.miniatura_key || 'Pendiente de procesar',
      ok: img.estado_procesamiento === 'LISTA', mal: img.estado_procesamiento === 'ERROR',
    },
    { Icono: Rocket, t: 'Publicación', d: p.estado === 'PUBLICADO' ? 'Visible en el catálogo' : 'Aún no aparece en el catálogo', ok: p.estado === 'PUBLICADO' },
  ];

  return (
    <div style={{ '--h': hueDe(p.categoria.nombre) }}>
      <Link to="/" className="volver"><ArrowLeft size={16} /> Catálogo</Link>
      <div className="det-grid">
        <div className="det-img">
          {src === 'ninguna' ? (
            <div className="sin-img grande"><ImageOff size={40} /><span>Sin imagen disponible</span></div>
          ) : (
            <img src={urlImagen(id, src === 'original' ? 'original' : undefined)} alt={p.nombre}
                 onError={() => setSrc(src === 'original' ? 'miniatura' : 'ninguna')} />
          )}
        </div>

        <div className="det-info">
          <div className="fila-cab">
            <span className="cat-badge fijo">{p.categoria.nombre}</span>
            <span className={`estado ${p.estado === 'PUBLICADO' ? 'est-ok' : 'est-pend'}`}>{p.estado}</span>
          </div>
          <span className="codigo">{p.codigo}</span>
          <h1>{p.nombre}</h1>
          <div className="precio grande">{dinero(p.precio)}</div>
          <p className="desc">{p.descripcion}</p>

          <h3 className="sub">Atributos</h3>
          <dl className="attrs">
            {atributos.map(([k, v]) => (
              <div key={k}><dt>{etiqueta(k)}</dt><dd>{valor(k, v)}</dd></div>
            ))}
          </dl>

          <div className="idbox">
            <span>producto_id</span><code>{p.producto_id}</code>
            <button className="icono" onClick={async () => { setCopiado(await copiar(p.producto_id)); setTimeout(() => setCopiado(false), 1500); }}>
              {copiado ? <Check size={15} /> : <Copy size={15} />}
            </button>
          </div>
        </div>
      </div>

      <section className="card-vidrio recorrido-det">
        <h3>Recorrido de los datos</h3>
        <ol className="linea">
          {hitos.map(({ Icono, t, d, ok, mal }) => (
            <li key={t} className={mal ? 'mal' : ok ? 'ok' : ''}>
              <span className="pi-ico"><Icono size={16} /></span>
              <div><b>{t}</b><small>{d}</small></div>
            </li>
          ))}
        </ol>
        {(p.estado !== 'PUBLICADO' || img.estado_procesamiento === 'ERROR') && (
          <div className="acciones">
            <button className="btn" onClick={reprocesar} disabled={reproc.curso}>
              <RefreshCw size={15} className={reproc.curso ? 'gira' : ''} /> Reprocesar imagen
            </button>
            {reproc.error && <span className="campo-err">{reproc.error}</span>}
          </div>
        )}
      </section>
    </div>
  );
}