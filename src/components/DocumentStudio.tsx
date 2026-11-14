import React, { useEffect, useState } from 'react';
import {
  BookmarkPlus,
  Download,
  FileText,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { MarkdownRenderer } from './MarkdownRenderer';
import { isManglishOrMalayalam } from '../utils/language';
import type { LibraryItemType } from '../types/app';

export function DocumentStudio() {
  const {
    activeDocument,
    setActiveDocument,
    saveToLibrary,
    updateLibraryItem,
    language,
    customInstructions,
    notify,
  } = useApp();

  const [title, setTitle] = useState('Untitled Document');
  const [content, setContent] = useState('');
  const [docType, setDocType] = useState<LibraryItemType>('document');
  const [aiPrompt, setAiPrompt] = useState('');
  const [isDrafting, setIsDrafting] = useState(false);
  const [viewMode, setViewMode] = useState<'split' | 'edit' | 'preview'>('split');

  useEffect(() => {
    if (activeDocument) {
      setTitle(activeDocument.title);
      setContent(activeDocument.content || '');
      setDocType(activeDocument.type === 'project' ? 'project' : 'document');
    }
  }, [activeDocument]);

  const handleAiDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiPrompt.trim() || isDrafting) return;

    setIsDrafting(true);
    let draft = '';
    const rawUserPrompt = aiPrompt.trim();
    const isMlRequest = isManglishOrMalayalam(rawUserPrompt);
    const promptText = content.trim()
      ? `${isMlRequest ? 'നിർദ്ദേശം (Instruction — reply completely in proper Malayalam script മലയാളം):' : 'Instruction:'} ${rawUserPrompt}\n\nCurrent document titled "${title}":\n\n${content}\n\nReturn the complete updated Markdown document.`
      : isMlRequest
      ? `ഈ വിഷയത്തിൽ പൂർണ്ണമായ മലയാളം ലിപിയിൽ (Malayalam script) ഒരു നല്ല Markdown രേഖ തയ്യാറാക്കുക: ${rawUserPrompt}`
      : `Create a well-structured, comprehensive Markdown document for: ${rawUserPrompt}`;

    try {
      await api.streamChat({
        messages: [
          {
            id: `doc_${Date.now()}`,
            role: 'user',
            content: promptText,
            timestamp: Date.now(),
          },
        ],
        language: isMlRequest && language === 'auto' ? 'ml' : language,
        customInstructions,
        onDelta: (chunk) => {
          draft += chunk;
          setContent(draft);
        },
      });
      if (!activeDocument && title === 'Untitled Document') {
        setTitle(aiPrompt.trim().slice(0, 60));
      }
      setAiPrompt('');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to draft document.', 'error');
    } finally {
      setIsDrafting(false);
    }
  };

  const handleSave = async () => {
    if (activeDocument) {
      await updateLibraryItem(activeDocument.id, { title, content });
      notify('Document updated in My Library.', 'success');
    } else {
      const created = await saveToLibrary({
        type: docType,
        title: title.trim() || 'Untitled Document',
        content,
      });
      if (created) setActiveDocument(created);
    }
  };

  const handleDownload = (format: 'md' | 'txt' | 'doc') => {
    const safeName = (title || 'document').replace(/[^a-zA-Z0-9_-]+/g, '_');
    let blob: Blob;
    if (format === 'doc') {
      const html = `<html><head><meta charset="utf-8"><title>${title}</title></head><body><pre style="font-family:sans-serif;white-space:pre-wrap;">${content.replace(
        /</g,
        '&lt;'
      )}</pre></body></html>`;
      blob = new Blob([html], { type: 'application/msword' });
    } else {
      blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full min-h-0 px-4 sm:px-6 py-4 gap-4">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 flex-1 min-w-[220px]">
          <FileText className="w-5 h-5 text-indigo-600 dark:text-sky-400 shrink-0" />
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="flex-1 max-w-md px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            placeholder="Document title..."
          />
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value as LibraryItemType)}
            className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300"
          >
            <option value="document">Document</option>
            <option value="project">Project</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex p-0.5 rounded-lg bg-slate-200/70 dark:bg-slate-800 text-xs">
            {(['split', 'edit', 'preview'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setViewMode(m)}
                className={`px-2.5 py-1 rounded-md capitalize cursor-pointer ${
                  viewMode === m
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-medium'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              setActiveDocument(null);
              setTitle('Untitled Document');
              setContent('');
            }}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            New Doc
          </button>

          <button
            type="button"
            onClick={() => void handleSave()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer"
          >
            <BookmarkPlus className="w-3.5 h-3.5" />
            <span>{activeDocument ? 'Update Library' : 'Save to Library'}</span>
          </button>

          <div className="flex items-center gap-1">
            {(['md', 'txt', 'doc'] as const).map((ext) => (
              <button
                key={ext}
                type="button"
                onClick={() => handleDownload(ext)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                title={`Download as .${ext}`}
              >
                <Download className="w-3 h-3" />
                <span>.{ext}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* AI Draft Bar */}
      <form onSubmit={handleAiDraft} className="flex gap-2 shrink-0">
        <input
          type="text"
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
          placeholder={
            content.trim()
              ? 'Ask AI to expand, summarize, translate, or rewrite this document...'
              : 'Describe a document or project to draft with AI (e.g., "Project proposal for an e-commerce app in Malayalam")...'
          }
          className="flex-1 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
        />
        <button
          type="submit"
          disabled={!aiPrompt.trim() || isDrafting}
          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
        >
          {isDrafting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          <span>{content.trim() ? 'AI Refine' : 'AI Draft'}</span>
        </button>
      </form>

      {/* Editor & Live Preview */}
      <div
        className={`flex-1 min-h-0 grid gap-4 ${
          viewMode === 'split' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'
        }`}
      >
        {(viewMode === 'split' || viewMode === 'edit') && (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write or generate your Markdown document here..."
            className="w-full h-full p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm font-mono leading-relaxed text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 resize-none custom-scrollbar"
          />
        )}

        {(viewMode === 'split' || viewMode === 'preview') && (
          <div className="h-full overflow-y-auto p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 custom-scrollbar">
            {content.trim() ? (
              <MarkdownRenderer content={content} />
            ) : (
              <p className="text-sm text-slate-400 dark:text-slate-500">
                Document preview will appear here...
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
