import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy, Download } from 'lucide-react';

interface CodeBlockProps {
  language: string;
  code: string;
}

function CodeBlock({ language, code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownload = () => {
    const extMap: Record<string, string> = {
      typescript: 'ts',
      ts: 'ts',
      tsx: 'tsx',
      javascript: 'js',
      js: 'js',
      jsx: 'jsx',
      python: 'py',
      py: 'py',
      html: 'html',
      css: 'css',
      json: 'json',
      sql: 'sql',
      bash: 'sh',
      sh: 'sh',
      markdown: 'md',
      md: 'md',
    };
    const ext = extMap[language.toLowerCase()] || 'txt';
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `snippet.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 text-slate-100">
      <div className="flex items-center justify-between px-3.5 py-2 bg-slate-800/90 border-b border-slate-700/80 text-xs text-slate-300">
        <span className="font-mono lowercase">{language || 'code'}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Download code snippet"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download</span>
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>
      <pre className="p-4 overflow-x-auto text-xs sm:text-sm leading-relaxed font-mono custom-scrollbar">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function MarkdownRenderer({ content }: { content: string }) {
  return (
    <div className="prose-container text-[15px] leading-relaxed text-slate-800 dark:text-slate-100 break-words space-y-3">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white mt-4 mb-2">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white mt-4 mb-2">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-semibold text-slate-900 dark:text-white mt-3 mb-1.5">
              {children}
            </h3>
          ),
          p: ({ children }) => <p className="leading-7">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-5 space-y-1.5 my-2">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1.5 my-2">{children}</ol>,
          li: ({ children }) => <li className="leading-6">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="my-3 px-4 py-2.5 rounded-lg bg-slate-100 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 italic">
              {children}
            </blockquote>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 dark:text-sky-400 underline underline-offset-2 hover:text-indigo-500 dark:hover:text-sky-300"
            >
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-sm border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-slate-100 dark:bg-slate-800/90 text-slate-900 dark:text-slate-100 font-semibold">
              {children}
            </thead>
          ),
          th: ({ children }) => (
            <th className="px-3.5 py-2.5 border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3.5 py-2.5 border-b border-slate-200/70 dark:border-slate-800/70 align-top">
              {children}
            </td>
          ),
          hr: () => <hr className="my-4 border-slate-200 dark:border-slate-800" />,
          code: ({ className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className || '');
            const rawText = String(children).replace(/\n$/, '');
            const isBlock = Boolean(match) || rawText.includes('\n');
            if (isBlock) {
              return <CodeBlock language={match?.[1] || 'text'} code={rawText} />;
            }
            return (
              <code
                className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-indigo-700 dark:text-sky-300 font-mono text-[13px]"
                {...props}
              >
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
