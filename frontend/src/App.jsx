import { Routes, Route, NavLink, Link } from 'react-router-dom';
import { Package, LayoutGrid, PlusCircle } from 'lucide-react';
import Catalogo from './pages/Catalogo.jsx';
import Detalle from './pages/Detalle.jsx';
import Registrar from './pages/Registrar.jsx';
import EstadoServicios from './components/EstadoServicios.jsx';
import RegistroHttp from './components/RegistroHttp.jsx';

export default function App() {
  return (
    <div className="app">
      <div className="fondo" aria-hidden="true">
        <span className="blob b1" /><span className="blob b2" /><span className="blob b3" />
      </div>
      <header className="nav">
        <div className="nav-in">
          <Link to="/" className="marca">
            <span className="marca-ico"><Package size={18} /></span>Lomax<em>Catálogo</em>
          </Link>
          <nav className="nav-links">
            <NavLink to="/" end><LayoutGrid size={16} /> Catálogo</NavLink>
            <NavLink to="/registrar"><PlusCircle size={16} /> Registrar</NavLink>
          </nav>
          <EstadoServicios />
        </div>
      </header>
      <main className="contenedor">
        <Routes>
          <Route path="/" element={<Catalogo />} />
          <Route path="/producto/:id" element={<Detalle />} />
          <Route path="/registrar" element={<Registrar />} />
          <Route path="*" element={
            <div className="vacio"><h2>Página no encontrada</h2><Link className="btn primario" to="/">Volver al catálogo</Link></div>
          } />
        </Routes>
      </main>
      <RegistroHttp />
    </div>
  );
}