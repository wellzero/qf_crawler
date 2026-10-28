import BaseParser from './base-parser.js';

/**
 * Portal Parser - 门户/首页解析器
 * 专门处理门户网站首页，尽可能多地保留页面元素和链接
 *
 * 支持的页面类型：
 * - 门户首页（如 qq.com, sohu.com, sina.com.cn）
 * - 导航站首页（如 hao123.com）
 * - 新闻门户首页
 * - 电商首页
 * - 视频网站首页
 */
class PortalParser extends BaseParser {
  /**
   * 匹配门户/首页类型
   * @param {string} url - 页面URL
   * @returns {boolean} 是否匹配
   */
  matches(url) {
    // 常见门户域名
    const portalDomains = [
      'qq.com', 'sohu.com', 'sina.com.cn', '163.com', 'ifeng.com',
      'eastmoney.com', 'hexun.com', 'jrj.com.cn', '10jqka.com.cn',
      'hao123.com', '360.cn', 'baidu.com', 'taobao.com', 'jd.com',
      'tmall.com', 'bilibili.com', 'youku.com', 'iqiyi.com',
      'douyu.com', 'hupu.com', 'zhihu.com', 'weibo.com',
      'xinhuanet.com', 'people.com.cn', 'cctv.com', 'chinanews.com',
      'chinadaily.com.cn', 'gmw.cn', 'china.com.cn', 'cnr.cn',
      'ctrip.com', 'qunar.com', 'meituan.com', 'dianping.com',
      'autohome.com.cn', 'yiche.com', 'pcauto.com.cn',
      'fang.com', 'anjuke.com', 'lianjia.com',
      '51job.com', 'zhipin.com', 'liepin.com', 'lagou.com',
      'xueqiu.com', 'snowball.com',
      'gamersky.com', '3dmgame.com', '17173.com',
      'thepaper.cn', 'bjnews.com.cn', 'youth.cn', 'ce.cn'
    ];

    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.replace('www.', '');

      // 检查是否是门户域名的主页
      for (const domain of portalDomains) {
        if (hostname === domain || hostname.endsWith('.' + domain)) {
          // 如果是主页（路径很短或为根），则匹配
          const pathname = urlObj.pathname;
          // 只匹配根路径、空路径、或极短路径如 /index.html
          if (pathname === '/' || pathname === '' ||
              pathname === '/index.html' || pathname === '/index.htm' ||
              pathname === '/index.php' || pathname === '/home') {
            return true;
          }
        }
      }
    } catch (e) {
      // URL解析失败，不匹配
    }

    return false;
  }

  /**
   * 获取优先级（高于 GenericParser）
   * @returns {number} 优先级
   */
  getPriority() {
    return 5;
  }

  /**
   * 通过页面内容特征检测是否为门户首页
   * @param {Page} page - Playwright页面对象
   * @returns {Promise<number>} 置信度 0-100
   */
  async detectByContent(page) {
    return await page.evaluate(() => {
      let score = 0;

      // 导航区块数量（门户首页通常有多个导航）
      const navCount = document.querySelectorAll('nav, .nav, .navigation, .header-nav, #nav, #menu').length;
      if (navCount >= 2) score += 30;
      else if (navCount >= 1) score += 15;

      // 内容区块（新闻列表、推荐区块等）
      const contentBlocks = document.querySelectorAll('.news-list, .content-block, .channel, .section, .module, .mod, [class*="content"]');
      if (contentBlocks.length >= 5) score += 30;
      else if (contentBlocks.length >= 3) score += 20;
      else if (contentBlocks.length >= 1) score += 10;

      // 热门话题/热搜区域
      const hotTopics = document.querySelector('.hot, .trending, .hot-search, .hotsearch, [class*="热点"], [class*="hot-list"], .rank, .ranking');
      if (hotTopics) score += 20;

      // 链接数量（门户首页通常有很多链接）
      const links = document.querySelectorAll('a[href]');
      if (links.length >= 200) score += 20;
      else if (links.length >= 100) score += 15;
      else if (links.length >= 50) score += 10;

      // 频道导航/分类导航
      const channelNav = document.querySelector('.channel-nav, .channel-navs, .nav-channel, #channel, .category-list');
      if (channelNav) score += 10;

      // 快捷入口
      const quickLinks = document.querySelector('.quick-links, .quicklink, .shortcut, .service-links, [class*="fast"]');
      if (quickLinks) score += 5;

      return score;
    });
  }

  /**
   * 解析门户首页
   * @param {Page} page - Playwright页面对象
   * @param {string} url - 页面URL
   * @param {Object} options - 解析选项
   * @returns {Promise<Object>} 解析后的页面数据
   */
  async parse(page, url, options = {}) {
    try {
      // 等待内容加载完成（特别是SPA页面如1688）
      await this.waitForContent(page, {
        timeout: 30000,
        minContentLength: 500,
        minLinkCount: 10
      });

      // 提取站点基本信息
      const siteInfo = await this.extractSiteInfo(page);

      // 提取导航菜单
      const navigation = await this.extractNavigation(page);

      // 提取推荐内容区块
      const contentBlocks = await this.extractContentBlocks(page);

      // 提取热门/趋势列表
      const hotTopics = await this.extractHotTopics(page);

      // 提取频道分类
      const channels = await this.extractChannels(page);

      // 提取快捷入口/服务链接
      const quickLinks = await this.extractQuickLinks(page);

      // 提取底部信息
      const footer = await this.extractFooter(page);

      // 提取侧边栏内容
      const sidebars = await this.extractSidebars(page);

      // 提取图片（减少数量，只保留关键图片）
      const images = await this.extractKeyImages(page, options.filepath, options.pagesDir);

      return {
        type: 'portal',
        url,
        ...siteInfo,
        navigation,
        contentBlocks,
        hotTopics,
        channels,
        quickLinks,
        sidebars,
        footer,
        images
      };
    } catch (error) {
      console.error('Failed to parse portal page:', error.message);
      return {
        type: 'portal',
        url,
        title: '',
        description: '',
        navigation: [],
        contentBlocks: [],
        hotTopics: [],
        channels: [],
        quickLinks: [],
        sidebars: [],
        footer: {},
        images: []
      };
    }
  }

  /**
   * 提取站点基本信息
   */
  async extractSiteInfo(page) {
    return await page.evaluate(() => {
      const title = document.title || '';
      const description = document.querySelector('meta[name="description"]')?.content || '';
      const keywords = document.querySelector('meta[name="keywords"]')?.content || '';

      // 提取 logo
      let logo = null;
      const logoEl = document.querySelector('.logo img, #logo img, [class*="logo"] img');
      if (logoEl) {
        logo = {
          src: logoEl.src,
          alt: logoEl.alt || ''
        };
      }

      return { title, description, keywords, logo };
    });
  }

  /**
   * 提取导航菜单
   */
  async extractNavigation(page) {
    return await page.evaluate(() => {
      const navigations = [];

      // 主导航
      const mainNav = document.querySelector('nav, #nav, .nav, .navigation, .main-nav, .header-nav, #menu');
      if (mainNav) {
        const items = mainNav.querySelectorAll('a');
        const links = Array.from(items).slice(0, 30).map(a => ({
          text: a.textContent.trim(),
          href: a.href
        })).filter(l => l.text && l.text.length < 50);
        if (links.length > 0) {
          navigations.push({ type: 'main', items: links });
        }
      }

      // 顶部导航条
      const topNav = document.querySelector('.top-nav, #top-nav, .topbar, .top-bar');
      if (topNav) {
        const items = topNav.querySelectorAll('a');
        const links = Array.from(items).slice(0, 20).map(a => ({
          text: a.textContent.trim(),
          href: a.href
        })).filter(l => l.text && l.text.length < 30);
        if (links.length > 0) {
          navigations.push({ type: 'top', items: links });
        }
      }

      // 频道导航
      const channelNav = document.querySelector('.channel-nav, .channel-navs, .nav-channel, #channel');
      if (channelNav) {
        const items = channelNav.querySelectorAll('a');
        const links = Array.from(items).slice(0, 20).map(a => ({
          text: a.textContent.trim(),
          href: a.href
        })).filter(l => l.text && l.text.length < 30);
        if (links.length > 0) {
          navigations.push({ type: 'channel', items: links });
        }
      }

      return navigations;
    });
  }

  /**
   * 提取内容区块（新闻、推荐等）
   */
  async extractContentBlocks(page) {
    return await page.evaluate(() => {
      const blocks = [];

      // 查找内容区块
      const blockSelectors = [
        '.news-list', '.article-list', '.content-list', '.item-list',
        '.recommend', '.recommend-list', '.hot-list', '.top-list',
        '.feed-list', '.news-item', '.list-item',
        '[class*="news"]', '[class*="article"]', '[class*="content"]',
        'section', 'article', '.module', '.mod'
      ];

      const processedUrls = new Set();

      for (const selector of blockSelectors) {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          // 获取区块标题
          let blockTitle = '';
          const titleEl = el.querySelector('h2, h3, .title, .hd, .head, .caption');
          if (titleEl) {
            blockTitle = titleEl.textContent.trim();
          }

          // 提取区块内的内容项
          const items = [];
          const linkSelectors = ['a', 'li a', '.item a', '.news-item a', '.list-item a'];

          for (const linkSel of linkSelectors) {
            const links = el.querySelectorAll(linkSel);
            for (const link of links) {
              const text = link.textContent.trim();
              const href = link.href;

              // 过滤无效链接
              if (!text || text.length < 2 || text.length > 100) continue;
              if (!href || href.startsWith('javascript:') || processedUrls.has(href)) continue;
              if (href.includes('#') && !href.includes('/')) continue;

              processedUrls.add(href);

              // 尝试获取摘要
              let summary = '';
              const parent = link.closest('li, .item, .news-item, .list-item, article');
              if (parent) {
                const summaryEl = parent.querySelector('.summary, .desc, .intro, p');
                if (summaryEl && summaryEl !== link) {
                  summary = summaryEl.textContent.trim().slice(0, 200);
                }
              }

              // 尝试获取图片
              let img = null;
              if (parent) {
                const imgEl = parent.querySelector('img');
                if (imgEl && imgEl.src && !imgEl.src.startsWith('data:')) {
                  img = {
                    src: imgEl.src,
                    alt: imgEl.alt || ''
                  };
                }
              }

              items.push({ text, href, summary, img });
            }
          }

          // 只保留有足够内容的区块
          if (items.length >= 3) {
            blocks.push({
              title: blockTitle || `内容区块 ${blocks.length + 1}`,
              items: items.slice(0, 20) // 每个区块最多20条
            });

            if (blocks.length >= 10) break; // 最多10个区块
          }
        }
        if (blocks.length >= 10) break;
      }

      return blocks;
    });
  }

  /**
   * 提取热门/趋势列表
   */
  async extractHotTopics(page) {
    return await page.evaluate(() => {
      const hotTopics = [];

      // 热搜/热门选择器
      const hotSelectors = [
        '.hot-search', '.hotsearch', '.hot-list', '.top-search',
        '.trending', '.trend-list', '.hot-topics', '.search-hot',
        '[class*="hot"]', '[class*="trend"]', '.rank', '.ranking'
      ];

      for (const selector of hotSelectors) {
        const containers = document.querySelectorAll(selector);
        for (const container of containers) {
          const items = container.querySelectorAll('a, li, .item');
          const topics = [];

          for (const item of items) {
            const link = item.tagName === 'A' ? item : item.querySelector('a');
            const text = (link || item).textContent.trim();
            const href = link?.href || '';

            if (text && text.length >= 2 && text.length <= 50) {
              // 尝试获取排名或热度
              let rank = null;
              let hotScore = null;

              const rankEl = item.querySelector('.rank, .num, .index, .order');
              if (rankEl) {
                rank = parseInt(rankEl.textContent) || topics.length + 1;
              } else {
                rank = topics.length + 1;
              }

              const hotEl = item.querySelector('.hot, .heat, .count, .num');
              if (hotEl) {
                hotScore = hotEl.textContent.trim();
              }

              topics.push({ rank, text, href, hotScore });
            }
          }

          if (topics.length >= 3) {
            // 获取标题
            let title = '热门榜单';
            const titleEl = container.querySelector('h2, h3, .title, .hd');
            if (titleEl) {
              title = titleEl.textContent.trim();
            }

            hotTopics.push({
              title,
              items: topics.slice(0, 20)
            });
          }
        }

        if (hotTopics.length >= 5) break;
      }

      return hotTopics;
    });
  }

  /**
   * 提取频道分类
   */
  async extractChannels(page) {
    return await page.evaluate(() => {
      const channels = [];

      // 频道分类选择器
      const channelSelectors = [
        '.channels', '.channel-list', '.category-list', '.cat-list',
        '.sub-nav', '.subnav', '[class*="channel"]', '[class*="category"]'
      ];

      for (const selector of channelSelectors) {
        const containers = document.querySelectorAll(selector);
        for (const container of containers) {
          const links = container.querySelectorAll('a');
          const items = [];

          for (const link of links) {
            const text = link.textContent.trim();
            const href = link.href;

            if (text && text.length >= 1 && text.length <= 20 && href && !href.startsWith('javascript:')) {
              items.push({ text, href });
            }
          }

          if (items.length >= 3) {
            let title = '频道分类';
            const titleEl = container.querySelector('h2, h3, .title');
            if (titleEl) {
              title = titleEl.textContent.trim();
            }

            channels.push({
              title,
              items: items.slice(0, 30)
            });
          }
        }

        if (channels.length >= 5) break;
      }

      return channels;
    });
  }

  /**
   * 提取快捷入口/服务链接
   */
  async extractQuickLinks(page) {
    return await page.evaluate(() => {
      const quickLinks = [];

      // 快捷入口选择器
      const selectors = [
        '.quick-links', '.quicklink', '.shortcut', '.service-links',
        '.fast-entry', '.fast-nav', '[class*="quick"]', '[class*="fast"]'
      ];

      for (const selector of selectors) {
        const containers = document.querySelectorAll(selector);
        for (const container of containers) {
          const links = container.querySelectorAll('a');
          const items = [];

          for (const link of links) {
            const text = link.textContent.trim();
            const href = link.href;

            if (text && text.length >= 1 && text.length <= 30 && href && !href.startsWith('javascript:')) {
              // 尝试获取图标
              let icon = null;
              const iconEl = link.querySelector('img, .icon');
              if (iconEl) {
                if (iconEl.tagName === 'IMG') {
                  icon = iconEl.src;
                } else {
                  const bgImage = window.getComputedStyle(iconEl).backgroundImage;
                  if (bgImage && bgImage !== 'none') {
                    icon = bgImage.slice(5, -2);
                  }
                }
              }

              items.push({ text, href, icon });
            }
          }

          if (items.length >= 4) {
            let title = '快捷入口';
            const titleEl = container.querySelector('h2, h3, .title');
            if (titleEl) {
              title = titleEl.textContent.trim();
            }

            quickLinks.push({
              title,
              items: items.slice(0, 20)
            });
          }
        }

        if (quickLinks.length >= 3) break;
      }

      return quickLinks;
    });
  }

  /**
   * 提取侧边栏内容
   */
  async extractSidebars(page) {
    return await page.evaluate(() => {
      const sidebars = [];

      const sidebarSelectors = ['aside', '.sidebar', '.side', '.aside', '#sidebar'];

      for (const selector of sidebarSelectors) {
        const containers = document.querySelectorAll(selector);
        for (const container of containers) {
          // 提取侧边栏标题
          let title = '侧边栏';
          const titleEl = container.querySelector('h2, h3, .title, .hd');
          if (titleEl) {
            title = titleEl.textContent.trim();
          }

          // 提取链接
          const links = container.querySelectorAll('a');
          const items = [];

          for (const link of links) {
            const text = link.textContent.trim();
            const href = link.href;

            if (text && text.length >= 1 && text.length <= 50 && href && !href.startsWith('javascript:')) {
              items.push({ text, href });
            }
          }

          if (items.length >= 3) {
            sidebars.push({
              title,
              items: items.slice(0, 30)
            });
          }
        }

        if (sidebars.length >= 2) break;
      }

      return sidebars;
    });
  }

  /**
   * 提取底部信息
   */
  async extractFooter(page) {
    return await page.evaluate(() => {
      const footer = {};

      const footerEl = document.querySelector('footer, .footer, #footer');
      if (!footerEl) return footer;

      // 提取版权信息
      const copyright = footerEl.querySelector('.copyright, [class*="copyright"]');
      if (copyright) {
        footer.copyright = copyright.textContent.trim();
      } else {
        // 尝试从文本中提取
        const text = footerEl.textContent;
        const copyrightMatch = text.match(/版权所有|Copyright|©/i);
        if (copyrightMatch) {
          footer.copyright = text.slice(copyrightMatch.index, copyrightMatch.index + 200).trim();
        }
      }

      // 提取底部链接
      const links = footerEl.querySelectorAll('a');
      footer.links = [];
      for (const link of links) {
        const text = link.textContent.trim();
        const href = link.href;
        if (text && text.length >= 1 && text.length <= 30 && href) {
          footer.links.push({ text, href });
        }
      }

      // 提取联系方式
      const contact = footerEl.querySelector('.contact, [class*="contact"]');
      if (contact) {
        footer.contact = contact.textContent.trim();
      }

      // 提取 ICP 信息
      const icpMatch = footerEl.textContent.match(/ICP[备证][^）)）]*/);
      if (icpMatch) {
        footer.icp = icpMatch[0];
      }

      return footer;
    });
  }

  /**
   * 提取关键图片（限制数量）
   */
  async extractKeyImages(page, filepath, pagesDir) {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const https = await import('https');
      const http = await import('http');

      const baseFilename = filepath ? path.basename(filepath, '.md') : 'images';
      const imagesDir = path.join(pagesDir, baseFilename);
      if (!fs.existsSync(imagesDir)) {
        fs.mkdirSync(imagesDir, { recursive: true });
      }

      const images = await page.evaluate(() => {
        // 只提取主要内容区域的图片，过滤小图标和广告
        const imgElements = document.querySelectorAll('main img, article img, .content img, .news img, [class*="news"] img, [class*="content"] img');
        return Array.from(imgElements)
          .filter(img => {
            const width = img.naturalWidth || img.width;
            const height = img.naturalHeight || img.height;
            // 过滤小图标
            return width >= 100 && height >= 100 && img.src && !img.src.startsWith('data:');
          })
          .slice(0, 20)
          .map((img, index) => ({
            src: img.src,
            alt: img.alt || '',
            index: index + 1
          }));
      });

      const downloadedImages = [];

      for (const img of images) {
        try {
          if (!img.src || img.src.startsWith('data:')) continue;

          const urlObj = new URL(img.src);
          let ext = path.extname(urlObj.pathname) || '.jpg';
          if (!ext.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) {
            ext = '.jpg';
          }

          const localFilename = `image_${img.index}${ext}`;
          const localPath = path.join(imagesDir, localFilename);

          await new Promise((resolve, reject) => {
            const protocol = img.src.startsWith('https') ? https : http;
            const file = fs.createWriteStream(localPath);

            protocol.get(img.src, (response) => {
              if (response.statusCode === 200) {
                response.pipe(file);
                file.on('finish', () => {
                  file.close();
                  resolve();
                });
              } else {
                file.close();
                if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
                resolve();
              }
            }).on('error', () => {
              file.close();
              if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
              resolve();
            });
          });

          downloadedImages.push({
            src: img.src,
            localPath: `${baseFilename}/${localFilename}`,
            alt: img.alt
          });
        } catch (error) {
          // 忽略下载错误
        }
      }

      return downloadedImages;
    } catch (error) {
      return [];
    }
  }
}

export default PortalParser;