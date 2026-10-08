import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  BookProgress,
  BookRecord,
  Bookmark,
  ReaderSettings,
} from '../../electron/shared-types';
import { LibraryPage } from '../features/library/LibraryPage';
import { ReaderPage } from '../features/reader/ReaderPage';

type View = { kind: 'library' } | { kind: 'reader' };

const fallbackSettings: ReaderSettings = {
  fontSize: 18,
  lineHeight: 1.7,
  margin: 72,
  theme: 'light',
  readerBackgroundColor: '#f4f1ea',
};

function isSuccess<T>(response: { ok: boolean; data?: T }): response is { ok: true; data: T } {
  return response.ok;
}

export default function App() {
  const [books, setBooks] = useState<BookRecord[]>([]);
  const [settings, setSettings] = useState<ReaderSettings>(fallbackSettings);
  const [view, setView] = useState<View>({ kind: 'library' });
  const [openBookIds, setOpenBookIds] = useState<string[]>([]);
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [splitBookId, setSplitBookId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const api = window.bookApi;
    if (!api) {
      setError('应用接口加载失败，请重启开发服务后再试');
      return false;
    }
    try {
      const response = await api.listBooks();
      if (isSuccess(response)) {
        setBooks(response.data);
        return true;
      }
      setError(response.error);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '书架加载失败');
    }
    return false;
  }, []);

  useEffect(() => {
    if (!window.bookApi) {
      setError('应用接口加载失败，请重启开发服务后再试');
      setLoading(false);
      return;
    }
    Promise.all([window.bookApi.listBooks(), window.bookApi.getSettings()])
      .then(([bookResult, settingsResult]) => {
        if (isSuccess(bookResult)) setBooks(bookResult.data);
        else setError(bookResult.error);
        if (isSuccess(settingsResult)) setSettings(settingsResult.data);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : '应用初始化失败'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.style.setProperty('--reader-background', settings.readerBackgroundColor);
  }, [settings.readerBackgroundColor, settings.theme]);

  const openBooks = useMemo(
    () => openBookIds
      .map((bookId) => books.find((book) => book.id === bookId))
      .filter((book): book is BookRecord => Boolean(book)),
    [books, openBookIds],
  );
  const activeBook = activeBookId ? books.find((book) => book.id === activeBookId) ?? null : null;

  const openBook = useCallback((book: BookRecord) => {
    setError('');
    setOpenBookIds((current) => current.includes(book.id) ? current : [...current, book.id]);
    if (view.kind === 'reader' && activeBookId && activeBookId !== book.id) {
      setSplitBookId((split) => split ?? book.id);
    } else {
      if (activeBookId && activeBookId !== book.id) setSplitBookId((split) => split ?? activeBookId);
      setActiveBookId(book.id);
    }
    setView({ kind: 'reader' });
  }, [activeBookId, view.kind]);

  useEffect(() => {
    if (!window.bookApi) return;
    return window.bookApi.onImportResult((response) => {
      if (isSuccess(response)) {
        void refresh().then(() => openBook(response.data));
      } else if (response.error !== '已取消导入') {
        setError(response.error);
      }
    });
  }, [openBook, refresh]);

  const importBook = useCallback(async () => {
    setError('');
    if (!window.bookApi) {
      setError('应用接口加载失败，请重启开发服务后再试');
      return;
    }
    try {
      const response = await window.bookApi.chooseFile();
      if (isSuccess(response)) {
        await refresh();
        openBook(response.data);
      } else if (response.error !== '已取消导入') {
        setError(response.error);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '导入文件失败');
    }
  }, [openBook, refresh]);

  const removeBook = useCallback(async (bookId: string) => {
    const response = await window.bookApi.removeBook(bookId);
    if (isSuccess(response)) {
      await refresh();
      setOpenBookIds((current) => current.filter((id) => id !== bookId));
      setSplitBookId((current) => current === bookId ? null : current);
      if (activeBookId === bookId) {
        const nextBookId = openBookIds.find((id) => id !== bookId) ?? null;
        setActiveBookId(nextBookId);
        if (!nextBookId) setView({ kind: 'library' });
      }
    } else setError(response.error);
  }, [activeBookId, openBookIds, refresh]);

  const closeOpenBook = useCallback((bookId: string) => {
    setOpenBookIds((current) => {
      const next = current.filter((id) => id !== bookId);
      if (bookId === activeBookId) {
        const replacement = next[0] ?? null;
        setActiveBookId(replacement);
        if (!replacement) setView({ kind: 'library' });
      }
      return next;
    });
    setSplitBookId((current) => current === bookId ? null : current);
  }, [activeBookId]);

  const selectOpenBook = useCallback((bookId: string) => {
    if (bookId === splitBookId && activeBookId) setSplitBookId(activeBookId);
    setActiveBookId(bookId);
  }, [activeBookId, splitBookId]);

  const updateProgress = useCallback(async (bookId: string, progress: BookProgress) => {
    const response = await window.bookApi.saveProgress(bookId, progress);
    if (isSuccess(response)) {
      setBooks((current) => current.map((book) => (book.id === bookId ? response.data : book)));
    }
  }, []);

  const updateSettings = useCallback(async (next: ReaderSettings) => {
    setSettings(next);
    const response = await window.bookApi.setSettings(next);
    if (!isSuccess(response)) setError(response.error);
  }, []);

  const page = useMemo(() => {
    if (loading) return <div className="loading-state">正在准备书架...</div>;
    if (view.kind === 'reader' && activeBook) {
      return (
        <ReaderPage
          books={openBooks}
          activeBookId={activeBook.id}
          splitBookId={splitBookId}
          settings={settings}
          onBack={() => setView({ kind: 'library' })}
          onImport={importBook}
          onSelectBook={selectOpenBook}
          onCloseBook={closeOpenBook}
          onSplitBook={setSplitBookId}
          onProgress={updateProgress}
          onSettings={updateSettings}
        />
      );
    }
    return (
      <LibraryPage
        books={books}
        onImport={importBook}
        onOpen={openBook}
        onRemove={removeBook}
      />
    );
  }, [activeBook, books, closeOpenBook, importBook, loading, openBook, openBooks, removeBook, selectOpenBook, settings, splitBookId, updateProgress, updateSettings, view]);

  return (
    <div className="app-shell">
      {error && (
        <div className="toast error-toast" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')}>关闭</button>
        </div>
      )}
      {page}
    </div>
  );
}

export type { Bookmark };
