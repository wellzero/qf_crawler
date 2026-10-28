import fs from 'fs';
import os from 'os';
import path from 'path';
import LixingerParser from '../src/parsers/lixinger-parser.js';

describe('LixingerParser CSV output', () => {
  const parser = Object.create(LixingerParser.prototype);

  describe('csvEscape', () => {
    test('leaves plain values untouched', () => {
      expect(parser.csvEscape('指标')).toBe('指标');
      expect(parser.csvEscape('-7005833381.00')).toBe('-7005833381.00');
    });

    test('quotes values containing comma, quote or newline', () => {
      expect(parser.csvEscape('a,b')).toBe('"a,b"');
      expect(parser.csvEscape('say "hi"')).toBe('"say ""hi"""');
      expect(parser.csvEscape('line1\nline2')).toBe('"line1\nline2"');
    });

    test('handles null/undefined/numbers', () => {
      expect(parser.csvEscape(null)).toBe('');
      expect(parser.csvEscape(undefined)).toBe('');
      expect(parser.csvEscape(1.5)).toBe('1.5');
    });
  });

  describe('tablesToCSV', () => {
    test('writes header + rows with BOM', () => {
      const csv = parser.tablesToCSV([
        { headers: ['指标', '2026Q2'], rows: [['净利润', '100']] },
      ]);
      expect(csv.charCodeAt(0)).toBe(0xFEFF);
      expect(csv.slice(1)).toBe('指标,2026Q2\n净利润,100\n');
    });

    test('merges tables with identical headers without repeating header', () => {
      const csv = parser.tablesToCSV([
        { headers: ['A', 'B'], rows: [['1', '2']] },
        { headers: ['A', 'B'], rows: [['3', '4']] },
      ]);
      expect(csv.slice(1)).toBe('A,B\n1,2\n3,4\n');
    });

    test('separates tables with different headers by a blank line', () => {
      const csv = parser.tablesToCSV([
        { headers: ['A', 'B'], rows: [['1', '2']] },
        { headers: ['C', 'D'], rows: [['3', '4']] },
      ]);
      expect(csv.slice(1)).toBe('A,B\n1,2\n\nC,D\n3,4\n');
    });
  });

  describe('saveTablesAsCSV', () => {
    let dir;
    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lixinger-csv-'));
    });
    afterEach(() => {
      fs.rmSync(dir, { recursive: true, force: true });
    });

    const tables = [{ headers: ['A', 'B'], rows: [['1', '2']] }];

    test('writes a CSV file and returns its name', async () => {
      const name = await parser.saveTablesAsCSV(dir, 't_0.csv', tables, 'https://x?p=0');
      expect(name).toBe('t_0.csv');
      const content = fs.readFileSync(path.join(dir, 't_0.csv'), 'utf-8');
      expect(content).toContain('A,B\n1,2');
    });

    test('overwrites existing file by default', async () => {
      await parser.saveTablesAsCSV(dir, 't_0.csv', tables, 'https://x?p=0');
      const name = await parser.saveTablesAsCSV(dir, 't_0.csv', tables, 'https://x?p=1');
      expect(name).toBe('t_0.csv');
      expect(fs.readdirSync(dir)).toEqual(['t_0.csv']);
    });

    test('uniqueOnExists adds URL hash instead of overwriting', async () => {
      await parser.saveTablesAsCSV(dir, 't_0.csv', tables, 'https://x?p=0', { uniqueOnExists: true });
      const name = await parser.saveTablesAsCSV(dir, 't_0.csv', tables, 'https://x?p=1', { uniqueOnExists: true });
      expect(name).toMatch(/^t_0_[0-9a-f]{8}\.csv$/);
      expect(fs.readdirSync(dir).sort()).toEqual(['t_0.csv', name].sort());
    });
  });
});
