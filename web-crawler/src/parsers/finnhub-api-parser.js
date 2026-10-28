import BaseParser from './base-parser.js';
import path from 'path';

/**
 * Finnhub API Parser - 专门解析 finnhub.io/docs/api 文档页面
 * Finnhub 使用 SPA 架构，所有 API 文档在同一页面，通过 URL 定位到对应的 .docs-text 区域
 * 注意：finnhub 的 URL 和实际 API 标题/路径可能不完全对应
 */
class FinnhubApiParser extends BaseParser {
  /**
   * 匹配 finnhub API 文档页面
   * @param {string} url - 页面URL
   * @returns {boolean} 是否匹配
   */
  matches(url) {
    return /^https?:\/\/finnhub\.io\/docs\/api/.test(url);
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
      // 移除 /docs/api 前缀
      pathname = pathname.replace(/^\/docs\/api\/?/, '');
      pathname = pathname.replace(/\/$/, '');
      const filename = pathname.replace(/\//g, '_') || 'api_overview';
      return filename;
    } catch (e) {
      return 'api_doc';
    }
  }

  /**
   * 从 URL 提取 API 路径
   * @param {string} url - 页面URL
   * @returns {string} API 路径（不含前导斜杠）
   */
  extractApiPath(url) {
    try {
      const urlObj = new URL(url);
      let pathname = urlObj.pathname;
      // 移除 /docs/api 前缀
      pathname = pathname.replace(/^\/docs\/api\/?/, '');
      return pathname;
    } catch (e) {
      return '';
    }
  }

  /**
   * 解析 finnhub API 文档页面
   * @param {Page} page - Playwright页面对象
   * @param {string} url - 页面URL
   * @param {Object} options - 解析选项
   * @returns {Promise<Object>} 解析后的页面数据
   */
  async parse(page, url, options = {}) {
    try {
      // 等待 SPA 内容加载完成
      await this.waitForContent(page);

      // 从 URL 提取 API 路径
      const apiPath = this.extractApiPath(url);

      // 从页面提取内容
      const data = await page.evaluate((targetPath) => {
        const result = {
          title: '',
          description: '',
          method: 'GET',
          endpoint: '',
          parameters: [],
          responses: [],
          codeExamples: [],
          sampleResponse: '',
          curlExample: '',
          jsonExample: '',
          rawContent: ''
        };

        // 如果是主页面（没有特定 API 路径）
        if (!targetPath) {
          const firstDoc = document.querySelector('.docs-text');
          if (firstDoc) {
            result.title = 'API Overview';
            result.description = firstDoc.innerText.trim();
          }
          return result;
        }

        // 策略1：通过 .docs-text 第一行标题直接匹配
        const allDocTexts = document.querySelectorAll('.docs-text');
        const normalizedTarget = targetPath.toLowerCase().replace(/-/g, ' ');

        // 辅助函数：获取 .docs-text 对应的 .code-block 内容
        const getCodeBlocks = (docText) => {
          let codeContent = '';
          // 查找父级 .row 容器
          let parent = docText.parentElement;
          while (parent && !parent.classList.contains('row')) {
            parent = parent.parentElement;
          }
          if (parent) {
            const codeBlocks = parent.querySelectorAll('.code-block');
            for (const block of codeBlocks) {
              // 获取 code-block 的内容，过滤掉行号
              let text = block.innerText;
              // 过滤掉只包含数字的行（行号）
              const lines = text.split('\n');
              const filteredLines = lines.filter(line => !/^\d+$/.test(line.trim()));
              text = filteredLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
              codeContent += '\n\n' + text;
            }
          }
          return codeContent;
        };

        for (const docText of allDocTexts) {
          const text = docText.innerText;
          const firstLine = text.split('\n')[0].trim().toLowerCase();
          const normalizedFirstLine = firstLine.replace(/[^a-z0-9 ]/g, '').trim();

          // 精确匹配（去掉 premium, premium access required 等后缀）
          const firstLineCore = normalizedFirstLine
            .replace(/ premium access required$/g, '')
            .replace(/ premium$/g, '')
            .replace(/ premium required$/g, '')
            .trim();
          const targetCore = normalizedTarget.trim();

          // 去掉空格后比较
          const firstLineNoSpace = normalizedFirstLine.replace(/ /g, '');
          const targetNoSpace = targetCore.replace(/ /g, '');
          const firstLineCoreNoSpace = firstLineCore.replace(/ /g, '');

          // 优先：精确匹配（去掉 premium 后缀后完全相等）
          if (firstLineCore === targetCore || firstLineCoreNoSpace === targetNoSpace) {
            result.rawContent = text + getCodeBlocks(docText);
            result.title = text.split('\n')[0].trim();
            break;
          }

          // 其次：标题的核心词都出现在 URL 中
          const titleWords = firstLineCore.split(/\s+/).filter(w => w.length > 2);
          const titleMatchCount = titleWords.filter(w => targetCore.includes(w)).length;

          if (titleWords.length >= 2 && titleMatchCount === titleWords.length) {
            const titleStr = firstLineCore.replace(/ /g, '');
            const targetStr = targetCore.replace(/ /g, '');

            // 连续匹配优先
            if (targetStr.includes(titleStr)) {
              // 计算匹配位置，优先选择匹配 URL 末尾的
              const matchIndex = targetStr.indexOf(titleStr);

              // 如果还没有结果，或者新的匹配位置更靠后
              if (!result.rawContent || matchIndex > (result._matchIndex || -1)) {
                result.rawContent = text + getCodeBlocks(docText);
                result.title = text.split('\n')[0].trim();
                result._matchIndex = matchIndex;
              }

              // 如果匹配在 URL 的最后部分，直接退出
              if (matchIndex + titleStr.length >= targetStr.length - 3) {
                break;
              }
            }
          }
        }

        // 清理临时字段
        if (result._matchIndex !== undefined) {
          delete result._matchIndex;
        }

        // 策略1.5：如果没找到，尝试通过 URL 到标题的映射
        if (!result.rawContent) {
          // finnhub URL 到实际标题的映射
          const urlToTitleMapping = {
            'symbol-search': 'Symbol Lookup',
            'stock-symbols': 'Stock Symbol',
            'market-status': 'Market Status',
            'market-holiday': 'Market Holiday',
            'company-profile': 'Company Profile',
            'company-profile-2': 'Company Profile 2',
            'company-executive': 'Company Executive',
            'market-news': 'Market News',
            'company-news': 'Company News',
            'press-releases': 'Major Press Releases',
            'news-sentiment': 'News Sentiment',
            'peers': 'Peers',
            'basic-financials': 'Basic Financials',
            'ownership': 'Ownership',
            'fund-ownership': 'Fund Ownership',
            'institutional-profile': 'Institutional Profile',
            'institutional-portfolio': 'Institutional Portfolio',
            'institutional-ownership': 'Institutional Ownership',
            'insider-transactions': 'Insider Transactions',
            'insider-sentiment': 'Insider Sentiment',
            'financials': 'Financial Statements',
            'financials-as-reported': 'Financials As Reported',
            'revenue-breakdown': 'Revenue Breakdown',
            'sec-filings': 'SEC Filings',
            'sec-sentiment-analysis': 'SEC Sentiment Analysis',
            'similarity-index': 'Similarity Index',
            'ipo-calendar': 'IPO Calendar',
            'dividends': 'Dividends',
            'sector-metrics': 'Sector Metrics',
            'price-metrics': 'Price Metrics',
            'symbol-change': 'Symbol Change',
            'isin-change': 'ISIN Change',
            'historical-market-cap': 'Historical Market Cap',
            'historical-employee': 'Historical Employee Count',
            'recommendation-trends': 'Recommendation Trends',
            'price-target': 'Price Target',
            'upgrade-downgrade': 'Stock Upgrade/Downgrade',
            'revenue-estimates': 'Revenue Estimates',
            'eps-estimates': 'Earnings Estimates',
            'ebitda-estimates': 'EBITDA Estimates',
            'ebit-estimates': 'EBIT Estimates',
            'earnings-surprises': 'Earnings Surprises',
            'earnings-calendar': 'Earnings Calendar',
            'quote': 'Quote',
            'candles-ohlcv': 'Stock Candles',
            'tick-trade-data': 'Tick Data Premium',
            'stock-tick': 'Tick Data Premium',
            'stock-nbbo': 'Historical NBBO Premium',
            'historical-nbbo': 'Historical NBBO Premium',
            'last-bid-ask': 'Last Bid-Ask',
            'splits': 'Splits',
            'dividends-2': 'Dividends 2 (Basic)',
            'indices-constituents': 'Indices Constituents',
            'historical-constituents': 'Indices Historical Constituents',
            'etfs-profile': 'ETFs Profile',
            'etfs-holdings': 'ETFs Holdings',
            'etfs-sector': 'ETFs Sector Exposure',
            'etfs-country': 'ETFs Country Exposure',
            'etfs-allocation': 'ETFs Equity Allocation',
            'mutual-funds-profile': 'Mutual Funds Profile',
            'mutual-funds-holdings': 'Mutual Funds Holdings',
            'mutual-funds-sector': 'Mutual Funds Sector Exposure',
            'mutual-funds-country': 'Mutual Funds Country Exposure',
            'mutual-funds-eet': 'Mutual Funds EET',
            'mutual-funds-eet-pai': 'Mutual Funds EET PAI',
            'bond-profile': 'Bond Profile',
            'bond-price': 'Bond price data',
            'bond-tick': 'Bond Tick Data Premium',
            'yield-curve': 'Bond Yield Curve',
            'forex-exchanges': 'Forex Exchanges',
            'forex-symbols': 'Forex Symbol',
            'forex-candles': 'Forex Candles',
            'forex-rates': 'Forex rates',
            'crypto-exchanges': 'Crypto Exchanges',
            'crypto-symbols': 'Crypto Symbol',
            'crypto-profile': 'Crypto Profile',
            'crypto-candles': 'Crypto Candles',
            'pattern-recognition': 'Pattern Recognition',
            'support-resistance': 'Support/Resistance',
            'aggregate-indicators': 'Aggregate Indicators',
            'technical-indicators': 'Technical Indicators',
            'transcripts-list': 'Earnings Call Transcripts List',
            'transcripts': 'Earnings Call Transcripts',
            'earnings-call-live': 'Earnings Call Audio Live',
            'company-presentation': 'Company Presentation',
            'social-sentiment': 'Social Sentiment',
            'investment-themes': 'Investment Themes (Thematic Investing)',
            'supply-chain': 'Supply Chain Relationships',
            'company-esg': 'Company ESG Scores',
            'historical-esg': 'Historical ESG Scores',
            'earnings-quality-score': 'Company Earnings Quality Score',
            'uspto-patents': 'USPTO Patents',
            'visa-application': 'H1-B Visa Application',
            'senate-lobbying': 'Senate Lobbying',
            'usa-spending': 'USA Spending',
            'congressional-trading': 'Congressional Trading',
            'bank-branch': 'Bank Branch List',
            'fda-calendar': 'FDA Committee Meeting Calendar',
            'ai-copilot': 'AI Copilot',
            'revenue-breakdown-kpi': 'Revenue Breakdown & KPI',
            'newsroom': 'Newsroom',
            'international-filings': 'International Filings',
            'filings-search': 'Global Filings Search',
            'search-in-filing': 'Search In Filing',
            'search-filter': 'Search Filter',
            'download-filings': 'Download Filings',
            'country': 'Country Metadata',
            'economic-calendar': 'Economic Calendar',
            'economic-codes': 'Economic Code',
            'economic': 'Economic Data'
          };

          const mappedTitle = urlToTitleMapping[targetPath];
          if (mappedTitle) {
            const normalizedMapped = mappedTitle.toLowerCase();
            for (const docText of allDocTexts) {
              const text = docText.innerText;
              const firstLine = text.split('\n')[0].trim().toLowerCase();
              if (firstLine === normalizedMapped) {
                result.rawContent = text + getCodeBlocks(docText);
                result.title = text.split('\n')[0].trim();
                break;
              }
            }
          }
        }

        // 策略2：通过 docSchema 匹配并补全结构化字段（无论是否命中 rawContent）
        if (window.docSchema && window.docSchema.paths) {
          const schema = window.docSchema;
          const basePath = schema.basePath || '/api/v1';

          // 建立 URL 路径到 docSchema 路径的映射
          // finnhub 的映射规则：
          // - symbol-search -> /search
          // - stock-symbols -> /stock/symbol
          // - quote -> /quote
          const urlToSchemaMapping = {
            'symbol-search': '/search',
            'stock-symbols': '/stock/symbol',
            'market-status': '/stock/market-status',
            'market-holiday': '/stock/market-holiday',
            'company-profile': '/stock/profile',
            'company-profile-2': '/stock/profile2',
            'company-executive': '/stock/executive',
            'market-news': '/news',
            'company-news': '/company-news',
            'press-releases': '/press-releases',
            'news-sentiment': '/news-sentiment',
            'peers': '/stock/peers',
            'basic-financials': '/stock/metric',
            'ownership': '/stock/ownership',
            'fund-ownership': '/ownership/mutual-fund/holdings',
            'institutional-profile': '/institutional/profile',
            'institutional-portfolio': '/institutional/portfolio',
            'institutional-ownership': '/institutional/ownership',
            'insider-transactions': '/stock/insider-transactions',
            'insider-sentiment': '/stock/insider-sentiment',
            'financials': '/stock/financials',
            'financials-as-reported': '/stock/financials-reported',
            'revenue-breakdown': '/stock/revenue-breakdown',
            'sec-filings': '/stock/filings',
            'sec-sentiment-analysis': '/stock/sec-sentiment',
            'similarity-index': '/stock/similarity-index',
            'ipo-calendar': '/calendar/ipo',
            'dividends': '/stock/dividend',
            'sector-metrics': '/sector/metrics',
            'price-metrics': '/stock/price-metric',
            'symbol-change': '/ca/symbol-change',
            'isin-change': '/ca/isin-change',
            'historical-market-cap': '/stock/historical-market-cap',
            'historical-employee': '/stock/historical-employee',
            'recommendation-trends': '/stock/recommendation',
            'price-target': '/stock/price-target',
            'upgrade-downgrade': '/stock/upgrade-downgrade',
            'revenue-estimates': '/stock/revenue-estimate',
            'eps-estimates': '/stock/eps-estimate',
            'ebitda-estimates': '/stock/ebitda-estimate',
            'ebit-estimates': '/stock/ebit-estimate',
            'earnings-surprises': '/stock/earnings',
            'earnings-calendar': '/calendar/earnings',
            'quote': '/quote',
            'candles-ohlcv': '/stock/candle',
            'tick-trade-data': '/stock/tick',
            'historical-nbbo': '/stock/nbbo',
            'last-bid-ask': '/stock/bidask',
            'splits': '/stock/split',
            'dividends-2': '/stock/dividend2',
            'indices-constituents': '/index/constituents',
            'historical-constituents': '/index/historical-constituents',
            'etfs-profile': '/etf/profile',
            'etfs-holdings': '/etf/holdings',
            'etfs-sector': '/etf/sector',
            'etfs-country': '/etf/country',
            'etfs-allocation': '/etf/allocation',
            'mutual-funds-profile': '/mutual-fund/profile',
            'mutual-funds-holdings': '/mutual-fund/holdings',
            'mutual-funds-sector': '/mutual-fund/sector',
            'mutual-funds-country': '/mutual-fund/country',
            'mutual-funds-eet': '/mutual-fund/eet',
            'mutual-funds-eet-pai': '/mutual-fund/eet-pai',
            'bond-profile': '/bond/profile',
            'bond-price': '/bond/price',
            'bond-tick': '/bond/tick',
            'yield-curve': '/bond/yield-curve',
            'forex-exchanges': '/forex/exchange',
            'forex-symbols': '/forex/symbol',
            'forex-candles': '/forex/candle',
            'forex-rates': '/forex/rates',
            'crypto-exchanges': '/crypto/exchange',
            'crypto-symbols': '/crypto/symbol',
            'crypto-profile': '/crypto/profile',
            'crypto-candles': '/crypto/candle',
            'pattern-recognition': '/scan/pattern',
            'support-resistance': '/scan/support-resistance',
            'aggregate-indicators': '/scan/aggregate-indicator',
            'technical-indicators': '/indicator',
            'transcripts-list': '/stock/transcripts-list',
            'transcripts': '/stock/transcripts',
            'earnings-call-live': '/stock/transcripts-audio-live',
            'company-presentation': '/stock/presentation',
            'social-sentiment': '/stock/social-sentiment',
            'investment-themes': '/stock/investment-themes',
            'supply-chain': '/stock/supply-chain',
            'company-esg': '/stock/esg',
            'historical-esg': '/stock/historical-esg',
            'earnings-quality-score': '/stock/earnings-quality-score',
            'uspto-patents': '/stock/uspto-patent',
            'visa-application': '/stock/visa-application',
            'senate-lobbying': '/stock/lobbying',
            'usa-spending': '/stock/usa-spending',
            'congressional-trading': '/stock/congressional-trading',
            'bank-branch': '/bank-branch',
            'fda-calendar': '/fda-advisory-committee-calendar',
            'ai-copilot': '/ai-chat',
            'revenue-breakdown-kpi': '/stock/revenue-breakdown2',
            'newsroom': '/newsroom',
            'international-filings': '/international-filings',
            'filings-search': '/global-filings/search',
            'search-in-filing': '/global-filings/search-in-filing',
            'search-filter': '/global-filings/filter',
            'download-filings': '/global-filings/download',
            'country': '/country',
            'economic-calendar': '/calendar/economic',
            'economic-codes': '/economic/code',
            'economic': '/economic'
          };

          // 查找对应的 schema 路径
          let schemaPath = urlToSchemaMapping[targetPath];

          // 如果没有映射，尝试直接使用路径
          if (!schemaPath) {
            schemaPath = '/' + targetPath;
          }

          // 在 docSchema.paths 中查找
          let foundSpec = null;
          let foundMethod = null;
          let foundPath = null;

          // 尝试精确匹配
          if (schema.paths[schemaPath]) {
            foundPath = schemaPath;
          } else {
            // 尝试模糊匹配
            for (const pathKey of Object.keys(schema.paths)) {
              const normalizedKey = pathKey.replace(/[^a-z0-9]/gi, '').toLowerCase();
              const normalizedSearch = schemaPath.replace(/[^a-z0-9]/gi, '').toLowerCase();
              if (normalizedKey === normalizedSearch || normalizedKey.endsWith(normalizedSearch)) {
                foundPath = pathKey;
                break;
              }
            }
          }

          if (foundPath && schema.paths[foundPath]) {
            for (const [method, spec] of Object.entries(schema.paths[foundPath])) {
              if (['get', 'post', 'put', 'delete', 'patch'].includes(method)) {
                foundMethod = method;
                foundSpec = spec;
                break;
              }
            }
          }

          if (foundSpec) {
            result.method = foundMethod.toUpperCase();
            result.endpoint = basePath + foundPath;

            if (foundSpec.description) {
              result.description = foundSpec.description.replace(/<[^>]*>/g, '').trim();
            }

            // 从 operationId 或 summary 提取标题（仅在未从页面命中标题时使用）
            if (!result.title) {
              if (foundSpec.operationId) {
                result.title = foundSpec.operationId;
              } else if (foundSpec.summary) {
                result.title = foundSpec.summary;
              } else {
                result.title = targetPath.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
              }
            }

            // 尝试从页面获取对应的原始内容
            const normalizedTitle = result.title.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
            for (const docText of allDocTexts) {
              const text = docText.innerText;
              const firstLine = text.split('\n')[0].trim().toLowerCase();
              const normalizedFirstLine = firstLine.replace(/[^a-z0-9 ]/g, '').trim();
              // 标准化后比较（移除特殊字符，支持部分匹配）
              if (normalizedFirstLine === normalizedTitle ||
                  normalizedFirstLine.includes(normalizedTitle) ||
                  normalizedTitle.includes(normalizedFirstLine)) {
                result.rawContent = text + getCodeBlocks(docText);
                // 使用页面上的标题（可能包含 Premium 等后缀）
                result.title = text.split('\n')[0].trim();
                break;
              }
            }

            if (foundSpec.parameters && foundSpec.parameters.length > 0) {
              result.parameters = foundSpec.parameters.map(p => ({
                name: p.name || '',
                in: p.in || '',
                required: p.required || false,
                type: p.type || (p.schema && p.schema.type) || '',
                description: (p.description || '').replace(/<[^>]*>/g, '').trim()
              }));
            }

            if (foundSpec.responses) {
              for (const [code, response] of Object.entries(foundSpec.responses)) {
                result.responses.push({
                  code: code,
                  description: (response.description || '').replace(/<[^>]*>/g, '').trim()
                });
              }
            }

            // 优先从 docSchema 抽取多语言示例代码
            if (foundSpec.sampleCode && typeof foundSpec.sampleCode === 'object') {
              const languageMap = {
                curl: 'cURL',
                javascript: 'JavaScript',
                python: 'Python',
                go: 'Go',
                php: 'PHP',
                ruby: 'Ruby',
                kotlin: 'Kotlin',
                java: 'Java',
                rust: 'Rust',
                swift: 'Swift',
                typescript: 'TypeScript'
              };

              const preferredOrder = ['curl', 'javascript', 'python', 'go', 'php', 'ruby', 'kotlin', 'java', 'rust', 'swift', 'typescript'];

              preferredOrder.forEach(key => {
                const code = foundSpec.sampleCode[key];
                if (!code || typeof code !== 'string') {
                  return;
                }
                const trimmedCode = code.trim();
                if (!trimmedCode || trimmedCode === 'autoGenerated') {
                  return;
                }

                result.codeExamples.push({
                  language: languageMap[key] || key,
                  code: trimmedCode
                });
              });

              // 保持向后兼容：保留 curl/python 示例到旧字段
              const curlCode = foundSpec.sampleCode.curl;
              if (curlCode && typeof curlCode === 'string' && curlCode.trim() && curlCode.trim() !== 'autoGenerated') {
                result.curlExample = curlCode.trim();
              }
            }

            if (foundSpec.sampleResponse && typeof foundSpec.sampleResponse === 'string') {
              result.sampleResponse = foundSpec.sampleResponse.trim();
              result.jsonExample = result.sampleResponse;
            }
          }
        }

        // 策略3：如果还是没找到，尝试通过关键词搜索 .docs-text
        if (!result.rawContent && !result.title) {
          const searchKeywords = targetPath.split('-');

          for (const docText of allDocTexts) {
            const text = docText.innerText;
            const textLower = text.toLowerCase();

            // 检查是否包含关键词
            let matchCount = 0;
            for (const keyword of searchKeywords) {
              if (textLower.includes(keyword)) {
                matchCount++;
              }
            }

            // 如果匹配多个关键词，可能是目标
            if (matchCount >= Math.ceil(searchKeywords.length / 2)) {
              result.rawContent = text + getCodeBlocks(docText);
              result.title = text.split('\n')[0].trim();
              break;
            }
          }
        }

        // 解析 .docs-text 内容
        if (result.rawContent) {
          const lines = result.rawContent.split('\n').map(l => l.trim()).filter(l => l);

          // 查找 Method
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].toLowerCase();
            if (line === 'method:') {
              result.method = lines[i + 1] || 'GET';
            }
            // 查找 Examples 中的 endpoint
            if (line === 'examples:') {
              for (let j = i + 1; j < lines.length && j < i + 5; j++) {
                if (lines[j].startsWith('/')) {
                  result.endpoint = lines[j];
                  break;
                }
              }
            }
          }

          // 提取描述（标题后的非结构化文本）
          if (!result.description) {
            let descLines = [];
            let inDesc = false;
            for (let i = 1; i < lines.length; i++) {
              const line = lines[i].toLowerCase();
              if (line === 'method:' || line === 'examples:' || line === 'arguments:' ||
                  line === 'premium:' || line.startsWith('response')) {
                break;
              }
              if (!inDesc && lines[i].length > 20) {
                inDesc = true;
              }
              if (inDesc) {
                descLines.push(lines[i]);
              }
            }
            if (descLines.length > 0) {
              result.description = descLines.join(' ');
            }
          }
        }

        return result;
      }, apiPath);

      return {
        type: 'finnhub-api',
        url,
        title: data.title,
        description: data.description,
        requestMethod: data.method,
        endpoint: data.endpoint,
        parameters: data.parameters,
        responses: data.responses,
        codeExamples: data.codeExamples,
        sampleResponse: data.sampleResponse,
        curlExample: data.curlExample,
        jsonExample: data.jsonExample,
        rawContent: data.rawContent,
        suggestedFilename: this.generateFilename(url)
      };
    } catch (error) {
      console.error('Failed to parse finnhub API doc page:', error.message);
      return {
        type: 'finnhub-api',
        url,
        title: '',
        description: '',
        requestMethod: '',
        endpoint: '',
        parameters: [],
        responses: [],
        codeExamples: [],
        sampleResponse: '',
        curlExample: '',
        jsonExample: '',
        rawContent: '',
        suggestedFilename: this.generateFilename(url)
      };
    }
  }

  /**
   * 等待 SPA 内容加载完成
   */
  async waitForContent(page) {
    try {
      await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
      await page.waitForSelector('.docs-text', { timeout: 15000 });
      await page.waitForTimeout(2000);
    } catch (error) {
      console.warn('Wait for content timeout, proceeding anyway:', error.message);
    }
  }
}

export default FinnhubApiParser;
