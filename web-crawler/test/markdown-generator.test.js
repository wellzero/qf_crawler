import fs from 'fs';
import path from 'path';
import MarkdownGenerator from '../src/parsers/markdown-generator.js';

describe('MarkdownGenerator', () => {
  let generator;
  const testOutputDir = './test-output';

  beforeEach(() => {
    generator = new MarkdownGenerator();
  });

  afterEach(() => {
    // Clean up test output directory
    if (fs.existsSync(testOutputDir)) {
      fs.rmSync(testOutputDir, { recursive: true, force: true });
    }
  });

  describe('Unit Tests', () => {
    test('should generate markdown with title', () => {
      const pageData = {
        url: 'https://example.com',
        title: 'Test Page',
        briefDesc: 'Test description',
        requestUrl: 'https://api.example.com',
        requestMethod: 'POST',
        params: [],
        apiExamples: [],
        responseData: { description: '', table: [] }
      };

      const markdown = generator.generate(pageData);

      expect(markdown).toContain('# Test Page');
    });

    test('should generate markdown for API doc type', () => {
      const pageData = {
        type: 'api-doc',
        url: 'https://example.com/api/test',
        title: 'Test API',
        api: {
          endpoint: '/api/test',
          method: 'GET',
          description: 'Test API endpoint'
        },
        parameters: [
          { name: 'param1', type: 'string', required: true, description: 'First parameter' }
        ],
        codeExamples: [
          { language: 'javascript', code: 'fetch("/api/test")' }
        ],
        response: {
          fields: [
            { name: 'id', type: 'number', description: 'ID field' }
          ]
        }
      };

      const markdown = generator.generate(pageData);

      expect(markdown).toContain('# Test API');
    });

    test('should generate markdown for generic type', () => {
      const pageData = {
        type: 'generic',
        url: 'https://example.com/page',
        title: 'Generic Page',
        headings: [{ level: 1, text: 'Main Title' }],
        paragraphs: ['First paragraph', 'Second paragraph'],
        tables: [],
        codeBlocks: []
      };

      const markdown = generator.generate(pageData);

      expect(markdown).toContain('Generic Page');
    });

    test('should sanitize rsshub container markers and keep sourceCode field', () => {
      const pageData = {
        type: 'rsshub-route',
        url: 'https://docs.rsshub.app/routes/ft',
        title: 'Financial Times',
        routePath: 'ft',
        routeInfo: {
          path: '/ft/myft/:key',
          author: 'HenryQW',
          example: 'https://rsshub.app/ft/myft/rss-key',
          sourceCode: 'https://github.com/DIYgod/RSSHub'
        },
        parameters: [
          { name: 'key', required: true, default: '', description: 'the key' }
        ],
        lists: [
          { type: 'ul', items: ['Importing', ':::', '::: tip', 'Visit ft.com'] }
        ],
        routes: [],
        codeBlocks: [],
        rawContent: 'Intro\n::: tip\ncontent\n:::',
      };

      const markdown = generator.generate(pageData);

      expect(markdown).toContain('**源代码**: https://github.com/DIYgod/RSSHub');
      expect(markdown).not.toContain('\n:::');
    });

    test('should convert table to markdown format', () => {
      const table = {
        headers: ['Name', 'Age'],
        rows: [
          ['Alice', '30'],
          ['Bob', '25']
        ]
      };

      const markdown = generator.tableToMarkdown(table);

      expect(markdown).toContain('| Name | Age |');
      expect(markdown).toContain('| --- | --- |');
      expect(markdown).toContain('| Alice | 30 |');
      expect(markdown).toContain('| Bob | 25 |');
    });

    test('should handle empty table', () => {
      const table = {
        headers: [],
        rows: []
      };

      const markdown = generator.tableToMarkdown(table);
      expect(markdown).toBe('');
    });

    test('should escape pipe characters in table cells', () => {
      const table = {
        headers: ['Data'],
        rows: [['Value | with | pipes']]
      };

      const markdown = generator.tableToMarkdown(table);
      expect(markdown).toContain('Value \\| with \\| pipes');
    });

    test('should convert code block to markdown format', () => {
      const codeBlock = {
        language: 'javascript',
        code: 'console.log("Hello");'
      };

      const markdown = generator.codeBlockToMarkdown(codeBlock);

      expect(markdown).toBe('```javascript\nconsole.log("Hello");\n```');
    });

    test('should generate safe filename', () => {
      expect(generator.safeFilename('Test Page')).toBe('Test_Page');
      expect(generator.safeFilename('Test/Page')).toBe('Test_Page');
      expect(generator.safeFilename('Test:Page?')).toBe('Test_Page');
      expect(generator.safeFilename('Test|Page*')).toBe('Test_Page');
      expect(generator.safeFilename('')).toBe('untitled');
      expect(generator.safeFilename(null)).toBe('untitled');
    });

    test('should add H1 title when parser markdown has no heading', () => {
      const markdown = generator.normalizeMarkdownOutput('纯文本内容\n\n第二段', { title: '统一标题测试' });
      expect(markdown).toContain('# 统一标题测试');
      expect(markdown).toContain('纯文本内容');
    });

    test('should normalize extra blank lines in generated markdown', () => {
      const markdown = generator.normalizeMarkdownOutput('# 已有标题\n\n\n\n正文', { title: '空行标准化测试' });
      expect(markdown).toContain('# 已有标题');
      expect(markdown).not.toContain('\n\n\n');
    });

    test('should save markdown to file', () => {
      const content = '# Test\n\nContent';
      const filename = 'test.md';

      const filepath = generator.saveToFile(content, filename, testOutputDir);

      expect(fs.existsSync(filepath)).toBe(true);
      const savedContent = fs.readFileSync(filepath, 'utf-8');
      expect(savedContent).toBe(content);
    });

    test('should create output directory if not exists', () => {
      const content = '# Test';
      const filename = 'test.md';
      const newDir = path.join(testOutputDir, 'subdir');

      generator.saveToFile(content, filename, newDir);

      expect(fs.existsSync(newDir)).toBe(true);
    });

    test('should handle newlines in table cells', () => {
      const table = {
        headers: ['Data'],
        rows: [['Line1\nLine2']]
      };

      const markdown = generator.tableToMarkdown(table);
      expect(markdown).toContain('Line1<br>Line2');
    });
  });

  describe('generateUnified', () => {
    test('should generate markdown with API endpoint info', () => {
      const pageData = {
        title: 'Test API',
        url: 'https://api.example.com/test',
        api: {
          endpoint: '/test',
          method: 'POST',
          description: 'Test endpoint'
        },
        parameters: [
          { name: 'id', type: 'string', required: true, description: 'ID parameter' }
        ],
        codeExamples: [
          { language: 'bash', code: 'curl -X POST /test' }
        ],
        response: {
          description: 'Success response',
          fields: [
            { name: 'status', type: 'string', description: 'Status field' }
          ]
        }
      };

      const markdown = generator.generate(pageData);

      expect(markdown).toContain('# Test API');
      expect(markdown).toContain('/test');
    });
  });

  describe('generateGeneric', () => {
    test('should handle page with tables', () => {
      const pageData = {
        type: 'generic',
        url: 'https://example.com/data',
        title: 'Data Page',
        tables: [
          {
            headers: ['Column1', 'Column2'],
            rows: [['Value1', 'Value2']]
          }
        ],
        paragraphs: ['Some text'],
        codeBlocks: [],
        lists: []
      };

      const markdown = generator.generate(pageData);

      expect(markdown).toContain('| Column1 | Column2 |');
      expect(markdown).toContain('Data Page');
    });

    test('should handle page with code blocks', () => {
      const pageData = {
        type: 'generic',
        url: 'https://example.com/code',
        title: 'Code Page',
        codeBlocks: [
          { language: 'python', code: 'print("hello")' }
        ],
        paragraphs: [],
        tables: [],
        lists: []
      };

      const markdown = generator.generate(pageData);

      expect(markdown).toContain('```python');
      expect(markdown).toContain('print("hello")');
    });
  });

  describe('safeFilename', () => {
    test('should handle special characters', () => {
      // Special characters are replaced with underscore, then consecutive underscores are merged
      expect(generator.safeFilename('file<>:"/\\|?*name')).toBe('file_name');
    });

    test('should handle very long filenames', () => {
      const longTitle = 'A'.repeat(300);
      const safe = generator.safeFilename(longTitle);
      expect(safe.length).toBeLessThanOrEqual(200);
    });

    test('should handle unicode characters', () => {
      const safe = generator.safeFilename('中文标题');
      expect(safe).toBe('中文标题');
    });
  });
});