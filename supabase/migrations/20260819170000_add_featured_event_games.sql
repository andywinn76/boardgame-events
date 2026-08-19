alter table public.events
  add column featured_games_enabled boolean not null default false;

create table public.games (
  id uuid primary key default gen_random_uuid(),
  bgg_id integer not null unique check (bgg_id > 0),
  name text not null check (char_length(name) between 1 and 200),
  year_published smallint,
  min_players smallint,
  max_players smallint,
  playtime_minutes integer,
  weight numeric(3, 2),
  thumbnail_url text,
  image_url text,
  synced_at timestamptz not null default now()
);

create table public.event_games (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  sort_order smallint not null check (sort_order between 0 and 4),
  created_at timestamptz not null default now(),
  unique (event_id, game_id),
  unique (event_id, sort_order)
);

create index event_games_event_id_idx on public.event_games(event_id, sort_order);

alter table public.games enable row level security;
alter table public.event_games enable row level security;

create policy "games are readable" on public.games for select using (true);

create policy "featured games follow event visibility" on public.event_games for select using (
  exists (
    select 1
    from public.events e
    where e.id = event_games.event_id
      and (
        (e.status in ('published', 'cancelled', 'completed') and e.visibility in ('public', 'unlisted'))
        or e.created_by = auth.uid()
        or public.is_event_host(e.id)
        or exists (
          select 1
          from public.event_invites i
          where i.event_id = e.id and i.claimed_by = auth.uid()
        )
        or public.has_role(auth.uid(), 'admin')
      )
  )
);

grant select on public.games, public.event_games to anon, authenticated;

create or replace function public.set_event_featured_games(_event uuid, _games jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _game jsonb;
  _game_id uuid;
  _position integer := 0;
begin
  if not public.is_event_host(_event) and not public.has_role(auth.uid(), 'admin') then
    raise exception 'Only an event host can update featured games';
  end if;

  if jsonb_typeof(_games) <> 'array' then
    raise exception 'Featured games must be an array';
  end if;

  if jsonb_array_length(_games) > 5 then
    raise exception 'An event can feature at most 5 games';
  end if;

  delete from public.event_games where event_id = _event;

  for _game in select value from jsonb_array_elements(_games)
  loop
    if coalesce((_game ->> 'bgg_id')::integer, 0) <= 0
      or nullif(btrim(_game ->> 'name'), '') is null then
      raise exception 'Invalid featured game';
    end if;

    insert into public.games (
      bgg_id,
      name,
      year_published,
      min_players,
      max_players,
      playtime_minutes,
      weight,
      thumbnail_url,
      image_url,
      synced_at
    )
    values (
      (_game ->> 'bgg_id')::integer,
      _game ->> 'name',
      nullif(_game ->> 'year_published', '')::smallint,
      nullif(_game ->> 'min_players', '')::smallint,
      nullif(_game ->> 'max_players', '')::smallint,
      nullif(_game ->> 'playtime_minutes', '')::integer,
      nullif(_game ->> 'weight', '')::numeric(3, 2),
      nullif(_game ->> 'thumbnail_url', ''),
      nullif(_game ->> 'image_url', ''),
      now()
    )
    on conflict (bgg_id) do update set
      name = excluded.name,
      year_published = excluded.year_published,
      min_players = excluded.min_players,
      max_players = excluded.max_players,
      playtime_minutes = excluded.playtime_minutes,
      weight = excluded.weight,
      thumbnail_url = excluded.thumbnail_url,
      image_url = excluded.image_url,
      synced_at = excluded.synced_at
    returning id into _game_id;

    insert into public.event_games (event_id, game_id, sort_order)
    values (_event, _game_id, _position);

    _position := _position + 1;
  end loop;

  update public.events
  set featured_games_enabled = true
  where id = _event;
end;
$$;

revoke all on function public.set_event_featured_games(uuid, jsonb) from public;
grant execute on function public.set_event_featured_games(uuid, jsonb) to authenticated;
