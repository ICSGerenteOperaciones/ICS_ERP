import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { KeyRound, Lock, Search, UserCog, LogOut } from 'lucide-react';
import { LogoMark } from './Logo';
import { MODULES } from '../config/modules';
import { useAuth } from '../auth/AuthContext';
import { FormModal, useUi } from './ui';

// El buscador (lupa) está FIJO en la cima del arco. Debajo, los módulos forman un anillo: al acercar el
// mouse al borde superior o inferior del menú la rueda gira y los módulos "dan la vuelta":
// los que salen por arriba reaparecen por abajo (y al revés). Los módulos sin permiso muestran candado.
const MODS = MODULES.filter((m) => m.key !== 'dashboard');
const NR = MODS.length; // módulos que giran
const N = NR + 1; // posiciones del arco: lupa fija + módulos

const X_EDGE = 34; // X del centro de los iconos en los extremos del arco
const BULGE = 70; // cuánto sobresale el centro del arco hacia la derecha
const ARC = 62; // semiángulo del arco (grados)
const D_MIN = 52; // separación mínima entre iconos
const D_MAX = 78; // separación máxima entre iconos
const TOP = 92; // espacio reservado arriba (logo de inicio)
const BOTTOM = 92; // espacio reservado abajo (usuario)
const ZONA = 0.32; // fracción superior/inferior del menú que hace girar la rueda
const MAX_SPEED = 1.9; // posiciones por segundo (junto al borde)

const mod = (n, m) => ((n % m) + m) % m;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export default function ModuleWheel({ onSearch, searchOpen }) {
  const { can, user, role, logout, remote, cambiarContrasena } = useAuth();
  const { toast } = useUi();
  const [cambiandoClave, setCambiandoClave] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [height, setHeight] = useState(700);
  const [profile, setProfile] = useState(false);
  const [offset, setOffset] = useState(0); // posiciones giradas (fraccionario)
  const ref = useRef(null);
  const off = useRef(0);
  const vel = useRef(0);
  const target = useRef(0);
  const reduced = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setHeight(e.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => setProfile(false), [pathname]);

  // Animación: la velocidad se acerca suavemente a la que pide el mouse.
  useEffect(() => {
    reduced.current = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let last = performance.now();
    let raf = 0;
    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      vel.current += (target.current - vel.current) * Math.min(1, dt * 8);
      if (Math.abs(vel.current) > 0.003) {
        off.current = mod(off.current + vel.current * dt, NR);
        setOffset(off.current);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // La rueda del ratón sobre el menú también gira el anillo.
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      off.current = mod(off.current + Math.sign(e.deltaY) * 0.5, NR);
      setOffset(off.current);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Mouse arriba → los módulos suben; mouse abajo → bajan. Cerca del centro la rueda se detiene.
  const onMouseMove = (e) => {
    if (reduced.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const r = (e.clientY - rect.top) / rect.height;
    if (r < ZONA) target.current = ((ZONA - r) / ZONA) * MAX_SPEED;
    else if (r > 1 - ZONA) target.current = -((r - (1 - ZONA)) / ZONA) * MAX_SPEED;
    else target.current = 0;
  };
  const stop = () => {
    target.current = 0;
  };

  const avail = Math.max(160, height - TOP - BOTTOM);
  const d = clamp(avail / N, D_MIN, D_MAX);
  const cy = TOP + avail / 2;
  const cosA = Math.cos((ARC * Math.PI) / 180);

  const arcX = (y) => {
    const t = clamp((y - cy) / (avail / 2), -1, 1);
    return X_EDGE + (BULGE * (Math.cos((t * ARC * Math.PI) / 180) - cosA)) / (1 - cosA);
  };

  // La lupa ocupa siempre la primera posición del arco.
  const searchY = TOP + d / 2;
  // Los módulos giran en el espacio que queda debajo de la lupa (s = lugar en el anillo, 0 = arriba).
  const ringTop = TOP + d;
  const place = (i) => {
    const s = mod(i - offset, NR);
    const y = ringTop + s * d + d / 2;
    // Se desvanece al acercarse a la lupa (arriba) y al final del arco (abajo)
    const edge = Math.min(y - ringTop, TOP + avail - y);
    return { x: arcX(y), y, o: clamp(edge / (d * 0.5), 0, 1) };
  };

  const initials = user.nombre.split(' ').map((p) => p[0]).slice(0, 2).join('');

  return (
    <nav className="wheel" ref={ref} aria-label="Menú de módulos" onMouseMove={onMouseMove} onMouseLeave={stop}>
      {/* Inicio */}
      <div className="wheel-top">
        <button
          className={`orb-btn home ${pathname.startsWith('/dashboard') ? 'active' : ''}`}
          onClick={() => navigate('/dashboard')}
          aria-label="Inicio"
          data-tip="Inicio"
        >
          <LogoMark size={44} />
        </button>
      </div>

      {/* Arco guía */}
      <svg className="wheel-arc" width="100%" height="100%" aria-hidden>
        <path
          d={Array.from({ length: 21 }, (_, k) => {
            const t = (k / 20) * 2 - 1;
            const x = X_EDGE + (BULGE * (Math.cos((t * ARC * Math.PI) / 180) - cosA)) / (1 - cosA);
            return `${k ? 'L' : 'M'} ${x} ${cy + (t * avail) / 2}`;
          }).join(' ')}
        />
      </svg>

      <ul className="wheel-items">
        {/* Lupa: fija, nunca gira */}
        <li className="wheel-item" style={{ transform: `translate(${arcX(searchY)}px, ${searchY}px)` }}>
          <button
            className={`orb-btn wheel-search ${searchOpen ? 'active' : ''}`}
            onClick={() => onSearch?.()}
            aria-label="Buscar"
            data-tip="Buscar (Ctrl+K)"
          >
            <Search size={20} />
          </button>
        </li>

        {MODS.map((m, i) => {
          const { x, y, o } = place(i);
          const Icon = m.icon;
          const allowed = can(m.key, 'ver');
          const active = pathname.startsWith(m.path);
          return (
            <li
              key={m.key}
              className="wheel-item"
              style={{ transform: `translate(${x}px, ${y}px)`, opacity: o, pointerEvents: o > 0.4 ? 'auto' : 'none' }}
            >
              <button
                className={`orb-btn ${active ? 'active' : ''} ${allowed ? '' : 'locked'}`}
                onClick={() => allowed && navigate(m.path)}
                aria-disabled={!allowed}
                aria-current={active ? 'page' : undefined}
                aria-label={allowed ? m.label : `${m.label} (sin permiso)`}
                data-tip={allowed ? m.label : `${m.label} · sin permiso`}
                tabIndex={o > 0.05 ? 0 : -1}
              >
                <Icon size={19} />
                {!allowed && (
                  <span className="lock-badge" aria-hidden>
                    <Lock size={9} strokeWidth={3} />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {/* Usuario */}
      <div className="wheel-bottom">
        <button className="orb-btn user" onClick={() => setProfile((p) => !p)} aria-label="Mi usuario" aria-expanded={profile} data-tip="Mi usuario">
          <UserCog size={19} />
        </button>
        {profile && (
          <div className="profile-pop" role="menu">
            <div className="profile-head">
              <span className="avatar">{initials}</span>
              <div>
                <strong>{user.nombre}</strong>
                <small>{role?.nombre}</small>
              </div>
            </div>
            {can('usuarios', 'ver') && (
              <button role="menuitem" onClick={() => navigate('/usuarios')}>
                <UserCog size={15} /> Gestión de usuarios
              </button>
            )}
            {remote && (
              <button role="menuitem" onClick={() => { setProfile(false); setCambiandoClave(true); }}>
                <KeyRound size={15} /> Cambiar contraseña
              </button>
            )}
            <button role="menuitem" onClick={logout}>
              <LogOut size={15} /> Cerrar sesión
            </button>
          </div>
        )}
      </div>

      {cambiandoClave && (
        <FormModal
          title="Cambiar contraseña"
          submitLabel="Cambiar"
          fields={[
            { key: 'nueva', label: 'Nueva contraseña (mínimo 10 caracteres)', type: 'password', required: true, span: 3 },
            { key: 'confirmar', label: 'Confirmar nueva contraseña', type: 'password', required: true, span: 3 },
          ]}
          onClose={() => setCambiandoClave(false)}
          onSubmit={async (d) => {
            if (d.nueva !== d.confirmar) return toast('Las contraseñas no coinciden.', 'critical');
            const err = await cambiarContrasena(d.nueva);
            if (err) return toast(err, 'critical');
            setCambiandoClave(false);
            toast('Contraseña actualizada');
          }}
        />
      )}

      {/* Navegación compacta para pantallas pequeñas */}
      <div className="dock">
        <button onClick={onSearch} aria-label="Buscar">
          <Search size={20} aria-hidden />
        </button>
        {MODULES.filter((m) => can(m.key, 'ver')).map((m) => (
          <button
            key={m.key}
            className={pathname.startsWith(m.path) ? 'active' : ''}
            onClick={() => navigate(m.path)}
            aria-label={m.label}
          >
            <m.icon size={20} aria-hidden />
          </button>
        ))}
      </div>
    </nav>
  );
}
