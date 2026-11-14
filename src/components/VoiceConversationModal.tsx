import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, MicOff, Volume2, X } from 'lucide-react';
import { api } from '../services/api';
import type { ChatMessage, CustomInstructions, LanguagePreference } from '../types/app';

interface VoiceConversationModalProps {
  open: boolean;
  onClose: () => void;
  language: LanguagePreference;
  customInstructions: CustomInstructions;
  existingMessages: ChatMessage[];
  onAppendExchange: (userText: string, assistantText: string) => void;
}

type VoicePhase = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking';

export function VoiceConversationModal({
  open,
  onClose,
  language,
  customInstructions,
  existingMessages,
  onAppendExchange,
}: VoiceConversationModalProps) {
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [transcript, setTranscript] = useState('');
  const [replyText, setReplyText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const closedRef = useRef(false);

  const stopAllAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
  };

  useEffect(() => {
    closedRef.current = !open;
    if (!open) {
      stopAllAudio();
      setPhase('idle');
      setTranscript('');
      setReplyText('');
      setError(null);
    }
    return () => {
      stopAllAudio();
    };
  }, [open]);

  if (!open) return null;

  const speakResponse = async (text: string) => {
    if (closedRef.current) return;
    setPhase('speaking');
    try {
      const tts = await api.generateSpeech(text);
      if (closedRef.current) return;
      const audio = new Audio(`data:${tts.mimeType};base64,${tts.audioBase64}`);
      audioRef.current = audio;
      audio.onended = () => {
        if (!closedRef.current) setPhase('idle');
      };
      audio.onerror = () => {
        if (!closedRef.current) setPhase('idle');
      };
      await audio.play();
    } catch {
      // Fallback to browser Web Speech API
      if (typeof window !== 'undefined' && 'speechSynthesis' in window && !closedRef.current) {
        const utter = new SpeechSynthesisUtterance(text.replace(/[#*_`]/g, ''));
        utter.onend = () => {
          if (!closedRef.current) setPhase('idle');
        };
        window.speechSynthesis.speak(utter);
      } else {
        setPhase('idle');
      }
    }
  };

  const sendSpokenPrompt = async (spokenText: string) => {
    if (!spokenText.trim() || closedRef.current) {
      setPhase('idle');
      return;
    }
    setPhase('thinking');
    setReplyText('');
    setError(null);

    const userMsg: ChatMessage = {
      id: `v_u_${Date.now()}`,
      role: 'user',
      content: spokenText.trim(),
      timestamp: Date.now(),
    };

    let accumulated = '';
    try {
      await api.streamChat({
        messages: [...existingMessages, userMsg],
        language,
        customInstructions,
        onDelta: (chunk) => {
          accumulated += chunk;
          setReplyText(accumulated);
        },
      });
      if (!closedRef.current && accumulated.trim()) {
        onAppendExchange(spokenText.trim(), accumulated.trim());
        await speakResponse(accumulated.trim());
      } else {
        setPhase('idle');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Voice response failed.');
      setPhase('idle');
    }
  };

  const startListening = async () => {
    stopAllAudio();
    setError(null);
    setTranscript('');

    // Prefer MediaRecorder + Gemini 3.5 Transcribe so Manglish, Malayalam, Arabic, Hindi, etc. work reliably
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        chunksRef.current = [];
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        recorder.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          if (closedRef.current || chunksRef.current.length === 0) return;

          setPhase('transcribing');
          try {
            const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
            const reader = new FileReader();
            const base64 = await new Promise<string>((resolve, reject) => {
              reader.onload = () => {
                const res = String(reader.result || '');
                resolve(res.split(',')[1] || '');
              };
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
            const tr = await api.transcribeAudio(base64, blob.type || 'audio/webm');
            if (closedRef.current) return;
            setTranscript(tr.text);
            await sendSpokenPrompt(tr.text);
          } catch {
            setError('Could not transcribe audio. Please try speaking again.');
            setPhase('idle');
          }
        };

        recorder.start();
        setPhase('listening');
        return;
      } catch {
        // Fallback to Web Speech API
      }
    }

    const SpeechRecognitionCtor =
      (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      setError('Microphone recording is not supported in this browser.');
      return;
    }

    const recognition = new (SpeechRecognitionCtor as new () => {
      lang: string;
      interimResults: boolean;
      onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
      onerror: () => void;
      onend: () => void;
      start: () => void;
      stop: () => void;
    })();
    recognition.lang = language === 'ml' ? 'ml-IN' : 'en-US';
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const text = event.results?.[0]?.[0]?.transcript || '';
      setTranscript(text);
      void sendSpokenPrompt(text);
    };
    recognition.onerror = () => {
      setError('Microphone permission or speech recognition failed.');
      setPhase('idle');
    };
    recognition.start();
    recognitionRef.current = recognition;
    setPhase('listening');
  };

  const stopListening = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 text-center animate-fadeIn">
        <div className="flex items-center justify-between mb-6">
          <span className="text-sm font-semibold text-slate-900 dark:text-white">
            Voice Conversation
          </span>
          <button
            type="button"
            onClick={() => {
              stopAllAudio();
              onClose();
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="my-6 flex flex-col items-center">
          <button
            type="button"
            onClick={phase === 'listening' ? stopListening : startListening}
            disabled={phase === 'transcribing' || phase === 'thinking'}
            className={`w-24 h-24 rounded-full flex items-center justify-center transition-transform cursor-pointer ${
              phase === 'listening'
                ? 'bg-red-500 text-white scale-105 shadow-lg shadow-red-500/30'
                : phase === 'speaking'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white'
            }`}
          >
            {phase === 'listening' ? (
              <MicOff className="w-9 h-9" />
            ) : phase === 'transcribing' || phase === 'thinking' ? (
              <Loader2 className="w-9 h-9 animate-spin" />
            ) : phase === 'speaking' ? (
              <Volume2 className="w-9 h-9" />
            ) : (
              <Mic className="w-9 h-9" />
            )}
          </button>

          <p className="mt-4 text-sm font-medium text-slate-800 dark:text-slate-200">
            {phase === 'idle' && 'Tap the microphone to speak in any language'}
            {phase === 'listening' && 'Listening... Tap again when finished speaking'}
            {phase === 'transcribing' && 'Transcribing your voice...'}
            {phase === 'thinking' && 'MindMaster AI is thinking...'}
            {phase === 'speaking' && 'Speaking reply... Tap mic to interrupt'}
          </p>
        </div>

        {transcript && (
          <div className="mb-3 p-3 rounded-xl bg-slate-100 dark:bg-slate-800/80 text-left text-xs text-slate-700 dark:text-slate-200">
            <span className="font-semibold text-slate-500 dark:text-slate-400 block mb-1">You:</span>
            {transcript}
          </div>
        )}

        {replyText && (
          <div className="mb-3 p-3 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200/70 dark:border-indigo-500/20 text-left text-xs text-slate-800 dark:text-slate-100 max-h-40 overflow-y-auto custom-scrollbar">
            <span className="font-semibold text-indigo-600 dark:text-sky-400 block mb-1">
              MindMaster AI:
            </span>
            {replyText}
          </div>
        )}

        {error && (
          <p className="text-xs text-red-600 dark:text-red-400 mb-3">{error}</p>
        )}

        <button
          type="button"
          onClick={() => {
            stopAllAudio();
            onClose();
          }}
          className="mt-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
        >
          End Voice Mode
        </button>
      </div>
    </div>
  );
}
