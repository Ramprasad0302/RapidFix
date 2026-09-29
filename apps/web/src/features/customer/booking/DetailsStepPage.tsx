import { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router';
import { ArrowRight, Camera, ChevronRight, Video, X } from 'lucide-react';
import { Button } from '@fixora/ui';
import { useBookingDraft } from '../../../store/bookingDraft';
import { toast } from '../../../store/toast';
import { BookingShell, StepTitle } from './BookingShell';

const MAX_PHOTOS = 5;
const MAX_PHOTO_MB = 5;
const MAX_VIDEO_MB = 25;

/** Step 2 — describe the problem, attach up to 5 photos and an optional video. */
export function DetailsStepPage() {
  const navigate = useNavigate();
  const { description, photoFiles, videoFile, update, setPhotos, setVideo } = useBookingDraft();
  const photoInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);

  const previews = useMemo(() => photoFiles.map((f) => URL.createObjectURL(f)), [photoFiles]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  function addPhotos(list: FileList | null) {
    if (!list) return;
    const accepted = [...list].filter((f) => {
      if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return toast('Photos must be JPG, PNG or WebP', 'error'), false;
      if (f.size > MAX_PHOTO_MB * 1024 * 1024) return toast(`Each photo must be under ${MAX_PHOTO_MB} MB`, 'error'), false;
      return true;
    });
    setPhotos([...photoFiles, ...accepted].slice(0, MAX_PHOTOS));
  }

  function addVideo(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_VIDEO_MB * 1024 * 1024) return toast(`Video must be under ${MAX_VIDEO_MB} MB`, 'error');
    setVideo(file);
  }

  return (
    <BookingShell
      step={2}
      backTo="/book"
      action={
        <Button size="lg" fullWidth onClick={() => navigate('/book/address')}>
          Continue <ArrowRight className="size-4.5" aria-hidden />
        </Button>
      }
    >
      <StepTitle title="Describe the Problem" subtitle="Tell us more about the issue" />
      <label htmlFor="problem" className="sr-only">
        Describe the problem
      </label>
      <textarea
        id="problem"
        value={description}
        onChange={(e) => update({ description: e.target.value.slice(0, 500) })}
        rows={5}
        placeholder="Describe what problem you are facing..."
        className="w-full resize-none rounded-2xl bg-[#F3F7FD] p-4 text-[15px] outline-none placeholder:text-slate-400 focus:ring-3 focus:ring-fixora-blue/15"
      />
      <p className="mt-1 text-right text-xs text-slate-400">{description.length}/500</p>

      <h2 className="mt-4 font-semibold text-slate-900">Add Photos (Optional)</h2>
      <p className="text-sm text-slate-500">Upload clear photos to help our experts understand the issue better.</p>
      <button
        type="button"
        onClick={() => photoInput.current?.click()}
        disabled={photoFiles.length >= MAX_PHOTOS}
        className="mt-3 flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 py-6 text-center disabled:opacity-50"
      >
        <span className="flex size-10 items-center justify-center rounded-full bg-fixora-blue text-white">
          <Camera className="size-5" aria-hidden />
        </span>
        <span className="mt-2 font-medium text-slate-900">Tap to upload photos</span>
        <span className="text-xs text-slate-500">You can upload up to {MAX_PHOTOS} photos</span>
      </button>
      <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => (addPhotos(e.target.files), (e.target.value = ''))} />
      {previews.length > 0 && (
        <ul className="mt-3 grid grid-cols-3 gap-2.5">
          {previews.map((src, i) => (
            <li key={src} className="relative">
              <img src={src} alt={`Photo ${i + 1}`} className="aspect-[4/3] w-full rounded-xl object-cover" />
              <button
                onClick={() => setPhotos(photoFiles.filter((_, j) => j !== i))}
                aria-label={`Remove photo ${i + 1}`}
                className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full bg-slate-900 text-white ring-2 ring-white"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-5 font-semibold text-slate-900">Add Video (Optional)</h2>
      <div className="mt-2 flex items-center gap-2 rounded-xl border border-slate-200 pr-2">
        <button type="button" onClick={() => videoInput.current?.click()} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3.5 text-left">
          <Video className="size-5 shrink-0 text-slate-700" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-[15px] text-slate-800">{videoFile ? videoFile.name : 'Record or upload a video'}</span>
          {!videoFile && <ChevronRight className="size-5 text-slate-500" aria-hidden />}
        </button>
        {videoFile && (
          <button type="button" onClick={() => setVideo(null)} aria-label="Remove video" className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100">
            <X className="size-4" />
          </button>
        )}
      </div>
      <input ref={videoInput} type="file" accept="video/mp4,video/webm,video/quicktime" capture="environment" className="hidden" onChange={(e) => (addVideo(e.target.files?.[0]), (e.target.value = ''))} />
      {(photoFiles.length > 0 || videoFile) && <p className="mt-3 text-xs text-slate-500">Attachments upload when you confirm the booking.</p>}
    </BookingShell>
  );
}
