import type {
  AspectRatioOption,
  BillingCycle,
  ChatAttachmentPayload,
  ChatMessage,
  ChatSession,
  CustomInstructions,
  GeminiAspectRatio,
  ImageSizePreset,
  ImageStyle,
  LanguagePreference,
  LibraryFolder,
  LibraryItem,
  LibraryItemType,
  PinnedPrompt,
  SubscriptionInfo,
  Theme,
  UserProfile,
  VideoStyle,
  WebSource,
} from '../types/app';

const TOKEN_KEY = 'mindmaster_session_token';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((data as { error?: string }).error || `Request failed (${res.status})`) as Error & {
      status?: number;
      code?: string;
    };
    err.status = res.status;
    err.code = (data as { code?: string }).code;
    throw err;
  }
  return data as T;
}

export interface AuthConfigResponse {
  stripeEnabled: boolean;
  hasApiKey: boolean;
}

export interface AuthSessionResponse {
  token: string;
  user: UserProfile;
  subscription: SubscriptionInfo;
}

export const api = {
  getAuthConfig: () => apiFetch<AuthConfigResponse>('/api/auth/config'),

  getMe: () =>
    apiFetch<{
      authenticated: boolean;
      user: UserProfile | null;
      subscription: SubscriptionInfo | null;
    }>('/api/auth/me'),

  signIn: (payload: { email: string; password: string }) =>
    apiFetch<AuthSessionResponse>('/api/auth/signin', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  signUp: (payload: { email: string; password: string; name?: string }) =>
    apiFetch<AuthSessionResponse>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  checkUsernameAvailable: (username: string) =>
    apiFetch<{ available: boolean; normalized?: string; reason?: string }>(
      `/api/auth/username-available?username=${encodeURIComponent(username)}`
    ),

  updateProfile: (updates: {
    name?: string;
    username?: string;
    preferredLanguage?: LanguagePreference;
    theme?: Theme;
    customInstructions?: CustomInstructions;
  }) =>
    apiFetch<{ user: UserProfile }>('/api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),

  // Chats
  getChats: () => apiFetch<{ chats: ChatSession[] }>('/api/chats'),

  saveChat: (chat: ChatSession) =>
    apiFetch<{ chat: ChatSession }>(`/api/chats/${encodeURIComponent(chat.id)}`, {
      method: 'PUT',
      body: JSON.stringify(chat),
    }),

  deleteChat: (chatId: string) =>
    apiFetch<{ deleted: boolean }>(`/api/chats/${encodeURIComponent(chatId)}`, {
      method: 'DELETE',
    }),

  // Pinned Prompts
  getPinnedPrompts: () => apiFetch<{ pinnedPrompts: PinnedPrompt[] }>('/api/pinned-prompts'),

  pinPrompt: (payload: {
    prompt: string;
    title?: string;
    category?: string;
    chatId?: string;
    messageId?: string;
    createdAt?: number;
  }) =>
    apiFetch<{ pinnedPrompt: PinnedPrompt }>('/api/pinned-prompts', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updatePinnedPrompt: (
    id: string,
    updates: {
      title?: string;
      category?: string;
      order?: number;
      prompt?: string;
    }
  ) =>
    apiFetch<{ pinnedPrompt: PinnedPrompt }>(`/api/pinned-prompts/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),

  unpinPrompt: (id: string) =>
    apiFetch<{ deleted: boolean }>(`/api/pinned-prompts/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  shareChat: (chatId: string) =>
    apiFetch<{
      shareId: string;
      snapshot: {
        id: string;
        title: string;
        authorName: string;
        language: LanguagePreference;
        messages: ChatMessage[];
        sharedAt: number;
      };
    }>(`/api/chats/${encodeURIComponent(chatId)}/share`, {
      method: 'POST',
    }),

  getSharedChat: (shareId: string) =>
    apiFetch<{
      snapshot: {
        id: string;
        title: string;
        authorName: string;
        language: LanguagePreference;
        messages: ChatMessage[];
        sharedAt: number;
      };
    }>(`/api/share/${encodeURIComponent(shareId)}`),

  generateChatTitle: (firstMessage: string) =>
    apiFetch<{ title: string }>('/api/chat/title', {
      method: 'POST',
      body: JSON.stringify({ firstMessage }),
    }),

  // Streaming Chat
  streamChat: async (params: {
    messages: ChatMessage[];
    attachments?: ChatAttachmentPayload[];
    webSearch?: boolean;
    language: LanguagePreference;
    customInstructions?: CustomInstructions;
    signal?: AbortSignal;
    onDelta: (chunk: string) => void;
    onSources?: (sources: WebSource[]) => void;
  }): Promise<void> => {
    const token = getStoredToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch('/api/chat/stream', {
      method: 'POST',
      headers,
      signal: params.signal,
      body: JSON.stringify({
        messages: params.messages,
        attachments: params.attachments || [],
        webSearch: Boolean(params.webSearch),
        language: params.language,
        customInstructions: params.customInstructions,
      }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error((errJson as { error?: string }).error || `Chat request failed (${res.status})`);
    }

    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error('Streaming response body unavailable.');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const jsonStr = trimmed.slice(5).trim();
        if (!jsonStr) continue;
        try {
          const evt = JSON.parse(jsonStr) as {
            type: string;
            text?: string;
            sources?: WebSource[];
            message?: string;
          };
          if (evt.type === 'delta' && evt.text) {
            params.onDelta(evt.text);
          } else if (evt.type === 'sources' && evt.sources && params.onSources) {
            params.onSources(evt.sources);
          } else if (evt.type === 'error') {
            throw new Error(evt.message || 'AI streaming failed.');
          }
        } catch (parseErr) {
          if (parseErr instanceof Error && parseErr.message !== 'Unexpected end of JSON input') {
            throw parseErr;
          }
        }
      }
    }
  },

  // Audio
  transcribeAudio: (audioBase64: string, mimeType: string) =>
    apiFetch<{ text: string }>('/api/audio/transcribe', {
      method: 'POST',
      body: JSON.stringify({ audioBase64, mimeType }),
    }),

  generateSpeech: (text: string, voiceName = 'Kore') =>
    apiFetch<{ audioBase64: string; mimeType: string }>('/api/audio/tts', {
      method: 'POST',
      body: JSON.stringify({ text, voiceName }),
    }),

  // Image Generation
  generateImage: (params: {
    prompt: string;
    style: ImageStyle;
    sizePreset?: ImageSizePreset;
    aspectRatio?: AspectRatioOption;
    customWidth?: number;
    customHeight?: number;
    quality: 'standard' | 'hd' | 'ultra';
  }) =>
    apiFetch<{
      mediaUrl: string;
      mimeType: string;
      prompt: string;
      assistantMessage?: string;
      style: ImageStyle;
      sizePreset: ImageSizePreset;
      sizeLabel: ImageSizePreset extends string ? string : never;
      aspectRatio: GeminiAspectRatio;
      targetWidth: number;
      targetHeight: number;
      quality: string;
      modelUsed: string;
      subscription: SubscriptionInfo | null;
    }>('/api/image/generate', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  // Video Generation (PRO)
  generateVideo: (params: {
    prompt: string;
    style: VideoStyle;
    aspectRatio: '16:9' | '9:16';
    duration: '5s' | '10s' | '15s';
    resolution: '720p' | '1080p';
    sourceImageBase64?: string;
    sourceImageMimeType?: string;
    sourceMediaUrl?: string;
  }) =>
    apiFetch<{
      mediaUrl: string;
      mimeType: string;
      prompt: string;
      style: VideoStyle;
      aspectRatio: string;
      duration: string;
      resolution: string;
      mode: 'text-to-video' | 'image-to-video';
      subscription: SubscriptionInfo;
    }>('/api/video/generate', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  // Library & Folders
  getLibrary: () => apiFetch<{ folders: LibraryFolder[]; items: LibraryItem[] }>('/api/library'),

  addLibraryItem: (payload: {
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
  }) =>
    apiFetch<{ item: LibraryItem }>('/api/library/items', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  uploadLibraryFile: (payload: {
    title: string;
    type: LibraryItemType;
    folderId?: string | null;
    mimeType: string;
    base64?: string;
    textContent?: string;
  }) =>
    apiFetch<{ item: LibraryItem }>('/api/library/upload', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateLibraryItem: (
    id: string,
    updates: Partial<Pick<LibraryItem, 'title' | 'folderId' | 'content' | 'prompt' | 'style' | 'aspectRatio'>>
  ) =>
    apiFetch<{ item: LibraryItem }>(`/api/library/items/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),

  deleteLibraryItem: (id: string) =>
    apiFetch<{ deleted: boolean }>(`/api/library/items/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  createFolder: (name: string) =>
    apiFetch<{ folder: LibraryFolder }>('/api/library/folders', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  renameFolder: (id: string, name: string) =>
    apiFetch<{ folder: LibraryFolder }>(`/api/library/folders/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),

  deleteFolder: (id: string) =>
    apiFetch<{ deleted: boolean }>(`/api/library/folders/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  // Subscriptions
  getSubscriptionStatus: () => apiFetch<SubscriptionInfo>('/api/subscription/status'),

  checkoutPro: (payload: {
    plan: BillingCycle;
    paymentMethod: 'card' | 'upi' | 'stripe';
    cardNumber?: string;
    expiry?: string;
    cvc?: string;
    cardHolder?: string;
    upiId?: string;
  }) =>
    apiFetch<{ mode: 'stripe' | 'activated'; checkoutUrl?: string; subscription?: SubscriptionInfo }>(
      '/api/subscription/checkout',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  verifyStripeSession: (sessionId: string) =>
    apiFetch<{ subscription: SubscriptionInfo }>('/api/subscription/verify-stripe', {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    }),

  cancelSubscription: () =>
    apiFetch<{ subscription: SubscriptionInfo }>('/api/subscription/cancel', {
      method: 'POST',
    }),
};
