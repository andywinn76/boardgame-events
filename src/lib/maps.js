// Precise link for anyone who can read the venue row (exact lat/lng or a place id).
// Never build this from event.approx_lat/approx_lng -- those are the public,
// possibly-jittered coordinates; a "precise" link needs the real venue data.
export function venueMapUrl(venue) {
  if (!venue) return null;
  if (venue.google_place_id) {
    return `https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(venue.google_place_id)}`;
  }
  if (venue.lat != null && venue.lng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${venue.lat},${venue.lng}`;
  }
  const query = [venue.name, venue.address_line1, venue.city, venue.region, venue.postal_code].filter(Boolean).join(', ');
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null;
}

// Coarse link for everyone else: a text search on cross streets + city rather
// than a pin, so it never resolves to an exact address.
export function coarseMapUrl({ locationLabel, neighborhood, crossStreets, city }) {
  const query = [locationLabel, neighborhood, crossStreets, city].filter(Boolean).join(', ');
  if (!query) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
