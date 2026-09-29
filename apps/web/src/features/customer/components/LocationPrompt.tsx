import { useState } from 'react';
import { useNavigate } from 'react-router';
import { LocateFixed, MapPinned, Search } from 'lucide-react';
import { Button } from '@fixora/ui';
import { Dialog } from '../../../components/Dialog';
import { confirmLocationPath, useLocationStore } from '../../../store/location';
import { LocationPicker } from './LocationPicker';

/**
 * First-visit ask: our own explanation first; the browser's permission prompt
 * appears only after the user taps "Use current location".
 */
export function LocationPrompt() {
  const navigate = useNavigate();
  const { selected, promptSeen, markPromptSeen } = useLocationStore();
  const [manual, setManual] = useState(false);
  const open = !selected && !promptSeen;

  return (
    <>
      <Dialog open={open} onClose={markPromptSeen} title="Set your service location">
        <div className="flex flex-col items-center pb-2 text-center">
          <span className="flex size-20 items-center justify-center rounded-full bg-fixora-blue-soft">
            <MapPinned className="size-10 text-fixora-blue" aria-hidden />
          </span>
          <p className="mt-4 text-[15px] text-slate-600">
            Allow location access so we can show verified professionals near you and fill in your street and area automatically.
          </p>
        </div>
        <div className="mt-4 flex flex-col gap-3">
          <Button
            size="lg"
            fullWidth
            leftIcon={<LocateFixed className="size-5" />}
            onClick={() => {
              markPromptSeen();
              navigate(confirmLocationPath({ from: '/', gps: true }));
            }}
          >
            Use current location
          </Button>
          <Button
            size="lg"
            variant="outline"
            fullWidth
            leftIcon={<Search className="size-5" />}
            onClick={() => {
              markPromptSeen();
              setManual(true);
            }}
          >
            Search or enter manually
          </Button>
        </div>
      </Dialog>
      <LocationPicker open={manual} onClose={() => setManual(false)} />
    </>
  );
}
