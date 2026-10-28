import BaseParser from './base-parser.js';

/**
 * SerpApi Documentation Parser - 解析 serpapi.com 所有文档页面
 * SerpApi 提供各种搜索引擎的 API 抓取服务
 * 文档页面包含 API 端点、参数说明、响应结构和多个示例
 */
class SerpApiParser extends BaseParser {
  /**
   * 匹配所有 SerpApi 文档页面（排除登录、账户等页面）
   * @param {string} url - 页面URL
   * @returns {boolean} 是否匹配
   */
  matches(url) {
    // 匹配 serpapi.com 下的文档页面，排除账户管理、登录等
    if (!/^https?:\/\/serpapi\.com\//.test(url)) {
      return false;
    }

    // 排除非文档页面
    const excludePatterns = [
      /\/users\//,
      /\/login/,
      /\/signup/,
      /\/dashboard$/,
      /\/plan$/,
      /\/extra-credits/,
      /\/billing/,
      /\/manage-api-key/,
      /\/blog\/page\//,
      /\/legal\//,
      /\/privacy/,
      /\/terms/,
    ];

    for (const pattern of excludePatterns) {
      if (pattern.test(url)) {
        return false;
      }
    }

    return true;
  }

  /**
   * 获取优先级
   * @returns {number} 优先级
   */
  getPriority() {
    return 100;
  }

  /**
   * 根据 URL 生成有意义的文件名
   * @param {string} url - 页面URL
   * @returns {string} 文件名
   */
  generateFilename(url) {
    try {
      const urlObj = new URL(url);
      let pathname = urlObj.pathname;

      // 移除开头和结尾的斜杠
      pathname = pathname.replace(/^\/|\/$/g, '');

      // 如果为空，使用 'home'
      if (!pathname) {
        return 'serpapi-home';
      }

      // 将路径转换为文件名格式
      // 例如: /baidu-news-api -> baidu-news-api
      // 例如: /search-api -> search-api
      return pathname.replace(/\//g, '_') + '-api';
    } catch (e) {
      return 'serpapi-doc';
    }
  }

  /**
   * 从 URL 推断 engine 名称
   * @param {string} url - 页面URL
   * @returns {string} engine 名称
   */
  inferEngine(url) {
    const engineMap = {
      'baidu-news-api': 'baidu_news',
      'baidu-api': 'baidu',
      'google-ads': 'google_ads',
      'google-images': 'google_images',
      'google-news': 'google_news',
      'google-shopping': 'google_shopping',
      'google-scholar': 'google_scholar',
      'google-jobs': 'google_jobs',
      'google-local': 'google_local',
      'google-maps': 'google_maps',
      'google-events': 'google_events',
      'google-patents': 'google_patents',
      'google-books': 'google_books',
      'google-finance': 'google_finance',
      'bing-api': 'bing',
      'bing-news': 'bing_news',
      'bing-images': 'bing_images',
      'bing-videos': 'bing_videos',
      'yahoo-api': 'yahoo',
      'yahoo-news': 'yahoo_news',
      'duckduckgo-api': 'duckduckgo',
      'duckduckgo-ads': 'duckduckgo',
      'yandex-api': 'yandex',
      'yandex-images': 'yandex_images',
      'ebay-api': 'ebay',
      'amazon-api': 'amazon',
      'amazon-product': 'amazon_product',
      'amazon-reviews': 'amazon_reviews',
      'walmart-api': 'walmart',
      'youtube-api': 'youtube',
      'youtube-video': 'youtube_video',
      'youtube-comments': 'youtube_comments',
      'naver-api': 'naver',
      'naver-news': 'naver_news',
      'naver-images': 'naver_images',
      'ai-overview': 'google',
      'search-api': 'google',
      'images-results': 'google_images',
      'videos-results': 'google_videos',
      'visual-stories': 'google_visual_stories',
      'amazon-filters': 'amazon',
    };

    for (const [path, engine] of Object.entries(engineMap)) {
      if (url.includes(path)) {
        return engine;
      }
    }

    return 'google'; // 默认
  }

  /**
   * 解析 SerpApi 文档页面
   * @param {Page} page - Playwright页面对象
   * @param {string} url - 页面URL
   * @param {Object} options - 解析选项
   * @returns {Promise<Object>} 解析后的页面数据
   */
  async parse(page, url, options = {}) {
    try {
      // 等待页面加载完成
      await this.waitForContent(page);

      // 从页面提取内容
      const data = await page.evaluate(() => {
        const result = {
          title: '',
          description: '',
          endpoint: 'https://serpapi.com/search',
          method: 'GET',
          parameters: [],
          responseStructure: [],
          examples: [],
          importantNotes: [],
          rawContent: ''
        };

        // 辅助函数：清理文本中的多余空白
        const cleanText = (text) => {
          return text
            .replace(/\s+/g, ' ')
            .trim();
        };

        // 提取标题
        const h1 = document.querySelector('h1');
        if (h1) {
          result.title = h1.textContent.trim();
        }

        // 提取描述 - 从页面主要内容区域
        const descTexts = [];

        // 方法1: 从页面的主要文本区域提取
        const mainTextAreas = document.querySelectorAll(
          '.box-wrapper.main-text p, .docu-para p, .dashboard-page-header ~ .my-4 p, ' +
          '.left-content p, .documentation-content p, article p'
        );
        mainTextAreas.forEach(p => {
          const text = cleanText(p.textContent);
          if (text.length > 30 && !descTexts.includes(text)) {
            descTexts.push(text);
          }
        });

        // 方法2: 从 meta description 提取
        const metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc && descTexts.length === 0) {
          const content = metaDesc.getAttribute('content');
          if (content) {
            descTexts.push(content);
          }
        }

        result.description = descTexts.slice(0, 5).join('\n\n');

        // 提取参数表格
        const paramTables = document.querySelectorAll('table');
        paramTables.forEach(table => {
          const rows = table.querySelectorAll('tr');
          if (rows.length < 2) return;

          const headerRow = rows[0];
          const headerText = headerRow.textContent.toLowerCase();

          // 检查是否是参数表格
          if (headerText.includes('parameter') || headerText.includes('参数') ||
              headerText.includes('name') || headerText.includes('required')) {

            // 确定 header 列的索引
            const headerCells = headerRow.querySelectorAll('th, td');
            const headers = Array.from(headerCells).map(cell => cell.textContent.trim().toLowerCase());

            const nameIdx = headers.findIndex(h => h.includes('parameter') || h.includes('name') || h.includes('参数'));
            const requiredIdx = headers.findIndex(h => h.includes('required') || h.includes('必选'));
            const typeIdx = headers.findIndex(h => h.includes('type') || h.includes('类型'));
            const descIdx = headers.findIndex(h => h.includes('description') || h.includes('说明'));

            for (let i = 1; i < rows.length; i++) {
              const cells = rows[i].querySelectorAll('td, th');
              if (cells.length < 2) continue;

              const name = nameIdx >= 0 ? (cells[nameIdx]?.textContent || '').trim() : (cells[0]?.textContent || '').trim();
              const required = requiredIdx >= 0 ? (cells[requiredIdx]?.textContent || '').trim() : '';
              const type = typeIdx >= 0 ? (cells[typeIdx]?.textContent || '').trim() : '';
              const desc = descIdx >= 0 ? (cells[descIdx]?.textContent || '').trim() :
                          (cells[cells.length - 1]?.textContent || '').trim();

              if (name && !name.toLowerCase().includes('parameter') && !name.toLowerCase().includes('参数')) {
                result.parameters.push({ name, required, type, description: desc });
              }
            }
          }
        });

        // 提取 API Examples
        const apiExamplesSection = document.getElementById('api-examples');
        if (apiExamplesSection) {
          const exampleWrappers = document.querySelectorAll('.box-wrapper[id^="api-examples-"]');

          exampleWrappers.forEach(wrapper => {
            const example = {
              title: '',
              description: '',
              requestParams: {},
              responseJson: ''
            };

            const h3 = wrapper.querySelector('h3');
            if (h3) {
              example.title = h3.textContent.trim();
            }

            const paraDiv = wrapper.querySelector('.docu-para');
            if (paraDiv) {
              let html = paraDiv.innerHTML;
              html = html.replace(/<br\s*\/?>/gi, '\n');
              const tempDiv = document.createElement('div');
              tempDiv.innerHTML = html;
              example.description = tempDiv.textContent
                .replace(/\n+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            }

            // 提取请求参数
            const integrationsDiv = wrapper.querySelector('[data-react-class="Integrations"]');
            if (integrationsDiv) {
              const reactProps = integrationsDiv.getAttribute('data-react-props');
              if (reactProps) {
                try {
                  const props = JSON.parse(reactProps);
                  if (props.params) {
                    example.requestParams = props.params;
                  }
                } catch (e) {
                  // 忽略解析错误
                }
              }
            }

            // 提取 JSON 响应
            const codeBlock = wrapper.querySelector('pre code.language-json, pre code');
            if (codeBlock) {
              example.responseJson = codeBlock.textContent.trim();
            }

            if (example.title || example.responseJson) {
              result.examples.push(example);
            }
          });
        }

        // 如果没有找到示例，尝试从其他代码块提取
        if (result.examples.length === 0) {
          const codeBlocks = document.querySelectorAll('pre code.language-json, pre.json code, pre code');
          codeBlocks.forEach((codeBlock, index) => {
            const code = codeBlock.textContent.trim();
            if (code.startsWith('{') && code.includes('"')) {
              result.examples.push({
                title: `Example ${index + 1}`,
                description: '',
                requestParams: {},
                responseJson: code
              });
            }
          });
        }

        // 提取重要说明
        const infoBoxes = document.querySelectorAll('.box-wrapper.main-text, .docu-para, .alert, .note');
        infoBoxes.forEach(box => {
          const text = cleanText(box.textContent);
          if (text.length > 50 && text.length < 1000) {
            // 检查是否包含重要信息关键词
            if (text.includes('Note:') || text.includes('Important:') ||
                text.includes('Warning:') || text.includes('注意') ||
                text.includes('重要') || text.includes('API') ||
                text.includes('limit') || text.includes('rate')) {
              if (!result.importantNotes.includes(text)) {
                result.importantNotes.push(text);
              }
            }
          }
        });

        // 提取响应结构表格
        const allTables = document.querySelectorAll('table');
        allTables.forEach(table => {
          const rows = table.querySelectorAll('tr');
          if (rows.length < 2) return;

          const headerText = rows[0].textContent.toLowerCase();
          if (headerText.includes('field') || headerText.includes('response') ||
              headerText.includes('返回') || headerText.includes('result')) {

            const headerCells = rows[0].querySelectorAll('th, td');
            const headers = Array.from(headerCells).map(cell => cell.textContent.trim().toLowerCase());

            const pathIdx = headers.findIndex(h => h.includes('field') || h.includes('path') || h.includes('name'));
            const typeIdx = headers.findIndex(h => h.includes('type') || h.includes('类型'));
            const descIdx = headers.findIndex(h => h.includes('description') || h.includes('说明'));

            for (let i = 1; i < rows.length; i++) {
              const cells = rows[i].querySelectorAll('td, th');
              if (cells.length < 2) continue;

              const path = pathIdx >= 0 ? (cells[pathIdx]?.textContent || '').trim() : (cells[0]?.textContent || '').trim();
              const type = typeIdx >= 0 ? (cells[typeIdx]?.textContent || '').trim() : '';
              const desc = descIdx >= 0 ? (cells[descIdx]?.textContent || '').trim() :
                          (cells[cells.length - 1]?.textContent || '').trim();

              if (path && !path.toLowerCase().includes('field')) {
                result.responseStructure.push({ path, type, description: desc });
              }
            }
          }
        });

        // 提取原始内容作为备份
        const allText = [];
        document.querySelectorAll('h1, h2, h3, p, pre code, li').forEach(el => {
          const text = el.textContent.trim();
          if (text && text.length > 10 && text.length < 5000) {
            allText.push(text);
          }
        });
        result.rawContent = allText.slice(0, 100).join('\n\n');

        return result;
      });

      const engine = this.inferEngine(url);

      return {
        type: 'serpapi-doc',
        url,
        title: data.title,
        description: data.description,
        endpoint: data.endpoint,
        engine,
        method: data.method,
        parameters: data.parameters,
        responseStructure: data.responseStructure,
        examples: data.examples,
        importantNotes: data.importantNotes,
        rawContent: data.rawContent,
        suggestedFilename: this.generateFilename(url)
      };
    } catch (error) {
      console.error('Failed to parse SerpApi page:', error.message);
      return {
        type: 'serpapi-doc',
        url,
        title: '',
        description: '',
        endpoint: 'https://serpapi.com/search',
        engine: 'google',
        method: 'GET',
        parameters: [],
        responseStructure: [],
        examples: [],
        importantNotes: [],
        rawContent: '',
        suggestedFilename: this.generateFilename(url)
      };
    }
  }

  /**
   * 等待页面内容加载完成
   */
  async waitForContent(page) {
    try {
      await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
      await page.waitForSelector('h1, .box-wrapper, .documentation-content, main', { timeout: 15000 });
      await page.waitForTimeout(2000);
    } catch (error) {
      console.warn('Wait for content timeout, proceeding anyway:', error.message);
    }
  }
}

export default SerpApiParser;