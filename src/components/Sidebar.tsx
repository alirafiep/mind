import React, { useState } from 'react';
import {
  Check,
  Crown,
  Edit3,
  EyeOff,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  LogIn,
  MessageSquare,
  Plus,
  Search,
  Share2,
  Sliders,
  Trash2,
  User,
  Video,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import logoSymbol from '../assets/images/ai_logo_symbol_1794559700521.jpg';
import type { WorkspaceView } from '../types/app';

interface SidebarProps {
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({ mobileOpen, onCloseMobile }: SidebarProps) {
  const {
    activeView,
    setActiveView,
    user,
    isPro,
    chats,
    activeChatId,
    createNewChat,
    selectChat,
    renameChat,
    deleteChat,
    setShowAuthModal,
    setShowInstructionsModal,
    notify,
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const filteredChats = chats.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.title.toLowerCase().includes(q) ||
      c.messages.some((m) => m.content.toLowerCase().includes(q))
    );
  });

  const handleNav = (view: WorkspaceView) => {
    setActiveView(view);
    onCloseMobile();
  };

  const handleStartRename = (id: string, currentTitle: string) => {
    setEditingChatId(id);
    setEditingTitle(currentTitle);
  };

  const handleConfirmRename = async (id: string) => {
    if (editingTitle.trim()) {
      await renameChat(id, editingTitle.trim());
    }
    setEditingChatId(null);
  };

  const handleShare = async (chatId: string) => {
    if (!user) {
      setShowAuthModal(true);
      notify('Sign in to generate a shareable link for this conversation.', 'info');
      return;
    }
    try {
      const res = await api.shareChat(chatId);
      const shareUrl = `${window.location.origin}/?share=${res.shareId}`;
      await navigator.clipboard.writeText(shareUrl).catch(() => {});
      notify('Share link copied to clipboard.', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to share conversation.', 'error');
    }
  };

  const navItems: Array<{
    id: WorkspaceView;
    label: string;
    icon: React.ReactNode;
    proLabel?: boolean;
  }> = [
    { id: 'chat', label: 'AI Chat', icon: <MessageSquare className="w-4 h-4" /> },
    { id: 'images', label: 'Image Generator', icon: <ImageIcon className="w-4 h-4" /> },
    { id: 'videos', label: 'Video Generator', icon: <Video className="w-4 h-4" />, proLabel: true },
    { id: 'documents', label: 'Document Studio', icon: <FileText className="w-4 h-4" /> },
    { id: 'library', label: 'My Library', icon: <FolderOpen className="w-4 h-4" /> },
  ];

  const sidebarContent = (
    <div className="flex flex-col h-full w-68 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 select-none">
      {/* Brand + Mobile Close */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <button
          type="button"
          onClick={() => handleNav('chat')}
          className="flex items-center gap-2.5 font-display font-bold text-base tracking-tight text-slate-900 dark:text-white whitespace-nowrap cursor-pointer"
        >
          <img
            src={logoSymbol}
            alt="Brand symbol"
            referrerPolicy="no-referrer"
            className="w-7 h-7 rounded-lg object-cover shrink-0 border border-slate-200 dark:border-slate-700"
          />
          <span>MindMaster AI</span>
        </button>
        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          aria-label="Close sidebar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* New Chat & Temporary Chat Actions */}
      <div className="p-3 space-y-2 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              createNewChat(false);
              onCloseMobile();
            }}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Chat</span>
          </button>
          <button
            type="button"
            onClick={() => {
              createNewChat(true);
              onCloseMobile();
            }}
            title="Start Temporary Chat (not saved to history)"
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <EyeOff className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Primary Navigation */}
      <nav className="p-2.5 space-y-0.5 border-b border-slate-200 dark:border-slate-800 shrink-0">
        {navItems.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNav(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
              }`}
            >
              <span className="flex items-center gap-2.5 truncate">
                {item.icon}
                <span>{item.label}</span>
              </span>
              {item.proLabel && (
                <span className="text-[11px] font-mono font-semibold text-amber-600 dark:text-amber-400">
                  PRO
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Search & Chat History */}
      <div className="flex-1 flex flex-col min-h-0 px-3 pt-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Chat History
          </span>
          <span className="text-xs font-mono tabular-nums text-slate-400 dark:text-slate-500">
            {filteredChats.length}
          </span>
        </div>

        <div className="relative mb-2.5">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations..."
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          />
        </div>

        <div className="flex-1 overflow-y-auto space-y-1 pb-3 custom-scrollbar">
          {filteredChats.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500 py-4 text-center">
              {searchQuery ? 'No matching chats.' : 'No conversations yet.'}
            </p>
          ) : (
            filteredChats.map((chat) => {
              const isSelected = activeView === 'chat' && activeChatId === chat.id;
              const isEditing = editingChatId === chat.id;

              return (
                <div
                  key={chat.id}
                  className={`group flex items-center justify-between gap-1 px-2.5 py-2 rounded-lg text-xs transition-colors ${
                    isSelected
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-medium'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100/70 dark:hover:bg-slate-800/50'
                  }`}
                >
                  {isEditing ? (
                    <div className="flex items-center gap-1 w-full">
                      <input
                        type="text"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void handleConfirmRename(chat.id);
                          if (e.key === 'Escape') setEditingChatId(null);
                        }}
                        autoFocus
                        className="flex-1 min-w-0 px-2 py-1 rounded bg-white dark:bg-slate-950 border border-indigo-500 text-xs text-slate-900 dark:text-white focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => void handleConfirmRename(chat.id)}
                        className="p-1 text-emerald-600 dark:text-emerald-400 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          selectChat(chat.id);
                          onCloseMobile();
                        }}
                        className="flex-1 min-w-0 flex items-center gap-2 text-left cursor-pointer"
                      >
                        {chat.isTemporary && (
                          <span title="Temporary Chat" className="inline-flex shrink-0">
                            <EyeOff className="w-3 h-3 text-amber-500" />
                          </span>
                        )}
                        <span className="truncate">{chat.title}</span>
                      </button>

                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
                        {!chat.isTemporary && (
                          <button
                            type="button"
                            onClick={() => void handleShare(chat.id)}
                            title="Share conversation"
                            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-pointer"
                          >
                            <Share2 className="w-3 h-3" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleStartRename(chat.id, chat.title)}
                          title="Rename chat"
                          className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-pointer"
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteChat(chat.id)}
                          title="Delete chat"
                          className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-500/20 text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Bottom Account, Custom Instructions & Upgrade */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-1.5 shrink-0">
        {!isPro && (
          <button
            type="button"
            onClick={() => handleNav('upgrade')}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-500 hover:to-sky-500 text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Crown className="w-3.5 h-3.5" />
              <span>Upgrade to PRO</span>
            </span>
            <span>$19/mo</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setShowInstructionsModal(true)}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Custom Instructions</span>
        </button>

        {user ? (
          <button
            type="button"
            onClick={() => handleNav('profile')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors cursor-pointer ${
              activeView === 'profile'
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white'
                : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
            }`}
          >
            <span className="flex items-center gap-2.5 min-w-0">
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.name}
                  referrerPolicy="no-referrer"
                  className="w-6 h-6 rounded-full object-cover shrink-0"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[11px] font-semibold shrink-0">
                  {user.name.slice(0, 1).toUpperCase()}
                </div>
              )}
              <span className="truncate font-medium">{user.username || user.name}</span>
            </span>
            <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 shrink-0">
              {isPro ? 'PRO' : 'FREE'}
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setShowAuthModal(true)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Continue with Google</span>
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block h-full shrink-0">{sidebarContent}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs"
            onClick={onCloseMobile}
          />
          <div className="relative z-10 h-full">{sidebarContent}</div>
        </div>
      )}
    </>
  );
}
