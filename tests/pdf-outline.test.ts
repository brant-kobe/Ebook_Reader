import { describe, expect, it, vi } from 'vitest';
import {
  flattenPdfOutline, getActivePdfOutlineId, getPdfOutlineAncestors, getPdfOutlinePage,
  loadPdfOutline, resolvePdfDestination, type PdfOutlineDocument, type PdfOutlineSource,
} from '../src/readers/pdf-outline';
import { getVisiblePdfPages } from '../src/readers/pdf-pagination';

function makeDocument(items: PdfOutlineSource[] | null = null): PdfOutlineDocument {
  return {
    numPages: 7,
    getOutline: vi.fn().mockResolvedValue(items),
    getDestination: vi.fn().mockResolvedValue([{ num: 12, gen: 0 }, { name: 'Fit' }]),
    getPageIndex: vi.fn().mockResolvedValue(3),
  };
}

describe('PDF outline destinations', () => {
  it('resolves named destinations through page references to one-based pages', async () => {
    const document = makeDocument();
    expect(await resolvePdfDestination(document, 'chapter-two')).toBe(4);
    expect(document.getDestination).toHaveBeenCalledWith('chapter-two');
    expect(document.getPageIndex).toHaveBeenCalledWith({ num: 12, gen: 0 });
  });

  it('resolves explicit zero-based indices including the first and last page', async () => {
    const document = makeDocument();
    expect(await resolvePdfDestination(document, [0, { name: 'Fit' }])).toBe(1);
    expect(await resolvePdfDestination(document, [6, { name: 'XYZ' }, null, null, null])).toBe(7);
    expect(document.getPageIndex).not.toHaveBeenCalled();
  });

  it.each([null, undefined, [], {}, [null], ['1'], [-1], [7], [1.5], [NaN], [Infinity], [{ num: -1, gen: 0 }], [{ num: 12 }]])(
    'keeps malformed or out-of-range destination %j unavailable', async (destination) => {
      expect(await resolvePdfDestination(makeDocument(), destination)).toBeNull();
    },
  );

  it('isolates missing destinations and PDF.js lookup failures', async () => {
    const document = makeDocument();
    document.getDestination = vi.fn().mockResolvedValue(null);
    expect(await resolvePdfDestination(document, 'missing')).toBeNull();
    document.getDestination = vi.fn().mockRejectedValue(new Error('broken name tree'));
    expect(await resolvePdfDestination(document, 'broken')).toBeNull();
    document.getPageIndex = vi.fn().mockRejectedValue(new Error('missing page'));
    expect(await resolvePdfDestination(document, [{ num: 12, gen: 0 }])).toBeNull();
    document.getPageIndex = vi.fn().mockResolvedValue(7);
    expect(await resolvePdfDestination(document, [{ num: 12, gen: 0 }])).toBeNull();
  });
});

describe('PDF outline tree', () => {
  it('preserves nesting, cleans control characters and promotes children of empty titles', async () => {
    const document = makeDocument([
      { title: ' \u0000第一章 ', dest: [0], items: [
        { title: '小节', dest: [1] },
        { title: ' \u0000\n ', dest: null, items: [{ title: '有效子节点', dest: [2] }] },
      ] },
    ]);
    const nodes = await loadPdfOutline(document);
    expect(flattenPdfOutline(nodes).map(({ title, page, depth }) => ({ title, page, depth }))).toEqual([
      { title: '第一章', page: 1, depth: 0 },
      { title: '小节', page: 2, depth: 1 },
      { title: '有效子节点', page: 3, depth: 1 },
    ]);
    expect(new Set(flattenPdfOutline(nodes).map((node) => node.id)).size).toBe(3);
  });

  it('retains invalid and external entries without losing their readable children', async () => {
    const nodes = await loadPdfOutline(makeDocument([
      { title: '分部', dest: null, items: [{ title: '章节', dest: [1] }] },
      { title: '坏页码', dest: [100] },
      { title: '<script>alert(1)</script>', dest: null, url: 'https://example.com' },
    ]));
    expect(nodes[0].page).toBeNull();
    expect(nodes[0].unavailableReason).toContain('没有页面目标');
    expect(nodes[0].children[0].page).toBe(2);
    expect(nodes[1].unavailableReason).toContain('无法解析');
    expect(nodes[2].unavailableReason).toContain('外部链接');
    expect(nodes[2].title).toBe('<script>alert(1)</script>');
  });

  it('reports empty outlines and propagates outline load failures separately', async () => {
    expect(await loadPdfOutline(makeDocument())).toEqual([]);
    expect(await loadPdfOutline(makeDocument([]))).toEqual([]);
    const document = makeDocument();
    document.getOutline = vi.fn().mockRejectedValue(new Error('outline unavailable'));
    await expect(loadPdfOutline(document)).rejects.toThrow('outline unavailable');
  });

  it('resolves repeated named destinations once and retains both entries', async () => {
    const document = makeDocument([{ title: '一', dest: 'same' }, { title: '二', dest: 'same' }]);
    const nodes = await loadPdfOutline(document);
    expect(nodes.map((node) => node.page)).toEqual([4, 4]);
    expect(document.getDestination).toHaveBeenCalledTimes(1);
  });
});

describe('PDF outline navigation', () => {
  it('uses the destination page in single mode and its fixed pair in double mode', async () => {
    const nodes = await loadPdfOutline(makeDocument([
      { title: '偶数页', dest: [3] },
      { title: '最后一页', dest: [6] },
      { title: '无目标', dest: null },
    ]));
    expect(getPdfOutlinePage(nodes[0], 7, 'single')).toBe(4);
    expect(getPdfOutlinePage(nodes[0], 7, 'double')).toBe(3);
    expect(getVisiblePdfPages(getPdfOutlinePage(nodes[0], 7, 'double')!, 7, 'double')).toEqual([3, 4]);
    expect(getVisiblePdfPages(getPdfOutlinePage(nodes[1], 7, 'double')!, 7, 'double')).toEqual([7]);
    expect(getPdfOutlinePage(nodes[2], 7, 'single')).toBeNull();
    expect(getPdfOutlinePage(nodes[1], 5, 'single')).toBeNull();
  });

  it('highlights the nearest section, preferring deeper entries on the same page', async () => {
    const nodes = await loadPdfOutline(makeDocument([
      { title: '第一章', dest: [0], items: [{ title: '小节', dest: [1] }] },
      { title: '第二章', dest: [3], items: [{ title: '引言', dest: [3] }] },
      { title: '无效条目', dest: null },
    ]));
    expect(getActivePdfOutlineId(nodes, [])).toBeNull();
    expect(getActivePdfOutlineId(nodes, [1])).toBe(nodes[0].id);
    expect(getActivePdfOutlineId(nodes, [3])).toBe(nodes[0].children[0].id);
    expect(getActivePdfOutlineId(nodes, [3, 4])).toBe(nodes[1].children[0].id);
    expect(getActivePdfOutlineId(nodes, [6])).toBe(nodes[1].children[0].id);
    expect(getPdfOutlineAncestors(nodes, nodes[1].children[0].id)).toEqual([nodes[1].id]);
    expect(getPdfOutlineAncestors(nodes, 'missing')).toEqual([]);
  });

  it('selects sections by their destination pages even if outline order differs', async () => {
    const nodes = await loadPdfOutline(makeDocument([
      { title: '后文', dest: [5] }, { title: '前文', dest: [1] },
    ]));
    expect(getActivePdfOutlineId(nodes, [1])).toBeNull();
    expect(getActivePdfOutlineId(nodes, [3])).toBe(nodes[1].id);
    expect(getActivePdfOutlineId(nodes, [7])).toBe(nodes[0].id);
  });
});
