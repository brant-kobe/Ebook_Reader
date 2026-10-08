import type { BookRecord } from '../../../electron/shared-types';

interface Props {
  books: BookRecord[];
  onImport: () => void;
  onOpen: (book: BookRecord) => void;
  onRemove: (bookId: string) => void;
}

function formatDate(value: number) {
  if (!value) return '尚未阅读';
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(value);
}

function progress(book: BookRecord) {
  if (book.progress.kind === 'pdf') {
    if (!book.progress.pageCount) return '准备阅读';
    return `${Math.round((book.progress.page / book.progress.pageCount) * 100)}%`;
  }
  return `${Math.round(book.progress.scrollRatio * 100)}%`;
}

export function LibraryPage({ books, onImport, onOpen, onRemove }: Props) {
  const sortedBooks = [...books].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);

  return (
    <main className="library-page">
      <header className="library-header">
        <div>
          <div className="eyebrow">PERSONAL LIBRARY</div>
          <h1>书页</h1>
          <p>把正在读的内容，留在手边。</p>
        </div>
        <button className="primary-button" type="button" onClick={onImport}>
          <span className="button-mark">+</span> 导入书籍
        </button>
      </header>

      <section className="library-toolbar" aria-label="书架信息">
        <span>{books.length} 本书</span>
        <span className="toolbar-rule" />
        <span>PDF、TXT、DOCX 与 EPUB</span>
      </section>

      {sortedBooks.length === 0 ? (
        <section className="empty-library">
          <div className="empty-glyph">Aa</div>
          <h2>书架还是空的</h2>
          <p>导入 PDF、TXT、Word 或 EPUB 文档，开始阅读。</p>
          <button className="secondary-button" type="button" onClick={onImport}>选择文件</button>
        </section>
      ) : (
        <section className="book-grid" aria-label="书籍列表">
          {sortedBooks.map((book) => (
            <article className={`book-card ${!book.available ? 'book-card-unavailable' : ''}`} key={book.id}>
              <button className="book-cover" type="button" onClick={() => onOpen(book)} aria-label={`打开 ${book.title}`}>
                <span className="cover-format">{book.format.toUpperCase()}</span>
                <span className="cover-title">{book.title}</span>
                <span className="cover-line" />
                <span className="cover-footer">书页阅读器</span>
              </button>
              <div className="book-meta">
                <div className="book-title-row">
                  <h2 title={book.title}>{book.title}</h2>
                  <button className="icon-button" type="button" onClick={() => onRemove(book.id)} title="移出书架" aria-label="移出书架">×</button>
                </div>
                <div className="book-info">
                  <span>{book.available ? `上次阅读 ${formatDate(book.lastOpenedAt)}` : '文件不可用'}</span>
                  <strong>{progress(book)}</strong>
                </div>
                <div className="progress-track"><span style={{ width: `${book.progress.kind === 'pdf' && book.progress.pageCount ? (book.progress.page / book.progress.pageCount) * 100 : book.progress.kind !== 'pdf' ? book.progress.scrollRatio * 100 : 0}%` }} /></div>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
