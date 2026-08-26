'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { CalendarDays, Clock, Dumbbell, Gauge, Users } from 'lucide-react';

const icons = {
  calendar: CalendarDays,
  clock: Clock,
  dumbbell: Dumbbell,
  gauge: Gauge,
  users: Users,
};

const fadeDurationMs = 300;
const visibleDurationMs = 3000 - fadeDurationMs;

export function GameFactIcon({ icon, label }) {
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef(null);
  const tooltipId = useId();
  const Icon = icons[icon];

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    []
  );

  function handleClick() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    if (isVisible) {
      setIsVisible(false);
      return;
    }

    setIsVisible(true);
    timeoutRef.current = setTimeout(() => {
      setIsVisible(false);
      timeoutRef.current = null;
    }, visibleDurationMs);
  }

  return (
    <span className="group relative shrink-0">
      <button
        type="button"
        onClick={handleClick}
        className="flex size-6 cursor-help items-center justify-center rounded-md outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Show ${label.toLowerCase()} label`}
        aria-describedby={isVisible ? tooltipId : undefined}
        aria-expanded={isVisible}
      >
        <Icon className="size-4" aria-hidden="true" />
      </button>
      <span
        id={tooltipId}
        role="tooltip"
        className={`pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 w-max -translate-x-1/2 rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background shadow-sm transition-opacity duration-300 group-hover:opacity-100 ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {label}
      </span>
    </span>
  );
}
