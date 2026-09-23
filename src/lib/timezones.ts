/**
 * The zone a business's trading day is cut on.
 *
 * Reports, daily buckets and the hour-of-day chart all key off `Business.
 * timezone`; before it existed they used the server's UTC clock, which put a
 * Kathmandu shop's first 5h45m of trade on the previous day.
 */
export const DEFAULT_TIMEZONE = 'Asia/Kathmandu';

/**
 * The zones offered in Settings.
 *
 * `Intl.supportedValuesOf('timeZone')` returns over four hundred, which is a
 * scroll, not a choice. This is South Asia -- where the shops are -- plus the
 * handful of zones an owner running the business from abroad would plausibly
 * pick. The backend validates against the full IANA database, so this list
 * constrains the picker, not what can be stored.
 */
export const TIMEZONES = [
  'Asia/Kathmandu',
  'Asia/Kolkata',
  'Asia/Dhaka',
  'Asia/Karachi',
  'Asia/Colombo',
  'Asia/Thimphu',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'UTC',
] as const;
