import React, { useEffect, useRef, useState } from 'react';
import {
  BookmarkPlus,
  Crown,
  Download,
  Film,
  Image as ImageIcon,
  Loader2,
  Lock,
  Upload,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import type { VideoStyle } from '../types/app';

const VIDEO_STYLES: Array<{ id: VideoStyle; label: string }> = [
  { id: 'cinematic', label: 'Cinematic' },
  { id: 'realistic', label: 'Realistic' },
  { id: '3d_animation', label: '3D Animation' },
  { id: 'anime', label: 'Anime' },
  { id: 'commercial', label: 'Commercial' },
  { id: 'documentary', label: 'Documentary' },
];

export function VideoGenerator() {
  const {
    isPro,
    subscription,
    setSubscription,
    libraryItems,
    saveToLibrary,
    videoDraft,
    setVideoDraft,
    setActiveView,
    notify,
  } = useApp();

  const [mode, setMode] = useState<'text-to-video' | 'image-to-video'>('text-to-video');
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState<VideoStyle>('cinematic');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [duration, setDuration] = useState<'5s' | '10s' | '15s'>('5s');
  const [resolution, setResolution] = useState<'720p' | '1080p'>('720p');

  const [sourceImageBase64, setSourceImageBase64] = useState<string | undefined>(undefined);
  const [sourceImageMimeType, setSourceImageMimeType] = useState<string>('image/png');
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState<string | undefined>(undefined);
  const [sourceMediaUrl, setSourceMediaUrl] = useState<string | undefined>(undefined);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedVideo, setGeneratedVideo] = useState<{
    mediaUrl: string;
    prompt: string;
    style: VideoStyle;
    aspectRatio: string;
    duration: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (videoDraft) {
      setPrompt(videoDraft.prompt);
      setStyle(videoDraft.style);
      if (videoDraft.sourceMediaUrl) {
        setMode('image-to-video');
        setSourceMediaUrl(videoDraft.sourceMediaUrl);
        setSourcePreviewUrl(videoDraft.sourceMediaUrl);
        setSourceImageBase64(undefined);
      }
      setVideoDraft(null);
    }
  }, [videoDraft, setVideoDraft]);

  const savedImages = libraryItems.filter(
    (item) => (item.type === 'image' || item.type === 'design') && item.mediaUrl
  );

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.readAsDataURL(file);
    });
    setSourcePreviewUrl(dataUrl);
    setSourceImageBase64(dataUrl.split(',')[1]);
    setSourceImageMimeType(file.type || 'image/png');
    setSourceMediaUrl(undefined);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPro) {
      setActiveView('upgrade');
      return;
    }
    if (!prompt.trim() && !sourceImageBase64 && !sourceMediaUrl) {
      setError('Enter a video prompt or attach a starting image.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await api.generateVideo({
        prompt: prompt.trim(),
        style,
        aspectRatio,
        duration,
        resolution,
        sourceImageBase64: mode === 'image-to-video' ? sourceImageBase64 : undefined,
        sourceImageMimeType,
        sourceMediaUrl: mode === 'image-to-video' ? sourceMediaUrl : undefined,
      });
      setGeneratedVideo({
        mediaUrl: res.mediaUrl,
        prompt: res.prompt,
        style: res.style,
        aspectRatio: res.aspectRatio,
        duration: res.duration,
      });
      setSubscription(res.subscription);
      notify('Video generated successfully.', 'success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Video generation failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto px-4 sm:px-8 py-6 custom-scrollbar">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                AI Video Studio
              </h1>
              <span className="text-xs font-mono font-semibold text-amber-600 dark:text-amber-400">
                PRO FEATURE
              </span>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Create cinematic videos from text descriptions or animate existing images into motion scenes.
            </p>
          </div>
          {isPro && (
            <div className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
              Monthly Videos: {subscription.videoUsageMonth} / {subscription.videoMonthlyLimit}
            </div>
          )}
        </div>

        {/* PRO Upgrade Banner for Free Users */}
        {!isPro && (
          <div className="rounded-2xl bg-gradient-to-r from-indigo-600/15 via-sky-500/10 to-amber-500/15 border border-indigo-300/60 dark:border-indigo-500/30 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 shrink-0">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  AI Video Generation is exclusive to PRO Subscribers
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                  Explore the video studio controls below, or upgrade to PRO to unlock Text-to-Video, Image-to-Video, 1080p export, and priority processing.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveView('upgrade')}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Crown className="w-4 h-4 text-amber-300" />
              <span>Upgrade to PRO</span>
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Controls */}
          <form
            onSubmit={handleGenerate}
            className="lg:col-span-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-5"
          >
            {/* Mode Toggle */}
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setMode('text-to-video')}
                className={`py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  mode === 'text-to-video'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Text-to-Video
              </button>
              <button
                type="button"
                onClick={() => setMode('image-to-video')}
                className={`py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  mode === 'image-to-video'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Image-to-Video
              </button>
            </div>

            {mode === 'image-to-video' && (
              <div className="space-y-3">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Starting Frame Image
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />

                {sourcePreviewUrl ? (
                  <div className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
                    <img
                      src={sourcePreviewUrl}
                      alt="Source frame"
                      className="w-full h-40 object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setSourcePreviewUrl(undefined);
                        setSourceImageBase64(undefined);
                        setSourceMediaUrl(undefined);
                      }}
                      className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-6 px-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-500 text-xs text-slate-500 dark:text-slate-400 flex flex-col items-center gap-2 cursor-pointer"
                  >
                    <Upload className="w-5 h-5" />
                    <span>Upload an image from your device</span>
                  </button>
                )}

                {savedImages.length > 0 && (
                  <div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-1.5">
                      Or pick from My Library:
                    </p>
                    <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                      {savedImages.slice(0, 8).map((img) => (
                        <button
                          key={img.id}
                          type="button"
                          onClick={() => {
                            setSourceMediaUrl(img.mediaUrl);
                            setSourcePreviewUrl(img.mediaUrl);
                            setSourceImageBase64(undefined);
                          }}
                          className="w-12 h-12 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0 cursor-pointer hover:ring-2 hover:ring-indigo-500"
                        >
                          <img
                            src={img.mediaUrl}
                            alt={img.title}
                            className="w-full h-full object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                {mode === 'image-to-video' ? 'Motion & Camera Prompt' : 'Video Prompt'}
              </label>
              <textarea
                rows={4}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={
                  mode === 'image-to-video'
                    ? 'Describe camera motion, wind, lighting shifts, or character movement...'
                    : 'Describe the scene, action, camera movement, and atmosphere...'
                }
                className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Video Style
              </label>
              <div className="grid grid-cols-2 gap-2">
                {VIDEO_STYLES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setStyle(s.id)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                      style === s.id
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-200'
                        : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Ratio
                </label>
                <select
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value as '16:9' | '9:16')}
                  className="w-full px-2.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-800 dark:text-slate-200"
                >
                  <option value="16:9">16:9</option>
                  <option value="9:16">9:16</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Duration
                </label>
                <select
                  value={duration}
                  onChange={(e) => setDuration(e.target.value as '5s' | '10s' | '15s')}
                  className="w-full px-2.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-800 dark:text-slate-200"
                >
                  <option value="5s">5s</option>
                  <option value="10s">10s</option>
                  <option value="15s">15s</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Quality
                </label>
                <select
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value as '720p' | '1080p')}
                  className="w-full px-2.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-800 dark:text-slate-200"
                >
                  <option value="720p">720p</option>
                  <option value="1080p">1080p</option>
                </select>
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-xs text-red-700 dark:text-red-300">
                {error}
              </div>
            )}

            {isPro ? (
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Rendering Video (may take 1–2 min)...</span>
                  </>
                ) : (
                  <>
                    <Film className="w-4 h-4" />
                    <span>Generate Video</span>
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setActiveView('upgrade')}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-500 hover:to-sky-500 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <Crown className="w-4 h-4 text-amber-300" />
                <span>Upgrade to PRO to Generate</span>
              </button>
            )}
          </form>

          {/* Video Preview Column */}
          <div className="lg:col-span-7 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 min-h-[420px] flex flex-col justify-between">
            {generatedVideo ? (
              <div className="space-y-4">
                <div className="rounded-xl overflow-hidden bg-black border border-slate-800">
                  <video
                    src={generatedVideo.mediaUrl}
                    controls
                    autoPlay
                    loop
                    className="w-full max-h-[480px]"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    <span>{generatedVideo.style}</span>
                    <span className="mx-1.5">·</span>
                    <span className="font-mono">{generatedVideo.aspectRatio}</span>
                    <span className="mx-1.5">·</span>
                    <span className="font-mono">{generatedVideo.duration}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        void saveToLibrary({
                          type: 'video',
                          title: generatedVideo.prompt.slice(0, 70),
                          prompt: generatedVideo.prompt,
                          style: generatedVideo.style,
                          aspectRatio: generatedVideo.aspectRatio,
                          mediaUrl: generatedVideo.mediaUrl,
                          mimeType: 'video/mp4',
                        })
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <BookmarkPlus className="w-3.5 h-3.5" />
                      <span>Save to Library</span>
                    </button>

                    <a
                      href={generatedVideo.mediaUrl}
                      download={`mindmaster-video-${Date.now()}.mp4`}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download MP4</span>
                    </a>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-16 px-4">
                <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-4">
                  {mode === 'image-to-video' ? (
                    <ImageIcon className="w-7 h-7" />
                  ) : (
                    <Film className="w-7 h-7" />
                  )}
                </div>
                <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
                  {isPro ? 'Video preview canvas' : 'PRO Video Generation'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mt-1.5">
                  {isPro
                    ? 'Enter a prompt or upload an image frame to generate an AI video clip.'
                    : 'Free users can inspect studio capabilities here. Subscribe to PRO to unlock AI video creation.'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
