import { formatInTimeZone } from 'date-fns-tz';

// RFC 5545 3.3.11 escaping -- backslash first, or the later replacements double-escape.
function escapeText(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

// Fold lines over 75 chars per RFC 5545 3.1 -- continuation lines start with a space.
function foldLine(line) {
  if (line.length <= 75) return line;
  const parts = [];
  let rest = line;
  while (rest.length > 75) {
    parts.push(rest.slice(0, 75));
    rest = ' ' + rest.slice(75);
  }
  parts.push(rest);
  return parts.join('\r\n');
}

function utcStamp(isoString) {
  return formatInTimeZone(new Date(isoString), 'UTC', "yyyyMMdd'T'HHmmss'Z'");
}

// Prefers the exact venue address; falls back to the event's coarse public fields
// (docs/architecture.md "Two-layer location") -- `venue` is only non-null here when
// RLS actually resolved it for the caller, so this never leaks a gated address.
export function locationText(event, venue) {
  if (venue?.address_line1) {
    return [venue.address_line1, venue.address_line2, [venue.city, venue.region, venue.postal_code].filter(Boolean).join(', ')]
      .filter(Boolean)
      .join(', ');
  }
  return [event.location_label, event.neighborhood, event.cross_streets, event.city].filter(Boolean).join(', ');
}

export function buildVEvent({ event, venue, baseUrl }) {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${event.id}@boardgame-events`,
    `DTSTAMP:${utcStamp(new Date().toISOString())}`,
    `DTSTART:${utcStamp(event.starts_at)}`,
  ];

  if (event.ends_at) {
    lines.push(`DTEND:${utcStamp(event.ends_at)}`);
  }

  lines.push(`SUMMARY:${escapeText(event.title)}`);

  if (event.description) {
    lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  }

  const location = locationText(event, venue);
  if (location) {
    lines.push(`LOCATION:${escapeText(location)}`);
  }

  if (event.slug && baseUrl) {
    lines.push(`URL:${baseUrl}/events/${event.slug}`);
  }

  lines.push(`STATUS:${event.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`);
  // Bumped from updated_at rather than a separate counter -- any edit that changes
  // updated_at (time, location, cancellation) produces a higher SEQUENCE, which is
  // what makes calendar clients apply the update instead of ignoring it.
  lines.push(`SEQUENCE:${Math.floor(new Date(event.updated_at).getTime() / 1000)}`);
  lines.push('END:VEVENT');

  return lines;
}

export function buildVCalendar(vevents, { name } = {}) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//boardgame-events//EN',
    'CALSCALE:GREGORIAN',
    ...(name ? [`X-WR-CALNAME:${escapeText(name)}`] : []),
    ...vevents.flat(),
    'END:VCALENDAR',
  ];

  return lines.map(foldLine).join('\r\n') + '\r\n';
}
