import BaseParser from '../src/parsers/base-parser.js';

describe('BaseParser', () => {
  let parser;

  beforeEach(() => {
    parser = new BaseParser();
  });

  test('matches should throw when subclass does not implement', () => {
    expect(() => parser.matches('https://example.com')).toThrow('matches() must be implemented by subclass');
  });

  test('parse should throw when subclass does not implement', async () => {
    await expect(parser.parse({}, 'https://example.com')).rejects.toThrow('parse() must be implemented by subclass');
  });

  test('getPriority returns 0 by default', () => {
    expect(parser.getPriority()).toBe(0);
  });

  test('extractTitle returns empty string on page errors', async () => {
    const mockPage = {
      evaluate: async () => {
        throw new Error('boom');
      }
    };

    await expect(parser.extractTitle(mockPage)).resolves.toBe('');
  });

  test('extractTables returns empty array on page errors', async () => {
    const mockPage = {
      evaluate: async () => {
        throw new Error('boom');
      }
    };

    await expect(parser.extractTables(mockPage)).resolves.toEqual([]);
  });

  test('extractCodeBlocks returns empty array on page errors', async () => {
    const mockPage = {
      evaluate: async () => {
        throw new Error('boom');
      }
    };

    await expect(parser.extractCodeBlocks(mockPage)).resolves.toEqual([]);
  });
});
