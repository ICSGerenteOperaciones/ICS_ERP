import { useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useDb } from '../../data/db';
import { Button, Modal } from '../../components/ui';
import { DECISIONES, ESTADOS, ETAPAS, REVISION_TIPO, etapaInfo, fmtHoras, totalesHoras, userName } from './logic';

/**
 * Datos del módulo. `sel`: '' = empresa activa · 'ALL' = todas las empresas del usuario · id de empresa.
 * La base ya limita lo que cada usuario puede leer (RLS); aquí solo se acota la vista.
 */
export function useOpsData(sel = '') {
  const { empresa, empresas } = useAuth();
  const sistemasAll = useDb((d) => d.listAll('ops_sistemas'));
  const horasAll = useDb((d) => d.listAll('ops_horas'));
  const revisionesAll = useDb((d) => d.listAll('ops_revisiones'));
  const eventosAll = useDb((d) => d.listAll('workflow_historial'));
  const usuarios = useDb((d) => d.listAll('usuarios'));

  return useMemo(() => {
    const ids = new Set(sel === 'ALL' ? empresas.map((e) => e.id) : [sel || empresa?.id]);
    const sistemas = sistemasAll.filter((s) => ids.has(s.empresa_id));
    const sids = new Set(sistemas.map((s) => s.id));
    const horas = horasAll.filter((h) => sids.has(h.sistema_id));
    const revisiones = revisionesAll.filter((r) => sids.has(r.sistema_id));
    const stats = new Map(sistemas.map((s) => [s.id, totalesHoras(horas.filter((h) => h.sistema_id === s.id))]));
    return { sistemas, horas, revisiones, stats, eventos: eventosAll, usuarios, empresas };
  }, [sel, empresa, empresas, sistemasAll, horasAll, revisionesAll, eventosAll, usuarios]);
}

export const empresaAlias = (empresas, id) => {
  const e = empresas.find((x) => x.id === id);
  return e ? e.alias || e.nombre : '—';
};

export function EstadoBadge({ estado }) {
  const e = ESTADOS[estado] || { label: estado, tone: 'neutral' };
  return (
    <span className={`badge tone-${e.tone}`}>
      <i className="dot" aria-hidden />
      {e.label}
    </span>
  );
}

export function EtapaTag({ etapa }) {
  const e = etapaInfo(etapa);
  return (
    <span className="ops-tag-etapa" style={{ '--c': e.color }}>
      {e.label}
    </span>
  );
}

/** Barra apilada con las horas de cada etapa. */
export function HorasBar({ porEtapa, total, leyenda = true }) {
  return (
    <>
      <div className="ops-bar" role="img" aria-label={`Horas por etapa: ${ETAPAS.map((e) => `${e.label} ${porEtapa[e.key]}`).join(', ')}`}>
        {total > 0 && ETAPAS.map((e) => porEtapa[e.key] > 0 && <i key={e.key} style={{ flex: porEtapa[e.key], background: e.color }} />)}
      </div>
      {leyenda && (
        <div className="ops-leyenda">
          {ETAPAS.map((e) => (
            <span key={e.key} style={{ '--c': e.color }}>
              <em>{e.label}</em>
              <b>{fmtHoras(porEtapa[e.key])}</b>
            </span>
          ))}
        </div>
      )}
    </>
  );
}

// ---------------- Diálogos ----------------
/** Enviar a QA o al líder: destinatario fijo (viene del sistema) y comentario opcional. */
export function EnviarRevisionDialog({ sis, tipo, done }) {
  const [comentario, setComentario] = useState('');
  const destinatario = userName(tipo === 'QA' ? sis.qa_id : sis.coordinador_id);
  return (
    <Modal
      title={tipo === 'QA' ? 'Enviar a QA' : 'Enviar al líder'}
      size="sm"
      onClose={() => done(null)}
      footer={
        <>
          <Button variant="ghost" onClick={() => done(null)}>Cancelar</Button>
          <Button className="btn-ops-green" onClick={() => done({ comentario })}>Enviar</Button>
        </>
      }
    >
      <p>
        <b>{sis.nombre}</b> se enviará a <b>{destinatario}</b> ({tipo === 'QA' ? 'responsable de QA' : 'coordinador'}), quien recibirá el aviso.
      </p>
      <div className="field" style={{ marginTop: 12 }}>
        <label htmlFor="ops-com">Comentario u observación (opcional)</label>
        <textarea id="ops-com" rows={3} value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="¿Qué debe revisar?" />
      </div>
    </Modal>
  );
}

/** Resolver una revisión: aprobar / rechazar (QA) · aprobar / devolver / mantener (líder). */
export function ResolverDialog({ rev, sis, done }) {
  const opciones = DECISIONES[rev.tipo];
  const [key, setKey] = useState(opciones[0].key);
  const [motivo, setMotivo] = useState('');
  const [devolver, setDevolver] = useState(true);
  const d = opciones.find((o) => o.key === key);
  const pideMotivo = !!d.motivo;
  return (
    <Modal
      title={`Revisión de ${REVISION_TIPO[rev.tipo]} · ${sis.nombre}`}
      size="sm"
      onClose={() => done(null)}
      footer={
        <>
          <Button variant="ghost" onClick={() => done(null)}>Cancelar</Button>
          <Button
            variant={d.tone === 'critical' ? 'danger' : 'primary'}
            disabled={pideMotivo && !motivo.trim()}
            onClick={() => done({ decision: key, motivo, devolverADesarrollo: rev.tipo === 'QA' && key === 'RECHAZAR' && devolver })}
          >
            {d.label}
          </Button>
        </>
      }
    >
      <p className="muted small">
        Enviado por {rev.enviado_por_nombre}{rev.comentario ? ` · “${rev.comentario}”` : ''}
      </p>
      <div className="seg" role="group" aria-label="Decisión" style={{ margin: '10px 0' }}>
        {opciones.map((o) => (
          <button key={o.key} type="button" className={key === o.key ? 'active' : ''} onClick={() => setKey(o.key)}>
            {o.label}
          </button>
        ))}
      </div>
      <div className="field">
        <label htmlFor="ops-motivo">
          {pideMotivo ? 'Motivo' : 'Observación (opcional)'}
          {pideMotivo && <b className="req"> *</b>}
        </label>
        <textarea id="ops-motivo" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </div>
      {rev.tipo === 'QA' && key === 'RECHAZAR' && (
        <label className="ops-toggle" style={{ marginTop: 10 }}>
          <input type="checkbox" checked={devolver} onChange={(e) => setDevolver(e.target.checked)} />
          Devolver el sistema a Desarrollo
        </label>
      )}
    </Modal>
  );
}
