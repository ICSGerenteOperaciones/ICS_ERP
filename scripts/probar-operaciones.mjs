// Pruebas del módulo Operaciones: reglas de negocio sobre el repositorio real (modo demostración).
// Uso:  npm run probar:operaciones
process.env.VITE_BACKEND = 'local';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error', define: { 'import.meta.env.VITE_BACKEND': '"local"' } });
let fallos = 0;
let total = 0;
const prueba = (nombre, cond, detalle = '') => {
  total++;
  if (cond) console.log(`  ✔ ${nombre}`);
  else {
    fallos++;
    console.log(`  ✘ ${nombre} ${detalle}`);
  }
};

try {
  const { db } = await server.ssrLoadModule('/src/data/db.js');
  const L = await server.ssrLoadModule('/src/modules/operaciones/logic.js');
  const U = (id) => db.listAll('usuarios').find((u) => u.id === id);
  const admin = U('usr-admin');
  const dev = U('usr-ops-dev');
  const dev2 = U('usr-ops-dev2');
  const qa = U('usr-ops-qa');
  const lider = U('usr-ops-lider');
  db.setEmpresa('emp-ics', { silent: true });
  db.setActor(admin);

  console.log('\nPerfiles y permisos');
  const can = (u) => (m, a = 'ver') => u.rol_id === 'rol-admin' || !!db.get('roles', u.rol_id)?.permisos?.[m]?.[a];
  const P = (u) => L.permisos({ can: can(u), isAdmin: u.rol_id === 'rol-admin', user: u });
  prueba('Consulta solo ve', P(U('usr-ops-cons')).ver && !P(U('usr-ops-cons')).registra && !P(U('usr-ops-cons')).gestiona);
  prueba('Desarrollador registra y envía, no gestiona', P(dev).registra && P(dev).envia && !P(dev).gestiona);
  prueba('QA no registra ni gestiona', !P(qa).registra && !P(qa).gestiona);
  prueba('Líder revisa pero no gestiona por defecto', !P(lider).gestiona && can(lider)('operaciones', 'aprobar'));
  prueba('Administrador controla todo', P(admin).gestiona && P(admin).registra && P(admin).isAdmin);

  console.log('\nCreación de sistemas y asignación de responsables');
  const base = { nombre: 'Sistema de pruebas', descripcion: 'Prueba', empresa_id: 'emp-ics', desarrollador_id: dev.id, coordinador_id: lider.id, qa_id: qa.id, fecha_inicio: '2026-11-01', fecha_entrega: '2026-12-15', prioridad: 'Alta', observaciones: 'obs' };
  const sinNombre = L.crearSistema({ ...base, nombre: '' }, admin);
  prueba('Rechaza un sistema sin nombre', !sinNombre.ok);
  prueba('Rechaza sistema sin QA', !L.crearSistema({ ...base, qa_id: '' }, admin).ok);
  prueba('Rechaza entrega anterior al inicio', !L.crearSistema({ ...base, fecha_entrega: '2026-10-01' }, admin).ok);
  const r = L.crearSistema(base, admin);
  prueba('Crea el sistema', r.ok && /^SIS-\d+$/.test(r.sistema.codigo));
  const sis = () => db.get('ops_sistemas', r.sistema.id);
  prueba('Nace Activo y en Análisis', sis().estado === 'ACTIVO' && sis().etapa === 'ANALISIS');
  prueba('Asigna desarrollador, coordinador y QA', sis().desarrollador_id === dev.id && sis().coordinador_id === lider.id && sis().qa_id === qa.id);
  L.editarSistema(sis(), { desarrollador_id: dev2.id, etapa: 'QA', estado: 'CERRADO' }, admin);
  prueba('Reasigna responsable', sis().desarrollador_id === dev2.id);
  prueba('Editar no altera etapa ni estado', sis().etapa === 'ANALISIS' && sis().estado === 'ACTIVO');
  L.editarSistema(sis(), { desarrollador_id: dev.id }, admin);

  console.log('\nRegistro de horas en las cuatro etapas');
  const h = (o) => ({ sistema_id: sis().id, etapa: 'ANALISIS', usuario_id: dev.id, fecha: '2026-11-02', horas: 2, descripcion: 'Trabajo', ...o });
  prueba('No permite horas sin sistema', !L.registrarHoras(h({ sistema_id: '' }), dev).ok);
  prueba('No permite horas sin etapa', !L.registrarHoras(h({ etapa: '' }), dev).ok);
  prueba('No permite una quinta etapa', !L.registrarHoras(h({ etapa: 'PRODUCCION' }), dev).ok);
  prueba('No permite horas en cero o negativas', !L.registrarHoras(h({ horas: 0 }), dev).ok && !L.registrarHoras(h({ horas: -3 }), dev).ok);
  prueba('No permite más de 24 horas', !L.registrarHoras(h({ horas: 25 }), dev).ok);
  prueba('Exige descripción', !L.registrarHoras(h({ descripcion: '  ' }), dev).ok);
  prueba('Exige fecha', !L.registrarHoras(h({ fecha: '' }), dev).ok);
  prueba('Sin registros fantasma tras los rechazos', L.horasDe(sis().id).length === 0);
  const horasPorEtapa = { ANALISIS: 3, DESARROLLO: 10.5, QA: 4, DESPLEGADO: 1.5 };
  for (const [etapa, horas] of Object.entries(horasPorEtapa)) prueba(`Registra ${horas} h en ${etapa}`, L.registrarHoras(h({ etapa, horas }), dev).ok);
  prueba('Registrar horas NO cambia la etapa visual', sis().etapa === 'ANALISIS', `(quedó en ${sis().etapa})`);

  console.log('\nConsulta de horas por etapa y totales');
  const t = L.totalesHoras(L.horasDe(sis().id));
  prueba('Total del sistema = 19 h', t.total === 19, `(${t.total})`);
  prueba('Horas por etapa correctas', Object.entries(horasPorEtapa).every(([k, v]) => t.porEtapa[k] === v));
  L.registrarHoras(h({ etapa: 'QA', horas: 2, usuario_id: dev2.id }), admin, { isAdmin: true });
  const hist = L.historialDe(sis().id);
  prueba('Historial por usuario', hist.filter((x) => x.kind === 'horas' && x.usuario_id === dev2.id).length === 1);
  prueba('Historial por etapa', hist.filter((x) => x.kind === 'horas' && x.etapa === 'QA').length === 2);
  prueba('Recalcula el total (21 h)', L.totalesHoras(L.horasDe(sis().id)).total === 21);

  console.log('\nCorrección de horas (administrador)');
  const reg = L.horasDe(sis().id).find((x) => x.etapa === 'DESPLEGADO');
  prueba('Corrige un registro', L.corregirHoras(reg, { horas: 2, etapa: 'DESPLEGADO' }).ok && db.get('ops_horas', reg.id).horas === 2);
  prueba('La corrección también valida', !L.corregirHoras(reg, { horas: 0 }).ok);
  L.eliminarHoras(db.get('ops_horas', reg.id));
  prueba('Elimina un registro (21.5 − 2 = 19.5 h)', L.totalesHoras(L.horasDe(sis().id)).total === 19.5);

  console.log('\nCambio manual de etapa');
  prueba('Cambia de Análisis a Desarrollo', L.cambiarEtapa(sis(), 'DESARROLLO', admin).ok && sis().etapa === 'DESARROLLO');
  prueba('Puede saltar a cualquier etapa', L.cambiarEtapa(sis(), 'QA', admin).ok && sis().etapa === 'QA');
  prueba('Rechaza etapas inexistentes', !L.cambiarEtapa(sis(), 'PRODUCCION', admin).ok);
  prueba('Rechaza cambiar a la misma etapa', !L.cambiarEtapa(sis(), 'QA', admin).ok);
  prueba('Las horas no cambian al mover la etapa', L.totalesHoras(L.horasDe(sis().id)).total === 19.5);
  L.cambiarEtapa(sis(), 'DESARROLLO', admin);

  console.log('\nEnvío a QA');
  const sinQa = L.crearSistema({ ...base, nombre: 'Sin QA', qa_id: qa.id }, admin).sistema;
  db.update('ops_sistemas', sinQa.id, { qa_id: '' });
  prueba('No se envía a QA sin responsable', !L.enviarRevision(db.get('ops_sistemas', sinQa.id), 'QA', dev).ok);
  const e1 = L.enviarRevision(sis(), 'QA', dev, 'Listo para pruebas');
  prueba('Envía a QA', e1.ok && e1.revision.estado === 'PENDIENTE');
  prueba('Notifica al responsable de QA (pendiente suyo)', L.pendientesDe(qa.id).some((x) => x.id === e1.revision.id));
  prueba('Registra quién y cuándo', e1.revision.enviado_por === dev.id && !!e1.revision.fecha_envio && e1.revision.comentario === 'Listo para pruebas');
  prueba('Evita duplicar un envío abierto', !L.enviarRevision(sis(), 'QA', dev).ok);
  prueba('No crea etapas ni cambia la actual', sis().etapa === 'DESARROLLO');
  prueba('Solo el QA asignado resuelve', P(qa).resuelve(e1.revision) && !P(dev).resuelve(e1.revision) && !P(lider).resuelve(e1.revision) && P(admin).resuelve(e1.revision));

  console.log('\nRechazo y aprobación de QA');
  prueba('El rechazo exige motivo', !L.resolverRevision(e1.revision, 'RECHAZAR', qa, {}).ok);
  prueba('QA ajeno no puede resolver', !L.resolverRevision(e1.revision, 'APROBAR', dev, { puede: P(dev).resuelve }).ok);
  L.cambiarEtapa(sis(), 'QA', admin);
  const rz = L.resolverRevision(db.get('ops_revisiones', e1.revision.id), 'RECHAZAR', qa, { motivo: 'Falla el login', devolverADesarrollo: true, puede: P(qa).resuelve });
  prueba('QA rechaza con motivo', rz.ok && db.get('ops_revisiones', e1.revision.id).estado === 'RECHAZADA' && db.get('ops_revisiones', e1.revision.id).motivo === 'Falla el login');
  prueba('Rechazo devuelve el sistema a Desarrollo', rz.devuelto && sis().etapa === 'DESARROLLO');
  prueba('No se resuelve dos veces', !L.resolverRevision(db.get('ops_revisiones', e1.revision.id), 'APROBAR', qa).ok);
  const e2 = L.enviarRevision(sis(), 'QA', dev, 'Corregido');
  prueba('Puede reenviarse tras un rechazo', e2.ok);
  const ap = L.resolverRevision(e2.revision, 'APROBAR', qa, { puede: P(qa).resuelve });
  prueba('QA aprueba', ap.ok && db.get('ops_revisiones', e2.revision.id).estado === 'APROBADA');
  prueba('Aprobar NO mueve la etapa por sí solo', sis().etapa === 'DESARROLLO');

  console.log('\nEnvío directo al líder');
  const l1 = L.enviarRevision(sis(), 'LIDER', dev, 'Revisión de avance');
  prueba('Envía al líder', l1.ok && l1.revision.destinatario_id === lider.id);
  prueba('Notifica al líder', L.pendientesDe(lider.id).some((x) => x.id === l1.revision.id));
  prueba('Líder puede mantener en revisión', L.resolverRevision(l1.revision, 'MANTENER', lider, { motivo: 'Lo veo mañana', puede: P(lider).resuelve }).ok && db.get('ops_revisiones', l1.revision.id).estado === 'EN_REVISION');
  prueba('En revisión sigue abierta y pendiente', L.pendientesDe(lider.id).some((x) => x.id === l1.revision.id));
  prueba('Devolver exige motivo', !L.resolverRevision(db.get('ops_revisiones', l1.revision.id), 'DEVOLVER', lider, {}).ok);
  prueba('Líder devuelve para ajustes', L.resolverRevision(db.get('ops_revisiones', l1.revision.id), 'DEVOLVER', lider, { motivo: 'Falta documentación', puede: P(lider).resuelve }).ok && db.get('ops_revisiones', l1.revision.id).estado === 'DEVUELTA');
  const l2 = L.enviarRevision(sis(), 'LIDER', dev);
  prueba('Líder aprueba', L.resolverRevision(l2.revision, 'APROBAR', lider, { puede: P(lider).resuelve }).ok && db.get('ops_revisiones', l2.revision.id).estado === 'APROBADA');
  prueba('No hay revisiones abiertas al final', L.revisionesDe(sis().id).every((x) => !L.isAbierta(x)));

  console.log('\nPausar y reactivar');
  prueba('Pausar exige motivo', !L.cambiarEstado(sis(), 'pausar', admin, '').ok);
  prueba('Pausa el sistema', L.cambiarEstado(sis(), 'pausar', admin, 'Esperando credenciales').ok && sis().estado === 'PAUSADO');
  prueba('Conserva horas e historial', L.totalesHoras(L.horasDe(sis().id)).total === 19.5 && L.historialDe(sis().id).length > 5);
  prueba('Pausar no está disponible estando pausado', !L.cambiarEstado(sis(), 'pausar', admin, 'x').ok);
  prueba('Un desarrollador NO registra horas en pausado', !L.registrarHoras(h({ horas: 1 }), dev, { isAdmin: false }).ok);
  prueba('El administrador sí puede (autorización especial)', L.registrarHoras(h({ horas: 1 }), admin, { isAdmin: true }).ok);
  prueba('No se envía a revisión estando pausado', !L.enviarRevision(sis(), 'QA', dev).ok);
  prueba('No cuenta como sistema activo', db.list('ops_sistemas', (s) => s.estado === 'ACTIVO').every((s) => s.id !== sis().id));
  prueba('Reactiva el sistema', L.cambiarEstado(sis(), 'reactivar', admin).ok && sis().estado === 'ACTIVO');
  prueba('Tras reactivar, el desarrollador vuelve a registrar', L.registrarHoras(h({ horas: 1 }), dev).ok);

  console.log('\nCierre de sistemas');
  prueba('Cierra con motivo', L.cambiarEstado(sis(), 'cerrar', admin, 'Entregado y aceptado').ok && sis().estado === 'CERRADO');
  prueba('Cerrado no admite horas del desarrollador', !L.registrarHoras(h({ horas: 1 }), dev).ok);
  prueba('Cerrado no cambia de etapa', !L.cambiarEtapa(sis(), 'DESPLEGADO', admin).ok);
  prueba('Conserva todo su historial y horas (19.5 + 1 + 1)', L.totalesHoras(L.horasDe(sis().id)).total === 21.5);
  prueba('Se puede activar de nuevo', L.cambiarEstado(sis(), 'activar', admin).ok && sis().estado === 'ACTIVO');

  console.log('\nTrazabilidad');
  const eventos = db.listAll('workflow_historial').filter((w) => w.modulo === 'operaciones' && w.registro_id === sis().id);
  const acciones = eventos.map((e) => e.accion);
  ['Sistema creado', 'Cambio de etapa', 'Enviado a QA', 'Enviado al líder', 'Pausar', 'Reactivar', 'Cerrar', 'Activar', 'Devuelto a Desarrollo'].forEach((a) =>
    prueba(`Bitácora: «${a}»`, acciones.includes(a)),
  );
  prueba('Cada acción guarda quién la hizo', eventos.every((e) => e.usuario_id && e.usuario));
  const logs = db.listAll('auditoria_logs').filter((l) => l.modulo === 'operaciones');
  prueba('Auditoría registra horas, sistemas y revisiones', ['ops_sistemas', 'ops_horas', 'ops_revisiones'].every((tb) => logs.some((l) => l.tabla === tb)));
  prueba('Las horas quedan con empresa del sistema', L.horasDe(sis().id).every((x) => x.empresa_id === sis().empresa_id));

  console.log(`\n${total - fallos}/${total} pruebas correctas${fallos ? ` · ${fallos} con fallo` : ''}`);
} finally {
  await server.close();
}
process.exit(fallos ? 1 : 0);
