import { useEffect, useState } from 'react';
import { Database, HardDrive, Zap, Layers, Server } from 'lucide-react';
import { api, useInstancia } from '../api.js';

const SERVICIOS = [
  { clave: 'rds', nombre: 'RDS', Icono: Database },
  { clave: 'dynamodb', nombre: 'DynamoDB', Icono: Layers },
  { clave: 's3', nombre: 'S3', Icono: HardDrive },
  { clave: 'lambda', nombre: 'Lambda', Icono: Zap },
];

export default function EstadoServicios() {
  const [salud, setSalud] = useState(null);
  const instancia = useInstancia();

  useEffect(() => {
    let vivo = true;
    const cargar = async () => {
      const r = await api('GET', '/health', { silencioso: true });
      if (vivo) setSalud(r.data?.servicios ? r.data : { servicios: {} });
    };
    cargar();
    const t = setInterval(cargar, 20000);
    return () => { vivo = false; clearInterval(t); };
  }, []);

  return (
    <div className="salud">
      {SERVICIOS.map(({ clave, nombre, Icono }) => {
        const s = salud?.servicios?.[clave];
        const estado = !salud ? 'carga' : s?.ok ? 'ok' : 'mal';
        return (
          <span key={clave} className={`pill pill-${estado}`} title={s ? `${s.ms} ms` : 'consultando…'}>
            <i className="dot" /><Icono size={13} />{nombre}
          </span>
        );
      })}
      {instancia && (
        <span className="pill pill-inst" title="Instancia del backend que atendió la última solicitud">
          <Server size={13} />{instancia.slice(0, 12)}
        </span>
      )}
    </div>
  );
}