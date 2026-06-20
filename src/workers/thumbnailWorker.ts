// Background thumbnail generation worker
// Handles both placeholder thumbnails (non-images) and image resize (off main thread)

interface ThumbnailRequest {
  fileId: string;
  fileName: string;
  fileType: string;
  category: string;
}

interface ResizeRequest {
  fileId: string;
  imageData: ArrayBuffer;
  mimeType: string;
}

let thumbSize = 256;

// Handle messages from main thread
self.onmessage = async (e: MessageEvent<{ type: string; files?: ThumbnailRequest[]; resize?: ResizeRequest; thumbSize?: number }>) => {
  const { type } = e.data;

  // Update resolution if provided
  if (e.data.thumbSize && e.data.thumbSize >= 64 && e.data.thumbSize <= 512) {
    thumbSize = e.data.thumbSize;
  }

  // Generate placeholder thumbnails for non-image files
  if (type === "generate" && e.data.files) {
    for (const file of e.data.files) {
      try {
        const canvas = new OffscreenCanvas(thumbSize, thumbSize);
        const ctx = canvas.getContext("2d")!;

        ctx.fillStyle = "#161616";
        ctx.fillRect(0, 0, thumbSize, thumbSize);

        const colors: Record<string, string> = {
          Images: "#ff1a1a",
          Videos: "#aa44ff",
          Audio: "#00e676",
          Documents: "#2196f3",
        };
        const color = colors[file.category] || "#666666";

        const half = thumbSize / 2;
        const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
        grad.addColorStop(0, color + "30");
        grad.addColorStop(1, "transparent");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, thumbSize, thumbSize);

        ctx.strokeStyle = color + "60";
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, 0.5, thumbSize - 1, thumbSize - 1);

        const ext = file.fileName.split(".").pop()?.toUpperCase() || "?";
        ctx.fillStyle = color;
        const fontSize = Math.max(12, Math.round(thumbSize / 10));
        ctx.font = `bold ${fontSize}px monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(ext, thumbSize / 2, thumbSize / 2);

        const blob = await canvas.convertToBlob({ type: "image/webp", quality: 0.7 });
        const buffer = await blob.arrayBuffer();

        self.postMessage(
          { type: "thumbnail", fileId: file.fileId, buffer, mimeType: "image/webp" },
          { transfer: [buffer] }
        );
      } catch {
        self.postMessage({ type: "thumbnail", fileId: file.fileId, buffer: null, mimeType: "" });
      }
    }
    self.postMessage({ type: "done" });
  }

  // Resize an image thumbnail off the main thread
  if (type === "resize" && e.data.resize) {
    const { fileId, imageData, mimeType } = e.data.resize;
    try {
      const blob = new Blob([imageData], { type: mimeType });
      const fullBitmap = await createImageBitmap(blob);
      // Calculate aspect-preserving dimensions
      const scale = Math.min(thumbSize / fullBitmap.width, thumbSize / fullBitmap.height);
      const targetW = Math.round(fullBitmap.width * scale);
      const targetH = Math.round(fullBitmap.height * scale);
      fullBitmap.close();
      // Use createImageBitmap with resize — browser-native, avoids manual canvas scale
      const bitmap = await createImageBitmap(blob, {
        resizeWidth: targetW,
        resizeHeight: targetH,
        resizeQuality: "medium",
      });

      const canvas = new OffscreenCanvas(thumbSize, thumbSize);
      const ctx = canvas.getContext("2d")!;
      const w = bitmap.width;
      const h = bitmap.height;
      const x = (thumbSize - w) / 2;
      const y = (thumbSize - h) / 2;
      ctx.fillStyle = "#161616";
      ctx.fillRect(0, 0, thumbSize, thumbSize);
      ctx.drawImage(bitmap, x, y, w, h);
      bitmap.close();

      const thumbBlob = await canvas.convertToBlob({ type: "image/webp", quality: 0.7 });
      const thumbBuffer = await thumbBlob.arrayBuffer();

      self.postMessage(
        { type: "resized", fileId, buffer: thumbBuffer, mimeType: "image/webp" },
        { transfer: [thumbBuffer] }
      );
    } catch {
      self.postMessage({ type: "resized", fileId, buffer: null, mimeType: "" });
    }
  }
};
