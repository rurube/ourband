-- Rename only the requested band, using the caller's actual membership.
create function public.rename_band(p_band_id uuid,p_name text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.band_memberships where band_id=p_band_id and user_id=(select auth.uid()) and band_role='leader') then
  raise exception 'Leader required' using errcode='42501';
 end if;
 if p_name is null or length(btrim(p_name)) not between 1 and 60 or p_name ~ '[[:cntrl:]]' then
  raise exception 'Band name must contain 1 to 60 characters' using errcode='22023';
 end if;
 update public.bands set name=btrim(p_name) where id=p_band_id;
end; $$;
revoke all on function public.rename_band(uuid,text) from public,anon;
grant execute on function public.rename_band(uuid,text) to authenticated;
