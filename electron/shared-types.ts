export type BookFormat = 'pdf' | 'txt' | 'docx' | 'epub';

export interface PdfProgress {
  kind: 'pdf';
  page: number;
  pageCount?: number;
}

export interface TxtProgress {
  kind: 'txt';
  scrollRatio: number;
}

export interface EpubProgress {
  kind: 'epub';
  chapterHref: string;
  scrollRatio: number;
}

export interface EpubChapter {
  href: string;
  title: string;
  html: string;
}

export interface EpubBookContent {
  title: string;
  chapters: EpubChapter[];
}

export type BookProgress = PdfProgress | TxtProgress | EpubProgress;

export interface BookRecord {
  id: string;
  path: string;
  format: BookFormat;
  title: string;
  size: number;
  modifiedAt: number;
  addedAt: number;
  lastOpenedAt: number;
  available: boolean;
  progress: BookProgress;
}

export interface ReaderSettings {
  fontSize: number;
  lineHeight: number;
  margin: number;
  theme: 'light' | 'dark' | 'sepia';
  readerBackgroundColor: string;
}

export interface Bookmark {
  id: string;
  bookId: string;
  label: string;
  location: number;
  createdAt: number;
}

export interface Note {
  id: string;
  bookId: string;
  location: number;
  chapterHref?: string;
  locationLabel: string;
  quote: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface ApiResult<T> {
  ok: true;
  data: T;
}

export interface ApiError {
  ok: false;
  error: string;
}

export type ApiResponse<T> = ApiResult<T> | ApiError;

export interface BookApi {
  onImportResult: (callback: (response: ApiResponse<BookRecord>) => void) => () => void;
  chooseFile: () => Promise<ApiResponse<BookRecord>>;
  listBooks: () => Promise<ApiResponse<BookRecord[]>>;
  removeBook: (bookId: string) => Promise<ApiResponse<void>>;
  readText: (bookId: string) => Promise<ApiResponse<{ text: string; encoding: string }>>;
  readEpub: (bookId: string) => Promise<ApiResponse<EpubBookContent>>;
  readBinary: (bookId: string) => Promise<ApiResponse<Uint8Array>>;
  saveProgress: (bookId: string, progress: BookProgress) => Promise<ApiResponse<BookRecord>>;
  getSettings: () => Promise<ApiResponse<ReaderSettings>>;
  setSettings: (settings: ReaderSettings) => Promise<ApiResponse<ReaderSettings>>;
  listBookmarks: (bookId: string) => Promise<ApiResponse<Bookmark[]>>;
  saveBookmark: (bookmark: Omit<Bookmark, 'id' | 'createdAt'>) => Promise<ApiResponse<Bookmark>>;
  removeBookmark: (bookmarkId: string) => Promise<ApiResponse<void>>;
  listNotes: (bookId: string) => Promise<ApiResponse<Note[]>>;
  saveNote: (note: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>) => Promise<ApiResponse<Note>>;
  removeNote: (noteId: string) => Promise<ApiResponse<void>>;
}
