import type { GeminiAspectRatio, ImageSizePreset, ImageStyle } from '../types/app';

export interface ImageSizePresetConfig {
  id: ImageSizePreset;
  label: string;
  subtitle: string;
  defaultWidth: number;
  defaultHeight: number;
  geminiAspectRatio: GeminiAspectRatio;
  ratioPreviewWidth: number;
  ratioPreviewHeight: number;
}

export const IMAGE_SIZE_PRESETS: ImageSizePresetConfig[] = [
  {
    id: 'a4-portrait',
    label: 'A4 Portrait',
    subtitle: '210 × 297 mm',
    defaultWidth: 1240,
    defaultHeight: 1754,
    geminiAspectRatio: '3:4',
    ratioPreviewWidth: 14,
    ratioPreviewHeight: 20,
  },
  {
    id: 'a4-landscape',
    label: 'A4 Landscape',
    subtitle: '297 × 210 mm',
    defaultWidth: 1754,
    defaultHeight: 1240,
    geminiAspectRatio: '4:3',
    ratioPreviewWidth: 20,
    ratioPreviewHeight: 14,
  },
  {
    id: 'a3-portrait',
    label: 'A3 Portrait',
    subtitle: '297 × 420 mm',
    defaultWidth: 1754,
    defaultHeight: 2480,
    geminiAspectRatio: '3:4',
    ratioPreviewWidth: 14,
    ratioPreviewHeight: 20,
  },
  {
    id: 'a3-landscape',
    label: 'A3 Landscape',
    subtitle: '420 × 297 mm',
    defaultWidth: 2480,
    defaultHeight: 1754,
    geminiAspectRatio: '4:3',
    ratioPreviewWidth: 20,
    ratioPreviewHeight: 14,
  },
  {
    id: 'a5-portrait',
    label: 'A5 Portrait',
    subtitle: '148 × 210 mm',
    defaultWidth: 874,
    defaultHeight: 1240,
    geminiAspectRatio: '3:4',
    ratioPreviewWidth: 14,
    ratioPreviewHeight: 20,
  },
  {
    id: 'a5-landscape',
    label: 'A5 Landscape',
    subtitle: '210 × 148 mm',
    defaultWidth: 1240,
    defaultHeight: 874,
    geminiAspectRatio: '4:3',
    ratioPreviewWidth: 20,
    ratioPreviewHeight: 14,
  },
  {
    id: '1:1',
    label: 'Square (1:1)',
    subtitle: 'Square',
    defaultWidth: 1024,
    defaultHeight: 1024,
    geminiAspectRatio: '1:1',
    ratioPreviewWidth: 16,
    ratioPreviewHeight: 16,
  },
  {
    id: '2:3',
    label: 'Portrait (2:3)',
    subtitle: 'Poster / Photo',
    defaultWidth: 1000,
    defaultHeight: 1500,
    geminiAspectRatio: '3:4',
    ratioPreviewWidth: 14,
    ratioPreviewHeight: 21,
  },
  {
    id: '16:9',
    label: 'Landscape (16:9)',
    subtitle: 'Widescreen',
    defaultWidth: 1920,
    defaultHeight: 1080,
    geminiAspectRatio: '16:9',
    ratioPreviewWidth: 22,
    ratioPreviewHeight: 12,
  },
  {
    id: '4:5',
    label: 'Instagram Post (4:5)',
    subtitle: 'Social Feed',
    defaultWidth: 1080,
    defaultHeight: 1350,
    geminiAspectRatio: '3:4',
    ratioPreviewWidth: 15,
    ratioPreviewHeight: 19,
  },
  {
    id: '9:16',
    label: 'Instagram Story (9:16)',
    subtitle: 'Vertical Reel / Story',
    defaultWidth: 1080,
    defaultHeight: 1920,
    geminiAspectRatio: '9:16',
    ratioPreviewWidth: 12,
    ratioPreviewHeight: 22,
  },
  {
    id: 'custom',
    label: 'Custom Size',
    subtitle: 'Custom Width × Height (px)',
    defaultWidth: 1200,
    defaultHeight: 800,
    geminiAspectRatio: '4:3',
    ratioPreviewWidth: 18,
    ratioPreviewHeight: 14,
  },
];

export const IMAGE_STYLE_OPTIONS: Array<{ id: ImageStyle; label: string; desc: string }> = [
  { id: 'auto', label: 'Auto (Exact Prompt)', desc: 'Follows your prompt style naturally' },
  { id: 'realistic', label: 'Realistic Photo', desc: 'Natural photography & sharp lens clarity' },
  { id: '3d', label: '3D Art', desc: 'Clean 3D render & studio lighting' },
  { id: 'cartoon', label: 'Cartoon', desc: 'Vibrant stylized cartoon illustration' },
  { id: 'anime', label: 'Anime', desc: 'Expressive studio anime artwork' },
  { id: 'poster', label: 'Poster Design', desc: 'Bold graphic layout & print finish' },
  { id: 'logo', label: 'Logo Design', desc: 'Clean iconic brand mark & vector craft' },
  { id: 'illustration', label: 'Illustration', desc: 'Editorial digital art & brushwork' },
  { id: 'wallpaper', label: 'Wallpaper', desc: 'Crisp immersive scenic background' },
  { id: 'cinematic', label: 'Cinematic', desc: 'Dramatic film lighting & color grade' },
];

const STANDARD_GEMINI_RATIOS: Array<{ ratio: GeminiAspectRatio; value: number }> = [
  { ratio: '1:1', value: 1 },
  { ratio: '16:9', value: 16 / 9 },
  { ratio: '9:16', value: 9 / 16 },
  { ratio: '4:3', value: 4 / 3 },
  { ratio: '3:4', value: 3 / 4 },
];

const PRO_EXTENDED_GEMINI_RATIOS: Array<{ ratio: GeminiAspectRatio; value: number }> = [
  ...STANDARD_GEMINI_RATIOS,
  { ratio: '4:1', value: 4 },
  { ratio: '1:4', value: 0.25 },
  { ratio: '8:1', value: 8 },
  { ratio: '1:8', value: 0.125 },
];

export function clampPixelDimension(val: number | undefined, fallback: number): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return fallback;
  return Math.max(128, Math.min(4096, Math.round(val)));
}

export function getClosestGeminiAspectRatio(
  width: number,
  height: number,
  allowExtendedRatios = false
): GeminiAspectRatio {
  const safeW = Math.max(1, width);
  const safeH = Math.max(1, height);
  const target = safeW / safeH;
  const candidates = allowExtendedRatios ? PRO_EXTENDED_GEMINI_RATIOS : STANDARD_GEMINI_RATIOS;

  let best = candidates[0];
  let minDiff = Math.abs(Math.log(target / best.value));
  for (const candidate of candidates) {
    const diff = Math.abs(Math.log(target / candidate.value));
    if (diff < minDiff) {
      minDiff = diff;
      best = candidate;
    }
  }
  return best.ratio;
}

const LEGACY_PRESET_ALIASES: Record<string, ImageSizePreset> = {
  a4: 'a4-portrait',
  '3:4': 'a4-portrait',
  '4:3': 'a4-landscape',
  '3:2': '16:9',
};

export function normalizeSizePreset(raw?: string): ImageSizePreset {
  if (!raw) return '1:1';
  if (IMAGE_SIZE_PRESETS.some((p) => p.id === raw)) {
    return raw as ImageSizePreset;
  }
  return LEGACY_PRESET_ALIASES[raw] || '1:1';
}

export function resolveImageDimensions(params: {
  sizePreset?: string;
  aspectRatio?: string;
  customWidth?: number;
  customHeight?: number;
  allowExtendedRatios?: boolean;
}): {
  sizePreset: ImageSizePreset;
  sizeLabel: string;
  targetWidth: number;
  targetHeight: number;
  geminiAspectRatio: GeminiAspectRatio;
} {
  const presetId = normalizeSizePreset(params.sizePreset || params.aspectRatio);

  if (presetId === 'custom') {
    const targetWidth = clampPixelDimension(params.customWidth, 1200);
    const targetHeight = clampPixelDimension(params.customHeight, 800);
    const geminiAspectRatio = getClosestGeminiAspectRatio(
      targetWidth,
      targetHeight,
      params.allowExtendedRatios
    );
    return {
      sizePreset: 'custom',
      sizeLabel: `Custom (${targetWidth}×${targetHeight} px)`,
      targetWidth,
      targetHeight,
      geminiAspectRatio,
    };
  }

  const preset =
    IMAGE_SIZE_PRESETS.find((p) => p.id === presetId) ||
    IMAGE_SIZE_PRESETS.find((p) => p.id === '1:1')!;

  return {
    sizePreset: preset.id,
    sizeLabel: preset.label,
    targetWidth: preset.defaultWidth,
    targetHeight: preset.defaultHeight,
    geminiAspectRatio: preset.geminiAspectRatio,
  };
}

/**
 * Downloads a generated image in either PNG or JPG format at its exact
 * target dimensions. Uses the server's `/api/media/...` sharp converter
 * when available, with a client canvas fallback.
 */
export async function downloadImageInFormat(options: {
  mediaUrl: string;
  format: 'png' | 'jpg';
  filenameBase: string;
  targetWidth?: number;
  targetHeight?: number;
}): Promise<void> {
  const { mediaUrl, format, filenameBase, targetWidth, targetHeight } = options;
  const ext = format === 'jpg' ? 'jpg' : 'png';
  const cleanName = `${filenameBase.replace(/\.(png|jpe?g)$/i, '')}.${ext}`;

  if (mediaUrl.startsWith('/api/media/')) {
    const separator = mediaUrl.includes('?') ? '&' : '?';
    const url = `${mediaUrl}${separator}format=${ext}&download=1&name=${encodeURIComponent(cleanName)}`;
    const link = document.createElement('a');
    link.href = url;
    link.download = cleanName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    return;
  }

  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = mediaUrl;
    });

    const w = targetWidth || img.naturalWidth || 1024;
    const h = targetHeight || img.naturalHeight || 1024;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');

    if (ext === 'jpg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);

    const mime = ext === 'jpg' ? 'image/jpeg' : 'image/png';
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, mime, 0.95)
    );
    if (!blob) throw new Error('Export failed');

    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = cleanName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch {
    const link = document.createElement('a');
    link.href = mediaUrl;
    link.download = cleanName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
}

/**
 * Detects whether a chat prompt is a direct request to generate an image,
 * and extracts any requested preset or custom pixel dimensions (e.g., A4, A3, A5, 16:9, 1200x800).
 */
export function detectImageIntentAndSize(
  rawText: string,
  fallbackPreset: ImageSizePreset,
  fallbackCustomWidth: number,
  fallbackCustomHeight: number
): {
  isImageRequest: boolean;
  prompt: string;
  sizePreset: ImageSizePreset;
  customWidth: number;
  customHeight: number;
} | null {
  const text = rawText.trim();
  if (!text || text.length > 500) return null;

  const lower = text.toLowerCase();

  // Exclude explanatory/coding/text questions so normal Q&A stays in chat
  if (
    /^(how\s+(do|can|to)|what\s+is|why\s+|explain|describe|compare|write\s+(a\s+)?(code|script|essay|story|poem|prompt|sql|table)|summarize|translate)\b/i.test(
      lower
    )
  ) {
    return null;
  }

  const directImageVerbRegex =
    /^(?:please\s+|can you\s+|could you\s+)?(?:generate|create|draw|make|design|render|paint|sketch|produce|imagine)\s+(?:me\s+)?(?:an?\s+|the\s+)?(?:[a-z0-9-]+\s+){0,4}?(?:image|picture|photo|photograph|illustration|artwork|art|poster|logo|wallpaper|cartoon|anime|portrait|3d\s+render|3d\s+art|avatar|banner|flyer|thumbnail)\b/i;
  const directSlashRegex = /^\/(?:image|img|imagine)\s+/i;
  const manglishImageRegex =
    /^(?:oru\s+)?(?:[a-z0-9-]+\s+){0,4}?(?:image|photo|picture|poster|logo|wallpaper)\s+(?:create|generate|undakk|tharu|varakk)/i;

  if (
    !directImageVerbRegex.test(text) &&
    !directSlashRegex.test(text) &&
    !manglishImageRegex.test(text)
  ) {
    return null;
  }

  const cleanPrompt = text.replace(directSlashRegex, '').trim();
  if (!cleanPrompt) return null;

  let sizePreset: ImageSizePreset = fallbackPreset;
  let customWidth = fallbackCustomWidth;
  let customHeight = fallbackCustomHeight;

  const customDimMatch = lower.match(/\b(\d{3,4})\s*[x×]\s*(\d{3,4})\b/);
  if (customDimMatch) {
    sizePreset = 'custom';
    customWidth = clampPixelDimension(Number(customDimMatch[1]), fallbackCustomWidth);
    customHeight = clampPixelDimension(Number(customDimMatch[2]), fallbackCustomHeight);
  } else if (/\ba4\s+landscape\b/.test(lower)) {
    sizePreset = 'a4-landscape';
  } else if (/\ba4(\s+portrait)?\b/.test(lower)) {
    sizePreset = 'a4-portrait';
  } else if (/\ba3\s+landscape\b/.test(lower)) {
    sizePreset = 'a3-landscape';
  } else if (/\ba3(\s+portrait)?\b/.test(lower)) {
    sizePreset = 'a3-portrait';
  } else if (/\ba5\s+landscape\b/.test(lower)) {
    sizePreset = 'a5-landscape';
  } else if (/\ba5(\s+portrait)?\b/.test(lower)) {
    sizePreset = 'a5-portrait';
  } else if (/\binstagram\s+story\b|\b9\s*:\s*16\b/.test(lower)) {
    sizePreset = '9:16';
  } else if (/\binstagram\s+post\b|\b4\s*:\s*5\b/.test(lower)) {
    sizePreset = '4:5';
  } else if (/\b16\s*:\s*9\b|\bwidescreen\b/.test(lower)) {
    sizePreset = '16:9';
  } else if (/\b2\s*:\s*3\b/.test(lower)) {
    sizePreset = '2:3';
  } else if (/\b1\s*:\s*1\b|\bsquare\b/.test(lower)) {
    sizePreset = '1:1';
  }

  return {
    isImageRequest: true,
    prompt: cleanPrompt,
    sizePreset,
    customWidth,
    customHeight,
  };
}

