import React, { useRef, useState } from 'react';
import {
  Check,
  Download,
  Edit3,
  Eye,
  FileText,
  Film,
  Folder,
  FolderPlus,
  Image as ImageIcon,
  Layers,
  MessageSquare,
  PenTool,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { MarkdownRenderer } from './MarkdownRenderer';
import type { LibraryItem, LibraryItemType } from '../types/app';

const TYPE_FILTERS: Array<{ id: 'all' | LibraryItemType; label: string }> = [
  { id: 'all', label: 'All Items' },
  { id: 'image', label: 'Images' },
  { id: 'video', label: 'Videos' },
  { id: 'answer', label: 'Saved Answers' },
  { id: 'document', label: 'Documents & Files' },
  { id: 'project', label: 'Projects' },
  { id: 'design', label: 'Designs' },
];

export function LibraryView() {
  const {
    folders,
    libraryItems,
    createFolder,
    renameFolder,
    deleteFolder,
    updateLibraryItem,
    deleteLibraryItem,
    uploadFileToLibrary,
    continueEditingLibraryItem,
    notify,
  } = useApp();

  const [activeType, setActiveType] = useState<'all' | LibraryItemType>('all');
  const [activeFolderId, setActiveFolderId] = useState<string | 'all' | 'unfiled'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [folderEditName, setFolderEditName] = useState('');

  const [renamingItemId, setRenamingItemId] = useState<string | null>(null);
  const [itemEditTitle, setItemEditTitle] = useState('');
  const [previewItem, setPreviewItem] = useState<LibraryItem | null>(null);

  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const filteredItems = libraryItems.filter((item) => {
    if (activeType !== 'all' && item.type !== activeType) return false;
    if (activeFolderId === 'unfiled' && item.folderId !== null) return false;
    if (activeFolderId !== 'all' && activeFolderId !== 'unfiled' && item.folderId !== activeFolderId) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        item.title.toLowerCase().includes(q) ||
        (item.content || '').toLowerCase().includes(q) ||
        (item.prompt || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    await createFolder(newFolderName.trim());
    setNewFolderName('');
    setShowNewFolder(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    const isText =
      file.type.startsWith('text/') ||
      /\.(md|txt|csv|json|ts|tsx|js|py|html|css)$/i.test(file.name);

    const targetFolder =
      activeFolderId !== 'all' && activeFolderId !== 'unfiled' ? activeFolderId : null;

    if (isText) {
      const textContent = await file.text();
      await uploadFileToLibrary({
        title: file.name,
        type: 'document',
        folderId: targetFolder,
        mimeType: file.type || 'text/plain',
        textContent,
      });
    } else {
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.readAsDataURL(file);
      });
      await uploadFileToLibrary({
        title: file.name,
        type: isImage ? 'image' : isVideo ? 'video' : 'document',
        folderId: targetFolder,
        mimeType: file.type || 'application/octet-stream',
        base64: dataUrl.split(',')[1] || '',
      });
    }

    if (uploadInputRef.current) uploadInputRef.current.value = '';
  };

  const handleDownloadItem = (item: LibraryItem) => {
    if (item.mediaUrl) {
      const a = document.createElement('a');
      a.href = item.mediaUrl;
      a.download = item.title;
      a.click();
      return;
    }
    if (item.content) {
      const blob = new Blob([item.content], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${item.title.replace(/[^a-zA-Z0-9_-]+/g, '_')}.md`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    notify('No downloadable file content found for this item.', 'info');
  };

  const getTypeIcon = (type: LibraryItemType) => {
    switch (type) {
      case 'image':
        return <ImageIcon className="w-4 h-4 text-sky-500" />;
      case 'video':
        return <Film className="w-4 h-4 text-amber-500" />;
      case 'answer':
        return <MessageSquare className="w-4 h-4 text-indigo-500" />;
      case 'design':
        return <Layers className="w-4 h-4 text-rose-500" />;
      case 'project':
        return <PenTool className="w-4 h-4 text-emerald-500" />;
      default:
        return <FileText className="w-4 h-4 text-slate-500" />;
    }
  };

  return (
    <div className="h-full overflow-y-auto px-4 sm:px-8 py-6 custom-scrollbar">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              My Library
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Your persistent collection of generated images, videos, saved answers, documents, projects, and designs.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              ref={uploadInputRef}
              type="file"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => uploadInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>Upload File</span>
            </button>

            <button
              type="button"
              onClick={() => setShowNewFolder((v) => !v)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer"
            >
              <FolderPlus className="w-4 h-4" />
              <span>New Folder</span>
            </button>
          </div>
        </div>

        {showNewFolder && (
          <form onSubmit={handleCreateFolder} className="flex items-center gap-2 max-w-md">
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name..."
              autoFocus
              className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold cursor-pointer"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => setShowNewFolder(false)}
              className="p-2 rounded-xl text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* Folders Strip */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveFolderId('all')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
              activeFolderId === 'all'
                ? 'bg-indigo-600 border-indigo-600 text-white'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            <Folder className="w-3.5 h-3.5" />
            <span>All Folders</span>
            <span className="font-mono tabular-nums opacity-75">({libraryItems.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveFolderId('unfiled')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
              activeFolderId === 'unfiled'
                ? 'bg-indigo-600 border-indigo-600 text-white'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            <span>Unfiled</span>
            <span className="font-mono tabular-nums opacity-75">
              ({libraryItems.filter((i) => !i.folderId).length})
            </span>
          </button>

          {folders.map((folder) => {
            const count = libraryItems.filter((i) => i.folderId === folder.id).length;
            const isSelected = activeFolderId === folder.id;
            const isRenaming = renamingFolderId === folder.id;

            return (
              <div
                key={folder.id}
                className={`group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  isSelected
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                {isRenaming ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={folderEditName}
                      onChange={(e) => setFolderEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          void renameFolder(folder.id, folderEditName);
                          setRenamingFolderId(null);
                        }
                      }}
                      autoFocus
                      className="w-24 px-1.5 py-0.5 rounded bg-white text-slate-900 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        void renameFolder(folder.id, folderEditName);
                        setRenamingFolderId(null);
                      }}
                      className="cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setActiveFolderId(folder.id)}
                      className="inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Folder className="w-3.5 h-3.5" />
                      <span>{folder.name}</span>
                      <span className="font-mono tabular-nums opacity-75">({count})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRenamingFolderId(folder.id);
                        setFolderEditName(folder.name);
                      }}
                      title="Rename folder"
                      className="opacity-60 hover:opacity-100 ml-1 cursor-pointer"
                    >
                      <Edit3 className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (activeFolderId === folder.id) setActiveFolderId('all');
                        void deleteFolder(folder.id);
                      }}
                      title="Delete folder"
                      className="opacity-60 hover:opacity-100 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Filter Tabs + Search */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-x-auto">
            {TYPE_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setActiveType(f.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  activeType === f.id
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search library..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
          </div>
        </div>

        {/* Library Grid */}
        {filteredItems.length === 0 ? (
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 py-16 px-4 text-center">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              No saved items match this view yet.
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Save answers from AI Chat, generate images or videos, create documents, or upload files to organize them here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredItems.map((item) => {
              const isRenaming = renamingItemId === item.id;
              return (
                <div
                  key={item.id}
                  className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col justify-between"
                >
                  {/* Media or Text Preview */}
                  <div>
                    {item.type === 'video' && item.mediaUrl ? (
                      <div className="aspect-video bg-black">
                        <video src={item.mediaUrl} controls className="w-full h-full object-cover" />
                      </div>
                    ) : (item.type === 'image' || item.type === 'design') && item.mediaUrl ? (
                      <button
                        type="button"
                        onClick={() => setPreviewItem(item)}
                        className="w-full aspect-4/3 bg-slate-100 dark:bg-slate-950 overflow-hidden block cursor-pointer"
                      >
                        <img
                          src={item.mediaUrl}
                          alt={item.title}
                          className="w-full h-full object-cover hover:scale-103 transition-transform"
                        />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPreviewItem(item)}
                        className="w-full h-36 p-4 bg-slate-50 dark:bg-slate-950/60 border-b border-slate-100 dark:border-slate-800 text-left overflow-hidden cursor-pointer"
                      >
                        <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-5 whitespace-pre-wrap">
                          {item.content || item.prompt || 'File item'}
                        </p>
                      </button>
                    )}

                    <div className="p-4 space-y-2">
                      {isRenaming ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={itemEditTitle}
                            onChange={(e) => setItemEditTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                void updateLibraryItem(item.id, { title: itemEditTitle });
                                setRenamingItemId(null);
                              }
                            }}
                            autoFocus
                            className="flex-1 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-950 border border-indigo-500 text-xs text-slate-900 dark:text-white"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              void updateLibraryItem(item.id, { title: itemEditTitle });
                              setRenamingItemId(null);
                            }}
                            className="p-1 text-emerald-500 cursor-pointer"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {getTypeIcon(item.type)}
                            <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                              {item.title}
                            </h3>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                        <span className="capitalize">
                          {item.type} · {new Date(item.updatedAt).toLocaleDateString()}
                        </span>

                        {folders.length > 0 && (
                          <select
                            value={item.folderId || ''}
                            onChange={(e) =>
                              void updateLibraryItem(item.id, {
                                folderId: e.target.value || null,
                              })
                            }
                            aria-label="Move to folder"
                            className="bg-transparent border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5 text-[11px] text-slate-600 dark:text-slate-300"
                          >
                            <option value="">Unfiled</option>
                            {folders.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.name}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card Action Bar */}
                  <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-950/50 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-1 text-xs">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setPreviewItem(item)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
                        title="Open item"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Open</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => continueEditingLibraryItem(item)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-indigo-100 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-sky-400 font-medium cursor-pointer"
                        title="Continue editing in studio"
                      >
                        <PenTool className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleDownloadItem(item)}
                        className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-pointer"
                        title="Download"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRenamingItemId(item.id);
                          setItemEditTitle(item.title);
                        }}
                        className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-pointer"
                        title="Rename"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteLibraryItem(item.id)}
                        className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-500/20 text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 cursor-pointer"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Preview / Open Item Modal */}
      {previewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="w-full max-w-3xl max-h-[88vh] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden animate-fadeIn">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2 min-w-0">
                {getTypeIcon(previewItem.type)}
                <h2 className="text-base font-bold text-slate-900 dark:text-white truncate">
                  {previewItem.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setPreviewItem(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
              {previewItem.type === 'video' && previewItem.mediaUrl ? (
                <video
                  src={previewItem.mediaUrl}
                  controls
                  autoPlay
                  className="w-full rounded-xl bg-black max-h-[60vh]"
                />
              ) : (previewItem.type === 'image' || previewItem.type === 'design') &&
                previewItem.mediaUrl ? (
                <div className="space-y-3 text-center">
                  <img
                    src={previewItem.mediaUrl}
                    alt={previewItem.title}
                    className="max-h-[60vh] mx-auto rounded-xl"
                  />
                  {previewItem.prompt && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Prompt: {previewItem.prompt}
                    </p>
                  )}
                </div>
              ) : previewItem.content ? (
                <MarkdownRenderer content={previewItem.content} />
              ) : (
                <p className="text-sm text-slate-500">
                  File stored at {previewItem.mediaUrl || 'library'}. Use Download to save locally.
                </p>
              )}
            </div>

            <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => handleDownloadItem(previewItem)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = previewItem;
                  setPreviewItem(null);
                  continueEditingLibraryItem(target);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer"
              >
                <PenTool className="w-3.5 h-3.5" />
                <span>Continue Editing</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
