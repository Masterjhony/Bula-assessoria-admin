-- ===========================================================================
-- Melhorias no fluxo de autenticacao / profiles
-- ===========================================================================

-- iniciais_from_nome: agora ignora particulas (da, do, de, dos, das, e, von, del)
create or replace function public.iniciais_from_nome(nome text)
returns text language sql immutable as $$
  select upper(
    coalesce(
      (
        select string_agg(left(p, 1), '')
        from (
          select p from (
            select unnest(string_to_array(trim(nome), ' ')) as p
          ) s
          where length(p) > 0
            and lower(p) not in ('da','do','de','dos','das','e','y','von','del','la','le')
          limit 2
        ) s2
      ),
      upper(left(trim(nome), 2))
    )
  )
$$;

-- handle_new_user: torna robusto a nome vazio/null
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_nome text;
  v_iniciais text;
begin
  v_nome := nullif(trim(coalesce(new.raw_user_meta_data->>'nome', '')), '');
  if v_nome is null or v_nome = '' then
    v_nome := split_part(new.email, '@', 1);
  end if;
  v_iniciais := coalesce(nullif(public.iniciais_from_nome(v_nome), ''), '?');
  insert into public.profiles (id, nome, iniciais)
  values (new.id, v_nome, v_iniciais)
  on conflict (id) do update set nome = excluded.nome, iniciais = excluded.iniciais;
  return new;
exception when others then
  -- nunca derrubar o signup por causa do profile; loga e segue
  raise warning 'handle_new_user falhou para %: %', new.id, sqlerrm;
  return new;
end $$;

-- Re-aplica trigger
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill: regenera iniciais para perfis existentes
update public.profiles
   set iniciais = coalesce(nullif(public.iniciais_from_nome(nome), ''), '?')
 where nome is not null;
