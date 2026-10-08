import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, extname } from 'node:path';
import chardet from 'chardet';
import iconv from 'iconv-lite';
import type { BookFormat, BookRecord } from '../shared-types';
import { readDocxText } from './docx-service';
import { readEpubFile } from './epub-service';
import { getBook, upsertBook } from './store-service';

const supportedFormats: Record<string, BookFormat> = {
  '.pdf': 'pdf',
  '.txt': 'txt',
  '.docx': 'docx',
  '.epub': 'epub',
};

export function getFormat(filePath: string): BookFormat {
  const format = supportedFormats[extname(filePath).toLowerCase()];
  if (!format) throw new Error('暂不支持此文件格式，请选择 PDF、TXT、DOCX 或 EPUB 文件');
  return format;
}

function makeBookId(filePath: string) {
  return createHash('sha256').update(filePath.toLowerCase()).digest('hex').slice(0, 24);
}

export function importBook(filePath: string): BookRecord {
  const format = getFormat(filePath);
  if (!existsSync(filePath)) throw new Error('文件不存在或无法访问');

  const stat = statSync(filePath);
  const id = makeBookId(filePath);
  const previous = getBook(id);
  const book: BookRecord = {
    id,
    path: filePath,
    format,
    title: basename(filePath, extname(filePath)),
    size: stat.size,
    modifiedAt: stat.mtimeMs,
    addedAt: previous?.addedAt ?? Date.now(),
    lastOpenedAt: previous?.lastOpenedAt ?? 0,
    available: true,
    progress: previous?.progress ?? (format === 'pdf'
      ? { kind: 'pdf', page: 1 }
      : format === 'epub'
        ? { kind: 'epub', chapterHref: '', scrollRatio: 0 }
        : { kind: 'txt', scrollRatio: 0 }),
  };
  return upsertBook(book);
}

export async function readTextBook(bookId: string) {
  const book = getBook(bookId);
  if (!book || (book.format !== 'txt' && book.format !== 'docx')) throw new Error('找不到 TXT 或 DOCX 文件');
  if (!existsSync(book.path)) throw new Error('文件已被移动或删除');

  if (book.format === 'docx') {
    return { text: await readDocxText(book.path), encoding: 'DOCX' };
  }

  const buffer = readFileSync(book.path);
  const detected = chardet.detect(buffer) ?? 'UTF-8';
  const encoding = detected.toLowerCase() === 'gb2312' ? 'gbk' : detected;
  return { text: iconv.decode(buffer, encoding), encoding };
}

export async function readEpubBook(bookId: string) {
  const book = getBook(bookId);
  if (!book || book.format !== 'epub') throw new Error('找不到 EPUB 文件');
  if (!existsSync(book.path)) throw new Error('文件已被移动或删除');
  return readEpubFile(book.path);
}

export function readPdfBook(bookId: string) {
  const book = getBook(bookId);
  if (!book || book.format !== 'pdf') throw new Error('找不到 PDF 文件');
  if (!existsSync(book.path)) throw new Error('文件已被移动或删除');
  return new Uint8Array(readFileSync(book.path));
}

export function refreshBookAvailability(book: BookRecord): BookRecord {
  const available = existsSync(book.path);
  if (book.available !== available) return upsertBook({ ...book, available });
  return book;
}
