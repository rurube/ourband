-- An account may exist before its first band membership.
create function public.auth_register_account(p_user uuid,p_email text,p_login_id text,p_recovery_hash text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_login_id is null or p_login_id !~ '^[A-Za-z0-9][A-Za-z0-9_.-]{3,29}$' or p_recovery_hash is null or length(p_recovery_hash)<>64 then raise exception 'Invalid account'; end if;
 insert into public.profiles(id,login_id) values(p_user,p_login_id);
 insert into private.account_mapping(auth_user_id,internal_login_email,login_id_normalized,recovery_hash)
 values(p_user,p_email,lower(p_login_id),p_recovery_hash);
end; $$;
revoke all on function public.auth_register_account(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.auth_register_account(uuid,text,text,text) to service_role;
