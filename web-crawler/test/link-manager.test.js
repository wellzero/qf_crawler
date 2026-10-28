import LinkManager from '../src/link-manager.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fc from 'fast-check';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('LinkManager', () => {
  let linkManager;
  const testLinksDir = path.join(__dirname, 'test-links');

  beforeAll(() => {
    // 创建测试链接目录
    if (!fs.existsSync(testLinksDir)) {
      fs.mkdirSync(testLinksDir, { recursive: true });
    }
  });

  beforeEach(() => {
    linkManager = new LinkManager();
  });

  afterAll(() => {
    // 清理测试链接目录
    if (fs.existsSync(testLinksDir)) {
      fs.rmSync(testLinksDir, { recursive: true, force: true });
    }
  });


  describe('Index optimization behavior', () => {
    test('should keep index in sync when loading and adding links', () => {
      const tempFilePath = path.join(testLinksDir, `indexed-links-${Date.now()}.txt`);
      const rawLinks = [
        { url: 'https://example.com/a', status: 'unfetched', addedAt: Date.now(), fetchedAt: null, retryCount: 0, error: null },
        { url: 'https://example.com/b', status: 'unfetched', addedAt: Date.now(), fetchedAt: null, retryCount: 0, error: null }
      ];

      try {
        linkManager.saveLinks(tempFilePath, rawLinks);
        linkManager.loadLinks(tempFilePath);

        linkManager.updateLinkStatus('https://example.com/a', 'fetched');
        linkManager.incrementRetryCount('https://example.com/b');
        linkManager.addLink('https://example.com/c', 'unfetched');

        const linkA = linkManager.links.find(link => link.url === 'https://example.com/a');
        const linkB = linkManager.links.find(link => link.url === 'https://example.com/b');
        const linkC = linkManager.links.find(link => link.url === 'https://example.com/c');

        expect(linkA.status).toBe('fetched');
        expect(linkB.retryCount).toBe(1);
        expect(linkC).toBeDefined();
      } finally {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
      }
    });
  });

  describe('Property-Based Tests', () => {
    /**
     * **Property 5: 链接文件读写一致性**
     * **Validates: Requirements 2.1, 2.2**
     * 
     * For any list of links, saving the links to a file and then loading them 
     * back should produce an equivalent list (round-trip property)
     */
    test('Property 5: 链接文件读写一致性 - 保存后读取应得到相同的链接列表', () => {
      // 定义链接对象生成器
      const linkArbitrary = fc.record({
        url: fc.webUrl(),
        status: fc.constantFrom('unfetched', 'fetching', 'fetched', 'failed'),
        addedAt: fc.integer({ min: 1000000000000, max: Date.now() }),
        fetchedAt: fc.oneof(
          fc.constant(null),
          fc.integer({ min: 1000000000000, max: Date.now() })
        ),
        retryCount: fc.integer({ min: 0, max: 10 }),
        error: fc.oneof(
          fc.constant(null),
          fc.string()
        )
      });

      // 定义链接列表生成器
      const linksArrayArbitrary = fc.array(linkArbitrary, { minLength: 0, maxLength: 20 });

      fc.assert(
        fc.property(linksArrayArbitrary, (links) => {
          // 创建临时文件路径
          const tempFilePath = path.join(testLinksDir, `links-${Date.now()}-${Math.random()}.txt`);

          try {
            // 保存链接到文件
            linkManager.saveLinks(tempFilePath, links);

            // 从文件加载链接
            const loadedLinks = linkManager.loadLinks(tempFilePath);

            // 验证加载的链接数量与原始链接数量相同
            expect(loadedLinks.length).toBe(links.length);

            // 验证每个链接的所有字段都相同
            for (let i = 0; i < links.length; i++) {
              expect(loadedLinks[i].url).toBe(links[i].url);
              expect(loadedLinks[i].status).toBe(links[i].status);
              expect(loadedLinks[i].addedAt).toBe(links[i].addedAt);
              expect(loadedLinks[i].fetchedAt).toBe(links[i].fetchedAt);
              expect(loadedLinks[i].retryCount).toBe(links[i].retryCount);
              expect(loadedLinks[i].error).toBe(links[i].error);
            }

            // 验证整体相等性
            expect(loadedLinks).toEqual(links);
          } finally {
            // 清理临时文件
            if (fs.existsSync(tempFilePath)) {
              fs.unlinkSync(tempFilePath);
            }
          }
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Property 5: 链接文件读写一致性 - 空列表测试**
     * **Validates: Requirements 2.1, 2.2**
     * 
     * Saving and loading an empty list should work correctly
     */
    test('Property 5: 链接文件读写一致性 - 空列表应正确处理', () => {
      const tempFilePath = path.join(testLinksDir, `empty-links-${Date.now()}.txt`);

      try {
        // 保存空列表
        linkManager.saveLinks(tempFilePath, []);

        // 加载空列表
        const loadedLinks = linkManager.loadLinks(tempFilePath);

        // 验证结果为空数组
        expect(loadedLinks).toEqual([]);
        expect(loadedLinks.length).toBe(0);
      } finally {
        // 清理临时文件
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
      }
    });

    /**
     * **Property 5: 链接文件读写一致性 - 文件不存在时的处理**
     * **Validates: Requirements 2.1**
     * 
     * Loading from a non-existent file should return an empty array
     */
    test('Property 5: 链接文件读写一致性 - 文件不存在时应返回空数组', () => {
      const nonExistentPath = path.join(testLinksDir, `non-existent-${Date.now()}.txt`);

      // 确保文件不存在
      if (fs.existsSync(nonExistentPath)) {
        fs.unlinkSync(nonExistentPath);
      }

      // 加载不存在的文件
      const loadedLinks = linkManager.loadLinks(nonExistentPath);

      // 验证返回空数组
      expect(loadedLinks).toEqual([]);
      expect(loadedLinks.length).toBe(0);
    });

    /**
     * **Property 6: URL去重不变性**
     * **Validates: Requirements 2.3**
     * 
     * For any link list containing duplicate URLs, after deduplication, 
     * the resulting list should contain no duplicate URLs and preserve 
     * at least one instance of each unique URL
     */
    test('Property 6: URL去重不变性 - 去重后无重复且保留所有唯一URL', () => {
      // 定义链接对象生成器
      const linkArbitrary = fc.record({
        url: fc.webUrl(),
        status: fc.constantFrom('unfetched', 'fetching', 'fetched', 'failed'),
        addedAt: fc.integer({ min: 1000000000000, max: Date.now() }),
        fetchedAt: fc.oneof(
          fc.constant(null),
          fc.integer({ min: 1000000000000, max: Date.now() })
        ),
        retryCount: fc.integer({ min: 0, max: 10 }),
        error: fc.oneof(
          fc.constant(null),
          fc.string()
        )
      });

      // 生成包含重复URL的链接列表
      // 策略：生成一些链接，然后随机复制一些来创建重复
      const linksWithDuplicatesArbitrary = fc.array(linkArbitrary, { minLength: 1, maxLength: 10 })
        .chain(baseLinks => {
          // 随机选择一些链接进行复制
          return fc.array(fc.integer({ min: 0, max: baseLinks.length - 1 }), { maxLength: 5 })
            .map(indicesToDuplicate => {
              const allLinks = [...baseLinks];
              // 复制选中的链接（可能修改其他字段，但URL相同）
              for (const idx of indicesToDuplicate) {
                allLinks.push({
                  ...baseLinks[idx],
                  addedAt: Date.now() + Math.random() * 1000,
                  retryCount: Math.floor(Math.random() * 5)
                });
              }
              return allLinks;
            });
        });

      fc.assert(
        fc.property(linksWithDuplicatesArbitrary, (links) => {
          // 记录原始的唯一URL集合
          const originalUniqueUrls = new Set(links.map(link => link.url));

          // 设置链接列表并执行去重
          linkManager.links = [...links]; // 复制数组以避免修改原始数据
          linkManager.deduplicateAndSort();

          const deduplicatedLinks = linkManager.links;

          // 验证1：去重后没有重复的URL
          const deduplicatedUrls = deduplicatedLinks.map(link => link.url);
          const uniqueDeduplicatedUrls = new Set(deduplicatedUrls);
          expect(deduplicatedUrls.length).toBe(uniqueDeduplicatedUrls.size);

          // 验证2：所有原始的唯一URL都被保留
          const deduplicatedUrlSet = new Set(deduplicatedUrls);
          for (const originalUrl of originalUniqueUrls) {
            expect(deduplicatedUrlSet.has(originalUrl)).toBe(true);
          }

          // 验证3：去重后的URL数量等于原始唯一URL数量
          expect(deduplicatedLinks.length).toBe(originalUniqueUrls.size);

          // 验证4：结果是按URL排序的
          for (let i = 1; i < deduplicatedLinks.length; i++) {
            expect(deduplicatedLinks[i].url.localeCompare(deduplicatedLinks[i - 1].url)).toBeGreaterThanOrEqual(0);
          }
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Property 6: URL去重不变性 - 边缘情况：所有URL都相同**
     * **Validates: Requirements 2.3**
     * 
     * When all links have the same URL, deduplication should result in exactly one link
     */
    test('Property 6: URL去重不变性 - 所有URL相同时应只保留一个', () => {
      fc.assert(
        fc.property(
          fc.webUrl(),
          fc.integer({ min: 2, max: 10 }),
          (url, count) => {
            // 创建多个具有相同URL的链接
            const links = Array.from({ length: count }, (_, i) => ({
              url,
              status: i % 2 === 0 ? 'unfetched' : 'fetched',
              addedAt: Date.now() + i,
              fetchedAt: null,
              retryCount: i,
              error: null
            }));

            linkManager.links = links;
            linkManager.deduplicateAndSort();

            // 验证只保留一个链接
            expect(linkManager.links.length).toBe(1);
            expect(linkManager.links[0].url).toBe(url);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Property 6: URL去重不变性 - 边缘情况：空列表**
     * **Validates: Requirements 2.3**
     * 
     * Deduplicating an empty list should result in an empty list
     */
    test('Property 6: URL去重不变性 - 空列表去重后仍为空', () => {
      linkManager.links = [];
      linkManager.deduplicateAndSort();

      expect(linkManager.links).toEqual([]);
      expect(linkManager.links.length).toBe(0);
    });

    /**
     * **Property 6: URL去重不变性 - 边缘情况：无重复URL**
     * **Validates: Requirements 2.3**
     * 
     * When there are no duplicates, deduplication should preserve all links
     */
    test('Property 6: URL去重不变性 - 无重复时应保留所有链接', () => {
      const linkArbitrary = fc.record({
        url: fc.webUrl(),
        status: fc.constantFrom('unfetched', 'fetching', 'fetched', 'failed'),
        addedAt: fc.integer({ min: 1000000000000, max: Date.now() }),
        fetchedAt: fc.constant(null),
        retryCount: fc.integer({ min: 0, max: 10 }),
        error: fc.constant(null)
      });

      // 生成唯一URL的链接列表
      const uniqueLinksArbitrary = fc.uniqueArray(linkArbitrary, {
        minLength: 1,
        maxLength: 10,
        selector: link => link.url
      });

      fc.assert(
        fc.property(uniqueLinksArbitrary, (links) => {
          const originalCount = links.length;
          const originalUrls = new Set(links.map(link => link.url));

          linkManager.links = [...links];
          linkManager.deduplicateAndSort();

          // 验证数量不变
          expect(linkManager.links.length).toBe(originalCount);

          // 验证所有URL都保留
          const deduplicatedUrls = new Set(linkManager.links.map(link => link.url));
          expect(deduplicatedUrls).toEqual(originalUrls);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Property 7: URL排序不变性**
     * **Validates: Requirements 2.4**
     * 
     * For any link list, after sorting, the resulting list should be in lexicographic order
     */
    test('Property 7: URL排序不变性 - 排序后应按字典序排列', () => {
      // 定义链接对象生成器
      const linkArbitrary = fc.record({
        url: fc.webUrl(),
        status: fc.constantFrom('unfetched', 'fetching', 'fetched', 'failed'),
        addedAt: fc.integer({ min: 1000000000000, max: Date.now() }),
        fetchedAt: fc.oneof(
          fc.constant(null),
          fc.integer({ min: 1000000000000, max: Date.now() })
        ),
        retryCount: fc.integer({ min: 0, max: 10 }),
        error: fc.oneof(
          fc.constant(null),
          fc.string()
        )
      });

      // 生成链接列表
      const linksArrayArbitrary = fc.array(linkArbitrary, { minLength: 0, maxLength: 20 });

      fc.assert(
        fc.property(linksArrayArbitrary, (links) => {
          // 设置链接列表并执行去重和排序
          linkManager.links = [...links];
          linkManager.deduplicateAndSort();

          const sortedLinks = linkManager.links;

          // 验证：结果按URL字典序排列
          for (let i = 1; i < sortedLinks.length; i++) {
            const comparison = sortedLinks[i - 1].url.localeCompare(sortedLinks[i].url);
            expect(comparison).toBeLessThanOrEqual(0);
          }
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Property 7: URL排序不变性 - 边缘情况：单个链接**
     * **Validates: Requirements 2.4**
     * 
     * A list with a single link should remain unchanged after sorting
     */
    test('Property 7: URL排序不变性 - 单个链接排序后不变', () => {
      fc.assert(
        fc.property(fc.webUrl(), (url) => {
          const link = {
            url,
            status: 'unfetched',
            addedAt: Date.now(),
            fetchedAt: null,
            retryCount: 0,
            error: null
          };

          linkManager.links = [link];
          linkManager.deduplicateAndSort();

          expect(linkManager.links.length).toBe(1);
          expect(linkManager.links[0].url).toBe(url);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Property 8: 链接状态更新正确性**
     * **Validates: Requirements 2.6**
     * 
     * For any link and new status value, after updating the link's status, 
     * querying the link should return the new status
     */
    test('Property 8: 链接状态更新正确性 - 更新后查询应返回新状态', () => {
      fc.assert(
        fc.property(
          fc.webUrl(),
          fc.constantFrom('unfetched', 'fetching', 'fetched', 'failed'),
          fc.constantFrom('unfetched', 'fetching', 'fetched', 'failed'),
          (url, initialStatus, newStatus) => {
            // 添加链接
            linkManager.links = [];
            linkManager.addLink(url, initialStatus);

            // 验证初始状态
            const linkBefore = linkManager.links.find(l => l.url === url);
            expect(linkBefore).toBeDefined();
            expect(linkBefore.status).toBe(initialStatus);

            // 更新状态
            linkManager.updateLinkStatus(url, newStatus);

            // 验证更新后的状态
            const linkAfter = linkManager.links.find(l => l.url === url);
            expect(linkAfter).toBeDefined();
            expect(linkAfter.status).toBe(newStatus);

            // 如果新状态是'fetched'，验证fetchedAt被设置
            if (newStatus === 'fetched') {
              expect(linkAfter.fetchedAt).not.toBeNull();
              expect(linkAfter.fetchedAt).toBeGreaterThan(0);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Property 8: 链接状态更新正确性 - 边缘情况：更新不存在的链接**
     * **Validates: Requirements 2.6**
     * 
     * Updating a non-existent link should not cause errors
     */
    test('Property 8: 链接状态更新正确性 - 更新不存在的链接不应报错', () => {
      fc.assert(
        fc.property(
          fc.webUrl(),
          fc.constantFrom('unfetched', 'fetching', 'fetched', 'failed'),
          (url, status) => {
            linkManager.links = [];

            // 尝试更新不存在的链接
            expect(() => {
              linkManager.updateLinkStatus(url, status);
            }).not.toThrow();

            // 验证链接列表仍为空
            expect(linkManager.links.length).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Unit Tests', () => {
    /**
     * 测试空文件处理
     */
    test('应正确处理空文件', () => {
      const tempFilePath = path.join(testLinksDir, `empty-file-${Date.now()}.txt`);

      try {
        // 创建空文件
        fs.writeFileSync(tempFilePath, '', 'utf-8');

        // 加载空文件
        const loadedLinks = linkManager.loadLinks(tempFilePath);

        // 验证返回空数组
        expect(loadedLinks).toEqual([]);
        expect(loadedLinks.length).toBe(0);
      } finally {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
      }
    });

    /**
     * 测试空文件处理 - 只包含空行
     */
    test('应正确处理只包含空行的文件', () => {
      const tempFilePath = path.join(testLinksDir, `whitespace-file-${Date.now()}.txt`);

      try {
        // 创建只包含空行的文件
        fs.writeFileSync(tempFilePath, '\n\n  \n\t\n', 'utf-8');

        // 加载文件
        const loadedLinks = linkManager.loadLinks(tempFilePath);

        // 验证返回空数组
        expect(loadedLinks).toEqual([]);
        expect(loadedLinks.length).toBe(0);
      } finally {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
      }
    });

    /**
     * 测试文件不存在时使用种子链接初始化
     */
    test('文件不存在时应使用种子链接初始化', () => {
      const nonExistentPath = path.join(testLinksDir, `non-existent-${Date.now()}.txt`);
      const seedUrls = [
        'https://example.com/page1',
        'https://example.com/page2',
        'https://example.com/page3'
      ];

      // 确保文件不存在
      if (fs.existsSync(nonExistentPath)) {
        fs.unlinkSync(nonExistentPath);
      }

      // 加载不存在的文件（返回空数组）
      const loadedLinks = linkManager.loadLinks(nonExistentPath);
      expect(loadedLinks).toEqual([]);

      // 使用种子链接初始化
      seedUrls.forEach(url => linkManager.addLink(url, 'unfetched'));

      // 保存到文件
      linkManager.saveLinks(nonExistentPath, linkManager.links);

      // 验证文件已创建
      expect(fs.existsSync(nonExistentPath)).toBe(true);

      // 重新加载并验证
      const newLinkManager = new LinkManager();
      const reloadedLinks = newLinkManager.loadLinks(nonExistentPath);

      expect(reloadedLinks.length).toBe(seedUrls.length);
      reloadedLinks.forEach((link, index) => {
        expect(link.url).toBe(seedUrls[index]);
        expect(link.status).toBe('unfetched');
      });

      // 清理
      if (fs.existsSync(nonExistentPath)) {
        fs.unlinkSync(nonExistentPath);
      }
    });

    /**
     * 测试状态转换：unfetched -> fetching -> fetched -> failed
     */
    test('应正确处理状态转换 unfetched -> fetching -> fetched -> failed', () => {
      const testUrl = 'https://example.com/test-page';

      // 初始状态：unfetched
      linkManager.addLink(testUrl, 'unfetched');
      let link = linkManager.links.find(l => l.url === testUrl);
      expect(link.status).toBe('unfetched');
      expect(link.fetchedAt).toBeNull();

      // 转换到 fetching
      linkManager.updateLinkStatus(testUrl, 'fetching');
      link = linkManager.links.find(l => l.url === testUrl);
      expect(link.status).toBe('fetching');
      expect(link.fetchedAt).toBeNull();

      // 转换到 fetched
      linkManager.updateLinkStatus(testUrl, 'fetched');
      link = linkManager.links.find(l => l.url === testUrl);
      expect(link.status).toBe('fetched');
      expect(link.fetchedAt).not.toBeNull();
      expect(link.fetchedAt).toBeGreaterThan(0);

      const fetchedAtTime = link.fetchedAt;

      // 转换到 failed
      linkManager.updateLinkStatus(testUrl, 'failed');
      link = linkManager.links.find(l => l.url === testUrl);
      expect(link.status).toBe('failed');
      // fetchedAt 应该保持不变
      expect(link.fetchedAt).toBe(fetchedAtTime);
    });

    /**
     * 测试状态转换：unfetched -> fetching -> failed
     */
    test('应正确处理状态转换 unfetched -> fetching -> failed', () => {
      const testUrl = 'https://example.com/failed-page';

      // 初始状态：unfetched
      linkManager.addLink(testUrl, 'unfetched');
      let link = linkManager.links.find(l => l.url === testUrl);
      expect(link.status).toBe('unfetched');
      expect(link.fetchedAt).toBeNull();

      // 转换到 fetching
      linkManager.updateLinkStatus(testUrl, 'fetching');
      link = linkManager.links.find(l => l.url === testUrl);
      expect(link.status).toBe('fetching');

      // 转换到 failed
      linkManager.updateLinkStatus(testUrl, 'failed');
      link = linkManager.links.find(l => l.url === testUrl);
      expect(link.status).toBe('failed');
      expect(link.fetchedAt).toBeNull();
    });

    /**
     * 测试状态转换：failed -> unfetched (重试)
     */
    test('应正确处理状态转换 failed -> unfetched (重试)', () => {
      const testUrl = 'https://example.com/retry-page';

      // 初始状态：failed
      linkManager.addLink(testUrl, 'failed');
      let link = linkManager.links.find(l => l.url === testUrl);
      expect(link.status).toBe('failed');

      // 转换回 unfetched (重试)
      linkManager.updateLinkStatus(testUrl, 'unfetched');
      link = linkManager.links.find(l => l.url === testUrl);
      expect(link.status).toBe('unfetched');
    });

    test('重试成功后应清除历史错误信息', () => {
      const testUrl = 'https://example.com/error-recovery';

      linkManager.addLink(testUrl, 'unfetched');

      // 失败时记录错误
      linkManager.updateLinkStatus(testUrl, 'failed', 'timeout');
      let link = linkManager.links.find(l => l.url === testUrl);
      expect(link.status).toBe('failed');
      expect(link.error).toBe('timeout');

      // 重试中应清除旧错误，避免误导
      linkManager.updateLinkStatus(testUrl, 'fetching');
      link = linkManager.links.find(l => l.url === testUrl);
      expect(link.status).toBe('fetching');
      expect(link.error).toBeNull();

      // 成功后仍应保持无错误状态
      linkManager.updateLinkStatus(testUrl, 'fetched');
      link = linkManager.links.find(l => l.url === testUrl);
      expect(link.status).toBe('fetched');
      expect(link.error).toBeNull();
    });

    /**
     * 测试 getUnfetchedLinks 只返回 unfetched 状态的链接
     */
    test('getUnfetchedLinks 应只返回 unfetched 状态的链接', () => {
      // 添加不同状态的链接
      linkManager.addLink('https://example.com/unfetched1', 'unfetched');
      linkManager.addLink('https://example.com/unfetched2', 'unfetched');
      linkManager.addLink('https://example.com/fetching1', 'fetching');
      linkManager.addLink('https://example.com/fetched1', 'fetched');
      linkManager.addLink('https://example.com/failed1', 'failed');
      linkManager.addLink('https://example.com/unfetched3', 'unfetched');

      // 获取 unfetched 链接
      const unfetchedLinks = linkManager.getUnfetchedLinks();

      // 验证
      expect(unfetchedLinks.length).toBe(3);
      unfetchedLinks.forEach(link => {
        expect(link.status).toBe('unfetched');
      });
    });

    /**
     * 测试添加重复链接不会创建副本
     */
    test('添加重复链接不应创建副本', () => {
      const testUrl = 'https://example.com/duplicate-test';

      // 第一次添加
      linkManager.addLink(testUrl, 'unfetched');
      expect(linkManager.links.length).toBe(1);

      // 尝试再次添加相同URL
      linkManager.addLink(testUrl, 'fetched');
      expect(linkManager.links.length).toBe(1);

      // 验证状态没有改变（因为addLink不更新已存在的链接）
      const link = linkManager.links.find(l => l.url === testUrl);
      expect(link.status).toBe('unfetched');
    });
  });
});
