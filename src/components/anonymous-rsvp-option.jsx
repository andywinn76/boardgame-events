'use client';

import { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';

export function AnonymousRsvpOption({ privateVenueIds = [], defaultChecked = false, watchNewVenue = false }) {
  const [privateVenue, setPrivateVenue] = useState(false);
  const [checked, setChecked] = useState(defaultChecked);

  useEffect(() => {
    const venueSelect = document.getElementById('venue_id');
    const newVenueName = watchNewVenue ? document.getElementById('new_venue_name') : null;
    const newVenueKind = watchNewVenue ? document.getElementById('new_venue_kind') : null;

    function updatePrivateVenue() {
      const savedVenueIsPrivate = privateVenueIds.includes(venueSelect?.value);
      const newVenueIsPrivate = Boolean(
        !venueSelect?.value && newVenueName?.value.trim() && newVenueKind?.value === 'private_residence'
      );
      const isPrivate = savedVenueIsPrivate || newVenueIsPrivate;
      setPrivateVenue(isPrivate);
      if (isPrivate) setChecked(false);
    }

    updatePrivateVenue();
    const controls = [venueSelect, newVenueName, newVenueKind].filter(Boolean);
    controls.forEach((control) => {
      control.addEventListener('change', updatePrivateVenue);
      control.addEventListener('input', updatePrivateVenue);
    });
    return () => controls.forEach((control) => {
      control.removeEventListener('change', updatePrivateVenue);
      control.removeEventListener('input', updatePrivateVenue);
    });
  }, [privateVenueIds, watchNewVenue]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <input
          id="allow_anonymous_rsvps"
          name="allow_anonymous_rsvps"
          type="checkbox"
          checked={checked}
          onChange={(event) => setChecked(event.target.checked)}
          disabled={privateVenue}
          className="size-4 rounded border-input accent-primary"
        />
        <Label htmlFor="allow_anonymous_rsvps" className="font-normal">
          Allow people without an account to RSVP
        </Label>
      </div>
      <p className="ml-6 text-xs text-muted-foreground">
        {privateVenue
          ? 'Unavailable for private residences so exact address details remain account-protected.'
          : 'Unregistered users may RSVP with a first name and last initial. Not recommended for public events.'}
      </p>
    </div>
  );
}
