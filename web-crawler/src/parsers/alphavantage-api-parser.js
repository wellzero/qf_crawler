import BaseParser from './base-parser.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Alpha Vantage API Parser - 专门解析 alphavantage.co/documentation 文档页面
 * Alpha Vantage 提供股票、外汇、加密货币、大宗商品、经济指标和技术指标等金融数据 API
 * 所有 API 文档都在一个单页面上，使用锚点定位不同 API
 * 按 API 切分成独立的 Markdown 文件
 */
class AlphavantageApiParser extends BaseParser {
  /**
   * 匹配 Alpha Vantage API 文档页面
   * @param {string} url - 页面URL
   * @returns {boolean} 是否匹配
   */
  matches(url) {
    return /^https?:\/\/www\.alphavantage\.co\/documentation\/?/.test(url);
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
      const hash = urlObj.hash.replace('#', '');
      if (hash) {
        return hash;
      }
      return 'api_overview';
    } catch (e) {
      return 'api_doc';
    }
  }

  /**
   * 从 URL 提取锚点 ID
   * @param {string} url - 页面URL
   * @returns {string} 锚点 ID
   */
  extractAnchorId(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hash.replace('#', '');
    } catch (e) {
      return '';
    }
  }

  /**
   * 解析 Alpha Vantage API 文档页面
   * @param {Page} page - Playwright页面对象
   * @param {string} url - 页面URL
   * @param {Object} options - 解析选项
   * @returns {Promise<Object>} 解析后的页面数据
   */
  async parse(page, url, options = {}) {
    try {
      // 等待页面加载完成
      await this.waitForContent(page);

      // 从 URL 提取锚点 ID
      const anchorId = this.extractAnchorId(url);

      // 从页面提取内容
      const data = await page.evaluate((targetAnchor) => {
        // 辅助函数：提取 API 详细信息
        function extractApiDetails(h4Element) {
          const apiInfo = {
            id: h4Element.id || '',
            title: '',
            functionName: '',
            description: '',
            parameters: [],
            examples: [],
            codeExamples: [],
            premium: false,
            trending: false,
            utility: false
          };

          // 提取标题
          apiInfo.title = h4Element.textContent.trim();

          // 检查标签
          const spans = h4Element.querySelectorAll('span');
          spans.forEach(span => {
            if (span.classList.contains('premium-label')) apiInfo.premium = true;
            if (span.classList.contains('popular-label')) apiInfo.trending = true;
            if (span.classList.contains('utility-label')) apiInfo.utility = true;
          });

          // 提取函数名
          const funcMatch = apiInfo.title.match(/^([A-Z_]+(?:_[A-Z_]+)*)/);
          if (funcMatch) {
            apiInfo.functionName = funcMatch[1];
          }

          // 提取该 API 的内容（从当前 h4 到下一个 h4 或 h2）
          let nextElement = h4Element.nextElementSibling;
          let descriptionLines = [];
          let inParameters = false;
          let inExamples = false;
          let inCodeSection = false;
          let currentCodeLang = '';

          while (nextElement && !['H2', 'H4'].includes(nextElement.tagName)) {
            const tagName = nextElement.tagName;
            const text = nextElement.textContent.trim();
            const innerHTML = nextElement.innerHTML;

            // 提取描述（API Parameters 之前的内容）
            if (!inParameters && tagName === 'P' && !text.includes('Required:') && !text.includes('Optional:')) {
              if (text.length > 30 && !text.startsWith('https://') && !text.startsWith('❚')) {
                descriptionLines.push(text);
              }
            }

            // 检测参数部分开始
            if (tagName === 'H6' && text.includes('API Parameters')) {
              inParameters = true;
            }

            // 提取参数
            if (inParameters && tagName === 'P') {
              const requiredMatch = innerHTML.match(/<b>❚ Required: <code>(\w+)<\/code><\/b>/);
              const optionalMatch = innerHTML.match(/❚ Optional: <code>(\w+)<\/code>/);

              if (requiredMatch || optionalMatch) {
                const paramName = requiredMatch ? requiredMatch[1] : optionalMatch[1];
                const isRequired = !!requiredMatch;

                // 参数描述在下一个兄弟元素中
                const nextSibling = nextElement.nextElementSibling;
                let paramDesc = '';
                if (nextSibling && nextSibling.tagName === 'P' && !nextSibling.innerHTML.includes('Required:') && !nextSibling.innerHTML.includes('Optional:')) {
                  paramDesc = nextSibling.textContent.trim();
                } else {
                  // 描述可能在同一个 P 标签内
                  const descMatch = text.match(/❚ (?:Required|Optional): \w+\s*(.*)/s);
                  if (descMatch) {
                    paramDesc = descMatch[1].trim();
                  }
                }

                apiInfo.parameters.push({
                  name: paramName,
                  required: isRequired,
                  description: paramDesc
                });
              }
            }

            // 提取示例 URL
            if (tagName === 'P') {
              const links = nextElement.querySelectorAll('a');
              links.forEach(link => {
                const href = link.getAttribute('href') || '';
                if (href.includes('alphavantage.co/query')) {
                  apiInfo.examples.push({
                    url: href,
                    description: link.textContent.trim() || nextElement.textContent.split('\n')[0]
                  });
                }
              });
            }

            // 提取代码示例
            if (tagName === 'DIV') {
              const codeBlocks = nextElement.querySelectorAll('pre code');
              codeBlocks.forEach(block => {
                const code = block.textContent.trim();
                if (code.length > 20) {
                  let language = 'text';
                  if (code.includes('import requests')) language = 'python';
                  else if (code.includes("require('request')")) language = 'javascript';
                  else if (code.includes('<?php')) language = 'php';
                  else if (code.includes('using System')) language = 'csharp';

                  apiInfo.codeExamples.push({
                    language,
                    code
                  });
                }
              });
            }

            // 单独的 pre/code 元素
            if (tagName === 'PRE') {
              const code = nextElement.textContent.trim();
              if (code.length > 20) {
                let language = 'text';
                if (code.includes('import requests')) language = 'python';
                else if (code.includes("require('request')")) language = 'javascript';
                else if (code.includes('<?php')) language = 'php';
                else if (code.includes('using System')) language = 'csharp';

                apiInfo.codeExamples.push({
                  language,
                  code
                });
              }
            }

            nextElement = nextElement.nextElementSibling;
          }

          apiInfo.description = descriptionLines.join('\n\n');

          return apiInfo;
        }

        const result = {
          title: '',
          description: '',
          category: '',
          functionName: '',
          endpoint: 'https://www.alphavantage.co/query',
          method: 'GET',
          parameters: [],
          requiredParams: [],
          optionalParams: [],
          examples: [],
          codeExamples: [],
          premium: false,
          trending: false,
          utility: false,
          rawContent: '',
          categories: [],
          apiDetails: []
        };

        // 如果指定了锚点，提取特定 API 的内容
        if (targetAnchor) {
          const targetElement = document.getElementById(targetAnchor);
          if (targetElement) {
            const apiInfo = extractApiDetails(targetElement);
            result.title = apiInfo.title;
            result.functionName = apiInfo.functionName;
            result.description = apiInfo.description;
            result.parameters = apiInfo.parameters;
            result.examples = apiInfo.examples;
            result.codeExamples = apiInfo.codeExamples;
            result.premium = apiInfo.premium;
            result.trending = apiInfo.trending;
            result.utility = apiInfo.utility;

            // 分离必需和可选参数
            result.parameters.forEach(p => {
              if (p.required) {
                result.requiredParams.push(p);
              } else {
                result.optionalParams.push(p);
              }
            });

            // 查找所属分类
            let prevElement = targetElement.previousElementSibling;
            while (prevElement) {
              if (prevElement.tagName === 'H2') {
                result.category = prevElement.textContent.trim();
                break;
              }
              prevElement = prevElement.previousElementSibling;
            }
          }
        } else {
          // 提取整个页面的信息
          const h1 = document.querySelector('h1');
          if (h1) {
            result.title = h1.textContent.trim();
          }

          const lead = document.querySelector('p.lead');
          if (lead) {
            result.description = lead.textContent.trim();
          }

          // 提取所有 API 类别和详细信息
          const categories = [];
          const h2Elements = document.querySelectorAll('h2[id]');

          h2Elements.forEach(h2 => {
            const categoryName = h2.textContent.trim();
            const apis = [];

            // 获取该分类下的所有 API
            let nextElement = h2.nextElementSibling;
            while (nextElement && nextElement.tagName !== 'H2') {
              if (nextElement.tagName === 'H4' && nextElement.id) {
                const apiInfo = extractApiDetails(nextElement);
                apis.push(apiInfo);
                result.apiDetails.push(apiInfo);
              }
              nextElement = nextElement.nextElementSibling;
            }

            categories.push({
              name: categoryName,
              apis: apis
            });
          });

          result.categories = categories;
        }

        return result;
      }, anchorId);

      // 如果提供了输出目录且有多个 API，则为每个 API 单独写 Markdown
      if (options.pagesDir && data.apiDetails && data.apiDetails.length > 0) {
        await this.writeApiDetailsAsMarkdown(data.apiDetails, url, options.pagesDir, data.title, data.description);
      }

      return {
        type: 'alphavantage-api',
        url,
        title: data.title,
        description: data.description,
        category: data.category,
        functionName: data.functionName,
        endpoint: data.endpoint,
        method: data.method,
        parameters: data.parameters,
        requiredParams: data.requiredParams,
        optionalParams: data.optionalParams,
        examples: data.examples,
        codeExamples: data.codeExamples,
        premium: data.premium,
        trending: data.trending,
        utility: data.utility,
        categories: data.categories,
        apiDetails: data.apiDetails,
        rawContent: data.rawContent,
        // 如果有多个 API 详情，跳过默认输出（已在上面单独写入）
        skipDefaultMarkdownOutput: data.apiDetails && data.apiDetails.length > 0,
        suggestedFilename: this.generateFilename(url)
      };
    } catch (error) {
      console.error('Failed to parse Alpha Vantage API doc page:', error.message);
      return {
        type: 'alphavantage-api',
        url,
        title: '',
        description: '',
        category: '',
        functionName: '',
        endpoint: 'https://www.alphavantage.co/query',
        method: 'GET',
        parameters: [],
        requiredParams: [],
        optionalParams: [],
        examples: [],
        codeExamples: [],
        premium: false,
        trending: false,
        utility: false,
        apiDetails: [],
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
      await page.waitForSelector('h1, .main-content', { timeout: 15000 });
      await page.waitForTimeout(2000);
    } catch (error) {
      console.warn('Wait for content timeout, proceeding anyway:', error.message);
    }
  }

  /**
   * 清理文件名
   * @param {string} value - 原始值
   * @returns {string} 清理后的文件名
   */
  sanitizeFilename(value) {
    return (value || '')
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80);
  }

  /**
   * 构建单个 API 的 Markdown 内容
   * @param {Object} api - API 详情对象
   * @param {string} sourceUrl - 源 URL
   * @returns {string} Markdown 内容
   */
  buildSingleApiMarkdown(api, sourceUrl) {
    const sections = [];

    // API 标题
    let title = api.title || api.functionName || 'API';
    const tags = [];
    if (api.premium) tags.push('Premium');
    if (api.trending) tags.push('Trending');
    if (api.utility) tags.push('Utility');
    if (tags.length > 0) {
      title += ` [${tags.join(', ')}]`;
    }
    sections.push(`# ${title}\n`);

    // 源 URL
    sections.push('## 源URL\n');
    if (api.id) {
      sections.push(`${sourceUrl}#${api.id}\n`);
    } else {
      sections.push(`${sourceUrl}\n`);
    }

    // 函数名
    if (api.functionName) {
      sections.push('## 函数名\n');
      sections.push(`\`${api.functionName}\`\n`);
    }

    // 描述
    if (api.description) {
      sections.push('## 描述\n');
      sections.push(api.description);
      sections.push('\n');
    }

    // 请求端点
    sections.push('## 请求端点\n');
    sections.push('```text');
    sections.push('GET https://www.alphavantage.co/query');
    sections.push('```\n');

    // 必需参数
    const requiredParams = (api.parameters || []).filter(p => p.required);
    if (requiredParams.length > 0) {
      sections.push('## 必需参数\n');
      sections.push('| 参数名 | 描述 |');
      sections.push('|--------|------|');
      requiredParams.forEach(p => {
        const desc = (p.description || '-').replace(/\|/g, '\\|');
        sections.push(`| \`${p.name}\` | ${desc} |`);
      });
      sections.push('');
    }

    // 可选参数
    const optionalParams = (api.parameters || []).filter(p => !p.required);
    if (optionalParams.length > 0) {
      sections.push('## 可选参数\n');
      sections.push('| 参数名 | 描述 |');
      sections.push('|--------|------|');
      optionalParams.forEach(p => {
        const desc = (p.description || '-').replace(/\|/g, '\\|');
        sections.push(`| \`${p.name}\` | ${desc} |`);
      });
      sections.push('');
    }

    // 示例 URL
    if (api.examples && api.examples.length > 0) {
      sections.push('## 示例 URL\n');
      api.examples.forEach((example, i) => {
        const desc = example.description || '';
        if (desc && desc.length < 100) {
          sections.push(`**${desc}**`);
        }
        sections.push('```text');
        sections.push(example.url || example);
        sections.push('``\n');
      });
    }

    // 代码示例
    if (api.codeExamples && api.codeExamples.length > 0) {
      sections.push('## 代码示例\n');
      api.codeExamples.forEach((example, i) => {
        if (api.codeExamples.length > 1) {
          const langName = example.language ? example.language.charAt(0).toUpperCase() + example.language.slice(1) : 'Code';
          sections.push(`### ${langName}\n`);
        }
        sections.push(`\`\`\`${example.language || 'text'}`);
        sections.push(example.code || '');
        sections.push('```\n');
      });
    }

    return sections.join('\n');
  }

  /**
   * 将每个 API 详情写入单独的 Markdown 文件
   * @param {Array} apiDetails - API 详情数组
   * @param {string} sourceUrl - 源 URL
   * @param {string} pagesDir - 输出目录
   * @param {string} pageTitle - 页面标题
   * @param {string} pageDescription - 页面描述
   */
  async writeApiDetailsAsMarkdown(apiDetails, sourceUrl, pagesDir, pageTitle, pageDescription) {
    await fs.mkdir(pagesDir, { recursive: true });
    const filenameCounter = new Map();

    // 写入一个概览文件
    const overviewSections = [];
    if (pageTitle) {
      overviewSections.push(`# ${pageTitle}\n`);
    }
    overviewSections.push('## 源URL\n');
    overviewSections.push(sourceUrl);
    overviewSections.push('\n');
    if (pageDescription) {
      overviewSections.push('## 概述\n');
      overviewSections.push(pageDescription);
      overviewSections.push('\n');
    }
    overviewSections.push('## API 列表\n');
    apiDetails.forEach((api, index) => {
      const filename = this.sanitizeFilename(api.functionName || api.id || `api_${index + 1}`);
      let apiLine = `- [${api.title || api.functionName || `API ${index + 1}`}](${filename}.md)`;
      const tags = [];
      if (api.premium) tags.push('Premium');
      if (api.trending) tags.push('Trending');
      if (api.utility) tags.push('Utility');
      if (tags.length > 0) {
        apiLine += ` [${tags.join(', ')}]`;
      }
      overviewSections.push(apiLine);
    });

    const overviewPath = path.join(pagesDir, 'README.md');
    await fs.writeFile(overviewPath, overviewSections.join('\n'), 'utf-8');
    console.log(`  Saved: README.md (API list overview)`);

    // 写入每个 API 的单独文件
    for (let index = 0; index < apiDetails.length; index++) {
      const api = apiDetails[index];
      const baseName = this.sanitizeFilename(api.functionName || api.id || `api_${index + 1}`);
      const seen = filenameCounter.get(baseName) || 0;
      filenameCounter.set(baseName, seen + 1);
      const filename = seen === 0 ? baseName : `${baseName}_${seen + 1}`;
      const filePath = path.join(pagesDir, `${filename}.md`);
      const markdown = this.buildSingleApiMarkdown(api, sourceUrl);
      await fs.writeFile(filePath, markdown, 'utf-8');
      console.log(`  Saved: ${filename}.md (${api.functionName || api.title || 'API'})`);
    }
  }
}

export default AlphavantageApiParser;