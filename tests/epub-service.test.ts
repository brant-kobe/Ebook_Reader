import { describe, expect, it } from 'vitest';
import { parseEpubEntries } from '../electron/services/epub-service';

function makeEpubEntries(spine = '<itemref idref="chapter-two"/><itemref idref="chapter-one"/>') {
  return new Map([
    ['META-INF/container.xml', '<container><rootfiles><rootfile full-path="OPS/package.opf"/></rootfiles></container>'],
    ['OPS/package.opf', [
      '<package><metadata><dc:title>Sample &amp; Book</dc:title></metadata><manifest>',
      '<item id="navigation" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
      '<item id="chapter-one" href="Text/chapter%201.xhtml" media-type="application/xhtml+xml"/>',
      '<item id="chapter-two" href="Text/chapter-2.xhtml" media-type="application/xhtml+xml"/>',
      '</manifest><spine>', spine, '</spine></package>',
    ].join('')],
    ['OPS/nav.xhtml', '<nav><ol><li><a href="Text/chapter%201.xhtml#start">First &amp; foremost</a></li></ol></nav>'],
    ['OPS/Text/chapter 1.xhtml', '<html><head><title>Chapter heading</title></head><body><p>One</p></body></html>'],
    ['OPS/Text/chapter-2.xhtml', '<html><body><h1>Second chapter</h1></body></html>'],
  ]);
}

describe('parseEpubEntries', () => {
  it('follows spine order, resolves encoded paths, and uses navigation titles', () => {
    const book = parseEpubEntries(makeEpubEntries());

    expect(book.title).toBe('Sample & Book');
    expect(book.chapters.map(({ href, title }) => ({ href, title }))).toEqual([
      { href: 'OPS/Text/chapter-2.xhtml', title: 'Second chapter' },
      { href: 'OPS/Text/chapter 1.xhtml', title: 'First & foremost' },
    ]);
    expect(book.chapters[1].html).toContain('<p>One</p>');
  });

  it('uses EPUB 2 NCX titles for chapters in the spine', () => {
    const entries = makeEpubEntries();
    entries.set('OPS/package.opf', entries.get('OPS/package.opf')!
      .replace('<item id="navigation" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
        '<item id="toc" href="toc.ncx" media-type="application/x-dtbncx+xml"/>')
      .replace('<spine>', '<spine toc="toc">'));
    entries.delete('OPS/nav.xhtml');
    entries.set('OPS/toc.ncx', [
      '<ncx><navMap>',
      '<navPoint id="two"><navLabel><text>Chapter Two</text></navLabel><content src="Text/chapter-2.xhtml"/></navPoint>',
      '<navPoint id="one"><navLabel><text>Chapter One</text></navLabel><content src="Text/chapter%201.xhtml#start"/></navPoint>',
      '</navMap></ncx>',
    ].join(''));

    expect(parseEpubEntries(entries).chapters.map((chapter) => chapter.title)).toEqual(['Chapter Two', 'Chapter One']);
  });

  it('falls back to the chapter filename when no navigation or heading exists', () => {
    const entries = makeEpubEntries('<itemref idref="chapter-two"/>');
    entries.set('OPS/package.opf', entries.get('OPS/package.opf')!.replace(/<item id="navigation"[^>]*\/>/, ''));
    entries.set('OPS/Text/chapter-2.xhtml', '<html><body><p>Body text</p></body></html>');

    expect(parseEpubEntries(entries).chapters[0].title).toBe('chapter 2');
  });

  it('rejects packages with no readable spine chapters', () => {
    expect(() => parseEpubEntries(makeEpubEntries('<itemref idref="missing"/>')))
      .toThrow('EPUB 文件没有可阅读的章节');
  });

  it('rejects chapter paths that escape the archive directory', () => {
    const entries = makeEpubEntries('<itemref idref="chapter-one"/>');
    entries.set('OPS/package.opf', entries.get('OPS/package.opf')!.replace('Text/chapter%201.xhtml', '../../outside.xhtml'));

    expect(() => parseEpubEntries(entries)).toThrow('EPUB 包含无效的章节路径');
  });

  it('rejects archives without a container document', () => {
    expect(() => parseEpubEntries(new Map())).toThrow('EPUB 文件缺少 container.xml');
  });
});
