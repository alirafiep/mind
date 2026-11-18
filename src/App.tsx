import React, { useEffect, useState } from 'react';
import { Crown, Menu, Moon, Sun } from 'lucide-react';
import { AppProvider, useApp } from './context/AppContext';
import { Sidebar } from './components/Sidebar';
import { ChatWorkspace } from './components/ChatWorkspace';
import { ImageGenerator } from './components/ImageGenerator';
import { VideoGenerator } from './components/VideoGenerator';
import { DocumentStudio } from './components/DocumentStudio';
import { LibraryView } from './components/LibraryView';
import { ProfileView } from './components/ProfileView';
import { UpgradeView } from './components/UpgradeView';
import { CustomInstructionsModal } from './components/CustomInstructionsModal';
import { SharedChatView } from './components/SharedChatView';
import logoSymbol from './assets/images/ai_logo_symbol_1794559700521.jpg';
import type { WorkspaceView } from './types/app';

const VIEW_TITLES: Record<WorkspaceView, string> = {
  chat: 'AI Chat Assistant',
  images: 'Image Generator',
  videos: 'Video Generator',
  documents: 'Document Studio',
  library: 'My Library',
  profile: 'Profile & Settings',
  upgrade: 'PRO Membership',
};

function MainShell() {
  const {
    theme,
    toggleTheme,
    activeView,
    setActiveView,
    isPro,
    toast,
  } = useApp();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [shareId, setShareId] = useState<string | null>(() => {
    try {
      return new URLSearchParams(window.location.search).get('share');
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const iconLink = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (iconLink) {
      iconLink.href = logoSymbol;
    }
    const onPopState = () => {
      setShareId(new URLSearchParams(window.location.search).get('share'));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  if (shareId) {
    return (
      <SharedChatView
        shareId={shareId}
        onExitShare={() => {
          window.history.pushState({}, '', window.location.pathname);
          setShareId(null);
        }}
      />
    );
  }

  return (
    <div className="h-screen w-full flex overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <Sidebar
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 h-full">
        {/* Clean Single-Row Top Bar */}
        <header className="h-14 px-4 sm:px-6 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="font-display font-semibold text-sm sm:text-base text-slate-900 dark:text-white truncate">
              {VIEW_TITLES[activeView]}
            </span>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle dark or light theme"
              className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {!isPro && (
              <button
                type="button"
                onClick={() => setActiveView('upgrade')}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-500/25 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
              >
                <Crown className="w-3.5 h-3.5 text-amber-500" />
                <span>Upgrade to PRO</span>
              </button>
            )}
          </div>
        </header>

        {/* Active Workspace */}
        <main className="flex-1 min-h-0 overflow-hidden">
          {activeView === 'chat' && <ChatWorkspace />}
          {activeView === 'images' && <ImageGenerator />}
          {activeView === 'videos' && <VideoGenerator />}
          {activeView === 'documents' && <DocumentStudio />}
          {activeView === 'library' && <LibraryView />}
          {activeView === 'profile' && <ProfileView />}
          {activeView === 'upgrade' && <UpgradeView />}
        </main>
      </div>

      <CustomInstructionsModal />

      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-xl text-xs font-medium shadow-lg border animate-fadeIn ${
            toast.type === 'error'
              ? 'bg-red-600 text-white border-red-500'
              : toast.type === 'success'
              ? 'bg-emerald-600 text-white border-emerald-500'
              : 'bg-slate-900 dark:bg-slate-800 text-white border-slate-700'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <MainShell />
    </AppProvider>
  );
}
