import { normalizePdfPage, type PdfViewMode } from './pdf-pagination';

export interface PdfOutlineSource {
  title: string;
  dest: unknown;
  url?: string | null;
  items?: PdfOutlineSource[];
}

export interface PdfOutlineDocument {
  numPages: number;
  getOutline: () => Promise<PdfOutlineSource[] | null>;
  getDestination: (name: string) => Promise<unknown[] | null>;
  getPageIndex: (ref: { num: number; gen: number }) => Promise<number>;
}

export interface PdfOutlineNode {
  id: string;
  title: string;
  page: number | null;
  depth: number;
  unavailableReason: string | null;
  children: PdfOutlineNode[];
}

// A bad destination affects only its own entry, never the rest of the outline.
export async function resolvePdfDestination(document: PdfOutlineDocument, destination: unknown): Promise<number | null> {
  try {
    const explicit = typeof destination === 'string'
      ? await document.getDestination(destination)
      : destination;
    if (!Array.isArray(explicit) || explicit.length === 0) return null;
    const target: unknown = explicit[0];
    let index: number;
    if (typeof target === 'number') {
      index = target;
    } else if (target && typeof target === 'object' && 'num' in target && 'gen' in target
      && typeof target.num === 'number' && Number.isInteger(target.num) && target.num > 0
      && typeof target.gen === 'number' && Number.isInteger(target.gen) && target.gen >= 0) {
      index = await document.getPageIndex({ num: target.num, gen: target.gen });
    } else {
      return null;
    }
    return Number.isInteger(index) && index >= 0 && index < document.numPages ? index + 1 : null;
  } catch {
    return null;
  }
}

export async function loadPdfOutline(document: PdfOutlineDocument): Promise<PdfOutlineNode[]> {
  const outline = await document.getOutline();
  const destinations = new Map<string, Promise<number | null>>();
  const resolve = (destination: unknown) => {
    if (typeof destination !== 'string') return resolvePdfDestination(document, destination);
    let pending = destinations.get(destination);
    if (!pending) {
      pending = resolvePdfDestination(document, destination);
      destinations.set(destination, pending);
    }
    return pending;
  };
  const parseNodes = async (items: PdfOutlineSource[], path: string, depth: number): Promise<PdfOutlineNode[]> => {
    const nodes: PdfOutlineNode[] = [];
    for (const [index, item] of items.entries()) {
      const id = `${path}${index}`;
      const title = item.title.replace(/[\u0000-\u001f\u007f]/g, '').trim();
      // Promote children of empty headings so their valid destinations remain accessible.
      const children = await parseNodes(item.items ?? [], `${id}-`, title ? depth + 1 : depth);
      if (!title) {
        nodes.push(...children);
        continue;
      }
      const page = item.url ? null : await resolve(item.dest);
      nodes.push({
        id, title, page, depth, children,
        unavailableReason: page !== null ? null : item.url
          ? '暂不支持外部链接目录'
          : item.dest == null ? '此目录项没有页面目标' : '目录目标无法解析或超出页码范围',
      });
    }
    return nodes;
  };
  return parseNodes(outline ?? [], '', 0);
}

export function flattenPdfOutline(nodes: PdfOutlineNode[]): PdfOutlineNode[] {
  return nodes.flatMap((node) => [node, ...flattenPdfOutline(node.children)]);
}

export function getPdfOutlinePage(node: PdfOutlineNode, pageCount: number, viewMode: PdfViewMode): number | null {
  if (node.page === null || !Number.isInteger(node.page) || node.page < 1 || node.page > pageCount) return null;
  return normalizePdfPage(node.page, pageCount, viewMode);
}

export function getActivePdfOutlineId(nodes: PdfOutlineNode[], visiblePages: number[]): string | null {
  const lastVisiblePage = visiblePages.at(-1) ?? 0;
  let active: PdfOutlineNode | null = null;
  for (const node of flattenPdfOutline(nodes)) {
    if (node.page !== null && node.page <= lastVisiblePage
      && (!active || node.page > active.page! || (node.page === active.page && node.depth >= active.depth))) {
      active = node;
    }
  }
  return active?.id ?? null;
}

export function getPdfOutlineAncestors(nodes: PdfOutlineNode[], id: string): string[] {
  for (const node of nodes) {
    if (node.id === id) return [];
    const descendants = flattenPdfOutline(node.children);
    if (descendants.some((child) => child.id === id)) {
      return [node.id, ...getPdfOutlineAncestors(node.children, id)];
    }
  }
  return [];
}
