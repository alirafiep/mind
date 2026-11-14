import React, { useEffect, useRef, useState } from 'react';
import {
  BookmarkPlus,
  Check,
  Copy,
  Download,
  Edit3,
  ExternalLink,
  EyeOff,
  FileText,
  Globe,
  Headphones,
  Image as ImageIcon,
  Loader2,
  Mic,
  MicOff,
  Paperclip,
  Plus,
  RefreshCw,
  Send,
  Share2,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { MarkdownRenderer } from './MarkdownRenderer';
import { VoiceConversationModal } from './VoiceConversationModal';
import { ImageSizePicker } from './ImageSizePicker';
import {
  IMAGE_STYLE_OPTIONS,
  detectImageIntentAndSize,
  downloadImageInFormat,
  resolveImageDimensions,
} from '../utils/imageSizes';
import logoSymbol from '../assets/images/ai_logo_symbol_1794559700521.jpg';
import type {
  ChatAttachmentPayload,
  ChatGeneratedImage,
  ChatMessage,
  ChatSession,
  ImageSizePreset,
  ImageStyle,
  LanguagePreference,
  WebSource,
} from '../types/app';

const LANGUAGE_OPTIONS: Array<{ value: LanguagePreference; label: string }> = [
  { value: 'auto', label: 'Auto-Detect Language' },
  { value: 'en', label: 'English' },
  { value: 'ml', label: 'മലയാളം (Malayalam)' },
  { value: 'manglish', label: 'Manglish' },
  { value: 'ar', label: 'العربية (Arabic)' },
  { value: 'hi', label: 'हिन्दी (Hindi)' },
  { value: 'es', label: 'Español (Spanish)' },
  { value: 'fr', label: 'Français (French)' },
  { value: 'ur', label: 'اردو (Urdu)' },
];

const STARTER_PROMPTS = [
  {
    title: 'Multilingual & Manglish',
    prompt: 'Sughamano? Keralathile ettavum famous aaya 5 sthalangalude details tharamo?',
  },
  {
    title: 'Web Research with Sources',
    prompt: 'What are the most important breakthroughs in renewable energy and fusion this year?',
    webSearch: true,
  },
  {
    title: 'Code & Architecture',
    prompt: 'Write a clean TypeScript rate-limiter utility with sliding window logic and explain how it works.',
  },
  {
    title: 'Structured Comparison',
    prompt: 'Create a detailed comparison table of SQL vs NoSQL databases with real-world use cases.',
  },
];

function getTimeGreeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function getSafeDisplayName(name?: string | null): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (!trimmed || trimmed.includes('@')) return null;
  return trimmed;
}

export function ChatWorkspace() {
  const {
    user,
    isPro,
    subscription,
    language,
    setLanguage,
    activeChat,
    createNewChat,
    saveChat,
    saveToLibrary,
    setSubscription,
    customInstructions,
    setActiveDocument,
    setActiveView,
    setShowAuthModal,
    notify,
  } = useApp();

  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<ChatAttachmentPayload[]>([]);
  const [webSearch, setWebSearch] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [voiceModalOpen, setVoiceModalOpen] = useState(false);
  const [isGeneratingInlineImage, setIsGeneratingInlineImage] = useState(false);

  // Inline ChatGPT-style Image Generation Mode & Size Selection
  const [imageMode, setImageMode] = useState(false);
  const [imageStyle, setImageStyle] = useState<ImageStyle>('auto');
  const [imageSizePreset, setImageSizePreset] = useState<ImageSizePreset>('1:1');
  const [customWidth, setCustomWidth] = useState<number>(1200);
  const [customHeight, setCustomHeight] = useState<number>(800);
  const [regeneratingImageMsgId, setRegeneratingImageMsgId] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<ChatGeneratedImage | null>(null);
  const [imageGenElapsed, setImageGenElapsed] = useState<number>(0);

  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const voiceRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (!isGeneratingInlineImage) {
      setImageGenElapsed(0);
      return;
    }
    const started = Date.now();
    const timer = window.setInterval(() => {
      setImageGenElapsed(Math.max(1, Math.floor((Date.now() - started) / 1000)));
    }, 500);
    return () => window.clearInterval(timer);
  }, [isGeneratingInlineImage]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChat?.messages.length, isStreaming, isGeneratingInlineImage]);

  useEffect(() => {
    return () => {
      if (ttsAudioRef.current) {
        ttsAudioRef.current.pause();
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const ensureActiveChat = (temporary = false): ChatSession => {
    if (activeChat) return activeChat;
    return createNewChat(temporary);
  };

  const handleStopGenerating = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  };

  const runCompletion = async (
    baseChat: ChatSession,
    historyMessages: ChatMessage[],
    pendingAttachments: ChatAttachmentPayload[] = [],
    useWebSearch = webSearch
  ) => {
    setIsStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;

    const assistantId = `msg_${Date.now()}_a`;
    const placeholderAssistant: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };

    let currentChat: ChatSession = {
      ...baseChat,
      messages: [...historyMessages, placeholderAssistant],
      updatedAt: Date.now(),
    };
    void saveChat(currentChat, false);

    let fullText = '';
    let sources: WebSource[] = [];

    try {
      await api.streamChat({
        messages: historyMessages,
        attachments: pendingAttachments,
        webSearch: useWebSearch,
        language,
        customInstructions,
        signal: controller.signal,
        onDelta: (delta) => {
          fullText += delta;
          currentChat = {
            ...currentChat,
            messages: currentChat.messages.map((m) =>
              m.id === assistantId ? { ...m, content: fullText } : m
            ),
            updatedAt: Date.now(),
          };
          void saveChat(currentChat, false);
        },
        onSources: (foundSources) => {
          sources = foundSources;
          currentChat = {
            ...currentChat,
            messages: currentChat.messages.map((m) =>
              m.id === assistantId ? { ...m, sources: foundSources } : m
            ),
          };
          void saveChat(currentChat, false);
        },
      });

      currentChat = {
        ...currentChat,
        messages: currentChat.messages.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: fullText || 'No response received.',
                sources: sources.length > 0 ? sources : m.sources,
              }
            : m
        ),
        updatedAt: Date.now(),
      };
      void saveChat(currentChat, true);

      // Generate concise chat title in background without delaying response completion
      if (!currentChat.isTemporary && historyMessages.length === 1) {
        const firstUserText = historyMessages[0].content;
        const chatSnapshot = currentChat;
        void api
          .generateChatTitle(firstUserText)
          .then((titled) => {
            if (titled?.title) {
              return saveChat(
                {
                  ...chatSnapshot,
                  title: titled.title,
                  updatedAt: Date.now(),
                },
                true
              );
            }
          })
          .catch(() => {});
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        if (!fullText) {
          fullText = '_Generation stopped._';
        }
        currentChat = {
          ...currentChat,
          messages: currentChat.messages.map((m) =>
            m.id === assistantId ? { ...m, content: fullText } : m
          ),
        };
        void saveChat(currentChat, true);
      } else {
        const msg = err instanceof Error ? err.message : 'Failed to reach AI service.';
        currentChat = {
          ...currentChat,
          messages: currentChat.messages.map((m) =>
            m.id === assistantId ? { ...m, content: msg, isError: true } : m
          ),
        };
        void saveChat(currentChat, true);
      }
    } finally {
      abortRef.current = null;
      setIsStreaming(false);
    }
  };

  const handleSend = async (overridePrompt?: string, forceWebSearch?: boolean) => {
    const text = (overridePrompt !== undefined ? overridePrompt : input).trim();
    if ((!text && attachments.length === 0) || isStreaming || isGeneratingInlineImage) return;

    const effectiveWebSearch = forceWebSearch !== undefined ? forceWebSearch : webSearch;
    if (attachments.length === 0 && !effectiveWebSearch) {
      const detectedImage = detectImageIntentAndSize(
        text,
        imageSizePreset,
        customWidth,
        customHeight
      );
      if (detectedImage) {
        if (overridePrompt === undefined) {
          setInput('');
        }
        await handleInlineGenerateImage({
          prompt: detectedImage.prompt,
          style: imageStyle,
          sizePreset: detectedImage.sizePreset,
          customWidth: detectedImage.customWidth,
          customHeight: detectedImage.customHeight,
        });
        return;
      }
    }

    const chat = ensureActiveChat(false);
    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}_u`,
      role: 'user',
      content: text || (attachments.length > 0 ? 'Analyze the attached file(s).' : ''),
      attachments: attachments.map(({ id, name, mimeType, size, kind, previewUrl }) => ({
        id,
        name,
        mimeType,
        size,
        kind,
        previewUrl,
      })),
      timestamp: Date.now(),
    };

    const currentAttachments = [...attachments];
    if (overridePrompt === undefined) {
      setInput('');
      setAttachments([]);
    }

    const updatedHistory = [...chat.messages, userMsg];
    await runCompletion(chat, updatedHistory, currentAttachments, effectiveWebSearch);
  };

  const remainingImageCredits = Math.max(
    0,
    subscription.imageDailyLimit - subscription.imageUsageToday
  );
  const isImageLimitReached = remainingImageCredits <= 0;
  const limitReachedMessage = isPro
    ? `You've used all ${subscription.imageDailyLimit} PRO images for today. Your credits will reset tomorrow!`
    : "You've used all 15 free images for today. Your credits will reset tomorrow!";

  const handleInlineGenerateImage = async (overrideParams?: {
    prompt: string;
    style: ImageStyle;
    sizePreset: ImageSizePreset;
    customWidth?: number;
    customHeight?: number;
    replaceAssistantMsgId?: string;
  }) => {
    const prompt = (overrideParams ? overrideParams.prompt : input).trim();
    if (!prompt || isGeneratingInlineImage || isStreaming) return;
    if (isImageLimitReached) {
      notify(limitReachedMessage, 'error');
      return;
    }

    const chosenStyle = overrideParams?.style ?? imageStyle;
    const chosenPreset = overrideParams?.sizePreset ?? imageSizePreset;
    const chosenCustomW = overrideParams?.customWidth ?? customWidth;
    const chosenCustomH = overrideParams?.customHeight ?? customHeight;

    const resolvedDims = resolveImageDimensions({
      sizePreset: chosenPreset,
      customWidth: chosenPreset === 'custom' ? chosenCustomW : undefined,
      customHeight: chosenPreset === 'custom' ? chosenCustomH : undefined,
      allowExtendedRatios: isPro,
    });

    setIsGeneratingInlineImage(true);
    if (overrideParams?.replaceAssistantMsgId) {
      setRegeneratingImageMsgId(overrideParams.replaceAssistantMsgId);
    }

    const chat = ensureActiveChat(false);

    if (overrideParams?.replaceAssistantMsgId) {
      try {
        const imgRes = await api.generateImage({
          prompt,
          style: chosenStyle,
          sizePreset: chosenPreset,
          customWidth: chosenPreset === 'custom' ? chosenCustomW : undefined,
          customHeight: chosenPreset === 'custom' ? chosenCustomH : undefined,
          quality: 'standard',
        });

        if (imgRes.subscription) {
          setSubscription(imgRes.subscription);
        }

        const generatedMeta: ChatGeneratedImage = {
          mediaUrl: imgRes.mediaUrl,
          prompt: imgRes.prompt,
          style: imgRes.style,
          sizePreset: imgRes.sizePreset,
          sizeLabel: imgRes.sizeLabel,
          aspectRatio: imgRes.aspectRatio,
          targetWidth: imgRes.targetWidth,
          targetHeight: imgRes.targetHeight,
          customWidth: chosenPreset === 'custom' ? chosenCustomW : undefined,
          customHeight: chosenPreset === 'custom' ? chosenCustomH : undefined,
        };

        await saveChat({
          ...chat,
          messages: chat.messages.map((m) =>
            m.id === overrideParams.replaceAssistantMsgId
              ? {
                  ...m,
                  content: `Regenerated image for **"${prompt}"** (${imgRes.sizeLabel} · ${imgRes.targetWidth}×${imgRes.targetHeight} px).`,
                  generatedImageUrl: imgRes.mediaUrl,
                  generatedImage: generatedMeta,
                  isError: false,
                  timestamp: Date.now(),
                }
              : m
          ),
          updatedAt: Date.now(),
        });
        notify('Image regenerated.', 'success');
      } catch (err) {
        notify(err instanceof Error ? err.message : 'Image regeneration failed.', 'error');
      } finally {
        setIsGeneratingInlineImage(false);
        setRegeneratingImageMsgId(null);
      }
      return;
    }

    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}_u`,
      role: 'user',
      content: `Create image (${resolvedDims.sizeLabel}, ${resolvedDims.targetWidth}×${resolvedDims.targetHeight} px): ${prompt}`,
      timestamp: Date.now(),
    };

    const assistantPlaceholderId = `msg_${Date.now()}_a`;
    const placeholderMsg: ChatMessage = {
      id: assistantPlaceholderId,
      role: 'assistant',
      content: '',
      generatedImage: {
        mediaUrl: '',
        prompt,
        style: chosenStyle,
        sizePreset: resolvedDims.sizePreset,
        sizeLabel: resolvedDims.sizeLabel,
        aspectRatio: resolvedDims.geminiAspectRatio,
        targetWidth: resolvedDims.targetWidth,
        targetHeight: resolvedDims.targetHeight,
        customWidth: chosenPreset === 'custom' ? chosenCustomW : undefined,
        customHeight: chosenPreset === 'custom' ? chosenCustomH : undefined,
      },
      timestamp: Date.now(),
    };

    setInput('');
    setImageMode(false);
    const baseMsgs = [...chat.messages, userMsg, placeholderMsg];
    const nextTitle = chat.messages.length === 0 ? `Image: ${prompt.slice(0, 40)}` : chat.title;
    void saveChat({ ...chat, title: nextTitle, messages: baseMsgs, updatedAt: Date.now() }, false);

    try {
      const imgRes = await api.generateImage({
        prompt,
        style: chosenStyle,
        sizePreset: chosenPreset,
        customWidth: chosenPreset === 'custom' ? chosenCustomW : undefined,
        customHeight: chosenPreset === 'custom' ? chosenCustomH : undefined,
        quality: 'standard',
      });

      if (imgRes.subscription) {
        setSubscription(imgRes.subscription);
      }

      const generatedMeta: ChatGeneratedImage = {
        mediaUrl: imgRes.mediaUrl,
        prompt: imgRes.prompt,
        style: imgRes.style,
        sizePreset: imgRes.sizePreset,
        sizeLabel: imgRes.sizeLabel,
        aspectRatio: imgRes.aspectRatio,
        targetWidth: imgRes.targetWidth,
        targetHeight: imgRes.targetHeight,
        customWidth: chosenPreset === 'custom' ? chosenCustomW : undefined,
        customHeight: chosenPreset === 'custom' ? chosenCustomH : undefined,
      };

      const completedMessages = baseMsgs.map((m) =>
        m.id === assistantPlaceholderId
          ? {
              ...m,
              content: `Generated image for **"${prompt}"**.`,
              generatedImageUrl: imgRes.mediaUrl,
              generatedImage: generatedMeta,
              timestamp: Date.now(),
            }
          : m
      );

      await saveChat({
        ...chat,
        title: nextTitle,
        messages: completedMessages,
        updatedAt: Date.now(),
      });
    } catch (err) {
      const failedMessages = baseMsgs.map((m) =>
        m.id === assistantPlaceholderId
          ? {
              ...m,
              content: err instanceof Error ? err.message : 'Image generation failed.',
              generatedImage: undefined,
              isError: true,
              timestamp: Date.now(),
            }
          : m
      );
      await saveChat({
        ...chat,
        title: nextTitle,
        messages: failedMessages,
        updatedAt: Date.now(),
      });
    } finally {
      setIsGeneratingInlineImage(false);
    }
  };

  const handleStartAnotherImage = (preset?: ImageSizePreset, style?: ImageStyle) => {
    if (preset) setImageSizePreset(preset);
    if (style) setImageStyle(style);
    setImageMode(true);
    setTimeout(() => {
      composerTextareaRef.current?.focus();
    }, 50);
  };

  const handleRegenerate = async (assistantIndex: number) => {
    if (!activeChat || isStreaming) return;
    const truncated = activeChat.messages.slice(0, assistantIndex);
    if (truncated.length === 0) return;
    await runCompletion(activeChat, truncated);
  };

  const handleSaveEditMessage = async (msgIndex: number) => {
    if (!activeChat || !editingText.trim() || isStreaming) return;
    const prior = activeChat.messages.slice(0, msgIndex);
    const editedMsg: ChatMessage = {
      ...activeChat.messages[msgIndex],
      content: editingText.trim(),
      editedAt: Date.now(),
    };
    setEditingMsgId(null);
    await runCompletion(activeChat, [...prior, editedMsg]);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const loaded: ChatAttachmentPayload[] = [];
    for (const file of files.slice(0, 4)) {
      const isImage = file.type.startsWith('image/');
      const isPdf = file.type === 'application/pdf';

      if (isImage || isPdf) {
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.readAsDataURL(file);
        });
        loaded.push({
          id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          kind: isImage ? 'image' : 'file',
          base64: dataUrl.split(',')[1] || '',
          previewUrl: isImage ? dataUrl : undefined,
        });
      } else {
        const textContent = await file.text().catch(() => '');
        loaded.push({
          id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: file.name,
          mimeType: file.type || 'text/plain',
          size: file.size,
          kind: 'file',
          textContent,
        });
      }
    }

    setAttachments((prev) => [...prev, ...loaded]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleReadAloud = async (msg: ChatMessage) => {
    if (speakingId === msg.id) {
      if (ttsAudioRef.current) {
        ttsAudioRef.current.pause();
        ttsAudioRef.current = null;
      }
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      setSpeakingId(null);
      return;
    }

    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      ttsAudioRef.current = null;
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();

    setSpeakingId(msg.id);
    try {
      const res = await api.generateSpeech(msg.content);
      const audio = new Audio(`data:${res.mimeType};base64,${res.audioBase64}`);
      ttsAudioRef.current = audio;
      audio.onended = () => setSpeakingId(null);
      audio.onerror = () => setSpeakingId(null);
      await audio.play();
    } catch {
      if ('speechSynthesis' in window) {
        const utter = new SpeechSynthesisUtterance(msg.content.replace(/[#*_`]/g, ''));
        utter.onend = () => setSpeakingId(null);
        window.speechSynthesis.speak(utter);
      } else {
        setSpeakingId(null);
        notify('Read aloud is unavailable for this response.', 'error');
      }
    }
  };

  const handleToggleMicInput = async () => {
    if (isRecordingVoice) {
      voiceRecorderRef.current?.stop();
      setIsRecordingVoice(false);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      notify('Microphone recording is unavailable in this browser.', 'error');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      voiceChunksRef.current = [];
      voiceRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) voiceChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (voiceChunksRef.current.length === 0) return;
        try {
          const blob = new Blob(voiceChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
            reader.readAsDataURL(blob);
          });
          const res = await api.transcribeAudio(base64, blob.type || 'audio/webm');
          if (res.text) {
            setInput((prev) => (prev ? `${prev} ${res.text}` : res.text));
          }
        } catch (err) {
          notify(err instanceof Error ? err.message : 'Voice transcription failed.', 'error');
        }
      };

      recorder.start();
      setIsRecordingVoice(true);
    } catch {
      notify('Please grant microphone permission to use voice input.', 'error');
    }
  };

  const handleCopyMessage = (id: string, text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1600);
  };

  const handleShareActiveChat = async () => {
    if (!activeChat || activeChat.messages.length === 0) return;
    if (activeChat.isTemporary) {
      notify('Temporary chats cannot be shared.', 'info');
      return;
    }
    if (!user) {
      const transcript = activeChat.messages
        .map((m) => `${m.role === 'user' ? 'User' : 'MindMaster AI'}:\n${m.content}`)
        .join('\n\n---\n\n');
      await navigator.clipboard.writeText(transcript).catch(() => {});
      notify('Conversation transcript copied. Sign in to create shareable web links.', 'info');
      return;
    }
    try {
      await saveChat(activeChat);
      const res = await api.shareChat(activeChat.id);
      const url = `${window.location.origin}/?share=${res.shareId}`;
      await navigator.clipboard.writeText(url).catch(() => {});
      notify('Shareable conversation link copied to clipboard.', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not share conversation.', 'error');
    }
  };

  const handleOpenAsDocument = async (msg: ChatMessage) => {
    const saved = await saveToLibrary({
      type: 'document',
      title: activeChat?.title || 'AI Document',
      content: msg.content,
    });
    if (saved) {
      setActiveDocument(saved);
      setActiveView('documents');
    }
  };

  const messages = activeChat?.messages || [];

  return (
    <div className="flex flex-col h-full min-h-0 bg-slate-50 dark:bg-slate-950">
      {/* Sub-header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-2.5 bg-white/80 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <div className="flex items-center gap-3">
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as LanguagePreference)}
            aria-label="Language preference"
            className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 cursor-pointer"
          >
            {LANGUAGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {activeChat?.isTemporary && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
              <EyeOff className="w-3.5 h-3.5" />
              <span>Temporary Chat (Not Saved)</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => createNewChat(!activeChat?.isTemporary)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${
              activeChat?.isTemporary
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300'
                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <EyeOff className="w-3.5 h-3.5" />
            <span>{activeChat?.isTemporary ? 'Exit Temporary' : 'Temporary Chat'}</span>
          </button>

          <button
            type="button"
            onClick={() => setVoiceModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Headphones className="w-3.5 h-3.5" />
            <span>Voice Mode</span>
          </button>

          {messages.length > 0 && !activeChat?.isTemporary && (
            <button
              type="button"
              onClick={() => void handleShareActiveChat()}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Share</span>
            </button>
          )}
        </div>
      </div>

      {/* Chat Messages Viewport */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 custom-scrollbar">
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.length === 0 ? (
            <div className="py-10 sm:py-16 text-center space-y-8 animate-fadeIn">
              <div className="space-y-3">
                <img
                  src={logoSymbol}
                  alt="AI brand symbol"
                  referrerPolicy="no-referrer"
                  className="w-16 h-16 mx-auto rounded-2xl object-cover border border-slate-200 dark:border-slate-800 shadow-lg"
                />
                {(() => {
                  const displayHandle = user
                    ? getSafeDisplayName(user.username) || getSafeDisplayName(user.name)
                    : null;
                  const greeting = getTimeGreeting();
                  return (
                    <>
                      <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
                        {displayHandle ? `Hi, ${displayHandle}!` : greeting}
                      </h1>
                      <p className="text-base sm:text-lg font-medium text-slate-500 dark:text-slate-400">
                        Where should we start?
                      </p>
                      {user && !user.username && (
                        <button
                          type="button"
                          onClick={() => setShowAuthModal(true)}
                          className="text-xs font-medium text-indigo-600 dark:text-sky-400 hover:underline cursor-pointer"
                        >
                          Choose your unique username
                        </button>
                      )}
                    </>
                  );
                })()}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                {STARTER_PROMPTS.map((item) => (
                  <button
                    key={item.title}
                    type="button"
                    onClick={() => void handleSend(item.prompt, Boolean(item.webSearch))}
                    className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-sky-500/60 transition-colors text-left cursor-pointer"
                  >
                    <p className="text-xs font-semibold text-indigo-600 dark:text-sky-400 mb-1">
                      {item.title}
                    </p>
                    <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-2">
                      {item.prompt}
                    </p>
                  </button>
                ))}
              </div>

              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => handleStartAnotherImage()}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-sky-500 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-xs transition-colors cursor-pointer"
                >
                  <ImageIcon className="w-4 h-4 text-indigo-600 dark:text-sky-400" />
                  <span>Create an AI Image with Custom Size</span>
                </button>
              </div>
            </div>
          ) : (
            messages.map((msg, idx) => {
              const isUser = msg.role === 'user';
              const isEditing = editingMsgId === msg.id;

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} animate-fadeIn`}
                >
                  {isUser ? (
                    <div className="max-w-[85%] sm:max-w-[78%] space-y-2">
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="flex flex-wrap justify-end gap-2">
                          {msg.attachments.map((att) =>
                            att.previewUrl ? (
                              <img
                                key={att.id}
                                src={att.previewUrl}
                                alt={att.name}
                                className="w-32 h-32 object-cover rounded-xl border border-slate-200 dark:border-slate-700"
                              />
                            ) : (
                              <div
                                key={att.id}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                <span className="truncate max-w-44">{att.name}</span>
                              </div>
                            )
                          )}
                        </div>
                      )}

                      {isEditing ? (
                        <div className="w-full min-w-[280px] sm:min-w-[420px] p-3 rounded-2xl bg-white dark:bg-slate-900 border border-indigo-500 space-y-2">
                          <textarea
                            rows={3}
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            className="w-full bg-transparent text-sm text-slate-900 dark:text-white focus:outline-none resize-none"
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingMsgId(null)}
                              className="px-3 py-1.5 rounded-lg text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleSaveEditMessage(idx)}
                              className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium cursor-pointer"
                            >
                              Save &amp; Resend
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="group relative">
                          <div className="px-4 py-3 rounded-2xl rounded-tr-sm bg-indigo-600 text-white text-[15px] leading-relaxed whitespace-pre-wrap">
                            {msg.content}
                          </div>
                          <div className="flex justify-end mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingMsgId(msg.id);
                                setEditingText(msg.content);
                              }}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>Edit</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="w-full max-w-full space-y-3">
                      <div
                        className={`rounded-2xl p-4 sm:p-5 border ${
                          msg.isError
                            ? 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        {msg.content ? (
                          <MarkdownRenderer content={msg.content} />
                        ) : msg.generatedImage && !msg.generatedImage.mediaUrl ? (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between gap-3 text-sm text-slate-600 dark:text-slate-300">
                              <div className="flex items-center gap-2">
                                <Loader2 className="w-4 h-4 animate-spin text-indigo-500 dark:text-sky-400 shrink-0" />
                                <span>
                                  Generating image ({msg.generatedImage.sizeLabel} · {msg.generatedImage.targetWidth}×{msg.generatedImage.targetHeight} px)...
                                </span>
                              </div>
                              {imageGenElapsed > 0 && (
                                <span className="text-xs font-mono tabular-nums text-slate-400">
                                  {imageGenElapsed}s
                                </span>
                              )}
                            </div>
                            <div
                              className="relative overflow-hidden w-full max-w-md rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center gap-2"
                              style={{
                                aspectRatio: `${msg.generatedImage.targetWidth} / ${msg.generatedImage.targetHeight}`,
                                maxHeight: '360px',
                              }}
                            >
                              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-indigo-500/10 to-transparent animate-pulse" />
                              <Sparkles className="w-7 h-7 text-indigo-500 dark:text-sky-400 animate-pulse relative z-10" />
                              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 relative z-10">
                                Rendering artwork...
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-sm text-slate-400">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Thinking...</span>
                          </div>
                        )}

                        {(msg.generatedImage?.mediaUrl || msg.generatedImageUrl) && (() => {
                          const imgUrl = msg.generatedImage?.mediaUrl || msg.generatedImageUrl!;
                          const meta = msg.generatedImage;
                          const isRegeneratingThis = regeneratingImageMsgId === msg.id;

                          return (
                            <div className="mt-4 space-y-3">
                              <div className="relative group inline-block max-w-full">
                                <div
                                  className="relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-950 max-w-lg"
                                  style={
                                    meta
                                      ? {
                                          aspectRatio: `${meta.targetWidth} / ${meta.targetHeight}`,
                                          maxHeight: '460px',
                                        }
                                      : undefined
                                  }
                                >
                                  <img
                                    src={imgUrl}
                                    alt={meta?.prompt || 'Generated AI image'}
                                    onClick={() =>
                                      setLightboxImage(
                                        meta || {
                                          mediaUrl: imgUrl,
                                          prompt: msg.content,
                                          style: 'auto',
                                          sizePreset: '1:1',
                                          sizeLabel: 'Square (1:1)',
                                          aspectRatio: '1:1',
                                          targetWidth: 1024,
                                          targetHeight: 1024,
                                        }
                                      )
                                    }
                                    className={`w-full h-full object-cover cursor-zoom-in transition-opacity ${
                                      isRegeneratingThis ? 'opacity-40' : 'opacity-100'
                                    }`}
                                  />
                                  {isRegeneratingThis && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-slate-950/40 backdrop-blur-[1px]">
                                      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/90 text-white text-xs font-medium">
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        <span>Regenerating...</span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {meta && (
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                                  <span>{meta.sizeLabel}</span>
                                  <span>·</span>
                                  <span className="tabular-nums">
                                    {meta.targetWidth}×{meta.targetHeight} px
                                  </span>
                                  {meta.style !== 'auto' && (
                                    <>
                                      <span>·</span>
                                      <span className="capitalize">{meta.style}</span>
                                    </>
                                  )}
                                </div>
                              )}

                              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    void downloadImageInFormat({
                                      mediaUrl: imgUrl,
                                      format: 'png',
                                      filenameBase: `mindmaster-${meta?.sizePreset || 'image'}-${Date.now()}`,
                                      targetWidth: meta?.targetWidth,
                                      targetHeight: meta?.targetHeight,
                                    })
                                  }
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors cursor-pointer"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  <span>PNG</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    void downloadImageInFormat({
                                      mediaUrl: imgUrl,
                                      format: 'jpg',
                                      filenameBase: `mindmaster-${meta?.sizePreset || 'image'}-${Date.now()}`,
                                      targetWidth: meta?.targetWidth,
                                      targetHeight: meta?.targetHeight,
                                    })
                                  }
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 text-white text-xs font-semibold transition-colors cursor-pointer"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  <span>JPG</span>
                                </button>

                                {meta && (
                                  <button
                                    type="button"
                                    disabled={isGeneratingInlineImage || isStreaming || isImageLimitReached}
                                    onClick={() =>
                                      void handleInlineGenerateImage({
                                        prompt: meta.prompt,
                                        style: meta.style,
                                        sizePreset: meta.sizePreset,
                                        customWidth: meta.customWidth || meta.targetWidth,
                                        customHeight: meta.customHeight || meta.targetHeight,
                                        replaceAssistantMsgId: msg.id,
                                      })
                                    }
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors cursor-pointer"
                                  >
                                    <RefreshCw className={`w-3.5 h-3.5 ${isRegeneratingThis ? 'animate-spin' : ''}`} />
                                    <span>Regenerate</span>
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() =>
                                    handleStartAnotherImage(meta?.sizePreset, meta?.style)
                                  }
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>Create Another Image</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    void saveToLibrary({
                                      type: 'image',
                                      title: (meta?.prompt || msg.content).slice(0, 70),
                                      mediaUrl: imgUrl,
                                      prompt: meta?.prompt || msg.content,
                                      style: meta?.style,
                                      aspectRatio: meta
                                        ? `${meta.sizePreset} (${meta.targetWidth}×${meta.targetHeight})`
                                        : '1:1',
                                      mimeType: 'image/png',
                                    })
                                  }
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                >
                                  <BookmarkPlus className="w-3.5 h-3.5" />
                                  <span>Save to Library</span>
                                </button>
                              </div>
                            </div>
                          );
                        })()}

                        {msg.sources && msg.sources.length > 0 && (
                          <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800">
                            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                              Web Sources
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {msg.sources.map((src, sIdx) => (
                                <a
                                  key={`${src.url}_${sIdx}`}
                                  href={src.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs text-slate-700 dark:text-slate-200 transition-colors max-w-xs"
                                >
                                  <Globe className="w-3 h-3 shrink-0 text-indigo-500 dark:text-sky-400" />
                                  <span className="truncate">{src.title}</span>
                                  <ExternalLink className="w-3 h-3 shrink-0 opacity-60" />
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {msg.content && !isStreaming && (
                        <div className="flex flex-wrap items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                          <button
                            type="button"
                            onClick={() => handleCopyMessage(msg.id, msg.content)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                          >
                            {copiedId === msg.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                            <span>{copiedId === msg.id ? 'Copied' : 'Copy'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleReadAloud(msg)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                          >
                            {speakingId === msg.id ? (
                              <VolumeX className="w-3.5 h-3.5 text-indigo-500" />
                            ) : (
                              <Volume2 className="w-3.5 h-3.5" />
                            )}
                            <span>{speakingId === msg.id ? 'Stop Audio' : 'Read Aloud'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleRegenerate(idx)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Regenerate</span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              void saveToLibrary({
                                type: 'answer',
                                title:
                                  messages[idx - 1]?.content.slice(0, 70) ||
                                  msg.content.slice(0, 60),
                                content: msg.content,
                              })
                            }
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                          >
                            <BookmarkPlus className="w-3.5 h-3.5" />
                            <span>Save Answer</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleOpenAsDocument(msg)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>Create Document</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Bottom Composer */}
      <div className="px-4 sm:px-6 pb-4 pt-2 bg-slate-50 dark:bg-slate-950 shrink-0">
        <div className="max-w-3xl mx-auto">
          {isStreaming && (
            <div className="flex justify-center mb-2">
              <button
                type="button"
                onClick={handleStopGenerating}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 shadow-xs cursor-pointer"
              >
                <Square className="w-3 h-3 fill-current" />
                <span>Stop Generating</span>
              </button>
            </div>
          )}

          <div
            className={`rounded-2xl bg-white dark:bg-slate-900 border shadow-sm p-3 transition-colors ${
              imageMode
                ? 'border-indigo-500 dark:border-sky-500 ring-2 ring-indigo-500/15'
                : 'border-slate-200 dark:border-slate-800 focus-within:border-indigo-500 dark:focus-within:border-sky-500'
            }`}
          >
            {imageMode && (
              <div className="space-y-2 mb-2.5 pb-2.5 border-b border-slate-100 dark:border-slate-800">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-sky-400">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Image Mode</span>
                    </span>

                    <ImageSizePicker
                      sizePreset={imageSizePreset}
                      customWidth={customWidth}
                      customHeight={customHeight}
                      onChangeSizePreset={setImageSizePreset}
                      onChangeCustomDimensions={(w, h) => {
                        setCustomWidth(w);
                        setCustomHeight(h);
                      }}
                      variant="popover"
                      allowExtendedRatios={isPro}
                    />

                    <select
                      value={imageStyle}
                      onChange={(e) => setImageStyle(e.target.value as ImageStyle)}
                      aria-label="Image style"
                      className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 cursor-pointer"
                    >
                      {IMAGE_STYLE_OPTIONS.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          Style: {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[11px] font-mono tabular-nums font-medium ${
                        isImageLimitReached
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {remainingImageCredits}/{subscription.imageDailyLimit} Images Remaining Today
                    </span>
                    <button
                      type="button"
                      onClick={() => setImageMode(false)}
                      title="Exit image generation mode"
                      className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {isImageLimitReached && (
                  <div className="px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-xs text-amber-800 dark:text-amber-200">
                    {limitReachedMessage}
                  </div>
                )}
              </div>
            )}

            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2.5 pb-2.5 border-b border-slate-100 dark:border-slate-800">
                {attachments.map((att) => (
                  <div
                    key={att.id}
                    className="relative flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200"
                  >
                    {att.previewUrl ? (
                      <img
                        src={att.previewUrl}
                        alt={att.name}
                        className="w-8 h-8 rounded object-cover"
                      />
                    ) : (
                      <FileText className="w-4 h-4 text-indigo-500" />
                    )}
                    <span className="truncate max-w-36">{att.name}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setAttachments((prev) => prev.filter((a) => a.id !== att.id))
                      }
                      className="p-0.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <textarea
              ref={composerTextareaRef}
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (imageMode) {
                    void handleInlineGenerateImage();
                  } else {
                    void handleSend();
                  }
                }
              }}
              placeholder={
                imageMode
                  ? 'Describe the image to generate (realistic photo, 3D art, cartoon, anime, logo, poster, wallpaper...)...'
                  : 'Ask anything'
              }
              className="w-full bg-transparent text-sm sm:text-[15px] text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none resize-none max-h-44 custom-scrollbar"
            />

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 mt-1 border-t border-slate-100 dark:border-slate-800/80">
              <div className="flex items-center gap-1.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,.pdf,.txt,.md,.csv,.json,.ts,.tsx,.js,.py,.html,.css"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="Upload images or files for AI analysis"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <Paperclip className="w-4 h-4" />
                  <span className="hidden sm:inline">Attach</span>
                </button>

                <button
                  type="button"
                  onClick={() => setWebSearch((v) => !v)}
                  title="Enable live Google Web Search grounding"
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    webSearch
                      ? 'bg-indigo-50 dark:bg-sky-500/15 text-indigo-700 dark:text-sky-300 border border-indigo-200 dark:border-sky-500/30'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Globe className="w-4 h-4" />
                  <span>Web Search</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setImageMode((v) => !v);
                    setTimeout(() => composerTextareaRef.current?.focus(), 30);
                  }}
                  disabled={isGeneratingInlineImage || isStreaming}
                  title="Open inline AI Image Generator with size selection"
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    imageMode
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {isGeneratingInlineImage ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ImageIcon className="w-4 h-4" />
                  )}
                  <span>Create Image</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleToggleMicInput()}
                  title={isRecordingVoice ? 'Stop voice recording' : 'Voice input'}
                  className={`p-2 rounded-lg transition-colors cursor-pointer ${
                    isRecordingVoice
                      ? 'bg-red-500 text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {isRecordingVoice ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>

                {imageMode ? (
                  <button
                    type="button"
                    onClick={() => void handleInlineGenerateImage()}
                    disabled={!input.trim() || isGeneratingInlineImage || isStreaming || isImageLimitReached}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold transition-colors cursor-pointer"
                  >
                    {isGeneratingInlineImage ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    <span>Generate Image</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleSend()}
                    disabled={(!input.trim() && attachments.length === 0) || isStreaming}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {!user && (
            <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500 px-1">
              <span>Exploring as guest · Sign in to save chats permanently</span>
              <button
                type="button"
                onClick={() => setShowAuthModal(true)}
                className="text-indigo-600 dark:text-sky-400 hover:underline cursor-pointer"
              >
                Sign In
              </button>
            </div>
          )}
        </div>
      </div>

      {lightboxImage && (
        <div
          onClick={() => setLightboxImage(null)}
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-4xl w-full bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3 shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                  {lightboxImage.prompt}
                </p>
                <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                  {lightboxImage.sizeLabel} · {lightboxImage.targetWidth}×{lightboxImage.targetHeight} px
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    void downloadImageInFormat({
                      mediaUrl: lightboxImage.mediaUrl,
                      format: 'png',
                      filenameBase: `mindmaster-${lightboxImage.sizePreset}-${Date.now()}`,
                      targetWidth: lightboxImage.targetWidth,
                      targetHeight: lightboxImage.targetHeight,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>PNG</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void downloadImageInFormat({
                      mediaUrl: lightboxImage.mediaUrl,
                      format: 'jpg',
                      filenameBase: `mindmaster-${lightboxImage.sizePreset}-${Date.now()}`,
                      targetWidth: lightboxImage.targetWidth,
                      targetHeight: lightboxImage.targetHeight,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>JPG</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLightboxImage(null)}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-950 flex items-center justify-center max-h-[75vh]">
              <img
                src={lightboxImage.mediaUrl}
                alt={lightboxImage.prompt}
                className="max-h-[75vh] w-auto object-contain"
              />
            </div>
          </div>
        </div>
      )}

      <VoiceConversationModal
        open={voiceModalOpen}
        onClose={() => setVoiceModalOpen(false)}
        language={language}
        customInstructions={customInstructions}
        existingMessages={messages}
        onAppendExchange={(userText, assistantText) => {
          const chat = ensureActiveChat(false);
          const nextMsgs: ChatMessage[] = [
            ...chat.messages,
            {
              id: `msg_${Date.now()}_vu`,
              role: 'user',
              content: userText,
              timestamp: Date.now(),
            },
            {
              id: `msg_${Date.now()}_va`,
              role: 'assistant',
              content: assistantText,
              timestamp: Date.now(),
            },
          ];
          void saveChat({
            ...chat,
            title: chat.messages.length === 0 ? userText.slice(0, 48) : chat.title,
            messages: nextMsgs,
            updatedAt: Date.now(),
          });
        }}
      />
    </div>
  );
}
