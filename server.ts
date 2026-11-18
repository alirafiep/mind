import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import sharp from 'sharp';
import {
  activateProSubscription,
  addUserLibraryItem,
  cancelProSubscription,
  createPinnedPrompt,
  createShareSnapshot,
  createUserFolder,
  createWorkspaceUser,
  deletePinnedPrompt,
  deleteUserChat,
  deleteUserFolder,
  deleteUserLibraryItem,
  getGuestSubscriptionInfo,
  getShareSnapshot,
  getSubscriptionInfo,
  getUserById,
  getUserChats,
  getUserLibrary,
  getUserPinnedPrompts,
  incrementGuestImageUsage,
  incrementImageUsage,
  incrementVideoUsage,
  isUserProActive,
  isUsernameAvailable,
  renameUserFolder,
  resolveMediaFilePath,
  saveMediaBuffer,
  updatePinnedPrompt,
  updateUserLibraryItem,
  updateUserProfile,
  upsertUserChat,
  validateUsername,
} from './server/store.ts';
import {
  extractAuthUser,
  signSessionToken,
} from './server/auth.ts';
import {
  formatFallbackResearchResponse,
  isDirectCasualOrMathQuery,
  searchWebMultiSource,
  type WebResearchBundle,
} from './server/webResearch.ts';
import type {
  AspectRatioOption,
  BillingCycle,
  ChatAttachmentPayload,
  ChatMessage,
  ChatSession,
  CustomInstructions,
  ImageSizePreset,
  ImageStyle,
  LanguagePreference,
  LibraryItemType,
  VideoStyle,
  WebSource,
} from './src/types/app.ts';
import { resolveImageDimensions } from './src/utils/imageSizes.ts';
import {
  detectTextLanguage,
  isManglishOrMalayalam,
  resolveEffectiveConversationLanguage,
} from './src/utils/language.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '25mb' }));

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY || '';
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function hasValidApiKey(): boolean {
  const k = process.env.GEMINI_API_KEY;
  return !!k && k.trim() !== '' && k !== 'MY_GEMINI_API_KEY';
}

function parseGeminiError(err: unknown): { status: number; code: string; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();
  if (
    lower.includes('503') ||
    lower.includes('unavailable') ||
    lower.includes('high demand') ||
    lower.includes('overloaded')
  ) {
    return {
      status: 503,
      code: 'MODEL_CAPACITY_LIMIT',
      message: 'The primary Gemini model endpoint returned a 503 capacity limit for this request.',
    };
  }
  if (lower.includes('403') || lower.includes('permission_denied') || lower.includes('api_key')) {
    return {
      status: 403,
      code: 'API_KEY_PERMISSION',
      message: 'The configured GEMINI_API_KEY in Settings > Secrets does not have permission for this model endpoint.',
    };
  }
  if (lower.includes('429') || lower.includes('resource_exhausted') || lower.includes('quota')) {
    return {
      status: 429,
      code: 'QUOTA_EXCEEDED',
      message: 'The Gemini API quota for the configured key in Settings > Secrets has been reached.',
    };
  }
  if (lower.includes('404') || lower.includes('not_found')) {
    return {
      status: 404,
      code: 'MODEL_UNAVAILABLE',
      message: 'The requested Gemini model endpoint was not found for the configured API key.',
    };
  }
  if (lower.includes('400') || lower.includes('invalid_request') || lower.includes('invalid_argument')) {
    return {
      status: 400,
      code: 'INVALID_REQUEST',
      message: raw || 'The AI request parameters were invalid. Adjusting prompt formatting may resolve this.',
    };
  }
  return {
    status: 500,
    code: 'AI_ERROR',
    message: raw || 'An unexpected error occurred while processing the AI request.',
  };
}

async function withTransientRetry<T>(fn: () => Promise<T>, retries = 1): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const raw = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
      const isTransient = raw.includes('503') || raw.includes('unavailable') || raw.includes('high demand');
      if (!isTransient || attempt === retries) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
    }
  }
  throw lastErr;
}

function getGuestClientKey(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  const firstFwd = Array.isArray(fwd) ? fwd[0] : typeof fwd === 'string' ? fwd.split(',')[0] : '';
  return (firstFwd || req.ip || 'guest').trim();
}

// ============================================================================
// HEALTH & AUTH CONFIGURATION
// ============================================================================

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    hasApiKey: hasValidApiKey(),
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/auth/config', (_req: Request, res: Response) => {
  res.json({
    stripeEnabled: Boolean(process.env.STRIPE_SECRET_KEY),
    hasApiKey: hasValidApiKey(),
  });
});

app.post('/api/workspace/session', (req: Request, res: Response) => {
  const existingSession = extractAuthUser(req);
  if (existingSession) {
    const existingUser = getUserById(existingSession.uid);
    if (existingUser) {
      const subscription = getSubscriptionInfo(existingUser.id);
      const token = signSessionToken(existingUser.id, existingUser.email || 'workspace@local');
      return res.json({ token, user: existingUser, subscription });
    }
  }
  const user = createWorkspaceUser();
  const token = signSessionToken(user.id, 'workspace@local');
  const subscription = getSubscriptionInfo(user.id);
  return res.status(201).json({ token, user, subscription });
});

app.get('/api/auth/username-available', (req: Request, res: Response) => {
  const raw = typeof req.query.username === 'string' ? req.query.username : '';
  const check = validateUsername(raw);
  if (!check.valid) {
    return res.json({ available: false, reason: check.error });
  }
  const session = extractAuthUser(req);
  const available = isUsernameAvailable(check.normalized, session?.uid);
  return res.json({
    available,
    normalized: check.normalized,
    reason: available ? undefined : 'That username is already taken.',
  });
});

app.get('/api/auth/me', (req: Request, res: Response) => {
  const session = extractAuthUser(req);
  if (!session) {
    return res.json({ authenticated: false, user: null, subscription: null });
  }
  const user = getUserById(session.uid);
  if (!user) {
    return res.json({ authenticated: false, user: null, subscription: null });
  }
  const subscription = getSubscriptionInfo(user.id);
  return res.json({ authenticated: true, user, subscription });
});

app.patch('/api/auth/profile', async (req: Request, res: Response) => {
  const session = extractAuthUser(req);
  if (!session) {
    return res.status(401).json({ error: 'Workspace session required to update profile settings.' });
  }
  const { name, username, preferredLanguage, theme, customInstructions } = req.body as {
    name?: string;
    username?: string;
    preferredLanguage?: LanguagePreference;
    theme?: 'dark' | 'light';
    customInstructions?: CustomInstructions;
  };
  const result = await updateUserProfile(session.uid, {
    name,
    username,
    preferredLanguage,
    theme,
    customInstructions,
  });
  if (result.code === 'USERNAME_TAKEN') {
    return res.status(409).json({ error: result.error, code: result.code });
  }
  if (result.code === 'USERNAME_INVALID') {
    return res.status(400).json({ error: result.error, code: result.code });
  }
  if (!result.user) {
    return res.status(404).json({ error: 'User account not found.' });
  }
  return res.json({ user: result.user });
});

// ============================================================================
// MEDIA ASSET SERVING
// ============================================================================

app.get('/api/media/:filename', async (req: Request, res: Response) => {
  const filename = String(req.params.filename || '');
  const filePath = resolveMediaFilePath(filename);
  if (!filePath) {
    return res.status(404).json({ error: 'Media file not found.' });
  }

  const format = typeof req.query.format === 'string' ? req.query.format.toLowerCase() : '';
  const isDownload = req.query.download === '1';
  const rawName = typeof req.query.name === 'string' ? req.query.name : '';
  const safeDownloadBase = rawName.replace(/[^a-zA-Z0-9._-]/g, '_') || filename;

  if (format === 'jpg' || format === 'jpeg') {
    try {
      const jpgBuffer = await sharp(filePath)
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 95, mozjpeg: true })
        .toBuffer();
      res.setHeader('Content-Type', 'image/jpeg');
      if (isDownload) {
        const dlName = safeDownloadBase.replace(/\.(png|jpe?g)$/i, '') + '.jpg';
        res.setHeader('Content-Disposition', `attachment; filename="${dlName}"`);
      }
      return res.send(jpgBuffer);
    } catch {
      return res.sendFile(filePath);
    }
  }

  if (format === 'png') {
    try {
      const pngBuffer = await sharp(filePath)
        .png({ compressionLevel: 6 })
        .toBuffer();
      res.setHeader('Content-Type', 'image/png');
      if (isDownload) {
        const dlName = safeDownloadBase.replace(/\.(png|jpe?g)$/i, '') + '.png';
        res.setHeader('Content-Disposition', `attachment; filename="${dlName}"`);
      }
      return res.send(pngBuffer);
    } catch {
      return res.sendFile(filePath);
    }
  }

  if (isDownload) {
    res.setHeader('Content-Disposition', `attachment; filename="${safeDownloadBase}"`);
  }
  return res.sendFile(filePath);
});

// ============================================================================
// MULTILINGUAL AI CHAT STREAM (SSE + WEB SEARCH + MULTIMODAL ATTACHMENTS)
// ============================================================================

function buildChatSystemInstruction(
  language: LanguagePreference,
  customInstructions?: CustomInstructions,
  webSearch?: boolean,
  messages: ChatMessage[] = []
): string {
  const effectiveLang = resolveEffectiveConversationLanguage(messages, language);

  const languageDirectives: Record<LanguagePreference, string> = {
    auto: `MULTILINGUAL & MANGLISH BEST-FRIEND CONVERSATION STYLE (CRITICAL):
- Automatically detect the language and vibe of every new user message and match it naturally.
- **MANGLISH + ENGLISH CASUAL MIX:** When the user writes in **Manglish** (Malayalam written in English letters, including spelling variations, typing typos, slang, and short forms like "sughamano da", "entha vishesham", "innu mood illa", "katha parayamo", "ntha patti"), reply naturally in **casual Manglish + English mix** written in English letters — just like two close Malayali best friends chatting!
  - Example tone: "Ayyo enna patti da? Mood off aano? Chill aaku, parayoo entha karyam enn 😊" or "Hahaha sathyam! Athu kidilan idea aanu bro 🔥".
  - Mix Malayalam and English effortlessly like real friends do—only switch to Malayalam script (മലയാളം) if the user writes in Malayalam script or explicitly asks for Malayalam script!
- If the user writes in **Malayalam script (മലയാളം)**, reply warmly in natural, friendly Malayalam script.
- If the user writes in **English**, reply naturally in warm, playful, casual **English** (do NOT insert Manglish/Malayalam words unless the user themselves uses Manglish/Malayalam).
- If the user writes in **Arabic (العربية)**, **Hindi (हिन्दी)**, **Tamil**, **Telugu**, **Kannada**, **Urdu (اردو)**, **Spanish**, **French**, or **any other language**, always reply warmly and naturally in that exact language.
- Remember the conversation's active language & tone across follow-up turns unless the user switches.`,
    en: `Talk naturally in warm, casual, friendly English like a close best friend.`,
    ml: `Talk warmly like a close best friend in natural, friendly Malayalam script (മലയാളം). Understand both Malayalam script and Manglish inputs effortlessly.`,
    manglish: `Talk like a close, caring, funny Malayali best friend in casual **Manglish (Malayalam written in English letters) + English mix**, just like real friends texting naturally.`,
    ar: `Talk warmly like a close, caring best friend in natural Arabic (العربية).`,
    hi: `Talk warmly like a close, caring best friend in natural Hindi (हिन्दी).`,
    es: `Talk warmly like a close, caring best friend in natural Spanish (Español).`,
    fr: `Talk warmly like a close, caring best friend in natural French (Français).`,
    ur: `Talk warmly like a close, caring best friend in natural Urdu (اردو).`,
  };

  let turnLanguageOverride = '';
  if (effectiveLang === 'manglish') {
    turnLanguageOverride = `\n\nMANDATORY OUTPUT VIBE & LANGUAGE FOR THIS REPLY:
- The user is chatting in Manglish (or selected Manglish casual mix). Reply naturally in **casual Manglish (Malayalam in English letters) mixed with casual English**, just like a real best friend!
- Use friendly casual expressions ("da", "bro", "machu", "ayyo", "sathyam", "kidu", "chill aaku", "saramilla") appropriately based on their mood, without overdoing it.
- Do NOT switch into stiff formal Malayalam script or robotic textbook English.`;
  } else if (effectiveLang === 'ml') {
    turnLanguageOverride = `\n\nMANDATORY OUTPUT VIBE & LANGUAGE FOR THIS REPLY:
- The user wrote in Malayalam script (മലയാളം) or selected Malayalam script. Reply in warm, friendly, conversational **Malayalam script (മലയാളം)** like a close friend—never stiff or robotic.`;
  } else if (effectiveLang === 'ar') {
    turnLanguageOverride = `\n\nMANDATORY OUTPUT VIBE & LANGUAGE FOR THIS REPLY: Reply warmly and casually like a close best friend in natural Arabic (العربية).`;
  } else if (effectiveLang === 'hi') {
    turnLanguageOverride = `\n\nMANDATORY OUTPUT VIBE & LANGUAGE FOR THIS REPLY: Reply warmly and casually like a close best friend in natural Hindi (हिन्दी).`;
  } else if (effectiveLang === 'ur') {
    turnLanguageOverride = `\n\nMANDATORY OUTPUT VIBE & LANGUAGE FOR THIS REPLY: Reply warmly and casually like a close best friend in natural Urdu (اردو).`;
  } else if (effectiveLang === 'es') {
    turnLanguageOverride = `\n\nMANDATORY OUTPUT VIBE & LANGUAGE FOR THIS REPLY: Reply warmly and casually like a close best friend in natural Spanish (Español).`;
  } else if (effectiveLang === 'fr') {
    turnLanguageOverride = `\n\nMANDATORY OUTPUT VIBE & LANGUAGE FOR THIS REPLY: Reply warmly and casually like a close best friend in natural French (Français).`;
  } else if (effectiveLang === 'en') {
    turnLanguageOverride = `\n\nMANDATORY OUTPUT VIBE & LANGUAGE FOR THIS REPLY: The user wrote in English. Reply completely in warm, casual, human-sounding English like a close best friend (do NOT switch to Manglish unless they use Manglish; if they wrote in another language like German/Tamil/etc., reply in that language).`;
  } else {
    turnLanguageOverride = `\n\nMANDATORY OUTPUT VIBE & LANGUAGE FOR THIS REPLY: Detect the user's exact language and vibe, and reply like their close best friend in that language.`;
  }

  const todayIso = new Date().toISOString().slice(0, 10);

  let instruction = `You are the user's close, funny, caring, playful, and deeply supportive best friend (with super-smart research & problem-solving skills when needed). Today's date is ${todayIso}.

${languageDirectives[language] || languageDirectives.auto}${turnLanguageOverride}

BEST-FRIEND PERSONALITY & SPEED/DIRECTNESS RULES (MOST IMPORTANT):
- **Fast, Direct & Zero Fluff:** Jump straight to the answer or conversation right away! Skip long introductions, robotic preambles ("Great question!", "Certainly!"), or filler. Keep casual chats and simple questions short, punchy, and natural—and give clear, well-structured detailed explanations only when the topic genuinely needs depth.
- **Sound 100% human & real — NEVER robotic or formal:** Talk naturally with warmth, humor, casual reactions, and genuine emotion.
- **Empathy & Mood Awareness:** Pick up on your friend's feelings right away! Comfort and hype them up when they're stressed/sad ("Ayyo saramilla da, njan koode ille ❤️"), and laugh/tease playfully when they're joking.
- **Use Emojis & Expressions Naturally:** Sprinkle natural emojis (😂, ❤️, 😅, 😊, 🙌, ✨, 👀) and light humor where they fit naturally without spamming.
- **Keep the Chat Alive & Engaging:** Remember everything mentioned earlier in the conversation! Ask genuine follow-up questions, share relatable opinions, and keep the chat interesting.
- **Never Leave Them Hanging:** NEVER say "I'm busy", "Try again later", or give cold excuses. Always show up with your best answer or support.

SMART HELPFULNESS, ACCURACY & PROBLEM SOLVING:
- When your friend asks factual questions, advice, coding, math, or complicated topics: answer directly first, then explain clearly in simple, friendly words—never copy-paste dry website text word-for-word.
- Never invent fake facts, stats, or links! Separate verified facts from opinions, and be honest if something has a real limitation while offering the best alternative.
- When analyzing uploaded photos or files, look closely at the actual details and react/comment directly like a sharp friend.`;

  if (webSearch) {
    instruction += `\n\nLIVE WEB RESEARCH & SOURCE VERIFICATION (KEEP FRIENDLY TONE):
- When the question needs current facts, dates, latest news, or real-world verification as of ${todayIso}, verify carefully across reliable web sources rather than guessing.
- Present the verified answer naturally in your own warm, friendly words—NOT as a dry search dump—and share clickable Markdown source links ([Source Name](https://...)) ONLY for verified URLs actually returned by search results (never fabricate a link).`;
  }

  if (customInstructions?.enabled) {
    if (customInstructions.aboutUser?.trim()) {
      instruction += `\n\nWHAT YOU KNOW ABOUT YOUR FRIEND:\n${customInstructions.aboutUser.trim()}`;
    }
    if (customInstructions.responseStyle?.trim()) {
      instruction += `\n\nHOW THEY LIKE TO CHAT:\n${customInstructions.responseStyle.trim()}`;
    }
  }

  return instruction;
}

app.post('/api/chat/stream', async (req: Request, res: Response) => {
  const {
    messages: rawMessages = [],
    attachments = [],
    webSearch = true,
    language = 'auto',
    customInstructions,
  } = req.body as {
    messages: ChatMessage[];
    attachments?: ChatAttachmentPayload[];
    webSearch?: boolean;
    language?: LanguagePreference;
    customInstructions?: CustomInstructions;
  };

  const messages: ChatMessage[] = Array.isArray(rawMessages)
    ? rawMessages
        .filter((m): m is ChatMessage => Boolean(m && typeof m === 'object'))
        .map((m, idx) => ({
          ...m,
          id: m.id || `msg_${idx}`,
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content:
            typeof m.content === 'string'
              ? m.content
              : typeof (m as unknown as { text?: unknown }).text === 'string'
                ? String((m as unknown as { text: string }).text)
                : '',
          timestamp: typeof m.timestamp === 'number' ? m.timestamp : Date.now(),
        }))
    : [];

  if (messages.length === 0) {
    return res.status(400).json({ error: 'Messages array is required.' });
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  let clientClosed = false;
  res.on('close', () => {
    if (!res.writableEnded) {
      clientClosed = true;
    }
  });

  const sendEvent = (payload: Record<string, unknown>) => {
    if (!clientClosed && !res.writableEnded) {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    }
  };

  const effectiveLang = resolveEffectiveConversationLanguage(messages, language);
  const latestUserText =
    [...messages].reverse().find((m) => m.role === 'user' && m.content.trim())?.content.trim() || '';

  const buildContents = (extraWebContext?: WebResearchBundle) =>
    messages.map((msg, idx) => {
      const isLastUser = idx === messages.length - 1 && msg.role === 'user';
      const parts: Array<Record<string, unknown>> = [];

      if (isLastUser && Array.isArray(attachments) && attachments.length > 0) {
        for (const att of attachments) {
          if (att.base64 && (att.mimeType.startsWith('image/') || att.mimeType === 'application/pdf')) {
            parts.push({
              inlineData: {
                mimeType: att.mimeType,
                data: att.base64,
              },
            });
          } else if (att.textContent) {
            parts.push({
              text: `[Attached File: ${att.name}]\n\`\`\`\n${att.textContent.slice(0, 45000)}\n\`\`\``,
            });
          }
        }
      }

      if (isLastUser && extraWebContext && extraWebContext.findings.length > 0) {
        const evidence = extraWebContext.findings
          .map(
            (f, i) =>
              `[${i + 1}] ${f.title}\nURL: ${f.url}${f.snippet ? `\nExcerpt: ${f.snippet}` : ''}`
          )
          .join('\n\n');
        parts.push({
          text: `[LIVE MULTI-SOURCE WEB RESEARCH CONTEXT FOR THIS QUERY — USE THESE VERIFIED FACTS AND CLICKABLE URLS ONLY]\n${evidence}`,
        });
      }

      parts.push({ text: msg.content || ' ' });

      return {
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts,
      };
    });

  const streamModelAttempt = async (params: {
    model: string;
    thinkingLevel: ThinkingLevel;
    useGoogleSearchTool: boolean;
    systemInstruction: string;
    contents: Array<{ role: string; parts: Array<Record<string, unknown>> }>;
    initialSources?: WebSource[];
    timeoutMs?: number;
  }): Promise<boolean> => {
    const ai = getAiClient();
    const config: Record<string, unknown> = {
      systemInstruction: params.systemInstruction,
      thinkingConfig: { thinkingLevel: params.thinkingLevel },
      abortSignal: AbortSignal.timeout(params.timeoutMs || 12000),
    };
    if (params.useGoogleSearchTool) {
      config.tools = [{ googleSearch: {} }];
    }

    const stream = await ai.models.generateContentStream({
      model: params.model,
      contents: params.contents,
      config,
    });

    const seenUrls = new Set<string>((params.initialSources || []).map((s) => s.url));
    const collectedSources: WebSource[] = [...(params.initialSources || [])];
    let emittedAnyText = false;

    for await (const chunk of stream) {
      if (clientClosed) break;

      if (chunk.text) {
        emittedAnyText = true;
        sendEvent({ type: 'delta', text: chunk.text });
      }

      const groundingChunks = (
        chunk as unknown as {
          candidates?: Array<{
            groundingMetadata?: {
              groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
            };
          }>;
        }
      )?.candidates?.[0]?.groundingMetadata?.groundingChunks;

      if (Array.isArray(groundingChunks)) {
        for (const gc of groundingChunks) {
          const uri = gc.web?.uri;
          if (uri && !seenUrls.has(uri)) {
            seenUrls.add(uri);
            let fallbackTitle = 'Web Source';
            try {
              fallbackTitle = new URL(uri).hostname;
            } catch {
              // ignore invalid URL formatting
            }
            collectedSources.push({
              title: gc.web?.title || fallbackTitle,
              url: uri,
            });
          }
        }
      }
    }

    if (!emittedAnyText && !clientClosed) {
      return false;
    }

    if (!clientClosed) {
      if (collectedSources.length > 0) {
        sendEvent({ type: 'sources', sources: collectedSources });
      }
      sendEvent({ type: 'done' });
      res.end();
    }
    return true;
  };

  let lastError: unknown = null;
  let fallbackResearch: WebResearchBundle | null = null;

  try {
    const systemInstruction = buildChatSystemInstruction(
      language,
      customInstructions,
      webSearch,
      messages
    );
    const baseContents = buildContents();

    const skipWebLookupForTurn = isDirectCasualOrMathQuery(latestUserText);
    const effectiveWebSearchForTurn = Boolean(webSearch) && !skipWebLookupForTurn;

    if (hasValidApiKey()) {
      let tier1Code = '';
      let tier2Code = '';
      const isComplexQuery =
        latestUserText.length > 160 ||
        /\b(step by step|prove|derive|analyze|compare|architecture|debug|algorithm|equation)\b/i.test(
          latestUserText
        );
      const primaryThinkingLevel = isComplexQuery ? ThinkingLevel.MEDIUM : ThinkingLevel.LOW;

      // Tier 1: Primary Gemini 4 Hydrogen (fast response, native Google Search only when helpful)
      try {
        const ok = await streamModelAttempt({
          model: 'gemini-4-hydrogen',
          thinkingLevel: primaryThinkingLevel,
          useGoogleSearchTool: effectiveWebSearchForTurn,
          systemInstruction,
          contents: baseContents,
          timeoutMs: effectiveWebSearchForTurn ? 10000 : 7500,
        });
        if (ok) return;
      } catch (err) {
        lastError = err;
        tier1Code = parseGeminiError(err).code;
      }

      if (clientClosed) return;

      // Tier 2: Secondary Flash Lite model
      if (tier1Code !== 'API_KEY_PERMISSION') {
        try {
          const ok = await streamModelAttempt({
            model: 'gemini-3.1-flash-lite',
            thinkingLevel: ThinkingLevel.MINIMAL,
            useGoogleSearchTool: effectiveWebSearchForTurn,
            systemInstruction,
            contents: baseContents,
            timeoutMs: 8000,
          });
          if (ok) return;
        } catch (err) {
          lastError = err;
          tier2Code = parseGeminiError(err).code;
        }
      }

      if (clientClosed) return;

      // Tier 3: Alternative multi-source web research + model synthesis (skipped if casual/math or quota/auth blocked)
      const bothQuotaOrAuthBlocked =
        (tier1Code === 'QUOTA_EXCEEDED' || tier1Code === 'API_KEY_PERMISSION') &&
        (!tier2Code || tier2Code === 'QUOTA_EXCEEDED' || tier2Code === 'API_KEY_PERMISSION');

      fallbackResearch =
        latestUserText && !skipWebLookupForTurn
          ? await searchWebMultiSource(latestUserText, effectiveLang)
          : { findings: [], sources: [] };

      if (!bothQuotaOrAuthBlocked) {
        const groundedContents = buildContents(fallbackResearch);
        for (const fallbackModel of [
          { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW },
          { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL },
        ]) {
          if (clientClosed) return;
          try {
            const ok = await streamModelAttempt({
              model: fallbackModel.model,
              thinkingLevel: fallbackModel.thinkingLevel,
              useGoogleSearchTool: false,
              systemInstruction,
              contents: groundedContents,
              initialSources: fallbackResearch.sources,
              timeoutMs: 8000,
            });
            if (ok) return;
          } catch (err) {
            lastError = err;
          }
        }
      }
    }

    if (clientClosed) return;

    // Tier 4: Direct fast friendly response / verified multi-source live web research
    if (!fallbackResearch) {
      fallbackResearch =
        latestUserText && !skipWebLookupForTurn
          ? await searchWebMultiSource(latestUserText, effectiveLang)
          : { findings: [], sources: [] };
    }

    const limitationMsg = hasValidApiKey()
      ? parseGeminiError(lastError || new Error('Gemini API quota or capacity reached')).message
      : 'GEMINI_API_KEY is not configured in Settings > Secrets.';

    const directAnswer = formatFallbackResearchResponse({
      query: latestUserText || 'your request',
      bundle: fallbackResearch,
      effectiveLang,
      modelLimitationNote: limitationMsg,
    });

    sendEvent({ type: 'delta', text: directAnswer });
    if (fallbackResearch.sources.length > 0) {
      sendEvent({ type: 'sources', sources: fallbackResearch.sources });
    }
    sendEvent({ type: 'done' });
    res.end();
  } catch (err) {
    console.error('Chat stream error:', err);
    const parsed = parseGeminiError(err);
    sendEvent({ type: 'error', code: parsed.code, message: parsed.message });
    res.end();
  }
});

app.post('/api/chat/title', async (req: Request, res: Response) => {
  const { firstMessage = '' } = req.body as { firstMessage?: string };
  if (!firstMessage.trim() || !hasValidApiKey()) {
    return res.json({ title: firstMessage.trim().slice(0, 48) || 'New Conversation' });
  }
  try {
    const ai = getAiClient();
    const detectedFirst = detectTextLanguage(firstMessage);
    const titlePrompt =
      detectedFirst === 'ml'
        ? `The user wrote this message in Malayalam script. Generate a concise 3 to 6 word conversation title in proper **Malayalam script (മലയാളം)**. Return only the title text without quotes:\n\n${firstMessage.slice(0, 400)}`
        : detectedFirst === 'manglish'
          ? `The user wrote this message in Manglish (Malayalam in English letters). Generate a natural, concise 3 to 6 word chat title in casual Manglish or English matching their vibe. Return only the title text without quotes:\n\n${firstMessage.slice(0, 400)}`
          : `Generate a concise 3 to 6 word friendly chat title in the same language/script as this message. Return only the title text without quotes:\n\n${firstMessage.slice(0, 400)}`;
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: titlePrompt,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });
    const title = (response.text || '').replace(/^["']|["']$/g, '').trim().slice(0, 70);
    return res.json({ title: title || firstMessage.slice(0, 48) });
  } catch {
    return res.json({ title: firstMessage.trim().slice(0, 48) || 'New Conversation' });
  }
});

// ============================================================================
// AUDIO TRANSCRIPTION & TEXT-TO-SPEECH (READ ALOUD / VOICE CONVERSATION)
// ============================================================================

app.post('/api/audio/transcribe', async (req: Request, res: Response) => {
  const { audioBase64, mimeType = 'audio/webm' } = req.body as {
    audioBase64?: string;
    mimeType?: string;
  };
  if (!audioBase64) {
    return res.status(400).json({ error: 'Audio data is required.' });
  }
  if (!hasValidApiKey()) {
    return res.status(503).json({
      error: 'Audio transcription requires GEMINI_API_KEY in Settings > Secrets. You can type or paste your text directly into chat instead.',
    });
  }
  try {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: {
        parts: [
          { inlineData: { mimeType, data: audioBase64 } },
          {
            text: 'Transcribe this spoken audio accurately in its original language (whether English, Malayalam, Manglish, Arabic, Hindi, Spanish, French, Urdu, or mixed). Return only the transcript.',
          },
        ],
      },
    });
    return res.json({ text: (response.text || '').trim() });
  } catch (err) {
    const parsed = parseGeminiError(err);
    return res.status(parsed.status).json({ error: parsed.message, code: parsed.code });
  }
});

app.post('/api/audio/tts', async (req: Request, res: Response) => {
  const { text = '', voiceName = 'Kore' } = req.body as {
    text?: string;
    voiceName?: string;
  };
  const cleanText = text.replace(/```[\s\S]*?```/g, 'Code block omitted.').replace(/[#*_`>]/g, '').trim();
  if (!cleanText) {
    return res.status(400).json({ error: 'Text is required for speech synthesis.' });
  }
  if (!hasValidApiKey()) {
    return res.status(503).json({
      error: 'Neural voice playback requires GEMINI_API_KEY in Settings > Secrets; browser speech synthesis can be used as an alternative.',
    });
  }
  try {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: cleanText.slice(0, 2500),
            },
          ],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
      },
    });

    const audioBase64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!audioBase64) {
      return res.status(500).json({ error: 'No audio data returned by TTS model.' });
    }
    return res.json({ audioBase64, mimeType: 'audio/wav' });
  } catch (err) {
    const parsed = parseGeminiError(err);
    return res.status(parsed.status).json({ error: parsed.message, code: parsed.code });
  }
});

// ============================================================================
// AI IMAGE GENERATION
// ============================================================================

const IMAGE_STYLE_PROMPTS: Record<Exclude<ImageStyle, 'auto'>, string> = {
  realistic: 'photorealistic, ultra-detailed natural photography, sharp focus, authentic textures, 8k lens clarity',
  cinematic: 'cinematic film still, anamorphic depth of field, atmospheric volumetric lighting, rich color grading',
  anime: 'high-craft studio anime illustration, crisp cel shading, expressive lighting, vibrant anime key visual',
  cartoon: 'vibrant stylized 2D/3D cartoon illustration, expressive character shapes, clean linework and rich color',
  '3d': 'clean octane 3D render, physically based materials, studio softbox rim lighting, smooth subsurface detail',
  digital_art: 'high-detail digital art, vibrant concept painting, rich atmospheric depth, polished modern digital brushwork',
  illustration: 'editorial digital illustration, expressive brushwork, refined composition, cohesive palette',
  poster: 'modern graphic poster design, bold visual hierarchy, crisp typography-ready composition, studio print finish',
  logo: 'minimalist iconic vector-style logo design, crisp geometric precision, balanced negative space, scalable brand mark',
  wallpaper: 'stunning high-detail widescreen or mobile wallpaper artwork, atmospheric depth, clean balanced framing',
};

app.post('/api/image/generate', async (req: Request, res: Response) => {
  const session = extractAuthUser(req);
  const {
    prompt = '',
    style = 'auto',
    sizePreset,
    aspectRatio = '1:1',
    customWidth,
    customHeight,
    quality = 'standard',
  } = req.body as {
    prompt?: string;
    style?: ImageStyle;
    sizePreset?: ImageSizePreset;
    aspectRatio?: AspectRatioOption;
    customWidth?: number;
    customHeight?: number;
    quality?: 'standard' | 'hd' | 'ultra';
  };

  if (!prompt.trim()) {
    return res.status(400).json({ error: 'Image prompt cannot be empty.' });
  }
  if (!hasValidApiKey()) {
    return res.status(503).json({
      error: 'Image generation requires an active GEMINI_API_KEY in Settings > Secrets.',
      code: 'SERVICE_UNAVAILABLE',
    });
  }

  // Enforce PRO gate for high-res Ultra/HD (Nano Banana 2.1) and daily usage quotas
  const isPro = session ? isUserProActive(session.uid) : false;
  if ((quality === 'hd' || quality === 'ultra') && !isPro) {
    return res.status(403).json({
      error: 'High-Resolution 2K/4K generation with Nano Banana 2.1 requires an active PRO subscription.',
      code: 'PRO_REQUIRED',
    });
  }

  const guestKey = getGuestClientKey(req);
  const currentSub = session
    ? getSubscriptionInfo(session.uid)
    : getGuestSubscriptionInfo(guestKey);

  if (currentSub.imageUsageToday >= currentSub.imageDailyLimit) {
    return res.status(429).json({
      error: isPro
        ? `You've used all ${currentSub.imageDailyLimit} PRO images for today. Your credits will reset tomorrow!`
        : "You've used all 15 free images for today. Your credits will reset tomorrow!",
      code: 'LIMIT_REACHED',
      subscription: currentSub,
    });
  }

  const model = isPro && (quality === 'hd' || quality === 'ultra')
    ? 'gemini-nano-banana-2.1'
    : 'gemini-3.1-flash-lite-image';
  const imageSize = quality === 'ultra' ? '2K' : '1K';
  const resolvedDims = resolveImageDimensions({
    sizePreset: sizePreset || aspectRatio,
    customWidth: typeof customWidth === 'number' ? customWidth : Number(customWidth) || undefined,
    customHeight: typeof customHeight === 'number' ? customHeight : Number(customHeight) || undefined,
    allowExtendedRatios: model === 'gemini-nano-banana-2.1',
  });

  const styleModifier = style !== 'auto' ? IMAGE_STYLE_PROMPTS[style] : undefined;

  let effectiveVisualPrompt = prompt.trim();
  let assistantMessage: string | undefined;
  const detectedLang = detectTextLanguage(prompt);

  try {
    const ai = getAiClient();

    // Interpret Manglish, Malayalam, or non-English image prompts into vivid English visual prompt
    // + a proper localized reply message (proper Malayalam script for Manglish/Malayalam!)
    if (detectedLang !== 'en' && detectedLang !== 'unknown') {
      try {
        const interpretRes = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: `Analyze this image generation request (detected language: ${detectedLang}).
If it is in Manglish (Malayalam in English letters, possibly with typos or informal words) or Malayalam, understand its exact meaning and cultural context.
Return a strict JSON object with two string keys:
1. "visualPrompt": a rich, accurate English image-generation description preserving every detail of the user's request (no markdown, plain text).
2. "replyMessage": a short, warm, best-friend style caption/comment about the created image. CRITICAL: If the user wrote in Manglish, write "replyMessage" naturally in casual Manglish + English mix like a close friend (with a fitting emoji). If written in Malayalam script (മലയാളം), write in friendly Malayalam script. If Arabic or any other language, match that language warmly.

User prompt: "${prompt.trim()}"`,
          config: {
            responseMimeType: 'application/json',
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        });
        const parsedPrompt = JSON.parse(interpretRes.text || '{}') as {
          visualPrompt?: string;
          replyMessage?: string;
        };
        if (parsedPrompt.visualPrompt?.trim()) {
          effectiveVisualPrompt = parsedPrompt.visualPrompt.trim();
        }
        if (parsedPrompt.replyMessage?.trim()) {
          assistantMessage = parsedPrompt.replyMessage.trim();
        }
      } catch {
        // Fallback to raw prompt if interpretation fails
      }
    }

    const fullPrompt = styleModifier
      ? `${effectiveVisualPrompt}. Visual style: ${styleModifier}.`
      : effectiveVisualPrompt;

    const response = await withTransientRetry(() =>
      ai.models.generateContent({
        model,
        contents: {
          parts: [
            {
              text: fullPrompt,
            },
          ],
        },
        config: {
          imageConfig:
            model === 'gemini-nano-banana-2.1'
              ? {
                  aspectRatio: resolvedDims.geminiAspectRatio,
                  imageSize,
                }
              : {
                  aspectRatio: resolvedDims.geminiAspectRatio,
                },
        },
      })
    );

    // Iterate through all output parts to find the generated image bytes
    let imageData: string | undefined;
    let mimeType = 'image/png';

    for (const part of response.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData?.data) {
        imageData = part.inlineData.data;
        mimeType = part.inlineData.mimeType ?? 'image/png';
        break;
      }
    }

    if (!imageData) {
      return res.status(502).json({
        error: 'The image model completed without returning image bytes. Try rephrasing your prompt.',
        code: 'NO_IMAGE_OUTPUT',
      });
    }

    // Apply exact selected width & height to the actual generated image file
    const rawBuffer = Buffer.from(imageData, 'base64');
    const processedBuffer = await sharp(rawBuffer)
      .resize(resolvedDims.targetWidth, resolvedDims.targetHeight, {
        fit: 'cover',
        position: 'centre',
        kernel: sharp.kernel.lanczos3,
      })
      .png({ compressionLevel: 6 })
      .toBuffer();

    const mediaUrl = saveMediaBuffer(processedBuffer, 'png');

    // Consume 1 credit ONLY after successful image generation & sizing
    const updatedSub = session
      ? await incrementImageUsage(session.uid)
      : await incrementGuestImageUsage(guestKey);

    return res.json({
      mediaUrl,
      mimeType: 'image/png',
      prompt: prompt.trim(),
      assistantMessage,
      style,
      sizePreset: resolvedDims.sizePreset,
      sizeLabel: resolvedDims.sizeLabel,
      aspectRatio: resolvedDims.geminiAspectRatio,
      targetWidth: resolvedDims.targetWidth,
      targetHeight: resolvedDims.targetHeight,
      quality,
      modelUsed: model,
      subscription: updatedSub,
    });
  } catch (err) {
    console.error('Image generation error:', err);
    const parsed = parseGeminiError(err);
    return res.status(parsed.status).json({ error: parsed.message, code: parsed.code });
  }
});

// ============================================================================
// AI VIDEO GENERATION (STRICTLY PRO-EXCLUSIVE — SERVER VERIFIED)
// ============================================================================

const VIDEO_STYLE_PROMPTS: Record<VideoStyle, string> = {
  cinematic: 'cinematic 35mm motion picture, smooth dolly camera movement, atmospheric lighting, film grain',
  realistic: 'hyper-realistic natural live-action footage, lifelike motion physics, authentic lighting',
  '3d_animation': 'polished 3D CGI animation, rich global illumination, fluid character and camera motion',
  anime: 'dynamic studio anime animation sequence, fluid frame motion, dramatic lighting',
  commercial: 'sleek high-end commercial product cinematography, crisp studio lighting, smooth tracking shot',
  documentary: 'authentic National Geographic style documentary cinematography, natural motion and detail',
};

app.post('/api/video/generate', async (req: Request, res: Response) => {
  const session = extractAuthUser(req);
  if (!session) {
    return res.status(401).json({
      error: 'Workspace session required. Upgrade to PRO to access AI Video Generation.',
      code: 'AUTH_REQUIRED',
    });
  }

  if (!isUserProActive(session.uid)) {
    return res.status(403).json({
      error: 'AI Video Generation is exclusively available to active PRO subscribers.',
      code: 'PRO_REQUIRED',
    });
  }

  const sub = getSubscriptionInfo(session.uid);
  if (sub.videoUsageMonth >= sub.videoMonthlyLimit) {
    return res.status(429).json({
      error: `Monthly PRO video limit (${sub.videoMonthlyLimit} videos/month) reached.`,
      code: 'LIMIT_REACHED',
    });
  }

  const {
    prompt = '',
    style = 'cinematic',
    aspectRatio = '16:9',
    duration = '5s',
    resolution = '720p',
    sourceImageBase64,
    sourceImageMimeType = 'image/png',
    sourceMediaUrl,
  } = req.body as {
    prompt?: string;
    style?: VideoStyle;
    aspectRatio?: '16:9' | '9:16';
    duration?: '5s' | '10s' | '15s';
    resolution?: '720p' | '1080p';
    sourceImageBase64?: string;
    sourceImageMimeType?: string;
    sourceMediaUrl?: string;
  };

  if (!prompt.trim() && !sourceImageBase64 && !sourceMediaUrl) {
    return res.status(400).json({ error: 'Please provide a video prompt or source image.' });
  }
  if (!hasValidApiKey()) {
    return res.status(503).json({
      error: 'Video generation requires an active billing-enabled GEMINI_API_KEY in Settings > Secrets.',
      code: 'SERVICE_UNAVAILABLE',
    });
  }

  let resolvedImageBase64 = sourceImageBase64;
  let resolvedImageMime = sourceImageMimeType;

  if (!resolvedImageBase64 && sourceMediaUrl?.startsWith('/api/media/')) {
    const filename = sourceMediaUrl.replace('/api/media/', '');
    const filePath = resolveMediaFilePath(filename);
    if (filePath) {
      resolvedImageBase64 = fs.readFileSync(filePath).toString('base64');
      resolvedImageMime = filename.endsWith('.jpg') ? 'image/jpeg' : 'image/png';
    }
  }

  const styleDesc = VIDEO_STYLE_PROMPTS[style] || VIDEO_STYLE_PROMPTS.cinematic;
  let resolvedVideoPrompt = prompt.trim();

  try {
    const ai = getAiClient();
    if (resolvedVideoPrompt && isManglishOrMalayalam(resolvedVideoPrompt)) {
      try {
        const translated = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: `Convert this Manglish/Malayalam video generation prompt into a clear, vivid English visual scene description preserving all user details. Return only the English prompt text:\n\n${resolvedVideoPrompt}`,
          config: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
        });
        if (translated.text?.trim()) {
          resolvedVideoPrompt = translated.text.trim();
        }
      } catch {
        // fallback to original prompt
      }
    }

    const fullPrompt = resolvedVideoPrompt
      ? `${resolvedVideoPrompt}. Visual direction: ${styleDesc}.`
      : `Animate this image smoothly with ${styleDesc}.`;

    const input = resolvedImageBase64
      ? [
          {
            type: 'image' as const,
            mime_type: resolvedImageMime,
            data: resolvedImageBase64,
          },
          {
            type: 'text' as const,
            text: fullPrompt,
          },
        ]
      : fullPrompt;

    const interaction = await ai.interactions.create(
      {
        model: 'gemini-omni-1.2-flash',
        input,
        background: false,
        store: false,
        stream: false,
        response_format: {
          type: 'video',
          aspect_ratio: aspectRatio === '9:16' ? '9:16' : '16:9',
          duration,
          resolution,
        },
      },
      { timeout: 300000 }
    );

    const anyInteraction = interaction as unknown as {
      output_video?: { data?: string; mime_type?: string };
    };
    const videoPart = anyInteraction.output_video;

    if (!videoPart?.data) {
      return res.status(502).json({
        error: 'The video model completed without returning video bytes. Please try another prompt.',
        code: 'NO_VIDEO_OUTPUT',
      });
    }

    const videoBuffer = Buffer.from(videoPart.data, 'base64');
    const mediaUrl = saveMediaBuffer(videoBuffer, 'mp4');
    const updatedSub = await incrementVideoUsage(session.uid);

    return res.json({
      mediaUrl,
      mimeType: videoPart.mime_type || 'video/mp4',
      prompt: prompt.trim() || 'Image-to-Video Animation',
      style,
      aspectRatio,
      duration,
      resolution,
      mode: resolvedImageBase64 ? 'image-to-video' : 'text-to-video',
      subscription: updatedSub,
    });
  } catch (err) {
    console.error('Video generation error:', err);
    const parsed = parseGeminiError(err);
    return res.status(parsed.status).json({ error: parsed.message, code: parsed.code });
  }
});

// ============================================================================
// PERSISTENT CHATS & SHARED CONVERSATIONS
// ============================================================================

app.get('/api/chats', (req: Request, res: Response) => {
  const session = extractAuthUser(req);
  if (!session) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  return res.json({ chats: getUserChats(session.uid) });
});

app.put('/api/chats/:id', async (req: Request, res: Response) => {
  const session = extractAuthUser(req);
  if (!session) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  const chat = req.body as ChatSession;
  if (!chat || chat.id !== req.params.id) {
    return res.status(400).json({ error: 'Invalid chat payload.' });
  }
  if (chat.isTemporary) {
    return res.status(400).json({ error: 'Temporary chats are not persisted to history.' });
  }
  const saved = await upsertUserChat(session.uid, chat);
  return res.json({ chat: saved });
});

app.delete('/api/chats/:id', async (req: Request, res: Response) => {
  const session = extractAuthUser(req);
  if (!session) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  const ok = await deleteUserChat(session.uid, String(req.params.id));
  return res.json({ deleted: ok });
});

app.post('/api/chats/:id/share', async (req: Request, res: Response) => {
  const session = extractAuthUser(req);
  if (!session) {
    return res.status(401).json({ error: 'Workspace session required to create a persistent share link.' });
  }
  const snapshot = await createShareSnapshot(session.uid, String(req.params.id));
  if (!snapshot) {
    return res.status(404).json({ error: 'Conversation not found.' });
  }
  return res.json({ shareId: snapshot.id, snapshot });
});

app.get('/api/share/:shareId', (req: Request, res: Response) => {
  const snapshot = getShareSnapshot(String(req.params.shareId));
  if (!snapshot) {
    return res.status(404).json({ error: 'Shared conversation link not found or expired.' });
  }
  return res.json({ snapshot });
});

// ============================================================================
// PINNED PROMPTS HISTORY (PER-USER PERSISTENT STORAGE)
// ============================================================================

app.get('/api/pinned-prompts', (req: Request, res: Response) => {
  const session = extractAuthUser(req);
  if (!session) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  return res.json({ pinnedPrompts: getUserPinnedPrompts(session.uid) });
});

app.post('/api/pinned-prompts', async (req: Request, res: Response) => {
  const session = extractAuthUser(req);
  if (!session) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  const { prompt, title, category, chatId, messageId, createdAt } = req.body as {
    prompt?: string;
    title?: string;
    category?: string;
    chatId?: string;
    messageId?: string;
    createdAt?: number;
  };
  if (!prompt || !prompt.trim()) {
    return res.status(400).json({ error: 'Prompt text is required.' });
  }
  const pinnedPrompt = await createPinnedPrompt(session.uid, {
    prompt,
    title,
    category,
    chatId,
    messageId,
    createdAt,
  });
  return res.status(201).json({ pinnedPrompt });
});

app.patch('/api/pinned-prompts/:id', async (req: Request, res: Response) => {
  const session = extractAuthUser(req);
  if (!session) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  const { title, category, order, prompt } = req.body as {
    title?: string;
    category?: string;
    order?: number;
    prompt?: string;
  };
  const updated = await updatePinnedPrompt(session.uid, String(req.params.id), {
    title,
    category,
    order,
    prompt,
  });
  if (!updated) {
    return res.status(404).json({ error: 'Pinned prompt not found.' });
  }
  return res.json({ pinnedPrompt: updated });
});

app.delete('/api/pinned-prompts/:id', async (req: Request, res: Response) => {
  const session = extractAuthUser(req);
  if (!session) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  const deleted = await deletePinnedPrompt(session.uid, String(req.params.id));
  return res.json({ deleted });
});

// ============================================================================
// PERSONAL LIBRARY ("MY LIBRARY") & FOLDERS
// ============================================================================

app.get('/api/library', (req: Request, res: Response) => {
  const session = extractAuthUser(req);
  if (!session) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  return res.json(getUserLibrary(session.uid));
});

app.post('/api/library/items', async (req: Request, res: Response) => {
  const session = extractAuthUser(req);
  if (!session) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  const { type, title, folderId = null, content, prompt, style, aspectRatio, mediaUrl, mimeType, metadata } =
    req.body as {
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
    };

  if (!type || !title) {
    return res.status(400).json({ error: 'Item type and title are required.' });
  }

  const item = await addUserLibraryItem(session.uid, {
    type,
    title,
    folderId,
    content,
    prompt,
    style,
    aspectRatio,
    mediaUrl,
    mimeType,
    metadata,
  });
  return res.status(201).json({ item });
});

app.post('/api/library/upload', async (req: Request, res: Response) => {
  const session = extractAuthUser(req);
  if (!session) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  const {
    title,
    type = 'document',
    folderId = null,
    mimeType = 'application/octet-stream',
    base64,
    textContent,
  } = req.body as {
    title: string;
    type?: LibraryItemType;
    folderId?: string | null;
    mimeType?: string;
    base64?: string;
    textContent?: string;
  };

  if (!title) {
    return res.status(400).json({ error: 'File title is required.' });
  }

  let mediaUrl: string | undefined;
  if (base64) {
    const ext = title.includes('.') ? title.split('.').pop() || 'bin' : mimeType.split('/')[1] || 'bin';
    mediaUrl = saveMediaBuffer(Buffer.from(base64, 'base64'), ext);
  }

  const item = await addUserLibraryItem(session.uid, {
    type,
    title,
    folderId,
    content: textContent,
    mediaUrl,
    mimeType,
  });
  return res.status(201).json({ item });
});

app.patch('/api/library/items/:id', async (req: Request, res: Response) => {
  const session = extractAuthUser(req);
  if (!session) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  const updated = await updateUserLibraryItem(session.uid, String(req.params.id), req.body);
  if (!updated) {
    return res.status(404).json({ error: 'Library item not found.' });
  }
  return res.json({ item: updated });
});

app.delete('/api/library/items/:id', async (req: Request, res: Response) => {
  const session = extractAuthUser(req);
  if (!session) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  const deleted = await deleteUserLibraryItem(session.uid, String(req.params.id));
  return res.json({ deleted });
});

app.post('/api/library/folders', async (req: Request, res: Response) => {
  const session = extractAuthUser(req);
  if (!session) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  const { name } = req.body as { name?: string };
  if (!name?.trim()) {
    return res.status(400).json({ error: 'Folder name is required.' });
  }
  const folder = await createUserFolder(session.uid, name);
  return res.status(201).json({ folder });
});

app.patch('/api/library/folders/:id', async (req: Request, res: Response) => {
  const session = extractAuthUser(req);
  if (!session) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  const { name } = req.body as { name?: string };
  if (!name?.trim()) {
    return res.status(400).json({ error: 'Folder name is required.' });
  }
  const folder = await renameUserFolder(session.uid, String(req.params.id), name);
  if (!folder) {
    return res.status(404).json({ error: 'Folder not found.' });
  }
  return res.json({ folder });
});

app.delete('/api/library/folders/:id', async (req: Request, res: Response) => {
  const session = extractAuthUser(req);
  if (!session) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  const deleted = await deleteUserFolder(session.uid, String(req.params.id));
  return res.json({ deleted });
});

// ============================================================================
// PRO SUBSCRIPTION & PAYMENT GATEWAY
// ============================================================================

app.get('/api/subscription/status', (req: Request, res: Response) => {
  const session = extractAuthUser(req);
  if (!session) {
    return res.json(getGuestSubscriptionInfo(getGuestClientKey(req)));
  }
  return res.json(getSubscriptionInfo(session.uid));
});

app.post('/api/subscription/checkout', async (req: Request, res: Response) => {
  const session = extractAuthUser(req);
  if (!session) {
    return res.status(401).json({ error: 'Workspace session required before upgrading to PRO.' });
  }

  const {
    plan = 'monthly',
    paymentMethod = 'card',
    cardNumber,
    expiry,
    cvc,
    cardHolder,
    upiId,
  } = req.body as {
    plan?: BillingCycle;
    paymentMethod?: 'card' | 'upi' | 'stripe';
    cardNumber?: string;
    expiry?: string;
    cvc?: string;
    cardHolder?: string;
    upiId?: string;
  };

  if (plan !== 'monthly' && plan !== 'yearly') {
    return res.status(400).json({ error: 'Invalid subscription plan selected.' });
  }

  // Real Stripe Checkout when STRIPE_SECRET_KEY + price IDs are configured
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const priceId =
    plan === 'yearly'
      ? process.env.STRIPE_PRO_YEARLY_PRICE_ID
      : process.env.STRIPE_PRO_MONTHLY_PRICE_ID;

  if (stripeKey && priceId) {
    try {
      const origin = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
      const bodyParams = new URLSearchParams({
        mode: 'subscription',
        'line_items[0][price]': priceId,
        'line_items[0][quantity]': '1',
        'metadata[userId]': session.uid,
        'metadata[plan]': plan,
        success_url: `${origin}/?stripe_session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/?upgrade_canceled=1`,
      });

      const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${stripeKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: bodyParams.toString(),
      });

      const stripeData = (await stripeRes.json()) as { url?: string; error?: { message?: string } };
      if (!stripeRes.ok || !stripeData.url) {
        return res.status(502).json({
          error: stripeData.error?.message || 'Stripe checkout initialization failed.',
        });
      }
      return res.json({ mode: 'stripe', checkoutUrl: stripeData.url });
    } catch (err) {
      return res.status(502).json({
        error: err instanceof Error ? err.message : 'Unable to reach Stripe payment gateway.',
      });
    }
  }

  // Built-in Payment Gateway validation & server-side activation
  let last4 = '4242';
  if (paymentMethod === 'card') {
    const digits = (cardNumber || '').replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 19) {
      return res.status(400).json({ error: 'Please enter a valid 13–19 digit card number.' });
    }
    if (!expiry || !/^\d{2}\/\d{2}$/.test(expiry.trim())) {
      return res.status(400).json({ error: 'Please enter card expiry in MM/YY format.' });
    }
    if (!cvc || !/^\d{3,4}$/.test(cvc.trim())) {
      return res.status(400).json({ error: 'Please enter a valid 3 or 4 digit security code (CVC).' });
    }
    if (!cardHolder || cardHolder.trim().length < 2) {
      return res.status(400).json({ error: 'Please enter the cardholder name.' });
    }
    last4 = digits.slice(-4);
  } else if (paymentMethod === 'upi') {
    if (!upiId || !/^[\w.\-]+@[\w]+$/.test(upiId.trim())) {
      return res.status(400).json({ error: 'Please enter a valid UPI ID (e.g. name@bank).' });
    }
    last4 = 'UPI';
  }

  const subscription = await activateProSubscription(session.uid, plan, paymentMethod, last4);
  return res.json({ mode: 'activated', subscription });
});

app.post('/api/subscription/verify-stripe', async (req: Request, res: Response) => {
  const session = extractAuthUser(req);
  if (!session) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  const { sessionId } = req.body as { sessionId?: string };
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey || !sessionId) {
    return res.status(400).json({ error: 'Stripe verification parameters missing.' });
  }

  try {
    const stripeRes = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
      {
        headers: { Authorization: `Bearer ${stripeKey}` },
      }
    );
    const data = (await stripeRes.json()) as {
      payment_status?: string;
      metadata?: { userId?: string; plan?: BillingCycle };
    };
    if (!stripeRes.ok || data.payment_status !== 'paid' || data.metadata?.userId !== session.uid) {
      return res.status(403).json({ error: 'Payment session could not be verified.' });
    }
    const plan: BillingCycle = data.metadata?.plan === 'yearly' ? 'yearly' : 'monthly';
    const subscription = await activateProSubscription(session.uid, plan, 'stripe', 'STRP');
    return res.json({ subscription });
  } catch (err) {
    return res.status(502).json({
      error: err instanceof Error ? err.message : 'Stripe verification failed.',
    });
  }
});

app.post('/api/subscription/cancel', async (req: Request, res: Response) => {
  const session = extractAuthUser(req);
  if (!session) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  const subscription = await cancelProSubscription(session.uid);
  return res.json({ subscription });
});

// ============================================================================
// SERVER STARTUP (VITE MIDDLEWARE IN DEV, STATIC DIST IN PROD)
// ============================================================================

async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MIND MASTER AI server running on port ${PORT} [env=${process.env.NODE_ENV || 'development'}]`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
