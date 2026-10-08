import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BookRecord, BookProgress, ReaderSettings } from '../../../electron/shared-types';
import { PdfReader } from '../../readers/PdfReader';
import { EpubReader } from '../../readers/EpubReader';
import { TxtReader } from '../../readers/TxtReader';

interface Props {
  books: BookRecord[];
  activeBookId: string;
  splitBookId: string | null;
  settings: ReaderSettings;
  onBack: () => void;
  onImport: () => void;
  onSelectBook: (bookId: string) => void;
  onCloseBook: (bookId: string) => void;
  onSplitBook: (bookId: string | null) => void;
  onProgress: (bookId: string, progress: BookProgress) => void;
  onSettings: (settings: ReaderSettings) => void;
}

export function ReaderPage({
  books,
  activeBookId,
  splitBookId,
  settings,
  onBack,
  onImport,
  onSelectBook,
  onCloseBook,
  onSplitBook,
  onProgress,
  onSettings,
}: Props) {
  const activeBook = books.find((book) => book.id === activeBookId) ?? books[0];
  const splitBook = splitBookId ? books.find((book) => book.id === splitBookId) : undefined;
  const displayedBooks = useMemo(
    () => activeBook && splitBook && splitBook.id !== activeBook.id ? [activeBook, splitBook] : activeBook ? [activeBook] : [],
    [activeBook, splitBook],
  );
  const [showSettings, setShowSettings] = useState(false);

  if (!activeBook) return null;

  return (
    <main className="reader-page">
      <header className="reader-header">
        <button className="back-button" type="button" onClick={onBack} aria-label="返回书架">← <span>书架</span></button>
        <div className="reader-title" title={activeBook.title}>{activeBook.title}</div>
        <div className="reader-actions">
          <button className="toolbar-button" type="button" onClick={onImport}>打开书籍</button>
          <button className="toolbar-button" type="button" onClick={() => setShowSettings((visible) => !visible)}>设置</button>
        </div>
      </header>

      <nav className="reader-tabs" aria-label="已打开的书籍">
        <div className="reader-tab-list">
          {books.map((book) => (
            <div className={`reader-tab ${book.id === activeBook.id ? 'reader-tab-active' : ''}`} key={book.id}>
              <button type="button" onClick={() => onSelectBook(book.id)} title={book.title}>{book.title}</button>
              <button type="button" className="reader-tab-close" onClick={() => onCloseBook(book.id)} aria-label={`关闭 ${book.title}`}>×</button>
            </div>
          ))}
        </div>
        <div className="reader-layout-controls">
          <label>
            右栏
            <select
              value={splitBook?.id ?? ''}
              onChange={(event) => onSplitBook(event.target.value || null)}
              disabled={books.length < 2}
              aria-label="选择右栏书籍"
            >
              <option value="">关闭</option>
              {books.filter((book) => book.id !== activeBook.id).map((book) => <option value={book.id} key={book.id}>{book.title}</option>)}
            </select>
          </label>
          <button type="button" className="toolbar-button" onClick={onImport}>＋</button>
        </div>
      </nav>

      {showSettings && <SettingsPanel settings={settings} onChange={onSettings} />}

      <div className={`reader-body reader-layout-${displayedBooks.length === 2 ? 'split' : 'single'}`}>
        {displayedBooks.map((book) => <BookPane key={book.id} book={book} settings={settings} onProgress={onProgress} keyboardEnabled={book.id === activeBook.id} />)}
      </div>
    </main>
  );
}

function BookPane({ book, settings, onProgress, keyboardEnabled }: { book: BookRecord; settings: ReaderSettings; onProgress: Props['onProgress']; keyboardEnabled: boolean }) {
  const [loading, setLoading] = useState(true);
  const handleReady = useCallback(() => setLoading(false), []);

  useEffect(() => {
    setLoading(true);
  }, [book.id]);

  return (
    <section className="reader-pane" aria-label={`阅读 ${book.title}`}>
      <div className="reader-pane-title" title={book.title}>
        <span>{book.title}</span>
        <span className="format-label">{book.format.toUpperCase()}</span>
      </div>
      {book.format === 'pdf' ? (
        <PdfReader book={book} settings={settings} onProgress={onProgress} onReady={handleReady} keyboardEnabled={keyboardEnabled} />
      ) : book.format === 'epub' ? (
        <EpubReader book={book} settings={settings} onProgress={onProgress} onReady={handleReady} keyboardEnabled={keyboardEnabled} />
      ) : (
        <TxtReader book={book} settings={settings} onProgress={onProgress} onReady={handleReady} keyboardEnabled={keyboardEnabled} />
      )}
      {loading && <div className="reader-loading">正在打开 {book.format.toUpperCase()}...</div>}
    </section>
  );
}

function SettingsPanel({ settings, onChange }: { settings: ReaderSettings; onChange: (settings: ReaderSettings) => void }) {
  return (
    <aside className="settings-panel">
      <label>
        字号
        <input type="range" min="14" max="28" value={settings.fontSize} onChange={(event) => onChange({ ...settings, fontSize: Number(event.target.value) })} />
        <output>{settings.fontSize}px</output>
      </label>
      <label>
        行距
        <input type="range" min="1.3" max="2.2" step="0.1" value={settings.lineHeight} onChange={(event) => onChange({ ...settings, lineHeight: Number(event.target.value) })} />
        <output>{settings.lineHeight}</output>
      </label>
      <label>
        主题
        <select value={settings.theme} onChange={(event) => onChange({ ...settings, theme: event.target.value as ReaderSettings['theme'] })}>
          <option value="light">纸张</option>
          <option value="sepia">暖黄</option>
          <option value="dark">夜读</option>
        </select>
      </label>
      <label className="background-color-setting">
        背景颜色
        <input
          type="color"
          value={settings.readerBackgroundColor}
          onChange={(event) => onChange({ ...settings, readerBackgroundColor: event.target.value })}
          aria-label="选择阅读背景颜色"
        />
        <output>{settings.readerBackgroundColor.toUpperCase()}</output>
      </label>
    </aside>
  );
}
