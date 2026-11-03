import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, CornerDownLeft, ArrowRight, X } from 'lucide-react';
import { db } from '../data/db';
import { useAuth } from '../auth/AuthContext';
import { MODULES } from '../config/modules';
import { terceroName } from '../data/lookups';
import { stateInfo } from '../workflow/engine';

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Palabras clave para encontrar un módulo por lo que hace, no solo por su nombre.
const KEYWORDS = {
  dashboard: 'inicio resumen indicadores tablero kpi',
  compras: 'orden ordenes proveedor proveedores oc adquisiciones pedidos',
  inventario: 'stock existencias articulos kardex bodega movimientos almacen productos',
  firmas: 'documentos firma firmar contratos actas',
  actividades: 'tareas proyectos tiempos horas pendientes',
  operaciones: 'sistemas desarrollo qa etapas horas registro innovacion despliegue revision',
  terceros: 'clientes proveedores aliados contactos nit',
  auditorias: 'logs registro eventos historial trazabilidad cambios seguridad',
  empresas: 'multiempresa grupo companias sociedades sucursales',
  usuarios: 'accesos cuentas personas',
  roles: 'permisos perfiles',
};

// Fuentes de registros que se pueden buscar. Las lecturas respetan la empresa activa.
const SOURCES = [
  {
    module: 'compras', table: 'compras', group: 'Compras',
    text: (r) => `${r.codigo} ${terceroName(r.proveedor_id)} ${r.solicitante} ${r.centro_costo}`,
    title: (r) => `${r.codigo} · ${terceroName(r.proveedor_id)}`,
    sub: (r) => `Orden de compra · ${stateInfo('compras', r.estado).label}`,
    path: (r) => `/compras?id=${r.id}`,
  },
  {
    module: 'terceros', table: 'terceros', group: 'Terceros',
    text: (r) => `${r.codigo} ${r.razon_social} ${r.documento} ${r.ciudad} ${r.email} ${r.tipo}`,
    title: (r) => r.razon_social,
    sub: (r) => `${r.codigo} · ${r.tipo} · ${r.ciudad}`,
    path: (r) => `/terceros?id=${r.id}`,
  },
  {
    module: 'firmas', table: 'firmas', group: 'Documentos',
    text: (r) => `${r.codigo} ${r.titulo} ${r.tipo}`,
    title: (r) => r.titulo,
    sub: (r) => `${r.codigo} · ${r.tipo} · ${stateInfo('firmas', r.estado).label}`,
    path: (r) => `/firmas?id=${r.id}`,
  },
  {
    module: 'actividades', table: 'actividades', group: 'Actividades',
    text: (r) => `${r.codigo} ${r.titulo} ${r.responsable} ${r.area}`,
    title: (r) => r.titulo,
    sub: (r) => `${r.codigo} · ${r.responsable} · ${stateInfo('actividades', r.estado).label}`,
    path: (r) => `/actividades?id=${r.id}`,
  },
  {
    module: 'operaciones', table: 'ops_sistemas', group: 'Sistemas',
    text: (r) => `${r.codigo} ${r.nombre} ${r.descripcion} ${r.etapa} ${r.estado}`,
    title: (r) => r.nombre,
    sub: (r) => `${r.codigo} · Sistema · ${r.estado.charAt(0)}${r.estado.slice(1).toLowerCase()}`,
    path: (r) => `/operaciones?id=${r.id}`,
  },
  {
    module: 'inventario', table: 'articulos', group: 'Artículos',
    text: (r) => `${r.codigo} ${r.nombre} ${r.categoria}`,
    title: (r) => `${r.codigo} · ${r.nombre}`,
    sub: (r) => `Artículo · ${r.categoria}`,
    path: () => '/inventario',
  },
  {
    module: 'inventario', table: 'inventario', group: 'Movimientos de inventario',
    text: (r) => `${r.codigo} ${r.tipo} ${r.referencia} ${r.observaciones}`,
    title: (r) => `${r.codigo} · ${r.tipo}`,
    sub: (r) => `${r.referencia || r.bodega} · ${stateInfo('inventario', r.estado).label}`,
    path: (r) => `/inventario?id=${r.id}`,
  },
  {
    module: 'empresas', table: 'empresas', group: 'Empresas',
    text: (r) => `${r.codigo} ${r.alias} ${r.nombre} ${r.nit} ${r.ciudad}`,
    title: (r) => r.alias || r.nombre,
    sub: (r) => `${r.nombre} · NIT ${r.nit}`,
    path: () => '/empresas',
  },
  {
    module: 'usuarios', table: 'usuarios', group: 'Usuarios',
    text: (r) => `${r.nombre} ${r.usuario} ${r.email} ${r.cargo}`,
    title: (r) => r.nombre,
    sub: (r) => `${r.cargo || 'Usuario'} · @${r.usuario}`,
    path: () => '/usuarios',
  },
  {
    module: 'roles', table: 'roles', group: 'Roles',
    text: (r) => `${r.codigo} ${r.nombre} ${r.descripcion}`,
    title: (r) => r.nombre,
    sub: (r) => r.descripcion || 'Rol',
    path: () => '/roles',
  },
];

const PER_GROUP = 5;

/** Resalta las coincidencias sin perder tildes ni mayúsculas del texto original. */
function Highlight({ text, tokens }) {
  if (!tokens.length) return text;
  const chars = Array.from(String(text));
  const n = chars.map((ch) => norm(ch) || ch).join('');
  const mark = new Array(chars.length).fill(false);
  tokens.forEach((t) => {
    let i = n.indexOf(t);
    while (i !== -1) {
      for (let k = i; k < i + t.length; k++) mark[k] = true;
      i = n.indexOf(t, i + t.length);
    }
  });
  const parts = [];
  chars.forEach((ch, i) => {
    const last = parts[parts.length - 1];
    if (last && last.m === mark[i]) last.s += ch;
    else parts.push({ m: mark[i], s: ch });
  });
  return parts.map((p, i) => (p.m ? <mark key={i}>{p.s}</mark> : <span key={i}>{p.s}</span>));
}

export default function GlobalSearch({ onClose }) {
  const { can, empresas } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => inputRef.current?.focus(), []);

  const tokens = useMemo(() => norm(q).split(/\s+/).filter(Boolean), [q]);

  // Grupos de resultados: módulos primero, luego registros de cada fuente.
  const groups = useMemo(() => {
    const matches = (text) => {
      const n = norm(text);
      return tokens.every((t) => n.includes(t));
    };
    const out = [];
    const modules = MODULES.filter((m) => can(m.key, 'ver') && (!tokens.length || matches(`${m.label} ${m.group} ${KEYWORDS[m.key] || ''}`))).map((m) => ({
      id: `m-${m.key}`, icon: m.icon, title: m.label, sub: m.group === 'Inicio' ? 'Inicio · indicadores' : `Módulo · ${m.group}`, path: m.path, kind: 'module',
    }));
    if (modules.length) out.push({ name: 'Módulos', items: tokens.length ? modules.slice(0, 8) : modules });
    if (tokens.length) {
      SOURCES.forEach((src) => {
        if (!can(src.module, 'ver')) return;
        const rows = src.table === 'empresas' ? empresas : db.list(src.table);
        const hits = rows.filter((r) => matches(src.text(r)));
        if (hits.length) {
          out.push({
            name: src.group,
            total: hits.length,
            items: hits.slice(0, PER_GROUP).map((r) => ({ id: `${src.table}-${r.id}`, title: src.title(r), sub: src.sub(r), path: src.path(r), kind: 'record', module: src.module })),
          });
        }
      });
    }
    return out;
  }, [tokens, can, empresas]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector('[data-sel="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [sel, groups]);

  const go = (item) => {
    if (!item) return;
    onClose();
    navigate(item.path);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((s) => (flat.length ? (s + 1) % flat.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => (flat.length ? (s - 1 + flat.length) % flat.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(flat[sel]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  let index = -1;
  return (
    <div className="search-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="search-box" role="dialog" aria-modal="true" aria-label="Buscar" onKeyDown={onKeyDown}>
        <div className="search-input">
          <Search size={20} aria-hidden />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar módulos, órdenes, terceros, artículos, personas…"
            aria-label="Buscar en todo el sistema"
            autoComplete="off"
            spellCheck={false}
          />
          {q && (
            <button className="icon-btn" onClick={() => { setQ(''); inputRef.current?.focus(); }} aria-label="Borrar búsqueda">
              <X size={15} aria-hidden />
            </button>
          )}
          <kbd>Esc</kbd>
        </div>

        <div className="search-results" ref={listRef}>
          {groups.length === 0 && (
            <p className="search-empty">
              Sin resultados para <strong>“{q}”</strong>. Pruebe con un código (OC-0001), un nombre o el nombre de un módulo.
            </p>
          )}
          {groups.map((g) => (
            <section key={g.name}>
              <h4>
                {g.name}
                {g.total > PER_GROUP && <span> · {PER_GROUP} de {g.total}</span>}
              </h4>
              {g.items.map((item) => {
                index += 1;
                const i = index;
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    className={`search-item ${i === sel ? 'sel' : ''}`}
                    data-sel={i === sel}
                    onMouseEnter={() => setSel(i)}
                    onClick={() => go(item)}
                  >
                    <span className={`search-ico ${item.kind}`}>{Icon ? <Icon size={16} aria-hidden /> : <ArrowRight size={15} aria-hidden />}</span>
                    <span className="search-text">
                      <strong>
                        <Highlight text={item.title} tokens={tokens} />
                      </strong>
                      <small>{item.sub}</small>
                    </span>
                    {i === sel && <CornerDownLeft size={15} aria-hidden className="muted" />}
                  </button>
                );
              })}
            </section>
          ))}
        </div>

        <footer className="search-foot">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> navegar
          </span>
          <span>
            <kbd>Enter</kbd> abrir
          </span>
          <span className="muted">Busca en la empresa activa</span>
        </footer>
      </div>
    </div>
  );
}
