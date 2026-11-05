begin;
create function private.valid_member_sessions(p_available text[],p_main text)
returns boolean language sql immutable set search_path='' as $$
 select p_available is not null
 and coalesce(array_ndims(p_available),1)=1
 and not exists(select 1 from unnest(p_available) s where s is null or s not in ('vocal','guitar1','guitar2','bass','drums','keyboard','other'))
 and cardinality(p_available)=(select count(distinct s) from unnest(p_available) s)
 and ((cardinality(p_available)=0 and p_main is null) or (cardinality(p_available)>0 and p_main is not null and p_main=any(p_available)));
$$;
revoke all on function private.valid_member_sessions(text[],text) from public,anon;
grant execute on function private.valid_member_sessions(text[],text) to authenticated,service_role;
alter table public.band_memberships
 add column available_sessions text[] not null default '{}',
 add column main_session text,
 add constraint band_member_sessions_valid check(private.valid_member_sessions(available_sessions,main_session));

create function public.set_my_band_sessions(p_band_id uuid,p_available text[],p_main text)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); canonical text[];
begin
 if actor is null or not exists(select 1 from public.band_memberships where band_id=p_band_id and user_id=actor) then
  raise exception 'Band membership required' using errcode='42501';
 end if;
 if private.valid_member_sessions(p_available,p_main) is distinct from true then
  raise exception 'Choose valid sessions and exactly one main position' using errcode='22023';
 end if;
 select coalesce(array_agg(s order by n),'{}') into canonical from unnest(array['vocal','guitar1','guitar2','bass','drums','keyboard','other']) with ordinality as options(s,n) where s=any(p_available);
 update public.band_memberships set available_sessions=canonical,main_session=p_main where band_id=p_band_id and user_id=actor;
 if not found then raise exception 'Band membership required' using errcode='42501'; end if;
end; $$;
revoke all on function public.set_my_band_sessions(uuid,text[],text) from public,anon,authenticated;
grant execute on function public.set_my_band_sessions(uuid,text[],text) to authenticated;
commit;
