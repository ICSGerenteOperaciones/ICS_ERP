-- Deja la base VACÍA para empezar a cargar información real.
--
-- Qué hace:
--   · Borra TODOS los datos de negocio (terceros, compras, inventario, firmas, actividades),
--     la auditoría, la bitácora de workflow y las empresas de demostración.
--   · Elimina la cuenta anterior desarrollador1@icscode.com.co.
-- Qué conserva:
--   · La administradora gerencia.operaciones@icscode.com.co (ya creada en Supabase Auth).
--   · Los 5 roles (Administrador, Analista de compras, Aprobador, Líder de proyectos, Auditor interno).
--
-- Se ejecuta en una sola transacción y verifica el estado antes de borrar: si algo no cuadra
-- (por ejemplo, la nueva administradora no existe), se cancela y no se cambia nada.
-- ESTA OPERACIÓN NO SE PUEDE DESHACER. Ejecutar en Supabase → SQL Editor.

begin;

do $$
begin
  if not exists (select 1 from public.usuarios where lower(email) = 'gerencia.operaciones@icscode.com.co' and rol_id = 'rol-admin' and activo) then
    raise exception 'La administradora gerencia.operaciones@icscode.com.co no existe o no está activa: se cancela la limpieza';
  end if;
end $$;

-- 1) Datos de negocio: primero los detalles y al final los maestros
delete from public.workflow_historial;
delete from public.auditoria_logs_cambios;
delete from public.auditoria_logs;
delete from public.actividades_tiempos;
delete from public.actividades_tareas;
delete from public.actividades;
delete from public.firmas_adjuntos;
delete from public.firmas_firmantes;
delete from public.firmas;
delete from public.inventario_lineas;
delete from public.inventario;
delete from public.compras_entregas;
delete from public.compras_items;
delete from public.compras;
delete from public.articulos;
delete from public.terceros_cuentas;
delete from public.terceros_direcciones;
delete from public.terceros_contactos;
delete from public.terceros;

-- 2) Empresas (los accesos y la empresa predeterminada de los usuarios se liberan antes)
delete from public.usuarios_empresas;
update public.usuarios set empresa_id = null;
delete from public.empresas;

-- 3) Cuenta anterior (su perfil se elimina en cascada)
delete from auth.users where lower(email) = 'desarrollador1@icscode.com.co';

-- Verificación: una sola cuenta, todo en cero, 5 roles
select (select count(*) from auth.users) as cuentas,
       (select string_agg(email, ', ') from auth.users) as cuenta,
       (select count(*) from public.usuarios) as perfiles,
       (select count(*) from public.empresas) as empresas,
       (select count(*) from public.terceros) as terceros,
       (select count(*) from public.compras) as compras,
       (select count(*) from public.inventario) as inventario,
       (select count(*) from public.auditoria_logs) as auditoria,
       (select count(*) from public.roles) as roles;

commit;
