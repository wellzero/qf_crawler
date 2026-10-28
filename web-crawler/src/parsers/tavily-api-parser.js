import BaseParser from './base-parser.js';

/**
 * Tavily API Parser - 专门解析 docs.tavily.com/documentation/api-reference 文档页面
 * Tavily 是一个 AI 搜索 API 服务，提供网页搜索、内容提取等功能
 * 文档页面使用 Mintlify/Next.js，需要精确提取主内容区域
 */
class TavilyApiParser extends BaseParser {
  /**
   * 匹配 Tavily API 文档页面
   * @param {string} url - 页面URL
   * @returns {boolean} 是否匹配
   */
  matches(url) {
    return /^https?:\/\/docs\.tavily\.com\/documentation\/api-reference/.test(url);
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
      // 移除 /documentation/api-reference 前缀
      pathname = pathname.replace(/^\/documentation\/api-reference\/?/, '');
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
      // 移除 /documentation/api-reference 前缀
      pathname = pathname.replace(/^\/documentation\/api-reference\/?/, '');
      return pathname;
    } catch (e) {
      return '';
    }
  }

  /**
   * 解析 Tavily API 文档页面
   * @param {Page} page - Playwright页面对象
   * @param {string} url - 页面URL
   * @param {Object} options - 解析选项
   * @returns {Promise<Object>} 解析后的页面数据
   */
  async parse(page, url, options = {}) {
    try {
      // 等待页面内容加载完成
      await this.waitForContent(page);

      // 从 URL 提取 API 路径
      const apiPath = this.extractApiPath(url);

      // 从页面提取内容
      const data = await page.evaluate((targetPath) => {
        const result = {
          title: '',
          description: '',
          method: '',
          endpoint: '',
          baseUrl: 'https://api.tavily.com',
          parameters: [],
          requestHeaders: [],
          requestBody: null,
          responseStructure: [],
          examples: [],
          mainContent: [],
          rawContent: ''
        };

        // 提取标题
        const h1 = document.querySelector('h1');
        if (h1) {
          result.title = h1.textContent.trim();
        }

        // 提取 HTTP 方法和端点（Tavily 特殊结构）
        // 方法显示在 method-pill 元素中
        const methodPill = document.querySelector('[class*="method-pill"]');
        if (methodPill) {
          const methodText = methodPill.textContent.trim();
          if (['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(methodText.toUpperCase())) {
            result.method = methodText.toUpperCase();
          }
        }

        // 端点路径通常在 method-pill 后面的元素中
        // 查找包含 "/" 开头文本的容器
        const methodContainer = document.querySelector('[class*="flex"][class*="items-center"][class*="gap"]');
        if (methodContainer) {
          const containerText = methodContainer.textContent || '';
          // 提取端点路径（以 / 开头的文本）
          const pathMatch = containerText.match(/\/[a-zA-Z0-9_\-\/]+/);
          if (pathMatch) {
            result.endpoint = pathMatch[0];
          }
        }

        // 如果还没找到端点，从 URL 路径推断
        if (!result.endpoint && targetPath && targetPath.startsWith('endpoint/')) {
          const endpointName = targetPath.replace('endpoint/', '');
          result.endpoint = '/' + endpointName;
        }

        // 提取描述
        const metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc) {
          result.description = metaDesc.getAttribute('content') || '';
        }

        // Mintlify 文档结构：查找主内容区域
        // 优先使用特定的内容选择器，排除导航和侧边栏
        let mainContentDiv = null;

        // 方法1: 查找包含 mdx 的容器（Mintlify 特征）
        const mdxContainer = document.querySelector('[class*="mdx"]');
        if (mdxContainer && mdxContainer.textContent.length > 1000) {
          mainContentDiv = mdxContainer;
        }

        // 方法2: 查找包含 API 文档特征的 div
        if (!mainContentDiv) {
          const allDivs = document.querySelectorAll('div');
          for (const div of allDivs) {
            const text = div.innerText || '';
            const classList = (div.className || '').toString();

            // 排除导航、侧边栏、页脚
            if (classList.includes('nav') || classList.includes('sidebar') ||
                classList.includes('header') || classList.includes('footer') ||
                classList.includes('menu')) {
              continue;
            }

            // 寻找包含 API 文档特征的内容
            const hasApiFeatures = text.includes('Authorization') ||
                                   text.includes('Parameters') ||
                                   text.includes('Response') ||
                                   text.includes('request');

            // 内容应该适中大小，不包含过多导航元素
            if (hasApiFeatures && text.length > 3000 && text.length < 15000) {
              // 检查是否包含大量导航链接（排除）
              const links = div.querySelectorAll('a');
              const linkCount = links.length;
              // 如果链接太多，可能是包含侧边栏的容器
              if (linkCount < 30) {
                mainContentDiv = div;
                break;
              }
            }
          }
        }

        // 方法3: 回退到包含 h1 的内容区域
        if (!mainContentDiv && h1) {
          let parent = h1.parentElement;
          while (parent) {
            const text = parent.innerText || '';
            if (text.length > 3000 && text.length < 15000) {
              mainContentDiv = parent;
              break;
            }
            parent = parent.parentElement;
          }
        }

        // ========== 提取 Mintlify 参数结构 ==========
        // Mintlify 使用 param-field 类来标记参数
        // 格式: ​paramNametype[default:value][required][header]Description...
        const extractMintlifyParams = () => {
          const params = [];
          const paramSelectors = [
            '[class*="primitive-param-field"]',
            '[class*="object-param-field"]',
            '[class*="array-param-field"]'
          ];

          // 已知的类型关键字（number 必须在 enum 之前，否则 enum 会匹配 num 子串）
          // 使用 \b 确保类型名是独立的单词，不会匹配到其他单词的一部分
          const typePatterns = [
            'string\\[\\]',      // string[] 数组类型
            'number(?:<[^>]+>)?\\b', // number 必须在 enum 之前
            'integer\\b',
            'enum(?:<[^>]+>)?\\b',
            'boolean\\b',
            'string\\b',
            'object\\b',
            'array\\b'
          ];

          // 已知的默认值关键字（用于智能提取默认值）
          const knownDefaults = ['true', 'false', 'null', 'basic', 'advanced', 'general', 'news', 'finance', 'fast', 'ultra-fast'];

          paramSelectors.forEach(selector => {
            const paramFields = document.querySelectorAll(selector);
            paramFields.forEach(field => {
              const text = field.textContent || '';

              // Mintlify 文本格式解析:
              // 零宽度空格 + 参数名 + 类型 + [default:xxx] + [required] + [header/body/query] + 描述

              // 移除开头的零宽度空格
              let cleanText = text.replace(/^[\u200B\u200C\u200D]+/, '');

              // 移除可能混入的 CSS 内容（以 #opt- 或 :has( 开头）
              if (cleanText.includes('#opt-') || cleanText.includes(':has(') || cleanText.includes('display:')) {
                cleanText = cleanText.split(/#opt-|:has\(|display:/)[0];
              }

              // 使用动态构建的正则，类型按长度排序确保正确匹配
              const typeGroup = typePatterns.join('|');

              // 步骤1: 先匹配参数名和类型
              // 改进：使用贪婪模式匹配参数名，然后在剩余部分中查找类型
              const nameTypePattern = new RegExp(
                `^([a-zA-Z_][a-zA-Z0-9_\\[\\]\\.]+?)(${typeGroup})`,
                'i'
              );
              const nameTypeMatch = cleanText.match(nameTypePattern);

              if (!nameTypeMatch) {
                // 回退：尝试在文本中查找类型关键字，然后分离参数名
                // 已知的后缀关键字（location 和 required）
                const knownSuffixes = ['header', 'body', 'query', 'path', 'required', 'default:', 'example'];

                // 先查找所有可能的类型位置
                let bestMatch = null;
                for (const typePat of ['string[]', 'number', 'integer', 'enum', 'boolean', 'string', 'object', 'array']) {
                  const typeIdx = cleanText.toLowerCase().indexOf(typePat);
                  if (typeIdx > 0) {
                    // 检查类型后面是否有合适的边界
                    const afterType = cleanText.substring(typeIdx + typePat.length);
                    const afterTypeLower = afterType.toLowerCase();

                    // 边界条件：
                    // 1) 空字符串
                    // 2) 非字母数字（特殊字符）
                    // 3) 已知的后缀关键字（header, required, default: 等）
                    // 4) 大写字母开头（表示描述句子开始，如 "Will return...", "The title..."）
                    // 5) 单个大写字母（如 "A short description..."）
                    let isValidBoundary = false;
                    if (afterType.length === 0) {
                      isValidBoundary = true;
                    } else if (!/^[a-z0-9]/i.test(afterType)) {
                      isValidBoundary = true;
                    } else if (/^[A-Z][a-z]/.test(afterType)) {
                      // 大写字母后跟小写字母 = 描述句子开始
                      isValidBoundary = true;
                    } else if (/^[A-Z]$/.test(afterType[0]) && afterType.length > 1 && /^[A-Z][A-Z]/.test(afterType) === false) {
                      // 单个大写字母开头（但不是全大写单词）= 描述开始
                      isValidBoundary = true;
                    } else {
                      // 检查是否是已知后缀
                      for (const suffix of knownSuffixes) {
                        if (afterTypeLower.startsWith(suffix)) {
                          isValidBoundary = true;
                          break;
                        }
                      }
                    }

                    if (isValidBoundary) {
                      if (!bestMatch || typeIdx < bestMatch.idx) {
                        bestMatch = { idx: typeIdx, type: typePat };
                      }
                    }
                  }
                }

                if (bestMatch && bestMatch.idx > 0) {
                  const paramName = cleanText.substring(0, bestMatch.idx);
                  const paramType = bestMatch.type;
                  let remaining = cleanText.substring(bestMatch.idx + bestMatch.type.length);

                  // 提取 location 和 required（与主流程相同）
                  let location = '';
                  let isRequired = false;

                  const locationMatch = remaining.match(/^(header|body|query|path)/i);
                  if (locationMatch) {
                    location = locationMatch[1].toLowerCase();
                    remaining = remaining.substring(locationMatch[0].length);
                  }

                  if (/^required/i.test(remaining)) {
                    isRequired = true;
                    remaining = remaining.substring(8);
                  }

                  // 清理描述开头
                  remaining = remaining.replace(/^[\u200B\u200C\u200D\s:]+/, '').trim();

                  const param = {
                    name: paramName,
                    type: paramType.toLowerCase(),
                    required: isRequired,
                    default: '',
                    description: remaining.substring(0, 500)
                  };
                  if (location) {
                    param.location = location;
                  }
                  params.push(param);
                  return;
                }

                // 最后的回退：尝试简单提取参数名
                const simpleMatch = cleanText.match(/^([a-zA-Z_][a-zA-Z0-9_\[\]\.]{2,40}?)(?=[A-Z][a-z]|\s|$)/);
                if (simpleMatch) {
                  params.push({
                    name: simpleMatch[1],
                    type: '',
                    required: false,
                    default: '',
                    description: cleanText.substring(simpleMatch[1].length).substring(0, 500)
                  });
                }
                return; // 跳过当前字段
              }

              let paramName = nameTypeMatch[1];
              const paramType = nameTypeMatch[2];
              const afterType = cleanText.substring(nameTypeMatch[0].length);

              // 步骤2: 在类型之后提取 location、required、default
              let location = '';
              let isRequired = false;
              let defaultValue = '';
              let description = afterType;

              // 提取 location (header/body/query/path)
              const locationMatch = afterType.match(/^(header|body|query|path)/i);
              if (locationMatch) {
                location = locationMatch[1].toLowerCase();
                description = afterType.substring(locationMatch[0].length);
              }

              // 提取 required
              if (/^required/i.test(description)) {
                isRequired = true;
                description = description.substring(8);
              }

              // 提取 default:值
              const defaultMatch = description.match(/^default:([a-zA-Z0-9_\-\.\[\]]+)/i);
              if (defaultMatch) {
                // 尝试匹配已知的默认值
                let potentialDefault = defaultMatch[1];
                for (const kd of knownDefaults) {
                  if (potentialDefault.toLowerCase().startsWith(kd)) {
                    defaultValue = kd;
                    description = description.substring(8 + kd.length); // 'default:'.length + kd.length
                    break;
                  }
                }
                // 如果没有匹配到已知默认值，检查是否是数字
                if (!defaultValue && /^\d+/.test(potentialDefault)) {
                  const numMatch = potentialDefault.match(/^(\d+)/);
                  if (numMatch) {
                    defaultValue = numMatch[1];
                    description = description.substring(8 + numMatch[1].length);
                  }
                }
                // 如果还是没匹配到，取整个值
                if (!defaultValue) {
                  defaultValue = potentialDefault;
                  description = description.substring(8 + potentialDefault.length);
                }
              }

              // 清理描述 - 移除开头的特殊字符和空白
              description = description
                .replace(/^[\u200B\u200C\u200D\s:]+/, '')
                .replace(/[\u200B\u200C\u200D]+/g, ' ')
                .trim()
                .substring(0, 500);

              // 验证参数名不以类型关键字结尾
              const typeCheckPattern = new RegExp(`(${typePatterns.join('|')})$`, 'i');
              if (!typeCheckPattern.test(paramName) && paramName && description.length > 5) {
                const param = {
                  name: paramName,
                  type: paramType.toLowerCase(),
                  required: isRequired,
                  default: defaultValue,
                  description: description
                };
                if (location) {
                  param.location = location;
                }
                params.push(param);
              }
            });
          });

          // 去重 - 相同参数名只保留第一个
          const seen = new Set();
          return params.filter(p => {
            if (seen.has(p.name)) return false;
            seen.add(p.name);
            return true;
          });
        };

        // 提取参数
        const mintlifyParams = extractMintlifyParams();
        if (mintlifyParams.length > 0) {
          result.parameters = mintlifyParams;
        }

        // 提取混排内容（按顺序）
        if (mainContentDiv) {
          // 用于过滤导航/UI文本
          const skipTexts = [
            'Skip to main content',
            'Tavily Docs home page',
            'Search...',
            '⌘K',
            'Ask AI',
            'Support',
            'Get an API key',
            'Copy page',
            'Copy',
            'Powered by',
            'This documentation is built and hosted on Mintlify',
            'Previous',
            'Next',
            '⌘I'
          ];

          const isUiText = (text) => {
            return skipTexts.some(skip => text.includes(skip)) && text.length < 100;
          };

          const extractContent = (element) => {
            const items = [];

            // 遍历所有子元素
            const walk = (el) => {
              if (!el || el.tagName === 'SCRIPT' || el.tagName === 'STYLE' ||
                  el.tagName === 'NOSCRIPT' || el.tagName === 'NAV' ||
                  el.tagName === 'HEADER' || el.tagName === 'FOOTER') return;

              const tagName = el.tagName;
              const classList = (el.className || '').toString();

              // 跳过导航和侧边栏
              if (classList.includes('nav') || classList.includes('sidebar') ||
                  classList.includes('menu') || classList.includes('toc')) {
                return;
              }

              // Mintlify 参数结构检测
              // Mintlify 使用特定的类名模式来标记参数
              if (classList.includes('param') || classList.includes('property') ||
                  classList.includes('request-body') || classList.includes('field')) {
                const paramName = el.querySelector('code, [class*="name"], [class*="key"]');
                const paramType = el.querySelector('[class*="type"]');
                const paramDesc = el.querySelector('[class*="desc"], [class*="description"]');

                if (paramName || paramDesc) {
                  let name = paramName ? paramName.textContent.trim() : '';
                  let type = paramType ? paramType.textContent.trim() : '';
                  let desc = paramDesc ? paramDesc.textContent.trim() : el.textContent.trim();

                  // 移除混入的 CSS 内容
                  const filterCss = (text) => {
                    if (text.includes('#opt-') || text.includes(':has(') || text.includes('display:')) {
                      return text.split(/#opt-|:has\(|display:/)[0].trim();
                    }
                    return text;
                  };
                  name = filterCss(name);
                  type = filterCss(type);
                  desc = filterCss(desc);

                  items.push({
                    type: 'parameter',
                    name,
                    paramType: type,
                    description: desc
                  });
                  return; // 不再递归处理这个元素
                }
              }

              // 检测 Mintlify 的参数列表结构
              // 通常是 div 容器包含参数名（code 元素）和描述
              const paramCode = el.querySelector(':scope > code, :scope > strong > code');
              if (paramCode && tagName === 'DIV') {
                let paramName = paramCode.textContent.trim();
                const siblings = Array.from(el.children);
                let description = '';

                // 收集参数名之后的文本作为描述
                siblings.forEach(sibling => {
                  if (sibling !== paramCode && sibling.tagName !== 'CODE') {
                    description += ' ' + sibling.textContent.trim();
                  }
                });
                description = description.trim() || el.textContent.replace(paramName, '').trim();

                // 移除混入的 CSS 内容
                const filterCss = (text) => {
                  if (text.includes('#opt-') || text.includes(':has(') || text.includes('display:')) {
                    return text.split(/#opt-|:has\(|display:/)[0].trim();
                  }
                  return text;
                };
                paramName = filterCss(paramName);
                description = filterCss(description);

                if (paramName && description) {
                  items.push({
                    type: 'parameter',
                    name: paramName,
                    description: description
                  });
                  return;
                }
              }

              // 标题
              if (/^H[1-6]$/.test(tagName)) {
                let text = el.textContent.trim();
                // 移除混入的 CSS 内容
                if (text.includes('#opt-') || text.includes(':has(') || text.includes('display:')) {
                  text = text.split(/#opt-|:has\(|display:/)[0].trim();
                }
                if (text && !isUiText(text)) {
                  items.push({
                    type: 'heading',
                    level: parseInt(tagName[1]),
                    content: text
                  });
                }
              }
              // 段落
              else if (tagName === 'P') {
                let text = el.textContent.trim();
                // 移除混入的 CSS 内容（以 #opt- 或 :has( 开头）
                if (text.includes('#opt-') || text.includes(':has(') || text.includes('display:')) {
                  text = text.split(/#opt-|:has\(|display:/)[0].trim();
                }
                if (text && text.length > 10 && !isUiText(text)) {
                  items.push({
                    type: 'paragraph',
                    content: text
                  });
                }
              }
              // 代码块
              else if (tagName === 'PRE') {
                const code = el.querySelector('code') || el;
                const text = code.textContent.trim();
                if (text && !isUiText(text)) {
                  // 检测语言
                  let language = 'text';
                  const codeClassList = code.className || '';
                  if (codeClassList.includes('json') || text.startsWith('{') || text.startsWith('[')) {
                    language = 'json';
                  } else if (codeClassList.includes('python') || text.includes('import ') || text.includes('def ')) {
                    language = 'python';
                  } else if (codeClassList.includes('javascript') || text.includes('const ') || text.includes('function ')) {
                    language = 'javascript';
                  } else if (codeClassList.includes('bash') || text.includes('curl ') || text.includes('npm ')) {
                    language = 'bash';
                  }

                  items.push({
                    type: 'codeblock',
                    language,
                    content: text.substring(0, 10000) // 限制长度
                  });
                }
              }
              // 行内代码（包含路径或方法）
              else if (tagName === 'CODE' && !el.closest('pre')) {
                const text = el.textContent.trim();
                // 检测 HTTP 方法
                if (['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(text.toUpperCase())) {
                  result.method = text.toUpperCase();
                }
                // 检测端点路径
                else if (text.startsWith('/') && !text.includes(' ')) {
                  result.endpoint = text;
                }
              }
              // 列表
              else if (tagName === 'UL' || tagName === 'OL') {
                const listItems = [];
                el.querySelectorAll(':scope > li').forEach(li => {
                  let text = li.textContent.trim();
                  // 移除混入的 CSS 内容
                  if (text.includes('#opt-') || text.includes(':has(') || text.includes('display:')) {
                    text = text.split(/#opt-|:has\(|display:/)[0].trim();
                  }
                  if (text && !isUiText(text)) listItems.push(text);
                });
                if (listItems.length > 0) {
                  items.push({
                    type: 'list',
                    listType: tagName.toLowerCase(),
                    items: listItems
                  });
                }
              }
              // 表格
              else if (tagName === 'TABLE') {
                const table = { headers: [], rows: [] };

                // 辅助函数：过滤 CSS 内容
                const filterCss = (text) => {
                  if (text.includes('#opt-') || text.includes(':has(') || text.includes('display:')) {
                    return text.split(/#opt-|:has\(|display:/)[0].trim();
                  }
                  return text;
                };

                // 提取表头
                const headerRow = el.querySelector('thead tr, tr:first-child');
                if (headerRow) {
                  headerRow.querySelectorAll('th, td').forEach(cell => {
                    table.headers.push(filterCss(cell.textContent.trim()));
                  });
                }

                // 提取数据行
                const bodyRows = el.querySelectorAll('tbody tr, tr:not(:first-child)');
                bodyRows.forEach(row => {
                  const rowData = [];
                  row.querySelectorAll('td, th').forEach(cell => {
                    rowData.push(filterCss(cell.textContent.trim()));
                  });
                  if (rowData.length > 0) {
                    table.rows.push(rowData);
                  }
                });

                if (table.headers.length > 0 || table.rows.length > 0) {
                  items.push({
                    type: 'table',
                    ...table
                  });

                  // 如果表格包含参数信息，提取参数
                  if (table.headers.some(h => h.toLowerCase().includes('name') || h.toLowerCase().includes('param'))) {
                    const nameIdx = table.headers.findIndex(h => h.toLowerCase().includes('name'));
                    const typeIdx = table.headers.findIndex(h => h.toLowerCase().includes('type'));
                    const reqIdx = table.headers.findIndex(h => h.toLowerCase().includes('required'));
                    const descIdx = table.headers.findIndex(h => h.toLowerCase().includes('desc'));

                    table.rows.forEach(row => {
                      result.parameters.push({
                        name: nameIdx >= 0 ? row[nameIdx] || '' : row[0] || '',
                        type: typeIdx >= 0 ? row[typeIdx] || '' : '',
                        required: reqIdx >= 0 ? (row[reqIdx] || '').toLowerCase().includes('true') || row[reqIdx] === '是' : false,
                        description: descIdx >= 0 ? row[descIdx] || '' : ''
                      });
                    });
                  }
                }
              }
              // 引用块
              else if (tagName === 'BLOCKQUOTE') {
                const text = el.textContent.trim();
                if (text && !isUiText(text)) {
                  items.push({
                    type: 'blockquote',
                    content: text
                  });
                }
              }
              // 递归处理子元素
              else if (el.children && el.children.length > 0) {
                Array.from(el.children).forEach(child => walk(child));
              }
            };

            walk(element);
            return items;
          };

          result.mainContent = extractContent(mainContentDiv);

          // 提取清理后的原始内容
          let rawText = mainContentDiv.innerText || '';
          // 移除UI文本
          skipTexts.forEach(skip => {
            rawText = rawText.replace(new RegExp(skip.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '');
          });
          // 移除混入的 CSS 内容（以 #opt- 或 :has( 开头）
          rawText = rawText.replace(/#opt-[^\s]*/g, '');
          rawText = rawText.replace(/:has\([^)]*\)/g, '');
          rawText = rawText.replace(/\[data-idx[^\]]*\]\s*\{\s*display:\s*[^}]*\}/g, '');
          result.rawContent = rawText.trim();
        }

        // 提取代码示例
        const codeBlocks = document.querySelectorAll('pre');
        codeBlocks.forEach(pre => {
          const code = pre.querySelector('code') || pre;
          const text = code.textContent.trim();

          let language = 'text';
          const classList = code.className || '';
          if (classList.includes('json') || text.startsWith('{')) {
            language = 'json';
          } else if (classList.includes('python')) {
            language = 'python';
          } else if (classList.includes('javascript')) {
            language = 'javascript';
          } else if (classList.includes('bash') || text.includes('curl')) {
            language = 'bash';
          }

          if (text.length > 10) {
            result.examples.push({
              language,
              code: text.substring(0, 5000)
            });
          }
        });

        return result;
      }, apiPath);

      return {
        type: 'tavily-api',
        url,
        title: data.title,
        description: data.description,
        method: data.method,
        endpoint: data.endpoint,
        baseUrl: data.baseUrl,
        parameters: data.parameters,
        requestHeaders: data.requestHeaders,
        requestBody: data.requestBody,
        responseStructure: data.responseStructure,
        examples: data.examples,
        mainContent: data.mainContent,
        rawContent: data.rawContent,
        suggestedFilename: this.generateFilename(url)
      };
    } catch (error) {
      console.error('Failed to parse Tavily API doc page:', error.message);
      return {
        type: 'tavily-api',
        url,
        title: '',
        description: '',
        method: '',
        endpoint: '',
        baseUrl: 'https://api.tavily.com',
        parameters: [],
        requestHeaders: [],
        requestBody: null,
        responseStructure: [],
        examples: [],
        mainContent: [],
        rawContent: '',
        suggestedFilename: this.generateFilename(url)
      };
    }
  }

  /**
   * 等待页面内容加载完成
   * @param {Page} page - Playwright页面对象
   */
  async waitForContent(page) {
    try {
      await page.waitForLoadState('networkidle', { timeout: 30000 });
      // 等待主要内容区域出现
      await page.waitForSelector('h1', { timeout: 15000 });
      // 额外等待动态内容
      await page.waitForTimeout(3000);
    } catch (error) {
      console.warn('Wait for content timeout, proceeding anyway:', error.message);
    }
  }
}

export default TavilyApiParser;