import { posix } from 'node:path';
import yauzl from 'yauzl';
import type { EpubBookContent, EpubChapter } from '../shared-types';

const maxEntrySize = 64 * 1024 * 1024;
const maxContentSize = 128 * 1024 * 1024;

export function readEpubFile(filePath: string): Promise<EpubBookContent> {
  return readXmlEntries(filePath).then(parseEpubEntries);
}

function readXmlEntries(filePath: string) {
  return new Promise<Map<string, string>>((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true }, (openError, zipFile) => {
      if (openError || !zipFile) {
        reject(openError ?? new Error('无法读取 EPUB 文件'));
        return;
      }

      const entries = new Map<string, string>();
      let totalSize = 0;
      let settled = false;
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        zipFile.close();
        reject(error);
      };

      zipFile.on('error', fail);
      zipFile.on('entry', (entry) => {
        const name = entry.fileName;
        const isXml = name === 'META-INF/container.xml' || /\.(?:opf|ncx|xhtml?|html?)$/i.test(name);
        if (!isXml) {
          zipFile.readEntry();
          return;
        }
        if (entry.uncompressedSize > maxEntrySize || totalSize + entry.uncompressedSize > maxContentSize) {
          fail(new Error('EPUB 内容过大，无法打开'));
          return;
        }
        totalSize += entry.uncompressedSize;

        zipFile.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) {
            fail(streamError ?? new Error('无法读取 EPUB 内容'));
            return;
          }
          const chunks: Buffer[] = [];
          stream.on('data', (chunk: Buffer) => chunks.push(chunk));
          stream.on('error', fail);
          stream.on('end', () => {
            if (settled) return;
            entries.set(name, Buffer.concat(chunks).toString('utf8'));
            zipFile.readEntry();
          });
        });
      });
      zipFile.on('end', () => {
        if (settled) return;
        settled = true;
        resolve(entries);
      });
      zipFile.readEntry();
    });
  });
}

export function parseEpubEntries(entries: Map<string, string>): EpubBookContent {
  const container = entries.get('META-INF/container.xml');
  if (!container) throw new Error('EPUB 文件缺少 container.xml');
  const rootfile = container.match(/<rootfile\b[^>]*>/i)?.[0];
  const opfPath = rootfile ? getAttribute(rootfile, 'full-path') : null;
  const opf = opfPath ? entries.get(opfPath) : undefined;
  if (!opf || !opfPath) throw new Error('EPUB 文件缺少有效的书籍目录');

  const manifest = new Map<string, { href: string; mediaType: string; properties: string }>();
  for (const match of opf.matchAll(/<item\b[^>]*>/gi)) {
    const id = getAttribute(match[0], 'id');
    const href = getAttribute(match[0], 'href');
    if (!id || !href) continue;
    manifest.set(id, {
      href,
      mediaType: getAttribute(match[0], 'media-type') ?? '',
      properties: getAttribute(match[0], 'properties') ?? '',
    });
  }

  const spineIds = [...opf.matchAll(/<itemref\b[^>]*>/gi)]
    .map((match) => getAttribute(match[0], 'idref'))
    .filter((id): id is string => Boolean(id));
  const spineItems = spineIds
    .map((id) => manifest.get(id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .filter((item) => /(?:xhtml|html)/i.test(item.mediaType));
  if (spineItems.length === 0) throw new Error('EPUB 文件没有可阅读的章节');

  const navItem = [...manifest.values()].find((item) => item.properties.split(/\s+/).includes('nav'));
  const navPath = navItem ? resolveArchivePath(opfPath, navItem.href) : null;
  const navTitles = navPath ? parseNavigation(entries.get(navPath) ?? '', navPath) : new Map<string, string>();
  const spineTag = opf.match(/<spine\b[^>]*>/i)?.[0] ?? '';
  const ncxId = getAttribute(spineTag, 'toc');
  const ncxItem = (ncxId ? manifest.get(ncxId) : undefined)
    ?? [...manifest.values()].find((item) => item.mediaType === 'application/x-dtbncx+xml');
  if (ncxItem) {
    const ncxPath = resolveArchivePath(opfPath, ncxItem.href);
    for (const [href, title] of parseNcx(entries.get(ncxPath) ?? '', ncxPath)) {
      if (!navTitles.has(href)) navTitles.set(href, title);
    }
  }

  const chapters: EpubChapter[] = spineItems.map((item, index) => {
    const href = resolveArchivePath(opfPath, item.href);
    const html = entries.get(href);
    if (!html) throw new Error(`EPUB 章节无法读取：${href}`);
    const title = navTitles.get(href) || getDocumentTitle(html) || getPathTitle(href) || `第 ${index + 1} 章`;
    return { href, title, html };
  });

  const titleTag = opf.match(/<dc:title\b[^>]*>([\s\S]*?)<\/dc:title>/i)?.[1] ?? '';
  const title = decodeXml(stripTags(titleTag)).trim() || chapters[0].title;
  return { title, chapters };
}

function parseNavigation(html: string, navPath: string) {
  const titles = new Map<string, string>();
  const basePath = posix.dirname(navPath);
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = getAttribute(match[0], 'href');
    const label = decodeXml(stripTags(match[2])).trim();
    if (!href || !label || href.startsWith('#')) continue;
    titles.set(resolveRelativePath(basePath, href), label);
  }
  return titles;
}

function parseNcx(ncx: string, ncxPath: string) {
  const titles = new Map<string, string>();
  const basePath = posix.dirname(ncxPath);
  const stack: Array<{ title: string }> = [];
  const tokens = /<\/?navPoint\b[^>]*>|<text\b[^>]*>[\s\S]*?<\/text>|<content\b[^>]*>/gi;

  for (const match of ncx.matchAll(tokens)) {
    const token = match[0];
    if (/^<navPoint\b/i.test(token)) {
      stack.push({ title: '' });
    } else if (/^<\/navPoint/i.test(token)) {
      stack.pop();
    } else if (/^<text\b/i.test(token) && stack.length > 0) {
      stack[stack.length - 1].title = decodeXml(stripTags(token)).trim();
    } else if (/^<content\b/i.test(token) && stack.length > 0) {
      const src = getAttribute(token, 'src');
      const title = stack[stack.length - 1].title;
      if (src && title) titles.set(resolveRelativePath(basePath, src), title);
    }
  }
  return titles;
}

function getPathTitle(href: string) {
  const name = posix.basename(href).replace(/\.[^.]+$/, '');
  return name.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function getDocumentTitle(html: string) {
  const match = html.match(/<(?:h1|h2|title)\b[^>]*>([\s\S]*?)<\/(?:h1|h2|title)>/i);
  return match ? decodeXml(stripTags(match[1])).trim() : '';
}

function resolveArchivePath(baseFile: string, href: string) {
  return resolveRelativePath(posix.dirname(baseFile), href);
}

function resolveRelativePath(basePath: string, href: string) {
  const path = href.split(/[?#]/, 1)[0];
  let decodedPath = path;
  try {
    decodedPath = decodeURIComponent(path);
  } catch {
    // Keep the archive's literal path when a malformed URI escape is present.
  }
  const resolved = posix.normalize(posix.join(basePath, decodeXml(decodedPath)));
  if (resolved === '..' || resolved.startsWith('../') || resolved.startsWith('/')) {
    throw new Error('EPUB 包含无效的章节路径');
  }
  return resolved;
}

function getAttribute(tag: string, name: string) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = tag.match(new RegExp(`(?:^|\\s)${escapedName}\\s*=\\s*(["'])(.*?)\\1`, 'i'));
  return match ? decodeXml(match[2]) : null;
}

function stripTags(value: string) {
  return value.replace(/<[^>]*>/g, '');
}

function decodeXml(value: string) {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, name: string) => {
    if (name[0] === '#') {
      const codePoint = name[1]?.toLowerCase() === 'x'
        ? Number.parseInt(name.slice(2), 16)
        : Number.parseInt(name.slice(1), 10);
      return Number.isFinite(codePoint) && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : entity;
    }
    return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" } as Record<string, string>)[name.toLowerCase()] ?? entity;
  });
}
