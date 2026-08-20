function compactUtcDate(isoString) {
  return new Date(isoString).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function calendarLocation(event, venue) {
  if (venue?.address_line1) {
    return [
      venue.address_line1,
      venue.address_line2,
      [venue.city, venue.region, venue.postal_code].filter(Boolean).join(', '),
    ]
      .filter(Boolean)
      .join(', ');
  }

  return [event.location_label, event.neighborhood, event.cross_streets, event.city].filter(Boolean).join(', ');
}

export function eventCalendarLinks({ event, venue, eventUrl, icsUrl }) {
  const location = calendarLocation(event, venue);
  const end = event.ends_at || new Date(new Date(event.starts_at).getTime() + 2 * 60 * 60 * 1000).toISOString();
  const details = [event.description, eventUrl].filter(Boolean).join('\n\n');

  const google = new URL('https://calendar.google.com/calendar/render');
  google.searchParams.set('action', 'TEMPLATE');
  google.searchParams.set('text', event.title);
  google.searchParams.set('dates', `${compactUtcDate(event.starts_at)}/${compactUtcDate(end)}`);
  if (details) google.searchParams.set('details', details);
  if (location) google.searchParams.set('location', location);

  const outlook = new URL('https://outlook.live.com/calendar/0/deeplink/compose');
  outlook.searchParams.set('path', '/calendar/action/compose');
  outlook.searchParams.set('rru', 'addevent');
  outlook.searchParams.set('subject', event.title);
  outlook.searchParams.set('startdt', new Date(event.starts_at).toISOString());
  outlook.searchParams.set('enddt', new Date(end).toISOString());
  if (details) outlook.searchParams.set('body', details);
  if (location) outlook.searchParams.set('location', location);

  return { google: google.toString(), outlook: outlook.toString(), ics: icsUrl };
}
