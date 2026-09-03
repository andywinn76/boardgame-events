-- Public profile avatars with writes restricted to each authenticated user's folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "users can read their own avatar metadata"
on storage.objects for select
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "users can upload their own avatar"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "users can update their own avatar"
on storage.objects for update
to authenticated
using (
  bucket_id = 'avatars'
  and owner_id = (select auth.uid()::text)
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "users can delete their own avatar"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars'
  and owner_id = (select auth.uid()::text)
);

drop function public.get_my_profile();

create function public.get_my_profile()
returns table (
  username extensions.citext,
  first_name text,
  last_name text,
  preferred_pronouns text,
  bio text,
  games_yes_please text,
  games_no_thanks text,
  avatar_url text
)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select p.username, p.first_name, p.last_name, p.preferred_pronouns,
         p.bio, p.games_yes_please, p.games_no_thanks, p.avatar_url
  from public.profiles p
  where p.id = auth.uid();
$$;

revoke all on function public.get_my_profile() from public;
grant execute on function public.get_my_profile() to authenticated;
