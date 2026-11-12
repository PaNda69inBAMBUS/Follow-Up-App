/* Client photos: shrink picked images to a small JPEG (like Android's PhotoStore) and show stored ones. */
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { db } from '../data';

const MAX_SIDE = 1024;

/**
 * Decodes the picked image (JPEG, PNG, HEIC from the iPhone camera…), keeps it upright,
 * scales it to at most 1024 px and re-encodes it as JPEG — the format backups expect.
 */
export async function processPhoto(file: Blob): Promise<{ data: ArrayBuffer; type: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode(); // the browser applies the photo's rotation (EXIF) when drawing
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob) throw new Error('Could not encode photo');
    return { data: await blob.arrayBuffer(), type: 'image/jpeg' };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** An object URL for a stored photo (or for raw bytes), freed again when no longer shown. */
export function usePhotoUrl(photoId: number | null | undefined, draft?: ArrayBuffer | null): string | null {
  const stored = useLiveQuery(
    async () => (photoId != null && draft === undefined ? db.photos.get(photoId) : undefined),
    [photoId, draft === undefined],
  );
  const data = draft !== undefined ? draft : stored?.data ?? null;
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!data) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(new Blob([data], { type: 'image/jpeg' }));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [data]);
  return url;
}
