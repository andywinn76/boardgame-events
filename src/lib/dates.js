import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';

// A short, curated list is enough for a regional game-night app; add more as hosts need them.
export const SUPPORTED_TIMEZONES = [
  { value: 'America/Los_Angeles', label: 'Pacific' },
  { value: 'America/Denver', label: 'Mountain' },
  { value: 'America/Chicago', label: 'Central' },
  { value: 'America/New_York', label: 'Eastern' },
];

// datetime-local inputs give wall-clock strings with no offset ("2026-08-20T18:00");
// interpret that string as local time in `timeZone` and return the UTC instant.
export function zonedInputToUtc(datetimeLocalValue, timeZone) {
  return fromZonedTime(datetimeLocalValue, timeZone);
}

// Always render in the event's own timezone, never the viewer's. A 7pm game
// night is 7pm local no matter who's looking.
export function formatEventTime(isoString, timeZone, formatStr = 'EEE, MMM d, yyyy · h:mm a zzz') {
  return formatInTimeZone(new Date(isoString), timeZone, formatStr);
}

export function formatDateTimeInput(isoString, timeZone) {
  return isoString ? formatInTimeZone(new Date(isoString), timeZone, "yyyy-MM-dd'T'HH:mm") : '';
}
