const TIME_ZONE = 'America/Lima';

const DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const TIME_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/**
 * Emission date and time in Peru local time. SUNAT dates the CPE by the local
 * day, so a server running in UTC would otherwise emit tomorrow's date after
 * 19:00 Lima time.
 */
export function peruTimestamp(now: Date = new Date()): {
  date: string;
  time: string;
} {
  return {
    date: DATE_FORMATTER.format(now),
    time: TIME_FORMATTER.format(now),
  };
}
