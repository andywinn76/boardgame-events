import { createClient } from '@/lib/supabase/server';
import {
  buildEventGeocodeQuery,
  buildVenueGeocodeQuery,
  geocodeQuery,
  isGeocodingConfigured,
} from '@/lib/geocoding';

export async function POST(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: 'Sign in to preview a venue map.' }, { status: 401 });
  }

  if (!isGeocodingConfigured()) {
    return Response.json(
      { error: 'Venue map previews are not configured yet.' },
      { status: 503 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'The location details could not be read.' }, { status: 400 });
  }

  let query;
  if (body.type === 'event' && body.venueId) {
    const { data: venue } = await supabase
      .from('venues')
      .select('name, address_line1, address_line2, city, region, postal_code, cross_streets, lat, lng, google_place_id')
      .eq('id', String(body.venueId).slice(0, 100))
      .maybeSingle();

    if (!venue) {
      return Response.json({ error: 'The selected venue could not be read.' }, { status: 404 });
    }

    if (venue.lat != null && venue.lng != null) {
      return Response.json({
        lat: Number(venue.lat),
        lng: Number(venue.lng),
        placeId: venue.google_place_id || null,
        formattedAddress: [venue.name, venue.address_line1, venue.city, venue.region, venue.postal_code]
          .filter(Boolean)
          .join(', '),
      });
    }

    query = buildVenueGeocodeQuery({
      addressLine1: venue.address_line1,
      addressLine2: venue.address_line2,
      city: venue.city,
      region: venue.region,
      postalCode: venue.postal_code,
      crossStreets: venue.cross_streets,
    });
  } else {
    query = body.type === 'event'
      ? buildEventGeocodeQuery(body)
      : buildVenueGeocodeQuery(body);
  }

  if (!query) {
    return Response.json(
      { error: 'Enter a street address or cross streets before previewing the map.' },
      { status: 400 }
    );
  }

  try {
    const result = await geocodeQuery(query);
    if (!result) {
      return Response.json(
        { error: 'No map location was found. Check the address, city, and state or region.' },
        { status: 404 }
      );
    }
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error.message || 'The venue map preview could not be generated.' },
      { status: 502 }
    );
  }
}
