-- =====================================================================
-- Insight Cloud Solution (ICS) · Esquema de producción (Supabase / PostgreSQL)
--
-- • Maestro → Detalle con llaves foráneas y borrado en cascada.
-- • Multiempresa: cada fila de negocio pertenece a una empresa (empresa_id).
-- • Seguridad a nivel de fila (RLS): la base impide leer/escribir datos de otra empresa
--   y hace cumplir la matriz de permisos CRUD de cada rol (roles.permisos).
-- • Auditoría inmutable: auditoria_logs solo admite inserción (sin UPDATE/DELETE).
-- • Las contraseñas viven en Supabase Auth (auth.users), nunca en estas tablas.
-- =====================================================================

create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated;

-- ---------------------------------------------------------------------
-- 1. Tablas globales del grupo
-- ---------------------------------------------------------------------
create table public.empresas (
  id          text primary key,
  codigo      text not null unique,
  nombre      text not null,
  alias       text not null,
  nit         text not null unique,
  ciudad      text,
  moneda      text not null default 'COP',
  color       text not null default '#22C8F0',
  activo      boolean not null default true,
  creado      timestamptz not null default now(),
  actualizado timestamptz not null default now()
);

create table public.roles (
  id          text primary key,
  codigo      text not null unique,
  nombre      text not null,
  descripcion text,
  permisos    jsonb not null default '{}'::jsonb,   -- { modulo: { ver, crear, editar, eliminar, aprobar } }
  sistema     boolean not null default false,       -- rol de sistema: no editable ni eliminable
  creado      timestamptz not null default now(),
  actualizado timestamptz not null default now()
);

-- Perfil del usuario: id = auth.users.id (la contraseña la gestiona Supabase Auth)
create table public.usuarios (
  id          uuid primary key references auth.users (id) on delete cascade,
  codigo      text not null unique,
  usuario     text not null,
  nombre      text not null,
  email       text not null,
  cargo       text,
  rol_id      text not null references public.roles (id),
  activo      boolean not null default true,
  empresa_id  text references public.empresas (id) on delete set null,  -- empresa predeterminada
  dashboards  jsonb not null default '[]'::jsonb,
  creado      timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
create unique index ux_usuarios_usuario on public.usuarios (lower(usuario));
create unique index ux_usuarios_email on public.usuarios (lower(email));
create index ix_usuarios_rol on public.usuarios (rol_id);

-- Empresas a las que puede acceder cada usuario (el rol Administrador accede a todas)
create table public.usuarios_empresas (
  usuario_id uuid not null references public.usuarios (id) on delete cascade,
  empresa_id text not null references public.empresas (id) on delete cascade,
  primary key (usuario_id, empresa_id)
);
create index ix_usuarios_empresas_empresa on public.usuarios_empresas (empresa_id);

-- ---------------------------------------------------------------------
-- 2. Terceros
-- ---------------------------------------------------------------------
create table public.terceros (
  id             text primary key,
  empresa_id     text not null references public.empresas (id),
  codigo         text not null,
  razon_social   text not null,
  tipo           text not null check (tipo in ('Proveedor', 'Cliente', 'Aliado', 'Empleado')),
  tipo_documento text not null,
  documento      text not null,
  ciudad         text,
  email          text,
  telefono       text,
  estado         text not null default 'PROSPECTO',
  creado         timestamptz not null default now(),
  actualizado    timestamptz not null default now(),
  unique (empresa_id, tipo_documento, documento)
);
create table public.terceros_contactos (
  id          text primary key,
  empresa_id  text not null references public.empresas (id),
  tercero_id  text not null references public.terceros (id) on delete cascade,
  nombre      text not null,
  cargo       text,
  email       text,
  telefono    text,
  creado      timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
create table public.terceros_direcciones (
  id          text primary key,
  empresa_id  text not null references public.empresas (id),
  tercero_id  text not null references public.terceros (id) on delete cascade,
  tipo        text not null,
  direccion   text not null,
  ciudad      text,
  creado      timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
create table public.terceros_cuentas (
  id          text primary key,
  empresa_id  text not null references public.empresas (id),
  tercero_id  text not null references public.terceros (id) on delete cascade,
  banco       text not null,
  tipo_cuenta text not null,
  numero      text not null,
  creado      timestamptz not null default now(),
  actualizado timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. Inventario (artículos) — se relaciona con Compras
-- ---------------------------------------------------------------------
create table public.articulos (
  id           text primary key,
  empresa_id   text not null references public.empresas (id),
  codigo       text not null,
  nombre       text not null,
  categoria    text not null,
  unidad       text not null,
  stock_minimo numeric(14, 2) not null default 0 check (stock_minimo >= 0),
  ultimo_costo numeric(16, 2) not null default 0 check (ultimo_costo >= 0),
  activo       boolean not null default true,
  creado       timestamptz not null default now(),
  actualizado  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 4. Compras
-- ---------------------------------------------------------------------
create table public.compras (
  id            text primary key,
  empresa_id    text not null references public.empresas (id),
  codigo        text not null,
  fecha         date not null,
  proveedor_id  text not null references public.terceros (id),
  solicitante   text not null,
  centro_costo  text not null,
  forma_pago    text not null,
  moneda        text not null default 'COP',
  observaciones text,
  estado        text not null default 'BORRADOR',
  creado        timestamptz not null default now(),
  actualizado   timestamptz not null default now()
);
create table public.compras_items (
  id              text primary key,
  empresa_id      text not null references public.empresas (id),
  compra_id       text not null references public.compras (id) on delete cascade,
  articulo_id     text references public.articulos (id) on delete set null,  -- ítem ligado a inventario
  descripcion     text not null,
  unidad          text not null,
  cantidad        numeric(14, 2) not null check (cantidad > 0),
  precio_unitario numeric(16, 2) not null check (precio_unitario >= 0),
  iva             numeric(5, 2) not null default 19 check (iva between 0 and 100),
  creado          timestamptz not null default now(),
  actualizado     timestamptz not null default now()
);
create table public.compras_entregas (
  id           text primary key,
  empresa_id   text not null references public.empresas (id),
  compra_id    text not null references public.compras (id) on delete cascade,
  fecha        date not null,
  remision     text not null,
  recibido_por text not null,
  observacion  text,
  creado       timestamptz not null default now(),
  actualizado  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 5. Inventario: movimientos (maestro) → líneas (detalle)
-- ---------------------------------------------------------------------
create table public.inventario (
  id            text primary key,
  empresa_id    text not null references public.empresas (id),
  codigo        text not null,
  tipo          text not null check (tipo in ('Entrada por compra', 'Entrada', 'Salida', 'Ajuste')),
  fecha         date not null,
  bodega        text not null,
  compra_id     text references public.compras (id) on delete set null,   -- orden de origen
  referencia    text,
  observaciones text,
  estado        text not null default 'BORRADOR',
  creado        timestamptz not null default now(),
  actualizado   timestamptz not null default now()
);
create table public.inventario_lineas (
  id             text primary key,
  empresa_id     text not null references public.empresas (id),
  movimiento_id  text not null references public.inventario (id) on delete cascade,
  articulo_id    text not null references public.articulos (id),
  cantidad       numeric(14, 2) not null,                  -- en ajustes puede ser negativa
  costo_unitario numeric(16, 2) not null default 0 check (costo_unitario >= 0),
  creado         timestamptz not null default now(),
  actualizado    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 6. Firmas
-- ---------------------------------------------------------------------
create table public.firmas (
  id           text primary key,
  empresa_id   text not null references public.empresas (id),
  codigo       text not null,
  titulo       text not null,
  tipo         text not null,
  tercero_id   text references public.terceros (id) on delete set null,
  fecha_limite date not null,
  descripcion  text,
  estado       text not null default 'BORRADOR',
  creado       timestamptz not null default now(),
  actualizado  timestamptz not null default now()
);
create table public.firmas_firmantes (
  id           text primary key,
  empresa_id   text not null references public.empresas (id),
  documento_id text not null references public.firmas (id) on delete cascade,
  orden        smallint not null,
  nombre       text not null,
  cargo        text,
  email        text not null,
  estado       text not null default 'PENDIENTE',
  fecha_firma  timestamptz,
  firma        text,                                       -- imagen PNG (data URL) de la firma manuscrita
  firmado_por  text,
  creado       timestamptz not null default now(),
  actualizado  timestamptz not null default now(),
  unique (documento_id, orden)
);
create table public.firmas_adjuntos (
  id           text primary key,
  empresa_id   text not null references public.empresas (id),
  documento_id text not null references public.firmas (id) on delete cascade,
  nombre       text not null,
  tipo         text not null,
  tamano_kb    integer,
  creado       timestamptz not null default now(),
  actualizado  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 7. Actividades
-- ---------------------------------------------------------------------
create table public.actividades (
  id           text primary key,
  empresa_id   text not null references public.empresas (id),
  codigo       text not null,
  titulo       text not null,
  area         text not null,
  responsable  text not null,
  prioridad    text not null,
  fecha_inicio date not null,
  fecha_fin    date not null,
  descripcion  text,
  estado       text not null default 'PLANEADA',
  creado       timestamptz not null default now(),
  actualizado  timestamptz not null default now()
);
create table public.actividades_tareas (
  id              text primary key,
  empresa_id      text not null references public.empresas (id),
  actividad_id    text not null references public.actividades (id) on delete cascade,
  titulo          text not null,
  responsable     text not null,
  fecha           date not null,
  horas_estimadas numeric(6, 2),
  completada      boolean not null default false,
  creado          timestamptz not null default now(),
  actualizado     timestamptz not null default now()
);
create table public.actividades_tiempos (
  id           text primary key,
  empresa_id   text not null references public.empresas (id),
  actividad_id text not null references public.actividades (id) on delete cascade,
  fecha        date not null,
  usuario      text not null,
  horas        numeric(6, 2) not null check (horas > 0),
  nota         text,
  creado       timestamptz not null default now(),
  actualizado  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 8. Auditoría (logs) y bitácora de workflow — SOLO INSERCIÓN
-- ---------------------------------------------------------------------
create table public.auditoria_logs (
  id              text primary key,
  empresa_id      text references public.empresas (id),       -- NULL = evento global del grupo
  codigo          text not null,
  fecha           timestamptz not null default now(),
  usuario_id      text not null,                               -- sin FK: el log sobrevive al usuario
  usuario         text not null,
  usuario_login   text,
  rol             text,
  accion          text not null check (accion in ('CREAR', 'EDITAR', 'ELIMINAR', 'WORKFLOW', 'LOGIN', 'LOGOUT', 'LOGIN_FALLIDO', 'CAMBIO_EMPRESA')),
  modulo          text not null,
  tabla           text,
  registro_id     text,
  registro_codigo text,
  descripcion     text not null,
  nivel           text not null default 'info',
  creado          timestamptz not null default now()
);
create index ix_audit_empresa_fecha on public.auditoria_logs (empresa_id, fecha desc);
create index ix_audit_fecha on public.auditoria_logs (fecha desc);
create index ix_audit_usuario on public.auditoria_logs (usuario_id, fecha desc);
create index ix_audit_registro on public.auditoria_logs (tabla, registro_id);
create unique index ux_audit_codigo on public.auditoria_logs (coalesce(empresa_id, ''), codigo);

create table public.auditoria_logs_cambios (
  id       text primary key,
  log_id   text not null references public.auditoria_logs (id) on delete cascade,
  campo    text not null,
  anterior text,
  nuevo    text
);
create index ix_audit_cambios_log on public.auditoria_logs_cambios (log_id);

create table public.workflow_historial (
  id              text primary key,
  empresa_id      text not null references public.empresas (id),
  modulo          text not null,
  registro_id     text not null,
  registro_codigo text,
  desde           text,
  hacia           text not null,
  accion          text not null,
  usuario_id      text,
  usuario         text,
  comentario      text,
  fecha           timestamptz not null default now()
);
create index ix_wf_registro on public.workflow_historial (modulo, registro_id);
create index ix_wf_empresa on public.workflow_historial (empresa_id);

-- ---------------------------------------------------------------------
-- 9. Índices de llaves foráneas y de empresa
-- ---------------------------------------------------------------------
create index ix_terceros_empresa on public.terceros (empresa_id);
create index ix_terceros_contactos_t on public.terceros_contactos (tercero_id);
create index ix_terceros_direcciones_t on public.terceros_direcciones (tercero_id);
create index ix_terceros_cuentas_t on public.terceros_cuentas (tercero_id);
create index ix_articulos_empresa on public.articulos (empresa_id);
create index ix_compras_empresa on public.compras (empresa_id, fecha desc);
create index ix_compras_proveedor on public.compras (proveedor_id);
create index ix_compras_items_c on public.compras_items (compra_id);
create index ix_compras_items_a on public.compras_items (articulo_id);
create index ix_compras_entregas_c on public.compras_entregas (compra_id);
create index ix_inventario_empresa on public.inventario (empresa_id, fecha desc);
create index ix_inventario_compra on public.inventario (compra_id);
create index ix_inventario_lineas_m on public.inventario_lineas (movimiento_id);
create index ix_inventario_lineas_a on public.inventario_lineas (articulo_id);
create index ix_firmas_empresa on public.firmas (empresa_id);
create index ix_firmas_tercero on public.firmas (tercero_id);
create index ix_firmas_firmantes_d on public.firmas_firmantes (documento_id);
create index ix_firmas_adjuntos_d on public.firmas_adjuntos (documento_id);
create index ix_actividades_empresa on public.actividades (empresa_id);
create index ix_actividades_tareas_a on public.actividades_tareas (actividad_id);
create index ix_actividades_tiempos_a on public.actividades_tiempos (actividad_id);
create index ix_usuarios_empresa on public.usuarios (empresa_id);

-- Numeración propia por empresa (la asigna el servidor si el código llega repetido o vacío)
create unique index ux_terceros_codigo on public.terceros (empresa_id, codigo);
create unique index ux_compras_codigo on public.compras (empresa_id, codigo);
create unique index ux_articulos_codigo on public.articulos (empresa_id, codigo);
create unique index ux_inventario_codigo on public.inventario (empresa_id, codigo);
create unique index ux_firmas_codigo on public.firmas (empresa_id, codigo);
create unique index ux_actividades_codigo on public.actividades (empresa_id, codigo);

-- ---------------------------------------------------------------------
-- 10. Funciones de seguridad (esquema privado "app": no se exponen por la API)
-- ---------------------------------------------------------------------
create or replace function app.es_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.usuarios u
    where u.id = (select auth.uid()) and u.activo and u.rol_id = 'rol-admin'
  );
$$;

-- ¿El usuario actual tiene el permiso <accion> sobre el módulo <modulo>? (Administrador: todos)
create or replace function app.permiso(modulo text, accion text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select u.rol_id = 'rol-admin' or coalesce((r.permisos -> modulo ->> accion)::boolean, false)
    from public.usuarios u
    join public.roles r on r.id = u.rol_id
    where u.id = (select auth.uid()) and u.activo
  ), false);
$$;

-- ¿El usuario actual puede trabajar en la empresa <eid>?
create or replace function app.puede_empresa(eid text)
returns boolean language sql stable security definer set search_path = public as $$
  select app.es_admin() or exists (
    select 1
    from public.usuarios_empresas ue
    join public.usuarios u on u.id = ue.usuario_id
    where ue.usuario_id = (select auth.uid()) and ue.empresa_id = eid and u.activo
  );
$$;

revoke all on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated;

-- ---------------------------------------------------------------------
-- 11. Triggers
-- ---------------------------------------------------------------------
-- Código consecutivo por empresa: si llega vacío o repetido (dos usuarios creando a la vez),
-- el servidor asigna el siguiente. TG_ARGV[0] = prefijo.
create or replace function app.asignar_codigo()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  n int;
  dup boolean;
begin
  perform pg_advisory_xact_lock(hashtext(tg_table_name || coalesce(new.empresa_id, '')));
  execute format('select exists (select 1 from public.%I where coalesce(empresa_id, '''') = $1 and codigo = $2)', tg_table_name)
    into dup using coalesce(new.empresa_id, ''), coalesce(new.codigo, '');
  if new.codigo is null or new.codigo = '' or dup then
    execute format(
      'select coalesce(max(nullif(regexp_replace(codigo, ''^.*-'', ''''), '''')::int), 0) from public.%I where coalesce(empresa_id, '''') = $1',
      tg_table_name)
      into n using coalesce(new.empresa_id, '');
    new.codigo := tg_argv[0] || '-' || lpad((n + 1)::text, 4, '0');
  end if;
  return new;
end;
$$;

create trigger trg_codigo before insert on public.terceros for each row execute function app.asignar_codigo('TER');
create trigger trg_codigo before insert on public.compras for each row execute function app.asignar_codigo('OC');
create trigger trg_codigo before insert on public.articulos for each row execute function app.asignar_codigo('ART');
create trigger trg_codigo before insert on public.inventario for each row execute function app.asignar_codigo('MOV');
create trigger trg_codigo before insert on public.firmas for each row execute function app.asignar_codigo('DOC');
create trigger trg_codigo before insert on public.actividades for each row execute function app.asignar_codigo('ACT');
create trigger trg_codigo before insert on public.auditoria_logs for each row execute function app.asignar_codigo('LOG');

-- Al borrar un registro maestro se limpia su historial de workflow
create or replace function app.limpiar_historial()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.workflow_historial where registro_id = old.id;
  return old;
end;
$$;
create trigger trg_hist after delete on public.terceros for each row execute function app.limpiar_historial();
create trigger trg_hist after delete on public.compras for each row execute function app.limpiar_historial();
create trigger trg_hist after delete on public.inventario for each row execute function app.limpiar_historial();
create trigger trg_hist after delete on public.firmas for each row execute function app.limpiar_historial();
create trigger trg_hist after delete on public.actividades for each row execute function app.limpiar_historial();

-- Evita la escalada de privilegios: solo un administrador asigna o retira el rol Administrador
create or replace function app.guard_usuarios()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.id <> old.id then
    raise exception 'El identificador del usuario no se puede modificar';
  end if;
  if new.rol_id is distinct from old.rol_id
     and (new.rol_id = 'rol-admin' or old.rol_id = 'rol-admin')
     and not app.es_admin() then
    raise exception 'Solo un administrador puede asignar o retirar el rol Administrador';
  end if;
  return new;
end;
$$;
create trigger trg_guard before update on public.usuarios for each row execute function app.guard_usuarios();

-- ---------------------------------------------------------------------
-- 12. Seguridad a nivel de fila (RLS)
-- ---------------------------------------------------------------------
alter table public.empresas enable row level security;
alter table public.roles enable row level security;
alter table public.usuarios enable row level security;
alter table public.usuarios_empresas enable row level security;
alter table public.auditoria_logs enable row level security;
alter table public.auditoria_logs_cambios enable row level security;
alter table public.workflow_historial enable row level security;

-- Tablas de negocio: lectura/escritura solo en empresas permitidas y según el permiso del rol.
-- kind: m = maestro, d = detalle (un detalle se puede agregar/quitar con el permiso "editar" del maestro).
do $$
declare
  t record;
  extra_ins text;
begin
  for t in
    select * from (values
      ('terceros', 'terceros', 'm'), ('terceros_contactos', 'terceros', 'd'),
      ('terceros_direcciones', 'terceros', 'd'), ('terceros_cuentas', 'terceros', 'd'),
      ('compras', 'compras', 'm'), ('compras_items', 'compras', 'd'), ('compras_entregas', 'compras', 'd'),
      ('firmas', 'firmas', 'm'), ('firmas_firmantes', 'firmas', 'd'), ('firmas_adjuntos', 'firmas', 'd'),
      ('actividades', 'actividades', 'm'), ('actividades_tareas', 'actividades', 'd'), ('actividades_tiempos', 'actividades', 'd'),
      ('articulos', 'inventario', 'm'), ('inventario', 'inventario', 'm'), ('inventario_lineas', 'inventario', 'd')
    ) as v (tbl, modulo, kind)
  loop
    execute format('alter table public.%1$I enable row level security', t.tbl);

    execute format(
      'create policy ver on public.%1$I for select to authenticated using (app.puede_empresa(empresa_id) and app.permiso(%2$L, ''ver''))',
      t.tbl, t.modulo);

    -- Al recibir una orden de compra se generan ingresos de inventario: lo permite quien edita Compras.
    extra_ins := case when t.tbl in ('inventario', 'inventario_lineas') then ' or app.permiso(''compras'', ''editar'')' else '' end;

    if t.kind = 'm' then
      execute format(
        'create policy crear on public.%1$I for insert to authenticated with check (app.puede_empresa(empresa_id) and (app.permiso(%2$L, ''crear'')%3$s))',
        t.tbl, t.modulo, extra_ins);
      execute format(
        'create policy editar on public.%1$I for update to authenticated using (app.puede_empresa(empresa_id) and (app.permiso(%2$L, ''editar'') or app.permiso(%2$L, ''aprobar'') or app.permiso(%2$L, ''eliminar''))) with check (app.puede_empresa(empresa_id))',
        t.tbl, t.modulo);
      execute format(
        'create policy eliminar on public.%1$I for delete to authenticated using (app.puede_empresa(empresa_id) and app.permiso(%2$L, ''eliminar''))',
        t.tbl, t.modulo);
    else
      execute format(
        'create policy crear on public.%1$I for insert to authenticated with check (app.puede_empresa(empresa_id) and (app.permiso(%2$L, ''crear'') or app.permiso(%2$L, ''editar'')%3$s))',
        t.tbl, t.modulo, extra_ins);
      execute format(
        'create policy editar on public.%1$I for update to authenticated using (app.puede_empresa(empresa_id) and (app.permiso(%2$L, ''editar'') or app.permiso(%2$L, ''aprobar''))) with check (app.puede_empresa(empresa_id))',
        t.tbl, t.modulo);
      execute format(
        'create policy eliminar on public.%1$I for delete to authenticated using (app.puede_empresa(empresa_id) and (app.permiso(%2$L, ''editar'') or app.permiso(%2$L, ''eliminar'')))',
        t.tbl, t.modulo);
    end if;
  end loop;
end $$;

-- Empresas
create policy ver on public.empresas for select to authenticated using (app.puede_empresa(id));
create policy crear on public.empresas for insert to authenticated with check (app.permiso('empresas', 'crear'));
create policy editar on public.empresas for update to authenticated using (app.permiso('empresas', 'editar')) with check (app.permiso('empresas', 'editar'));
create policy eliminar on public.empresas for delete to authenticated using (app.permiso('empresas', 'eliminar'));

-- Roles (el rol de sistema no se modifica ni se elimina)
create policy ver on public.roles for select to authenticated using (true);
create policy crear on public.roles for insert to authenticated with check (app.permiso('roles', 'crear') and not sistema);
create policy editar on public.roles for update to authenticated using (app.permiso('roles', 'editar') and not sistema) with check (app.permiso('roles', 'editar') and not sistema);
create policy eliminar on public.roles for delete to authenticated using (app.permiso('roles', 'eliminar') and not sistema);

-- Usuarios: todos ven los perfiles (nombres en listas); las altas y bajas pasan por la función "admin-usuarios"
create policy ver on public.usuarios for select to authenticated using (true);
create policy editar on public.usuarios for update to authenticated using (app.permiso('usuarios', 'editar')) with check (app.permiso('usuarios', 'editar'));

create policy ver on public.usuarios_empresas for select to authenticated
  using (usuario_id = (select auth.uid()) or app.permiso('usuarios', 'ver'));
create policy crear on public.usuarios_empresas for insert to authenticated with check (app.permiso('usuarios', 'editar'));
create policy editar on public.usuarios_empresas for update to authenticated using (app.permiso('usuarios', 'editar')) with check (app.permiso('usuarios', 'editar'));
create policy eliminar on public.usuarios_empresas for delete to authenticated using (app.permiso('usuarios', 'editar'));

-- Auditoría: solo consulta quien tiene permiso; cualquiera registra SUS propios eventos; nadie modifica ni borra
create policy ver on public.auditoria_logs for select to authenticated
  using ((empresa_id is null or app.puede_empresa(empresa_id)) and app.permiso('auditorias', 'ver'));
create policy registrar on public.auditoria_logs for insert to authenticated
  with check (usuario_id = (select auth.uid())::text and (empresa_id is null or app.puede_empresa(empresa_id)));

create policy ver on public.auditoria_logs_cambios for select to authenticated
  using (exists (select 1 from public.auditoria_logs l where l.id = log_id));
create policy registrar on public.auditoria_logs_cambios for insert to authenticated
  with check (exists (select 1 from public.auditoria_logs l where l.id = log_id and l.usuario_id = (select auth.uid())::text));

-- Bitácora de workflow: se consulta y se agrega dentro de la empresa; no se edita ni se borra desde la aplicación
create policy ver on public.workflow_historial for select to authenticated using (app.puede_empresa(empresa_id));
create policy registrar on public.workflow_historial for insert to authenticated with check (app.puede_empresa(empresa_id));

-- El público anónimo no tiene acceso a ninguna tabla
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
