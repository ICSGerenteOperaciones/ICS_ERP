import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Calendar, ClipboardList, Clock, Layers, LayoutGrid, Plus, Search, User, Workflow } from 'lucide-react';
import { Button, Empty, FormModal, Tag, fmtDate, useUi } from '../../components/ui';
import { useAuth } from '../../auth/AuthContext';
import { db } from '../../data/db';
import { ETAPAS, ESTADOS, PRIORIDADES, PRIORIDAD_TONE, crearSistema, etapaInfo, fmtHoras, isAbierta, permisos, pendientesDe, today, userName, usuariosDeEmpresa } from './logic';
import { EstadoBadge, HorasBar, empresaAlias, useOpsData } from './shared';
import SistemaDetalle, { camposSistema } from './SistemaDetalle';
import RegistroActividades from './RegistroActividades';
import './ops.css';

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function SistemaCard({ s, stats, abierta, empresas, onOpen }) {
  const e = etapaInfo(s.etapa);
  const idx = ETAPAS.findIndex((x) => x.key === s.etapa);
  const vencido = s.estado !== 'CERRADO' && s.etapa !== 'DESPLEGADO' && s.fecha_entrega < today();
  return (
    <button type="button" className={`ops-card ${s.estado === 'PAUSADO' ? 'pausado' : ''} ${s.estado === 'CERRADO' ? 'cerrado' : ''}`} style={{ '--ops-etapa': e.color, '--c': e.color }} onClick={() => onOpen(s.id)}>
      <div className="ops-card-top">
        <div style={{ minWidth: 0 }}>
          <h3>{s.nombre}</h3>
          <span className="sub">{s.codigo} · {empresaAlias(empresas, s.empresa_id)}</span>
        </div>
        {s.estado === 'PAUSADO' ? <span className="ops-pausado-tag">PAUSADO</span> : <EstadoBadge estado={s.estado} />}
      </div>
      <div className="ops-mini" aria-hidden>
        {ETAPAS.map((x, i) => <i key={x.key} className={`${i <= idx ? 'on' : ''} ${i === idx ? 'now' : ''}`} style={{ '--c': x.color }} />)}
      </div>
      <span className="ops-etapa-now">Etapa actual: {e.label}</span>
      <div className="ops-meta">
        <span><User size={13} aria-hidden /> {userName(s.desarrollador_id)}</span>
        <span><Calendar size={13} aria-hidden /> {fmtDate(s.fecha_inicio)} → <span className={vencido ? 'ops-late' : ''}>{fmtDate(s.fecha_entrega)}</span></span>
        <Tag tone={PRIORIDAD_TONE[s.prioridad]}>{s.prioridad}</Tag>
        {abierta && <Tag tone="accent">En revisión de {abierta.tipo === 'QA' ? 'QA' : 'líder'}</Tag>}
      </div>
      <div className="ops-total"><b>{stats.total.toLocaleString('es-CO', { maximumFractionDigits: 2 })}</b><small>horas invertidas</small></div>
      <HorasBar porEtapa={stats.porEtapa} total={stats.total} />
    </button>
  );
}

function Sistemas({ data, auth, empSel, setEmpSel, onOpen, onNuevo }) {
  const { user } = auth;
  const p = permisos(auth);
  const { sistemas, stats, revisiones, empresas, usuarios } = data;
  // El desarrollador ve por defecto sus sistemas; quien gestiona, revisa o solo consulta ve todos.
  const esDesarrollador = auth.can('operaciones', 'crear') && !p.gestiona && !auth.can('operaciones', 'aprobar');
  const [f, setF] = useState({ q: '', etapa: '', estado: '', resp: '', prioridad: '', mios: esDesarrollador });
  const [vista, setVista] = useState('tarjetas');
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const pend = pendientesDe(user.id).filter((r) => sistemas.some((s) => s.id === r.sistema_id));
  const responsables = useMemo(() => {
    const ids = [...new Set(sistemas.map((s) => s.desarrollador_id).filter(Boolean))];
    return ids.map((id) => [id, usuarios.find((u) => u.id === id)?.nombre || '—']).sort((a, b) => a[1].localeCompare(b[1]));
  }, [sistemas, usuarios]);

  const lista = useMemo(() => {
    const q = norm(f.q);
    return sistemas
      .filter((s) => (!f.etapa || s.etapa === f.etapa) && (!f.estado || s.estado === f.estado) && (!f.resp || s.desarrollador_id === f.resp) && (!f.prioridad || s.prioridad === f.prioridad))
      .filter((s) => !f.mios || [s.desarrollador_id, s.coordinador_id, s.qa_id].includes(user.id) || pend.some((r) => r.sistema_id === s.id))
      .filter((s) => !q || norm(`${s.codigo} ${s.nombre} ${s.descripcion}`).includes(q))
      .sort((a, b) => ({ ACTIVO: 0, PAUSADO: 1, CERRADO: 2 })[a.estado] - ({ ACTIVO: 0, PAUSADO: 1, CERRADO: 2 })[b.estado] || a.fecha_entrega.localeCompare(b.fecha_entrega));
  }, [sistemas, f, user.id, pend]);

  const activos = sistemas.filter((s) => s.estado === 'ACTIVO').length;
  const totalH = sistemas.reduce((n, s) => n + (stats.get(s.id)?.total || 0), 0);
  const abiertaDe = (id) => revisiones.find((r) => r.sistema_id === id && isAbierta(r));
  const card = (s) => <SistemaCard key={s.id} s={s} stats={stats.get(s.id)} abierta={abiertaDe(s.id)} empresas={empresas} onOpen={onOpen} />;

  return (
    <>
      {pend.length > 0 && (
        <div className="ops-aviso" role="status">
          <strong>Tiene {pend.length} {pend.length === 1 ? 'sistema' : 'sistemas'} esperando su revisión: {pend.slice(0, 3).map((r) => sistemas.find((s) => s.id === r.sistema_id)?.nombre).filter(Boolean).join(', ')}{pend.length > 3 ? '…' : ''}</strong>
          <Button className="btn-ops-green" onClick={() => onOpen(pend[0].sistema_id)}>Revisar ahora</Button>
        </div>
      )}

      <div className="ops-resumen">
        <span className="ops-chip"><b>{activos}</b> activos</span>
        <span className="ops-chip"><b>{sistemas.filter((s) => s.estado === 'PAUSADO').length}</b> pausados</span>
        <span className="ops-chip"><b>{sistemas.filter((s) => s.estado === 'CERRADO').length}</b> cerrados</span>
        <span className="ops-chip"><b>{fmtHoras(totalH)}</b> invertidas</span>
      </div>

      <div className="ops-filtros">
        <label className="search"><Search size={16} aria-hidden /><input placeholder="Buscar sistema…" value={f.q} onChange={(e) => set('q', e.target.value)} aria-label="Buscar sistema" /></label>
        <select aria-label="Etapa" value={f.etapa} onChange={(e) => set('etapa', e.target.value)}>
          <option value="">Todas las etapas</option>
          {ETAPAS.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
        </select>
        <select aria-label="Estado" value={f.estado} onChange={(e) => set('estado', e.target.value)}>
          <option value="">Todos los estados</option>
          {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select aria-label="Responsable" value={f.resp} onChange={(e) => set('resp', e.target.value)}>
          <option value="">Todos los responsables</option>
          {responsables.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
        </select>
        <select aria-label="Empresa" value={empSel} onChange={(e) => setEmpSel(e.target.value)}>
          <option value="">Empresa activa</option>
          <option value="ALL">Todas mis empresas</option>
          {empresas.map((e) => <option key={e.id} value={e.id}>{e.alias || e.nombre}</option>)}
        </select>
        <select aria-label="Prioridad" value={f.prioridad} onChange={(e) => set('prioridad', e.target.value)}>
          <option value="">Toda prioridad</option>
          {PRIORIDADES.map((x) => <option key={x}>{x}</option>)}
        </select>
        <label className="ops-toggle"><input type="checkbox" checked={f.mios} onChange={(e) => set('mios', e.target.checked)} /> Solo los míos</label>
        <div className="seg" role="group" aria-label="Vista" style={{ marginLeft: 'auto' }}>
          <button type="button" className={vista === 'tarjetas' ? 'active' : ''} onClick={() => setVista('tarjetas')}><LayoutGrid size={14} aria-hidden /> Tarjetas</button>
          <button type="button" className={vista === 'kanban' ? 'active' : ''} onClick={() => setVista('kanban')}><Layers size={14} aria-hidden /> Por etapa</button>
        </div>
      </div>

      {lista.length === 0 ? (
        <Empty icon={Workflow} title={sistemas.length ? 'Ningún sistema coincide con los filtros' : 'Todavía no hay sistemas'}>
          {p.gestiona && !sistemas.length ? <Button icon={Plus} className="btn-ops" onClick={onNuevo}>Crear el primer sistema</Button> : 'Cambie los filtros para ver más resultados.'}
        </Empty>
      ) : vista === 'tarjetas' ? (
        <div className="ops-grid">{lista.map(card)}</div>
      ) : (
        <div className="ops-kanban">
          {ETAPAS.map((e) => {
            const col = lista.filter((s) => s.etapa === e.key);
            return (
              <section className="ops-col" key={e.key} style={{ '--c': e.color }}>
                <header><span>{e.n} · {e.label}</span><small>{col.length}</small></header>
                {col.map(card)}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

export default function Operaciones() {
  const auth = useAuth();
  const { user, empresa, empresas } = auth;
  const { toast } = useUi();
  const p = permisos(auth);
  const [params, setParams] = useSearchParams();
  const [empSel, setEmpSel] = useState('');
  const [nuevo, setNuevo] = useState(false);
  const [sisReg, setSisReg] = useState('');
  const data = useOpsData(empSel);

  const vista = params.get('vista') === 'registro' ? 'registro' : 'sistemas';
  const id = params.get('id');
  const detalle = id ? data.sistemas.find((s) => s.id === id) || db.listAll('ops_sistemas').find((s) => s.id === id) : null;

  const irA = (v) => {
    setParams(v === 'registro' ? { vista: 'registro' } : {});
  };
  const abrir = (sid) => setParams({ id: sid });
  const registrarEn = (sid) => {
    setSisReg(sid);
    setParams({ vista: 'registro' });
  };

  const pendientes = pendientesDe(user.id).length;

  const crear = (d) => {
    const r = crearSistema(d, user);
    if (!r.ok) return toast(r.error, 'critical');
    toast(`Sistema ${r.sistema.codigo} creado`);
    setNuevo(false);
    return abrir(r.sistema.id);
  };

  if (detalle) {
    // Si el sistema es de otra empresa que la vista actual, se muestra con sus propios datos.
    const dd = data.sistemas.some((s) => s.id === detalle.id) ? data : { ...data, stats: new Map([[detalle.id, data.stats.get(detalle.id) || { total: 0, porEtapa: {} }]]) };
    return <SistemaDetalle sis={detalle} data={dd} onBack={() => setParams({})} onRegistrar={registrarEn} />;
  }

  return (
    <div className="page ops">
      <header className="ops-hero">
        <div>
          <h1>Operaciones</h1>
          <p>Sistemas en desarrollo · {empresa?.alias || empresa?.nombre}</p>
        </div>
        <nav className="ops-sections" aria-label="Secciones">
          <button type="button" className={`ops-section-btn ${vista === 'sistemas' ? 'active' : ''}`} onClick={() => irA('sistemas')}>
            <ClipboardList size={17} aria-hidden /> Sistemas
            {pendientes > 0 && <span className="ops-badge-count" title="Revisiones pendientes">{pendientes}</span>}
          </button>
          <button type="button" className={`ops-section-btn ${vista === 'registro' ? 'active' : ''}`} onClick={() => irA('registro')}>
            <Clock size={17} aria-hidden /> Registro de actividades
          </button>
        </nav>
        {p.gestiona && vista === 'sistemas' && <Button icon={Plus} className="btn-ops-green" onClick={() => setNuevo(true)} disabled={!empresa}>Nuevo sistema</Button>}
      </header>

      {vista === 'sistemas' ? (
        <Sistemas data={data} auth={auth} empSel={empSel} setEmpSel={setEmpSel} onOpen={abrir} onNuevo={() => setNuevo(true)} />
      ) : (
        <RegistroActividades data={data} sistemaInicial={sisReg} onVerSistema={abrir} />
      )}

      {nuevo && empresa && (
        <FormModal
          title="Nuevo sistema"
          submitLabel="Crear sistema"
          initial={{ empresa_id: empresa.id, prioridad: 'Media', fecha_inicio: today(), desarrollador_id: '', coordinador_id: '', qa_id: '' }}
          fields={camposSistema({
            usuarios: usuariosDeEmpresa(empresa.id).map((u) => ({ value: u.id, label: u.nombre })),
            empresas: empresas.filter((e) => e.id === empresa.id),
            empresaFija: true,
          })}
          onClose={() => setNuevo(false)}
          onSubmit={crear}
        />
      )}
    </div>
  );
}
