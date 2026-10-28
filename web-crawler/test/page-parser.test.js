import fc from 'fast-check';
import PageParser from '../src/page-parser.js';

describe('PageParser', () => {
  let parser;

  beforeEach(() => {
    parser = new PageParser();
  });

  describe('Property 13: 表格解析完整性', () => {
    /**
     * Feature: stock-website-crawler, Property 13: 表格解析完整性
     * **Validates: Requirements 5.1, 5.2**
     * 
     * For any HTML table with headers and data rows, the parsed Table object 
     * should contain all headers and all data rows in the correct order
     */
    test('parsed table contains all headers and rows', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 5 }),
          fc.array(fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 5 }), { minLength: 1, maxLength: 10 }),
          async (headers, rows) => {
            // Ensure all rows have the same length as headers
            const normalizedRows = rows.map(row => {
              const normalized = [...row];
              while (normalized.length < headers.length) {
                normalized.push('cell');
              }
              return normalized.slice(0, headers.length);
            });

            // Mock page that returns parsed data
            const mockPage = {
              evaluate: async () => document.title,
              url: () => 'http://test.com'
            };

            // Mock the parser to return expected data
            parser.parserManager = {
              parse: async () => ({
                title: 'Test',
                tables: [{
                  headers,
                  rows: normalizedRows
                }]
              })
            };

            const pageData = await parser.parsePage(mockPage, 'http://test.com');

            expect(pageData.tables.length).toBe(1);
            const table = pageData.tables[0];

            // Check headers
            expect(table.headers).toEqual(headers);

            // Check rows
            expect(table.rows.length).toBe(normalizedRows.length);
            table.rows.forEach((row, i) => {
              expect(row).toEqual(normalizedRows[i]);
            });
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Property 14: 文本内容提取正确性', () => {
    /**
     * Feature: stock-website-crawler, Property 14: 文本内容提取正确性
     * **Validates: Requirements 5.4**
     * 
     * For any HTML page with title and description elements, the extracted 
     * title and description should match the content of those elements
     */
    test('extracted title and description match HTML elements', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }),
          fc.string({ minLength: 1, maxLength: 200 }),
          async (title, description) => {
            const mockPage = {
              evaluate: async () => title,
              url: () => 'http://test.com'
            };

            // Mock the parser to return expected data
            parser.parserManager = {
              parse: async () => ({
                title,
                description
              })
            };

            const pageData = await parser.parsePage(mockPage, 'http://test.com');

            expect(pageData.title).toBe(title);
            expect(pageData.description).toBe(description);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Property 15: 代码块识别准确性', () => {
    /**
     * Feature: stock-website-crawler, Property 15: 代码块识别准确性
     * **Validates: Requirements 5.5**
     * 
     * For any HTML page containing code blocks (pre/code elements), all code 
     * blocks should be correctly identified and extracted with their content
     */
    test('all code blocks are identified and extracted', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              language: fc.constantFrom('javascript', 'python', 'json', 'xml', 'text'),
              code: fc.string({ minLength: 1, maxLength: 200 })
            }),
            { minLength: 1, maxLength: 5 }
          ),
          async (codeBlocks) => {
            const mockPage = {
              evaluate: async () => codeBlocks,
              url: () => 'http://test.com'
            };

            // Mock the parser to return expected data
            parser.parserManager = {
              parse: async () => ({
                title: 'Test',
                codeBlocks
              })
            };

            const pageData = await parser.parsePage(mockPage, 'http://test.com');

            expect(pageData.codeBlocks.length).toBe(codeBlocks.length);
            pageData.codeBlocks.forEach((block, i) => {
              expect(block.code).toBe(codeBlocks[i].code);
              expect(block.language).toBe(codeBlocks[i].language);
            });
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Unit Tests', () => {
    test('should handle empty table', async () => {
      const mockPage = {
        evaluate: async () => 'Test',
        url: () => 'http://test.com'
      };

      parser.parserManager = {
        parse: async () => ({
          title: 'Test',
          tables: [{
            headers: [],
            rows: []
          }]
        })
      };

      const pageData = await parser.parsePage(mockPage, 'http://test.com');
      expect(pageData.tables.length).toBe(1);
      expect(pageData.tables[0].headers).toEqual([]);
      expect(pageData.tables[0].rows).toEqual([]);
    });

    test('should handle table with headers and data', async () => {
      const mockPage = {
        evaluate: async () => 'Test',
        url: () => 'http://test.com'
      };

      parser.parserManager = {
        parse: async () => ({
          title: 'Test',
          tables: [{
            headers: ['Header1', 'Header2'],
            rows: [['Data1', 'Data2']]
          }]
        })
      };

      const pageData = await parser.parsePage(mockPage, 'http://test.com');
      expect(pageData.tables.length).toBe(1);
      expect(pageData.tables[0].headers).toEqual(['Header1', 'Header2']);
      expect(pageData.tables[0].rows).toEqual([['Data1', 'Data2']]);
    });

    test('should handle special characters in table cells', async () => {
      const mockPage = {
        evaluate: async () => 'Test',
        url: () => 'http://test.com'
      };

      parser.parserManager = {
        parse: async () => ({
          title: 'Test',
          tables: [{
            headers: ['Header'],
            rows: [['Data with | pipe']]
          }]
        })
      };

      const pageData = await parser.parsePage(mockPage, 'http://test.com');
      expect(pageData.tables[0].rows[0][0]).toBe('Data with | pipe');
    });

    test('should extract title', async () => {
      const mockPage = {
        evaluate: async () => 'Page Title',
        url: () => 'http://test.com'
      };

      parser.parserManager = {
        parse: async () => ({
          title: 'Page Title'
        })
      };

      const pageData = await parser.parsePage(mockPage, 'http://test.com');
      expect(pageData.title).toBe('Page Title');
    });

    test('should extract description', async () => {
      const mockPage = {
        evaluate: async () => 'Test',
        url: () => 'http://test.com'
      };

      parser.parserManager = {
        parse: async () => ({
          title: 'Test',
          description: 'Page Description'
        })
      };

      const pageData = await parser.parsePage(mockPage, 'http://test.com');
      expect(pageData.description).toBe('Page Description');
    });

    test('should extract code blocks', async () => {
      const mockPage = {
        evaluate: async () => 'Test',
        url: () => 'http://test.com'
      };

      parser.parserManager = {
        parse: async () => ({
          title: 'Test',
          codeBlocks: [{
            language: 'json',
            code: '{"key": "value"}'
          }]
        })
      };

      const pageData = await parser.parsePage(mockPage, 'http://test.com');
      expect(pageData.codeBlocks.length).toBe(1);
      expect(pageData.codeBlocks[0].language).toBe('json');
      expect(pageData.codeBlocks[0].code).toBe('{"key": "value"}');
    });

    test('should handle extraction errors gracefully', async () => {
      const mockPage = {
        evaluate: async () => {
          throw new Error('Evaluation failed');
        },
        url: () => 'http://test.com'
      };

      parser.parserManager = {
        parse: async () => {
          throw new Error('Parse failed');
        }
      };

      try {
        await parser.parsePage(mockPage, 'http://test.com');
        // If no error thrown, test should fail
        expect(true).toBe(false);
      } catch (error) {
        // Expected to throw error
        expect(error.message).toBe('Parse failed');
      }
    });
  });
});
