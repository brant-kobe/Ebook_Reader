import yauzl from 'yauzl';

export function readDocxText(filePath: string) {
  return readDocumentXml(filePath).then(extractWordText);
}

function readDocumentXml(filePath: string) {
  return new Promise<string>((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true }, (openError, zipFile) => {
      if (openError || !zipFile) {
        reject(openError ?? new Error('无法读取 DOCX 文件'));
        return;
      }

      let settled = false;
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        zipFile.close();
        reject(error);
      };

      zipFile.on('error', fail);
      zipFile.on('entry', (entry) => {
        if (entry.fileName !== 'word/document.xml') {
          zipFile.readEntry();
          return;
        }
        if (entry.uncompressedSize > 64 * 1024 * 1024) {
          fail(new Error('DOCX 正文过大，无法打开'));
          return;
        }

        zipFile.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) {
            fail(streamError ?? new Error('无法读取 DOCX 正文'));
            return;
          }
          const chunks: Buffer[] = [];
          stream.on('data', (chunk: Buffer) => chunks.push(chunk));
          stream.on('error', fail);
          stream.on('end', () => {
            if (settled) return;
            settled = true;
            zipFile.close();
            resolve(Buffer.concat(chunks).toString('utf8'));
          });
        });
      });
      zipFile.on('end', () => {
        if (!settled) fail(new Error('DOCX 文件缺少正文内容'));
      });
      zipFile.readEntry();
    });
  });
}

export function extractWordText(xml: string) {
  const paragraphs = xml.match(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g) ?? [];
  return paragraphs.map((paragraph) => {
    const text: string[] = [];
    const tokenPattern = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br(?:\s[^>]*)?\s*\/>/g;
    for (const match of paragraph.matchAll(tokenPattern)) {
      if (match[1] !== undefined) text.push(decodeXmlEntities(match[1]));
      else text.push(match[0].startsWith('<w:tab') ? '\t' : '\n');
    }
    return text.join('');
  }).join('\n');
}

function decodeXmlEntities(value: string) {
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
