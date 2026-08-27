import { SUPPORTED_TIMEZONES } from '@/lib/dates';
import { Label } from '@/components/ui/label';
import { QuarterHourDateTimeField } from '@/components/quarter-hour-date-time-field';

const selectClass =
  'h-8 w-full min-w-0 rounded-lg border border-input bg-card px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30';

export function EventScheduleFields({
  defaultStartsAt = '',
  defaultEndsAt = '',
  defaultTimezone = 'America/Denver',
}) {
  return (
    <>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="starts_at">Starts</Label>
          <QuarterHourDateTimeField
            id="starts_at"
            name="starts_at"
            defaultValue={defaultStartsAt}
            required
          />
        </div>
        <div className="max-w-xs space-y-1.5">
          <Label htmlFor="timezone">Time zone</Label>
          <select
            id="timezone"
            name="timezone"
            defaultValue={defaultTimezone}
            className={selectClass}
          >
            {SUPPORTED_TIMEZONES.map((timezone) => (
              <option key={timezone.value} value={timezone.value}>
                {timezone.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ends_at">
          Ends <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <QuarterHourDateTimeField
          id="ends_at"
          name="ends_at"
          defaultValue={defaultEndsAt}
        />
      </div>
    </>
  );
}
