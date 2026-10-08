/**
 * Phone camera photos are often 4–12 MB (and HEIC on iPhones), over the 5 MB upload
 * limit and slow on mobile data. Before uploading a photo we redraw it as a JPEG of
 * at most `maxSide` pixels — still sharp enough to read an Aadhaar number or a shop
 * bill — which is usually 300–900 KB. PDFs and small JPG/PNG/WebP files are sent as-is.
 */
const KEEP_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

async function decode(file: File): Promise<{ width: number; height: number; draw(ctx: CanvasRenderingContext2D, w: number, h: number): void; close(): void }> {
  if ('createImageBitmap' in window) {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { width: bmp.width, height: bmp.height, draw: (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h), close: () => bmp.close() };
    } catch {
      /* fall back to <img> (e.g. HEIC on Safari) */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { width: img.naturalWidth, height: img.naturalHeight, draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h), close: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

export async function compressImage(file: File, opts: { maxSide?: number; quality?: number; keepUnderBytes?: number } = {}): Promise<File> {
  const maxSide = opts.maxSide ?? 1800;
  const keepUnder = opts.keepUnderBytes ?? 1_200_000;
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (isPdf) return file;
  const isImage = file.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp)$/i.test(file.name);
  if (!isImage) return file;
  if (KEEP_TYPES.includes(file.type) && file.size <= keepUnder) return file;

  let src: Awaited<ReturnType<typeof decode>>;
  try {
    src = await decode(file);
  } catch {
    return file; // can't read it here — let the server give a clear message
  }
  try {
    const scale = Math.min(1, maxSide / Math.max(src.width, src.height));
    const w = Math.max(1, Math.round(src.width * scale));
    const h = Math.max(1, Math.round(src.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.fillStyle = '#fff'; // transparent PNGs → white, not black
    ctx.fillRect(0, 0, w, h);
    src.draw(ctx, w, h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', opts.quality ?? 0.82));
    if (!blob || (KEEP_TYPES.includes(file.type) && blob.size >= file.size)) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg', lastModified: Date.now() });
  } finally {
    src.close();
  }
}
