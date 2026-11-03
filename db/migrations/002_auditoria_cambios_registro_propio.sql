-- ¿El evento de auditoría <lid> lo registró el usuario actual? (security definer: no depende de que pueda leer la auditoría)
create or replace function app.es_mi_log(lid text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.auditoria_logs l
    where l.id = lid and l.usuario_id = (select auth.uid())::text
  );
$$;
revoke all on function app.es_mi_log(text) from public, anon;
grant execute on function app.es_mi_log(text) to authenticated;

-- Las políticas permisivas se combinan con OR: esta política permite registrar el detalle de los propios eventos
create policy registrar_propio on public.auditoria_logs_cambios for insert to authenticated
  with check (app.es_mi_log(log_id));
