'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { zonedInputToUtc } from '@/lib/dates';
import { getBggGames } from '@/lib/bgg';
import {
  buildEventGeocodeQuery,
  buildVenueGeocodeQuery,
  geocodeQuery,
  isGeocodingConfigured,
} from '@/lib/geocoding';

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

function venueLocationFromForm(formData) {
  return {
    addressLine1: String(formData.get('new_venue_address_line1') || '').trim(),
    addressLine2: String(formData.get('new_venue_address_line2') || '').trim(),
    city: String(formData.get('new_venue_city') || '').trim(),
    region: String(formData.get('new_venue_region') || '').trim(),
    postalCode: String(formData.get('new_venue_postal_code') || '').trim(),
    neighborhood: String(formData.get('new_venue_neighborhood') || '').trim(),
    crossStreets: String(formData.get('new_venue_cross_streets') || '').trim(),
  };
}

function eventLocationFromForm(formData) {
  return {
    locationLabel: String(formData.get('location_label') || '').trim(),
    neighborhood: String(formData.get('neighborhood') || '').trim(),
    crossStreets: String(formData.get('cross_streets') || '').trim(),
    city: String(formData.get('city') || '').trim(),
    region: String(formData.get('region') || '').trim(),
  };
}

function manualCoordinatesFromForm(formData) {
  const latRaw = String(formData.get('new_venue_lat') || '').trim();
  const lngRaw = String(formData.get('new_venue_lng') || '').trim();
  if (!latRaw && !lngRaw) return null;
  if (!latRaw || !lngRaw) throw new Error('Enter both latitude and longitude, or leave both blank.');

  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new Error('Enter valid latitude and longitude coordinates.');
  }
  return { lat, lng, placeId: null };
}

async function geocodeWhenConfigured(query) {
  if (!query || !isGeocodingConfigured()) return null;
  const result = await geocodeQuery(query);
  if (!result) {
    throw new Error('No map location was found. Check the address, city, and state or region.');
  }
  return result;
}

async function geocodeSavedVenueIfNeeded(supabase, venueId, userId) {
  if (!venueId || !isGeocodingConfigured()) return;

  const { data: venue } = await supabase
    .from('venues')
    .select('id, created_by, address_line1, address_line2, city, region, postal_code, cross_streets, lat, lng')
    .eq('id', venueId)
    .maybeSingle();

  if (!venue || venue.created_by !== userId || (venue.lat != null && venue.lng != null)) return;

  const location = await geocodeWhenConfigured(buildVenueGeocodeQuery({
    addressLine1: venue.address_line1,
    addressLine2: venue.address_line2,
    city: venue.city,
    region: venue.region,
    postalCode: venue.postal_code,
    crossStreets: venue.cross_streets,
  }));
  if (!location) return;

  const { error } = await supabase
    .from('venues')
    .update({ lat: location.lat, lng: location.lng, google_place_id: location.placeId })
    .eq('id', venueId)
    .eq('created_by', userId);
  if (error) throw new Error('The saved venue coordinates could not be updated.');
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
    redirect('/login?next=%2Fevents%2Fnew&reason=host');
  }

  const title = formData.get('title');
  const timezone = formData.get('timezone');
  const startsAtLocal = formData.get('starts_at');
  const endsAtLocal = formData.get('ends_at');
  const seatLimitRaw = formData.get('seat_limit');
  const featuredGamesEnabled = formData.get('featured_games_enabled') === 'on';
  const allowPlusOnes = formData.get('allow_plus_ones') === 'on';
  const maxGuestsPerRsvp = Number(formData.get('max_guests_per_rsvp') || 1);

  if (!Number.isInteger(maxGuestsPerRsvp) || maxGuestsPerRsvp < 1 || maxGuestsPerRsvp > 10) {
    redirect(`/events/new?error=${encodeURIComponent('Choose a guest limit between one and ten.')}`);
  }

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

  let venueId = String(formData.get('venue_id') || '').trim() || null;
  const eventLocation = eventLocationFromForm(formData);
  let eventCoordinates = null;

  if (venueId) {
    try {
      await geocodeSavedVenueIfNeeded(supabase, venueId, user.id);
    } catch (geocodingError) {
      redirect(`/events/new?error=${encodeURIComponent(geocodingError.message)}`);
    }
  }

  const newVenueName = String(formData.get('new_venue_name') || '').trim();
  if (!venueId && newVenueName) {
    const venueLocation = venueLocationFromForm(formData);
    let coordinates;
    try {
      coordinates = manualCoordinatesFromForm(formData)
        || await geocodeWhenConfigured(buildVenueGeocodeQuery(venueLocation));
    } catch (geocodingError) {
      redirect(`/events/new?error=${encodeURIComponent(geocodingError.message)}`);
    }

    const { data: venue, error: venueError } = await supabase
      .from('venues')
      .insert({
        created_by: user.id,
        name: newVenueName,
        kind: formData.get('new_venue_kind') || 'public_venue',
        is_shared: formData.get('new_venue_is_shared') === 'on',
        address_line1: venueLocation.addressLine1 || null,
        address_line2: venueLocation.addressLine2 || null,
        city: venueLocation.city || null,
        region: venueLocation.region || null,
        postal_code: venueLocation.postalCode || null,
        neighborhood: venueLocation.neighborhood || null,
        cross_streets: venueLocation.crossStreets || null,
        lat: coordinates?.lat ?? null,
        lng: coordinates?.lng ?? null,
        google_place_id: coordinates?.placeId ?? null,
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

  if (!venueId) {
    try {
      eventCoordinates = await geocodeWhenConfigured(buildEventGeocodeQuery(eventLocation));
    } catch (geocodingError) {
      redirect(`/events/new?error=${encodeURIComponent(geocodingError.message)}`);
    }
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
      location_label: eventLocation.locationLabel || null,
      neighborhood: eventLocation.neighborhood || null,
      cross_streets: eventLocation.crossStreets || null,
      city: eventLocation.city || null,
      region: eventLocation.region || null,
      ...(!venueId ? {
        approx_lat: eventCoordinates?.lat ?? null,
        approx_lng: eventCoordinates?.lng ?? null,
      } : {}),
      seat_limit: seatLimitRaw ? Number(seatLimitRaw) : null,
      allow_waitlist: formData.get('allow_waitlist') === 'on',
      allow_plus_ones: allowPlusOnes,
      max_guests_per_rsvp: maxGuestsPerRsvp,
      featured_games_enabled: featuredGamesEnabled,
    })
    .select('id, slug')
    .single();

  if (error) {
    redirect(`/events/new?error=${encodeURIComponent(error.message)}`);
  }

  const { error: hostRsvpError } = await supabase.rpc('rsvp_to_event', {
    _event: event.id,
    _seats: 1,
  });

  if (hostRsvpError) {
    redirect(`/events/${event.slug}?error=${encodeURIComponent(`Event created, but organizer attendance could not be saved: ${hostRsvpError.message}`)}`);
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
  const allowPlusOnes = formData.get('allow_plus_ones') === 'on';
  const maxGuestsPerRsvp = Number(formData.get('max_guests_per_rsvp') || 1);

  if (!eventId || !slug || !title || !timezone || !startsAtLocal) {
    redirect(`/events/${slug}/edit?error=${encodeURIComponent('Title, date/time, and timezone are required')}`);
  }

  if (!Number.isInteger(maxGuestsPerRsvp) || maxGuestsPerRsvp < 1 || maxGuestsPerRsvp > 10) {
    redirect(`/events/${slug}/edit?error=${encodeURIComponent('Choose a guest limit between one and ten.')}`);
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

  const venueId = String(formData.get('venue_id') || '').trim() || null;
  const eventLocation = eventLocationFromForm(formData);
  let eventCoordinates = null;
  try {
    if (venueId) {
      await geocodeSavedVenueIfNeeded(supabase, venueId, user.id);
    } else {
      eventCoordinates = await geocodeWhenConfigured(buildEventGeocodeQuery(eventLocation));
    }
  } catch (geocodingError) {
    redirect(`/events/${slug}/edit?error=${encodeURIComponent(geocodingError.message)}`);
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
      venue_id: venueId,
      location_label: eventLocation.locationLabel || null,
      neighborhood: eventLocation.neighborhood || null,
      cross_streets: eventLocation.crossStreets || null,
      city: eventLocation.city || null,
      region: eventLocation.region || null,
      ...(!venueId ? {
        approx_lat: eventCoordinates?.lat ?? null,
        approx_lng: eventCoordinates?.lng ?? null,
      } : {}),
      seat_limit: seatLimitRaw ? Number(seatLimitRaw) : null,
      allow_waitlist: formData.get('allow_waitlist') === 'on',
      allow_plus_ones: allowPlusOnes,
      max_guests_per_rsvp: maxGuestsPerRsvp,
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
  const guestCount = Number(formData.get('guest_count') || 0);

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/events/${slug}`)}&reason=rsvp`);
  }

  if (!Number.isInteger(guestCount) || guestCount < 0 || guestCount > 10) {
    redirect(`/events/${slug}?error=${encodeURIComponent('Choose between zero and ten guests.')}`);
  }

  const { error } = await supabase.rpc('rsvp_to_event', {
    _event: eventId,
    _seats: guestCount + 1,
  });

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

  const slug = formData.get('slug');
  const eventId = formData.get('event_id');
  const body = formData.get('body');

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/events/${slug}`)}&reason=message`);
  }

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

  const slug = formData.get('slug');
  const eventId = formData.get('event_id');
  const subjectUser = formData.get('subject_user');
  const reason = formData.get('reason');

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/events/${slug}`)}&reason=report`);
  }

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
