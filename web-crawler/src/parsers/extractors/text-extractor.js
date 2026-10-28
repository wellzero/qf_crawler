/**
 * 文本内容提取器
 * 负责提取页面的标题、描述、段落、列表、代码块等文本内容
 */
class TextExtractor {
  /**
   * 执行提取
   * @param {Object} context - 解析上下文 { page, url, options, data }
   * @returns {Promise<Object>} 提取的数据
   */
  async extract(context) {
    const { page } = context;
    
    const title = await this.extractTitle(page);
    const description = await this.extractDescription(page);
    const headings = await this.extractHeadings(page);
    const paragraphs = await this.extractParagraphs(page);
    const lists = await this.extractLists(page);
    const codeBlocks = await this.extractCodeBlocks(page);
    const blockquotes = await this.extractBlockquotes(page);
    const definitionLists = await this.extractDefinitionLists(page);
    const horizontalRules = await this.extractHorizontalRules(page);
    
    // 提取主内容区域的混排内容（段落、图片、列表等按原始顺序）
    const mainContent = await this.extractMainContentWithOrder(page);

    return {
      title,
      description,
      headings,
      paragraphs,
      lists,
      codeBlocks,
      blockquotes,
      definitionLists,
      horizontalRules,
      mainContent
    };
  }

  async extractTitle(page) {
    try {
      return await page.evaluate(() => {
        const isValidTitle = (text) => {
          if (!text || text.length < 2) return false;
          const trimmed = text.trim();
          if (/^[￥$¥€£]\s*[\d,.]+$/.test(trimmed)) return false;
          if (/^[\d,.]+\s*[元美欧]$/.test(trimmed)) return false;
          if (/^[\d\s,.\-+]+$/.test(trimmed)) return false;
          if (trimmed.length > 100) return false;
          const invalidPatterns = [/^广告$/, /^推荐$/, /^热销$/, /^促销$/, /^\d+$/];
          for (const pattern of invalidPatterns) {
            if (pattern.test(trimmed)) return false;
          }
          return true;
        };

        const titleTag = document.querySelector('title');
        const titleTagText = titleTag ? titleTag.textContent.trim() : '';

        const h1 = document.querySelector('h1');
        if (h1 && isValidTitle(h1.textContent.trim())) {
          return h1.textContent.trim();
        }

        const h2 = document.querySelector('h2');
        if (h2 && isValidTitle(h2.textContent.trim())) {
          return h2.textContent.trim();
        }

        if (titleTagText) {
          const cleanTitle = titleTagText.split(/[|－—-]/)[0].trim();
          return cleanTitle || titleTagText;
        }

        return '';
      });
    } catch (error) {
      return '';
    }
  }

  async extractDescription(page) {
    try {
      return await page.evaluate(() => {
        const meta = document.querySelector('meta[name="description"]');
        if (meta) return meta.getAttribute('content') || '';
        const ogDesc = document.querySelector('meta[property="og:description"]');
        if (ogDesc) return ogDesc.getAttribute('content') || '';
        return '';
      });
    } catch (error) {
      return '';
    }
  }

  async extractHeadings(page) {
    try {
      return await page.evaluate(() => {
        const headingElements = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
        return Array.from(headingElements).map(h => {
          let text = '';
          const processNode = (node) => {
            if (node.nodeType === Node.TEXT_NODE) {
              text += node.textContent;
            } else if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.tagName === 'A' && node.href) {
                const linkText = node.textContent.trim();
                const href = node.href;
                if (linkText && href) text += `[${linkText}](${href})`;
              } else {
                Array.from(node.childNodes).forEach(processNode);
              }
            }
          };
          Array.from(h.childNodes).forEach(processNode);
          return { level: parseInt(h.tagName.substring(1)), text: text.trim() };
        });
      });
    } catch (error) {
      return [];
    }
  }

  async extractParagraphs(page) {
    try {
      return await page.evaluate(() => {
        const main = document.querySelector('main') || 
                     document.querySelector('article') || 
                     document.querySelector('[role="main"]') ||
                     document.querySelector('#content') ||
                     document.body;
        const pElements = main.querySelectorAll('p');
        
        const processNode = (node) => {
          let result = '';
          if (node.nodeType === Node.TEXT_NODE) {
            result += node.textContent;
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            const tag = node.tagName;
            const text = node.textContent.trim();
            if (tag === 'A' && node.href) result += `[${text}](${node.href})`;
            else if ((tag === 'STRONG' || tag === 'B') && text) result += `**${text}**`;
            else if ((tag === 'EM' || tag === 'I') && text) result += `*${text}*`;
            else if ((tag === 'DEL' || tag === 'S' || tag === 'STRIKE') && text) result += `~~${text}~~`;
            else if (tag === 'CODE' && text) result += `\`${text}\``;
            else if (tag === 'SUP' && text) result += `^${text}^`;
            else if (tag === 'SUB' && text) result += `~${text}~`;
            else if (tag === 'BR') result += '  \n';
            else Array.from(node.childNodes).forEach(child => result += processNode(child));
          }
          return result;
        };
        
        return Array.from(pElements)
          .map(p => {
            let result = '';
            Array.from(p.childNodes).forEach(node => result += processNode(node));
            return result.trim();
          })
          .filter(text => text.length > 0);
      });
    } catch (error) {
      return [];
    }
  }

  async extractLists(page) {
    try {
      return await page.evaluate(() => {
        const listElements = document.querySelectorAll('ul, ol');
        return Array.from(listElements).map(list => {
          const items = Array.from(list.querySelectorAll('li')).map(li => {
            let result = '';
            const processNode = (node) => {
              if (node.nodeType === Node.TEXT_NODE) result += node.textContent;
              else if (node.nodeType === Node.ELEMENT_NODE) {
                if (node.tagName === 'A' && node.href) {
                  const text = node.textContent.trim();
                  if (text && node.href) result += `[${text}](${node.href})`;
                } else Array.from(node.childNodes).forEach(processNode);
              }
            };
            Array.from(li.childNodes).forEach(processNode);
            return result.trim();
          });
          return { type: list.tagName.toLowerCase(), items: items.filter(item => item.length > 0) };
        });
      });
    } catch (error) {
      return [];
    }
  }

  async extractCodeBlocks(page) {
    try {
      return await page.evaluate(() => {
        const blocks = [];
        const preCodeElements = document.querySelectorAll('pre code, pre');
        preCodeElements.forEach(element => {
          const code = element.textContent.trim();
          if (code) {
            let language = 'text';
            const classList = element.className;
            const langMatch = classList.match(/language-(\w+)/);
            if (langMatch) language = langMatch[1];
            else if (code.startsWith('{') || code.startsWith('[')) language = 'json';
            else if (code.startsWith('<')) language = 'xml';
            blocks.push({ language, code });
          }
        });
        const textareas = document.querySelectorAll('textarea[readonly]');
        textareas.forEach(textarea => {
          const code = textarea.value.trim();
          if (code) {
            let language = 'text';
            if (code.startsWith('{') || code.startsWith('[')) language = 'json';
            else if (code.startsWith('<')) language = 'xml';
            blocks.push({ language, code });
          }
        });
        return blocks;
      });
    } catch (error) {
      return [];
    }
  }

  async extractBlockquotes(page) {
    try {
      return await page.evaluate(() => {
        const elements = document.querySelectorAll('blockquote');
        return Array.from(elements).map(bq => bq.textContent.trim()).filter(text => text.length > 0);
      });
    } catch (error) {
      return [];
    }
  }

  async extractDefinitionLists(page) {
    try {
      return await page.evaluate(() => {
        const elements = document.querySelectorAll('dl');
        return Array.from(elements).map(dl => {
          const items = [];
          let currentTerm = null;
          Array.from(dl.children).forEach(child => {
            if (child.tagName === 'DT') currentTerm = child.textContent.trim();
            else if (child.tagName === 'DD' && currentTerm) {
              items.push({ term: currentTerm, definition: child.textContent.trim() });
              currentTerm = null;
            }
          });
          return items;
        }).filter(list => list.length > 0);
      });
    } catch (error) {
      return [];
    }
  }

  async extractHorizontalRules(page) {
    try {
      return await page.evaluate(() => document.querySelectorAll('hr').length);
    } catch (error) {
      return 0;
    }
  }

  async extractMainContentWithOrder(page) {
    try {
      return await page.evaluate(() => {
        const main = document.querySelector('main') || 
                     document.querySelector('article') || 
                     document.querySelector('[role="main"]') ||
                     document.querySelector('#content') ||
                     document.querySelector('.content') ||
                     document.body;
        
        const result = [];
        let imageIndex = 0;
        
        const processTextNode = (node) => {
          let text = '';
          if (node.nodeType === Node.TEXT_NODE) text += node.textContent;
          else if (node.nodeType === Node.ELEMENT_NODE) {
            const tag = node.tagName;
            const nodeText = node.textContent.trim();
            if (tag === 'A' && node.href) text += `[${nodeText}](${node.href})`;
            else if ((tag === 'STRONG' || tag === 'B') && nodeText) text += `**${nodeText}**`;
            else if ((tag === 'EM' || tag === 'I') && nodeText) text += `*${nodeText}*`;
            else if ((tag === 'DEL' || tag === 'S' || tag === 'STRIKE') && nodeText) text += `~~${nodeText}~~`;
            else if (tag === 'CODE' && nodeText) text += `\`${nodeText}\``;
            else if (tag === 'BR') text += '  \n';
            else Array.from(node.childNodes).forEach(child => text += processTextNode(child));
          }
          return text;
        };
        
        const normalizeText = (text) => (text || '').replace(/\s+/g, ' ').trim();

        const seenText = new Set();
        const pushParagraphIfValid = (text) => {
          const normalized = normalizeText(text);
          if (!normalized) return;
          if (normalized.length < 2 || normalized.length > 500) return;
          if (/^[\d\s,.;:|/\\\-+]+$/.test(normalized)) return;
          if (seenText.has(normalized)) return;
          seenText.add(normalized);
          result.push({ type: 'paragraph', content: normalized });
        };

        const extractContainerInlineText = (element) => {
          let text = '';
          Array.from(element.childNodes).forEach((node) => {
            if (node.nodeType === Node.TEXT_NODE) {
              text += node.textContent || '';
              return;
            }
            if (node.nodeType !== Node.ELEMENT_NODE) return;
            const tag = node.tagName;
            if (['DIV', 'SECTION', 'ARTICLE', 'UL', 'OL', 'TABLE', 'PRE', 'BLOCKQUOTE'].includes(tag)) return;
            text += processTextNode(node);
          });
          return normalizeText(text);
        };

        const processElement = (element) => {
          const tag = element.tagName;
          if (tag === 'P') {
            let text = '';
            Array.from(element.childNodes).forEach(node => text += processTextNode(node));
            pushParagraphIfValid(text);
          } else if (/^H[1-6]$/.test(tag)) {
            let text = '';
            Array.from(element.childNodes).forEach(node => text += processTextNode(node));
            result.push({ type: 'heading', level: parseInt(tag[1]), content: text.trim() });
          } else if (tag === 'IMG') {
            imageIndex++;
            result.push({
              type: 'image',
              src: element.src,
              alt: element.alt || '',
              title: element.title || '',
              index: imageIndex
            });
          } else if (tag === 'UL' || tag === 'OL') {
            const items = [];
            Array.from(element.querySelectorAll('li')).forEach(li => {
              let text = '';
              Array.from(li.childNodes).forEach(node => text += processTextNode(node));
              text = text.trim();
              if (text) items.push(text);
            });
            if (items.length > 0) result.push({ type: 'list', listType: tag.toLowerCase(), items });
          } else if (tag === 'BLOCKQUOTE') {
            result.push({ type: 'blockquote', content: element.textContent.trim() });
          } else if (tag === 'PRE') {
            const code = element.querySelector('code');
            result.push({
              type: 'codeblock',
              language: code ? (code.className.match(/language-(\w+)/) || ['', ''])[1] : '',
              content: element.textContent.trim()
            });
          } else if (tag === 'HR') {
            result.push({ type: 'hr' });
          } else if (tag === 'TABLE') {
            const headers = [];
            const rows = [];
            element.querySelectorAll('thead th, thead td').forEach(cell => headers.push(cell.textContent.trim()));
            element.querySelectorAll('tbody tr, tr').forEach((row, idx) => {
              if (idx === 0 && headers.length === 0) return;
              const cells = Array.from(row.querySelectorAll('td, th')).map(cell => cell.textContent.trim());
              if (cells.length > 0) rows.push(cells);
            });
            if (headers.length > 0 || rows.length > 0) {
              result.push({
                type: 'table',
                headers,
                rows,
                caption: element.querySelector('caption')?.textContent.trim() || ''
              });
            }
          } else if (tag === 'DIV' || tag === 'SECTION' || tag === 'ARTICLE') {
            const inlineText = extractContainerInlineText(element);
            pushParagraphIfValid(inlineText);
            Array.from(element.children).forEach(child => processElement(child));
          }
        };
        
        Array.from(main.children).forEach(child => processElement(child));
        return result;
      });
    } catch (error) {
      return [];
    }
  }
}

export default TextExtractor;
