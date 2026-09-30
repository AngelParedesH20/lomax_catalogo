import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, RefreshCw, PackageOpen, AlertTriangle, Sparkles } from 'lucide-react';
import { api } from '../api.js';
import { hueDe } from '../util.js';
import ProductCard from '../components/ProductCard.jsx';

export default function Catalogo() {
  const [params, setParams] = useSearchParams();
  const [productos, setProductos] = useState(null);
  const [categorias, setCategorias] = useState([]);
  const [error, setError] = useState(null);
  const q = params.get('q') || '';
  const cat = params.get('cat') || '';
  const orden = params.get('orden') || 'nombre';

  const cargar = async () => {
    setError(null); setProductos(null);
    const [p, c] = await Promise.all([api('GET', '/productos'), api('GET', '/categorias')]);
    if (!p.ok) { setError({ status: p.status, ...p.data }); return; }
    setProductos(p.data);
    if (c.ok) setCategorias(c.data);
  };
  useEffect(() => { cargar(); }, []);

  const fijar = (k, v) => {
    const n = new URLSearchParams(params);
    if (v) n.set(k, v); else n.delete(k);
    setParams(n, { replace: true });
  };

  const lista = useMemo(() => {
    if (!productos) return [];
    const texto = q.toLowerCase();
    const filtrados = productos.filter((p) =>
      (!cat || String(p.categoria.id) === cat) &&
      (!texto || `${p.nombre} ${p.codigo} ${p.descripcion}`.toLowerCase().includes(texto)));
    const cmp = {
      nombre: (a, b) => a.nombre.localeCompare(b.nombre),
      menor: (a, b) => a.precio - b.precio,
      mayor: (a, b) => b.precio - a.precio,
    }[orden] || (() => 0);
    return [...filtrados].sort(cmp);
  }, [productos, q, cat, orden]);

  return (
    <>
      <section className="hero">
        <div>
          <span className="etiqueta"><Sparkles size={14} /> Lomax SA · catálogo en vivo</span>
          <h1>Tecnología lista para <span className="grad">tu próximo proyecto</span></h1>
          <p className="suave">
            Cada ficha combina datos de RDS, atributos de DynamoDB y fotografías procesadas por Lambda y almacenadas en S3.
          </p>
        </div>
        <div className="stats">
          <div className="stat"><b>{productos ? productos.length : '–'}</b><span>publicados</span></div>
          <div className="stat"><b>{categorias.length || '–'}</b><span>categorías</span></div>
        </div>
      </section>

      <div className="toolbar">
        <label className="buscador">
          <Search size={16} />
          <input value={q} onChange={(e) => fijar('q', e.target.value)} placeholder="Buscar por nombre, código o descripción" />
        </label>
        <select value={orden} onChange={(e) => fijar('orden', e.target.value)}>
          <option value="nombre">Nombre A–Z</option>
          <option value="menor">Precio: menor a mayor</option>
          <option value="mayor">Precio: mayor a menor</option>
        </select>
      </div>

      <div className="cats">
        <button className={`cat ${!cat ? 'activa' : ''}`} onClick={() => fijar('cat', '')}>Todos</button>
        {categorias.map((c) => (
          <button key={c.categoria_id} className={`cat ${cat === String(c.categoria_id) ? 'activa' : ''}`}
                  style={{ '--h': hueDe(c.nombre) }} onClick={() => fijar('cat', String(c.categoria_id))}>
            {c.nombre}
          </button>
        ))}
      </div>

      {error && (
        <div className="alerta mal">
          <div className="alerta-tit"><AlertTriangle size={18} /> No se pudo cargar el catálogo</div>
          <p>{error.error || 'Error desconocido'} {error.paso ? `(paso: ${error.paso})` : ''}</p>
          <button className="btn" onClick={cargar}><RefreshCw size={15} /> Reintentar</button>
        </div>
      )}

      {!error && productos === null && (
        <div className="grid">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="tarjeta sk" />)}</div>
      )}

      {!error && productos && lista.length === 0 && (
        <div className="vacio"><PackageOpen size={40} /><h2>Sin resultados</h2><p className="suave">Pruebe con otra búsqueda o categoría.</p></div>
      )}

      {!error && productos && lista.length > 0 && (
        <div className="grid">{lista.map((p, i) => <ProductCard key={p.producto_id} p={p} i={i} />)}</div>
      )}
    </>
  );
}