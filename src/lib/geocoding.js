const OPENCAGE_GEOCODING_URL = 'https://api.opencagedata.com/geocode/v1/json';

function cleanPart(value, maxLength = 200) {
  return String(value || '').trim().slice(0, maxLength);
}

export function buildVenueGeocodeQuery({
  addressLine1,
  addressLine2,
  city,
  region,
  postalCode,
  crossStreets,
}) {
  const streetOrIntersection = cleanPart(addressLine1) || cleanPart(crossStreets);
  if (!streetOrIntersection) return null;

  return [
    streetOrIntersection,
    addressLine1 ? cleanPart(addressLine2) : '',
    cleanPart(city),
    cleanPart(region),
    cleanPart(postalCode),
  ]
    .filter(Boolean)
    .join(', ');
}

export function buildEventGeocodeQuery({ crossStreets, city, region, neighborhood }) {
  const intersection = cleanPart(crossStreets);
  if (!intersection) return null;

  return [intersection, cleanPart(city) || cleanPart(neighborhood), cleanPart(region)]
    .filter(Boolean)
    .join(', ');
}

export function isGeocodingConfigured() {
  return Boolean(process.env.OPENCAGE_API_KEY);
}

export async function geocodeQuery(query) {
  if (!query || !isGeocodingConfigured()) return null;

  const params = new URLSearchParams({
    q: query,
    key: process.env.OPENCAGE_API_KEY,
    limit: '1',
    no_annotations: '1',
    no_record: '1',
  });
  const response = await fetch(`${OPENCAGE_GEOCODING_URL}?${params}`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('The geocoding service could not process this location.');
  }

  const payload = await response.json();
  const match = payload.results?.[0];
  const lat = Number(match?.geometry?.lat);
  const lng = Number(match?.geometry?.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return {
    lat,
    lng,
    placeId: null,
    formattedAddress: match.formatted || query,
    confidence: Number.isFinite(Number(match.confidence)) ? Number(match.confidence) : null,
  };
}
