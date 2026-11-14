import React, { useEffect, useRef, useState } from 'react';
import {
  BookmarkPlus,
  Crown,
  Download,
  Film,
  Image as ImageIcon,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { ImageSizePicker } from './ImageSizePicker';
import {
  IMAGE_STYLE_OPTIONS,
  downloadImageInFormat,
  resolveImageDimensions,
} from '../utils/imageSizes';
import type { GeminiAspectRatio, ImageSizePreset, ImageStyle } from '../types/app';

export function ImageGenerator() {
  const {
    isPro,
    subscription,
    setSubscription,
    saveToLibrary,
    imageDraft,
    setImageDraft,
    setVideoDraft,
    setActiveView,
    notify,
  } = useApp();

  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState<ImageStyle>('auto');
  const [sizePreset, setSizePreset] = useState<ImageSizePreset>('1:1');
  const [customWidth, setCustomWidth] = useState<number>(1200);
  const [customHeight, setCustomHeight] = useState<number>(800);
  const [quality, setQuality] = useState<'standard' | 'ultra'>('standard');
  const [loading, setLoading] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<{
    mediaUrl: string;
    prompt: string;
    style: ImageStyle;
    sizePreset: ImageSizePreset;
    sizeLabel: string;
    aspectRatio: GeminiAspectRatio;
    targetWidth: number;
    targetHeight: number;
    customWidth?: number;
    customHeight?: number;
    modelUsed: string;
  } | null>(null);

  const promptRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!loading) {
      setElapsedSec(0);
      return;
    }
    const started = Date.now();
    const timer = window.setInterval(() => {
      setElapsedSec(Math.max(1, Math.floor((Date.now() - started) / 1000)));
    }, 500);
    return () => window.clearInterval(timer);
  }, [loading]);

  useEffect(() => {
    if (imageDraft) {
      setPrompt(imageDraft.prompt);
      setStyle(imageDraft.style);
      setSizePreset(imageDraft.aspectRatio);
      setImageDraft(null);
    }
  }, [imageDraft, setImageDraft]);

  const remainingCredits = Math.max(
    0,
    subscription.imageDailyLimit - subscription.imageUsageToday
  );
  const isLimitReached = remainingCredits <= 0;
  const limitMessage = isPro
    ? `You've used all ${subscription.imageDailyLimit} PRO images for today. Your credits will reset tomorrow!`
    : "You've used all 15 free images for today. Your credits will reset tomorrow!";

  const runGeneration = async (params?: {
    prompt: string;
    style: ImageStyle;
    sizePreset: ImageSizePreset;
    customWidth: number;
    customHeight: number;
  }) => {
    const activePrompt = (params?.prompt ?? prompt).trim();
    const activeStyle = params?.style ?? style;
    const activePreset = params?.sizePreset ?? sizePreset;
    const activeCustomW = params?.customWidth ?? customWidth;
    const activeCustomH = params?.customHeight ?? customHeight;

    if (!activePrompt || loading) return;

    if (isLimitReached) {
      setError(limitMessage);
      notify(limitMessage, 'error');
      return;
    }

    if (quality === 'ultra' && !isPro) {
      setActiveView('upgrade');
      notify('Ultra 2K image generation requires a PRO plan.', 'info');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await api.generateImage({
        prompt: activePrompt,
        style: activeStyle,
        sizePreset: activePreset,
        customWidth: activePreset === 'custom' ? activeCustomW : undefined,
        customHeight: activePreset === 'custom' ? activeCustomH : undefined,
        quality,
      });
      setGenerated({
        mediaUrl: res.mediaUrl,
        prompt: res.prompt,
        style: res.style,
        sizePreset: res.sizePreset,
        sizeLabel: res.sizeLabel,
        aspectRatio: res.aspectRatio,
        targetWidth: res.targetWidth,
        targetHeight: res.targetHeight,
        customWidth: activePreset === 'custom' ? activeCustomW : undefined,
        customHeight: activePreset === 'custom' ? activeCustomH : undefined,
        modelUsed: res.modelUsed,
      });
      if (res.subscription) {
        setSubscription(res.subscription);
      }
      notify('Image generated.', 'success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image generation failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    void runGeneration();
  };

  const handleSendToVideo = () => {
    if (!generated) return;
    setVideoDraft({
      prompt: generated.prompt,
      style: 'cinematic',
      sourceMediaUrl: generated.mediaUrl,
    });
    setActiveView('videos');
  };

  const resolvedPreview = resolveImageDimensions({
    sizePreset,
    customWidth,
    customHeight,
    allowExtendedRatios: isPro && quality === 'ultra',
  });

  return (
    <div className="h-full overflow-y-auto px-4 sm:px-8 py-6 custom-scrollbar">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              AI Image Studio
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Create realistic photos, 3D art, cartoons, anime, posters, logos, print formats (A3/A4/A5), and social media graphics.
            </p>
          </div>
          <div
            className={`px-3 py-1.5 rounded-xl border text-xs font-mono tabular-nums font-semibold ${
              isLimitReached
                ? 'border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200'
            }`}
          >
            {remainingCredits}/{subscription.imageDailyLimit} Images Remaining Today
          </div>
        </div>

        {isLimitReached && (
          <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-sm text-amber-800 dark:text-amber-200">
            {limitMessage}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Controls Column */}
          <form
            onSubmit={handleGenerate}
            className="lg:col-span-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-5"
          >
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Image Prompt
              </label>
              <textarea
                ref={promptRef}
                rows={4}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe any scene, logo, poster, cartoon, 3D art, anime, or wallpaper in detail..."
                className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 resize-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Image Size &amp; Format
                </label>
                <span className="text-[11px] font-mono text-indigo-600 dark:text-sky-400 tabular-nums">
                  {resolvedPreview.sizeLabel} · {resolvedPreview.targetWidth}×{resolvedPreview.targetHeight} px
                </span>
              </div>
              <ImageSizePicker
                sizePreset={sizePreset}
                customWidth={customWidth}
                customHeight={customHeight}
                onChangeSizePreset={setSizePreset}
                onChangeCustomDimensions={(w, h) => {
                  setCustomWidth(w);
                  setCustomHeight(h);
                }}
                variant="panel"
                allowExtendedRatios={isPro && quality === 'ultra'}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Visual Style
              </label>
              <select
                value={style}
                onChange={(e) => setStyle(e.target.value as ImageStyle)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 cursor-pointer"
              >
                {IMAGE_STYLE_OPTIONS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} — {s.desc}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Resolution Tier
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setQuality('standard')}
                  className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                    quality === 'standard'
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-200'
                      : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Standard 1K (Free)
                </button>
                <button
                  type="button"
                  onClick={() => setQuality('ultra')}
                  className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                    quality === 'ultra'
                      ? 'border-amber-500 bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300'
                      : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <Crown className="w-3.5 h-3.5 text-amber-500" />
                  <span>Ultra 2K (PRO)</span>
                </button>
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-xs text-red-700 dark:text-red-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!prompt.trim() || loading || isLimitReached}
              className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Generating {resolvedPreview.targetWidth}×{resolvedPreview.targetHeight}...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>
                    Generate Image ({resolvedPreview.sizeLabel} · {resolvedPreview.targetWidth}×{resolvedPreview.targetHeight})
                  </span>
                </>
              )}
            </button>
          </form>

          {/* Preview Canvas Column */}
          <div className="lg:col-span-7 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 min-h-[420px] flex flex-col justify-between">
            {loading ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-8 px-4 space-y-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-600 dark:text-sky-400" />
                  <span>
                    Generating {resolvedPreview.sizeLabel} ({resolvedPreview.targetWidth}×{resolvedPreview.targetHeight} px)
                  </span>
                  {elapsedSec > 0 && (
                    <span className="text-xs font-mono tabular-nums text-slate-400">
                      · {elapsedSec}s
                    </span>
                  )}
                </div>
                <div
                  className="relative overflow-hidden w-full max-w-md rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center gap-2"
                  style={{
                    aspectRatio: `${resolvedPreview.targetWidth} / ${resolvedPreview.targetHeight}`,
                    maxHeight: '380px',
                  }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-indigo-500/10 to-transparent animate-pulse" />
                  <Sparkles className="w-8 h-8 text-indigo-500 dark:text-sky-400 animate-pulse relative z-10" />
                  <p className="text-xs text-slate-500 dark:text-slate-400 relative z-10 px-4 line-clamp-2">
                    {prompt.trim() || 'Rendering artwork...'}
                  </p>
                </div>
              </div>
            ) : generated ? (
              <div className="space-y-4">
                <div className="rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-center p-2">
                  <div
                    className="overflow-hidden rounded-lg flex items-center justify-center max-h-[500px] max-w-full"
                    style={{
                      aspectRatio: `${generated.targetWidth} / ${generated.targetHeight}`,
                    }}
                  >
                    <img
                      src={generated.mediaUrl}
                      alt={generated.prompt}
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
                    <span>{generated.sizeLabel}</span>
                    <span className="mx-1.5">·</span>
                    <span className="tabular-nums">
                      {generated.targetWidth}×{generated.targetHeight} px
                    </span>
                    {generated.style !== 'auto' && (
                      <>
                        <span className="mx-1.5">·</span>
                        <span className="capitalize">{generated.style}</span>
                      </>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        void downloadImageInFormat({
                          mediaUrl: generated.mediaUrl,
                          format: 'png',
                          filenameBase: `mindmaster-${generated.sizePreset}-${Date.now()}`,
                          targetWidth: generated.targetWidth,
                          targetHeight: generated.targetHeight,
                        })
                      }
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download PNG</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        void downloadImageInFormat({
                          mediaUrl: generated.mediaUrl,
                          format: 'jpg',
                          filenameBase: `mindmaster-${generated.sizePreset}-${Date.now()}`,
                          targetWidth: generated.targetWidth,
                          targetHeight: generated.targetHeight,
                        })
                      }
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 text-white text-xs font-semibold cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download JPG</span>
                    </button>

                    <button
                      type="button"
                      disabled={loading || isLimitReached}
                      onClick={() =>
                        void runGeneration({
                          prompt: generated.prompt,
                          style: generated.style,
                          sizePreset: generated.sizePreset,
                          customWidth: generated.customWidth || generated.targetWidth,
                          customHeight: generated.customHeight || generated.targetHeight,
                        })
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                      <span>Regenerate</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setPrompt('');
                        promptRef.current?.focus();
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Create Another Image</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        void saveToLibrary({
                          type: 'image',
                          title: generated.prompt.slice(0, 70),
                          prompt: generated.prompt,
                          style: generated.style,
                          aspectRatio: `${generated.sizePreset} (${generated.targetWidth}×${generated.targetHeight})`,
                          mediaUrl: generated.mediaUrl,
                          mimeType: 'image/png',
                        })
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <BookmarkPlus className="w-3.5 h-3.5" />
                      <span>Save to Library</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        void saveToLibrary({
                          type: 'design',
                          title: `Design: ${generated.prompt.slice(0, 60)}`,
                          prompt: generated.prompt,
                          style: generated.style,
                          aspectRatio: `${generated.sizePreset} (${generated.targetWidth}×${generated.targetHeight})`,
                          mediaUrl: generated.mediaUrl,
                          mimeType: 'image/png',
                        })
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>Save as Design</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSendToVideo}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <Film className="w-3.5 h-3.5" />
                      <span>Animate (PRO)</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-16 px-4">
                <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-4">
                  <ImageIcon className="w-7 h-7" />
                </div>
                <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
                  Ready to create
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mt-1.5">
                  Write any prompt, choose a paper, social, or custom pixel size, and download in PNG or JPG.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
