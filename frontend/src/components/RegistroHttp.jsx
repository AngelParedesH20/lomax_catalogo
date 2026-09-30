import { useState } from 'react';
import { Terminal, X } from 'lucide-react';
import { useRegistro } from '../api.js';

export default function RegistroHttp() {
  const [abierto, setAbierto] = useState(false);
  const registro = useRegistro();
  return (
    <>
      <button className="fab" onClick={() => setAbierto(!abierto)} aria-label="Registro de solicitudes HTTP">
        <Terminal size={16} /> Solicitudes <b>{registro.length}</b>
      </button>
      {abierto && (
        <aside className="drawer">
          <div className="drawer-cab">
            <h3>Solicitudes HTTP</h3>
            <button className="icono" onClick={() => setAbierto(false)}><X size={16} /></button>
          </div>
          <div className="drawer-lista">
            {registro.length === 0 && <p className="suave">Aún no hay solicitudes.</p>}
            {registro.map((r) => (
              <details key={r.id} className="req">
                <summary>
                  <span className={`metodo m-${r.metodo}`}>{r.metodo}</span>
                  <code>{r.url}</code>
                  <span className={`st st-${Math.floor(r.status / 100)}`}>{r.status || 'ERR'}</span>
                  <span className="suave">{r.ms} ms</span>
                </summary>
                <div className="req-det">
                  <div>{r.hora} · instancia <code>{r.instancia || '-'}</code></div>
                  <pre>{r.cuerpo}</pre>
                </div>
              </details>
            ))}
          </div>
        </aside>
      )}
    </>
  );
}