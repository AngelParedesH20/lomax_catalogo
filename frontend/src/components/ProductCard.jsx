import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ImageOff } from 'lucide-react';
import { dinero, hueDe, chip, urlImagen } from '../util.js';

export default function ProductCard({ p, i = 0 }) {
  const [cargada, setCargada] = useState(false);
  const [falla, setFalla] = useState(false);
  const attrs = Object.entries(p.atributos || {}).slice(0, 3);
  return (
    <Link
      to={`/producto/${p.producto_id}`}
      className="tarjeta"
      style={{ '--h': hueDe(p.categoria.nombre), animationDelay: `${Math.min(i, 12) * 45}ms` }}
    >
      <div className={`tarjeta-img ${cargada || falla ? 'lista' : ''}`}>
        {falla ? (
          <div className="sin-img"><ImageOff size={28} /></div>
        ) : (
          <img src={urlImagen(p.producto_id)} alt={p.nombre} loading="lazy"
               onLoad={() => setCargada(true)} onError={() => setFalla(true)} />
        )}
        <span className="cat-badge">{p.categoria.nombre}</span>
      </div>
      <div className="tarjeta-cuerpo">
        <span className="codigo">{p.codigo}</span>
        <h3>{p.nombre}</h3>
        <div className="chips">
          {attrs.map(([k, v]) => <span key={k} className="chip">{chip(k, v)}</span>)}
        </div>
        <div className="precio">{dinero(p.precio)}</div>
      </div>
    </Link>
  );
}