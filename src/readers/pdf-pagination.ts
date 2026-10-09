export type PdfViewMode = 'single' | 'double';

export function getPdfPageBounds(pageCount: number, viewMode: PdfViewMode) {
  const safePageCount = Math.max(0, Math.floor(pageCount));
  const maxStart = viewMode === 'double' && safePageCount > 1 && safePageCount % 2 === 0
    ? safePageCount - 1
    : safePageCount;
  return { min: safePageCount > 0 ? 1 : 0, max: maxStart };
}

export function normalizePdfPage(page: number, pageCount: number, viewMode: PdfViewMode) {
  const bounds = getPdfPageBounds(pageCount, viewMode);
  if (bounds.max === 0) return 0;
  const numericPage = Number.isFinite(page) ? Math.floor(page) : bounds.min;
  const clampedPage = Math.min(Math.max(numericPage, bounds.min), bounds.max);
  return viewMode === 'double' && clampedPage % 2 === 0 ? clampedPage - 1 : clampedPage;
}

export function getVisiblePdfPages(page: number, pageCount: number, viewMode: PdfViewMode) {
  const startPage = normalizePdfPage(page, pageCount, viewMode);
  if (startPage === 0) return [];
  if (viewMode === 'double' && startPage < pageCount) return [startPage, startPage + 1];
  return [startPage];
}
