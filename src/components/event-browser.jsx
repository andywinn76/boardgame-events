'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { LocateFixed, MapPin, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

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

export function EventBrowser({ events }) {
  const [origin, setOrigin] = useState(null);
  const [locationStatus, setLocationStatus] = useState('idle');
  const [radius, setRadius] = useState('any');
  const [openSeatsOnly, setOpenSeatsOnly] = useState(false);
  const [sort, setSort] = useState('soonest');

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
  }, [events, openSeatsOnly, origin, radius, sort]);

  return (
    <>
      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="event-sort">Sort by</Label>
              <select id="event-sort" value={sort} onChange={(event) => setSort(event.target.value)} className={selectClass}>
                <option value="soonest">Soonest</option>
                <option value="nearest" disabled={!origin}>Nearest</option>
                <option value="seats">Most seats available</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="event-radius">Distance</Label>
              <select
                id="event-radius"
                value={radius}
                disabled={!origin}
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
          <p className="text-xs text-muted-foreground">
            {locationStatus === 'ready' && 'Distances use your current location and are calculated only in this browser.'}
            {locationStatus === 'denied' && 'Location access was unavailable. You can still sort and filter by seats.'}
            {locationStatus === 'unsupported' && 'This browser does not support location access.'}
            {locationStatus === 'idle' && 'Use your location to enable distance filtering and nearest-first sorting.'}
          </p>
        </CardContent>
      </Card>

      {!visibleEvents.length ? (
        <Card className="items-center px-6 py-10 text-center">
          <p className="text-muted-foreground">No upcoming events match these filters.</p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {visibleEvents.map((event) => (
            <li key={event.id}>
              <Card className="transition-colors hover:border-primary/40">
                <Link href={`/events/${event.slug}`} className="block px-(--card-spacing)">
                  <p className="font-heading text-lg font-semibold text-foreground">{event.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{event.formatted_time}</p>
                  {(event.location_label || event.city) && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                      <MapPin className="size-3.5 shrink-0" />
                      {[event.location_label, event.city].filter(Boolean).join(' · ')}
                      {event.distance != null && ` · ${event.distance < 10 ? event.distance.toFixed(1) : Math.round(event.distance)} miles`}
                    </p>
                  )}
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground/80">
                    <Users className="size-3.5 shrink-0" />
                    {event.seat_limit == null
                      ? 'Unlimited seats'
                      : Number(event.seats_left) > 0
                        ? `${event.seats_left} of ${event.seat_limit} seats available`
                        : 'Full'}
                  </p>
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
