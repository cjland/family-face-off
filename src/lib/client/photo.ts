"use client";

/**
 * Turns a picked/captured image into a small square JPEG (center crop) before upload,
 * so phones never send multi-megabyte camera files. Also strips EXIF/location data,
 * because only the re-drawn pixels are kept.
 */
export async function prepareSquarePhoto(file: File, size = 320, quality = 0.82): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose a photo.");
  const bitmap = await loadBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't process photos.");
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
  if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();
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
