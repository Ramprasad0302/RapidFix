import { NewRequestSheet } from './components/NewRequestSheet';
import { useLocationSharing } from './useLocationSharing';

/**
 * Runs on every technician screen (tabs, job details, chat, account pages):
 * live location while online, and the ringing new-job pop-up.
 */
export function TechnicianBackground() {
  useLocationSharing();
  return <NewRequestSheet />;
}
