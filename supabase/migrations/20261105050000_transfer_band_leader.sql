create function public.transfer_band_leader(p_band_id uuid,p_target uuid)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid();
begin
 -- Serialize handovers in this band and recheck authority after acquiring lock.
 perform 1 from public.bands where id=p_band_id for update;
 if actor is null or not exists(select 1 from public.band_memberships where band_id=p_band_id and user_id=actor and band_role='leader') then
  raise exception 'Leader required' using errcode='42501';
 end if;
 if p_target is null or p_target=actor or not exists(select 1 from public.band_memberships where band_id=p_band_id and user_id=p_target and band_role='member') then
  raise exception 'Choose a member of this band' using errcode='22023';
 end if;
 update public.band_memberships set band_role=case when user_id=p_target then 'leader' else 'member' end
 where band_id=p_band_id and user_id in (actor,p_target);
end; $$;
revoke all on function public.transfer_band_leader(uuid,uuid) from public,anon;
grant execute on function public.transfer_band_leader(uuid,uuid) to authenticated;
