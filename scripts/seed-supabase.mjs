// Carga en Supabase los datos de demostración (roles, 3 empresas y sus datos de negocio).
//
//   ADMIN_EMAIL=correo ADMIN_PASSWORD=clave node scripts/seed-supabase.mjs
//
// Se ejecuta con la sesión del administrador, por lo que cumple las mismas políticas RLS que la
// aplicación. NO carga usuarios (las cuentas se crean desde el módulo Usuarios) ni la auditoría
// (el historial de auditoría solo debe contener actividad real).
// Si la base ya tiene empresas, se detiene para no duplicar datos.
import { createServer } from 'vite';
import { createClient } from '@supabase/supabase-js';

const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Defina ADMIN_EMAIL y ADMIN_PASSWORD.');
  process.exit(1);
}

process.env.VITE_BACKEND = 'local'; // el script usa su propio cliente
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { buildSeed } = await vite.ssrLoadModule('/src/data/seed.js');
const { toRow } = await vite.ssrLoadModule('/src/data/remote.js');
const seed = buildSeed();

const URL = process.env.VITE_SUPABASE_URL || 'https://netxdlquxcjgurbgndpf.supabase.co';
const KEY = process.env.VITE_SUPABASE_KEY || 'sb_publishable_jmrk9gDNUe_RtFTWutYGPQ_KWR1DSgZ';
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

const { error: authError } = await sb.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
if (authError) {
  console.error('No se pudo iniciar sesión:', authError.message);
  process.exit(1);
}

const { count } = await sb.from('empresas').select('id', { count: 'exact', head: true });
if (count > 0) {
  console.error(`La base ya tiene ${count} empresa(s). Se cancela para no duplicar datos.`);
  process.exit(1);
}

async function insert(table, rows) {
  if (!rows.length) return 0;
  const mapped = rows.map((r) => toRow(table, r));
  for (let i = 0; i < mapped.length; i += 200) {
    const { error } = await sb.from(table).insert(mapped.slice(i, i + 200));
    if (error) {
      console.error(`✗ ${table}:`, error.message, error.details || '');
      process.exit(1);
    }
  }
  console.log(`✓ ${table.padEnd(22)} ${String(rows.length).padStart(4)} filas`);
  return rows.length;
}

// Orden de dependencias: primero lo referenciado, después los detalles.
await insert('empresas', seed.empresas);
await insert('roles', seed.roles.filter((r) => r.id !== 'rol-admin')); // el rol Administrador ya existe

// El administrador entra a ICS Matriz por defecto.
const { error: perfilError } = await sb.from('usuarios').update({ empresa_id: 'emp-ics' }).eq('rol_id', 'rol-admin');
if (perfilError) console.error('Aviso: no se pudo fijar la empresa predeterminada del administrador:', perfilError.message);

for (const t of [
  'terceros', 'terceros_contactos', 'terceros_direcciones', 'terceros_cuentas',
  'articulos', 'compras', 'compras_items', 'compras_entregas',
  'inventario', 'inventario_lineas',
  'firmas', 'firmas_firmantes', 'firmas_adjuntos',
  'actividades', 'actividades_tareas', 'actividades_tiempos',
  'workflow_historial',
]) {
  await insert(t, seed[t]);
}

await sb.auth.signOut();
await vite.close();
console.log('\nListo: datos de demostración cargados.');
