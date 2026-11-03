import { useMemo, useState } from 'react';
import { ArrowLeft, Clock, FlaskConical, Pencil, Pause, Play, Send, UserCheck, Lock, Trash2 } from 'lucide-react';
import { Button, Card, Empty, FormModal, IconButton, Tag, fmtDate, fmtDateTime, useUi } from '../../components/ui';
import { useAuth } from '../../auth/AuthContext';
import {
  ESTADOS, ETAPAS, PRIORIDAD_TONE, PRIORIDADES, REVISION_ESTADO, REVISION_TIPO, accionesDisponibles, cambiarEstado, cambiarEtapa,
  corregirHoras, editarSistema, eliminarHoras, enviarRevision, etapaInfo, fmtHoras, historialDe, isAbierta, permisos, resolverRevision, today, userName,
  usuariosDeEmpresa,
} from './logic';
import { cambioTexto } from './logic';
import { EnviarRevisionDialog, EstadoBadge, EtapaTag, HorasBar, ResolverDialog, empresaAlias } from './shared';

const ICONO_ESTADO = { pausar: Pause, reactivar: Play, activar: Play, cerrar: Lock };

export default function SistemaDetalle({ sis, data, onBack, onRegistrar }) {
  const auth = useAuth();
  const { user } = auth;
  const { toast, confirm, openDialog } = useUi();
  const p = permisos(auth);
  const stats = data.stats.get(sis.id) || { total: 0, porEtapa: {} };
  const revisiones = data.revisiones.filter((r) => r.sistema_id === sis.id).sort((a, b) => String(b.fecha_envio).localeCompare(String(a.fecha_envio)));
  const abiertas = revisiones.filter(isAbierta);
  const [editando, setEditando] = useState(false);
  const [editHoras, setEditHoras] = useState(null);
  const [tl, setTl] = useState({ etapa: '', usuario: '' });

  // El historial depende del estado global: se recalcula cuando cambian horas o eventos.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const historial = useMemo(() => historialDe(sis.id), [sis.id, data.horas, data.eventos]);
  const historialFiltrado = historial.filter((h) => (!tl.etapa || h.kind === 'evento' || h.etapa === tl.etapa) && (!tl.usuario || h.usuario_id === tl.usuario));
  const usuariosTl = [...new Map(historial.filter((h) => h.usuario_id).map((h) => [h.usuario_id, h.usuario])).entries()];
  const reply = (r, okMsg) => (r.ok ? toast(okMsg) : toast(r.error, 'critical'));
  const activo = sis.estado === 'ACTIVO';
  const vencido = sis.estado !== 'CERRADO' && sis.etapa !== 'DESPLEGADO' && sis.fecha_entrega < today();

  // ---- acciones ----
  const moverEtapa = async (e) => {
    if (!p.gestiona || e.key === sis.etapa) return;
    if (sis.estado === 'CERRADO') return toast('El sistema está cerrado: actívelo para mover su etapa.', 'critical');
    const ok = await confirm(`¿Mover «${sis.nombre}» de ${etapaInfo(sis.etapa).label} a ${e.label}? Las horas registradas no cambian.`, { title: 'Cambiar etapa' });
    if (ok) reply(cambiarEtapa(sis, e.key, user), `Ahora está en ${e.label}`);
    return undefined;
  };

  const accionEstado = async (a) => {
    const res = await confirm(
      a.key === 'cerrar'
        ? `¿Cerrar «${sis.nombre}»? Conserva su historial y horas, pero dejará de contarse como activo.`
        : a.key === 'pausar'
          ? `¿Pausar «${sis.nombre}»? Conserva todo su historial pero no admitirá nuevas horas.`
          : `¿${a.label} «${sis.nombre}»?`,
      { title: `${a.label} sistema`, danger: a.key === 'cerrar', withComment: !!a.motivo },
    );
    if (res) reply(cambiarEstado(sis, a.key, user, res.comment || ''), `Sistema ${ESTADOS[a.hacia].label.toLowerCase()}`);
  };

  const enviar = async (tipo) => {
    const res = await openDialog((done) => <EnviarRevisionDialog sis={sis} tipo={tipo} done={done} />);
    if (res) reply(enviarRevision(sis, tipo, user, res.comentario), `Enviado a ${tipo === 'QA' ? 'QA' : 'su líder'}: ${userName(tipo === 'QA' ? sis.qa_id : sis.coordinador_id)} recibirá el aviso`);
  };

  const resolver = async (rev) => {
    const res = await openDialog((done) => <ResolverDialog rev={rev} sis={sis} done={done} />);
    if (!res) return;
    const r = resolverRevision(rev, res.decision, user, { motivo: res.motivo, devolverADesarrollo: res.devolverADesarrollo, puede: p.resuelve });
    reply(r, r.devuelto ? 'Revisión registrada: el sistema volvió a Desarrollo' : 'Revisión registrada');
  };

  const borrarHoras = async (h) => {
    if (await confirm(`Se eliminará el registro de ${fmtHoras(h.horas)} de ${h.usuario}.`, { title: 'Eliminar registro', danger: true })) {
      eliminarHoras(h);
      toast('Registro eliminado');
    }
  };

  const usuarios = usuariosDeEmpresa(sis.empresa_id).map((u) => ({ value: u.id, label: u.nombre }));

  return (
    <div className="page">
      <div className="ops-det-head">
        <div style={{ minWidth: 0 }}>
          <Button variant="ghost" icon={ArrowLeft} onClick={onBack}>Volver a sistemas</Button>
          <h1 style={{ marginTop: 14 }}>{sis.nombre}</h1>
          <div className="ops-meta">
            <span className="muted">{sis.codigo}</span>
            <EstadoBadge estado={sis.estado} />
            {sis.estado === 'PAUSADO' && <span className="ops-pausado-tag">PAUSADO</span>}
            <Tag tone={PRIORIDAD_TONE[sis.prioridad]}>Prioridad {sis.prioridad.toLowerCase()}</Tag>
            <EtapaTag etapa={sis.etapa} />
          </div>
        </div>
        <div className="ops-acciones">
          {p.registra && <Button icon={Clock} className="btn-ops-green" onClick={() => onRegistrar(sis.id)}>Registrar horas</Button>}
          {p.envia && activo && (
            <>
              <Button icon={FlaskConical} className="btn-ops" onClick={() => enviar('QA')}>Enviar a QA</Button>
              <Button icon={Send} variant="ghost" onClick={() => enviar('LIDER')}>Enviar al líder</Button>
            </>
          )}
          {p.gestiona && (
            <>
              <Button icon={Pencil} variant="ghost" onClick={() => setEditando(true)}>Editar</Button>
              {accionesDisponibles(sis).map((a) => {
                const Icon = ICONO_ESTADO[a.key];
                return <Button key={a.key} icon={Icon} variant={a.key === 'cerrar' ? 'danger-ghost' : 'ghost'} onClick={() => accionEstado(a)}>{a.label}</Button>;
              })}
            </>
          )}
        </div>
      </div>

      {sis.estado === 'PAUSADO' && (
        <div className="ops-aviso" style={{ borderColor: 'var(--ops-warn)', background: 'color-mix(in srgb, var(--ops-warn) 14%, var(--surface))' }}>
          <strong>Sistema pausado: conserva su historial y horas, no cuenta como activo y no admite nuevas horas{p.isAdmin ? ' (usted, como administrador, puede registrarlas)' : ''}.</strong>
        </div>
      )}

      {/* 1 · Información general  ·  2 · Etapas y horas */}
      <div className="ops-bloques">
        <Card title="1 · Información general">
          <dl className="ops-info">
            <div className="wide"><dt>Descripción</dt><dd style={{ fontWeight: 400 }}>{sis.descripcion || '—'}</dd></div>
            <div><dt>Empresa</dt><dd>{empresaAlias(data.empresas, sis.empresa_id)}</dd></div>
            <div><dt>Estado</dt><dd><EstadoBadge estado={sis.estado} /></dd></div>
            <div><dt>Desarrollador</dt><dd>{userName(sis.desarrollador_id)}</dd></div>
            <div><dt>Coordinador</dt><dd>{userName(sis.coordinador_id)}</dd></div>
            <div><dt>Responsable de QA</dt><dd>{userName(sis.qa_id)}</dd></div>
            <div><dt>Prioridad</dt><dd>{sis.prioridad}</dd></div>
            <div><dt>Inicio</dt><dd>{fmtDate(sis.fecha_inicio)}</dd></div>
            <div><dt>Entrega estimada</dt><dd className={vencido ? 'ops-late' : ''}>{fmtDate(sis.fecha_entrega)}{vencido ? ' · vencida' : ''}</dd></div>
            <div className="wide"><dt>Observaciones</dt><dd style={{ fontWeight: 400 }}>{sis.observaciones || '—'}</dd></div>
          </dl>
        </Card>

        <Card title="2 · Etapas y horas acumuladas" subtitle={p.gestiona ? 'Toque una etapa para mover el sistema (decisión manual).' : 'La etapa la define el administrador o coordinador.'}
          actions={<strong style={{ fontSize: 20 }}>{fmtHoras(stats.total)}</strong>}>
          <div className="ops-flujo">
            {ETAPAS.map((e) => {
              const h = stats.porEtapa[e.key] || 0;
              const clic = p.gestiona && e.key !== sis.etapa && sis.estado !== 'CERRADO';
              const Tag2 = clic ? 'button' : 'div';
              return (
                <Tag2 key={e.key} type={clic ? 'button' : undefined} className={`ops-etapa ${e.key === sis.etapa ? 'actual' : ''} ${clic ? 'clic' : ''}`} style={{ '--c': e.color }} onClick={clic ? () => moverEtapa(e) : undefined}>
                  {e.key === sis.etapa && <span className="aqui">Etapa actual</span>}
                  <span className="n">{e.n}</span>
                  <strong>{e.label}</strong>
                  <p>{e.desc}</p>
                  <span className="h">{h}<small> h</small></span>
                  <span className="pct"><i style={{ width: `${stats.total ? (h / stats.total) * 100 : 0}%` }} /></span>
                </Tag2>
              );
            })}
          </div>
          <HorasBar porEtapa={stats.porEtapa} total={stats.total} leyenda={false} />
          <p className="ops-nota">La etapa no cambia sola al registrar horas: se trabaja en cualquiera de las cuatro, sin importar dónde esté el sistema.</p>
        </Card>
      </div>

      {/* Revisiones */}
      {revisiones.length > 0 && (
        <Card title="Revisiones" subtitle="Envíos a QA y al líder">
          {revisiones.slice(0, 6).map((r) => {
            const st = REVISION_ESTADO[r.estado];
            return (
              <div className="ops-revision" key={r.id} style={{ borderLeftColor: isAbierta(r) ? 'var(--ops-azul)' : 'var(--border)' }}>
                <header>
                  <span><b>{r.tipo === 'QA' ? 'QA' : 'Líder'}</b> · para {userName(r.destinatario_id)} <span className={`badge tone-${st.tone}`}>{st.label}</span></span>
                  <span className="muted small">Enviado por {r.enviado_por_nombre} · {fmtDateTime(r.fecha_envio)}</span>
                </header>
                {r.comentario && <p>“{r.comentario}”</p>}
                {r.resuelto_por && <p className="muted small">Resolvió {r.resuelto_por} · {fmtDateTime(r.fecha_resolucion)}</p>}
                {r.motivo && <p><b>{r.estado === 'RECHAZADA' || r.estado === 'DEVUELTA' ? 'Motivo' : 'Observación'}:</b> {r.motivo}</p>}
                {isAbierta(r) && p.resuelve(r) && (
                  <div className="acc"><Button icon={UserCheck} className="btn-ops" onClick={() => resolver(r)}>{r.tipo === 'QA' ? 'Aprobar o rechazar' : 'Revisar'}</Button></div>
                )}
              </div>
            );
          })}
          {abiertas.length === 0 && <p className="muted small">No hay revisiones abiertas.</p>}
        </Card>
      )}

      {/* 3 · Historial */}
      <Card title="3 · Historial de actividades, comentarios y revisiones"
        actions={
          <div className="ops-tl-filtros">
            <select aria-label="Etapa" value={tl.etapa} onChange={(e) => setTl({ ...tl, etapa: e.target.value })}>
              <option value="">Todas las etapas</option>
              {ETAPAS.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
            </select>
            <select aria-label="Usuario" value={tl.usuario} onChange={(e) => setTl({ ...tl, usuario: e.target.value })}>
              <option value="">Todos los usuarios</option>
              {usuariosTl.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
            </select>
          </div>
        }>
        {historialFiltrado.length === 0 ? (
          <Empty icon={Clock} title="Sin movimientos">Aún no hay horas ni acciones registradas.</Empty>
        ) : (
          <ul className="ops-tl">
            {historialFiltrado.slice(0, 80).map((h) => (
              <li key={`${h.kind}-${h.id}`}>
                <time>{fmtDate(h.fecha)}</time>
                {h.kind === 'horas' ? (
                  <span className="txt">
                    <span><EtapaTag etapa={h.etapa} /> <b>{fmtHoras(h.horas)}</b> · {h.usuario}</span>
                    <span>{h.texto}</span>
                  </span>
                ) : (
                  <span className="txt">
                    <span className="evento">{h.texto}{cambioTexto(h.desde, h.hacia)}</span>
                    <small>{h.usuario}{h.comentario ? ` · ${h.comentario}` : ''}</small>
                  </span>
                )}
                {h.kind === 'horas' && p.gestiona ? (
                  <span style={{ whiteSpace: 'nowrap' }}>
                    <IconButton icon={Pencil} label="Corregir" onClick={() => setEditHoras(h.reg)} />
                    <IconButton icon={Trash2} label="Eliminar" className="danger" onClick={() => borrarHoras(h.reg)} />
                  </span>
                ) : <span />}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {editando && (
        <FormModal
          title={`Editar ${sis.nombre}`}
          initial={sis}
          fields={camposSistema({ usuarios, empresas: data.empresas, empresaFija: true })}
          onClose={() => setEditando(false)}
          onSubmit={(d) => {
            const r = editarSistema(sis, d, user);
            if (!r.ok) return toast(r.error, 'critical');
            toast('Sistema actualizado');
            return setEditando(false);
          }}
        />
      )}
      {editHoras && (
        <FormModal
          title="Corregir registro de horas"
          initial={editHoras}
          fields={[
            { key: 'etapa', label: 'Etapa', type: 'select', required: true, options: ETAPAS.map((e) => ({ value: e.key, label: e.label })) },
            { key: 'fecha', label: 'Fecha', type: 'date', required: true },
            { key: 'horas', label: 'Horas', type: 'number', min: 0.25, step: 0.25, required: true },
            { key: 'descripcion', label: 'Actividad realizada', type: 'textarea', required: true, span: 3 },
          ]}
          onClose={() => setEditHoras(null)}
          onSubmit={(d) => {
            const r = corregirHoras(editHoras, d);
            if (!r.ok) return toast(r.error, 'critical');
            toast('Registro corregido');
            return setEditHoras(null);
          }}
        />
      )}
    </div>
  );
}

/** Campos del formulario de sistema (crear / editar). */
export function camposSistema({ usuarios, empresas, empresaFija }) {
  return [
    { key: 'nombre', label: 'Nombre del sistema', required: true, span: 2 },
    { key: 'empresa_id', label: 'Empresa', type: 'select', required: true, readOnly: empresaFija, options: empresas.map((e) => ({ value: e.id, label: e.alias || e.nombre })) },
    { key: 'descripcion', label: 'Descripción', type: 'textarea', span: 3 },
    { key: 'desarrollador_id', label: 'Desarrollador', type: 'select', required: true, options: usuarios },
    { key: 'coordinador_id', label: 'Coordinador', type: 'select', required: true, options: usuarios },
    { key: 'qa_id', label: 'Responsable de QA', type: 'select', required: true, options: usuarios },
    { key: 'fecha_inicio', label: 'Fecha de inicio', type: 'date', required: true },
    { key: 'fecha_entrega', label: 'Entrega estimada', type: 'date', required: true },
    { key: 'prioridad', label: 'Prioridad', type: 'select', required: true, options: PRIORIDADES },
    { key: 'observaciones', label: 'Observaciones', type: 'textarea', span: 3 },
  ];
}
