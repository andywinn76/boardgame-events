'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { zonedInputToUtc } from '@/lib/dates';

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
    })
    .select('slug')
    .single();

  if (error) {
    redirect(`/events/new?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/events/${event.slug}`);
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
