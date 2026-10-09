import { useEffect, useMemo, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { BookRecord, BookProgress, ReaderSettings } from '../../electron/shared-types';
import { ReaderNotes } from './ReaderNotes';
import { getPdfPageBounds, getVisiblePdfPages, normalizePdfPage, type PdfViewMode } from './pdf-pagination';
// Vite resolves the worker as a URL asset during the renderer build.
// @ts-expect-error TypeScript does not understand Vite's asset query.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

type PdfZoomMode = 'manual' | 'fit';
type RenderTask = { cancel: () => void };
type ScrollPosition = { top: number; left: number; topRatio: number; leftRatio: number };

interface Props {
  book: BookRecord;
  settings: ReaderSettings;
  onProgress: (bookId: string, progress: BookProgress) => void;
  onReady: () => void;
  keyboardEnabled?: boolean;
}

const SUPER_SAMPLE = 2;

export function PdfReader({ book, settings: _settings, onProgress, onReady, keyboardEnabled = true }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingScrollRef = useRef<ScrollPosition | null>(null);
  const scrollRestoreTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const canvasRefs = useRef(new Map<number, HTMLCanvasElement>());
  const renderTasks = useRef(new Map<number, RenderTask>());
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(book.progress.kind === 'pdf' ? book.progress.page : 1);
  const [pageCount, setPageCount] = useState(book.progress.kind === 'pdf' ? book.progress.pageCount ?? 0 : 0);
  const [manualScale, setManualScale] = useState(1.15);
  const [fitScale, setFitScale] = useState(1);
  const [zoomMode, setZoomMode] = useState<PdfZoomMode>('fit');
  const [fitScaleRevision, setFitScaleRevision] = useState(0);
  const [viewMode, setViewMode] = useState<PdfViewMode>('single');
  const [error, setError] = useState('');
  const [bookmarkId, setBookmarkId] = useState<string | null>(null);
  const scale = zoomMode === 'fit' ? fitScale : manualScale;
  const visiblePages = useMemo(() => getVisiblePdfPages(page, pageCount, viewMode), [page, pageCount, viewMode]);

  useEffect(() => {
    let active = true;
    window.bookApi.readBinary(book.id)
      .then(async (response) => {
        if (!active) return;
        if (!response.ok) {
          setError(response.error);
          onReady();
          return;
        }
        try {
          const loaded = await pdfjsLib.getDocument({ data: response.data }).promise;
          if (!active) return;
          setDocument(loaded);
          setPageCount(loaded.numPages);
          setPage((current) => normalizePdfPage(current, loaded.numPages, viewMode));
          onReady();
        } catch {
          setError('PDF 文件无法解析');
          onReady();
        }
      })
      .catch((reason) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : '读取 PDF 文件失败');
        onReady();
      });
    return () => { active = false; };
  }, [book.id, onReady]);

  // Calculate the largest scale that keeps the current page or spread fully
  // visible inside the reader. It is recalculated when the window is resized
  // and when the user explicitly presses the fit button.
  useEffect(() => {
    if (!document || !scrollRef.current) return;
    let active = true;
    const container = scrollRef.current;

    const updateFitScale = async () => {
      const pages = await Promise.all(visiblePages.map((pageNumber) => document.getPage(pageNumber)));
      if (!active || !scrollRef.current || pages.length === 0) return;

      const baseSizes = pages.map((pdfPage) => {
        const viewport = pdfPage.getViewport({ scale: 1 });
        return { width: viewport.width, height: viewport.height };
      });
      const computedStyle = window.getComputedStyle(container);
      const horizontalPadding = parseFloat(computedStyle.paddingLeft) + parseFloat(computedStyle.paddingRight);
      const verticalPadding = parseFloat(computedStyle.paddingTop) + parseFloat(computedStyle.paddingBottom);
      const gap = viewMode === 'double' ? 24 : 0;
      const pageWidth = baseSizes.reduce((total, size) => total + size.width, 0) + gap;
      const pageHeight = Math.max(...baseSizes.map((size) => size.height));
      const availableWidth = Math.max(container.clientWidth - horizontalPadding, 1);
      const availableHeight = Math.max(container.clientHeight - verticalPadding, 1);
      // Do not enlarge a page in fit mode. This keeps the action useful after
      // manual zooming reaches 100% or more: fit always returns to a readable
      // full-page view instead of leaving the page at a larger scale.
      const nextScale = Math.max(0.25, Math.min(1, availableWidth / pageWidth, availableHeight / pageHeight));

      setFitScale((current) => Math.abs(current - nextScale) > 0.01 ? nextScale : current);
    };

    void updateFitScale();
    const observer = new ResizeObserver(() => void updateFitScale());
    observer.observe(container);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [document, page, pageCount, viewMode, visiblePages, fitScaleRevision]);

  useEffect(() => {
    if (!document || !scrollRef.current || scale <= 0) return;
    let active = true;
    renderTasks.current.forEach((task) => task.cancel());
    renderTasks.current.clear();

    const renderPage = async (pageNumber: number, slot: number) => {
      const canvas = canvasRefs.current.get(slot);
      if (!canvas) return;
      const pdfPage = await document.getPage(pageNumber);
      if (!active) return;

      const viewport = pdfPage.getViewport({ scale });
      const context = canvas.getContext('2d');
      if (!context) return;

      // Render twice the device resolution (capped to 4x) so PDF text remains
      // sharp even when the page is zoomed in on a high-DPI Windows display.
      const deviceScale = window.devicePixelRatio || 1;
      const outputScale = Math.min(Math.max(deviceScale, 1) * SUPER_SAMPLE, 4);
      canvas.width = Math.ceil(viewport.width * outputScale);
      canvas.height = Math.ceil(viewport.height * outputScale);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      const transform = [outputScale, 0, 0, outputScale, 0, 0] as [number, number, number, number, number, number];
      const task = pdfPage.render({ canvasContext: context, viewport, transform });
      renderTasks.current.set(pageNumber, task);
      await task.promise.catch(() => undefined);
    };

    void Promise.all(visiblePages.map((pageNumber, slot) => renderPage(pageNumber, slot))).then(() => {
      if (!active || !scrollRef.current || !pendingScrollRef.current) return;
      const container = scrollRef.current;
      let attempts = 0;
      const restoreScrollPosition = () => {
        if (!active || !pendingScrollRef.current) return;
        const position = pendingScrollRef.current;
        const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
        const maxLeft = Math.max(0, container.scrollWidth - container.clientWidth);
        const targetTop = Math.max(position.top, maxTop * position.topRatio);
        const targetLeft = Math.max(position.left, maxLeft * position.leftRatio);
        container.scrollTop = Math.min(targetTop, maxTop);
        container.scrollLeft = Math.min(targetLeft, maxLeft);
        attempts += 1;
        if (attempts < 20) {
          requestAnimationFrame(restoreScrollPosition);
        } else {
          scrollRestoreTimer.current = setTimeout(() => {
            pendingScrollRef.current = null;
          }, 200);
        }
      };
      clearTimeout(scrollRestoreTimer.current);
      requestAnimationFrame(restoreScrollPosition);
    });
    onProgress(book.id, { kind: 'pdf', page, pageCount });
    return () => {
      active = false;
      clearTimeout(scrollRestoreTimer.current);
      renderTasks.current.forEach((task) => task.cancel());
      renderTasks.current.clear();
    };
  }, [book.id, document, page, pageCount, scale, onProgress, visiblePages]);

  useEffect(() => {
    window.bookApi.listBookmarks(book.id).then((response) => {
      if (response.ok) setBookmarkId(response.data.find((bookmark) => bookmark.location === page)?.id ?? null);
    });
  }, [book.id, page]);

  const toggleBookmark = async () => {
    if (bookmarkId) {
      const response = await window.bookApi.removeBookmark(bookmarkId);
      if (response.ok) setBookmarkId(null);
      return;
    }
    const response = await window.bookApi.saveBookmark({ bookId: book.id, label: `第 ${page} 页`, location: page });
    if (response.ok) setBookmarkId(response.data.id);
  };

  const goToPage = (next: number) => {
    if (!pageCount) return;
    const nextPage = normalizePdfPage(next, pageCount, viewMode);
    if (nextPage === page) return;
    if (scrollRef.current) {
      const maxTop = Math.max(0, scrollRef.current.scrollHeight - scrollRef.current.clientHeight);
      const maxLeft = Math.max(0, scrollRef.current.scrollWidth - scrollRef.current.clientWidth);
      pendingScrollRef.current = {
        top: scrollRef.current.scrollTop,
        left: scrollRef.current.scrollLeft,
        topRatio: maxTop > 0 ? scrollRef.current.scrollTop / maxTop : 0,
        leftRatio: maxLeft > 0 ? scrollRef.current.scrollLeft / maxLeft : 0,
      };
    }
    setPage(nextPage);
  };
  const changeViewMode = (nextMode: PdfViewMode) => {
    setViewMode(nextMode);
    setPage((current) => normalizePdfPage(current, pageCount, nextMode));
  };
  const changeManualScale = (delta: number) => {
    const currentScale = zoomMode === 'fit' ? scale : manualScale;
    setZoomMode('manual');
    setManualScale(Math.min(4, Math.max(0.25, currentScale + delta)));
  };
  const setCanvasRef = (slot: number, canvas: HTMLCanvasElement | null) => {
    if (canvas) canvasRefs.current.set(slot, canvas);
    else canvasRefs.current.delete(slot);
  };

  useEffect(() => {
    if (!keyboardEnabled) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditing = target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '');
      if (isEditing || !document || !pageCount) return;

      const step = viewMode === 'double' ? 2 : 1;
      if (event.key === 'ArrowUp' || event.key === 'PageUp') {
        event.preventDefault();
        goToPage(page - step);
      } else if (event.key === 'ArrowDown' || event.key === 'PageDown') {
        event.preventDefault();
        goToPage(page + step);
      } else if (event.key.toLowerCase() === 'b') {
        event.preventDefault();
        void toggleBookmark();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [document, keyboardEnabled, page, pageCount, viewMode, bookmarkId]);

  if (error) return <div className="reader-error">{error}</div>;

  return (
    <section className="pdf-reader">
      <div className="reader-subbar">
        <div className="pdf-controls">
          <button type="button" onClick={() => goToPage(page - (viewMode === 'double' ? 2 : 1))} disabled={page <= 1}>{viewMode === 'double' ? '上一组' : '上一页'}</button>
          <label className="page-input">
            <input type="number" min="1" max={pageCount} value={page} onChange={(event) => goToPage(Number(event.target.value))} />
            {visiblePages.length > 1 ? `–${visiblePages[1]}` : ''} / {pageCount || '—'}
          </label>
          <button type="button" onClick={() => goToPage(page + (viewMode === 'double' ? 2 : 1))} disabled={page >= getPdfPageBounds(pageCount, viewMode).max}>{viewMode === 'double' ? '下一组' : '下一页'}</button>
        </div>
        <div className="pdf-controls">
          <button type="button" className={bookmarkId ? 'bookmark-active' : ''} onClick={toggleBookmark} aria-pressed={Boolean(bookmarkId)} title="快捷键 B">{bookmarkId ? '已书签' : '书签'}</button>
          <select className="pdf-select" value={viewMode} onChange={(event) => changeViewMode(event.target.value as PdfViewMode)} aria-label="页面布局">
            <option value="single">单页</option>
            <option value="double">双页</option>
          </select>
          <button
            type="button"
            className={zoomMode === 'fit' ? 'bookmark-active' : ''}
            onClick={() => {
              setFitScaleRevision((revision) => revision + 1);
              setZoomMode('fit');
            }}
          >适应页面</button>
          <button type="button" onClick={() => changeManualScale(-0.1)}>−</button>
          <span>{Math.round(scale * 100)}%</span>
          <button type="button" onClick={() => changeManualScale(0.1)}>+</button>
        </div>
      </div>
      <div className="pdf-scroll" ref={scrollRef}>
        <div className={`pdf-page-spread pdf-page-spread-${viewMode}`}>
          {visiblePages.map((pageNumber, slot) => (
            <canvas
              key={slot}
              ref={(canvas) => setCanvasRef(slot, canvas)}
              className="pdf-canvas"
              aria-label={`第 ${pageNumber} 页`}
            />
          ))}
        </div>
      </div>
      <ReaderNotes book={book} location={page} locationLabel={`第 ${page} 页`} />
    </section>
  );
}
