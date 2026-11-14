import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeftRight, Check, ChevronDown, Maximize2 } from 'lucide-react';
import type { ImageSizePreset } from '../types/app';
import {
  IMAGE_SIZE_PRESETS,
  clampPixelDimension,
  resolveImageDimensions,
} from '../utils/imageSizes';

interface ImageSizePickerProps {
  sizePreset: ImageSizePreset;
  customWidth: number;
  customHeight: number;
  onChangeSizePreset: (preset: ImageSizePreset) => void;
  onChangeCustomDimensions: (width: number, height: number) => void;
  variant?: 'popover' | 'panel';
  allowExtendedRatios?: boolean;
}

export function ImageSizePicker({
  sizePreset,
  customWidth,
  customHeight,
  onChangeSizePreset,
  onChangeCustomDimensions,
  variant = 'popover',
  allowExtendedRatios = false,
}: ImageSizePickerProps) {
  const [open, setOpen] = useState(false);
  const [draftW, setDraftW] = useState(String(customWidth));
  const [draftH, setDraftH] = useState(String(customHeight));
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setDraftW(String(customWidth));
    setDraftH(String(customHeight));
  }, [customWidth, customHeight]);

  useEffect(() => {
    if (!open || variant !== 'popover') return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open, variant]);

  const resolved = resolveImageDimensions({
    sizePreset,
    customWidth,
    customHeight,
    allowExtendedRatios,
  });

  const commitCustomInputs = (nextWStr: string, nextHStr: string) => {
    const parsedW = parseInt(nextWStr, 10);
    const parsedH = parseInt(nextHStr, 10);
    const w = clampPixelDimension(Number.isNaN(parsedW) ? customWidth : parsedW, 1200);
    const h = clampPixelDimension(Number.isNaN(parsedH) ? customHeight : parsedH, 800);
    onChangeCustomDimensions(w, h);
  };

  const handleSwapDimensions = () => {
    const w = clampPixelDimension(Number(draftW) || customWidth, 1200);
    const h = clampPixelDimension(Number(draftH) || customHeight, 800);
    setDraftW(String(h));
    setDraftH(String(w));
    onChangeCustomDimensions(h, w);
  };

  const renderPresetList = () => (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {IMAGE_SIZE_PRESETS.map((preset) => {
          const isSelected = sizePreset === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => {
                onChangeSizePreset(preset.id);
                if (preset.id !== 'custom' && variant === 'popover') {
                  setOpen(false);
                }
              }}
              className={`flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-xl border text-left transition-colors cursor-pointer ${
                isSelected
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-200'
                  : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/70 text-slate-700 dark:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0">
                  {preset.id === 'custom' ? (
                    <Maximize2 className="w-3.5 h-3.5 text-indigo-500 dark:text-sky-400" />
                  ) : (
                    <span
                      className="rounded-[2px] border-[1.5px] border-current opacity-80"
                      style={{
                        width: `${preset.ratioPreviewWidth}px`,
                        height: `${preset.ratioPreviewHeight}px`,
                      }}
                    />
                  )}
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-semibold truncate">{preset.label}</div>
                  <div className="text-[10px] font-mono opacity-65 tabular-nums truncate">
                    {preset.id === 'custom'
                      ? sizePreset === 'custom'
                        ? `${customWidth} × ${customHeight} px`
                        : 'Enter W × H px'
                      : `${preset.defaultWidth} × ${preset.defaultHeight} px · ${preset.subtitle}`}
                  </div>
                </div>
              </div>
              {isSelected && <Check className="w-3.5 h-3.5 shrink-0 text-indigo-600 dark:text-sky-400" />}
            </button>
          );
        })}
      </div>

      {sizePreset === 'custom' && (
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
              Custom Dimensions (px)
            </span>
            <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
              Base ratio: {resolved.geminiAspectRatio}
            </span>
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                Width (px)
              </label>
              <input
                type="number"
                min={128}
                max={4096}
                value={draftW}
                onChange={(e) => {
                  setDraftW(e.target.value);
                  const n = parseInt(e.target.value, 10);
                  if (!Number.isNaN(n) && n >= 128 && n <= 4096) {
                    onChangeCustomDimensions(n, customHeight);
                  }
                }}
                onBlur={() => commitCustomInputs(draftW, draftH)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
            </div>

            <button
              type="button"
              onClick={handleSwapDimensions}
              title="Swap width and height"
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
            </button>

            <div className="flex-1">
              <label className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                Height (px)
              </label>
              <input
                type="number"
                min={128}
                max={4096}
                value={draftH}
                onChange={(e) => {
                  setDraftH(e.target.value);
                  const n = parseInt(e.target.value, 10);
                  if (!Number.isNaN(n) && n >= 128 && n <= 4096) {
                    onChangeCustomDimensions(customWidth, n);
                  }
                }}
                onBlur={() => commitCustomInputs(draftW, draftH)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
            </div>
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
            <span>Allowed range: 128–4096 px</span>
            {variant === 'popover' && (
              <button
                type="button"
                onClick={() => {
                  commitCustomInputs(draftW, draftH);
                  setOpen(false);
                }}
                className="px-2.5 py-1 rounded-md bg-indigo-600 text-white font-semibold hover:bg-indigo-500 cursor-pointer"
              >
                Apply Size
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );

  if (variant === 'panel') {
    return renderPresetList();
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Select image size"
        className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-sky-500 text-xs font-medium text-slate-800 dark:text-slate-100 transition-colors cursor-pointer"
      >
        <Maximize2 className="w-3.5 h-3.5 text-indigo-600 dark:text-sky-400 shrink-0" />
        <span className="font-semibold">Size:</span>
        <span className="text-indigo-700 dark:text-sky-300 font-semibold">
          {sizePreset === 'custom'
            ? `Custom (${customWidth}×${customHeight})`
            : resolved.sizeLabel}
        </span>
        <span className="hidden sm:inline font-mono text-slate-500 dark:text-slate-400 tabular-nums">
          · {resolved.targetWidth}×{resolved.targetHeight} px
        </span>
        <ChevronDown className={`w-3.5 h-3.5 opacity-70 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 bottom-full mb-2 w-[min(92vw,500px)] p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl z-40 animate-fadeIn">
          <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h4 className="text-xs font-semibold text-slate-900 dark:text-white">
                Select Image Size &amp; Format
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Selected dimensions are applied to the generated image
              </p>
            </div>
            <span className="text-[11px] font-mono tabular-nums text-indigo-600 dark:text-sky-400">
              {resolved.targetWidth}×{resolved.targetHeight} px
            </span>
          </div>
          <div className="max-h-[55vh] overflow-y-auto custom-scrollbar pr-0.5">
            {renderPresetList()}
          </div>
        </div>
      )}
    </div>
  );
}
