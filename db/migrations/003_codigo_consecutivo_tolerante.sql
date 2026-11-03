-- El consecutivo solo considera códigos con sufijo numérico (PREFIJO-0001); ignora cualquier otro formato.
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
      'select coalesce(max(substring(codigo from ''-([0-9]+)$'')::int), 0) from public.%I where coalesce(empresa_id, '''') = $1',
      tg_table_name)
      into n using coalesce(new.empresa_id, '');
    new.codigo := tg_argv[0] || '-' || lpad((n + 1)::text, 4, '0');
  end if;
  return new;
end;
$$;
