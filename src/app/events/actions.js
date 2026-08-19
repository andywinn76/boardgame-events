'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { zonedInputToUtc } from '@/lib/dates';
import { getBggGames } from '@/lib/bgg';

function slugify(title) {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  const suffix = crypto.randomUUID().slice(0, 8);
  return `${base}-${suffix}`;
}

function parseFeaturedGameIds(formData) {
  let parsedIds;
  try {
    parsedIds = JSON.parse(String(formData.get('featured_games') || '[]'));
  } catch {
    throw new Error('Featured games could not be read. Please select them again.');
  }

  if (!Array.isArray(parsedIds)) {
    throw new Error('Featured games could not be read. Please select them again.');
  }

  const ids = [...new Set(parsedIds.map(Number))];
  if (ids.length > 5 || ids.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw new Error('Choose no more than five valid featured games.');
  }
  return ids;
}

async function resolveFeaturedGames(supabase, ids) {
  if (!ids.length) return [];

  const { data: cachedGames } = await supabase
    .from('games')
    .select(
      'bgg_id, name, year_published, min_players, max_players, playtime_minutes, weight, thumbnail_url, image_url'
    )
    .in('bgg_id', ids);
  const byId = new Map((cachedGames || []).map((game) => [game.bgg_id, game]));
  const missingIds = ids.filter((id) => !byId.has(id));

  if (missingIds.length) {
    const fetchedGames = await getBggGames(missingIds);
    fetchedGames.forEach((game) => byId.set(game.bgg_id, game));
  }

  const games = ids.map((id) => byId.get(id)).filter(Boolean);
  if (games.length !== ids.length) {
    throw new Error('One or more featured games could not be verified with BoardGameGeek.');
  }
  return games;
}

export async function createEvent(formData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const title = formData.get('title');
  const timezone = formData.get('timezone');
  const startsAtLocal = formData.get('starts_at');
  const endsAtLocal = formData.get('ends_at');
  const seatLimitRaw = formData.get('seat_limit');
  const featuredGamesEnabled = formData.get('featured_games_enabled') === 'on';

  let featuredGameIds;
  try {
    featuredGameIds = parseFeaturedGameIds(formData);
  } catch (featuredGamesError) {
    redirect(`/events/new?error=${encodeURIComponent(featuredGamesError.message)}`);
  }

  let featuredGames = [];
  if (featuredGamesEnabled && featuredGameIds.length > 0) {
    try {
      featuredGames = await resolveFeaturedGames(supabase, featuredGameIds);
    } catch (bggError) {
      redirect(`/events/new?error=${encodeURIComponent(bggError.message)}`);
    }
  }

  if (!title || !timezone || !startsAtLocal) {
    redirect(`/events/new?error=${encodeURIComponent('Title, date/time, and timezone are required')}`);
  }

  let venueId = formData.get('venue_id') || null;

  const newVenueName = formData.get('new_venue_name');
  if (!venueId && newVenueName) {
    const latRaw = formData.get('new_venue_lat');
    const lngRaw = formData.get('new_venue_lng');

    const { data: venue, error: venueError } = await supabase
      .from('venues')
      .insert({
        created_by: user.id,
        name: newVenueName,
        kind: formData.get('new_venue_kind') || 'public_venue',
        is_shared: formData.get('new_venue_is_shared') === 'on',
        address_line1: formData.get('new_venue_address_line1') || null,
        address_line2: formData.get('new_venue_address_line2') || null,
        city: formData.get('new_venue_city') || null,
        region: formData.get('new_venue_region') || null,
        postal_code: formData.get('new_venue_postal_code') || null,
        neighborhood: formData.get('new_venue_neighborhood') || null,
        cross_streets: formData.get('new_venue_cross_streets') || null,
        lat: latRaw ? Number(latRaw) : null,
        lng: lngRaw ? Number(lngRaw) : null,
        access_notes: formData.get('new_venue_access_notes') || null,
        website: formData.get('new_venue_website') || null,
      })
      .select('id')
      .single();

    if (venueError) {
      redirect(`/events/new?error=${encodeURIComponent(venueError.message)}`);
    }

    venueId = venue.id;
  }

  const { data: event, error } = await supabase
    .from('events')
    .insert({
      created_by: user.id,
      slug: slugify(title),
      title,
      description: formData.get('description') || null,
      status: 'published',
      visibility: formData.get('visibility') || 'public',
      starts_at: zonedInputToUtc(startsAtLocal, timezone).toISOString(),
      ends_at: endsAtLocal ? zonedInputToUtc(endsAtLocal, timezone).toISOString() : null,
      timezone,
      venue_id: venueId,
      location_label: formData.get('location_label') || null,
      neighborhood: formData.get('neighborhood') || null,
      cross_streets: formData.get('cross_streets') || null,
      city: formData.get('city') || null,
      seat_limit: seatLimitRaw ? Number(seatLimitRaw) : null,
      allow_waitlist: formData.get('allow_waitlist') === 'on',
      featured_games_enabled: featuredGamesEnabled,
    })
    .select('id, slug')
    .single();

  if (error) {
    redirect(`/events/new?error=${encodeURIComponent(error.message)}`);
  }

  if (featuredGamesEnabled) {
    const { error: featuredGamesError } = await supabase.rpc('set_event_featured_games', {
      _event: event.id,
      _games: featuredGames,
    });

    if (featuredGamesError) {
      redirect(`/events/${event.slug}?error=${encodeURIComponent(`Event created, but featured games could not be saved: ${featuredGamesError.message}`)}`);
    }
  }

  redirect(`/events/${event.slug}`);
}

export async function updateEvent(formData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const eventId = String(formData.get('event_id') || '');
  const slug = String(formData.get('slug') || '');
  const title = String(formData.get('title') || '').trim();
  const timezone = String(formData.get('timezone') || '');
  const startsAtLocal = String(formData.get('starts_at') || '');
  const endsAtLocal = String(formData.get('ends_at') || '');
  const seatLimitRaw = String(formData.get('seat_limit') || '');
  const featuredGamesEnabled = formData.get('featured_games_enabled') === 'on';

  if (!eventId || !slug || !title || !timezone || !startsAtLocal) {
    redirect(`/events/${slug}/edit?error=${encodeURIComponent('Title, date/time, and timezone are required')}`);
  }

  const { data: hostRow } = await supabase
    .from('event_hosts')
    .select('role')
    .eq('event_id', eventId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!hostRow) redirect(`/events/${slug}`);

  let featuredGameIds;
  try {
    featuredGameIds = parseFeaturedGameIds(formData);
  } catch (featuredGamesError) {
    redirect(`/events/${slug}/edit?error=${encodeURIComponent(featuredGamesError.message)}`);
  }

  let featuredGames = [];
  if (featuredGamesEnabled) {
    try {
      featuredGames = await resolveFeaturedGames(supabase, featuredGameIds);
    } catch (bggError) {
      redirect(`/events/${slug}/edit?error=${encodeURIComponent(bggError.message)}`);
    }
  }

  const { error } = await supabase
    .from('events')
    .update({
      title,
      description: String(formData.get('description') || '').trim() || null,
      visibility: formData.get('visibility') || 'public',
      starts_at: zonedInputToUtc(startsAtLocal, timezone).toISOString(),
      ends_at: endsAtLocal ? zonedInputToUtc(endsAtLocal, timezone).toISOString() : null,
      timezone,
      venue_id: formData.get('venue_id') || null,
      location_label: String(formData.get('location_label') || '').trim() || null,
      neighborhood: String(formData.get('neighborhood') || '').trim() || null,
      cross_streets: String(formData.get('cross_streets') || '').trim() || null,
      city: String(formData.get('city') || '').trim() || null,
      seat_limit: seatLimitRaw ? Number(seatLimitRaw) : null,
      allow_waitlist: formData.get('allow_waitlist') === 'on',
      featured_games_enabled: featuredGamesEnabled,
    })
    .eq('id', eventId);

  if (error) {
    redirect(`/events/${slug}/edit?error=${encodeURIComponent(error.message)}`);
  }

  const featuredGamesResult = featuredGamesEnabled
    ? await supabase.rpc('set_event_featured_games', { _event: eventId, _games: featuredGames })
    : await supabase.rpc('disable_event_featured_games', { _event: eventId });

  if (featuredGamesResult.error) {
    redirect(`/events/${slug}/edit?error=${encodeURIComponent(featuredGamesResult.error.message)}`);
  }

  revalidatePath(`/events/${slug}`);
  revalidatePath(`/events/${slug}/manage`);
  redirect(`/events/${slug}?updated=event`);
}

export async function rsvpToEvent(formData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const slug = formData.get('slug');
  const eventId = formData.get('event_id');

  if (!user) {
    redirect('/login');
  }

  const { error } = await supabase.rpc('rsvp_to_event', { _event: eventId });

  if (error) {
    redirect(`/events/${slug}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/events/${slug}`);
}

export async function cancelRsvp(formData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const slug = formData.get('slug');
  const eventId = formData.get('event_id');

  if (!user) {
    redirect('/login');
  }

  const { error } = await supabase.rpc('cancel_rsvp', { _event: eventId });

  if (error) {
    redirect(`/events/${slug}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/events/${slug}`);
}

export async function addCohost(formData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const slug = formData.get('slug');
  const eventId = formData.get('event_id');
  const username = formData.get('username');

  const { error } = await supabase.rpc('add_cohost', { _event: eventId, _username: username });

  if (error) {
    redirect(`/events/${slug}/manage?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/events/${slug}/manage`);
}

export async function removeCohost(formData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const slug = formData.get('slug');
  const eventId = formData.get('event_id');
  const userId = formData.get('user_id');

  const { error } = await supabase.rpc('remove_cohost', { _event: eventId, _user: userId });

  if (error) {
    redirect(`/events/${slug}/manage?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/events/${slug}/manage`);
}

export async function createInvite(formData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const slug = formData.get('slug');
  const eventId = formData.get('event_id');
  const email = formData.get('email');

  const { error } = await supabase.from('event_invites').insert({
    event_id: eventId,
    email: email || null,
    invited_by: user.id,
  });

  if (error) {
    redirect(`/events/${slug}/manage?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/events/${slug}/manage`);
}

export async function postMessage(formData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const slug = formData.get('slug');
  const eventId = formData.get('event_id');
  const body = formData.get('body');

  if (!body?.trim()) {
    redirect(`/events/${slug}?error=${encodeURIComponent('Message cannot be empty')}`);
  }

  const { error } = await supabase.from('event_messages').insert({
    event_id: eventId,
    user_id: user.id,
    body,
  });

  if (error) {
    redirect(`/events/${slug}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/events/${slug}`);
}

export async function cancelEvent(formData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const slug = formData.get('slug');
  const eventId = formData.get('event_id');
  const reason = formData.get('reason');

  if (!reason?.trim()) {
    redirect(`/events/${slug}/manage?error=${encodeURIComponent('A cancellation reason is required')}`);
  }

  const { error } = await supabase.rpc('cancel_event', { _event: eventId, _reason: reason });

  if (error) {
    redirect(`/events/${slug}/manage?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/events/${slug}`);
  revalidatePath(`/events/${slug}/manage`);
}

export async function completeEvent(formData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const slug = formData.get('slug');
  const eventId = formData.get('event_id');

  const { error } = await supabase.rpc('complete_event', { _event: eventId });

  if (error) {
    redirect(`/events/${slug}/manage?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/events/${slug}/manage`);
}

export async function setCheckin(formData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const slug = formData.get('slug');
  const eventId = formData.get('event_id');
  const targetUser = formData.get('user_id');
  const checkedIn = formData.get('checked_in') === 'true';

  const { error } = await supabase.rpc('set_checkin', {
    _event: eventId,
    _user: targetUser,
    _checked_in: checkedIn,
  });

  if (error) {
    redirect(`/events/${slug}/manage?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/events/${slug}/manage`);
}

export async function setNoShow(formData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const slug = formData.get('slug');
  const eventId = formData.get('event_id');
  const targetUser = formData.get('user_id');
  const noShow = formData.get('no_show') === 'true';

  const { error } = await supabase.rpc('set_no_show', {
    _event: eventId,
    _user: targetUser,
    _no_show: noShow,
  });

  if (error) {
    redirect(`/events/${slug}/manage?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/events/${slug}/manage`);
}

export async function reportEvent(formData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const slug = formData.get('slug');
  const eventId = formData.get('event_id');
  const subjectUser = formData.get('subject_user');
  const reason = formData.get('reason');

  if (!reason?.trim()) {
    redirect(`/events/${slug}?error=${encodeURIComponent('A reason is required to report an event')}`);
  }

  const { error } = await supabase.from('reports').insert({
    reporter_id: user.id,
    subject_user: subjectUser || null,
    event_id: eventId,
    reason,
  });

  if (error) {
    redirect(`/events/${slug}?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/events/${slug}?reported=1`);
}
