import { Bot, GrammyError, InlineKeyboard } from 'grammy';
import { deleteUser } from './storage.js';
import { T } from './texts.js';
import type { User } from './types.js';

let _bot: Bot | null = null;

export function bot(): Bot {
  if (_bot) return _bot;
  const token = process.env.BOT_TOKEN;
  if (!token) throw new Error('BOT_TOKEN is not set');
  _bot = new Bot(token);
  return _bot;
}

function groupChatId(): number {
  const raw = process.env.GROUP_CHAT_ID;
  if (!raw) throw new Error('GROUP_CHAT_ID is not set');
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error('GROUP_CHAT_ID must be a number');
  return n;
}

function adminUsername(): string {
  const u = process.env.ADMIN_USERNAME;
  if (!u) throw new Error('ADMIN_USERNAME is not set');
  return u.replace(/^@/, '');
}

// Returns true if the user blocked the bot (or chat doesn't exist anymore).
// In that case we delete them from storage so cron stops bothering.
async function isUserGone(err: unknown, tgId: number): Promise<boolean> {
  if (err instanceof GrammyError) {
    if (
      err.error_code === 403 ||
      err.description?.includes('bot was blocked') ||
      err.description?.includes('user is deactivated') ||
      err.description?.includes('chat not found')
    ) {
      try {
        await deleteUser(tgId);
      } catch {
        /* swallow */
      }
      return true;
    }
  }
  return false;
}

export async function sendToUser(tgId: number, html: string): Promise<number | null> {
  try {
    const msg = await bot().api.sendMessage(tgId, html, { parse_mode: 'HTML' });
    return msg.message_id;
  } catch (err) {
    if (await isUserGone(err, tgId)) return null;
    console.error('sendToUser failed', tgId, err);
    return null;
  }
}

export async function sendToGroup(html: string): Promise<void> {
  try {
    await bot().api.sendMessage(groupChatId(), html, { parse_mode: 'HTML' });
  } catch (err) {
    console.error('sendToGroup failed', err);
  }
}

// Sends "На связи?" with a "Да" inline button.
// Returns the message_id of the sent message, or null if user is gone.
export async function sendCheckPrompt(u: User): Promise<number | null> {
  const kb = new InlineKeyboard().text('Да', 'alive');
  try {
    const msg = await bot().api.sendMessage(u.tgId, T.prompt_alive, {
      reply_markup: kb,
    });
    return msg.message_id;
  } catch (err) {
    if (await isUserGone(err, u.tgId)) return null;
    console.error('sendCheckPrompt failed', u.tgId, err);
    return null;
  }
}

export async function editPromptAfterAlive(tgId: number, messageId: number): Promise<void> {
  try {
    await bot().api.editMessageText(tgId, messageId, T.alive_confirmed);
  } catch (err) {
    // not critical — message may have been deleted
    if (err instanceof GrammyError && err.error_code === 400) return;
    console.error('editPromptAfterAlive failed', err);
  }
}

export function getAdminUsername(): string {
  return adminUsername();
}
