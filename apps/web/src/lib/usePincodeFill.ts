import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { geoApi, type PincodeInfoDto } from './endpoints';

const VALID = /^[1-9]\d{5}$/;

/**
 * Looks up district and state as soon as a valid 6-digit pincode is typed.
 * `changed` is true when the pincode differs from the one the form opened
 * with (overwrite what's there) and false for the original one (fill only
 * what's empty).
 */
export function usePincodeFill(pincode: string | undefined, onFound: (info: PincodeInfoDto, changed: boolean) => void) {
  const initial = useRef(pincode);
  const apply = useRef(onFound);
  useEffect(() => {
    apply.current = onFound;
  });
  const pin = pincode && VALID.test(pincode) ? pincode : null;
  const q = useQuery({
    queryKey: ['pincode', pin],
    queryFn: () => geoApi.pincode(pin!),
    enabled: !!pin,
    staleTime: Infinity,
    retry: false,
  });
  useEffect(() => {
    if (q.data && q.data.pincode === pin) apply.current(q.data, pin !== initial.current);
  }, [q.data, pin]);
  return { looking: q.isFetching, notFound: !!pin && q.isError };
}
