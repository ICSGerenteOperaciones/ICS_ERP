// Prueba de seguridad de la base de datos: intenta, saltándose la interfaz, hacer cosas que un
// usuario con rol limitado NO debe poder hacer, y verifica que Supabase (RLS) las rechaza.
//
//   ADMIN_EMAIL=correo ADMIN_PASSWORD=clave node scripts/probar-seguridad.mjs
//
// Crea un usuario temporal (rol "Analista de compras", solo ICS Matriz) y lo elimina al terminar.
import { createClient } from '@supabase/supabase-js';

const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Defina ADMIN_EMAIL y ADMIN_PASSWORD.');
  process.exit(1);
}
const URL = process.env.VITE_SUPABASE_URL || 'https://netxdlquxcjgurbgndpf.supabase.co';
const KEY = process.env.VITE_SUPABASE_KEY || 'sb_publishable_jmrk9gDNUe_RtFTWutYGPQ_KWR1DSgZ';
const client = () => createClient(URL, KEY, { auth: { persistSession: false } });

const TMP = { email: 'zz-prueba-seguridad@icscode.com.co', pass: `Tmp-${Math.random().toString(36).slice(2)}-Zz9!` };
const admin = client();
let fallos = 0;
let total = 0;
const check = (nombre, ok, detalle = '') => {
  total += 1;
  if (!ok) fallos += 1;
  console.log(`${ok ? '✓' : '✗ FALLO'}  ${nombre}${detalle ? ` — ${detalle}` : ''}`);
};
const denegado = (r) => !!r.error || (Array.isArray(r.data) && r.data.length === 0);

const { error: e0 } = await admin.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
if (e0) {
  console.error('No se pudo iniciar sesión como administrador:', e0.message);
  process.exit(1);
}

const { data: roles } = await admin.from('roles').select('id,nombre');
const rolCompras = roles.find((r) => r.nombre === 'Analista de compras');
if (!rolCompras) {
  console.error('No existe el rol "Analista de compras" (cargue los datos de demostración).');
  process.exit(1);
}

let tmpId = null;
try {
  const { data: creado, error: ce } = await admin.functions.invoke('admin-usuarios', {
    body: {
      action: 'create',
      password: TMP.pass,
      user: { email: TMP.email, nombre: 'Prueba Seguridad', usuario: 'zz-seguridad', cargo: 'Temporal', rol_id: rolCompras.id, activo: true, empresa_id: 'emp-ics', empresas_ids: ['emp-ics'], dashboards: ['compras'] },
    },
  });
  if (ce || creado?.error) throw new Error(creado?.error || ce.message);
  tmpId = creado.id;

  const u = client();
  const { error: le } = await u.auth.signInWithPassword({ email: TMP.email, password: TMP.pass });
  if (le) throw new Error(`El usuario temporal no pudo ingresar: ${le.message}`);

  console.log('\n— Aislamiento por empresa —');
  let r = await u.from('compras').select('id').eq('empresa_id', 'emp-cloud');
  check('No lee compras de otra empresa (ICS Cloud)', denegado(r));
  r = await u.from('compras').select('id').eq('empresa_id', 'emp-ics');
  check('Sí lee las compras de su empresa (ICS Matriz)', !r.error && r.data.length > 0, `${r.data?.length} filas`);
  r = await u.from('empresas').select('id');
  check('Solo ve su empresa en el catálogo', !r.error && r.data.length === 1 && r.data[0].id === 'emp-ics', `${r.data?.length} empresa(s)`);
  r = await u.from('compras').insert({ id: 'zz-x1', empresa_id: 'emp-cloud', codigo: 'OC-9999', fecha: '2026-11-03', proveedor_id: 'x', solicitante: 'x', centro_costo: 'TI', forma_pago: 'Contado' });
  check('No crea registros en otra empresa', !!r.error, r.error?.code);

  console.log('\n— Permisos por rol (CRUD) —');
  r = await u.from('compras').delete().eq('empresa_id', 'emp-ics').select('id');
  check('No elimina compras (el rol no tiene "eliminar")', denegado(r));
  r = await u.from('firmas').insert({ id: 'zz-f1', empresa_id: 'emp-ics', codigo: 'DOC-9999', titulo: 'x', tipo: 'Acta', fecha_limite: '2026-12-01' });
  check('No crea documentos de firma (solo tiene "ver")', !!r.error, r.error?.code);
  r = await u.from('actividades').select('id');
  check('No lee actividades (módulo sin permiso)', denegado(r));
  r = await u.from('roles').update({ nombre: 'Hackeado' }).eq('id', rolCompras.id).select('id');
  check('No modifica roles', denegado(r));
  r = await u.from('empresas').insert({ id: 'zz-e', codigo: 'EMP-9999', nombre: 'x', alias: 'x', nit: '1' });
  check('No crea empresas', !!r.error, r.error?.code);

  console.log('\n— Escalada de privilegios —');
  r = await u.from('usuarios').update({ rol_id: 'rol-admin' }).eq('id', tmpId).select('id');
  check('No puede asignarse el rol Administrador', denegado(r));
  r = await u.from('usuarios_empresas').insert({ usuario_id: tmpId, empresa_id: 'emp-cloud' });
  check('No puede darse acceso a otra empresa', !!r.error, r.error?.code);
  r = await u.functions.invoke('admin-usuarios', { body: { action: 'create', password: 'Otra-clave-12345', user: { email: 'zz-otro@icscode.com.co', nombre: 'x', usuario: 'zz-otro', rol_id: 'rol-admin' } } });
  check('No puede crear usuarios (función segura)', !!r.error || !!r.data?.error, r.data?.error || r.error?.message);

  console.log('\n— Auditoría inmutable —');
  r = await u.from('auditoria_logs').select('id').limit(1);
  check('No lee la auditoría (sin permiso)', denegado(r));
  const logId = `zz-log-${Date.now()}`;
  r = await u.from('auditoria_logs').insert({ id: logId, empresa_id: null, codigo: 'LOG-ZZ', usuario_id: '00000000-0000-0000-0000-000000000000', usuario: 'Falso', accion: 'EDITAR', modulo: 'sesion', descripcion: 'evento falsificado' });
  check('No puede registrar eventos a nombre de otra persona', !!r.error, r.error?.code);
  r = await u.from('auditoria_logs').insert({ id: logId, empresa_id: null, codigo: 'LOG-ZZ', usuario_id: tmpId, usuario: 'Prueba Seguridad', accion: 'LOGIN', modulo: 'sesion', descripcion: 'evento propio de la prueba' });
  check('Sí registra sus propios eventos', !r.error, r.error?.message);
  r = await u.from('auditoria_logs_cambios').insert({ id: `${logId}-c`, log_id: logId, campo: 'x', anterior: '', nuevo: 'y' });
  check('Sí registra el detalle de sus propios eventos', !r.error, r.error?.message);
  r = await admin.from('auditoria_logs').update({ descripcion: 'alterado' }).eq('id', logId).select('id');
  check('Ni el administrador puede modificar un evento registrado', denegado(r));
  r = await admin.from('auditoria_logs').delete().eq('id', logId).select('id');
  check('Ni el administrador puede borrar un evento registrado', denegado(r));

  console.log('\n— Acceso anónimo —');
  const anon = client();
  for (const t of ['usuarios', 'compras', 'empresas', 'roles', 'auditoria_logs']) {
    r = await anon.from(t).select('*').limit(1);
    check(`Sin sesión no se puede leer "${t}"`, denegado(r), r.error?.code);
  }
} finally {
  if (tmpId) {
    const { error } = await admin.functions.invoke('admin-usuarios', { body: { action: 'delete', id: tmpId } });
    console.log(error ? `\nAviso: eliminar manualmente ${TMP.email}` : '\n(usuario temporal eliminado)');
  }
}

console.log(`\n${total - fallos}/${total} comprobaciones correctas${fallos ? ` — ${fallos} FALLO(S)` : ''}`);
process.exit(fallos ? 1 : 0);
