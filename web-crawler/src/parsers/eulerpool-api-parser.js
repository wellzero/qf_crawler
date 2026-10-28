import BaseParser from './base-parser.js';
import path from 'path';

/**
 * Eulerpool API Parser - 专门解析 eulerpool.com/developers/api/ 文档页面
 */
class EulerpoolApiParser extends BaseParser {
  /**
   * 匹配 eulerpool API 文档页面
   * @param {string} url - 页面URL
   * @returns {boolean} 是否匹配
   */
  matches(url) {
    return /^https?:\/\/eulerpool\.com\/developers\/api\//.test(url);
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
      pathname = pathname.replace(/^\/developers\/api\//, '');
      pathname = pathname.replace(/\/$/, '');
      const filename = pathname.replace(/\//g, '_');
      return filename || 'api_doc';
    } catch (e) {
      return 'api_doc';
    }
  }

  /**
   * 解析 eulerpool API 文档页面
   * @param {Page} page - Playwright页面对象
   * @param {string} url - 页面URL
   * @param {Object} options - 解析选项
   * @returns {Promise<Object>} 解析后的页面数据
   */
  async parse(page, url, options = {}) {
    try {
      // 等待 SPA 内容加载完成
      await this.waitForContent(page);

      // 提取所有内容
      const data = await page.evaluate(() => {
        const bodyText = document.body.innerText;
        const result = {
          title: '',
          description: '',
          method: 'GET',
          endpoint: '',
          responses: [],
          curlExample: '',
          jsonExample: ''
        };

        const lines = bodyText.split('\n').map(l => l.trim()).filter(l => l);

        // 找到 RESPONSES 的位置
        const responseIdx = lines.findIndex(l => l === 'RESPONSES' || l === 'RESPONSE');

        if (responseIdx >= 0) {
          // 向前查找方法和端点
          for (let i = responseIdx - 1; i >= 0; i--) {
            const line = lines[i];

            // 找到端点 (以 /api/ 开头)
            if (line.startsWith('/api/') && !result.endpoint) {
              result.endpoint = line;
              const endpointIdx = i;

              // 前一行是方法
              if (i > 0 && ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(lines[i - 1])) {
                result.method = lines[i - 1];
              }

              // 端点后一行是标题
              if (endpointIdx + 1 < lines.length) {
                const titleCandidate = lines[endpointIdx + 1];
                if (titleCandidate && !titleCandidate.startsWith('RESPONSE')) {
                  result.title = titleCandidate;
                }
              }

              // 标题后一行是描述
              if (result.title && endpointIdx + 2 < lines.length) {
                const descCandidate = lines[endpointIdx + 2];
                if (descCandidate && !descCandidate.startsWith('RESPONSE') && descCandidate.length > 10) {
                  result.description = descCandidate;
                }
              }

              break; // 找到端点后停止
            }
          }

          // 提取 Responses
          for (let i = responseIdx + 1; i < lines.length; i++) {
            const line = lines[i];
            if (/^\d{3}$/.test(line)) {
              const code = line;
              const desc = (i + 1 < lines.length) ? lines[i + 1] : '';
              if (desc && !/^\d{3}$/.test(desc) && desc !== 'REQUEST' && !desc.includes('RESPONSE')) {
                result.responses.push({ code, description: desc });
                i++;
              } else {
                result.responses.push({ code, description: '' });
              }
            }
            if (line === 'REQUEST' || line === 'Was this helpful?') break;
          }
        }

        // 提取 curl 示例
        const curlIdx = bodyText.indexOf('curl -X');
        if (curlIdx >= 0) {
          let curlEnd = bodyText.indexOf('\n\n', curlIdx);
          if (curlEnd < 0) curlEnd = bodyText.indexOf('Test Request', curlIdx);
          if (curlEnd < 0) curlEnd = Math.min(curlIdx + 500, bodyText.length);
          result.curlExample = bodyText.substring(curlIdx, curlEnd).trim();
        }

        // 提取 JSON 响应示例
        const jsonStart = bodyText.indexOf('[\n  {');
        if (jsonStart < 0) {
          const jsonStartObj = bodyText.indexOf('{\n  "');
          if (jsonStartObj >= 0) {
            // 找到匹配的 }
            let depth = 0;
            let jsonEnd = jsonStartObj;
            for (let i = jsonStartObj; i < bodyText.length; i++) {
              if (bodyText[i] === '{') depth++;
              if (bodyText[i] === '}') depth--;
              if (depth === 0) {
                jsonEnd = i + 1;
                break;
              }
            }
            result.jsonExample = bodyText.substring(jsonStartObj, jsonEnd);
          }
        } else {
          // 找到匹配的 ]
          let depth = 0;
          let jsonEnd = jsonStart;
          for (let i = jsonStart; i < bodyText.length; i++) {
            if (bodyText[i] === '[') depth++;
            if (bodyText[i] === ']') depth--;
            if (depth === 0) {
              jsonEnd = i + 1;
              break;
            }
          }
          result.jsonExample = bodyText.substring(jsonStart, jsonEnd);
        }

        return result;
      });

      return {
        type: 'eulerpool-api',
        url,
        title: data.title,
        description: data.description,
        requestMethod: data.method,
        endpoint: data.endpoint,
        responses: data.responses,
        curlExample: data.curlExample,
        jsonExample: data.jsonExample,
        suggestedFilename: this.generateFilename(url)
      };
    } catch (error) {
      console.error('Failed to parse eulerpool API doc page:', error.message);
      return {
        type: 'eulerpool-api',
        url,
        title: '',
        description: '',
        requestMethod: '',
        endpoint: '',
        responses: [],
        curlExample: '',
        jsonExample: '',
        suggestedFilename: this.generateFilename(url)
      };
    }
  }

  /**
   * 等待 SPA 内容加载完成
   */
  async waitForContent(page) {
    try {
      // 等待网络空闲
      await page.waitForLoadState('networkidle', { timeout: 30000 });

      // 等待关键内容出现
      await page.waitForFunction(() => {
        const text = document.body.innerText;
        // 检查是否有 API 文档的关键标志
        return text.includes('RESPONSES') || text.includes('RESPONSE') ||
               text.includes('/api/') || text.includes('curl');
      }, { timeout: 15000 });

      // 额外等待确保内容完全渲染
      await page.waitForTimeout(2000);
    } catch (error) {
      console.warn('Wait for content timeout, proceeding anyway:', error.message);
    }
  }
}

export default EulerpoolApiParser;