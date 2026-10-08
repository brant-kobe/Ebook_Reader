import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { BookRecord, EpubBookContent, BookProgress, ReaderSettings } from '../../electron/shared-types';
import { ReaderNotes } from './ReaderNotes';

interface Props {
  book: BookRecord;
  settings: ReaderSettings;
  onProgress: (bookId: string, progress: BookProgress) => void;
  onReady: () => void;
  keyboardEnabled?: boolean;
}

const allowedElements: Record<string, string> = {
  article: 'article',
  blockquote: 'blockquote',
  br: 'br',
  caption: 'caption',
  code: 'code',
  dd: 'dd',
  div: 'div',
  dl: 'dl',
  dt: 'dt',
  em: 'em',
  figcaption: 'figcaption',
  figure: 'figure',
  h1: 'h1',
  h2: 'h2',
  h3: 'h3',
  h4: 'h4',
  h5: 'h5',
  h6: 'h6',
  hr: 'hr',
  i: 'i',
  li: 'li',
  ol: 'ol',
  p: 'p',
  pre: 'pre',
  section: 'section',
  small: 'small',
  span: 'span',
  strong: 'strong',
  sub: 'sub',
  sup: 'sup',
  table: 'table',
  tbody: 'tbody',
  td: 'td',
  th: 'th',
  thead: 'thead',
  tr: 'tr',
  u: 'u',
  ul: 'ul',
};

const blockedElements = new Set(['audio', 'embed', 'iframe', 'link', 'meta', 'object', 'script', 'source', 'style', 'svg', 'video']);

export function EpubReader({ book, settings, onProgress, onReady, keyboardEnabled = true }: Props) {
  const [content, setContent] = useState<EpubBookContent | null>(null);
  const [chapterHref, setChapterHref] = useState('');
  const [scrollRatio, setScrollRatio] = useState(book.progress.kind === 'epub' ? book.progress.scrollRatio : 0);
  const [bookmarkId, setBookmarkId] = useState<string | null>(null);
  const [selectedQuote, setSelectedQuote] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let active = true;
    window.bookApi.readEpub(book.id)
      .then((response) => {
        if (!active) return;
        if (response.ok) {
          setContent(response.data);
          const savedHref = book.progress.kind === 'epub' ? book.progress.chapterHref : '';
          setChapterHref(response.data.chapters.some((chapter) => chapter.href === savedHref)
            ? savedHref
            : response.data.chapters[0]?.href ?? '');
        } else {
          setError(response.error);
        }
        onReady();
      })
      .catch((reason) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : '读取 EPUB 文件失败');
        onReady();
      });
    return () => {
      active = false;
      clearTimeout(saveTimer.current);
    };
  }, [book.id, onReady]);

  const chapter = useMemo(
    () => content?.chapters.find((item) => item.href === chapterHref) ?? null,
    [chapterHref, content],
  );
  const chapterIndex = content?.chapters.findIndex((item) => item.href === chapterHref) ?? -1;

  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !chapter) return;
    const progress = book.progress;
    const savedRatio = progress.kind === 'epub' && progress.chapterHref === chapter.href
      ? progress.scrollRatio
      : 0;
    setScrollRatio(savedRatio);
    const frame = requestAnimationFrame(() => {
      const maxScroll = container.scrollHeight - container.clientHeight;
      container.scrollTop = maxScroll * savedRatio;
    });
    return () => cancelAnimationFrame(frame);
  }, [book.id, chapter, book.progress.kind, book.progress.kind === 'epub' ? book.progress.chapterHref : '', book.progress.kind === 'epub' ? book.progress.scrollRatio : 0]);

  useEffect(() => {
    if (chapterIndex < 0) return;
    const location = chapterIndex + scrollRatio;
    window.bookApi.listBookmarks(book.id).then((response) => {
      if (response.ok) {
        const bookmark = response.data.find((item) => Math.abs(item.location - location) < 0.02);
        setBookmarkId(bookmark?.id ?? null);
      }
    });
  }, [book.id, chapterIndex, scrollRatio]);

  const handleScroll = () => {
    const container = scrollRef.current;
    if (!container || !chapter) return;
    const maxScroll = container.scrollHeight - container.clientHeight;
    const ratio = maxScroll > 0 ? container.scrollTop / maxScroll : 0;
    setScrollRatio(ratio);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      onProgress(book.id, { kind: 'epub', chapterHref: chapter.href, scrollRatio: ratio });
    }, 350);
  };

  const selectChapter = (href: string) => {
    const next = content?.chapters.find((item) => item.href === href);
    if (!next) return;
    setChapterHref(href);
    setScrollRatio(0);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    onProgress(book.id, { kind: 'epub', chapterHref: href, scrollRatio: 0 });
  };

  const captureSelection = () => {
    const selection = window.getSelection()?.toString().trim() ?? '';
    if (selection) setSelectedQuote(selection.slice(0, 1000));
  };

  const toggleBookmark = useCallback(async () => {
    if (!chapter || chapterIndex < 0) return;
    if (bookmarkId) {
      const response = await window.bookApi.removeBookmark(bookmarkId);
      if (response.ok) setBookmarkId(null);
      return;
    }
    const location = chapterIndex + scrollRatio;
    const response = await window.bookApi.saveBookmark({
      bookId: book.id,
      label: `${chapter.title} · ${Math.round(scrollRatio * 100)}%`,
      location,
    });
    if (response.ok) setBookmarkId(response.data.id);
  }, [book.id, bookmarkId, chapter, chapterIndex, scrollRatio]);

  useEffect(() => {
    if (!keyboardEnabled) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditing = target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '');
      if (isEditing) return;
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(event.key)) {
        const container = scrollRef.current;
        if (!container) return;
        event.preventDefault();
        const direction = event.key === 'ArrowUp' || event.key === 'PageUp' ? -1 : 1;
        const distance = event.key.startsWith('Page') ? container.clientHeight * 0.9 : 120;
        container.scrollBy({ top: direction * distance, behavior: 'auto' });
        return;
      }
      if (event.key.toLowerCase() !== 'b') return;
      event.preventDefault();
      void toggleBookmark();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [keyboardEnabled, toggleBookmark]);

  const parsedChapter = useMemo(() => {
    if (!chapter) return null;
    const parsed = new DOMParser().parseFromString(chapter.html, 'text/html');
    return parsed.body;
  }, [chapter]);

  if (error) return <div className="reader-error">{error}</div>;
  if (!content || !chapter || !parsedChapter) return null;

  return (
    <section className="txt-reader epub-reader">
      <div className="reader-subbar epub-subbar">
        <span title={content.title}>{chapter.title}</span>
        <select value={chapter.href} onChange={(event) => selectChapter(event.target.value)} aria-label="选择 EPUB 章节">
          {content.chapters.map((item, index) => (
            <option value={item.href} key={item.href}>{`${index + 1}. ${item.title}`}</option>
          ))}
        </select>
        <div className="reader-subbar-actions">
          <button type="button" className={bookmarkId ? 'bookmark-active subbar-button' : 'subbar-button'} onClick={() => void toggleBookmark()}>
            {bookmarkId ? '已书签' : '添加书签'}
          </button>
        </div>
      </div>
      <div className="txt-scroll epub-scroll" ref={scrollRef} onScroll={handleScroll} onMouseUp={captureSelection}>
        <article className="epub-content" style={{ fontSize: `${settings.fontSize}px`, lineHeight: settings.lineHeight }}>
          {[...parsedChapter.childNodes].map((node, index) => renderSafeNode(node, `${chapter.href}-${index}`, query))}
        </article>
      </div>
      <label className="reader-search">
        <span>搜索章节</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索当前章节" />
      </label>
      <ReaderNotes book={book} location={chapterIndex + scrollRatio} chapterHref={chapter.href} locationLabel={`${chapter.title} · ${Math.round(scrollRatio * 100)}%`} quote={selectedQuote} />
    </section>
  );
}

function renderSafeNode(node: Node, key: string, query: string): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) return renderHighlightedText(node.textContent ?? '', query, key);
  if (node.nodeType !== Node.ELEMENT_NODE) return null;

  const element = node as HTMLElement;
  const tag = element.tagName.toLowerCase();
  if (blockedElements.has(tag)) return null;
  if (tag === 'br' || tag === 'hr') return createElement(tag, { key });
  const children = [...element.childNodes].map((child, index) => renderSafeNode(child, `${key}-${index}`, query));
  if (tag === 'a') return createElement('span', { key }, children);
  if (tag === 'img') return element.getAttribute('alt') || null;
  const safeTag = allowedElements[tag];
  return safeTag ? createElement(safeTag, { key }, children) : createElement('span', { key }, children);
}

function renderHighlightedText(text: string, query: string, key: string): ReactNode {
  if (!query) return text;
  const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, 'gi'));
  return parts.map((part, index) => part.toLowerCase() === query.toLowerCase()
    ? createElement('mark', { key: `${key}-${index}` }, part)
    : part);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
