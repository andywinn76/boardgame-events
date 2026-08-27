'use client';

import { useState } from 'react';
import { ExternalLink, MapPinned } from 'lucide-react';
import { Button } from '@/components/ui/button';

const VENUE_FIELD_MAP = {
  addressLine1: 'new_venue_address_line1',
  addressLine2: 'new_venue_address_line2',
  city: 'new_venue_city',
  region: 'new_venue_region',
  postalCode: 'new_venue_postal_code',
  crossStreets: 'new_venue_cross_streets',
};

const EVENT_FIELD_MAP = {
  venueId: 'venue_id',
  neighborhood: 'neighborhood',
  city: 'city',
  region: 'region',
  crossStreets: 'cross_streets',
};

export function VenueMapPreview({ type = 'venue' }) {
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function previewVenue(event) {
    const form = event.currentTarget.form;
    if (!form) return;

    const formData = new FormData(form);
    const fieldMap = type === 'event' ? EVENT_FIELD_MAP : VENUE_FIELD_MAP;
    const payload = Object.fromEntries(
      Object.entries(fieldMap).map(([key, name]) => [key, formData.get(name)])
    );

    setLoading(true);
    setError('');
    setPreview(null);

    try {
      const response = await fetch('/api/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, ...payload }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The venue map preview could not be generated.');
      setPreview(result);
    } catch (previewError) {
      setError(previewError.message);
    } finally {
      setLoading(false);
    }
  }

  const mapUrl = preview
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${preview.lat},${preview.lng}`)}`
    : null;

  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" size="sm" onClick={previewVenue} disabled={loading}>
        <MapPinned />
        {loading ? 'Locating venue...' : 'Preview venue map'}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {preview && (
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
          <p className="text-muted-foreground">Located as</p>
          <p className="mt-1 font-medium text-foreground">{preview.formattedAddress}</p>
          <a
            href={mapUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 font-medium text-primary underline underline-offset-2"
          >
            Open map preview <ExternalLink className="size-3.5" />
          </a>
        </div>
      )}
    </div>
  );
}
