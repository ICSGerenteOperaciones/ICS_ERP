// Reglas del módulo OPERACIONES (sin interfaz). Todo gira alrededor del sistema:
//   · 4 etapas fijas, que cambian SOLO por decisión manual (nunca al registrar horas).
//   · Las horas siempre pertenecen a un sistema y a una de las 4 etapas.
//   · Enviar a QA / al líder son acciones de revisión: no crean etapas.
// Cada acción deja rastro en la auditoría (db) y en la bitácora (workflow_historial).
import { db } from '../../data/db';

export const MODULO = 'operaciones';

export const ETAPAS = [
  { key: 'ANALISIS', n: '01', label: 'Análisis', desc: 'Definición de necesidades, requerimientos y solución.', color: 'var(--ops-azul-claro)' },
  { key: 'DESARROLLO', n: '02', label: 'Desarrollo', desc: 'Construcción, configuración y ajustes.', color: 'var(--ops-azul)' },
  { key: 'QA', n: '03', label: 'QA', desc: 'Pruebas, validación y correcciones.', color: 'var(--ops-verde-claro)' },
  { key: 'DESPLEGADO', n: '04', label: 'Desplegado', desc: 'Implementación y entrega del sistema.', color: 'var(--ops-verde)' },
];
export const ETAPA_KEYS = ETAPAS.map((e) => e.key);
export const etapaInfo = (k) => ETAPAS.find((e) => e.key === k) || { key: k, label: k || '—', n: '', desc: '', color: 'var(--muted)' };

export const ESTADOS = {
  ACTIVO: { label: 'Activo', tone: 'good' },
  PAUSADO: { label: 'Pausado', tone: 'warning' },
  CERRADO: { label: 'Cerrado', tone: 'muted' },
};
export const PRIORIDADES = ['Alta', 'Media', 'Baja'];
export const PRIORIDAD_TONE = { Alta: 'critical', Media: 'info', Baja: 'neutral' };

export const REVISION_TIPO = { QA: 'QA', LIDER: 'líder' };
export const REVISION_ESTADO = {
  PENDIENTE: { label: 'Pendiente', tone: 'info' },
  EN_REVISION: { label: 'En revisión', tone: 'accent' },
  APROBADA: { label: 'Aprobada', tone: 'good' },
  RECHAZADA: { label: 'Rechazada', tone: 'critical' },
  DEVUELTA: { label: 'Devuelta para ajustes', tone: 'warning' },
};
export const isAbierta = (r) => r.estado === 'PENDIENTE' || r.estado === 'EN_REVISION';

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const nowIso = () => new Date().toISOString();

// ---------------- Consultas ----------------
export const userName = (id) => (id ? db.listAll('usuarios').find((u) => u.id === id)?.nombre : '') || '—';

/** Usuarios activos con acceso a una empresa (el administrador accede a todas). */
export const usuariosDeEmpresa = (empresaId) =>
  db.listAll('usuarios').filter((u) => u.activo && (u.rol_id === 'rol-admin' || !empresaId || (u.empresas_ids || []).includes(empresaId)));

/** Horas por etapa y total de un conjunto de registros. */
export function totalesHoras(horas) {
  const porEtapa = Object.fromEntries(ETAPA_KEYS.map((k) => [k, 0]));
  let total = 0;
  horas.forEach((h) => {
    const v = Number(h.horas) || 0;
    if (h.etapa in porEtapa) porEtapa[h.etapa] += v;
    total += v;
  });
  return { porEtapa, total };
}
export const horasDe = (sistemaId) => db.listAll('ops_horas').filter((h) => h.sistema_id === sistemaId);
export const revisionesDe = (sistemaId) => db.listAll('ops_revisiones').filter((r) => r.sistema_id === sistemaId);
export const revisionAbierta = (sistemaId, tipo) => revisionesDe(sistemaId).find((r) => r.tipo === tipo && isAbierta(r));

export const fmtHoras = (n) => `${Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 2 })} h`;

// ---------------- Permisos ----------------
// ver = consultar · crear = registrar horas y enviar a revisión · editar = gestionar sistemas · aprobar = revisar
export function permisos(auth) {
  const { can, isAdmin, user } = auth;
  const gestiona = can(MODULO, 'editar');
  return {
    ver: can(MODULO, 'ver'),
    gestiona,
    registra: gestiona || can(MODULO, 'crear'),
    envia: gestiona || can(MODULO, 'crear'),
    isAdmin,
    /** ¿Puede resolver esta revisión? Solo el destinatario (o el administrador). */
    resuelve: (rev) => isAdmin || (can(MODULO, 'aprobar') && !!rev && rev.destinatario_id === user?.id),
  };
}

// ---------------- Trazabilidad ----------------
function bitacora(sis, actor, accion, desde, hacia, comentario = '') {
  db.insert('workflow_historial', {
    modulo: MODULO, registro_id: sis.id, registro_codigo: sis.codigo, empresa_id: sis.empresa_id,
    desde: desde || '', hacia: hacia || '', accion, usuario_id: actor.id, usuario: actor.nombre,
    comentario: comentario || '', fecha: nowIso(),
  });
}
const fail = (error) => ({ ok: false, error });
const ok = (extra) => ({ ok: true, ...extra });

// ---------------- Sistemas ----------------
export function validarSistema(d) {
  const e = {};
  ['nombre', 'empresa_id', 'desarrollador_id', 'coordinador_id', 'qa_id', 'fecha_inicio', 'fecha_entrega', 'prioridad'].forEach((k) => {
    if (!String(d[k] ?? '').trim()) e[k] = 'Campo obligatorio';
  });
  if (d.fecha_inicio && d.fecha_entrega && d.fecha_entrega < d.fecha_inicio) e.fecha_entrega = 'No puede ser anterior al inicio';
  return e;
}

export function crearSistema(data, actor) {
  const errs = validarSistema(data);
  if (Object.keys(errs).length) return fail(Object.values(errs)[0]);
  const s = db.insert('ops_sistemas', {
    nombre: data.nombre.trim(), descripcion: data.descripcion || '', empresa_id: data.empresa_id,
    desarrollador_id: data.desarrollador_id, coordinador_id: data.coordinador_id, qa_id: data.qa_id,
    fecha_inicio: data.fecha_inicio, fecha_entrega: data.fecha_entrega, prioridad: data.prioridad,
    observaciones: data.observaciones || '', etapa: 'ANALISIS', estado: 'ACTIVO',
  });
  bitacora(s, actor, 'Sistema creado', '', 'ANALISIS');
  return ok({ sistema: s });
}

export function editarSistema(sis, data, actor) {
  const errs = validarSistema({ ...sis, ...data });
  if (Object.keys(errs).length) return fail(Object.values(errs)[0]);
  // La empresa, la etapa y el estado NO se editan aquí (cada uno tiene su propia acción).
  const patch = Object.fromEntries(
    ['nombre', 'descripcion', 'desarrollador_id', 'coordinador_id', 'qa_id', 'fecha_inicio', 'fecha_entrega', 'prioridad', 'observaciones'].filter((k) => k in data).map((k) => [k, data[k]]),
  );
  db.update('ops_sistemas', sis.id, patch);
  return ok();
}

/** Cambio MANUAL de etapa (administrador o coordinador autorizado). Es independiente de las horas. */
export function cambiarEtapa(sis, etapa, actor, comentario = '') {
  if (!ETAPA_KEYS.includes(etapa)) return fail('Etapa no válida.');
  if (sis.etapa === etapa) return fail('El sistema ya está en esa etapa.');
  if (sis.estado === 'CERRADO') return fail('El sistema está cerrado: actívelo para mover su etapa.');
  db.update('ops_sistemas', sis.id, { etapa });
  bitacora(sis, actor, 'Cambio de etapa', sis.etapa, etapa, comentario);
  return ok();
}

// Acciones de estado: Pausar · Reactivar · Activar (desde Cerrado) · Cerrar
export const ACCIONES_ESTADO = [
  { key: 'pausar', label: 'Pausar', desde: ['ACTIVO'], hacia: 'PAUSADO', motivo: true, tone: 'warning' },
  { key: 'reactivar', label: 'Reactivar', desde: ['PAUSADO'], hacia: 'ACTIVO', tone: 'good' },
  { key: 'activar', label: 'Activar', desde: ['CERRADO'], hacia: 'ACTIVO', tone: 'good' },
  { key: 'cerrar', label: 'Cerrar', desde: ['ACTIVO', 'PAUSADO'], hacia: 'CERRADO', motivo: true, tone: 'critical' },
];
export const accionesDisponibles = (sis) => ACCIONES_ESTADO.filter((a) => a.desde.includes(sis.estado));

export function cambiarEstado(sis, accionKey, actor, motivo = '') {
  const a = ACCIONES_ESTADO.find((x) => x.key === accionKey);
  if (!a || !a.desde.includes(sis.estado)) return fail('Esta acción no está disponible para el estado actual.');
  if (a.motivo && !motivo.trim()) return fail('Indique el motivo.');
  db.update('ops_sistemas', sis.id, { estado: a.hacia });
  bitacora(sis, actor, a.label, sis.estado, a.hacia, motivo);
  return ok();
}

// ---------------- Horas ----------------
export function validarHoras(d) {
  const e = {};
  if (!d.sistema_id) e.sistema_id = 'Seleccione el sistema';
  if (!ETAPA_KEYS.includes(d.etapa)) e.etapa = 'Seleccione la etapa';
  if (!d.fecha) e.fecha = 'Indique la fecha';
  const h = Number(d.horas);
  if (!(h > 0)) e.horas = 'Las horas deben ser mayores a 0';
  else if (h > 24) e.horas = 'Máximo 24 horas por registro';
  if (!String(d.descripcion || '').trim()) e.descripcion = 'Describa la actividad realizada';
  if (!d.usuario_id) e.usuario_id = 'Falta el usuario';
  return e;
}

/** Registra horas. NO modifica la etapa del sistema. Un sistema pausado/cerrado solo admite horas del administrador. */
export function registrarHoras(data, actor, { isAdmin = false } = {}) {
  const errs = validarHoras(data);
  if (Object.keys(errs).length) return fail(Object.values(errs)[0]);
  const sis = db.listAll('ops_sistemas').find((s) => s.id === data.sistema_id);
  if (!sis) return fail('El sistema no existe.');
  if (sis.estado !== 'ACTIVO' && !isAdmin) {
    return fail(`El sistema está ${ESTADOS[sis.estado].label.toLowerCase()}: no admite nuevos registros de horas (solo con autorización del administrador).`);
  }
  const quien = db.listAll('usuarios').find((u) => u.id === data.usuario_id);
  const row = db.insert('ops_horas', {
    empresa_id: sis.empresa_id, sistema_id: sis.id, etapa: data.etapa, usuario_id: data.usuario_id, usuario: quien?.nombre || actor.nombre,
    fecha: data.fecha, horas: Number(data.horas), descripcion: data.descripcion.trim(),
  });
  return ok({ registro: row });
}

export function corregirHoras(reg, data) {
  const errs = validarHoras({ ...reg, ...data });
  if (Object.keys(errs).length) return fail(Object.values(errs)[0]);
  db.update('ops_horas', reg.id, {
    etapa: data.etapa ?? reg.etapa, fecha: data.fecha ?? reg.fecha, horas: Number(data.horas ?? reg.horas),
    descripcion: String(data.descripcion ?? reg.descripcion).trim(),
  });
  return ok();
}
export const eliminarHoras = (reg) => db.remove('ops_horas', reg.id);

// ---------------- Revisiones (QA / líder) ----------------
export function enviarRevision(sis, tipo, actor, comentario = '') {
  if (!['QA', 'LIDER'].includes(tipo)) return fail('Tipo de revisión no válido.');
  if (sis.estado !== 'ACTIVO') return fail('Solo se envían a revisión sistemas activos.');
  const destinatario = tipo === 'QA' ? sis.qa_id : sis.coordinador_id;
  if (!destinatario) return fail(tipo === 'QA' ? 'El sistema no tiene responsable de QA asignado.' : 'El sistema no tiene coordinador asignado.');
  if (revisionAbierta(sis.id, tipo)) return fail(`Ya hay un envío a ${REVISION_TIPO[tipo]} en curso para este sistema.`);
  const rev = db.insert('ops_revisiones', {
    empresa_id: sis.empresa_id, sistema_id: sis.id, tipo, enviado_por: actor.id, enviado_por_nombre: actor.nombre,
    fecha_envio: nowIso(), comentario: comentario.trim(), destinatario_id: destinatario, estado: 'PENDIENTE',
    resuelto_por: '', fecha_resolucion: '', motivo: '',
  });
  bitacora(sis, actor, tipo === 'QA' ? 'Enviado a QA' : 'Enviado al líder', '', 'PENDIENTE', `Para ${userName(destinatario)}${comentario.trim() ? ` · ${comentario.trim()}` : ''}`);
  return ok({ revision: rev });
}

export const DECISIONES = {
  QA: [
    { key: 'APROBAR', label: 'Aprobar', estado: 'APROBADA', tone: 'good' },
    { key: 'RECHAZAR', label: 'Rechazar', estado: 'RECHAZADA', tone: 'critical', motivo: true },
  ],
  LIDER: [
    { key: 'APROBAR', label: 'Aprobar', estado: 'APROBADA', tone: 'good' },
    { key: 'DEVOLVER', label: 'Devolver para ajustes', estado: 'DEVUELTA', tone: 'warning', motivo: true },
    { key: 'MANTENER', label: 'Mantener en revisión', estado: 'EN_REVISION', tone: 'accent' },
  ],
};

/**
 * Resuelve una revisión. `devolverADesarrollo` (solo QA al rechazar) mueve el sistema a Desarrollo.
 * Aprobar NO cambia la etapa: la decide el administrador/coordinador.
 */
export function resolverRevision(rev, decisionKey, actor, { motivo = '', devolverADesarrollo = false, puede } = {}) {
  const d = DECISIONES[rev.tipo]?.find((x) => x.key === decisionKey);
  if (!d) return fail('Decisión no válida.');
  if (!isAbierta(rev)) return fail('La revisión ya fue resuelta.');
  if (puede && !puede(rev)) return fail('Solo el responsable de la revisión puede resolverla.');
  if (d.motivo && !motivo.trim()) return fail('Indique el motivo.');
  const sis = db.listAll('ops_sistemas').find((s) => s.id === rev.sistema_id);
  if (!sis) return fail('El sistema no existe.');
  const final = d.estado !== 'EN_REVISION';
  db.update('ops_revisiones', rev.id, {
    estado: d.estado, motivo: motivo.trim(),
    resuelto_por: final ? actor.nombre : '', fecha_resolucion: final ? nowIso() : '',
  });
  const quien = rev.tipo === 'QA' ? 'QA' : 'Líder';
  bitacora(sis, actor, `${quien}: ${d.label.toLowerCase()}`, rev.estado, d.estado, motivo);
  let devuelto = false;
  if (rev.tipo === 'QA' && d.key === 'RECHAZAR' && devolverADesarrollo && sis.etapa !== 'DESARROLLO' && sis.estado !== 'CERRADO') {
    db.update('ops_sistemas', sis.id, { etapa: 'DESARROLLO' });
    bitacora(sis, actor, 'Devuelto a Desarrollo', sis.etapa, 'DESARROLLO', `Rechazo de QA: ${motivo.trim()}`);
    devuelto = true;
  }
  return ok({ devuelto });
}

/** Revisiones abiertas que le corresponde resolver a un usuario. */
export const pendientesDe = (userId) =>
  db.listAll('ops_revisiones').filter((r) => isAbierta(r) && r.destinatario_id === userId);

/** «Análisis → Desarrollo» / «Activo → Pausado» para un cambio registrado en la bitácora. */
export function cambioTexto(desde, hacia) {
  if (ETAPA_KEYS.includes(desde) && ETAPA_KEYS.includes(hacia)) return ` · ${etapaInfo(desde).label} → ${etapaInfo(hacia).label}`;
  if (ESTADOS[desde] && ESTADOS[hacia]) return ` · ${ESTADOS[desde].label} → ${ESTADOS[hacia].label}`;
  return '';
}

/** Línea de tiempo de un sistema: horas + acciones registradas, de la más reciente a la más antigua. */
export function historialDe(sistemaId) {
  const horas = horasDe(sistemaId).map((h) => ({
    kind: 'horas', id: h.id, fecha: h.fecha, orden: h.creado || h.fecha, usuario: h.usuario, usuario_id: h.usuario_id, etapa: h.etapa, horas: h.horas, texto: h.descripcion, reg: h,
  }));
  const eventos = db.listAll('workflow_historial')
    .filter((w) => w.modulo === MODULO && w.registro_id === sistemaId)
    .map((w) => ({ kind: 'evento', id: w.id, fecha: String(w.fecha).slice(0, 10), orden: w.fecha, usuario: w.usuario, usuario_id: w.usuario_id, texto: w.accion, desde: w.desde, hacia: w.hacia, comentario: w.comentario }));
  return [...horas, ...eventos].sort((a, b) => String(b.orden).localeCompare(String(a.orden)));
}
