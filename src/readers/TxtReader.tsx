import { useEffect, useRef, useState } from 'react';
import type { BookRecord, BookProgress, ReaderSettings } from '../../electron/shared-types';
import { ReaderNotes } from './ReaderNotes';

interface Props {
  book: BookRecord;
  settings: ReaderSettings;
  onProgress: (bookId: string, progress: BookProgress) => void;
  onReady: () => void;
  keyboardEnabled?: boolean;
}

export function TxtReader({ book, settings, onProgress, onReady, keyboardEnabled = true }: Props) {
  const [text, setText] = useState('');
  const [encoding, setEncoding] = useState('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [scrollRatio, setScrollRatio] = useState(book.progress.kind === 'txt' ? book.progress.scrollRatio : 0);
  const [bookmarkId, setBookmarkId] = useState<string | null>(null);
  const [selectedQuote, setSelectedQuote] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let active = true;
    window.bookApi.readText(book.id)
      .then((response) => {
        if (!active) return;
        if (response.ok) {
          setText(response.data.text);
          setEncoding(response.data.encoding);
        } else {
          setError(response.error);
        }
        onReady();
      })
      .catch((reason) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : `读取 ${book.format.toUpperCase()} 文件失败`);
        onReady();
      });
    return () => { active = false; };
  }, [book.id, onReady]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !text) return;
    requestAnimationFrame(() => {
      const maxScroll = container.scrollHeight - container.clientHeight;
      container.scrollTop = maxScroll * (book.progress.kind === 'txt' ? book.progress.scrollRatio : 0);
    });
  }, [book.id, text]);

  useEffect(() => {
    window.bookApi.listBookmarks(book.id).then((response) => {
      if (response.ok) {
        const bookmark = response.data.find((item) => Math.abs(item.location - scrollRatio) < 0.02);
        setBookmarkId(bookmark?.id ?? null);
      }
    });
  }, [book.id, scrollRatio]);

  const handleScroll = () => {
    const container = scrollRef.current;
    if (!container) return;
    const maxScroll = container.scrollHeight - container.clientHeight;
    const ratio = maxScroll > 0 ? container.scrollTop / maxScroll : 0;
    setScrollRatio(ratio);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => onProgress(book.id, { kind: 'txt', scrollRatio: ratio }), 350);
  };

  const captureSelection = () => {
    const selection = window.getSelection()?.toString().trim() ?? '';
    if (selection) setSelectedQuote(selection.slice(0, 1000));
  };

  const toggleBookmark = async () => {
    if (bookmarkId) {
      const response = await window.bookApi.removeBookmark(bookmarkId);
      if (response.ok) setBookmarkId(null);
      return;
    }
    const response = await window.bookApi.saveBookmark({ bookId: book.id, label: `阅读进度 ${Math.round(scrollRatio * 100)}%`, location: scrollRatio });
    if (response.ok) setBookmarkId(response.data.id);
  };

  useEffect(() => {
    if (!keyboardEnabled) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditing = target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '');
      if (isEditing || event.key.toLowerCase() !== 'b') return;
      event.preventDefault();
      void toggleBookmark();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [bookmarkId, keyboardEnabled, scrollRatio]);

  if (error) return <div className="reader-error">{error}</div>;

  return (
    <section className="txt-reader">
      <div className="reader-subbar"><span>{book.format === 'docx' ? 'Word 文档 · 只读' : `纯文本 · ${encoding}`}</span><div className="reader-subbar-actions"><button type="button" className={bookmarkId ? 'bookmark-active subbar-button' : 'subbar-button'} onClick={toggleBookmark}>{bookmarkId ? '已书签' : '添加书签'}</button></div></div>
      <div className="txt-scroll" ref={scrollRef} onScroll={handleScroll} onMouseUp={captureSelection}>
        <article className="txt-content" style={{ fontSize: `${settings.fontSize}px`, lineHeight: settings.lineHeight }}>
          {query ? highlightText(text, query) : text}
        </article>
      </div>
      <label className="reader-search">
        <span>搜索</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索当前文本" />
      </label>
      <ReaderNotes book={book} location={scrollRatio} locationLabel={`阅读进度 ${Math.round(scrollRatio * 100)}%`} quote={selectedQuote} />
    </section>
  );
}

function highlightText(text: string, query: string) {
  const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, 'gi'));
  return parts.map((part, index) => part.toLowerCase() === query.toLowerCase()
    ? <mark key={index}>{part}</mark>
    : <span key={index}>{part}</span>);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
