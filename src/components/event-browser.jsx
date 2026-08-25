'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { LocateFixed, MapPin, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const selectClass =
  'h-8 min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30';

function distanceMiles(origin, event) {
  if (!origin || event.approx_lat == null || event.approx_lng == null) return null;

  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const eventLat = Number(event.approx_lat);
  const eventLng = Number(event.approx_lng);
  const latDelta = toRadians(eventLat - origin.lat);
  const lngDelta = toRadians(eventLng - origin.lng);
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(toRadians(origin.lat)) * Math.cos(toRadians(eventLat)) * Math.sin(lngDelta / 2) ** 2;

  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const involvementLabels = {
  attending: "You're attending",
  hosting: "You're hosting",
  waitlisted: "You're waitlisted",
};

export function EventBrowser({ events, showInvolvementFilters = false }) {
  const [origin, setOrigin] = useState(null);
  const [locationStatus, setLocationStatus] = useState('idle');
  const [radius, setRadius] = useState('any');
  const [openSeatsOnly, setOpenSeatsOnly] = useState(false);
  const [sort, setSort] = useState('soonest');
  const [involvement, setInvolvement] = useState('all');
  const hasWaitlistedEvents = events.some((event) => event.involvement === 'waitlisted');
  const involvementOptions = [
    { value: 'all', shortLabel: 'All', label: 'All events' },
    { value: 'attending', shortLabel: 'Attending', label: "Events I'm attending" },
    { value: 'hosting', shortLabel: 'Hosting', label: "Events I'm hosting" },
    ...(hasWaitlistedEvents
      ? [{ value: 'waitlisted', shortLabel: 'Waitlisted', label: "Events I'm waitlisted for" }]
      : []),
  ];

  function requestLocation() {
    if (!navigator.geolocation) {
      setLocationStatus('unsupported');
      return;
    }

    setLocationStatus('loading');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setOrigin({ lat: coords.latitude, lng: coords.longitude });
        setLocationStatus('ready');
      },
      () => setLocationStatus('denied'),
      { enableHighAccuracy: false, maximumAge: 300000, timeout: 10000 }
    );
  }

  const visibleEvents = useMemo(() => {
    const withDistance = events.map((event) => ({ ...event, distance: distanceMiles(origin, event) }));
    const filtered = withDistance.filter((event) => {
      const hasOpenSeats = event.seat_limit == null || Number(event.seats_left) > 0;
      if (openSeatsOnly && !hasOpenSeats) return false;
      if (involvement !== 'all' && event.involvement !== involvement) return false;
      if (radius !== 'any' && (event.distance == null || event.distance > Number(radius))) return false;
      return true;
    });

    return filtered.sort((a, b) => {
      if (sort === 'nearest') return (a.distance ?? Infinity) - (b.distance ?? Infinity);
      if (sort === 'seats') {
        const aSeats = a.seat_limit == null ? Infinity : Number(a.seats_left);
        const bSeats = b.seat_limit == null ? Infinity : Number(b.seats_left);
        return bSeats - aSeats || new Date(a.starts_at) - new Date(b.starts_at);
      }
      return new Date(a.starts_at) - new Date(b.starts_at);
    });
  }, [events, involvement, openSeatsOnly, origin, radius, sort]);

  return (
    <>
      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            {showInvolvementFilters && (
              <div className="space-y-1.5">
                <p className="text-sm font-medium text-foreground">Show</p>
                <select
                  aria-label="Show events"
                  value={involvement}
                  onChange={(event) => setInvolvement(event.target.value)}
                  className={`${selectClass} sm:hidden`}
                >
                  {involvementOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <div
                  role="group"
                  aria-label="Show events"
                  className="hidden h-8 items-center rounded-lg border border-input bg-background p-0.5 sm:flex"
                >
                  {involvementOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={involvement === option.value}
                      onClick={() => setInvolvement(option.value)}
                      className={cn(
                        'h-6 rounded-md px-2.5 text-xs font-medium transition-colors',
                        involvement === option.value
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                    >
                      {option.shortLabel}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="event-sort">Sort by</Label>
              <select id="event-sort" value={sort} onChange={(event) => setSort(event.target.value)} className={selectClass}>
                <option value="soonest">Soonest</option>
                {origin && <option value="nearest">Nearest</option>}
                <option value="seats">Most seats available</option>
              </select>
            </div>
            {origin && (
              <div className="space-y-1.5">
                <Label htmlFor="event-radius">Distance</Label>
                <select
                  id="event-radius"
                  value={radius}
                  onChange={(event) => setRadius(event.target.value)}
                  className={selectClass}
                >
                  <option value="any">Any distance</option>
                  <option value="5">Within 5 miles</option>
                  <option value="10">Within 10 miles</option>
                  <option value="25">Within 25 miles</option>
                  <option value="50">Within 50 miles</option>
                  <option value="100">Within 100 miles</option>
                </select>
              </div>
            )}
            <Button type="button" variant="outline" size="sm" onClick={requestLocation} disabled={locationStatus === 'loading'}>
              <LocateFixed />
              {locationStatus === 'loading' ? 'Finding location...' : origin ? 'Update location' : 'Use my location'}
            </Button>
            <label className="flex h-8 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={openSeatsOnly}
                onChange={(event) => setOpenSeatsOnly(event.target.checked)}
                className="size-4 rounded border-input accent-primary"
              />
              Available seats only
            </label>
          </div>
          {locationStatus !== 'denied' && locationStatus !== 'loading' && (
            <p className="text-xs text-muted-foreground">
              {locationStatus === 'ready' && 'Distances use your current location and are calculated only in this browser.'}
              {locationStatus === 'unsupported' && 'This browser does not support location access.'}
              {locationStatus === 'idle' && 'Use your location to enable distance filtering and nearest-first sorting.'}
            </p>
          )}
        </CardContent>
      </Card>

      {!visibleEvents.length ? (
        <Card className="items-center px-6 py-10 text-center">
          <p className="text-muted-foreground">No upcoming events match these filters.</p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {visibleEvents.map((event) => {
            const isActivelyInvolved = event.involvement === 'attending' || event.involvement === 'hosting';

            return (
            <li key={event.id}>
              <Card
                className={cn(
                  'transition-colors hover:border-primary/40',
                  isActivelyInvolved && 'border-l-[3px] border-l-primary bg-primary/5'
                )}
              >
                <Link href={`/events/${event.slug}`} className="block px-(--card-spacing)">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-heading text-[1.3125rem] font-semibold text-foreground">{event.title}</p>
                    {event.involvement && (
                      <Badge
                        variant={event.involvement === 'waitlisted' ? 'outline' : 'default'}
                        className={cn(event.involvement === 'waitlisted' && 'border-primary/30 bg-primary/5 text-primary')}
                      >
                        {involvementLabels[event.involvement]}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{event.formatted_time}</p>
                  {(event.location_label || event.city) && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                      <MapPin className="size-3.5 shrink-0" />
                      {[event.location_label, [event.city, event.region].filter(Boolean).join(', ')]
                        .filter(Boolean)
                        .join(' · ')}
                      {event.distance != null && ` · ${event.distance < 10 ? event.distance.toFixed(1) : Math.round(event.distance)} miles`}
                    </p>
                  )}
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground/80">
                    <Users className="size-3.5 shrink-0" />
                    {event.seat_limit == null
                      ? 'Unlimited seats'
                      : Number(event.seats_left) > 0
                        ? `${event.seats_left} of ${event.seat_limit} seats available`
                        : `All seats claimed (${event.seats_taken} of ${event.seat_limit})`}
                  </p>
                </Link>
              </Card>
            </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
