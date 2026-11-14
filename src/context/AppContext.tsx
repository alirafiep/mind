import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, getStoredToken, setStoredToken } from '../services/api';
import type {
  AspectRatioOption,
  ChatSession,
  CustomInstructions,
  ImageStyle,
  LanguagePreference,
  LibraryFolder,
  LibraryItem,
  LibraryItemType,
  SubscriptionInfo,
  Theme,
  UserProfile,
  VideoStyle,
  WorkspaceView,
} from '../types/app';

const GUEST_CHATS_KEY = 'mindmaster_guest_chats_v2';
const GUEST_LIBRARY_KEY = 'mindmaster_guest_library_v2';
const THEME_KEY = 'mindmaster_theme_v2';
const LANG_KEY = 'mindmaster_lang_v2';

const DEFAULT_SUBSCRIPTION: SubscriptionInfo = {
  tier: 'free',
  plan: 'none',
  status: 'none',
  imageUsageToday: 0,
  imageDailyLimit: 15,
  videoUsageMonth: 0,
  videoMonthlyLimit: 0,
};

const DEFAULT_CUSTOM_INSTRUCTIONS: CustomInstructions = {
  aboutUser: '',
  responseStyle: '',
  enabled: false,
};

export interface ImageDraftConfig {
  prompt: string;
  style: ImageStyle;
  aspectRatio: AspectRatioOption;
}

export interface VideoDraftConfig {
  prompt: string;
  style: VideoStyle;
  sourceMediaUrl?: string;
}

interface AppContextValue {
  theme: Theme;
  toggleTheme: () => void;
  language: LanguagePreference;
  setLanguage: (lang: LanguagePreference) => void;
  activeView: WorkspaceView;
  setActiveView: (view: WorkspaceView) => void;

  // Auth & Subscription
  authReady: boolean;
  user: UserProfile | null;
  isPro: boolean;
  subscription: SubscriptionInfo;
  googleClientId: string | null;
  stripeEnabled: boolean;
  customInstructions: CustomInstructions;
  signInAccount: (email: string, name: string) => Promise<void>;
  signInGoogle: (payload: { idToken?: string; accessToken?: string }) => Promise<void>;
  signOut: () => void;
  updateProfile: (updates: {
    name?: string;
    preferredLanguage?: LanguagePreference;
    theme?: Theme;
    customInstructions?: CustomInstructions;
  }) => Promise<void>;
  setSubscription: (sub: SubscriptionInfo) => void;
  refreshAccount: () => Promise<void>;

  // Chats
  chats: ChatSession[];
  activeChatId: string | null;
  activeChat: ChatSession | null;
  createNewChat: (temporary?: boolean) => ChatSession;
  selectChat: (chatId: string) => void;
  saveChat: (chat: ChatSession, persistToServer?: boolean) => Promise<void>;
  renameChat: (chatId: string, newTitle: string) => Promise<void>;
  deleteChat: (chatId: string) => Promise<void>;

  // Personal Library
  folders: LibraryFolder[];
  libraryItems: LibraryItem[];
  saveToLibrary: (payload: {
    type: LibraryItemType;
    title: string;
    folderId?: string | null;
    content?: string;
    prompt?: string;
    style?: string;
    aspectRatio?: string;
    mediaUrl?: string;
    mimeType?: string;
    metadata?: Record<string, string | number | boolean>;
  }) => Promise<LibraryItem | null>;
  uploadFileToLibrary: (payload: {
    title: string;
    type: LibraryItemType;
    folderId?: string | null;
    mimeType: string;
    base64?: string;
    textContent?: string;
  }) => Promise<LibraryItem | null>;
  updateLibraryItem: (
    id: string,
    updates: Partial<Pick<LibraryItem, 'title' | 'folderId' | 'content' | 'prompt' | 'style' | 'aspectRatio'>>
  ) => Promise<void>;
  deleteLibraryItem: (id: string) => Promise<void>;
  createFolder: (name: string) => Promise<void>;
  renameFolder: (id: string, name: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;

  // Cross-studio editing handoffs
  imageDraft: ImageDraftConfig | null;
  setImageDraft: (draft: ImageDraftConfig | null) => void;
  videoDraft: VideoDraftConfig | null;
  setVideoDraft: (draft: VideoDraftConfig | null) => void;
  activeDocument: LibraryItem | null;
  setActiveDocument: (doc: LibraryItem | null) => void;
  continueEditingLibraryItem: (item: LibraryItem) => void;

  // Modals & Toast
  showAuthModal: boolean;
  setShowAuthModal: (open: boolean) => void;
  showInstructionsModal: boolean;
  setShowInstructionsModal: (open: boolean) => void;
  toast: { message: string; type: 'info' | 'success' | 'error' } | null;
  notify: (message: string, type?: 'info' | 'success' | 'error') => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      return saved === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });

  const [language, setLanguageState] = useState<LanguagePreference>(() => {
    try {
      return (localStorage.getItem(LANG_KEY) as LanguagePreference) || 'auto';
    } catch {
      return 'auto';
    }
  });

  const [activeView, setActiveView] = useState<WorkspaceView>('chat');
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionInfo>(DEFAULT_SUBSCRIPTION);
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const [stripeEnabled, setStripeEnabled] = useState(false);

  const [chats, setChats] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [folders, setFolders] = useState<LibraryFolder[]>([]);
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);

  const [imageDraft, setImageDraft] = useState<ImageDraftConfig | null>(null);
  const [videoDraft, setVideoDraft] = useState<VideoDraftConfig | null>(null);
  const [activeDocument, setActiveDocument] = useState<LibraryItem | null>(null);

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showInstructionsModal, setShowInstructionsModal] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'success' | 'error' } | null>(null);

  const notify = useCallback((message: string, type: 'info' | 'success' | 'error' = 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 3600);
  }, []);

  // Sync Tailwind dark class on <html>
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      if (user) {
        api.updateProfile({ theme: next }).catch(() => {});
      }
      return next;
    });
  }, [user]);

  const setLanguage = useCallback(
    (lang: LanguagePreference) => {
      setLanguageState(lang);
      try {
        localStorage.setItem(LANG_KEY, lang);
      } catch {
        // ignore
      }
      if (user) {
        api.updateProfile({ preferredLanguage: lang }).catch(() => {});
      }
    },
    [user]
  );

  const loadGuestState = useCallback(() => {
    try {
      const savedChats = localStorage.getItem(GUEST_CHATS_KEY);
      if (savedChats) {
        const parsed = JSON.parse(savedChats) as ChatSession[];
        setChats(parsed);
        setActiveChatId(parsed[0]?.id || null);
      } else {
        setChats([]);
        setActiveChatId(null);
      }
      const savedLib = localStorage.getItem(GUEST_LIBRARY_KEY);
      if (savedLib) {
        setLibraryItems(JSON.parse(savedLib) as LibraryItem[]);
      } else {
        setLibraryItems([]);
      }
      setFolders([]);
    } catch {
      setChats([]);
      setLibraryItems([]);
    }
  }, []);

  const loadAccountData = useCallback(async () => {
    const [chatsRes, libRes] = await Promise.all([api.getChats(), api.getLibrary()]);
    setChats(chatsRes.chats);
    setActiveChatId((prev) =>
      prev && chatsRes.chats.some((c) => c.id === prev) ? prev : chatsRes.chats[0]?.id || null
    );
    setFolders(libRes.folders);
    setLibraryItems(libRes.items);
  }, []);

  const refreshAccount = useCallback(async () => {
    try {
      const cfg = await api.getAuthConfig();
      setGoogleClientId(cfg.googleClientId);
      setStripeEnabled(cfg.stripeEnabled);

      const token = getStoredToken();
      if (!token) {
        setUser(null);
        const guestSub = await api.getSubscriptionStatus().catch(() => DEFAULT_SUBSCRIPTION);
        setSubscription(guestSub);
        loadGuestState();
        return;
      }

      const me = await api.getMe();
      if (me.authenticated && me.user) {
        setUser(me.user);
        setSubscription(me.subscription || DEFAULT_SUBSCRIPTION);
        if (me.user.preferredLanguage) setLanguageState(me.user.preferredLanguage);
        if (me.user.theme) setTheme(me.user.theme);
        await loadAccountData();
      } else {
        setStoredToken(null);
        setUser(null);
        const guestSub = await api.getSubscriptionStatus().catch(() => DEFAULT_SUBSCRIPTION);
        setSubscription(guestSub);
        loadGuestState();
      }
    } catch {
      loadGuestState();
    } finally {
      setAuthReady(true);
    }
  }, [loadAccountData, loadGuestState]);

  useEffect(() => {
    void refreshAccount();
  }, [refreshAccount]);

  // Handle Stripe redirect return if ?stripe_session_id= is present
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stripeSessionId = params.get('stripe_session_id');
    if (stripeSessionId && getStoredToken()) {
      api
        .verifyStripeSession(stripeSessionId)
        .then((res) => {
          setSubscription(res.subscription);
          notify('PRO subscription activated! Video Studio & Ultra HD tools unlocked.', 'success');
          window.history.replaceState({}, '', window.location.pathname);
        })
        .catch(() => {});
    }
  }, [notify]);

  const handleSessionSuccess = useCallback(
    async (res: { token: string; user: UserProfile; subscription: SubscriptionInfo }) => {
      setStoredToken(res.token);
      setUser(res.user);
      setSubscription(res.subscription);
      setShowAuthModal(false);

      // Sync any guest chats created before signing in
      try {
        const guestRaw = localStorage.getItem(GUEST_CHATS_KEY);
        if (guestRaw) {
          const guestChats = JSON.parse(guestRaw) as ChatSession[];
          for (const gc of guestChats) {
            if (!gc.isTemporary && gc.messages.length > 0) {
              await api.saveChat(gc).catch(() => {});
            }
          }
          localStorage.removeItem(GUEST_CHATS_KEY);
        }
        const guestLibRaw = localStorage.getItem(GUEST_LIBRARY_KEY);
        if (guestLibRaw) {
          const guestItems = JSON.parse(guestLibRaw) as LibraryItem[];
          for (const gi of guestItems) {
            await api.addLibraryItem(gi).catch(() => {});
          }
          localStorage.removeItem(GUEST_LIBRARY_KEY);
        }
      } catch {
        // ignore guest sync errors
      }

      await loadAccountData();
      notify(`Signed in as ${res.user.name}`, 'success');
    },
    [loadAccountData, notify]
  );

  const signInAccount = useCallback(
    async (email: string, name: string) => {
      const res = await api.signInAccount(email, name);
      await handleSessionSuccess(res);
    },
    [handleSessionSuccess]
  );

  const signInGoogle = useCallback(
    async (payload: { idToken?: string; accessToken?: string }) => {
      const res = await api.signInGoogle(payload);
      await handleSessionSuccess(res);
    },
    [handleSessionSuccess]
  );

  const signOut = useCallback(() => {
    setStoredToken(null);
    setUser(null);
    setSubscription(DEFAULT_SUBSCRIPTION);
    api.getSubscriptionStatus().then(setSubscription).catch(() => {});
    setChats([]);
    setActiveChatId(null);
    setFolders([]);
    setLibraryItems([]);
    loadGuestState();
    notify('Signed out. Sign back in anytime to access your saved library and chats.', 'info');
  }, [loadGuestState, notify]);

  const updateProfile = useCallback(
    async (updates: {
      name?: string;
      preferredLanguage?: LanguagePreference;
      theme?: Theme;
      customInstructions?: CustomInstructions;
    }) => {
      if (!user) {
        setShowAuthModal(true);
        throw new Error('Please sign in to save profile preferences.');
      }
      const res = await api.updateProfile(updates);
      setUser(res.user);
      notify('Settings saved to your account.', 'success');
    },
    [notify, user]
  );

  // Chats management
  const persistGuestChats = (next: ChatSession[]) => {
    try {
      const nonTemp = next.filter((c) => !c.isTemporary);
      localStorage.setItem(GUEST_CHATS_KEY, JSON.stringify(nonTemp));
    } catch {
      // ignore
    }
  };

  const createNewChat = useCallback(
    (temporary = false): ChatSession => {
      const now = Date.now();
      const newChat: ChatSession = {
        id: `chat_${now}_${Math.random().toString(36).slice(2, 7)}`,
        title: temporary ? 'Temporary Chat' : 'New Conversation',
        language,
        isTemporary: temporary,
        messages: [],
        createdAt: now,
        updatedAt: now,
      };
      setChats((prev) => [newChat, ...prev]);
      setActiveChatId(newChat.id);
      setActiveView('chat');
      return newChat;
    },
    [language]
  );

  const selectChat = useCallback((chatId: string) => {
    setActiveChatId(chatId);
    setActiveView('chat');
  }, []);

  const saveChat = useCallback(
    async (chat: ChatSession, persistToServer = true) => {
      setChats((prev) => {
        const exists = prev.some((c) => c.id === chat.id);
        const updated = exists ? prev.map((c) => (c.id === chat.id ? chat : c)) : [chat, ...prev];
        if (!user && persistToServer) {
          persistGuestChats(updated);
        }
        return updated.sort((a, b) => b.updatedAt - a.updatedAt);
      });

      if (persistToServer && user && !chat.isTemporary && chat.messages.length > 0) {
        await api.saveChat(chat).catch(() => {});
      }
    },
    [user]
  );

  const renameChat = useCallback(
    async (chatId: string, newTitle: string) => {
      const clean = newTitle.trim();
      if (!clean) return;
      const target = chats.find((c) => c.id === chatId);
      if (!target) return;
      const updated = { ...target, title: clean, updatedAt: Date.now() };
      await saveChat(updated);
      notify('Conversation renamed.', 'success');
    },
    [chats, notify, saveChat]
  );

  const deleteChat = useCallback(
    async (chatId: string) => {
      setChats((prev) => {
        const next = prev.filter((c) => c.id !== chatId);
        if (!user) persistGuestChats(next);
        if (activeChatId === chatId) {
          setActiveChatId(next[0]?.id || null);
        }
        return next;
      });
      if (user) {
        await api.deleteChat(chatId).catch(() => {});
      }
      notify('Conversation deleted.', 'info');
    },
    [activeChatId, notify, user]
  );

  // Library management
  const persistGuestLibrary = (items: LibraryItem[]) => {
    try {
      localStorage.setItem(GUEST_LIBRARY_KEY, JSON.stringify(items));
    } catch {
      // ignore
    }
  };

  const saveToLibrary = useCallback(
    async (payload: {
      type: LibraryItemType;
      title: string;
      folderId?: string | null;
      content?: string;
      prompt?: string;
      style?: string;
      aspectRatio?: string;
      mediaUrl?: string;
      mimeType?: string;
      metadata?: Record<string, string | number | boolean>;
    }): Promise<LibraryItem | null> => {
      if (user) {
        const res = await api.addLibraryItem(payload);
        setLibraryItems((prev) => [res.item, ...prev]);
        notify(`Saved "${res.item.title}" to My Library.`, 'success');
        return res.item;
      }

      const now = Date.now();
      const localItem: LibraryItem = {
        ...payload,
        id: `lib_${now}_${Math.random().toString(36).slice(2, 6)}`,
        folderId: payload.folderId ?? null,
        createdAt: now,
        updatedAt: now,
      };
      setLibraryItems((prev) => {
        const next = [localItem, ...prev];
        persistGuestLibrary(next);
        return next;
      });
      notify('Saved locally. Sign in to sync across devices.', 'info');
      return localItem;
    },
    [notify, user]
  );

  const uploadFileToLibrary = useCallback(
    async (payload: {
      title: string;
      type: LibraryItemType;
      folderId?: string | null;
      mimeType: string;
      base64?: string;
      textContent?: string;
    }) => {
      if (!user) {
        setShowAuthModal(true);
        notify('Sign in to upload files to your persistent library.', 'info');
        return null;
      }
      const res = await api.uploadLibraryFile(payload);
      setLibraryItems((prev) => [res.item, ...prev]);
      notify(`Uploaded "${res.item.title}" to My Library.`, 'success');
      return res.item;
    },
    [notify, user]
  );

  const updateLibraryItem = useCallback(
    async (
      id: string,
      updates: Partial<Pick<LibraryItem, 'title' | 'folderId' | 'content' | 'prompt' | 'style' | 'aspectRatio'>>
    ) => {
      if (user) {
        const res = await api.updateLibraryItem(id, updates);
        setLibraryItems((prev) => prev.map((it) => (it.id === id ? res.item : it)));
      } else {
        setLibraryItems((prev) => {
          const next = prev.map((it) =>
            it.id === id ? { ...it, ...updates, updatedAt: Date.now() } : it
          );
          persistGuestLibrary(next);
          return next;
        });
      }
    },
    [user]
  );

  const deleteLibraryItem = useCallback(
    async (id: string) => {
      if (user) {
        await api.deleteLibraryItem(id);
      }
      setLibraryItems((prev) => {
        const next = prev.filter((it) => it.id !== id);
        if (!user) persistGuestLibrary(next);
        return next;
      });
      notify('Removed from My Library.', 'info');
    },
    [notify, user]
  );

  const createFolder = useCallback(
    async (name: string) => {
      if (!user) {
        setShowAuthModal(true);
        notify('Sign in to create and organize folders.', 'info');
        return;
      }
      const res = await api.createFolder(name);
      setFolders((prev) => [...prev, res.folder].sort((a, b) => a.name.localeCompare(b.name)));
      notify(`Folder "${res.folder.name}" created.`, 'success');
    },
    [notify, user]
  );

  const renameFolder = useCallback(
    async (id: string, name: string) => {
      if (!user) return;
      const res = await api.renameFolder(id, name);
      setFolders((prev) => prev.map((f) => (f.id === id ? res.folder : f)));
      notify('Folder renamed.', 'success');
    },
    [notify, user]
  );

  const deleteFolder = useCallback(
    async (id: string) => {
      if (!user) return;
      await api.deleteFolder(id);
      setFolders((prev) => prev.filter((f) => f.id !== id));
      setLibraryItems((prev) => prev.map((it) => (it.folderId === id ? { ...it, folderId: null } : it)));
      notify('Folder removed (items kept in Unfiled).', 'info');
    },
    [notify, user]
  );

  const continueEditingLibraryItem = useCallback(
    (item: LibraryItem) => {
      if (item.type === 'image' || item.type === 'design') {
        const rawPreset = (item.aspectRatio || '1:1').split(' ')[0] as AspectRatioOption;
        const validPresets: AspectRatioOption[] = [
          'a4-portrait',
          'a4-landscape',
          'a3-portrait',
          'a3-landscape',
          'a5-portrait',
          'a5-landscape',
          '1:1',
          '2:3',
          '16:9',
          '4:5',
          '9:16',
          'custom',
        ];
        setImageDraft({
          prompt: item.prompt || item.title,
          style: (item.style as ImageStyle) || 'auto',
          aspectRatio: validPresets.includes(rawPreset) ? rawPreset : '1:1',
        });
        setActiveView('images');
      } else if (item.type === 'video') {
        setVideoDraft({
          prompt: item.prompt || item.title,
          style: (item.style as VideoStyle) || 'cinematic',
        });
        setActiveView('videos');
      } else if (item.type === 'answer') {
        const chat = createNewChat(false);
        const seeded: ChatSession = {
          ...chat,
          title: item.title,
          messages: [
            {
              id: `msg_${Date.now()}_a`,
              role: 'assistant',
              content: item.content || '',
              timestamp: Date.now(),
            },
          ],
        };
        void saveChat(seeded);
        setActiveView('chat');
      } else {
        setActiveDocument(item);
        setActiveView('documents');
      }
    },
    [createNewChat, saveChat]
  );

  const activeChat = chats.find((c) => c.id === activeChatId) || null;
  const isPro = subscription.tier === 'pro' && subscription.status === 'active';
  const customInstructions = user?.customInstructions || DEFAULT_CUSTOM_INSTRUCTIONS;

  return (
    <AppContext.Provider
      value={{
        theme,
        toggleTheme,
        language,
        setLanguage,
        activeView,
        setActiveView,
        authReady,
        user,
        isPro,
        subscription,
        googleClientId,
        stripeEnabled,
        customInstructions,
        signInAccount,
        signInGoogle,
        signOut,
        updateProfile,
        setSubscription,
        refreshAccount,
        chats,
        activeChatId,
        activeChat,
        createNewChat,
        selectChat,
        saveChat,
        renameChat,
        deleteChat,
        folders,
        libraryItems,
        saveToLibrary,
        uploadFileToLibrary,
        updateLibraryItem,
        deleteLibraryItem,
        createFolder,
        renameFolder,
        deleteFolder,
        imageDraft,
        setImageDraft,
        videoDraft,
        setVideoDraft,
        activeDocument,
        setActiveDocument,
        continueEditingLibraryItem,
        showAuthModal,
        setShowAuthModal,
        showInstructionsModal,
        setShowInstructionsModal,
        toast,
        notify,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
