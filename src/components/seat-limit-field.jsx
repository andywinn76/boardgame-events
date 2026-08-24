'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function SeatLimitField({ defaultValue = 4 }) {
  const [unlimited, setUnlimited] = useState(defaultValue == null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Label htmlFor="seat_limit">Seat limit</Label>
      <Input
        id="seat_limit"
        name="seat_limit"
        type="number"
        min="1"
        defaultValue={defaultValue ?? ''}
        disabled={unlimited}
        aria-describedby="seat-limit-help"
        className="max-w-20 shrink-0"
      />
      <span className="flex items-center gap-1.5">
        <input
          id="unlimited_seats"
          type="checkbox"
          checked={unlimited}
          onChange={(event) => setUnlimited(event.target.checked)}
          className="size-4 rounded border-input accent-primary"
        />
        <Label htmlFor="unlimited_seats" className="font-normal">Unlimited</Label>
      </span>
      <span id="seat-limit-help" className="sr-only">
        Maximum number of seats, including guest seats.
      </span>
    </div>
  );
}
