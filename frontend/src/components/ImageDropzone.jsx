import { useEffect, useRef, useState } from 'react';
import { UploadCloud, X, AlertTriangle } from 'lucide-react';

const kb = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(2)} MB` : `${Math.round(n / 1024)} KB`);

export default function ImageDropzone({ archivo, onChange, error }) {
  const ref = useRef(null);
  const [sobre, setSobre] = useState(false);
  const [vista, setVista] = useState(null);

  useEffect(() => {
    if (!archivo) { setVista(null); return undefined; }
    const u = URL.createObjectURL(archivo);
    setVista(u);
    return () => URL.revokeObjectURL(u);
  }, [archivo]);

  const soltar = (e) => {
    e.preventDefault(); setSobre(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onChange(f);
  };
  const aviso = archivo && (
    !['image/jpeg', 'image/png'].includes(archivo.type) ? 'Tipo no admitido: el servidor lo rechazará (415).'
    : archivo.size > 5 * 1024 * 1024 ? 'Supera 5 MB: el servidor lo rechazará (413).' : null
  );

  return (
    <div>
      <div
        className={`drop ${sobre ? 'sobre' : ''} ${error ? 'con-error' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setSobre(true); }}
        onDragLeave={() => setSobre(false)}
        onDrop={soltar}
        onClick={() => ref.current?.click()}
        role="button" tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && ref.current?.click()}
      >
        <input ref={ref} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onChange(f); e.target.value = ''; }} />
        {archivo ? (
          <div className="drop-prev">
            {vista && archivo.type.startsWith('image/') ? <img src={vista} alt="Vista previa" /> : <div className="sin-img">Sin vista previa</div>}
            <div className="drop-info">
              <b>{archivo.name}</b>
              <span className="suave">{archivo.type || 'tipo desconocido'} · {kb(archivo.size)}</span>
              {aviso && <span className="aviso"><AlertTriangle size={14} /> {aviso}</span>}
            </div>
            <button type="button" className="icono" onClick={(e) => { e.stopPropagation(); onChange(null); }}><X size={16} /></button>
          </div>
        ) : (
          <div className="drop-vacio">
            <UploadCloud size={34} />
            <b>Arrastre la fotografía o haga clic</b>
            <span className="suave">JPEG o PNG de hasta 5 MB</span>
          </div>
        )}
      </div>
      {error && <small className="campo-err">{error}</small>}
    </div>
  );
}