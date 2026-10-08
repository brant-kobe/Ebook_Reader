import { app } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BookRecord, BookProgress, Bookmark, Note, ReaderSettings } from '../shared-types';

interface StoreSchema {
  books: BookRecord[];
  settings: ReaderSettings;
  bookmarks: Bookmark[];
  notes: Note[];
}

const defaults: StoreSchema = {
  books: [],
  settings: {
    fontSize: 18,
    lineHeight: 1.7,
    margin: 72,
    theme: 'light',
    readerBackgroundColor: '#f4f1ea',
  },
  bookmarks: [],
  notes: [],
};

let state: StoreSchema | null = null;

function storePath() {
  return join(app.getPath('userData'), 'library.json');
}

function getState(): StoreSchema {
  if (state) return state;
  try {
    const file = storePath();
    state = existsSync(file)
      ? { ...defaults, ...JSON.parse(readFileSync(file, 'utf8')) }
      : structuredClone(defaults);
  } catch {
    state = structuredClone(defaults);
  }
  return state!;
}

function persist() {
  writeFileSync(storePath(), JSON.stringify(getState(), null, 2), 'utf8');
}

export function listBooks() {
  return getState().books;
}

export function getBook(bookId: string) {
  return listBooks().find((book) => book.id === bookId);
}

export function upsertBook(book: BookRecord) {
  const books = listBooks();
  const index = books.findIndex((item) => item.id === book.id);
  if (index >= 0) books[index] = book;
  else books.unshift(book);
  getState().books = books;
  persist();
  return book;
}

export function updateProgress(bookId: string, progress: BookProgress) {
  const book = getBook(bookId);
  if (!book) throw new Error('找不到这本书');
  const updated = { ...book, progress, lastOpenedAt: Date.now() };
  return upsertBook(updated);
}

export function removeBook(bookId: string) {
  getState().books = listBooks().filter((book) => book.id !== bookId);
  getState().bookmarks = getState().bookmarks.filter((bookmark) => bookmark.bookId !== bookId);
  getState().notes = getState().notes.filter((note) => note.bookId !== bookId);
  persist();
}

export function getSettings() {
  const settings = { ...defaults.settings, ...getState().settings };
  getState().settings = settings;
  return settings;
}

export function setSettings(settings: ReaderSettings) {
  getState().settings = settings;
  persist();
  return settings;
}

export function listBookmarks(bookId: string) {
  return getState().bookmarks.filter((bookmark) => bookmark.bookId === bookId);
}

export function saveBookmark(input: Omit<Bookmark, 'id' | 'createdAt'>) {
  const bookmark: Bookmark = {
    ...input,
    id: `${input.bookId}-${input.location}-${Date.now()}`,
    createdAt: Date.now(),
  };
  getState().bookmarks = [bookmark, ...getState().bookmarks];
  persist();
  return bookmark;
}

export function removeBookmark(bookmarkId: string) {
  getState().bookmarks = getState().bookmarks.filter((bookmark) => bookmark.id !== bookmarkId);
  persist();
}

export function listNotes(bookId: string) {
  return getState().notes
    .filter((note) => note.bookId === bookId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveNote(input: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>) {
  const now = Date.now();
  const note: Note = {
    ...input,
    id: `${input.bookId}-note-${now}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now,
    updatedAt: now,
  };
  getState().notes = [note, ...getState().notes];
  persist();
  return note;
}

export function removeNote(noteId: string) {
  getState().notes = getState().notes.filter((note) => note.id !== noteId);
  persist();
}
