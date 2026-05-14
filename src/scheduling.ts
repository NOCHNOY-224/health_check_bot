import type { User } from './types.js';

const HOUR_MS = 3600 * 1000;

function localHour(utcMs: number, offsetHours: number): number {
  const local = new Date(utcMs + offsetHours * HOUR_MS);
  return local.getUTCHours();
}

export function isInsideWindow(utcMs: number, u: User): boolean {
  if (u.utcOffsetHours == null || u.windowStartHour == null || u.windowEndHour == null) {
    return false;
  }
  const h = localHour(utcMs, u.utcOffsetHours);
  const s = u.windowStartHour;
  const e = u.windowEndHour;
  if (s === e) return true; // 24h mode
  if (s < e) return h >= s && h < e;
  // wraps midnight: s > e
  return h >= s || h < e;
}

// Returns ms timestamp of the start of the next "open" hour at-or-after utcMs.
// If already inside the window, returns utcMs unchanged.
export function nextWindowOpenAt(utcMs: number, u: User): number {
  if (u.utcOffsetHours == null || u.windowStartHour == null || u.windowEndHour == null) {
    return utcMs;
  }
  if (isInsideWindow(utcMs, u)) return utcMs;

  // Step minute-by-minute would be slow; step hour-by-hour from the next hour boundary.
  const localNow = new Date(utcMs + u.utcOffsetHours * HOUR_MS);
  // Round up to next full hour in local time.
  const localNextHour = new Date(
    Date.UTC(
      localNow.getUTCFullYear(),
      localNow.getUTCMonth(),
      localNow.getUTCDate(),
      localNow.getUTCHours() + 1,
      0,
      0,
      0,
    ),
  ).getTime();
  let cursor = localNextHour - u.utcOffsetHours * HOUR_MS; // back to UTC
  // Walk at most 48 hours forward — guaranteed to find an open hour.
  for (let i = 0; i < 48; i++) {
    if (isInsideWindow(cursor, u)) return cursor;
    cursor += HOUR_MS;
  }
  return cursor;
}

// Compute when to fire the next "На связи?" given the previous due (or "now").
// Never returns earlier than prevDueUtcMs + interval.
export function nextDueAt(prevDueUtcMs: number, u: User): number {
  if (u.interval == null) return prevDueUtcMs;
  const candidate = prevDueUtcMs + u.interval * HOUR_MS;
  if (isInsideWindow(candidate, u)) return candidate;
  return nextWindowOpenAt(candidate, u);
}
