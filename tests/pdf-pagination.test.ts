import { describe, expect, it } from 'vitest';
import { getPdfPageBounds, getVisiblePdfPages, normalizePdfPage } from '../src/readers/pdf-pagination';

describe('PDF pagination', () => {
  it('normalizes double-page starts to odd pages', () => {
    expect(normalizePdfPage(2, 10, 'double')).toBe(1);
    expect(normalizePdfPage(8, 10, 'double')).toBe(7);
    expect(getVisiblePdfPages(2, 10, 'double')).toEqual([1, 2]);
  });

  it('keeps the final page as a single-page spread when needed', () => {
    expect(getPdfPageBounds(6, 'double')).toEqual({ min: 1, max: 5 });
    expect(getVisiblePdfPages(99, 6, 'double')).toEqual([5, 6]);
    expect(getPdfPageBounds(5, 'double')).toEqual({ min: 1, max: 5 });
    expect(getVisiblePdfPages(5, 5, 'double')).toEqual([5]);
    expect(normalizePdfPage(99, 5, 'double')).toBe(5);
  });

  it('uses every page in single-page mode', () => {
    expect(getPdfPageBounds(4, 'single')).toEqual({ min: 1, max: 4 });
    expect(normalizePdfPage(3, 4, 'single')).toBe(3);
    expect(getVisiblePdfPages(3, 4, 'single')).toEqual([3]);
  });
});
