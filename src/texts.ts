import type { User, Interval } from './types';

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Format timezone offset as "МСК", "МСК+1", ... (МСК = UTC+3)
export function formatTz(utcOffsetHours: number): string {
  const delta = utcOffsetHours - 3;
  if (delta === 0) return 'МСК';
  return `МСК+${delta}`;
}

export function formatHour(h: number): string {
  return `${String(h).padStart(2, '0')}:00`;
}

export function formatLocalDateTime(utcMs: number, offsetHours: number): string {
  const d = new Date(utcMs + offsetHours * 3600 * 1000);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const HH = String(d.getUTCHours()).padStart(2, '0');
  const MM = String(d.getUTCMinutes()).padStart(2, '0');
  return `${dd}.${mm} ${HH}:${MM}`;
}

export const T = {
  hello_new:
    'Привет! Я бот «на связи?». Я буду периодически писать тебе, чтобы убедиться, что ты в порядке.\n\n' +
    'Для начала: как тебя зовут? Напиши имя одним сообщением.',

  ask_timezone: 'Выбери свой часовой пояс:',

  ask_window_start:
    'В какой час начинается твоё «активное окно»? В это время бот может писать тебе.\n' +
    '(Например, если ты не хочешь, чтобы бот будил ночью — поставь начало 09:00 или 10:00.)',

  ask_window_end:
    'Теперь выбери час окончания активного окна. После этого часа бот писать не будет.\n' +
    '(Например, 22:00 — значит после 22:00 проверок не будет.)',

  ask_interval: 'Как часто присылать проверку «На связи?»',

  reg_done: (name: string, interval: number) =>
    `Готово, ${escapeHtml(name)}! Я буду спрашивать «На связи?» каждые ${interval} ч.\n\n` +
    `Чтобы поменять настройки: /set_interval · /set_timezone · /set_window\n` +
    `Пауза: /stop · возобновить: /resume · показать настройки: /status`,

  reg_incomplete:
    'Регистрация ещё не завершена — продолжаем с того же шага.',

  status: (u: User, nextLocalStr: string | null) =>
    `Имя: <b>${escapeHtml(u.name)}</b>\n` +
    `Часовой пояс: <b>${u.utcOffsetHours == null ? '—' : formatTz(u.utcOffsetHours)}</b>\n` +
    `Активное окно: <b>${u.windowStartHour == null || u.windowEndHour == null ? '—' : formatHour(u.windowStartHour) + '–' + formatHour(u.windowEndHour)}</b>\n` +
    `Интервал: <b>${u.interval ? u.interval + ' ч' : '—'}</b>\n` +
    `Статус: <b>${u.active ? 'включены' : 'на паузе'}</b>\n` +
    (u.active && nextLocalStr ? `Следующая проверка: <b>${nextLocalStr}</b> (по твоему времени)` : ''),

  prompt_alive: 'На связи?',
  alive_confirmed: '✅ Спасибо, отметил!',

  paused: 'Проверки поставлены на паузу. Чтобы возобновить — /resume.',
  resumed: 'Проверки возобновлены.',

  not_registered_yet:
    'Сначала пройди регистрацию: /start',

  needs_interval: 'Сначала выбери интервал: /set_interval',
  needs_tz: 'Сначала выбери часовой пояс: /set_timezone',
  needs_window: 'Сначала задай окно активности: /set_window',

  help:
    '<b>Команды:</b>\n' +
    '/start — запустить или показать настройки\n' +
    '/set_interval — поменять интервал проверок\n' +
    '/set_timezone — поменять часовой пояс\n' +
    '/set_window — поменять часы, когда бот может писать\n' +
    '/stop — поставить проверки на паузу\n' +
    '/resume — снова включить проверки\n' +
    '/status — показать текущие настройки\n' +
    '/help — этот список\n\n' +
    'Бот будет периодически писать «На связи?» — просто нажми «Да».',

  // Group messages
  group_subscribed: (
    name: string,
    interval: Interval,
    tz: number,
    winStart: number,
    winEnd: number,
  ) =>
    `🟢 <b>${escapeHtml(name)}</b> подключился к проверкам.\n` +
    `Интервал: ${interval} ч · часовой пояс: ${formatTz(tz)} · окно: ${formatHour(winStart)}–${formatHour(winEnd)}`,

  group_resumed: (
    name: string,
    interval: Interval,
    tz: number,
    winStart: number,
    winEnd: number,
  ) =>
    `🟢 <b>${escapeHtml(name)}</b> возобновил проверки.\n` +
    `Интервал: ${interval} ч · часовой пояс: ${formatTz(tz)} · окно: ${formatHour(winStart)}–${formatHour(winEnd)}`,

  group_stopped: (name: string) =>
    `🔴 <b>${escapeHtml(name)}</b> остановил проверки.`,

  group_interval_changed: (name: string, oldIv: Interval, newIv: Interval) =>
    `🔧 <b>${escapeHtml(name)}</b> изменил интервал проверок: ${oldIv} ч → ${newIv} ч.`,

  group_timezone_changed: (name: string, oldTz: number, newTz: number) =>
    `🔧 <b>${escapeHtml(name)}</b> сменил часовой пояс: ${formatTz(oldTz)} → ${formatTz(newTz)}.`,

  group_window_changed: (name: string, newStart: number, newEnd: number) =>
    `🔧 <b>${escapeHtml(name)}</b> изменил окно активности: ${formatHour(newStart)}–${formatHour(newEnd)}.`,

  group_alive: (name: string, interval: Interval) =>
    `✅ Проверка ${interval} ч: <b>${escapeHtml(name)}</b> на связи!`,

  group_not_responding: (name: string, interval: Interval) =>
    `❌ Проверка ${interval} ч: <b>${escapeHtml(name)}</b> <b>не отвечает</b>!`,

  group_admin_alert: (adminUsername: string, name: string) =>
    `@${adminUsername}\n<b>❌❌❌ ${escapeHtml(name)} не отвечает на проверки!</b>`,

  list_header: '📋 <b>Участники проверок</b>',

  list_entry_active: (
    name: string,
    interval: Interval,
    tz: number,
    winStart: number,
    winEnd: number,
  ) =>
    `🟢 <b>${escapeHtml(name)}</b>\n` +
    `    Интервал: ${interval} ч · ${formatTz(tz)} · окно: ${formatHour(winStart)}–${formatHour(winEnd)}`,

  list_entry_paused: (name: string) =>
    `⚪ <b>${escapeHtml(name)}</b> — проверки на паузе`,

  list_empty: 'Пока нет зарегистрированных участников.',

  list_group_only: 'Эта команда работает только в групповом чате проверок.',
};
