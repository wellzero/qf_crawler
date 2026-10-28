import BaseParser from './base-parser.js';

/**
 * 三花量化 API Parser - 解析三花量化股票API文档
 * 文档地址: http://www.sanhulianghua.com/index.php?do=page_base_hsa_gupiao
 */
class SanhulianghuaParser extends BaseParser {
  /**
   * 匹配三花量化API文档页面
   * @param {string} url - 页面URL
   * @returns {boolean} 是否匹配
   */
  matches(url) {
    return /^https?:\/\/www\.sanhulianghua\.com\/index\.php/.test(url);
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
      const doParam = urlObj.searchParams.get('do') || '';
      if (doParam) {
        return doParam.replace(/^page_/, '');
      }
      return 'sanhulianghua-api';
    } catch {
      return 'sanhulianghua-api';
    }
  }

  /**
   * 解析三花量化API文档页面
   * @param {Page} page - Playwright页面对象
   * @param {string} url - 页面URL
   * @param {Object} options - 解析选项
   * @returns {Promise<Object>} 解析后的页面数据
   */
  async parse(page, url, options = {}) {
    try {
      await this.waitForContent(page);

      const data = await page.evaluate(() => {
        const parseParameterTable = (table) => {
          if (!table || table.length < 2) return [];

          const headers = table[0];
          const params = [];

          const nameIdx = headers.findIndex(h => h.includes('参数名称') || h.includes('名称'));
          const descIdx = headers.findIndex(h => h.includes('描述'));
          const typeIdx = headers.findIndex(h => h.includes('类型'));
          const defaultIdx = headers.findIndex(h => h.includes('默认'));
          const requiredIdx = headers.findIndex(h => h.includes('必须'));
          const rangeIdx = headers.findIndex(h => h.includes('取值'));
          const exampleIdx = headers.findIndex(h => h.includes('示例'));

          for (let i = 1; i < table.length; i++) {
            const row = table[i];
            if (row.length > 0) {
              const param = {
                name: nameIdx >= 0 ? row[nameIdx] || '' : row[0] || '',
                description: descIdx >= 0 ? row[descIdx] || '' : '',
                type: typeIdx >= 0 ? row[typeIdx] || 'string' : 'string',
                required: requiredIdx >= 0 ? row[requiredIdx] === '是' : false,
                default: defaultIdx >= 0 ? row[defaultIdx] || '' : '',
                example: exampleIdx >= 0 ? row[exampleIdx] || '' : ''
              };

              if (rangeIdx >= 0 && row[rangeIdx]) {
                param.range = row[rangeIdx];
              }

              params.push(param);
            }
          }

          return params;
        };

        const parseResponseTable = (table) => {
          if (!table || table.length < 2) return [];

          const headers = table[0];
          const fields = [];

          const nameIdx = headers.findIndex(h => h.includes('数据名称') || h.includes('名称') || h.includes('字段'));
          const descIdx = headers.findIndex(h => h.includes('描述'));
          const typeIdx = headers.findIndex(h => h.includes('类型'));
          const exampleIdx = headers.findIndex(h => h.includes('示例'));
          const noteIdx = headers.findIndex(h => h.includes('备注'));

          for (let i = 1; i < table.length; i++) {
            const row = table[i];
            if (row.length > 0) {
              const name = nameIdx >= 0 ? row[nameIdx] || '' : row[0] || '';
              const isNested = name.startsWith('-');
              const fieldName = isNested ? name.replace(/^-+\s*/, '') : name;

              fields.push({
                name: fieldName,
                description: descIdx >= 0 ? row[descIdx] || '' : '',
                type: typeIdx >= 0 ? row[typeIdx] || 'string' : 'string',
                example: exampleIdx >= 0 ? row[exampleIdx] || '' : '',
                note: noteIdx >= 0 ? row[noteIdx] || '' : '',
                isNested
              });
            }
          }

          return fields;
        };
        const result = {
          title: '',
          description: '',
          endpoints: [],
          method: 'GET',
          parameters: [],
          responses: [],
          rawContent: ''
        };

        // 提取标题
        const h2 = document.querySelector('h2');
        if (h2) {
          result.title = h2.textContent.trim();
        }
        if (!result.title) {
          result.title = document.title.split('|')[0].trim();
        }

        // 提取API信息段落
        const paragraphs = [];
        document.querySelectorAll('p').forEach(p => {
          const text = p.textContent.trim();
          if (text.length > 5) {
            paragraphs.push(text);
          }
        });

        // 解析API端点信息
        paragraphs.forEach(p => {
          if (p.startsWith('接口说明：')) {
            result.description = p.replace('接口说明：', '').trim();
          } else if (p.startsWith('更新时间：')) {
            result.updateTime = p.replace('更新时间：', '').trim();
          } else if (p.includes('常规接口：') || p.includes('http://')) {
            const urlMatch = p.match(/https?:\/\/[^\s]+/);
            if (urlMatch) {
              result.endpoints.push({
                type: 'http',
                url: urlMatch[0]
              });
            }
          } else if (p.includes('安全接口：') || p.includes('https://')) {
            const urlMatch = p.match(/https?:\/\/[^\s]+/);
            if (urlMatch) {
              result.endpoints.push({
                type: 'https',
                url: urlMatch[0]
              });
            }
          } else if (p.startsWith('请求方式：')) {
            result.method = p.replace('请求方式：', '').trim().toUpperCase();
          }
        });

        // 根据表格标题判断类型
        document.querySelectorAll('h2').forEach(h2 => {
          const title = h2.textContent.trim();

          // 找到标题后面对应的表格
          let sibling = h2.nextElementSibling;
          const sectionTables = [];

          while (sibling && sibling.tagName !== 'H2') {
            if (sibling.tagName === 'TABLE') {
              const rows = [];
              sibling.querySelectorAll('tr').forEach(tr => {
                const cells = Array.from(tr.querySelectorAll('th, td')).map(c => c.textContent.trim());
                if (cells.length > 0) {
                  rows.push(cells);
                }
              });
              if (rows.length > 0) {
                sectionTables.push(rows);
              }
            }
            sibling = sibling.nextElementSibling;
          }

          // 根据标题分类表格
          if (title.includes('请求参数') && sectionTables.length > 0) {
            result.parameters = parseParameterTable(sectionTables[0]);
          } else if (title.includes('返回数据') && sectionTables.length > 0) {
            result.responses = parseResponseTable(sectionTables[0]);
          }
        });

        // 原始内容备份
        result.rawContent = paragraphs.join('\n\n');

        return result;
      });

      return {
        type: 'sanhulianghua-api',
        url,
        title: data.title,
        description: data.description,
        updateTime: data.updateTime,
        endpoints: data.endpoints,
        method: data.method,
        parameters: data.parameters,
        responses: data.responses,
        rawContent: data.rawContent,
        suggestedFilename: this.generateFilename(url)
      };
    } catch (error) {
      console.error('Failed to parse Sanhulianghua API page:', error.message);
      return {
        type: 'sanhulianghua-api',
        url,
        title: '',
        description: '',
        endpoints: [],
        method: 'GET',
        parameters: [],
        responses: [],
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
      await page.waitForLoadState('networkidle', { timeout: 30000 });
      await page.waitForSelector('h2, table, p', { timeout: 15000 });
      await page.waitForTimeout(1000);
    } catch (error) {
      console.warn('Wait for content timeout:', error.message);
    }
  }
}

export default SanhulianghuaParser;