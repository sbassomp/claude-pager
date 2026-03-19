import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, markdownToHtml } from '../html.js';

describe('html utils', () => {
  describe('escapeHtml', () => {
    it('should escape &, <, >', () => {
      assert.equal(escapeHtml('<b>test & "value"</b>'), '&lt;b&gt;test &amp; "value"&lt;/b&gt;');
    });

    it('should handle empty string', () => {
      assert.equal(escapeHtml(''), '');
    });
  });

  describe('markdownToHtml', () => {
    it('should convert bold markdown', () => {
      const result = markdownToHtml('**bold** text');
      assert.ok(result.includes('<b>bold</b>'));
    });

    it('should convert code blocks', () => {
      const result = markdownToHtml('```\ncode\n```');
      assert.ok(result.includes('<pre>'));
      assert.ok(result.includes('code'));
    });

    it('should convert inline code', () => {
      const result = markdownToHtml('use `command` here');
      assert.ok(result.includes('<code>command</code>'));
    });

    it('should convert headings', () => {
      const result = markdownToHtml('## Title');
      assert.ok(result.includes('<b>Title</b>'));
    });

    it('should convert list items', () => {
      const result = markdownToHtml('- item one');
      assert.ok(result.includes('• item one'));
    });
  });
});
