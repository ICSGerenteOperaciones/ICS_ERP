-- =====================================================================
-- Módulo OPERACIONES · Sistemas en desarrollo del área de Innovación
--
-- Todo gira alrededor del SISTEMA:
--   ops_sistemas    → el sistema (etapa visual + estado Activo/Pausado/Cerrado)
--   ops_horas       → horas trabajadas; SIEMPRE ligadas a un sistema y a una de las 4 etapas
--   ops_revisiones  → envíos a QA o al líder y su resolución
-- La trazabilidad usa lo que ya existe: auditoria_logs (cada cambio) y workflow_historial (acciones).
--
-- Permisos (módulo "operaciones" de la matriz de roles):
--   ver      consultar sistemas, etapas y horas
--   crear    registrar horas propias y enviar sistemas a revisión
--   editar   gestionar sistemas (crear/editar, cambiar etapa, pausar/cerrar) y corregir horas
--   aprobar  resolver las revisiones que le asignaron (QA / líder)
-- =====================================================================

create table public.ops_sistemas (
  id               text primary key,
  empresa_id       text not null references public.empresas (id),
  codigo           text not null,
  nombre           text not null,
  descripcion      text,
  desarrollador_id uuid references public.usuarios (id) on delete set null,
  coordinador_id   uuid references public.usuarios (id) on delete set null,
  qa_id            uuid references public.usuarios (id) on delete set null,
  fecha_inicio     date not null,
  fecha_entrega    date not null,
  prioridad        text not null default 'Media' check (prioridad in ('Alta', 'Media', 'Baja')),
  -- Etapa VISUAL: solo cambia por decisión manual; registrar horas nunca la modifica.
  etapa            text not null default 'ANALISIS' check (etapa in ('ANALISIS', 'DESARROLLO', 'QA', 'DESPLEGADO')),
  estado           text not null default 'ACTIVO' check (estado in ('ACTIVO', 'PAUSADO', 'CERRADO')),
  observaciones    text,
  creado           timestamptz not null default now(),
  actualizado      timestamptz not null default now(),
  check (fecha_entrega >= fecha_inicio)
);
create index ix_ops_sistemas_empresa on public.ops_sistemas (empresa_id);
create unique index ux_ops_sistemas_codigo on public.ops_sistemas (empresa_id, codigo);
create trigger trg_codigo before insert on public.ops_sistemas for each row execute function app.asignar_codigo('SIS');
create trigger trg_hist after delete on public.ops_sistemas for each row execute function app.limpiar_historial();

create table public.ops_horas (
  id          text primary key,
  empresa_id  text not null references public.empresas (id),
  sistema_id  text not null references public.ops_sistemas (id) on delete cascade,
  etapa       text not null check (etapa in ('ANALISIS', 'DESARROLLO', 'QA', 'DESPLEGADO')),
  usuario_id  uuid references public.usuarios (id) on delete set null,
  usuario     text not null,                                   -- nombre conservado aunque el usuario se elimine
  fecha       date not null,
  horas       numeric(5, 2) not null check (horas > 0 and horas <= 24),
  descripcion text not null check (length(btrim(descripcion)) > 0),
  creado      timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
create index ix_ops_horas_sistema on public.ops_horas (sistema_id, etapa);
create index ix_ops_horas_empresa on public.ops_horas (empresa_id, fecha desc);
create index ix_ops_horas_usuario on public.ops_horas (usuario_id);

create table public.ops_revisiones (
  id                text primary key,
  empresa_id        text not null references public.empresas (id),
  sistema_id        text not null references public.ops_sistemas (id) on delete cascade,
  tipo              text not null check (tipo in ('QA', 'LIDER')),
  enviado_por       uuid references public.usuarios (id) on delete set null,
  enviado_por_nombre text not null,
  fecha_envio       timestamptz not null default now(),
  comentario        text,
  destinatario_id   uuid references public.usuarios (id) on delete set null,   -- lo asigna el servidor
  estado            text not null default 'PENDIENTE' check (estado in ('PENDIENTE', 'EN_REVISION', 'APROBADA', 'RECHAZADA', 'DEVUELTA')),
  resuelto_por      text,
  fecha_resolucion  timestamptz,
  motivo            text,
  creado            timestamptz not null default now(),
  actualizado       timestamptz not null default now()
);
create index ix_ops_revisiones_sistema on public.ops_revisiones (sistema_id);
create index ix_ops_revisiones_dest on public.ops_revisiones (destinatario_id) where estado in ('PENDIENTE', 'EN_REVISION');
-- Una sola revisión abierta por sistema y tipo
create unique index ux_ops_revision_abierta on public.ops_revisiones (sistema_id, tipo) where estado in ('PENDIENTE', 'EN_REVISION');

-- ---------------------------------------------------------------------
-- Reglas del servidor (no dependen de la interfaz)
-- ---------------------------------------------------------------------

-- Horas: el sistema debe existir en la misma empresa y estar ACTIVO (solo el administrador puede registrar
-- en un sistema pausado/cerrado). La etapa de trabajo es libre: no depende de la etapa visual del sistema.
create or replace function app.guard_ops_horas()
returns trigger language plpgsql security definer set search_path = public as $$
declare s record;
begin
  select empresa_id, estado into s from public.ops_sistemas where id = new.sistema_id;
  if not found then raise exception 'El sistema no existe'; end if;
  if s.empresa_id <> new.empresa_id then raise exception 'El sistema pertenece a otra empresa'; end if;
  if s.estado <> 'ACTIVO' and not app.es_admin() then
    raise exception 'El sistema está % : solo el administrador puede registrar horas', lower(s.estado);
  end if;
  return new;
end;
$$;
create trigger trg_guard before insert or update on public.ops_horas for each row execute function app.guard_ops_horas();

-- Sistemas: quien no puede "editar" solo puede devolver un sistema de QA a Desarrollo (acción de QA/líder).
create or replace function app.guard_ops_sistemas()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if app.permiso('operaciones', 'editar') then return new; end if;
  if (to_jsonb(new) - 'actualizado' - 'etapa') is distinct from (to_jsonb(old) - 'actualizado' - 'etapa')
     or not (old.etapa = 'QA' and new.etapa = 'DESARROLLO')
     or not (old.qa_id = (select auth.uid()) or old.coordinador_id = (select auth.uid())) then
    raise exception 'Solo puede gestionar sistemas quien tiene permiso de edición';
  end if;
  return new;
end;
$$;
create trigger trg_guard before update on public.ops_sistemas for each row execute function app.guard_ops_sistemas();

-- Revisiones: el destinatario lo fija el servidor (QA o coordinador del sistema); solo ese usuario
-- (o el administrador) las resuelve; lo ya resuelto no se reabre.
create or replace function app.guard_ops_revisiones()
returns trigger language plpgsql security definer set search_path = public as $$
declare s record;
begin
  if tg_op = 'INSERT' then
    select estado, qa_id, coordinador_id into s from public.ops_sistemas where id = new.sistema_id;
    if not found then raise exception 'El sistema no existe'; end if;
    if s.estado <> 'ACTIVO' then raise exception 'Solo se envían a revisión sistemas activos'; end if;
    new.destinatario_id := case new.tipo when 'QA' then s.qa_id else s.coordinador_id end;
    if new.destinatario_id is null then
      raise exception 'El sistema no tiene % asignado', case new.tipo when 'QA' then 'responsable de QA' else 'coordinador' end;
    end if;
    new.estado := 'PENDIENTE';
    new.resuelto_por := null; new.fecha_resolucion := null; new.motivo := null;
    return new;
  end if;
  -- UPDATE
  if old.estado in ('APROBADA', 'RECHAZADA', 'DEVUELTA') then raise exception 'La revisión ya fue resuelta'; end if;
  if new.sistema_id <> old.sistema_id or new.tipo <> old.tipo or new.destinatario_id is distinct from old.destinatario_id
     or new.enviado_por is distinct from old.enviado_por or new.fecha_envio <> old.fecha_envio then
    raise exception 'Solo se puede resolver la revisión';
  end if;
  if not (app.es_admin() or old.destinatario_id = (select auth.uid())) then
    raise exception 'Solo el responsable de la revisión (o el administrador) puede resolverla';
  end if;
  return new;
end;
$$;
create trigger trg_guard before insert or update on public.ops_revisiones for each row execute function app.guard_ops_revisiones();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.ops_sistemas enable row level security;
alter table public.ops_horas enable row level security;
alter table public.ops_revisiones enable row level security;

create policy ver on public.ops_sistemas for select to authenticated
  using (app.puede_empresa(empresa_id) and app.permiso('operaciones', 'ver'));
create policy crear on public.ops_sistemas for insert to authenticated
  with check (app.puede_empresa(empresa_id) and app.permiso('operaciones', 'editar'));
create policy editar on public.ops_sistemas for update to authenticated
  using (app.puede_empresa(empresa_id) and (app.permiso('operaciones', 'editar') or app.permiso('operaciones', 'aprobar')))
  with check (app.puede_empresa(empresa_id));
-- Los sistemas no se eliminan (se cierran): conservan su historial.

create policy ver on public.ops_horas for select to authenticated
  using (app.puede_empresa(empresa_id) and app.permiso('operaciones', 'ver'));
create policy crear on public.ops_horas for insert to authenticated
  with check (app.puede_empresa(empresa_id)
    and ((app.permiso('operaciones', 'crear') and usuario_id = (select auth.uid())) or app.permiso('operaciones', 'editar')));
create policy editar on public.ops_horas for update to authenticated
  using (app.puede_empresa(empresa_id) and app.permiso('operaciones', 'editar'))
  with check (app.puede_empresa(empresa_id));
create policy eliminar on public.ops_horas for delete to authenticated
  using (app.puede_empresa(empresa_id) and app.permiso('operaciones', 'editar'));

create policy ver on public.ops_revisiones for select to authenticated
  using (app.puede_empresa(empresa_id) and app.permiso('operaciones', 'ver'));
create policy crear on public.ops_revisiones for insert to authenticated
  with check (app.puede_empresa(empresa_id) and enviado_por = (select auth.uid())
    and (app.permiso('operaciones', 'crear') or app.permiso('operaciones', 'editar')));
create policy editar on public.ops_revisiones for update to authenticated
  using (app.puede_empresa(empresa_id) and (app.permiso('operaciones', 'aprobar') or app.permiso('operaciones', 'editar')))
  with check (app.puede_empresa(empresa_id));

revoke all on public.ops_sistemas, public.ops_horas, public.ops_revisiones from anon;

-- ---------------------------------------------------------------------
-- Perfiles del módulo (roles existentes de la ERP; el Administrador ya tiene todo)
-- ---------------------------------------------------------------------
insert into public.roles (id, codigo, nombre, descripcion, permisos, sistema) values
  ('rol-ops-consulta', 'ROL-OPS-01', 'Operaciones · Consulta', 'Visualiza sistemas, etapas y horas',
   '{"dashboard":{"ver":true},"operaciones":{"ver":true}}', false),
  ('rol-ops-dev', 'ROL-OPS-02', 'Operaciones · Desarrollador', 'Consulta sus sistemas, registra horas y envía a revisión',
   '{"dashboard":{"ver":true},"operaciones":{"ver":true,"crear":true}}', false),
  ('rol-ops-qa', 'ROL-OPS-03', 'Operaciones · QA', 'Consulta sistemas enviados a revisión y aprueba o rechaza',
   '{"dashboard":{"ver":true},"operaciones":{"ver":true,"aprobar":true}}', false),
  ('rol-ops-lider', 'ROL-OPS-04', 'Operaciones · Líder', 'Revisa sistemas, aprueba o devuelve',
   '{"dashboard":{"ver":true},"operaciones":{"ver":true,"crear":true,"aprobar":true}}', false)
on conflict (id) do nothing;
