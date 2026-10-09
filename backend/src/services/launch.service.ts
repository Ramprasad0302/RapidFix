import { prisma } from '../config/prisma';
import { recordAudit } from './audit.service';
import { clearSettingsCache, getSetting } from './settings.service';

/**
 * Launch event mode. While it's on, every visitor of the website and the apps sees the
 * "RapidFix is ready to launch" opening screen instead of the site, with an "Open now" button
 * (pressed by the chief guest at the event). Only the Super Admin switches it on or off; admin
 * pages and the login page stay reachable so it can always be switched off again.
 */
export interface LaunchState {
  enabled: boolean;
  headline: string;
  subline: string;
  /** Changes every time it's switched on — "Open now" is remembered per device for one launch. */
  id: string;
}

const KEY = 'site.launch';
export const DEFAULT_LAUNCH: LaunchState = {
  enabled: false,
  headline: 'RapidFix is ready to launch',
  subline: 'Trusted home services for every town — verified professionals, transparent prices, right when you need them.',
  id: '',
};

export async function launchState(): Promise<LaunchState> {
  return { ...DEFAULT_LAUNCH, ...(await getSetting<Partial<LaunchState>>(KEY, {})) };
}

export async function setLaunch(actor: { userId: string; role: string }, input: { enabled: boolean; headline?: string; subline?: string }, ip?: string) {
  const before = await launchState();
  const next: LaunchState = {
    enabled: input.enabled,
    headline: input.headline?.trim() || before.headline || DEFAULT_LAUNCH.headline,
    subline: input.subline?.trim() || before.subline || DEFAULT_LAUNCH.subline,
    id: input.enabled && !before.enabled ? Date.now().toString(36) : before.id,
  };
  await prisma.setting.upsert({
    where: { key: KEY },
    update: { value: next as object, updatedById: actor.userId },
    create: { key: KEY, value: next as object, description: 'Launch event opening screen (Super Admin)', updatedById: actor.userId },
  });
  clearSettingsCache();
  await recordAudit({ actorId: actor.userId, actorRole: actor.role as never, action: next.enabled ? 'LAUNCH_MODE_ON' : 'LAUNCH_MODE_OFF', entity: 'Setting', entityId: KEY, oldValue: before, newValue: next, ip });
  return next;
}
