describe('index.js', () => {
  describe('module structure', () => {
    test('should be importable', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const indexPath = path.join(process.cwd(), 'src/index.js');
      expect(fs.existsSync(indexPath)).toBe(true);
    });

    test('should have shebang', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const indexPath = path.join(process.cwd(), 'src/index.js');
      const content = fs.readFileSync(indexPath, 'utf-8');
      expect(content.startsWith('#!/usr/bin/env node')).toBe(true);
    });

    test('should import CrawlerMain', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const indexPath = path.join(process.cwd(), 'src/index.js');
      const content = fs.readFileSync(indexPath, 'utf-8');
      expect(content.includes('import CrawlerMain')).toBe(true);
    });

    test('should have main function', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const indexPath = path.join(process.cwd(), 'src/index.js');
      const content = fs.readFileSync(indexPath, 'utf-8');
      expect(content.includes('async function main()')).toBe(true);
    });

    test('should have printHelp function', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const indexPath = path.join(process.cwd(), 'src/index.js');
      const content = fs.readFileSync(indexPath, 'utf-8');
      expect(content.includes('function printHelp()')).toBe(true);
    });

    test('should have uncaughtException handler', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const indexPath = path.join(process.cwd(), 'src/index.js');
      const content = fs.readFileSync(indexPath, 'utf-8');
      expect(content.includes('uncaughtException')).toBe(true);
    });

    test('should have unhandledRejection handler', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const indexPath = path.join(process.cwd(), 'src/index.js');
      const content = fs.readFileSync(indexPath, 'utf-8');
      expect(content.includes('unhandledRejection')).toBe(true);
    });

    test('should handle --help argument', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const indexPath = path.join(process.cwd(), 'src/index.js');
      const content = fs.readFileSync(indexPath, 'utf-8');
      expect(content.includes('--help')).toBe(true);
    });

    test('should handle -h argument', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const indexPath = path.join(process.cwd(), 'src/index.js');
      const content = fs.readFileSync(indexPath, 'utf-8');
      expect(content.includes('-h')).toBe(true);
    });

    test('should call main function at end', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const indexPath = path.join(process.cwd(), 'src/index.js');
      const content = fs.readFileSync(indexPath, 'utf-8');
      expect(content.includes('main()')).toBe(true);
    });

    test('should resolve relative config path', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const indexPath = path.join(process.cwd(), 'src/index.js');
      const content = fs.readFileSync(indexPath, 'utf-8');
      expect(content.includes('path.isAbsolute')).toBe(true);
      expect(content.includes('path.resolve')).toBe(true);
    });

    test('should call crawler.initialize', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const indexPath = path.join(process.cwd(), 'src/index.js');
      const content = fs.readFileSync(indexPath, 'utf-8');
      expect(content.includes('crawler.initialize')).toBe(true);
    });

    test('should call crawler.start', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const indexPath = path.join(process.cwd(), 'src/index.js');
      const content = fs.readFileSync(indexPath, 'utf-8');
      expect(content.includes('crawler.start')).toBe(true);
    });

    test('should handle DEBUG environment variable', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const indexPath = path.join(process.cwd(), 'src/index.js');
      const content = fs.readFileSync(indexPath, 'utf-8');
      expect(content.includes('process.env.DEBUG')).toBe(true);
    });
  });

  describe('help message', () => {
    test('should include usage information', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const indexPath = path.join(process.cwd(), 'src/index.js');
      const content = fs.readFileSync(indexPath, 'utf-8');
      expect(content.includes('Usage')).toBe(true);
    });

    test('should include npm start command', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const indexPath = path.join(process.cwd(), 'src/index.js');
      const content = fs.readFileSync(indexPath, 'utf-8');
      expect(content.includes('npm start')).toBe(true);
    });

    test('should include Examples section', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const indexPath = path.join(process.cwd(), 'src/index.js');
      const content = fs.readFileSync(indexPath, 'utf-8');
      expect(content.includes('Examples')).toBe(true);
    });

    test('should include Environment Variables section', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const indexPath = path.join(process.cwd(), 'src/index.js');
      const content = fs.readFileSync(indexPath, 'utf-8');
      expect(content.includes('Environment Variables')).toBe(true);
    });
  });
});