export type Theme = 'dark' | 'light';

export type WorkspaceView =
  | 'chat'
  | 'images'
  | 'videos'
  | 'library'
  | 'documents'
  | 'profile'
  | 'upgrade';

export type LanguagePreference =
  | 'auto'
  | 'en'
  | 'ml'
  | 'manglish'
  | 'ar'
  | 'hi'
  | 'es'
  | 'fr'
  | 'ur';

export type SubscriptionTier = 'free' | 'pro';
export type BillingCycle = 'monthly' | 'yearly';

export interface SubscriptionInfo {
  tier: SubscriptionTier;
  plan: BillingCycle | 'none';
  status: 'active' | 'canceled' | 'none';
  currentPeriodEnd?: number;
  lastPaymentLast4?: string;
  imageUsageToday: number;
  imageDailyLimit: number;
  videoUsageMonth: number;
  videoMonthlyLimit: number;
}

export interface CustomInstructions {
  aboutUser: string;
  responseStyle: string;
  enabled: boolean;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  username?: string;
  avatarUrl?: string;
  authProvider: 'google' | 'account';
  customInstructions: CustomInstructions;
  preferredLanguage: LanguagePreference;
  theme: Theme;
  createdAt: number;
}

export interface ChatAttachmentMeta {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: 'image' | 'file';
  previewUrl?: string;
}

export interface ChatAttachmentPayload extends ChatAttachmentMeta {
  base64?: string;
  textContent?: string;
}

export interface WebSource {
  title: string;
  url: string;
}

export interface ChatGeneratedImage {
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
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachments?: ChatAttachmentMeta[];
  sources?: WebSource[];
  generatedImageUrl?: string;
  generatedImage?: ChatGeneratedImage;
  timestamp: number;
  editedAt?: number;
  isError?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  language: LanguagePreference;
  isTemporary?: boolean;
  shareId?: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface PinnedPrompt {
  id: string;
  prompt: string;
  title?: string;
  category: string;
  chatId?: string;
  messageId?: string;
  createdAt: number;
  pinnedAt: number;
  order: number;
}

export type LibraryItemType =
  | 'image'
  | 'video'
  | 'answer'
  | 'document'
  | 'project'
  | 'design';

export interface LibraryFolder {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface LibraryItem {
  id: string;
  type: LibraryItemType;
  title: string;
  folderId: string | null;
  content?: string;
  prompt?: string;
  style?: string;
  aspectRatio?: string;
  mediaUrl?: string;
  mimeType?: string;
  metadata?: Record<string, string | number | boolean>;
  createdAt: number;
  updatedAt: number;
}

export type ImageStyle =
  | 'auto'
  | 'realistic'
  | 'cinematic'
  | 'anime'
  | 'cartoon'
  | '3d'
  | 'illustration'
  | 'poster'
  | 'logo'
  | 'wallpaper';

export type VideoStyle =
  | 'cinematic'
  | 'realistic'
  | '3d_animation'
  | 'anime'
  | 'commercial'
  | 'documentary';

export type GeminiAspectRatio =
  | '1:1'
  | '16:9'
  | '9:16'
  | '4:3'
  | '3:4'
  | '1:4'
  | '1:8'
  | '4:1'
  | '8:1';

export type ImageSizePreset =
  | 'a4-portrait'
  | 'a4-landscape'
  | 'a3-portrait'
  | 'a3-landscape'
  | 'a5-portrait'
  | 'a5-landscape'
  | '1:1'
  | '2:3'
  | '16:9'
  | '4:5'
  | '9:16'
  | 'custom';

export type AspectRatioOption = ImageSizePreset;
