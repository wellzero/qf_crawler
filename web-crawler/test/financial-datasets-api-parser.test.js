import FinancialDatasetsApiParser from '../src/parsers/financial-datasets-api-parser.js';

describe('FinancialDatasetsApiParser', () => {
  let parser;

  beforeEach(() => {
    parser = new FinancialDatasetsApiParser();
  });

  describe('matches', () => {
    test('should match docs.financialdatasets.ai URLs', () => {
      expect(parser.matches('https://docs.financialdatasets.ai/api/')).toBe(true);
      expect(parser.matches('https://docs.financialdatasets.ai/api/prices')).toBe(true);
    });

    test('should not match other URLs', () => {
      expect(parser.matches('https://financialdatasets.ai')).toBe(false);
      expect(parser.matches('https://docs.financialdatasets.ai')).toBe(false);
    });
  });

  describe('getPriority', () => {
    test('should return 100', () => {
      expect(parser.getPriority()).toBe(100);
    });
  });

  describe('generateFilename', () => {
    test('should generate filename from URL path', () => {
      expect(parser.generateFilename('https://docs.financialdatasets.ai/api/prices')).toBe('prices');
    });

    test('should handle root API page', () => {
      expect(parser.generateFilename('https://docs.financialdatasets.ai/api')).toBe('api_overview');
    });

    test('should handle invalid URLs', () => {
      expect(parser.generateFilename('invalid-url')).toBe('api_doc');
    });
  });
});