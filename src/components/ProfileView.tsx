import React, { useState } from 'react';
import { Crown, LogOut, Moon, Sliders, Sun, User as UserIcon } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';

export function ProfileView() {
  const {
    user,
    isPro,
    subscription,
    setSubscription,
    theme,
    toggleTheme,
    updateProfile,
    signOut,
    setShowAuthModal,
    setShowInstructionsModal,
    setActiveView,
    notify,
  } = useApp();

  const [displayName, setDisplayName] = useState(user?.name || '');
  const [saving, setSaving] = useState(false);

  if (!user) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-sky-400 flex items-center justify-center mx-auto">
            <UserIcon className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Sign in to view your Profile
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Save your chat history, custom instructions, personal library, and PRO subscription to your account.
          </p>
          <button
            type="button"
            onClick={() => setShowAuthModal(true)}
            className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold cursor-pointer"
          >
            Sign In / Connect Account
          </button>
        </div>
      </div>
    );
  }

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;
    setSaving(true);
    try {
      await updateProfile({ name: displayName.trim() });
    } finally {
      setSaving(false);
    }
  };

  const handleCancelPro = async () => {
    try {
      const res = await api.cancelSubscription();
      setSubscription(res.subscription);
      notify('PRO subscription canceled. Reverted to FREE tier.', 'info');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to cancel plan.', 'error');
    }
  };

  return (
    <div className="h-full overflow-y-auto px-4 sm:px-8 py-6 custom-scrollbar">
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Profile &amp; Settings
        </h1>

        {/* Account Identity */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-5">
          <div className="flex items-center gap-4">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name}
                referrerPolicy="no-referrer"
                className="w-14 h-14 rounded-full object-cover"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xl font-bold">
                {user.name.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">{user.name}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
            </div>
          </div>

          <form onSubmit={handleSaveName} className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="flex-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white"
              placeholder="Display name"
            />
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer"
            >
              Update Name
            </button>
          </form>
        </div>

        {/* Subscription & Usage */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Crown className={`w-4 h-4 ${isPro ? 'text-amber-500' : 'text-slate-400'}`} />
                <span>Membership Tier: {isPro ? 'PRO' : 'FREE'}</span>
              </h3>
              {isPro && subscription.currentPeriodEnd && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Active {subscription.plan} plan · Valid until{' '}
                  {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                </p>
              )}
            </div>

            {isPro ? (
              <button
                type="button"
                onClick={() => void handleCancelPro()}
                className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel PRO Plan
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setActiveView('upgrade')}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer"
              >
                Upgrade to PRO
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <p className="text-xs text-slate-500 dark:text-slate-400">Images Remaining Today</p>
              <p className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
                {Math.max(0, subscription.imageDailyLimit - subscription.imageUsageToday)} / {subscription.imageDailyLimit}
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <p className="text-xs text-slate-500 dark:text-slate-400">Monthly Videos Used</p>
              <p className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
                {subscription.videoUsageMonth} / {subscription.videoMonthlyLimit}
              </p>
            </div>
          </div>
        </div>

        {/* Preferences */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-2">Preferences</h3>

          <button
            type="button"
            onClick={toggleTheme}
            className="w-full flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-800 dark:text-slate-200 cursor-pointer"
          >
            <span className="flex items-center gap-2.5">
              {theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              <span>Appearance Theme</span>
            </span>
            <span className="text-xs font-mono uppercase text-slate-500">{theme}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowInstructionsModal(true)}
            className="w-full flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-800 dark:text-slate-200 cursor-pointer"
          >
            <span className="flex items-center gap-2.5">
              <Sliders className="w-4 h-4" />
              <span>Custom Instructions</span>
            </span>
            <span className="text-xs text-indigo-600 dark:text-sky-400">Configure</span>
          </button>

          <button
            type="button"
            onClick={signOut}
            className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 text-xs font-semibold cursor-pointer mt-2"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
}
