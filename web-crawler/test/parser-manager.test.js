import ParserManager from '../src/parsers/parser-manager.js';
import GenericParser from '../src/parsers/generic-parser.js';

describe('ParserManager', () => {
  let manager;

  beforeEach(async () => {
    manager = new ParserManager();
    await manager.init();
  });

  test('should register all default parsers', () => {
    expect(manager.parsers.length).toBeGreaterThan(0);
  });

  test('should return GenericParser for unknown URLs', async () => {
    const parser = await manager.selectParser('https://example.com/unknown/page');
    // TableOnlyParser or GenericParser both acceptable since TableOnlyParser delegates to GenericParser
    expect(['TableOnlyParser', 'GenericParser']).toContain(parser.constructor.name);
  });

  test('should select parser based on URL pattern match', async () => {
    // Test with a known parser URL pattern
    const finnhubUrl = 'https://finnhub.io/docs/api/some-endpoint';
    const parser = await manager.selectParser(finnhubUrl);

    // Should match FinnhubApiParser
    expect(parser.constructor.name).toBe('FinnhubApiParser');
  });

  test('should return GenericParser as fallback', async () => {
    const parser = await manager.selectParser('https://random-site.com/page');
    // TableOnlyParser acts as fallback (priority 5) and delegates to GenericParser internally
    expect(['TableOnlyParser', 'GenericParser']).toContain(parser.constructor.name);
  });

  test('parsers should be sorted by priority', async () => {
    for (let i = 0; i < manager.parsers.length - 1; i++) {
      const currentPriority = manager.parsers[i].getPriority();
      const nextPriority = manager.parsers[i + 1].getPriority();
      expect(currentPriority).toBeGreaterThanOrEqual(nextPriority);
    }
  });

  test('register should add parser and maintain priority order', async () => {
    const initialCount = manager.parsers.length;

    // Create a mock parser with high priority
    const mockParser = {
      matches: () => false,
      parse: async () => ({ type: 'mock' }),
      getPriority: () => 1000
    };

    manager.register(mockParser);

    expect(manager.parsers.length).toBe(initialCount + 1);
    expect(manager.parsers[0]).toBe(mockParser); // Highest priority should be first
  });

  test('selectParser should return first matching parser', async () => {
    // GenericParser matches everything but has lowest priority
    const genericUrl = 'https://example.com/generic/page';
    const parser = await manager.selectParser(genericUrl);

    // TableOnlyParser or GenericParser both acceptable
    expect(['TableOnlyParser', 'GenericParser']).toContain(parser.constructor.name);
  });

  test('parse should delegate to selected parser', async () => {
    const mockPage = {};
    const url = 'https://example.com/test';

    // Get the selected parser
    const selectedParser = await manager.selectParser(url);

    // Mock the parse method
    const originalParse = selectedParser.parse;
    selectedParser.parse = async () => ({ type: 'test', url });

    const result = await manager.parse(mockPage, url, {});

    expect(result.url).toBe(url);

    // Restore original parse
    selectedParser.parse = originalParse;
  });
});