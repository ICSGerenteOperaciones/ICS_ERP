import { useEffect, useMemo, useState } from 'react';
import { ScrollText, Search, Download, ShieldAlert, Lock } from 'lucide-react';
import DataTable from '../../components/DataTable';
import { Button, Card, Modal, Tag, useUi } from '../../components/ui';
import { db, useDb } from '../../data/db';
import { MODULES } from '../../config/modules';

export const ACCIONES = {
  CREAR: { label: 'Creación', tone: 'good' },
  EDITAR: { label: 'Edición', tone: 'info' },
  WORKFLOW: { label: 'Flujo', tone: 'accent' },
  ELIMINAR: { label: 'Eliminación', tone: 'critical' },
  LOGIN: { label: 'Ingreso', tone: 'neutral' },
  LOGOUT: { label: 'Salida', tone: 'muted' },
  LOGIN_FALLIDO: { label: 'Ingreso fallido', tone: 'critical' },
  CAMBIO_EMPRESA: { label: 'Cambio de empresa', tone: 'neutral' },
};

export const moduloLabel = (key) =>
  MODULES.find((m) => m.key === key)?.label || { sesion: 'Sesión', sistema: 'Sistema' }[key] || key;

const fmtFechaHora = (iso) =>
  new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const localDay = (iso) => new Date(iso).toLocaleDateString('en-CA'); // AAAA-MM-DD en hora local

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

function exportCsv(rows) {
  const head = ['Código', 'Fecha', 'Usuario', 'Rol', 'Acción', 'Módulo', 'Registro', 'Descripción'];
  const body = rows.map((l) =>
    [l.codigo, fmtFechaHora(l.fecha), l.usuario, l.rol, ACCIONES[l.accion]?.label || l.accion, moduloLabel(l.modulo), l.registro_codigo, l.descripcion].map(csvCell).join(','),
  );
  const blob = new Blob([`﻿${[head.map(csvCell).join(','), ...body].join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `auditoria-${localDay(new Date().toISOString())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Auditorias() {
  const { toast } = useUi();
  const logs = useDb((d) => d.list('auditoria_logs'));
  const [q, setQ] = useState('');
  const [usuario, setUsuario] = useState('');
  const [modulo, setModulo] = useState('');
  const [accion, setAccion] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [limite, setLimite] = useState(100);
  const [sel, setSel] = useState(null);

  const usuarios = useMemo(() => [...new Set(logs.map((l) => l.usuario))].sort((a, b) => a.localeCompare(b, 'es')), [logs]);
  const modulos = useMemo(() => [...new Set(logs.map((l) => l.modulo))], [logs]);

  const filtrados = useMemo(() => {
    const term = q.trim().toLowerCase();
    return logs
      .filter(
        (l) =>
          (!usuario || l.usuario === usuario) &&
          (!modulo || l.modulo === modulo) &&
          (!accion || l.accion === accion) &&
          (!desde || localDay(l.fecha) >= desde) &&
          (!hasta || localDay(l.fecha) <= hasta) &&
          (!term || `${l.codigo} ${l.usuario} ${l.descripcion} ${l.registro_codigo}`.toLowerCase().includes(term)),
      )
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [logs, q, usuario, modulo, accion, desde, hasta]);

  const limpiar = () => {
    setQ('');
    setUsuario('');
    setModulo('');
    setAccion('');
    setDesde('');
    setHasta('');
    setLimite(100);
  };
  const hayFiltros = q || usuario || modulo || accion || desde || hasta;
  useEffect(() => {
    if (sel) db.ensureCambios(sel.id);
  }, [sel]);
  const cambios = useDb((d) => (sel ? d.list('auditoria_logs_cambios', (c) => c.log_id === sel.id) : []), [sel?.id]);

  return (
    <div className="page">
      <header className="page-head">
        <div className="page-title">
          <span className="page-icon">
            <ScrollText size={22} aria-hidden />
          </span>
          <div>
            <h1>Auditoría</h1>
            <p className="muted">Registro de actividad del sistema · Maestro (evento) → Detalle (cambios campo a campo)</p>
          </div>
        </div>
        <div className="page-actions">
          <Tag tone="muted">
            <Lock size={11} aria-hidden /> Solo lectura · los registros son inmutables
          </Tag>
          <Button
            variant="ghost"
            icon={Download}
            onClick={() => {
              exportCsv(filtrados);
              toast(`${filtrados.length} eventos exportados`);
            }}
            disabled={!filtrados.length}
          >
            Exportar CSV
          </Button>
        </div>
      </header>

      <div className="kpi-row">
        <div className="kpi">
          <span className="kpi-label">Eventos</span>
          <strong className="kpi-value">{filtrados.length}</strong>
          <span className="kpi-hint">{hayFiltros ? 'con los filtros aplicados' : 'registrados'}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Usuarios activos</span>
          <strong className="kpi-value">{new Set(filtrados.filter((l) => l.usuario_id).map((l) => l.usuario_id)).size}</strong>
          <span className="kpi-hint">con actividad</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Eliminaciones</span>
          <strong className="kpi-value">{filtrados.filter((l) => l.accion === 'ELIMINAR').length}</strong>
          <span className="kpi-hint">acciones críticas</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Ingresos fallidos</span>
          <strong className="kpi-value">{filtrados.filter((l) => l.accion === 'LOGIN_FALLIDO').length}</strong>
          <span className="kpi-hint">posibles accesos indebidos</span>
        </div>
      </div>

      <div className="toolbar">
        <div className="search">
          <Search size={16} aria-hidden />
          <input placeholder="Buscar por descripción, usuario o registro…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar" />
        </div>
        <select value={usuario} onChange={(e) => setUsuario(e.target.value)} aria-label="Filtrar por usuario">
          <option value="">Todos los usuarios</option>
          {usuarios.map((u) => (
            <option key={u}>{u}</option>
          ))}
        </select>
        <select value={modulo} onChange={(e) => setModulo(e.target.value)} aria-label="Filtrar por módulo">
          <option value="">Todos los módulos</option>
          {modulos.map((m) => (
            <option key={m} value={m}>
              {moduloLabel(m)}
            </option>
          ))}
        </select>
        <select value={accion} onChange={(e) => setAccion(e.target.value)} aria-label="Filtrar por acción">
          <option value="">Todas las acciones</option>
          {Object.entries(ACCIONES).map(([k, a]) => (
            <option key={k} value={k}>
              {a.label}
            </option>
          ))}
        </select>
        <label className="date-filter">
          <span>Desde</span>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} aria-label="Desde" />
        </label>
        <label className="date-filter">
          <span>Hasta</span>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} aria-label="Hasta" />
        </label>
        {hayFiltros && (
          <Button variant="ghost" onClick={limpiar}>
            Limpiar filtros
          </Button>
        )}
      </div>

      <Card className="flush">
        <DataTable
          columns={[
            { key: 'fecha', label: 'Fecha y hora', render: (l) => <span className="nowrap">{fmtFechaHora(l.fecha)}</span>, sortValue: (l) => l.fecha },
            {
              key: 'usuario', label: 'Usuario',
              render: (l) => (
                <span className="user-cell">
                  <strong className="nowrap">{l.usuario}</strong>
                  <small className="muted">{l.rol}</small>
                </span>
              ),
            },
            { key: 'accion', label: 'Acción', render: (l) => <Tag tone={ACCIONES[l.accion]?.tone}>{ACCIONES[l.accion]?.label || l.accion}</Tag>, sortValue: (l) => l.accion },
            { key: 'modulo', label: 'Módulo', render: (l) => moduloLabel(l.modulo), sortValue: (l) => moduloLabel(l.modulo) },
            { key: 'registro_codigo', label: 'Registro', render: (l) => (l.registro_codigo ? <span className="code">{l.registro_codigo}</span> : '—') },
            { key: 'descripcion', label: 'Descripción' },
          ]}
          rows={filtrados.slice(0, limite)}
          onRowClick={setSel}
          empty="No hay eventos que coincidan con los filtros"
        />
        {filtrados.length > limite && (
          <div className="detail-foot">
            <span>
              Mostrando {limite} de {filtrados.length} eventos
            </span>
            <Button variant="ghost" className="sm" onClick={() => setLimite((n) => n + 100)}>
              Mostrar más
            </Button>
          </div>
        )}
      </Card>

      {sel && (
        <Modal title={`Evento ${sel.codigo}`} onClose={() => setSel(null)} size="lg">
          <dl className="dl-grid">
            <div>
              <dt>Fecha y hora</dt>
              <dd>{fmtFechaHora(sel.fecha)}</dd>
            </div>
            <div>
              <dt>Usuario</dt>
              <dd>
                {sel.usuario} <span className="muted small">({sel.usuario_login || '—'})</span>
              </dd>
            </div>
            <div>
              <dt>Rol</dt>
              <dd>{sel.rol}</dd>
            </div>
            <div>
              <dt>Acción</dt>
              <dd>
                <Tag tone={ACCIONES[sel.accion]?.tone}>{ACCIONES[sel.accion]?.label || sel.accion}</Tag>
              </dd>
            </div>
            <div>
              <dt>Módulo</dt>
              <dd>{moduloLabel(sel.modulo)}</dd>
            </div>
            <div>
              <dt>Registro afectado</dt>
              <dd>{sel.registro_codigo || '—'}</dd>
            </div>
            <div className="span-3">
              <dt>Descripción</dt>
              <dd>{sel.descripcion}</dd>
            </div>
          </dl>
          <h4 className="modal-sub">
            <ShieldAlert size={14} aria-hidden /> Detalle de cambios
          </h4>
          {cambios.length ? (
            <div className="table-wrap">
              <table className="table dense">
                <thead>
                  <tr>
                    <th>Campo</th>
                    <th>Valor anterior</th>
                    <th>Valor nuevo</th>
                  </tr>
                </thead>
                <tbody>
                  {cambios.map((c) => (
                    <tr key={c.id}>
                      <td className="code">{c.campo}</td>
                      <td>{c.anterior ? <span className="val-old">{c.anterior}</span> : <span className="muted">—</span>}</td>
                      <td>{c.nuevo ? <span className="val-new">{c.nuevo}</span> : <span className="muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">Este evento no modificó datos (por ejemplo, un inicio de sesión).</p>
          )}
        </Modal>
      )}
    </div>
  );
}
