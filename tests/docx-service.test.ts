import { describe, expect, it } from 'vitest';
import { extractWordText } from '../electron/services/docx-service';

describe('extractWordText', () => {
  it('preserves paragraphs, line breaks, tabs, and XML entities', () => {
    const xml = [
      '<w:document><w:body>',
      '<w:p><w:r><w:t>Hello &amp; &#x4e16;&#x754c;</w:t></w:r><w:tab/><w:r><w:t>Word</w:t></w:r></w:p>',
      '<w:p><w:r><w:t>Next</w:t><w:br/><w:t>line</w:t></w:r></w:p>',
      '</w:body></w:document>',
    ].join('');

    expect(extractWordText(xml)).toBe('Hello & 世界\tWord\nNext\nline');
  });
});
