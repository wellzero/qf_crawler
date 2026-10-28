import { jest } from '@jest/globals';
import ListParser from '../src/parsers/list-parser.js';

describe('ListParser', () => {
  let parser;

  beforeEach(() => {
    parser = new ListParser();
  });

  test('matches 支持分类命中与URL规则命中', () => {
    expect(parser.matches('https://example.com/anything', { classification: { type: 'list_page' } })).toBe(true);
    expect(parser.matches('https://example.com/list/news')).toBe(true);
    expect(parser.matches('https://example.com/category/market')).toBe(true);
    expect(parser.matches('https://example.com/news?page=2')).toBe(true);
  });

  test('matches 在非列表URL时返回 false', () => {
    expect(parser.matches('https://example.com/article/1')).toBe(false);
  });

  test('getPriority 返回 85', () => {
    expect(parser.getPriority()).toBe(85);
  });

  test('parse 应返回列表页结构和统计信息', async () => {
    parser.extractTitle = jest.fn(async () => '列表页标题');

    const evaluateResult = {
      items: [
        { title: '条目A', url: '/a', summary: '摘要A', date: '2024-01-01' },
        { title: '条目B', url: '/b', summary: '', date: '' }
      ],
      pagination: {
        current: '1',
        next: '/list?page=2',
        paginationDetected: true
      }
    };

    const page = {
      evaluate: async () => evaluateResult
    };

    const result = await parser.parse(page, 'https://example.com/list');

    expect(result).toEqual({
      type: 'list-page',
      url: 'https://example.com/list',
      title: '列表页标题',
      items: evaluateResult.items,
      pagination: evaluateResult.pagination,
      listMeta: {
        totalItems: 2
      }
    });
  });
});
