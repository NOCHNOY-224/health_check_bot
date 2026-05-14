import { getUser, saveUser, listUserIds } from './storage';
import { isInsideWindow, nextDueAt } from './scheduling';
import { T } from './texts';
import {
  sendToGroup,
  sendCheckPrompt,
  getAdminUsername,
} from './telegram';
import type { User } from './types';

const HOUR_MS = 3600 * 1000;

export async function runChecks(): Promise<{ processed: number; sent: number }> {
  const now = Date.now();
  const ids = await listUserIds();
  let sent = 0;

  for (const tgId of ids) {
    try {
      const u = await getUser(tgId);
      if (!u) continue;
      if (!u.active) continue;
      if (
        u.interval == null ||
        u.utcOffsetHours == null ||
        u.windowStartHour == null ||
        u.windowEndHour == null
      ) {
        continue;
      }
      if (!isInsideWindow(now, u)) continue;

      const longWindowMs = (u.interval / 8) * HOUR_MS;

      if (u.pending == null) {
        if (u.nextCheckDueAt && now >= u.nextCheckDueAt) {
          await firePrompt(u, now);
          sent++;
        }
      } else {
        const elapsed = now - u.pending.lastPromptAt;
        if (elapsed >= longWindowMs) {
          if (u.pending.retryCount < 3) {
            await sendToGroup(T.group_not_responding(u.name, u.interval));
            const msgId = await sendCheckPrompt(u);
            if (msgId == null) {
              // user is gone; deleteUser already called inside sendCheckPrompt
              continue;
            }
            u.pending.retryCount = (u.pending.retryCount + 1) as 1 | 2 | 3;
            u.pending.lastPromptAt = now;
            u.pending.promptMessageId = msgId;
            await saveUser(u);
            sent++;
          } else {
            // retryCount === 3: 4th window expired without answer → admin alert.
            await sendToGroup(T.group_admin_alert(getAdminUsername(), u.name));
            u.pending = null;
            u.nextCheckDueAt = nextDueAt(now, u);
            await saveUser(u);
            sent++;
          }
        }
      }
    } catch (err) {
      console.error('cron user iteration failed', tgId, err);
    }
  }

  return { processed: ids.length, sent };
}

async function firePrompt(u: User, now: number): Promise<void> {
  const msgId = await sendCheckPrompt(u);
  if (msgId == null) return; // user gone, already deleted
  u.pending = {
    promptMessageId: msgId,
    startedAt: now,
    lastPromptAt: now,
    retryCount: 0,
  };
  await saveUser(u);
}
