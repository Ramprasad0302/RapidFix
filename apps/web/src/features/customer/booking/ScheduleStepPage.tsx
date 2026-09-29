import { Navigate, useNavigate } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { Button } from '@fixora/ui';
import { useBookingDraft } from '../../../store/bookingDraft';
import { ScheduleFields } from '../components/ScheduleFields';
import { BookingShell, StepTitle } from './BookingShell';

/** Step 4 — Book Now or schedule a date + slot. */
export function ScheduleStepPage() {
  const navigate = useNavigate();
  const { scheduleType, date, timeSlot, update, address, addressId } = useBookingDraft();
  const ready = scheduleType === 'NOW' || (!!date && !!timeSlot);

  // Deep link past the address step.
  if (!address && !addressId) return <Navigate to="/book/address" replace />;

  return (
    <BookingShell
      step={4}
      backTo="/book/address"
      action={
        <Button size="lg" fullWidth disabled={!ready} onClick={() => navigate('/book/review')}>
          Continue <ArrowRight className="size-4.5" aria-hidden />
        </Button>
      }
    >
      <StepTitle title="When do you need the service?" subtitle="Choose a convenient time" />
      <ScheduleFields value={{ scheduleType, date, timeSlot }} onChange={(v) => update(v)} />
    </BookingShell>
  );
}
