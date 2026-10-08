import { useEffect, useState } from 'react';
import { Download, Expand, FileText } from 'lucide-react';
import { Spinner, cx } from '@fixora/ui';
import { fetchPrivateFile } from '../lib/endpoints';
import { isNativeApp } from '../lib/nativeApp';
import { Dialog } from './Dialog';

/**
 * Private files (Aadhaar, PAN, licences…) need the access token, so they are fetched
 * as blobs — never linked directly. They open in a viewer on the same page: the app's
 * web view can't open blob links in a new tab, so a tap there used to do nothing.
 */
function usePrivateFileUrl(path: string) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;
    fetchPrivateFile(path)
      .then((u) => {
        objectUrl = u;
        if (revoked) URL.revokeObjectURL(u);
        else setUrl(u);
      })
      .catch((e: { code?: string; status?: number | null }) => {
        if (revoked) return;
        // Blob requests get no JSON error body, so a 404 is read from the status.
        setFailed(e?.code === 'FILE_MISSING' || e?.status === 404 ? 'missing' : 'error');
      });
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);
  return { url, failed };
}

const isPdf = (path: string) => path.toLowerCase().endsWith('.pdf');

/** Thumbnail of a private file; tap → full-size viewer. */
export function PrivateThumb({ path, className, label = 'Document' }: { path: string; className?: string; label?: string }) {
  const { url, failed } = usePrivateFileUrl(path);
  const [open, setOpen] = useState(false);
  const pdf = isPdf(path);
  const box = cx('flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-xs font-semibold text-slate-500', className);
  if (failed)
    return (
      <span className={cx(box, 'flex-col px-1 text-center text-[10px] leading-tight text-danger')} title={failed === 'missing' ? 'This file is no longer on the server — ask for it to be uploaded again.' : 'Could not load this file. Check your connection and reopen.'}>
        {failed === 'missing' ? 'File missing — re-upload' : 'Couldn’t load'}
      </span>
    );
  if (!url) return <span className={box}><Spinner className="size-4" /></span>;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cx(box, 'relative ring-fixora-blue hover:ring-2')} aria-label={`View ${label}`}>
        {pdf ? <FileText className="size-6 text-fixora-blue" aria-hidden /> : <img src={url} alt="" className="size-full object-cover" />}
        <span className="absolute right-0.5 bottom-0.5 rounded bg-slate-900/60 p-0.5 text-white">
          <Expand className="size-3" aria-hidden />
        </span>
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={label} variant="wide">
        <FileView url={url} pdf={pdf} label={label} />
      </Dialog>
    </>
  );
}

function FileView({ url, pdf, label }: { url: string; pdf: boolean; label: string }) {
  const name = `${label.replace(/[^\w -]/g, '').trim() || 'document'}.${pdf ? 'pdf' : 'jpg'}`;
  return (
    <div className="flex flex-col gap-3">
      {pdf ? (
        isNativeApp() ? (
          <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">PDF files can’t be previewed in the app. Open RapidFix admin on a computer to read this PDF.</p>
        ) : (
          <iframe src={url} title={label} className="h-[70dvh] w-full rounded-xl border border-slate-200" />
        )
      ) : (
        <img src={url} alt={label} className="max-h-[72dvh] w-full rounded-xl bg-slate-50 object-contain" />
      )}
      {!isNativeApp() && (
        <a href={url} download={name} className="flex items-center justify-center gap-2 text-sm font-medium text-fixora-blue">
          <Download className="size-4" aria-hidden /> Download
        </a>
      )}
    </div>
  );
}
