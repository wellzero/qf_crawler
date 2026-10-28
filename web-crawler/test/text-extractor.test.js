import TextExtractor from '../src/parsers/extractors/text-extractor.js';

describe('TextExtractor', () => {
  let extractor;

  beforeEach(() => {
    extractor = new TextExtractor();
  });

  describe('extract', () => {
    test('should extract all text content types', async () => {
      const mockPage = {
        evaluate: async () => ''
      };

      extractor.extractTitle = async () => 'Test Title';
      extractor.extractDescription = async () => 'Description';
      extractor.extractHeadings = async () => [{ level: 1, text: 'Heading' }];
      extractor.extractParagraphs = async () => ['Paragraph'];
      extractor.extractLists = async () => [{ type: 'ul', items: ['item'] }];
      extractor.extractCodeBlocks = async () => [{ language: 'json', code: '{}' }];
      extractor.extractBlockquotes = async () => ['Quote'];
      extractor.extractDefinitionLists = async () => [];
      extractor.extractHorizontalRules = async () => 1;
      extractor.extractMainContentWithOrder = async () => [];

      const context = { page: mockPage };
      const result = await extractor.extract(context);

      expect(result.title).toBe('Test Title');
      expect(result.description).toBe('Description');
      expect(result.headings).toHaveLength(1);
      expect(result.paragraphs).toHaveLength(1);
      expect(result.lists).toHaveLength(1);
    });
  });

  describe('extractTitle', () => {
    test('should extract valid title', async () => {
      const mockPage = {
        evaluate: async () => 'Valid Title'
      };

      const result = await extractor.extractTitle(mockPage);
      expect(result).toBe('Valid Title');
    });

    test('should filter invalid titles', async () => {
      const mockPage = {
        evaluate: async () => ''
      };

      const result = await extractor.extractTitle(mockPage);
      expect(result).toBe('');
    });

    test('should handle errors gracefully', async () => {
      const mockPage = {
        evaluate: async () => { throw new Error('error'); }
      };

      const result = await extractor.extractTitle(mockPage);
      expect(result).toBe('');
    });
  });

  describe('extractDescription', () => {
    test('should extract meta description', async () => {
      const mockPage = {
        evaluate: async () => 'Meta description content'
      };

      const result = await extractor.extractDescription(mockPage);
      expect(result).toBe('Meta description content');
    });

    test('should handle errors gracefully', async () => {
      const mockPage = {
        evaluate: async () => { throw new Error('error'); }
      };

      const result = await extractor.extractDescription(mockPage);
      expect(result).toBe('');
    });
  });

  describe('extractHeadings', () => {
    test('should extract headings', async () => {
      const mockPage = {
        evaluate: async () => [
          { level: 1, text: 'Main Title' },
          { level: 2, text: 'Section' }
        ]
      };

      const result = await extractor.extractHeadings(mockPage);
      expect(result).toHaveLength(2);
      expect(result[0].level).toBe(1);
    });

    test('should handle errors gracefully', async () => {
      const mockPage = {
        evaluate: async () => { throw new Error('error'); }
      };

      const result = await extractor.extractHeadings(mockPage);
      expect(result).toEqual([]);
    });
  });

  describe('extractParagraphs', () => {
    test('should extract paragraphs', async () => {
      const mockPage = {
        evaluate: async () => ['Paragraph 1', 'Paragraph 2']
      };

      const result = await extractor.extractParagraphs(mockPage);
      expect(result).toHaveLength(2);
    });

    test('should handle errors gracefully', async () => {
      const mockPage = {
        evaluate: async () => { throw new Error('error'); }
      };

      const result = await extractor.extractParagraphs(mockPage);
      expect(result).toEqual([]);
    });
  });

  describe('extractLists', () => {
    test('should extract lists', async () => {
      const mockPage = {
        evaluate: async () => [
          { type: 'ul', items: ['item 1', 'item 2'] },
          { type: 'ol', items: ['step 1', 'step 2'] }
        ]
      };

      const result = await extractor.extractLists(mockPage);
      expect(result).toHaveLength(2);
    });

    test('should handle errors gracefully', async () => {
      const mockPage = {
        evaluate: async () => { throw new Error('error'); }
      };

      const result = await extractor.extractLists(mockPage);
      expect(result).toEqual([]);
    });
  });

  describe('extractCodeBlocks', () => {
    test('should extract code blocks', async () => {
      const mockPage = {
        evaluate: async () => [
          { language: 'javascript', code: 'const x = 1;' },
          { language: 'python', code: 'x = 1' }
        ]
      };

      const result = await extractor.extractCodeBlocks(mockPage);
      expect(result).toHaveLength(2);
    });

    test('should handle errors gracefully', async () => {
      const mockPage = {
        evaluate: async () => { throw new Error('error'); }
      };

      const result = await extractor.extractCodeBlocks(mockPage);
      expect(result).toEqual([]);
    });
  });

  describe('extractBlockquotes', () => {
    test('should extract blockquotes', async () => {
      const mockPage = {
        evaluate: async () => ['Quote content']
      };

      const result = await extractor.extractBlockquotes(mockPage);
      expect(result).toHaveLength(1);
    });

    test('should handle errors gracefully', async () => {
      const mockPage = {
        evaluate: async () => { throw new Error('error'); }
      };

      const result = await extractor.extractBlockquotes(mockPage);
      expect(result).toEqual([]);
    });
  });

  describe('extractDefinitionLists', () => {
    test('should extract definition lists', async () => {
      const mockPage = {
        evaluate: async () => [
          [{ term: 'Term 1', definition: 'Definition 1' }]
        ]
      };

      const result = await extractor.extractDefinitionLists(mockPage);
      expect(result).toHaveLength(1);
    });

    test('should handle errors gracefully', async () => {
      const mockPage = {
        evaluate: async () => { throw new Error('error'); }
      };

      const result = await extractor.extractDefinitionLists(mockPage);
      expect(result).toEqual([]);
    });
  });

  describe('extractHorizontalRules', () => {
    test('should count horizontal rules', async () => {
      const mockPage = {
        evaluate: async () => 3
      };

      const result = await extractor.extractHorizontalRules(mockPage);
      expect(result).toBe(3);
    });

    test('should handle errors gracefully', async () => {
      const mockPage = {
        evaluate: async () => { throw new Error('error'); }
      };

      const result = await extractor.extractHorizontalRules(mockPage);
      expect(result).toBe(0);
    });
  });

  describe('extractMainContentWithOrder', () => {
    test('should extract ordered main content', async () => {
      const mockPage = {
        evaluate: async () => [
          { type: 'heading', level: 1, content: 'Title' },
          { type: 'paragraph', content: 'Text' }
        ]
      };

      const result = await extractor.extractMainContentWithOrder(mockPage);
      expect(result).toHaveLength(2);
    });

    test('should handle errors gracefully', async () => {
      const mockPage = {
        evaluate: async () => { throw new Error('error'); }
      };

      const result = await extractor.extractMainContentWithOrder(mockPage);
      expect(result).toEqual([]);
    });
  });
});