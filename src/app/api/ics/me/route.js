import { createClient } from '@/lib/supabase/server';
import { buildVCalendar, buildVEvent } from '@/lib/ics';

export async function GET(request) {
  const token = new URL(request.url).searchParams.get('token');

  if (!token) {
    return new Response('Missing token', { status: 400 });
  }

  const supabase = await createClient();

  // An unknown token yields zero rows rather than an error, by design (see the
  // migration) -- distinguishing "bad token" from "no RSVPs" isn't worth the
  // token-enumeration risk for a calendar feed.
  const { data: rows, error } = await supabase.rpc('get_my_ics_feed', { _token: token });

  if (error) {
    return new Response('Server error', { status: 500 });
  }

  const baseUrl = new URL(request.url).origin;
  const vevents = (rows || []).map((row) =>
    buildVEvent({
      event: row,
      venue: row.venue_address_line1
        ? {
            address_line1: row.venue_address_line1,
            address_line2: row.venue_address_line2,
            city: row.venue_city,
            region: row.venue_region,
            postal_code: row.venue_postal_code,
          }
        : null,
      baseUrl,
    })
  );

  const ics = buildVCalendar(vevents);

  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="my-events.ics"',
    },
  });
}
