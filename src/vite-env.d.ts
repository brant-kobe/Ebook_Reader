import type { BookApi } from '../electron/shared-types';

declare module '*?url' {
  const url: string;
  export default url;
}

declare module 'pdfjs-dist/build/pdf.worker.min.mjs?url' {
  const url: string;
  export default url;
}

declare global {
  interface Window {
    bookApi: BookApi;
  }
}

export {};
