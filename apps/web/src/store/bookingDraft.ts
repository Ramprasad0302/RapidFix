import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AddressInput } from '@fixora/shared-utils';
import type { PaymentMethod } from '@fixora/shared-types';
import { safeStorage } from './safeStorage';

/**
 * The booking in progress. It survives the login/OTP detour (and a page
 * reload), so a guest never loses what they were booking. Photo/video files
 * can't be serialised, so they live in memory and are uploaded at confirm time.
 */
export interface BookingDraft {
  serviceId: string | null;
  serviceSlug: string | null;
  categorySlug: string | null;
  description: string;
  addressId: string | null;
  address: AddressInput | null;
  saveAddress: boolean;
  scheduleType: 'NOW' | 'SCHEDULED';
  date: string | null;
  timeSlot: string | null;
  couponCode: string | null;
  paymentMethod: PaymentMethod;
  estimatedTotal: number | null;
}

interface DraftState extends BookingDraft {
  photoFiles: File[];
  videoFile: File | null;
  start(service: { id: string; slug: string; categorySlug: string }, couponCode?: string | null): void;
  update(patch: Partial<BookingDraft>): void;
  setPhotos(files: File[]): void;
  setVideo(file: File | null): void;
  clear(): void;
}

const EMPTY: BookingDraft = {
  serviceId: null,
  serviceSlug: null,
  categorySlug: null,
  description: '',
  addressId: null,
  address: null,
  saveAddress: true,
  scheduleType: 'NOW',
  date: null,
  timeSlot: null,
  couponCode: null,
  paymentMethod: 'CASH',
  estimatedTotal: null,
};

export const useBookingDraft = create<DraftState>()(
  persist(
    (set, get) => ({
      ...EMPTY,
      photoFiles: [],
      videoFile: null,
      start: (service, couponCode) => {
        // Re-opening the same service keeps what was already filled in.
        if (get().serviceId === service.id) {
          if (couponCode) set({ couponCode });
          return;
        }
        set({
          ...EMPTY,
          photoFiles: [],
          videoFile: null,
          serviceId: service.id,
          serviceSlug: service.slug,
          categorySlug: service.categorySlug,
          couponCode: couponCode ?? get().couponCode,
          // Keep the last address; most people book for the same home.
          addressId: get().addressId,
          address: get().address,
        });
      },
      update: (patch) => set(patch),
      setPhotos: (photoFiles) => set({ photoFiles }),
      setVideo: (videoFile) => set({ videoFile }),
      clear: () => set({ ...EMPTY, photoFiles: [], videoFile: null }),
    }),
    {
      name: 'fixora.bookingDraft',
      storage: safeStorage,
      version: 1,
      partialize: ({ photoFiles: _p, videoFile: _v, start: _s, update: _u, setPhotos: _sp, setVideo: _sv, clear: _c, ...draft }) => draft,
    },
  ),
);
