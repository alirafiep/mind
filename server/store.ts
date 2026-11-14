import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type {
  ChatMessage,
  ChatSession,
  CustomInstructions,
  LanguagePreference,
  LibraryFolder,
  LibraryItem,
  SubscriptionInfo,
  Theme,
  UserProfile,
  BillingCycle,
} from '../src/types/app.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const MEDIA_DIR = path.join(DATA_DIR, 'media');
const DB_FILE = path.join(DATA_DIR, 'store.json');

fs.mkdirSync(MEDIA_DIR, { recursive: true });

export interface ServerSubscriptionRecord {
  tier: 'free' | 'pro';
  plan: BillingCycle | 'none';
  status: 'active' | 'canceled' | 'none';
  currentPeriodEnd?: number;
  lastPaymentLast4?: string;
  imageUsageDate: string;
  imageUsageToday: number;
  videoUsageMonthKey: string;
  videoUsageMonth: number;
  transactions: Array<{
    id: string;
    plan: BillingCycle;
    amountUsd: number;
    method: string;
    last4?: string;
    createdAt: number;
  }>;
}

export interface SharedChatSnapshot {
  id: string;
  title: string;
  authorName: string;
  language: LanguagePreference;
  messages: ChatMessage[];
  sharedAt: number;
}

interface DatabaseSchema {
  users: Record<string, UserProfile>;
  subscriptions: Record<string, ServerSubscriptionRecord>;
  guestImageUsage: Record<string, { date: string; count: number }>;
  chats: Record<string, ChatSession[]>;
  folders: Record<string, LibraryFolder[]>;
  library: Record<string, LibraryItem[]>;
  sharedChats: Record<string, SharedChatSnapshot>;
}

const DEFAULT_INSTRUCTIONS: CustomInstructions = {
  aboutUser: '',
  responseStyle: '',
  enabled: false,
};

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

export const FREE_DAILY_IMAGE_LIMIT = 15;
export const PRO_DAILY_IMAGE_LIMIT = 150;

function createEmptyDb(): DatabaseSchema {
  return {
    users: {},
    subscriptions: {},
    guestImageUsage: {},
    chats: {},
    folders: {},
    library: {},
    sharedChats: {},
  };
}

function loadDb(): DatabaseSchema {
  try {
    if (!fs.existsSync(DB_FILE)) {
      return createEmptyDb();
    }
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<DatabaseSchema>;
    return {
      users: parsed.users || {},
      subscriptions: parsed.subscriptions || {},
      guestImageUsage: parsed.guestImageUsage || {},
      chats: parsed.chats || {},
      folders: parsed.folders || {},
      library: parsed.library || {},
      sharedChats: parsed.sharedChats || {},
    };
  } catch (err) {
    console.error('Failed to read store.json, initializing fresh database:', err);
    return createEmptyDb();
  }
}

let dbState: DatabaseSchema = loadDb();
let writeChain: Promise<void> = Promise.resolve();

async function persistDb(): Promise<void> {
  const snapshot = JSON.stringify(dbState, null, 2);
  writeChain = writeChain.then(async () => {
    const tmpFile = `${DB_FILE}.tmp.${process.pid}`;
    await fs.promises.writeFile(tmpFile, snapshot, 'utf-8');
    await fs.promises.rename(tmpFile, DB_FILE);
  });
  return writeChain;
}

export function getOrCreateUser(params: {
  email: string;
  name: string;
  avatarUrl?: string;
  authProvider: 'google' | 'account';
}): UserProfile {
  const normalizedEmail = params.email.trim().toLowerCase();
  const userId = 'usr_' + crypto.createHash('sha256').update(normalizedEmail).digest('hex').slice(0, 20);

  const existing = dbState.users[userId];
  if (existing) {
    existing.name = params.name.trim() || existing.name;
    if (params.avatarUrl) existing.avatarUrl = params.avatarUrl;
    if (params.authProvider === 'google') existing.authProvider = 'google';
    void persistDb();
    return existing;
  }

  const created: UserProfile = {
    id: userId,
    email: normalizedEmail,
    name: params.name.trim() || normalizedEmail.split('@')[0] || 'User',
    avatarUrl: params.avatarUrl,
    authProvider: params.authProvider,
    customInstructions: { ...DEFAULT_INSTRUCTIONS },
    preferredLanguage: 'auto',
    theme: 'dark',
    createdAt: Date.now(),
  };

  dbState.users[userId] = created;
  dbState.subscriptions[userId] = {
    tier: 'free',
    plan: 'none',
    status: 'none',
    imageUsageDate: todayKey(),
    imageUsageToday: 0,
    videoUsageMonthKey: monthKey(),
    videoUsageMonth: 0,
    transactions: [],
  };
  dbState.chats[userId] = [];
  dbState.folders[userId] = [
    {
      id: 'fld_projects',
      name: 'Projects',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: 'fld_designs',
      name: 'Designs & Media',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ];
  dbState.library[userId] = [];

  void persistDb();
  return created;
}

export function getUserById(userId: string): UserProfile | null {
  return dbState.users[userId] || null;
}

export async function updateUserProfile(
  userId: string,
  updates: {
    name?: string;
    preferredLanguage?: LanguagePreference;
    theme?: Theme;
    customInstructions?: CustomInstructions;
  }
): Promise<UserProfile | null> {
  const user = dbState.users[userId];
  if (!user) return null;

  if (typeof updates.name === 'string' && updates.name.trim()) {
    user.name = updates.name.trim().slice(0, 80);
  }
  if (updates.preferredLanguage) {
    user.preferredLanguage = updates.preferredLanguage;
  }
  if (updates.theme === 'dark' || updates.theme === 'light') {
    user.theme = updates.theme;
  }
  if (updates.customInstructions) {
    user.customInstructions = {
      aboutUser: String(updates.customInstructions.aboutUser || '').slice(0, 2000),
      responseStyle: String(updates.customInstructions.responseStyle || '').slice(0, 2000),
      enabled: Boolean(updates.customInstructions.enabled),
    };
  }

  await persistDb();
  return user;
}

function ensureSubscriptionRecord(userId: string): ServerSubscriptionRecord {
  if (!dbState.subscriptions[userId]) {
    dbState.subscriptions[userId] = {
      tier: 'free',
      plan: 'none',
      status: 'none',
      imageUsageDate: todayKey(),
      imageUsageToday: 0,
      videoUsageMonthKey: monthKey(),
      videoUsageMonth: 0,
      transactions: [],
    };
  }
  const sub = dbState.subscriptions[userId];

  // Reset daily/monthly usage counters on rollover
  const today = todayKey();
  if (sub.imageUsageDate !== today) {
    sub.imageUsageDate = today;
    sub.imageUsageToday = 0;
  }
  const mKey = monthKey();
  if (sub.videoUsageMonthKey !== mKey) {
    sub.videoUsageMonthKey = mKey;
    sub.videoUsageMonth = 0;
  }

  // Expire subscription if past period end
  if (sub.tier === 'pro' && sub.currentPeriodEnd && Date.now() > sub.currentPeriodEnd) {
    sub.tier = 'free';
    sub.status = 'canceled';
  }

  return sub;
}

export function getSubscriptionInfo(userId: string): SubscriptionInfo {
  const sub = ensureSubscriptionRecord(userId);
  const isPro = sub.tier === 'pro' && sub.status === 'active';
  return {
    tier: isPro ? 'pro' : 'free',
    plan: sub.plan,
    status: sub.status,
    currentPeriodEnd: sub.currentPeriodEnd,
    lastPaymentLast4: sub.lastPaymentLast4,
    imageUsageToday: sub.imageUsageToday,
    imageDailyLimit: isPro ? PRO_DAILY_IMAGE_LIMIT : FREE_DAILY_IMAGE_LIMIT,
    videoUsageMonth: sub.videoUsageMonth,
    videoMonthlyLimit: isPro ? 40 : 0,
  };
}

export function getGuestSubscriptionInfo(guestKey: string): SubscriptionInfo {
  const today = todayKey();
  const entry = dbState.guestImageUsage[guestKey];
  const used = entry && entry.date === today ? entry.count : 0;
  return {
    tier: 'free',
    plan: 'none',
    status: 'none',
    imageUsageToday: used,
    imageDailyLimit: FREE_DAILY_IMAGE_LIMIT,
    videoUsageMonth: 0,
    videoMonthlyLimit: 0,
  };
}

export async function incrementGuestImageUsage(guestKey: string): Promise<SubscriptionInfo> {
  const today = todayKey();
  const entry = dbState.guestImageUsage[guestKey];
  if (!entry || entry.date !== today) {
    dbState.guestImageUsage[guestKey] = { date: today, count: 1 };
  } else {
    entry.count += 1;
  }
  await persistDb();
  return getGuestSubscriptionInfo(guestKey);
}

export function isUserProActive(userId: string): boolean {
  const info = getSubscriptionInfo(userId);
  return info.tier === 'pro' && info.status === 'active';
}

export async function activateProSubscription(
  userId: string,
  plan: BillingCycle,
  method: string,
  last4?: string
): Promise<SubscriptionInfo> {
  const sub = ensureSubscriptionRecord(userId);
  const durationDays = plan === 'yearly' ? 365 : 30;
  sub.tier = 'pro';
  sub.plan = plan;
  sub.status = 'active';
  sub.currentPeriodEnd = Date.now() + durationDays * 24 * 60 * 60 * 1000;
  if (last4) sub.lastPaymentLast4 = last4;

  sub.transactions.unshift({
    id: 'txn_' + crypto.randomBytes(6).toString('hex'),
    plan,
    amountUsd: plan === 'yearly' ? 180 : 19,
    method,
    last4,
    createdAt: Date.now(),
  });

  await persistDb();
  return getSubscriptionInfo(userId);
}

export async function cancelProSubscription(userId: string): Promise<SubscriptionInfo> {
  const sub = ensureSubscriptionRecord(userId);
  sub.tier = 'free';
  sub.status = 'canceled';
  await persistDb();
  return getSubscriptionInfo(userId);
}

export async function incrementImageUsage(userId: string): Promise<SubscriptionInfo> {
  const sub = ensureSubscriptionRecord(userId);
  sub.imageUsageToday += 1;
  await persistDb();
  return getSubscriptionInfo(userId);
}

export async function incrementVideoUsage(userId: string): Promise<SubscriptionInfo> {
  const sub = ensureSubscriptionRecord(userId);
  sub.videoUsageMonth += 1;
  await persistDb();
  return getSubscriptionInfo(userId);
}

// Chats
export function getUserChats(userId: string): ChatSession[] {
  return (dbState.chats[userId] || []).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function upsertUserChat(userId: string, chat: ChatSession): Promise<ChatSession> {
  if (!dbState.chats[userId]) dbState.chats[userId] = [];
  const list = dbState.chats[userId];
  const idx = list.findIndex((c) => c.id === chat.id);
  const sanitized: ChatSession = {
    ...chat,
    title: (chat.title || 'New Conversation').slice(0, 120),
    messages: (chat.messages || []).slice(-100),
    updatedAt: Date.now(),
  };
  if (idx >= 0) {
    list[idx] = sanitized;
  } else {
    list.unshift(sanitized);
  }
  await persistDb();
  return sanitized;
}

export async function deleteUserChat(userId: string, chatId: string): Promise<boolean> {
  const list = dbState.chats[userId] || [];
  const next = list.filter((c) => c.id !== chatId);
  if (next.length === list.length) return false;
  dbState.chats[userId] = next;
  await persistDb();
  return true;
}

export async function createShareSnapshot(
  userId: string,
  chatId: string
): Promise<SharedChatSnapshot | null> {
  const user = dbState.users[userId];
  const list = dbState.chats[userId] || [];
  const chat = list.find((c) => c.id === chatId);
  if (!chat || !user) return null;

  const shareId = chat.shareId || 'shr_' + crypto.randomBytes(6).toString('hex');
  chat.shareId = shareId;

  const snapshot: SharedChatSnapshot = {
    id: shareId,
    title: chat.title,
    authorName: user.name,
    language: chat.language,
    messages: chat.messages,
    sharedAt: Date.now(),
  };

  dbState.sharedChats[shareId] = snapshot;
  await persistDb();
  return snapshot;
}

export function getShareSnapshot(shareId: string): SharedChatSnapshot | null {
  return dbState.sharedChats[shareId] || null;
}

// Library & Folders
export function getUserLibrary(userId: string): {
  folders: LibraryFolder[];
  items: LibraryItem[];
} {
  return {
    folders: (dbState.folders[userId] || []).sort((a, b) => a.name.localeCompare(b.name)),
    items: (dbState.library[userId] || []).sort((a, b) => b.updatedAt - a.updatedAt),
  };
}

export async function createUserFolder(userId: string, name: string): Promise<LibraryFolder> {
  if (!dbState.folders[userId]) dbState.folders[userId] = [];
  const folder: LibraryFolder = {
    id: 'fld_' + crypto.randomBytes(6).toString('hex'),
    name: name.trim().slice(0, 60) || 'Untitled Folder',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  dbState.folders[userId].push(folder);
  await persistDb();
  return folder;
}

export async function renameUserFolder(
  userId: string,
  folderId: string,
  name: string
): Promise<LibraryFolder | null> {
  const list = dbState.folders[userId] || [];
  const folder = list.find((f) => f.id === folderId);
  if (!folder) return null;
  folder.name = name.trim().slice(0, 60) || folder.name;
  folder.updatedAt = Date.now();
  await persistDb();
  return folder;
}

export async function deleteUserFolder(userId: string, folderId: string): Promise<boolean> {
  const list = dbState.folders[userId] || [];
  const next = list.filter((f) => f.id !== folderId);
  if (next.length === list.length) return false;
  dbState.folders[userId] = next;
  // Unassign items in this folder rather than deleting user items
  for (const item of dbState.library[userId] || []) {
    if (item.folderId === folderId) {
      item.folderId = null;
    }
  }
  await persistDb();
  return true;
}

export async function addUserLibraryItem(
  userId: string,
  payload: Omit<LibraryItem, 'id' | 'createdAt' | 'updatedAt'>
): Promise<LibraryItem> {
  if (!dbState.library[userId]) dbState.library[userId] = [];
  const now = Date.now();
  const item: LibraryItem = {
    ...payload,
    id: 'lib_' + crypto.randomBytes(6).toString('hex'),
    title: (payload.title || 'Untitled Item').slice(0, 120),
    createdAt: now,
    updatedAt: now,
  };
  dbState.library[userId].unshift(item);
  await persistDb();
  return item;
}

export async function updateUserLibraryItem(
  userId: string,
  itemId: string,
  updates: Partial<Pick<LibraryItem, 'title' | 'folderId' | 'content' | 'prompt' | 'style' | 'aspectRatio' | 'metadata'>>
): Promise<LibraryItem | null> {
  const list = dbState.library[userId] || [];
  const item = list.find((i) => i.id === itemId);
  if (!item) return null;

  if (typeof updates.title === 'string' && updates.title.trim()) {
    item.title = updates.title.trim().slice(0, 120);
  }
  if (updates.folderId !== undefined) {
    item.folderId = updates.folderId;
  }
  if (typeof updates.content === 'string') {
    item.content = updates.content;
  }
  if (typeof updates.prompt === 'string') {
    item.prompt = updates.prompt;
  }
  if (typeof updates.style === 'string') {
    item.style = updates.style;
  }
  if (typeof updates.aspectRatio === 'string') {
    item.aspectRatio = updates.aspectRatio;
  }
  if (updates.metadata) {
    item.metadata = { ...(item.metadata || {}), ...updates.metadata };
  }
  item.updatedAt = Date.now();

  await persistDb();
  return item;
}

export async function deleteUserLibraryItem(userId: string, itemId: string): Promise<boolean> {
  const list = dbState.library[userId] || [];
  const next = list.filter((i) => i.id !== itemId);
  if (next.length === list.length) return false;
  dbState.library[userId] = next;
  await persistDb();
  return true;
}

// Media File Storage
export function saveMediaBuffer(buffer: Buffer, extension: string): string {
  const safeExt = extension.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'bin';
  const filename = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}.${safeExt}`;
  const fullPath = path.join(MEDIA_DIR, filename);
  fs.writeFileSync(fullPath, buffer);
  return `/api/media/${filename}`;
}

export function resolveMediaFilePath(filename: string): string | null {
  const safeName = path.basename(filename);
  if (safeName !== filename || !/^[a-zA-Z0-9._-]+$/.test(safeName)) {
    return null;
  }
  const fullPath = path.join(MEDIA_DIR, safeName);
  if (!fs.existsSync(fullPath)) return null;
  return fullPath;
}
