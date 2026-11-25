"use client";

/**
 * Turns a picked/captured image into a small square JPEG (center crop) before upload,
 * so phones never send multi-megabyte camera files. Also strips EXIF/location data,
 * because only the re-drawn pixels are kept.
 */
export async function prepareSquarePhoto(file: File, size = 320, quality = 0.82): Promise<string> {
  const bitmap = await loadPhoto(file);
  const side = Math.min(bitmap.width, bitmap.height);
  return cropPhoto(bitmap, { x: (bitmap.width - side) / 2, y: (bitmap.height - side) / 2, side }, size, quality);
}

export type PhotoSource = ImageBitmap | HTMLImageElement;
export type Crop = { x: number; y: number; side: number };

/** Decodes a picked file (respecting phone rotation). */
export async function loadPhoto(file: File): Promise<PhotoSource> {
  if (!file.type.startsWith("image/") && file.type !== "") throw new Error("Please choose a photo.");
  return loadBitmap(file);
}

/** Keeps a square crop inside the image. */
export function clampCrop(img: { width: number; height: number }, c: Crop): Crop {
  const side = Math.min(c.side, img.width, img.height);
  return {
    side,
    x: Math.min(Math.max(c.x, 0), img.width - side),
    y: Math.min(Math.max(c.y, 0), img.height - side),
  };
}

/** Draws the chosen square of the photo into a small JPEG data URL. */
export function cropPhoto(bitmap: PhotoSource, crop: Crop, size = 320, quality = 0.82): string {
  const { x: sx, y: sy, side } = clampCrop(bitmap, crop);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't process photos.");
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
  return canvas.toDataURL("image/jpeg", quality);
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      // imageOrientation respects the phone's EXIF rotation.
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      /* fall back below (e.g. HEIC on some browsers) */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } catch {
    throw new Error("That photo format isn't supported. Try a different picture.");
  } finally {
    URL.revokeObjectURL(url);
  }
}
