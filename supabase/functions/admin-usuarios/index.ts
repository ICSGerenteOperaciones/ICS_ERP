// Función segura para administrar usuarios (crear, cambiar contraseña, eliminar).
// Estas operaciones necesitan la clave de servicio de Supabase, que NUNCA debe estar en el navegador:
// por eso viven aquí. La función verifica quién la invoca y su permiso sobre el módulo "usuarios".
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false },
    });

    // 1) ¿Quién llama?
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: auth, error: authError } = await admin.auth.getUser(token);
    if (authError || !auth?.user) return json({ error: 'No autenticado' }, 401);

    const { data: perfil } = await admin
      .from('usuarios')
      .select('id, activo, rol_id, roles ( permisos )')
      .eq('id', auth.user.id)
      .maybeSingle();
    if (!perfil || !perfil.activo) return json({ error: 'Su usuario no está activo' }, 403);

    const esAdmin = perfil.rol_id === 'rol-admin';
    // deno-lint-ignore no-explicit-any
    const permisos = (perfil as any).roles?.permisos?.usuarios ?? {};
    const puede = (accion: string) => esAdmin || permisos[accion] === true;

    const body = await req.json();

    // ¿El usuario objetivo es administrador? Solo un administrador puede tocarlo.
    const objetivoEsAdmin = async (id: string) => {
      const { data } = await admin.from('usuarios').select('rol_id').eq('id', id).maybeSingle();
      return data?.rol_id === 'rol-admin';
    };

    switch (body.action) {
      // ---------------------------------------------------------------- crear
      case 'create': {
        if (!puede('crear')) return json({ error: 'No tiene permiso para crear usuarios' }, 403);
        const u = body.user ?? {};
        const email = String(u.email ?? '').trim().toLowerCase();
        const password = String(body.password ?? '');
        if (!EMAIL.test(email)) return json({ error: 'El correo no es válido' }, 400);
        if (password.length < 10) return json({ error: 'La contraseña debe tener al menos 10 caracteres' }, 400);
        if (!u.nombre || !u.usuario || !u.rol_id) return json({ error: 'Faltan datos obligatorios (nombre, usuario y rol)' }, 400);
        if (u.rol_id === 'rol-admin' && !esAdmin) return json({ error: 'Solo un administrador puede crear otro administrador' }, 403);

        const { data: creado, error: createError } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });
        if (createError || !creado?.user) {
          const msg = createError?.message ?? 'No se pudo crear la cuenta';
          return json({ error: /already|registered|exists/i.test(msg) ? 'Ya existe una cuenta con ese correo' : msg }, 400);
        }
        const id = creado.user.id;

        // Código consecutivo USR-0001…
        const { data: codigos } = await admin.from('usuarios').select('codigo');
        const max = (codigos ?? []).reduce((m: number, r: { codigo: string }) => Math.max(m, parseInt(r.codigo.replace(/^\D+-/, ''), 10) || 0), 0);

        const { error: perfilError } = await admin.from('usuarios').insert({
          id,
          codigo: `USR-${String(max + 1).padStart(4, '0')}`,
          usuario: String(u.usuario).trim(),
          nombre: String(u.nombre).trim(),
          email,
          cargo: u.cargo ?? null,
          rol_id: u.rol_id,
          activo: u.activo !== false,
          empresa_id: u.empresa_id || null,
          dashboards: Array.isArray(u.dashboards) ? u.dashboards : [],
        });
        if (perfilError) {
          await admin.auth.admin.deleteUser(id); // no dejar una cuenta sin perfil
          return json({ error: /usuarios_usuario|unique/i.test(perfilError.message) ? 'Ese nombre de usuario ya existe' : perfilError.message }, 400);
        }

        const empresas: string[] = Array.isArray(u.empresas_ids) ? u.empresas_ids : [];
        if (empresas.length) {
          const { error: linkError } = await admin
            .from('usuarios_empresas')
            .insert(empresas.map((empresa_id) => ({ usuario_id: id, empresa_id })));
          if (linkError) {
            await admin.auth.admin.deleteUser(id);
            return json({ error: linkError.message }, 400);
          }
        }
        return json({ ok: true, id });
      }

      // ------------------------------------------------- cambiar contraseña
      case 'set_password': {
        if (!puede('editar')) return json({ error: 'No tiene permiso para editar usuarios' }, 403);
        const password = String(body.password ?? '');
        if (password.length < 10) return json({ error: 'La contraseña debe tener al menos 10 caracteres' }, 400);
        if (!body.id) return json({ error: 'Falta el usuario' }, 400);
        if (!esAdmin && (await objetivoEsAdmin(body.id))) return json({ error: 'Solo un administrador puede cambiar la contraseña de un administrador' }, 403);
        const { error } = await admin.auth.admin.updateUserById(body.id, { password });
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true });
      }

      // ------------------------------------------------------------ eliminar
      case 'delete': {
        if (!puede('eliminar')) return json({ error: 'No tiene permiso para eliminar usuarios' }, 403);
        if (!body.id) return json({ error: 'Falta el usuario' }, 400);
        if (body.id === auth.user.id) return json({ error: 'No puede eliminar su propio usuario' }, 400);
        if (!esAdmin && (await objetivoEsAdmin(body.id))) return json({ error: 'Solo un administrador puede eliminar a un administrador' }, 403);
        const { error } = await admin.auth.admin.deleteUser(body.id); // el perfil se elimina en cascada
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true });
      }

      default:
        return json({ error: 'Acción desconocida' }, 400);
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Error inesperado' }, 500);
  }
});
