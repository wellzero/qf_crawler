/**
 * URL工具函数测试
 * 包含Property-Based Tests和Unit Tests
 */

import fc from 'fast-check';
import { toAbsoluteUrl, matchesPattern, filterLinks } from '../src/url-utils.js';

describe('URL Utils', () => {
  // ========== Property-Based Tests ==========
  
  describe('Property 2: URL规则过滤正确性', () => {
    /**
     * **Validates: Requirements 1.2, 4.5**
     * 
     * Property: For any URL list and URL filtering rules (include/exclude patterns),
     * all URLs in the filtered result should match at least one include pattern
     * and not match any exclude pattern
     */
    test('filtered URLs match include patterns and not exclude patterns', () => {
      fc.assert(
        fc.property(
          // 生成URL列表
          fc.array(fc.webUrl(), { minLength: 0, maxLength: 20 }),
          // 生成include规则（简单的字符串模式）
          fc.array(fc.string(), { minLength: 0, maxLength: 5 }),
          // 生成exclude规则
          fc.array(fc.string(), { minLength: 0, maxLength: 5 }),
          (urls, includePatterns, excludePatterns) => {
            const urlRules = {
              include: includePatterns,
              exclude: excludePatterns
            };
            
            const filtered = filterLinks(urls, urlRules);
            
            // 验证每个过滤后的URL都符合规则
            for (const url of filtered) {
              // 如果有include规则，必须至少匹配一个
              if (includePatterns.length > 0) {
                const matchesInclude = includePatterns.some(pattern => {
                  try {
                    return new RegExp(pattern).test(url);
                  } catch {
                    return false;
                  }
                });
                expect(matchesInclude).toBe(true);
              }
              
              // 不能匹配任何exclude规则
              for (const pattern of excludePatterns) {
                try {
                  const regex = new RegExp(pattern);
                  expect(regex.test(url)).toBe(false);
                } catch {
                  // 无效的正则表达式，跳过
                }
              }
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
    
    test('filtered URLs are subset of original URLs', () => {
      fc.assert(
        fc.property(
          fc.array(fc.webUrl(), { minLength: 0, maxLength: 20 }),
          fc.array(fc.string(), { minLength: 0, maxLength: 5 }),
          fc.array(fc.string(), { minLength: 0, maxLength: 5 }),
          (urls, includePatterns, excludePatterns) => {
            const urlRules = {
              include: includePatterns,
              exclude: excludePatterns
            };
            
            const filtered = filterLinks(urls, urlRules);
            
            // 过滤后的URL必须是原始URL的子集
            for (const url of filtered) {
              expect(urls).toContain(url);
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
  
  describe('Property 12: 相对URL转换正确性', () => {
    /**
     * **Validates: Requirements 4.4**
     * 
     * Property: For any relative URL and base URL, converting the relative URL
     * to absolute should produce a valid absolute URL
     */
    test('converted URLs are absolute', () => {
      fc.assert(
        fc.property(
          fc.webUrl(), // base URL
          fc.oneof(
            fc.constant('./page.html'),
            fc.constant('../page.html'),
            fc.constant('/page.html'),
            fc.constant('page.html'),
            fc.constant('?query=1'),
            fc.constant('#anchor')
          ),
          (baseUrl, relativeUrl) => {
            const absoluteUrl = toAbsoluteUrl(relativeUrl, baseUrl);
            
            // 结果应该是绝对URL（以http://或https://开头）
            expect(
              absoluteUrl.startsWith('http://') || 
              absoluteUrl.startsWith('https://')
            ).toBe(true);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
    
    test('absolute URLs remain unchanged', () => {
      fc.assert(
        fc.property(
          fc.webUrl(), // absolute URL
          fc.webUrl(), // base URL
          (absoluteUrl, baseUrl) => {
            const result = toAbsoluteUrl(absoluteUrl, baseUrl);
            
            // 绝对URL应该保持不变
            expect(result).toBe(absoluteUrl);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
  
  // ========== Unit Tests ==========
  
  describe('toAbsoluteUrl', () => {
    const baseUrl = 'https://example.com/path/page.html';
    
    test('converts relative URL with ./', () => {
      expect(toAbsoluteUrl('./other.html', baseUrl))
        .toBe('https://example.com/path/other.html');
    });
    
    test('converts relative URL with ../', () => {
      expect(toAbsoluteUrl('../other.html', baseUrl))
        .toBe('https://example.com/other.html');
    });
    
    test('converts absolute path URL', () => {
      expect(toAbsoluteUrl('/other.html', baseUrl))
        .toBe('https://example.com/other.html');
    });
    
    test('converts URL without prefix', () => {
      expect(toAbsoluteUrl('other.html', baseUrl))
        .toBe('https://example.com/path/other.html');
    });
    
    test('keeps absolute URL unchanged', () => {
      const absoluteUrl = 'https://other.com/page.html';
      expect(toAbsoluteUrl(absoluteUrl, baseUrl)).toBe(absoluteUrl);
    });
    
    test('handles query parameters', () => {
      expect(toAbsoluteUrl('?query=1', baseUrl))
        .toBe('https://example.com/path/page.html?query=1');
    });
    
    test('handles anchors', () => {
      expect(toAbsoluteUrl('#section', baseUrl))
        .toBe('https://example.com/path/page.html#section');
    });
  });
  
  describe('matchesPattern', () => {
    test('matches simple string pattern', () => {
      expect(matchesPattern('https://example.com/api', '.*api.*')).toBe(true);
    });
    
    test('does not match when pattern does not match', () => {
      expect(matchesPattern('https://example.com/page', '.*api.*')).toBe(false);
    });
    
    test('handles invalid regex pattern', () => {
      expect(matchesPattern('https://example.com', '[')).toBe(false);
    });
    
    test('matches with anchors', () => {
      expect(matchesPattern('https://example.com', '^https://example.com$')).toBe(true);
    });
  });
  
  describe('filterLinks', () => {
    test('returns empty array for null/undefined input', () => {
      expect(filterLinks(null, {})).toEqual([]);
      expect(filterLinks(undefined, {})).toEqual([]);
    });
    
    test('returns all URLs when no rules provided', () => {
      const urls = ['https://example.com/1', 'https://example.com/2'];
      expect(filterLinks(urls, {})).toEqual(urls);
      expect(filterLinks(urls, { include: [], exclude: [] })).toEqual(urls);
    });
    
    test('filters by include pattern', () => {
      const urls = [
        'https://example.com/api/v1',
        'https://example.com/page',
        'https://example.com/api/v2'
      ];
      const rules = { include: ['.*api.*'] };
      const filtered = filterLinks(urls, rules);
      
      expect(filtered).toHaveLength(2);
      expect(filtered).toContain('https://example.com/api/v1');
      expect(filtered).toContain('https://example.com/api/v2');
    });
    
    test('filters by exclude pattern', () => {
      const urls = [
        'https://example.com/api/v1',
        'https://example.com/login',
        'https://example.com/api/v2'
      ];
      const rules = { exclude: ['.*login.*'] };
      const filtered = filterLinks(urls, rules);
      
      expect(filtered).toHaveLength(2);
      expect(filtered).not.toContain('https://example.com/login');
    });
    
    test('filters by both include and exclude patterns', () => {
      const urls = [
        'https://example.com/api/login',
        'https://example.com/api/data',
        'https://example.com/page'
      ];
      const rules = {
        include: ['.*api.*'],
        exclude: ['.*login.*']
      };
      const filtered = filterLinks(urls, rules);
      
      expect(filtered).toEqual(['https://example.com/api/data']);
    });
    
    test('handles multiple include patterns', () => {
      const urls = [
        'https://example.com/api/v1',
        'https://example.com/docs/guide',
        'https://example.com/page'
      ];
      const rules = { include: ['.*api.*', '.*docs.*'] };
      const filtered = filterLinks(urls, rules);
      
      expect(filtered).toHaveLength(2);
      expect(filtered).toContain('https://example.com/api/v1');
      expect(filtered).toContain('https://example.com/docs/guide');
    });
    
    test('handles empty rules', () => {
      const urls = ['https://example.com/1', 'https://example.com/2'];
      expect(filterLinks(urls, null)).toEqual(urls);
    });
  });
});
