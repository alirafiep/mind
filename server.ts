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
  deletePinnedPrompt,
  deleteUserChat,
  deleteUserFolder,
  deleteUserLibraryItem,
  getGuestSubscriptionInfo,
  getOrCreateUser,
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
  verifyGoogleCredential,
} from './server/auth.ts';
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
  if (lower.includes('403') || lower.includes('permission_denied') || lower.includes('api_key')) {
    return {
      status: 503,
      code: 'AI_SERVICE_UNAVAILABLE',
      message: 'The AI service is temporarily unavailable. Please try again shortly.',
    };
  }
  if (lower.includes('429') || lower.includes('resource_exhausted') || lower.includes('quota')) {
    return {
      status: 429,
      code: 'QUOTA_EXCEEDED',
      message: 'The AI service is busy right now. Please try again in a few moments.',
    };
  }
  if (lower.includes('404') || lower.includes('not_found')) {
    return {
      status: 404,
      code: 'MODEL_UNAVAILABLE',
      message: 'The requested AI model endpoint returned not found. Please check model availability for your key.',
    };
  }
  if (lower.includes('400') || lower.includes('invalid_request') || lower.includes('invalid_argument')) {
    return {
      status: 400,
      code: 'INVALID_REQUEST',
      message: raw || 'The AI request parameters were invalid. Please try adjusting your prompt or settings.',
    };
  }
  return {
    status: 500,
    code: 'AI_ERROR',
    message: raw || 'An unexpected error occurred while processing your AI request.',
  };
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
    googleClientId:
      process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || null,
    stripeEnabled: Boolean(process.env.STRIPE_SECRET_KEY),
    hasApiKey: hasValidApiKey(),
  });
});

app.post('/api/auth/google', async (req: Request, res: Response) => {
  const { idToken, accessToken } = req.body as { idToken?: string; accessToken?: string };
  if (!idToken && !accessToken) {
    return res.status(400).json({ error: 'Missing Google credential token.' });
  }

  const googleUser = await verifyGoogleCredential({ idToken, accessToken });
  if (!googleUser) {
    return res.status(401).json({ error: 'Could not verify Google account credential.' });
  }

  const user = getOrCreateUser({
    email: googleUser.email,
    name: googleUser.name,
    avatarUrl: googleUser.avatarUrl,
    authProvider: 'google',
  });
  const token = signSessionToken(user.id, user.email);
  const subscription = getSubscriptionInfo(user.id);

  return res.json({ token, user, subscription });
});

app.post('/api/auth/signin', (_req: Request, res: Response) => {
  return res.status(403).json({
    error: 'Google Sign-In is the only authentication method supported.',
    code: 'GOOGLE_SIGNIN_ONLY',
  });
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
    return res.status(401).json({ error: 'Sign in required to update profile settings.' });
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
  webSearch?: boolean
): string {
  const languageDirectives: Record<LanguagePreference, string> = {
    auto: `MULTILINGUAL AUTO-DETECTION (CRITICAL):
- Automatically detect the language and script of the user's latest message.
- If the user writes in **Manglish** (Malayalam written in English/Latin letters, e.g., "sughamano", "entha vishesham", "keralathile ettavum valiya nadi ethanu", "malayalathil parayu"), understand the meaning accurately and reply naturally in **Manglish** (or Malayalam script if they ask for Malayalam script).
- If the user writes in **Malayalam (മലയാളം)**, reply in natural, accurate Malayalam.
- If the user writes in **English**, reply in clear English.
- If the user writes in **Arabic (العربية)**, **Hindi (हिन्दी)**, **Spanish (Español)**, **French (Français)**, **Urdu (اردو)**, or any other language or mixed language, match their exact language and script seamlessly.
- Maintain the conversation's active language across follow-up turns unless the user switches or asks for another language.`,
    en: `Respond in clear, accurate English unless the user explicitly switches to another language.`,
    ml: `Respond in natural, fluent Malayalam (മലയാളം). Even if the user mixes English technical terms, keep the response in clear Malayalam.`,
    manglish: `Respond in natural, friendly Manglish (Malayalam written phonetically using English/Latin letters, e.g., "Njan sahayikkam!"). Understand both Manglish and Malayalam inputs seamlessly.`,
    ar: `Respond in clear, natural Arabic (العربية).`,
    hi: `Respond in clear, natural Hindi (हिन्दी).`,
    es: `Respond in clear, natural Spanish (Español).`,
    fr: `Respond in clear, natural French (Français).`,
    ur: `Respond in clear, natural Urdu (اردو).`,
  };

  let instruction = `You are MindMaster AI, an intelligent, thoughtful, and highly capable AI assistant.

${languageDirectives[language] || languageDirectives.auto}

INTELLIGENT BEHAVIOUR & INSTANT RESPONSIVENESS:
- Answer questions across any subject or domain freely—never restrict users to predefined topics.
- Provide complete, accurate, helpful answers immediately. Do NOT ask unnecessary confirmation questions, permission prompts, or filler follow-up questions.
- Maintain complete context from all previous messages in the conversation and answer follow-up questions directly without asking the user to repeat prior details.
- Structure answers cleanly using Markdown (headings, bullet lists, numbered steps, tables, and fenced code blocks with language tags like \`\`\`ts or \`\`\`python when appropriate).
- If you are uncertain about a fact, recent event, or obscure detail, explicitly state your uncertainty instead of inventing facts or fabricating citations.
- When analyzing uploaded images or documents, inspect every detail carefully and reference what you observe.`;

  if (webSearch) {
    instruction += `\n\nWEB SEARCH ENABLED:
- Ground your response in live web search results when answering current events, recent facts, statistics, or lookups. Cite key facts clearly.`;
  }

  if (customInstructions?.enabled) {
    if (customInstructions.aboutUser?.trim()) {
      instruction += `\n\nUSER CONTEXT (Custom Instructions — What the user wants you to know about them):\n${customInstructions.aboutUser.trim()}`;
    }
    if (customInstructions.responseStyle?.trim()) {
      instruction += `\n\nRESPONSE PREFERENCES (Custom Instructions — How the user wants you to respond):\n${customInstructions.responseStyle.trim()}`;
    }
  }

  return instruction;
}

app.post('/api/chat/stream', async (req: Request, res: Response) => {
  const {
    messages = [],
    attachments = [],
    webSearch = false,
    language = 'auto',
    customInstructions,
  } = req.body as {
    messages: ChatMessage[];
    attachments?: ChatAttachmentPayload[];
    webSearch?: boolean;
    language?: LanguagePreference;
    customInstructions?: CustomInstructions;
  };

  if (!hasValidApiKey()) {
    return res.status(503).json({
      error: 'AI chat service is temporarily unavailable. Please try again shortly.',
      code: 'SERVICE_UNAVAILABLE',
    });
  }

  if (!Array.isArray(messages) || messages.length === 0) {
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

  try {
    const ai = getAiClient();
    const systemInstruction = buildChatSystemInstruction(language, customInstructions, webSearch);

    // Map conversation history into Gemini Content objects
    const contents = messages.map((msg, idx) => {
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

      parts.push({ text: msg.content || ' ' });

      return {
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts,
      };
    });

    const config: Record<string, unknown> = {
      systemInstruction,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    };

    if (webSearch) {
      config.tools = [{ googleSearch: {} }];
    }

    const stream = await ai.models.generateContentStream({
      model: 'gemini-4-hydrogen',
      contents,
      config,
    });

    const seenUrls = new Set<string>();
    const collectedSources: WebSource[] = [];

    for await (const chunk of stream) {
      if (clientClosed) break;

      if (chunk.text) {
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
            collectedSources.push({
              title: gc.web?.title || new URL(uri).hostname,
              url: uri,
            });
          }
        }
      }
    }

    if (!clientClosed) {
      if (collectedSources.length > 0) {
        sendEvent({ type: 'sources', sources: collectedSources });
      }
      sendEvent({ type: 'done' });
      res.end();
    }
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
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Generate a concise 3 to 6 word title (in the same language/script as the prompt) summarizing this user message. Return only the title text without quotes:\n\n${firstMessage.slice(0, 400)}`,
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
    return res.status(503).json({ error: 'Audio transcription is temporarily unavailable.' });
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
    return res.status(503).json({ error: 'Voice playback is temporarily unavailable.' });
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
      error: 'Image generation is temporarily unavailable. Please try again shortly.',
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
  const fullPrompt = styleModifier
    ? `${prompt.trim()}. Visual style: ${styleModifier}.`
    : prompt.trim();

  try {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
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
    });

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
      error: 'Sign in and upgrade to PRO to access AI Video Generation.',
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
      error: 'Video generation is temporarily unavailable. Please try again shortly.',
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
  const fullPrompt = prompt.trim()
    ? `${prompt.trim()}. Visual direction: ${styleDesc}.`
    : `Animate this image smoothly with ${styleDesc}.`;

  try {
    const ai = getAiClient();
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
    return res.status(401).json({ error: 'Sign in required to create a persistent share link.' });
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
    return res.status(401).json({ error: 'Please sign in before upgrading to PRO.' });
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
