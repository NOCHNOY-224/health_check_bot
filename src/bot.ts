import { Bot, InlineKeyboard, type Context } from 'grammy';
import { getUser, saveUser } from './storage';
import {
  T,
  formatTz,
  formatHour,
  formatLocalDateTime,
} from './texts';
import { INTERVALS, MIN_OFFSET, MAX_OFFSET, newUser, type Interval, type User } from './types';
import { nextDueAt } from './scheduling';
import {
  bot as botSingleton,
  sendToGroup,
  editPromptAfterAlive,
} from './telegram';

function timezoneKb(): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (let off = MIN_OFFSET; off <= MAX_OFFSET; off++) {
    kb.text(formatTz(off), `tz_${off}`);
    // 3 per row
    if ((off - MIN_OFFSET) % 3 === 2) kb.row();
  }
  return kb;
}

function hoursKb(prefix: 'ws' | 'we'): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (let h = 0; h < 24; h++) {
    kb.text(formatHour(h), `${prefix}_${h}`);
    if (h % 6 === 5) kb.row();
  }
  return kb;
}

function intervalKb(): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const i of INTERVALS) {
    kb.text(`${i} ч`, `iv_${i}`);
  }
  return kb;
}

async function ensureUser(tgId: number): Promise<User> {
  const u = await getUser(tgId);
  if (u) return u;
  const nu = newUser(tgId);
  await saveUser(nu);
  return nu;
}

async function sendStatus(ctx: Context, u: User): Promise<void> {
  const nextLocal =
    u.active && u.nextCheckDueAt && u.utcOffsetHours != null
      ? formatLocalDateTime(u.nextCheckDueAt, u.utcOffsetHours)
      : null;
  await ctx.reply(T.status(u, nextLocal), { parse_mode: 'HTML' });
}

async function promptNextRegStep(ctx: Context, u: User): Promise<void> {
  switch (u.regStep) {
    case 'awaiting_name':
      await ctx.reply(T.hello_new);
      return;
    case 'awaiting_timezone':
      await ctx.reply(T.ask_timezone, { reply_markup: timezoneKb() });
      return;
    case 'awaiting_window_start':
      await ctx.reply(T.ask_window_start, { reply_markup: hoursKb('ws') });
      return;
    case 'awaiting_window_end':
      await ctx.reply(T.ask_window_end, { reply_markup: hoursKb('we') });
      return;
    case 'awaiting_interval':
      await ctx.reply(T.ask_interval, { reply_markup: intervalKb() });
      return;
    default:
      return;
  }
}

export function buildBot(): Bot {
  const bot = botSingleton();

  // /start
  bot.command('start', async (ctx) => {
    if (!ctx.from) return;
    const existing = await getUser(ctx.from.id);
    if (!existing) {
      const u = newUser(ctx.from.id);
      await saveUser(u);
      await ctx.reply(T.hello_new);
      return;
    }
    if (existing.regStep !== null) {
      await ctx.reply(T.reg_incomplete);
      await promptNextRegStep(ctx, existing);
      return;
    }
    await sendStatus(ctx, existing);
  });

  // /help
  bot.command('help', async (ctx) => {
    await ctx.reply(T.help, { parse_mode: 'HTML' });
  });

  // /status
  bot.command('status', async (ctx) => {
    if (!ctx.from) return;
    const u = await getUser(ctx.from.id);
    if (!u || u.regStep === 'awaiting_name') {
      await ctx.reply(T.not_registered_yet);
      return;
    }
    await sendStatus(ctx, u);
  });

  // /set_interval
  bot.command('set_interval', async (ctx) => {
    if (!ctx.from) return;
    const u = await getUser(ctx.from.id);
    if (!u || u.regStep === 'awaiting_name') {
      await ctx.reply(T.not_registered_yet);
      return;
    }
    await ctx.reply(T.ask_interval, { reply_markup: intervalKb() });
  });

  // /set_timezone
  bot.command('set_timezone', async (ctx) => {
    if (!ctx.from) return;
    const u = await getUser(ctx.from.id);
    if (!u || u.regStep === 'awaiting_name') {
      await ctx.reply(T.not_registered_yet);
      return;
    }
    await ctx.reply(T.ask_timezone, { reply_markup: timezoneKb() });
  });

  // /set_window
  bot.command('set_window', async (ctx) => {
    if (!ctx.from) return;
    const u = await getUser(ctx.from.id);
    if (!u || u.regStep === 'awaiting_name') {
      await ctx.reply(T.not_registered_yet);
      return;
    }
    // Use a transient regStep to drive the two-step flow even outside registration.
    u.regStep = 'awaiting_window_start';
    await saveUser(u);
    await ctx.reply(T.ask_window_start, { reply_markup: hoursKb('ws') });
  });

  // /stop
  bot.command('stop', async (ctx) => {
    if (!ctx.from) return;
    const u = await getUser(ctx.from.id);
    if (!u || u.regStep === 'awaiting_name' || !u.name) {
      await ctx.reply(T.not_registered_yet);
      return;
    }
    if (!u.active) {
      await ctx.reply(T.paused);
      return;
    }
    u.active = false;
    u.pending = null;
    await saveUser(u);
    await ctx.reply(T.paused);
    await sendToGroup(T.group_stopped(u.name));
  });

  // /resume
  bot.command('resume', async (ctx) => {
    if (!ctx.from) return;
    const u = await getUser(ctx.from.id);
    if (!u || u.regStep === 'awaiting_name' || !u.name) {
      await ctx.reply(T.not_registered_yet);
      return;
    }
    if (u.interval == null) {
      await ctx.reply(T.needs_interval);
      return;
    }
    if (u.utcOffsetHours == null) {
      await ctx.reply(T.needs_tz);
      return;
    }
    if (u.windowStartHour == null || u.windowEndHour == null) {
      await ctx.reply(T.needs_window);
      return;
    }
    if (u.active) {
      await ctx.reply(T.resumed);
      return;
    }
    u.active = true;
    u.pending = null;
    u.nextCheckDueAt = nextDueAt(Date.now(), u);
    await saveUser(u);
    await ctx.reply(T.resumed);
    await sendToGroup(
      T.group_resumed(
        u.name,
        u.interval,
        u.utcOffsetHours,
        u.windowStartHour,
        u.windowEndHour,
      ),
    );
  });

  // Plain text — registration name step
  bot.on('message:text', async (ctx) => {
    if (!ctx.from) return;
    const text = ctx.message?.text ?? '';
    if (text.startsWith('/')) return; // commands handled above
    const u = await getUser(ctx.from.id);
    if (!u) {
      await ctx.reply(T.not_registered_yet);
      return;
    }
    if (u.regStep === 'awaiting_name') {
      const name = text.trim().slice(0, 64);
      if (!name) {
        await ctx.reply('Имя не может быть пустым. Напиши имя одним сообщением.');
        return;
      }
      u.name = name;
      u.regStep = 'awaiting_timezone';
      await saveUser(u);
      await ctx.reply(T.ask_timezone, { reply_markup: timezoneKb() });
      return;
    }
    // Otherwise — ignore free text, nudge with help
    await ctx.reply(T.help, { parse_mode: 'HTML' });
  });

  // Timezone callback
  bot.callbackQuery(/^tz_(-?\d+)$/, async (ctx) => {
    if (!ctx.from) return;
    const offset = Number(ctx.match![1]);
    if (!Number.isFinite(offset) || offset < MIN_OFFSET || offset > MAX_OFFSET) {
      await ctx.answerCallbackQuery({ text: 'Некорректный пояс' });
      return;
    }
    const u = await ensureUser(ctx.from.id);
    const oldOffset = u.utcOffsetHours;
    u.utcOffsetHours = offset;
    if (u.regStep === 'awaiting_timezone') {
      u.regStep = 'awaiting_window_start';
      await saveUser(u);
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(`Часовой пояс: <b>${formatTz(offset)}</b>`, {
        parse_mode: 'HTML',
      });
      await ctx.reply(T.ask_window_start, { reply_markup: hoursKb('ws') });
      return;
    }
    // post-registration change
    if (u.active && u.interval != null) {
      u.nextCheckDueAt = nextDueAt(Date.now(), u);
    }
    await saveUser(u);
    await ctx.answerCallbackQuery({ text: 'Часовой пояс обновлён' });
    await ctx.editMessageText(`Часовой пояс: <b>${formatTz(offset)}</b>`, {
      parse_mode: 'HTML',
    });
    if (oldOffset != null && oldOffset !== offset && u.name) {
      await sendToGroup(T.group_timezone_changed(u.name, oldOffset, offset));
    }
  });

  // Window start hour
  bot.callbackQuery(/^ws_(\d+)$/, async (ctx) => {
    if (!ctx.from) return;
    const h = Number(ctx.match![1]);
    if (!Number.isFinite(h) || h < 0 || h > 23) {
      await ctx.answerCallbackQuery({ text: 'Некорректный час' });
      return;
    }
    const u = await ensureUser(ctx.from.id);
    u.windowStartHour = h;
    // After picking start, always go to "awaiting_window_end" so /set_window also works.
    const wasInRegistration =
      u.regStep === 'awaiting_window_start' &&
      (u.windowEndHour == null || u.interval == null);
    u.regStep = 'awaiting_window_end';
    await saveUser(u);
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(`Начало окна: <b>${formatHour(h)}</b>`, {
      parse_mode: 'HTML',
    });
    await ctx.reply(T.ask_window_end, { reply_markup: hoursKb('we') });
    void wasInRegistration;
  });

  // Window end hour
  bot.callbackQuery(/^we_(\d+)$/, async (ctx) => {
    if (!ctx.from) return;
    const h = Number(ctx.match![1]);
    if (!Number.isFinite(h) || h < 0 || h > 23) {
      await ctx.answerCallbackQuery({ text: 'Некорректный час' });
      return;
    }
    const u = await ensureUser(ctx.from.id);
    u.windowEndHour = h;

    const inRegistration = u.interval == null; // first time through
    if (inRegistration) {
      u.regStep = 'awaiting_interval';
      await saveUser(u);
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(`Конец окна: <b>${formatHour(h)}</b>`, {
        parse_mode: 'HTML',
      });
      await ctx.reply(T.ask_interval, { reply_markup: intervalKb() });
      return;
    }

    // post-registration: finished /set_window
    u.regStep = null;
    if (u.active && u.interval != null) {
      u.nextCheckDueAt = nextDueAt(Date.now(), u);
    }
    await saveUser(u);
    await ctx.answerCallbackQuery({ text: 'Окно обновлено' });
    await ctx.editMessageText(`Конец окна: <b>${formatHour(h)}</b>`, {
      parse_mode: 'HTML',
    });
    if (u.name && u.windowStartHour != null) {
      await sendToGroup(T.group_window_changed(u.name, u.windowStartHour, h));
    }
  });

  // Interval pick
  bot.callbackQuery(/^iv_(\d+)$/, async (ctx) => {
    if (!ctx.from) return;
    const ivNum = Number(ctx.match![1]);
    if (!INTERVALS.includes(ivNum as Interval)) {
      await ctx.answerCallbackQuery({ text: 'Некорректный интервал' });
      return;
    }
    const iv = ivNum as Interval;
    const u = await ensureUser(ctx.from.id);
    const wasFirstSubscription = !u.active || u.interval == null;
    const oldInterval = u.interval;
    u.interval = iv;
    u.regStep = null;

    // For first-time subscription via registration flow, activate.
    if (
      wasFirstSubscription &&
      u.utcOffsetHours != null &&
      u.windowStartHour != null &&
      u.windowEndHour != null &&
      u.name
    ) {
      u.active = true;
    }
    if (u.active) {
      u.nextCheckDueAt = nextDueAt(Date.now(), u);
      u.pending = null;
    }
    await saveUser(u);
    await ctx.answerCallbackQuery({ text: `Интервал: ${iv} ч` });
    await ctx.editMessageText(`Интервал: <b>${iv} ч</b>`, { parse_mode: 'HTML' });

    if (
      wasFirstSubscription &&
      u.active &&
      u.utcOffsetHours != null &&
      u.windowStartHour != null &&
      u.windowEndHour != null
    ) {
      await ctx.reply(T.reg_done(u.name, iv));
      await sendToGroup(
        T.group_subscribed(
          u.name,
          iv,
          u.utcOffsetHours,
          u.windowStartHour,
          u.windowEndHour,
        ),
      );
    } else if (!wasFirstSubscription && oldInterval != null && oldInterval !== iv && u.name) {
      await sendToGroup(T.group_interval_changed(u.name, oldInterval, iv));
    }
  });

  // "Да" — alive confirmation
  bot.callbackQuery('alive', async (ctx) => {
    if (!ctx.from) return;
    const u = await getUser(ctx.from.id);
    if (!u || !u.active || u.interval == null) {
      await ctx.answerCallbackQuery({ text: 'Ок' });
      return;
    }
    const messageId = ctx.callbackQuery.message?.message_id;
    u.pending = null;
    u.nextCheckDueAt = nextDueAt(Date.now(), u);
    await saveUser(u);
    await ctx.answerCallbackQuery({ text: 'Спасибо!' });
    if (messageId) {
      await editPromptAfterAlive(u.tgId, messageId);
    }
    await sendToGroup(T.group_alive(u.name, u.interval));
  });

  return bot;
}

export const BOT_COMMANDS = [
  { command: 'start', description: 'Запустить или показать настройки' },
  { command: 'set_interval', description: 'Интервал проверок' },
  { command: 'set_timezone', description: 'Часовой пояс' },
  { command: 'set_window', description: 'Часы, когда бот может писать' },
  { command: 'stop', description: 'Пауза проверок' },
  { command: 'resume', description: 'Возобновить проверки' },
  { command: 'status', description: 'Текущие настройки' },
  { command: 'help', description: 'Список команд' },
];
