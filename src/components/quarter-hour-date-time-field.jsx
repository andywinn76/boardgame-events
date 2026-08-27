'use client';

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';

const selectClass =
  'h-8 min-w-0 rounded-lg border border-input bg-card px-2 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30';

const hourOptions = Array.from({ length: 12 }, (_, index) => String(index + 1));
const minuteOptions = ['00', '15', '30', '45'];

function splitDateTime(value) {
  if (!value) return { date: '', hour: '', minute: '', period: '' };

  const [date = '', rawTime = ''] = value.split('T');
  const [hours = '0', minutes = '0'] = rawTime.split(':');
  const totalMinutes = Number(hours) * 60 + Number(minutes);
  const quarterHourMinutes = Math.min(23 * 60 + 45, Math.round(totalMinutes / 15) * 15);
  const normalizedHours = Math.floor(quarterHourMinutes / 60);
  const normalizedMinutes = quarterHourMinutes % 60;

  return {
    date,
    hour: String(normalizedHours % 12 || 12),
    minute: String(normalizedMinutes).padStart(2, '0'),
    period: normalizedHours >= 12 ? 'PM' : 'AM',
  };
}

export function QuarterHourDateTimeField({ id, name, defaultValue = '', required = false }) {
  const initialValue = useMemo(() => splitDateTime(defaultValue), [defaultValue]);
  const [date, setDate] = useState(initialValue.date);
  const [hour, setHour] = useState(initialValue.hour);
  const [minute, setMinute] = useState(initialValue.minute);
  const [period, setPeriod] = useState(initialValue.period);
  const hasPartialTime = Boolean(hour || minute || period);
  const hasCompleteTime = Boolean(hour && minute && period);
  const hour24 = hasCompleteTime
    ? (Number(hour) % 12) + (period === 'PM' ? 12 : 0)
    : null;
  const submittedValue = date && hasCompleteTime
    ? `${date}T${String(hour24).padStart(2, '0')}:${minute}`
    : '';
  const fieldLabel = required ? 'Start' : 'End';
  const timeRequired = required || Boolean(date) || hasPartialTime;

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-[minmax(9rem,1fr)_5rem_5rem_6rem]">
      <input type="hidden" name={name} value={submittedValue} />
      <Input
        id={id}
        name={`${name}_date`}
        type="date"
        value={date}
        required={required || hasPartialTime}
        className="col-span-3 min-w-40 sm:col-span-1"
        onChange={(event) => setDate(event.target.value)}
      />
      <select
        id={`${id}_hour`}
        name={`${name}_hour`}
        value={hour}
        required={timeRequired}
        aria-label={`${fieldLabel} hour`}
        className={selectClass}
        onChange={(event) => setHour(event.target.value)}
      >
        <option value="">Hr</option>
        {hourOptions.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <select
        id={`${id}_minute`}
        name={`${name}_minute`}
        value={minute}
        required={timeRequired}
        aria-label={`${fieldLabel} minute`}
        className={selectClass}
        onChange={(event) => setMinute(event.target.value)}
      >
        <option value="">Min</option>
        {minuteOptions.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <select
        id={`${id}_period`}
        name={`${name}_period`}
        value={period}
        required={timeRequired}
        aria-label={`${fieldLabel} AM or PM`}
        className={selectClass}
        onChange={(event) => setPeriod(event.target.value)}
      >
        <option value="">AM/PM</option>
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}
