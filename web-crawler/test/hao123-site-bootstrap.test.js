import {
  buildSiteConfig,
  collectInternalHao123Links,
  extractAnchorLinks,
  extractWebsiteEntries,
  normalizeHref,
  resolveToAbsoluteUrl,
  sanitizeHostToName
} from '../src/hao123-site-bootstrap.js';

describe('hao123 site bootstrap helpers', () => {
  test('normalizeHref should normalize protocol-relative URLs and reject unsupported schemes', () => {
    expect(normalizeHref('//example.com/path')).toBe('https://example.com/path');
    expect(normalizeHref('javascript:void(0)')).toBeNull();
    expect(normalizeHref('mailto:test@example.com')).toBeNull();
    expect(normalizeHref('/internal/path')).toBe('/internal/path');
  });

  test('extractAnchorLinks should parse href and plain text title', () => {
    const html = '<a href="/a"><span>新闻</span></a><a href="https://x.com"> X </a>';
    const links = extractAnchorLinks(html);
    expect(links).toEqual([
      { href: '/a', title: '新闻' },
      { href: 'https://x.com', title: 'X' }
    ]);
  });

  test('resolveToAbsoluteUrl should resolve relative URLs', () => {
    expect(resolveToAbsoluteUrl('/foo', 'https://www.hao123.com/a')).toBe('https://www.hao123.com/foo');
  });

  test('extractWebsiteEntries should deduplicate by hostname and ignore hao123 domains', () => {
    const links = [
      { href: 'https://www.baidu.com/', title: '百度' },
      { href: '/channel/news.html', title: '新闻频道' },
      { href: 'https://www.baidu.com/news', title: '百度新闻' },
      { href: '//news.qq.com', title: '腾讯新闻' }
    ];

    const entries = extractWebsiteEntries(links, 'https://www.hao123.com/');
    expect(entries).toHaveLength(2);
    expect(entries.map((item) => item.host)).toEqual(['news.qq.com', 'www.baidu.com']);
  });

  test('collectInternalHao123Links should collect only hao123 pages', () => {
    const links = [
      { href: '/channel/news.html', title: '新闻' },
      { href: 'https://www.hao123.com/game', title: '游戏' },
      { href: 'https://www.baidu.com/', title: '百度' }
    ];

    const internal = collectInternalHao123Links(links, 'https://www.hao123.com/');
    expect(internal.sort()).toEqual([
      'https://www.hao123.com/channel/news.html',
      'https://www.hao123.com/game'
    ]);
  });

  test('buildSiteConfig should output valid crawler config shape', () => {
    const config = buildSiteConfig({
      host: 'www.baidu.com',
      url: 'https://www.baidu.com/',
      title: '百度'
    });

    expect(config.name).toBe('hao123-baidu-com');
    expect(config.seedUrls).toEqual(['https://www.baidu.com/']);
    expect(config.urlRules.include[0]).toContain('www\\.baidu\\.com');
    expect(config.crawler.headless).toBe(true);
    expect(config.output.format).toBe('markdown');
  });

  test('sanitizeHostToName should sanitize common host formats', () => {
    expect(sanitizeHostToName('WWW.Example.COM')).toBe('example-com');
    expect(sanitizeHostToName('sub.domain.co.uk')).toBe('sub-domain-co-uk');
  });
});
