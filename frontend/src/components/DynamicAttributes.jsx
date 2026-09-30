import { Plus, Trash2 } from 'lucide-react';

export default function DynamicAttributes({ sugeridos, attrs, setAttrs, extras, setExtras, error }) {
  const set = (k, v) => setAttrs({ ...attrs, [k]: v });
  const cambiarExtra = (i, campo, v) => setExtras(extras.map((x, j) => (j === i ? { ...x, [campo]: v } : x)));

  return (
    <div className="attrs-form">
      {sugeridos.length > 0 && <p className="suave">Atributos propios de la categoría seleccionada</p>}
      <div className="attrs-grid">
        {sugeridos.map((s) => {
          const Envoltura = s.tipo === 'boolean' ? 'div' : 'label';
          return (
            <Envoltura key={s.clave} className="campo">
              <span className="campo-et">{s.etiqueta}</span>
              {s.tipo === 'select' && (
                <select value={attrs[s.clave] ?? ''} onChange={(e) => set(s.clave, e.target.value)}>
                  <option value="">Seleccione…</option>
                  {s.opciones.map((o) => <option key={o}>{o}</option>)}
                </select>
              )}
              {s.tipo === 'number' && (
                <input type="number" step="any" min="0" value={attrs[s.clave] ?? ''} onChange={(e) => set(s.clave, e.target.value)} />
              )}
              {s.tipo === 'boolean' && (
                <button type="button" className={`switch ${attrs[s.clave] ? 'on' : ''}`} onClick={() => set(s.clave, !attrs[s.clave])}>
                  <i />{attrs[s.clave] ? 'Sí' : 'No'}
                </button>
              )}
            </Envoltura>
          );
        })}
      </div>

      <div className="extras">
        <div className="extras-cab">
          <span className="campo-et">Atributos adicionales (opcional)</span>
          <button type="button" className="btn-txt" onClick={() => setExtras([...extras, { k: '', v: '' }])}>
            <Plus size={14} /> Agregar
          </button>
        </div>
        {extras.map((x, i) => (
          <div key={i} className="extra-fila">
            <input placeholder="nombre (ej. color)" value={x.k} onChange={(e) => cambiarExtra(i, 'k', e.target.value)} />
            <input placeholder="valor" value={x.v} onChange={(e) => cambiarExtra(i, 'v', e.target.value)} />
            <button type="button" className="icono" onClick={() => setExtras(extras.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
      {error && <small className="campo-err">{error}</small>}
    </div>
  );
}