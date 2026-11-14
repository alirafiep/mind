import React, { useEffect, useState } from 'react';
import { Loader2, Sliders, X } from 'lucide-react';
import { useApp } from '../context/AppContext';

export function CustomInstructionsModal() {
  const {
    showInstructionsModal,
    setShowInstructionsModal,
    customInstructions,
    updateProfile,
    user,
    setShowAuthModal,
  } = useApp();

  const [aboutUser, setAboutUser] = useState(customInstructions.aboutUser);
  const [responseStyle, setResponseStyle] = useState(customInstructions.responseStyle);
  const [enabled, setEnabled] = useState(customInstructions.enabled);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setAboutUser(customInstructions.aboutUser);
    setResponseStyle(customInstructions.responseStyle);
    setEnabled(customInstructions.enabled);
  }, [customInstructions, showInstructionsModal]);

  if (!showInstructionsModal) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setShowInstructionsModal(false);
      setShowAuthModal(true);
      return;
    }
    setSaving(true);
    try {
      await updateProfile({
        customInstructions: { aboutUser, responseStyle, enabled },
      });
      setShowInstructionsModal(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-6 animate-fadeIn">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex items-center gap-2.5">
            <Sliders className="w-5 h-5 text-indigo-600 dark:text-sky-400" />
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Custom Instructions
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Personalize how MindMaster AI understands you and formats responses.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowInstructionsModal(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <label className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 cursor-pointer">
            <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
              Enable Custom Instructions for new &amp; active chats
            </span>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="w-4 h-4 accent-indigo-600"
            />
          </label>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              What would you like MindMaster AI to know about you?
            </label>
            <textarea
              rows={3}
              value={aboutUser}
              onChange={(e) => setAboutUser(e.target.value)}
              placeholder="e.g., I am a software developer in Kerala working with TypeScript and Python..."
              className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              How would you like MindMaster AI to respond?
            </label>
            <textarea
              rows={3}
              value={responseStyle}
              onChange={(e) => setResponseStyle(e.target.value)}
              placeholder="e.g., Be concise, use clear tables for comparisons, and reply in Manglish when I ask casual questions..."
              className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowInstructionsModal(false)}
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-sm font-semibold flex items-center gap-2 cursor-pointer"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{user ? 'Save Instructions' : 'Sign In to Save'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
