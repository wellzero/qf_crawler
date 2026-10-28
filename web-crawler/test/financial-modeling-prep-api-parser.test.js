import FinancialModelingPrepApiParser from '../src/parsers/financial-modeling-prep-api-parser.js';

describe('FinancialModelingPrepApiParser', () => {
  let parser;

  beforeEach(() => {
    parser = new FinancialModelingPrepApiParser();
  });

  describe('matches', () => {
    test('should match site.financialmodelingprep.com developer docs URLs', () => {
      expect(parser.matches('https://site.financialmodelingprep.com/developer/docs')).toBe(true);
      expect(parser.matches('https://site.financialmodelingprep.com/developer/docs/company-profile')).toBe(true);
    });

    test('should not match other URLs', () => {
      expect(parser.matches('https://financialmodelingprep.com')).toBe(false);
    });
  });

  describe('getPriority', () => {
    test('should return 100', () => {
      expect(parser.getPriority()).toBe(100);
    });
  });

  describe('generateFilename', () => {
    test('should generate filename from URL path', () => {
      expect(parser.generateFilename('https://site.financialmodelingprep.com/developer/docs/company-profile')).toBe('company-profile');
    });

    test('should use hash for filename', () => {
      expect(parser.generateFilename('https://site.financialmodelingprep.com/developer/docs#profile')).toBe('profile');
    });
  });
});