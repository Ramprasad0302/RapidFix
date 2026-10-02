import { useState } from 'react';
import { BellRing } from 'lucide-react';
import { Button } from '@fixora/ui';
import { notificationPermission, notificationsSupported, requestNotificationPermission } from '../lib/notifications';
import { Dialog } from './Dialog';
import { askedOnce, NOTIFICATIONS_ASKED_KEY } from './PermissionsSheet';

/** True when it's worth asking: supported, undecided, and not already asked this session. */
export function shouldAskNotifications() {
  return notificationsSupported() && notificationPermission() === 'default' && !askedOnce(NOTIFICATIONS_ASKED_KEY);
}

/**
 * The notifications question on its own (separate from location). Our
 * explanation first; the browser / Android prompt opens on "Allow".
 */
export function NotificationAskDialog({ open, onClose, technician = false }: { open: boolean; onClose(): void; technician?: boolean }) {
  const [busy, setBusy] = useState(false);
  const close = () => {
    askedOnce(NOTIFICATIONS_ASKED_KEY, true);
    onClose();
  };
  return (
    <Dialog open={open} onClose={close} title="Turn on notifications">
      <div className="flex flex-col items-center text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-fixora-blue-soft text-fixora-blue">
          <BellRing className="size-8" aria-hidden />
        </span>
        <p className="mt-4 text-[15px] text-slate-600">
          {technician
            ? 'Get new job requests the moment a customer books — even when RapidFix is closed.'
            : 'Know the moment a technician is assigned, on the way and has arrived — plus payment updates and messages.'}
        </p>
        <Button
          size="lg"
          fullWidth
          className="mt-5"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            await requestNotificationPermission();
            setBusy(false);
            close();
          }}
        >
          Allow notifications
        </Button>
        <button onClick={close} className="mt-3 text-sm font-medium text-slate-500 hover:text-slate-700">
          Not now
        </button>
      </div>
    </Dialog>
  );
}
