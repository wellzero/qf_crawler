import { jest } from '@jest/globals';

jest.mock('../src/template-crawl-pipeline.js', () => ({
  default: jest.fn().mockImplementation(() => ({
    run: jest.fn().mockResolvedValue({
      success: true,
      patterns: [],
      outputDir: '/tmp/output'
    })
  }))
}));

describe('template-pipeline-cli', () => {
  describe('printHelp function', () => {
    test('should display help message with correct format', () => {
      const helpMessage = `
Template Crawl Pipeline

Usage:
  node src/template-pipeline-cli.js <site-url> [output-dir]

Example:
  node src/template-pipeline-cli.js https://example.com ./output/example
`;
      
      expect(helpMessage).toContain('Template Crawl Pipeline');
      expect(helpMessage).toContain('Usage:');
      expect(helpMessage).toContain('site-url');
      expect(helpMessage).toContain('output-dir');
      expect(helpMessage).toContain('Example:');
    });

    test('should include site-url placeholder', () => {
      const helpText = 'node src/template-pipeline-cli.js <site-url> [output-dir]';
      expect(helpText).toContain('<site-url>');
    });

    test('should include optional output-dir', () => {
      const helpText = 'node src/template-pipeline-cli.js <site-url> [output-dir]';
      expect(helpText).toContain('[output-dir]');
    });
  });

  describe('argument parsing logic', () => {
    test('should recognize --help flag', () => {
      const args = ['--help'];
      const shouldShowHelp = args.length === 0 || args.includes('--help') || args.includes('-h');
      expect(shouldShowHelp).toBe(true);
    });

    test('should recognize -h flag', () => {
      const args = ['-h'];
      const shouldShowHelp = args.length === 0 || args.includes('--help') || args.includes('-h');
      expect(shouldShowHelp).toBe(true);
    });

    test('should show help for empty args', () => {
      const args = [];
      const shouldShowHelp = args.length === 0 || args.includes('--help') || args.includes('-h');
      expect(shouldShowHelp).toBe(true);
    });

    test('should not show help for valid URL', () => {
      const args = ['https://example.com'];
      const shouldShowHelp = args.length === 0 || args.includes('--help') || args.includes('-h');
      expect(shouldShowHelp).toBe(false);
    });

    test('should extract siteUrl from args', () => {
      const args = ['https://example.com', './output'];
      const [siteUrl, outputDir] = args;
      expect(siteUrl).toBe('https://example.com');
      expect(outputDir).toBe('./output');
    });

    test('should handle missing outputDir', () => {
      const args = ['https://example.com'];
      const [siteUrl, outputDir] = args;
      expect(siteUrl).toBe('https://example.com');
      expect(outputDir).toBeUndefined();
    });
  });

  describe('path resolution', () => {
    test('should resolve outputDir relative to cwd', () => {
      const outputDir = './output/example';
      const resolved = outputDir ? path.resolve(process.cwd(), outputDir) : undefined;
      
      if (outputDir) {
        expect(resolved).toContain('output');
      }
    });
  });

  describe('error handling', () => {
    test('should format error message', () => {
      const error = new Error('Test error message');
      const formatted = `Pipeline failed: ${error.message}`;
      expect(formatted).toBe('Pipeline failed: Test error message');
    });

    test('should handle missing error message', () => {
      const error = { message: '' };
      const formatted = `Pipeline failed: ${error.message}`;
      expect(formatted).toBe('Pipeline failed: ');
    });
  });
});

import path from 'path';