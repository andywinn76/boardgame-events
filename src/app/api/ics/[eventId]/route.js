import { createClient } from '@/lib/supabase/server';
import { buildVCalendar, buildVEvent } from '@/lib/ics';

export async function GET(request, { params }) {
  const { eventId } = await params;
  const supabase = await createClient();

  const { data: event } = await supabase
    .from('events')
    .select(
      'id, slug, title, description, starts_at, ends_at, status, location_label, neighborhood, cross_streets, city, venue_id, updated_at'
    )
    .eq('id', eventId)
    .single();

  if (!event) {
    return new Response('Not found', { status: 404 });
  }

  // RLS-gated, same as the event detail page -- resolves to the exact address only
  // for hosts/RSVP'd attendees, falls back to the coarse public fields otherwise.
  const { data: venue } = event.venue_id
    ? await supabase
        .from('venues')
        .select('address_line1, address_line2, city, region, postal_code')
        .eq('id', event.venue_id)
        .maybeSingle()
    : { data: null };

  const baseUrl = new URL(request.url).origin;
  const ics = buildVCalendar([buildVEvent({ event, venue, baseUrl })]);

  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${event.slug || event.id}.ics"`,
    },
  });
}
