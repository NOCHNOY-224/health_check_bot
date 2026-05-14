export type Interval = 4 | 8 | 12 | 24 | 48 | 72;

export const INTERVALS: Interval[] = [4, 8, 12, 24, 48, 72];

// МСК = UTC+3. We allow МСК … МСК+8 → UTC offsets 3..11.
export const MIN_OFFSET = 3;
export const MAX_OFFSET = 11;

export type RegStep =
  | 'awaiting_name'
  | 'awaiting_timezone'
  | 'awaiting_window_start'
  | 'awaiting_window_end'
  | 'awaiting_interval'
  | null;

export type PendingCheck = {
  promptMessageId: number;
  startedAt: number;
  lastPromptAt: number;
  retryCount: 0 | 1 | 2 | 3;
};

export type User = {
  tgId: number;
  name: string;
  utcOffsetHours: number | null;
  windowStartHour: number | null;
  windowEndHour: number | null;
  interval: Interval | null;
  active: boolean;
  regStep: RegStep;
  nextCheckDueAt: number | null;
  pending: PendingCheck | null;
};

export function newUser(tgId: number): User {
  return {
    tgId,
    name: '',
    utcOffsetHours: null,
    windowStartHour: null,
    windowEndHour: null,
    interval: null,
    active: false,
    regStep: 'awaiting_name',
    nextCheckDueAt: null,
    pending: null,
  };
}
