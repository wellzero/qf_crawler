import BaseParser from './base-parser.js';

/**
 * Aliyun Bailian MCP Parser - 解析阿里云百炼 MCP 市场页面
 * URL 规则：
 * - 市场列表页: https://bailian.console.aliyun.com/cn-beijing/?tab=mcp#/mcp-market
 * - 详情页: https://bailian.console.aliyun.com/cn-beijing/?tab=mcp#/mcp-market/detail/{tool_id}
 */
class AliyunBailianMcpParser extends BaseParser {
  constructor() {
    super();
    this.capturedApiData = [];
  }

  matches(url) {
    // 匹配 ?tab=mcp 或 ?tab=app 的百炼控制台页面
    return /^https?:\/\/bailian\.console\.aliyun\.com\/cn-beijing\/\?tab=(mcp|app)(?:#.*)?$/.test(url);
  }

  getPriority() {
    return 110;
  }

  /**
   * 支持自定义链接发现
   */
  supportsLinkDiscovery() {
    return true;
  }

  /**
   * 设置API响应拦截
   */
  setupApiInterception(page) {
    this.capturedApiData = [];

    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('mcp-server.SquarePageList')) {
        try {
          const contentType = response.headers()['content-type'] || '';
          if (contentType.includes('json')) {
            const data = await response.json();
            this.capturedApiData.push(data);
            console.log('AliyunBailianMcpParser: Captured SquarePageList API response');
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    });
  }

  /**
   * 发现页面中的链接 - 使用API数据
   */
  async discoverLinks(page) {
    try {
      // 设置API拦截
      this.setupApiInterception(page);

      // 访问页面
      await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
      await page.waitForTimeout(6000);

      // 优先从API数据中提取链接（支持分页、多次请求、嵌套JSON字符串）
      let links = this.getDetailLinksFromApiData(this.capturedApiData);
      if (links.length > 0) {
        console.log(`AliyunBailianMcpParser: Discovered ${links.length} detail links from API`);
        return links;
      }

      // 如果没有捕获到API数据，尝试滚动加载并检查是否有更多数据
      await this.scrollToLoadAll(page);

      // 检查滚动后是否捕获到更多数据
      links = this.getDetailLinksFromApiData(this.capturedApiData);
      if (links.length > 0) {
        console.log(`AliyunBailianMcpParser: Discovered ${links.length} detail links from API after scroll`);
        return links;
      }

      // 再尝试从页面 script JSON 提取（Bailian 常将链接/ID写在 JSON 字符串中）
      links = await page.evaluate(() => {
        const result = [];
        const serverCodes = new Set();
        const baseUrl = 'https://bailian.console.aliyun.com/cn-beijing/?tab=mcp#/mcp-market/detail/';

        const collectCodesFromString = (text = '') => {
          if (!text) return;
          const detailPattern = /#\/mcp-market\/detail\/([a-zA-Z0-9_-]+)/g;
          const serverCodePattern = /"serverCode"\s*:\s*"([^"]+)"/g;

          let match;
          while ((match = detailPattern.exec(text)) !== null) {
            serverCodes.add(match[1]);
          }
          while ((match = serverCodePattern.exec(text)) !== null) {
            serverCodes.add(match[1]);
          }
        };

        document.querySelectorAll('script').forEach(script => {
          const scriptText = script.textContent || '';
          if (!scriptText) return;
          collectCodesFromString(scriptText);
        });

        serverCodes.forEach(code => {
          result.push(baseUrl + code);
        });

        return result;
      });

      if (links.length > 0) {
        console.log(`AliyunBailianMcpParser: Discovered ${links.length} detail links from embedded JSON`);
        return links;
      }

      // 最后尝试从页面元素提取
      links = await page.evaluate(() => {
        const result = [];
        document.querySelectorAll('a[href]').forEach(a => {
          const href = a.getAttribute('href') || '';
          if (href.includes('#/mcp-market/detail/')) {
            const fullUrl = href.startsWith('http') ? href : new URL(href, window.location.origin).href;
            if (!result.includes(fullUrl)) {
              result.push(fullUrl);
            }
          }
        });
        return result;
      });

      console.log(`AliyunBailianMcpParser: Discovered ${links.length} detail links from page elements`);
      return links;
    } catch (error) {
      console.error('Failed to discover links:', error.message);
      return [];
    }
  }

  /**
   * 从 API 返回数据中提取详情页链接（支持递归解析 JSON 字符串）
   */
  getDetailLinksFromApiData(apiPayloads = []) {
    const baseUrl = 'https://bailian.console.aliyun.com/cn-beijing/?tab=mcp#/mcp-market/detail/';
    const serverCodes = new Set();

    const collectFromAny = (value, depth = 0) => {
      if (value == null || depth > 8) return;

      if (Array.isArray(value)) {
        value.forEach(item => collectFromAny(item, depth + 1));
        return;
      }

      if (typeof value === 'object') {
        // 直接字段命中
        const code = value.serverCode || value.toolId || value.id;
        if (typeof code === 'string' && code.trim()) {
          serverCodes.add(code.trim());
        }

        Object.values(value).forEach(item => collectFromAny(item, depth + 1));
        return;
      }

      if (typeof value === 'string') {
        const text = value.trim();
        if (!text) return;

        // 字符串中的 detail URL
        const detailPattern = /#\/mcp-market\/detail\/([a-zA-Z0-9_-]+)/g;
        let match;
        while ((match = detailPattern.exec(text)) !== null) {
          serverCodes.add(match[1]);
        }

        // 字符串中的 serverCode 字段
        const serverCodePattern = /"serverCode"\s*:\s*"([^"]+)"/g;
        while ((match = serverCodePattern.exec(text)) !== null) {
          serverCodes.add(match[1]);
        }

        // 递归解析 JSON 字符串
        if (
          (text.startsWith('{') && text.endsWith('}')) ||
          (text.startsWith('[') && text.endsWith(']'))
        ) {
          try {
            const parsed = JSON.parse(text);
            collectFromAny(parsed, depth + 1);
          } catch {
            // Ignore malformed JSON strings
          }
        }
      }
    };

    collectFromAny(apiPayloads);

    return [...serverCodes].map(code => `${baseUrl}${code}`);
  }

  /**
   * 检测页面类型
   */
  detectPageType(url) {
    if (url.includes('#/mcp-market/detail/')) {
      return 'detail';
    }
    return 'list';
  }

  async waitForContent(page) {
    try {
      await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
      await page.waitForTimeout(2000);

      // 尝试关闭可能出现的登录弹窗或对话框
      try {
        const closed = await page.evaluate(() => {
          // 查找并点击关闭按钮
          const closeButtons = document.querySelectorAll('[class*="close"], [class*="Close"], button[aria-label*="关闭"], button[aria-label*="close"]');
          for (const btn of closeButtons) {
            if (btn.offsetParent !== null) { // 只点击可见的按钮
              btn.click();
              return true;
            }
          }
          // 尝试点击遮罩层关闭弹窗
          const overlays = document.querySelectorAll('[class*="modal"], [class*="dialog"], [class*="popup"]');
          for (const overlay of overlays) {
            if (overlay.offsetParent !== null) {
              // 点击遮罩层背景关闭
              overlay.click();
              return true;
            }
          }
          return false;
        });
        if (closed) {
          console.log('AliyunBailianMcpParser: Closed popup/dialog');
          await page.waitForTimeout(1000);
        }
      } catch (e) {
        // Ignore close popup errors
      }

      await page.waitForTimeout(2000);
    } catch (error) {
      console.warn('Aliyun Bailian MCP parser: wait timeout, continue with best-effort extraction.');
    }
  }

  /**
   * 滚动加载所有工具卡片
   */
  async scrollToLoadAll(page) {
    try {
      let previousCount = 0;
      let stableCount = 0;
      const maxScrolls = 10;

      for (let i = 0; i < maxScrolls; i++) {
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });

        await page.waitForTimeout(1000);

        const currentCount = await page.evaluate(() => {
          return document.querySelectorAll('[class*="card"]').length;
        });

        if (currentCount === previousCount) {
          stableCount++;
          if (stableCount >= 2) {
            console.log(`Scroll completed after ${i + 1} scrolls, found ${currentCount} cards`);
            break;
          }
        } else {
          stableCount = 0;
          previousCount = currentCount;
        }
      }
    } catch (error) {
      console.warn('Scroll failed:', error.message);
    }
  }

  /**
   * 从API数据解析工具列表
   */
  parseFromApiData(apiData) {
    try {
      const toolList = apiData?.data?.DataV2?.data?.data?.mcpServerDetailList;
      if (!toolList || !Array.isArray(toolList)) {
        return null;
      }

      return toolList.map(tool => ({
        name: tool.serverName || '',
        toolId: tool.serverCode || '',
        provider: tool.sourceName || '',
        description: tool.description || '',
        category: tool.bizType || '',
        classification: tool.classification || '',
        stats: {
          users: tool.activateUserCount || 0,
          calls: tool.callTotalCount || 0
        },
        type: tool.type || '',
        source: tool.source || '',
        status: tool.status || 0,
        detailUrl: `https://bailian.console.aliyun.com/cn-beijing/?tab=mcp#/mcp-market/detail/${tool.serverCode}`
      }));
    } catch (e) {
      console.error('Failed to parse API data:', e.message);
      return null;
    }
  }

  /**
   * 解析市场列表页
   */
  async parseListPage(page, url) {
    // 滚动加载所有内容
    await this.scrollToLoadAll(page);

    // 优先使用API数据
    let toolsFromApi = null;
    if (this.capturedApiData.length > 0) {
      // 优先选择包含 mcpServerDetailList 的响应
      const preferredPayload = this.capturedApiData.find(item => (
        item?.data?.DataV2?.data?.data?.mcpServerDetailList
      )) || this.capturedApiData[0];
      toolsFromApi = this.parseFromApiData(preferredPayload);
    }

    const data = await page.evaluate(() => {
      const normalizeText = (text = '') => text.replace(/\s+/g, ' ').trim();

      const title = normalizeText(
        document.querySelector('h1')?.textContent ||
        document.querySelector('title')?.textContent ||
        '阿里云百炼 MCP 市场'
      );

      // 提取分类标签
      const categories = [];
      document.querySelectorAll('[class*="category"], [class*="tag"]').forEach(el => {
        const text = el.textContent?.trim();
        if (text && text.length < 30 && !categories.includes(text)) {
          categories.push(text);
        }
      });

      // 提取 MCP 工具卡片
      const tools = [];
      const seenTools = new Set();

      const cards = document.querySelectorAll('[class*="card__"]');
      cards.forEach(card => {
        try {
          const fullText = card.textContent || '';
          if (fullText.length < 20) return;

          // 提取基本信息
          const lines = fullText.split('\n').map(l => l.trim()).filter(l => l);

          let name = '';
          let provider = '';
          let description = '';
          let category = '';

          // 解析卡片内容结构
          if (lines.length >= 1) {
            // 第一行通常包含名称和提供者
            const firstLine = lines[0];
            const providerMatch = firstLine.match(/^(.+?)(通义|高德|蚂蚁|钉钉|云市场)(.+)$/);
            if (providerMatch) {
              name = providerMatch[1].trim();
              provider = providerMatch[2];
            } else {
              name = firstLine.slice(0, 50);
            }
          }

          // 查找描述（通常是较长的文本）
          for (const line of lines) {
            if (line.length > 30 && !line.includes('开通') && !line.includes('调用')) {
              description = line.slice(0, 300);
              break;
            }
          }

          // 提取分类和统计
          const categoryMatch = fullText.match(/(效率工具|图像服务|语音服务|联网搜索|地图服务|支付服务|协同办公|AI应用|文档处理|视频生成|图像生成|语音合成|数据查询|开发者工具|企业服务|生活服务|云原生|搜索工具|内容生成)/);
          category = categoryMatch ? categoryMatch[1] : '';

          const key = name || fullText.slice(0, 30);
          if (seenTools.has(key)) return;
          seenTools.add(key);

          if (name) {
            tools.push({
              name,
              provider,
              description,
              category,
              toolId: ''
            });
          }
        } catch (e) {
          // Skip parsing errors
        }
      });

      return { title, categories, tools };
    });

    // 合并API数据和页面数据
    let finalTools = toolsFromApi || data.tools;

    // 构建详情页链接
    const baseUrl = 'https://bailian.console.aliyun.com/cn-beijing/?tab=mcp#/mcp-market/detail/';
    const detailLinks = finalTools
      .filter(t => t.toolId)
      .map(t => baseUrl + t.toolId);

    return {
      type: 'aliyun-bailian-mcp-list',
      url,
      title: data.title,
      categories: data.categories,
      tools: finalTools,
      detailLinks,
      totalTools: finalTools.length,
      tables: [],
      codeBlocks: []
    };
  }

  /**
   * 解析详情页
   */
  async parseDetailPage(page, url) {
    await page.waitForTimeout(3000);

    const data = await page.evaluate(() => {
      const normalizeText = (text = '') => text.replace(/\s+/g, ' ').trim();

      const title = normalizeText(
        document.querySelector('h1')?.textContent ||
        document.querySelector('[class*="title"]')?.textContent ||
        document.querySelector('title')?.textContent ||
        ''
      );

      const description = normalizeText(
        document.querySelector('[class*="description"]')?.textContent ||
        document.querySelector('[class*="intro"]')?.textContent ||
        ''
      );

      const providerText = document.body.innerText.match(/由\s*(.+?)\s*提供/);
      const provider = providerText ? normalizeText(providerText[1]) : normalizeText(
        document.querySelector('[class*="provider"]')?.textContent || ''
      );

      // 提取统计数据
      const stats = {};
      const statElements = document.querySelectorAll('[class*="stat"], [class*="metric"], div');
      statElements.forEach(el => {
        const text = el.innerText || '';
        if (text.length < 50) {
          if (text.includes('开通用户数')) {
            const match = text.match(/开通用户数\s*(\d+\.?\d*[KMGkmg]?)/);
            if (match) stats.users = match[1];
          }
          if (text.includes('总调用次数')) {
            const match = text.match(/总调用次数\s*(\d+\.?\d*[KMGkmg]?)/);
            if (match) stats.calls = match[1];
          }
          if (text.includes('平均执行时间')) {
            const match = text.match(/平均执行时间\s*(\d+)/);
            if (match) stats.avgTime = match[1] + 'ms';
          }
          if (text.includes('工具') && text.includes('个')) {
            const match = text.match(/工具\s*(\d+)\s*个/);
            if (match) stats.toolCount = match[1];
          }
        }
      });

      // 使用 innerText 提取服务介绍，以保留换行和格式，避免嵌套导致的文本重复
      let bodyText = document.body.innerText || '';
      
      // 尝试截取主要内容区域（去掉头部的基础信息，保留 "服务介绍" 以后的部分）
      const introIndex = bodyText.indexOf('服务介绍');
      if (introIndex !== -1) {
        bodyText = bodyText.substring(introIndex);
      }

      // 去掉底部推荐和页脚导航
      const footerIndex = bodyText.indexOf('官方推荐 MCP 服务');
      if (footerIndex !== -1) {
        bodyText = bodyText.substring(0, footerIndex);
      } else {
        const productIndex = bodyText.indexOf('产品与服务\n全部');
        if (productIndex !== -1) {
          bodyText = bodyText.substring(0, productIndex);
        }
      }
      
      // 提取工具列表
      const toolList = [];
      document.querySelectorAll('[class*="tool-item"], [class*="toolItem"], [class*="function"], table tr').forEach(el => {
        const name = el.querySelector('[class*="name"]')?.textContent?.trim() ||
                     el.querySelector('strong')?.textContent?.trim() || 
                     (el.tagName === 'TR' ? el.cells?.[0]?.textContent?.trim() : '');
        const desc = el.querySelector('[class*="desc"]')?.textContent?.trim() ||
                     (el.tagName === 'TR' ? el.cells?.[1]?.textContent?.trim() : el.textContent?.replace(name, '').trim()) || '';
        if (name && name.length < 100 && name !== '名称' && name !== '工具名称') {
          // 去重
          if (!toolList.find(t => t.name === name)) {
            toolList.push({ name, description: desc.slice(0, 500) });
          }
        }
      });

      return {
        title,
        description,
        provider,
        stats,
        serviceIntro: [], // 置空，统一使用保留了换行的 bodyText 替代
        toolList,
        markdownContent: bodyText.slice(0, 10000)
      };
    });

    // 从URL提取工具ID
    const toolIdMatch = url.match(/detail\/([^/?]+)/);
    const toolId = toolIdMatch ? toolIdMatch[1] : '';

    return {
      type: 'aliyun-bailian-mcp-detail',
      url,
      toolId,
      title: data.title,
      description: data.description,
      provider: data.provider,
      stats: data.stats,
      serviceIntro: data.serviceIntro,
      toolList: data.toolList,
      markdownContent: data.markdownContent,
      tables: [],
      codeBlocks: []
    };
  }

  async parse(page, url) {
    try {
      // 设置API拦截
      this.setupApiInterception(page);

      await this.waitForContent(page);

      const pageType = this.detectPageType(url);

      if (pageType === 'detail') {
        return await this.parseDetailPage(page, url);
      } else {
        return await this.parseListPage(page, url);
      }
    } catch (error) {
      console.error('Failed to parse aliyun bailian mcp page:', error.message);
      return {
        type: 'aliyun-bailian-mcp',
        url,
        title: '',
        description: '',
        tools: [],
        detailLinks: [],
        tables: [],
        codeBlocks: []
      };
    }
  }
}

export default AliyunBailianMcpParser;
