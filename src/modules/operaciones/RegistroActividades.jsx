import { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Trash2, Clock } from 'lucide-react';
import { Button, Card, Empty, FormModal, IconButton, fmtDate, useUi } from '../../components/ui';
import { useAuth } from '../../auth/AuthContext';
import { ETAPAS, ESTADOS, corregirHoras, eliminarHoras, fmtHoras, permisos, registrarHoras, today, totalesHoras, usuariosDeEmpresa } from './logic';
import { EtapaTag, empresaAlias } from './shared';

/** Registro de actividades: dónde cada persona registra su trabajo (siempre en un sistema y una etapa). */
export default function RegistroActividades({ data, sistemaInicial = '', onVerSistema }) {
  const auth = useAuth();
  const { user } = auth;
  const { toast, confirm } = useUi();
  const p = permisos(auth);
  const { sistemas, horas, empresas } = data;

  // ---- formulario de registro ----
  const elegibles = useMemo(() => sistemas.filter((s) => s.estado === 'ACTIVO' || (p.isAdmin && s.estado === 'PAUSADO')), [sistemas, p.isAdmin]);
  const propios = (s) => s.desarrollador_id === user.id;
  const [f, setF] = useState({ sistema_id: sistemaInicial, etapa: '', fecha: today(), horas: '', descripcion: '', usuario_id: user.id });
  const [error, setError] = useState('');
  useEffect(() => {
    if (sistemaInicial) setF((x) => ({ ...x, sistema_id: sistemaInicial }));
  }, [sistemaInicial]);
  const set = (k, v) => {
    setF((x) => ({ ...x, [k]: v }));
    setError('');
  };
  const sisSel = sistemas.find((s) => s.id === f.sistema_id);
  const usuariosOpc = sisSel ? usuariosDeEmpresa(sisSel.empresa_id) : [];

  const guardar = (e) => {
    e.preventDefault();
    const r = registrarHoras(f, user, { isAdmin: p.isAdmin });
    if (!r.ok) return setError(r.error);
    toast(`${fmtHoras(f.horas)} registradas en ${sisSel.nombre} · ${ETAPAS.find((x) => x.key === f.etapa).label}`);
    // Se conservan sistema, etapa y fecha para registrar varias actividades seguidas.
    setF((x) => ({ ...x, horas: '', descripcion: '' }));
    return undefined;
  };

  // ---- historial ----
  const [fil, setFil] = useState({ sistema: '', usuario: '', etapa: '' });
  const [limite, setLimite] = useState(100);
  const filtradas = useMemo(
    () =>
      horas
        .filter((h) => (!fil.sistema || h.sistema_id === fil.sistema) && (!fil.usuario || h.usuario_id === fil.usuario) && (!fil.etapa || h.etapa === fil.etapa))
        .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || String(b.creado).localeCompare(String(a.creado))),
    [horas, fil],
  );
  const tot = useMemo(() => totalesHoras(filtradas), [filtradas]);
  const usuariosHist = useMemo(() => {
    const m = new Map();
    horas.forEach((h) => m.set(h.usuario_id || h.usuario, h.usuario));
    return [...m.entries()];
  }, [horas]);
  const sisNombre = (id) => sistemas.find((s) => s.id === id);
  const [editando, setEditando] = useState(null);

  const borrar = async (h) => {
    if (await confirm(`Se eliminará el registro de ${fmtHoras(h.horas)} de ${h.usuario} (${fmtDate(h.fecha)}).`, { title: 'Eliminar registro', danger: true })) {
      eliminarHoras(h);
      toast('Registro eliminado');
    }
  };

  return (
    <div className="ops-registro">
      <Card title="Registrar horas" subtitle="Elija el sistema, la etapa del trabajo y cuéntenos qué hizo.">
        {p.registra ? (
          <form className="ops-reg-form" onSubmit={guardar} noValidate>
            <div className="field">
              <label htmlFor="ops-sis">Sistema <b className="req">*</b></label>
              <select id="ops-sis" value={f.sistema_id} onChange={(e) => set('sistema_id', e.target.value)}>
                <option value="">Seleccione el sistema…</option>
                {[...elegibles].sort((a, b) => Number(propios(b)) - Number(propios(a)) || a.nombre.localeCompare(b.nombre)).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre} · {empresaAlias(empresas, s.empresa_id)}{s.estado !== 'ACTIVO' ? ` (${ESTADOS[s.estado].label})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="ops-fecha">Fecha <b className="req">*</b></label>
              <input id="ops-fecha" type="date" value={f.fecha} onChange={(e) => set('fecha', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="ops-horas">Horas <b className="req">*</b></label>
              <input id="ops-horas" type="number" min="0.25" max="24" step="0.25" inputMode="decimal" value={f.horas} onChange={(e) => set('horas', e.target.value)} />
            </div>
            <div className="wide">
              <label style={{ fontSize: 12.5, fontWeight: 600 }}>¿En qué etapa trabajó? <b className="req">*</b></label>
              <div className="ops-etapa-pick" role="radiogroup" aria-label="Etapa del trabajo" style={{ marginTop: 6 }}>
                {ETAPAS.map((e) => (
                  <button key={e.key} type="button" role="radio" aria-checked={f.etapa === e.key} className={`ops-pick ${f.etapa === e.key ? 'on' : ''}`} style={{ '--c': e.color }} onClick={() => set('etapa', e.key)}>
                    <small>{e.n}</small>
                    <strong>{e.label}</strong>
                  </button>
                ))}
              </div>
              {sisSel && f.etapa && sisSel.etapa !== f.etapa && (
                <p className="ops-nota">El sistema está hoy en <b>{ETAPAS.find((x) => x.key === sisSel.etapa).label}</b>. Puede registrar en cualquier etapa: la etapa del sistema no cambia.</p>
              )}
            </div>
            <div className="field wide">
              <label htmlFor="ops-desc">Actividad realizada <b className="req">*</b></label>
              <input id="ops-desc" value={f.descripcion} onChange={(e) => set('descripcion', e.target.value)} placeholder="Ej. Ajuste del formulario de pagos y pruebas" maxLength={400} />
            </div>
            <div className="foot">
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                {p.gestiona ? (
                  <div className="field" style={{ margin: 0 }}>
                    <select aria-label="Usuario que registra" value={f.usuario_id} onChange={(e) => set('usuario_id', e.target.value)}>
                      {(usuariosOpc.length ? usuariosOpc : [user]).map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                    </select>
                  </div>
                ) : (
                  <span className="muted small">Registra: <b>{user.nombre}</b></span>
                )}
                {sisSel && sisSel.estado !== 'ACTIVO' && <span className="ops-error">Sistema {ESTADOS[sisSel.estado].label.toLowerCase()}: registro autorizado por el administrador.</span>}
                {error && <span className="ops-error" role="alert">{error}</span>}
              </div>
              <Button type="submit" icon={Plus} className="btn-ops-green">Guardar horas</Button>
            </div>
          </form>
        ) : (
          <p className="muted">Su perfil es de consulta: puede ver el historial pero no registrar horas.</p>
        )}
      </Card>

      <div className="ops-sumas">
        <div className="ops-suma"><small>Total {fil.sistema || fil.usuario || fil.etapa ? 'filtrado' : ''}</small><b>{fmtHoras(tot.total)}</b></div>
        {ETAPAS.map((e) => (
          <div className="ops-suma" key={e.key} style={{ '--c': e.color }}>
            <small>{e.label}</small>
            <b>{fmtHoras(tot.porEtapa[e.key])}</b>
          </div>
        ))}
      </div>

      <Card
        title="Historial de horas"
        className="flush"
        actions={
          <div className="ops-filtros">
            <select aria-label="Sistema" value={fil.sistema} onChange={(e) => setFil({ ...fil, sistema: e.target.value })}>
              <option value="">Todos los sistemas</option>
              {[...sistemas].sort((a, b) => a.nombre.localeCompare(b.nombre)).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
            <select aria-label="Usuario" value={fil.usuario} onChange={(e) => setFil({ ...fil, usuario: e.target.value })}>
              <option value="">Todos los usuarios</option>
              {usuariosHist.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
            </select>
            <select aria-label="Etapa" value={fil.etapa} onChange={(e) => setFil({ ...fil, etapa: e.target.value })}>
              <option value="">Todas las etapas</option>
              {ETAPAS.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
            </select>
          </div>
        }
      >
        {filtradas.length === 0 ? (
          <Empty icon={Clock} title="Sin registros">Todavía no hay horas con estos filtros.</Empty>
        ) : (
          <div className="ops-scroll">
            <table className="ops-tabla">
              <thead>
                <tr><th>Fecha</th><th>Sistema</th><th>Etapa</th><th>Usuario</th><th className="num">Horas</th><th>Actividad</th>{p.gestiona && <th />}</tr>
              </thead>
              <tbody>
                {filtradas.slice(0, limite).map((h) => {
                  const s = sisNombre(h.sistema_id);
                  return (
                    <tr key={h.id}>
                      <td>{fmtDate(h.fecha)}</td>
                      <td>{s ? <button className="crumb-link" onClick={() => onVerSistema(s.id)}>{s.nombre}</button> : '—'}</td>
                      <td><EtapaTag etapa={h.etapa} /></td>
                      <td>{h.usuario}</td>
                      <td className="num">{h.horas}</td>
                      <td>{h.descripcion}</td>
                      {p.gestiona && (
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <IconButton icon={Pencil} label="Corregir" onClick={() => setEditando(h)} />
                          <IconButton icon={Trash2} label="Eliminar" className="danger" onClick={() => borrar(h)} />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtradas.length > limite && (
              <div style={{ padding: 12, textAlign: 'center' }}>
                <Button variant="ghost" onClick={() => setLimite((l) => l + 100)}>Ver más ({filtradas.length - limite})</Button>
              </div>
            )}
          </div>
        )}
      </Card>

      {editando && (
        <FormModal
          title="Corregir registro de horas"
          initial={editando}
          fields={[
            { key: 'etapa', label: 'Etapa', type: 'select', required: true, options: ETAPAS.map((e) => ({ value: e.key, label: e.label })) },
            { key: 'fecha', label: 'Fecha', type: 'date', required: true },
            { key: 'horas', label: 'Horas', type: 'number', min: 0.25, step: 0.25, required: true },
            { key: 'descripcion', label: 'Actividad realizada', type: 'textarea', required: true, span: 3 },
          ]}
          onClose={() => setEditando(null)}
          onSubmit={(d) => {
            const r = corregirHoras(editando, d);
            if (!r.ok) return toast(r.error, 'critical');
            toast('Registro corregido');
            return setEditando(null);
          }}
        />
      )}
    </div>
  );
}
