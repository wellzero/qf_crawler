import GenericParser from './generic-parser.js';

/**
 * Investoday API Parser - 针对 data-api.investoday.net 的 API 文档站点解析器
 *
 * 站点为前端 SPA，很多接口路径不会直接作为 <a> 链接展示，
 * 因此在通用解析基础上额外提取页面中的接口路径（如 /api/*、/account/*、/sys/*）。
 */
class InvestodayApiParser extends GenericParser {
  /**
   * 匹配 Investoday API 站点
   * @param {string} url
   * @returns {boolean}
   */
  matches(url) {
    return /^https?:\/\/data-api\.investoday\.net(?:\/|$)/.test(url);
  }

  /**
   * 高于 GenericParser，确保该站点优先使用本解析器
   * @returns {number}
   */
  getPriority() {
    return 105;
  }

  /**
   * 解析页面并补充接口路径提取结果
   * @param {Page} page
   * @param {string} url
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async parse(page, url, options = {}) {
    const baseData = await super.parse(page, url, options);

    try {
      // 给予 SPA 二次渲染时间，减少首屏骨架导致的信息缺失
      await page.waitForTimeout(1500);

      const endpointList = await page.evaluate(() => {
        const methodPattern = /(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+((?:\/|https?:\/\/)[^\s"'`<>]+)/gi;
        const pathPattern = /((?:\/|https?:\/\/)[^\s"'`<>]*(?:api|account|sys|rest)[^\s"'`<>]*)/gi;

        const results = [];
        const dedup = new Set();

        const pushEndpoint = (method, path, source) => {
          if (!path) return;
          const normalizedPath = path.trim().replace(/,+$/, '');
          if (!normalizedPath || normalizedPath.length < 2) return;

          const key = `${method || 'UNKNOWN'}::${normalizedPath}`;
          if (dedup.has(key)) return;
          dedup.add(key);

          results.push({
            method: method || 'UNKNOWN',
            path: normalizedPath,
            source
          });
        };

        // 1) 提取 DOM 文本中的「METHOD + PATH」
        const text = document.body?.innerText || '';
        let match;
        methodPattern.lastIndex = 0;
        while ((match = methodPattern.exec(text)) !== null) {
          pushEndpoint(match[1], match[2], 'body-text');
        }

        // 2) 兜底提取 DOM 文本中疑似接口路径
        pathPattern.lastIndex = 0;
        while ((match = pathPattern.exec(text)) !== null) {
          pushEndpoint('', match[1], 'body-text-path');
        }

        // 3) 额外提取脚本内容中的路径（SPA 常把接口写在打包脚本里）
        const scripts = Array.from(document.querySelectorAll('script'));
        for (const script of scripts) {
          const scriptText = script.textContent || '';

          methodPattern.lastIndex = 0;
          let scriptMethodMatch;
          while ((scriptMethodMatch = methodPattern.exec(scriptText)) !== null) {
            pushEndpoint(scriptMethodMatch[1], scriptMethodMatch[2], 'script-inline');
          }

          pathPattern.lastIndex = 0;
          let scriptPathMatch;
          while ((scriptPathMatch = pathPattern.exec(scriptText)) !== null) {
            pushEndpoint('', scriptPathMatch[1], 'script-inline-path');
          }
        }

        return results;
      });

      if (Array.isArray(endpointList) && endpointList.length > 0) {
        const endpointTable = {
          index: (baseData.tables?.length || 0),
          headers: ['Method', 'Path', 'Source'],
          rows: endpointList.map(item => [item.method, item.path, item.source]),
          caption: 'Extracted API Endpoints'
        };

        baseData.tables = [...(baseData.tables || []), endpointTable];

        const endpointCode = endpointList
          .map(item => `${item.method.padEnd(7, ' ')} ${item.path}`)
          .join('\n');

        baseData.codeBlocks = [
          ...(baseData.codeBlocks || []),
          {
            language: 'text',
            code: endpointCode
          }
        ];
      }

      return {
        ...baseData,
        type: 'investoday-api-doc',
        extractedEndpoints: endpointList?.length || 0
      };
    } catch (error) {
      return {
        ...baseData,
        type: 'investoday-api-doc',
        extractedEndpoints: 0,
        parserWarning: `investoday endpoint extraction failed: ${error.message}`
      };
    }
  }
}

export default InvestodayApiParser;
