import BaseParser from './base-parser.js';

/**
 * ModelScope MCP Parser - 专门解析 ModelScope MCP 服务器文档页面
 * ModelScope MCP 是一个 MCP (Model Context Protocol) 服务器目录
 * URL 格式: https://modelscope.cn/mcp/servers/{server-name}
 * 例如: https://modelscope.cn/mcp/servers/@modelcontextprotocol/fetch
 */
class ModelscopeMcpParser extends BaseParser {
  /**
   * ModelScope MCP 页面需要在解析器内部做额外等待后才能稳定拿到链接
   */
  supportsLinkDiscovery() {
    return true;
  }

  /**
   * 自定义链接发现：
   * - 复用 waitForContent，确保动态内容加载后再抽取链接
   * - 优先抽取 /mcp/servers/ 详情页
   * - 回退抽取所有 /mcp 站内链接
   */
  async discoverLinks(page) {
    try {
      await this.waitForContent(page);

      const links = await page.evaluate(() => {
        const toAbsoluteUrl = (href) => {
          try {
            return new URL(href, window.location.origin).toString().split('#')[0];
          } catch (e) {
            return null;
          }
        };

        const candidates = new Set();

        // 1) 先抓详情页
        document.querySelectorAll('a[href*="/mcp/servers/"]').forEach((a) => {
          const absoluteUrl = toAbsoluteUrl(a.getAttribute('href') || a.href);
          if (absoluteUrl) candidates.add(absoluteUrl);
        });

        // 2) 再抓所有 MCP 站内页面
        document.querySelectorAll('a[href*="/mcp"]').forEach((a) => {
          const absoluteUrl = toAbsoluteUrl(a.getAttribute('href') || a.href);
          if (absoluteUrl) candidates.add(absoluteUrl);
        });

        // 3) 某些卡片不是标准 a 标签，尝试 data-href
        document.querySelectorAll('[data-href*="/mcp"]').forEach((el) => {
          const absoluteUrl = toAbsoluteUrl(el.getAttribute('data-href'));
          if (absoluteUrl) candidates.add(absoluteUrl);
        });

        return Array.from(candidates);
      });

      // 保留 modelscope.cn/mcp* 站内链接，统一去重
      const normalizedLinks = Array.from(new Set(
        links.filter(link => /^https?:\/\/modelscope\.cn\/mcp/.test(link))
      ));

      return normalizedLinks;
    } catch (error) {
      console.warn('[ModelscopeMcpParser] discoverLinks failed:', error.message);
      return [];
    }
  }

  /**
   * 匹配 ModelScope MCP 页面
   * @param {string} url - 页面URL
   * @returns {boolean} 是否匹配
   */
  matches(url) {
    return /^https?:\/\/modelscope\.cn\/mcp/.test(url);
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
      // 移除 /mcp 前缀
      pathname = pathname.replace(/^\/mcp\/?/, '');
      pathname = pathname.replace(/\/$/, '');
      // 处理 servers/ 前缀
      pathname = pathname.replace(/^servers\//, '');
      const filename = pathname.replace(/\//g, '_') || 'mcp_overview';
      return filename;
    } catch (e) {
      return 'modelscope_mcp_doc';
    }
  }

  /**
   * 从 URL 提取服务器路径
   * @param {string} url - 页面URL
   * @returns {string} 服务器路径
   */
  extractServerPath(url) {
    try {
      const urlObj = new URL(url);
      let pathname = urlObj.pathname;
      pathname = pathname.replace(/^\/mcp\/?/, '');
      return pathname;
    } catch (e) {
      return '';
    }
  }

  /**
   * 等待页面内容加载完成
   */
  async waitForContent(page) {
    try {
      await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
      // 等待主内容区域
      await page.waitForSelector('main', { timeout: 15000 });
      await page.waitForFunction(() => {
        const text = document.body?.innerText || '';
        return text.includes('ModelScope MCP') || text.includes('MCP Server');
      }, { timeout: 15000 });
      await page.waitForTimeout(2000); // 额外等待动态内容

      // 主动滚动触发懒加载
      for (let i = 0; i < 5; i++) {
        await page.mouse.wheel(0, 2400);
        await page.waitForTimeout(400);
      }
      await page.mouse.wheel(0, -12000);
      await page.waitForTimeout(600);

      // 处理登录弹窗
      await this.handleLoginModal(page);

      // 展开所有折叠的工具信息
      await this.expandCollapsedContent(page);
    } catch (error) {
      console.warn('Wait for content timeout, proceeding anyway:', error.message);
    }
  }

  /**
   * 展开所有折叠的内容
   * 使用 JavaScript 直接点击，避免被遮罩层阻挡
   */
  async expandCollapsedContent(page) {
    try {
      // 使用 JavaScript 直接点击展开按钮，避免被遮罩层阻挡
      const clickedCount = await page.evaluate(() => {
        let count = 0;
        // 查找所有展开按钮
        const selectors = [
          '.antd5-typography-expand',
          '[aria-label="展开"]',
          '[class*="expand"]',
          '[class*="Expand"]'
        ];

        selectors.forEach(selector => {
          try {
            document.querySelectorAll(selector).forEach(btn => {
              try {
                btn.click();
                count++;
              } catch {
                // 元素点击可能失败（不可见/禁用），忽略继续
              }
            });
          } catch {
            // 选择器查询失败，忽略继续
          }
        });

        return count;
      });

      if (clickedCount > 0) {
        console.log(`Expanded ${clickedCount} collapsed sections`);
        await page.waitForTimeout(1000);
      }
    } catch (error) {
      // 忽略错误
    }
  }

  /**
   * 处理登录弹窗
   * 关闭可能出现的登录提示框
   */
  async handleLoginModal(page) {
    try {
      // 检查是否有登录弹窗或遮罩层
      const modalSelectors = [
        '.antd5-modal-close',
        '.ant-modal-close',
        '[class*="modal"] [class*="close"]',
        '[class*="Modal"] [class*="close"]',
        'button[aria-label="Close"]',
        '.close-btn'
      ];

      for (const selector of modalSelectors) {
        const closeButton = await page.$(selector);
        if (closeButton) {
          const isVisible = await closeButton.isVisible();
          if (isVisible) {
            await closeButton.click();
            await page.waitForTimeout(500);
            console.log('Closed login modal');
            break;
          }
        }
      }

      // 也尝试点击遮罩层关闭弹窗
      const overlaySelectors = [
        '.antd5-modal-wrap',
        '.ant-modal-wrap',
        '[class*="modal-mask"]'
      ];

      for (const selector of overlaySelectors) {
        const overlay = await page.$(selector);
        if (overlay) {
          // 按 Escape 键关闭
          await page.keyboard.press('Escape');
          await page.waitForTimeout(500);
          break;
        }
      }
    } catch (error) {
      // 忽略错误，继续处理
    }
  }

  /**
   * 解析 ModelScope MCP 页面
   * @param {Page} page - Playwright页面对象
   * @param {string} url - 页面URL
   * @param {Object} options - 解析选项
   * @returns {Promise<Object>} 解析后的页面数据
   */
  async parse(page, url, options = {}) {
    try {
      await this.waitForContent(page);

      const serverPath = this.extractServerPath(url);
      const isServerDetail = serverPath.startsWith('servers/');

      // 先获取页面原始数据
      const rawData = await page.evaluate(() => {
        const result = {
          title: '',
          description: '',
          serverInfo: {},
          tags: [],
          codeBlocks: [],
          tables: [],
          rawContent: '',
          links: []
        };

        // 获取 main 元素作为主要内容容器
        const main = document.querySelector('main');
        if (!main) {
          return result;
        }

        // 提取标题
        const h1 = main.querySelector('h1');
        if (h1) {
          result.title = h1.textContent.trim();
        }

        // 提取描述
        const descriptionEl = main.querySelector('.acss-j8jmz5') ||
                              main.querySelector('[class*="description"]');
        if (descriptionEl) {
          result.description = descriptionEl.textContent.trim();
        }

        // 提取服务器基本信息
        const serverNameEl = main.querySelector('.acss-cyoggp');
        const serverPathEl = main.querySelector('.acss-149f9ri');
        if (serverNameEl) {
          result.serverInfo['开发者'] = serverNameEl.textContent.trim();
        }
        if (serverPathEl) {
          result.serverInfo['路径'] = serverPathEl.textContent.trim();
        }

        // 提取原始内容
        result.rawContent = main.innerText || '';

        // 提取许可证信息
        const licenseMatch = result.rawContent.match(/License[:\s]+([A-Za-z\s]+)/i);
        if (licenseMatch) {
          result.serverInfo['许可证'] = licenseMatch[1].trim();
        }

        // 提取标签
        const tags = main.querySelectorAll('.antd5-tag');
        const seenTags = new Set();
        tags.forEach(tag => {
          const tagText = tag.textContent.trim();
          if (tagText &&
              !tagText.includes('License') &&
              !tagText.includes('Developer') &&
              !tagText.includes('Hosted') &&
              !tagText.includes('Deployable') &&
              tagText.length > 2 &&
              tagText.length < 30 &&
              !seenTags.has(tagText)) {
            result.tags.push(tagText);
            seenTags.add(tagText);
          }
        });

        // 提取真正的代码块（只保留多行代码）
        const codeElements = main.querySelectorAll('pre');
        codeElements.forEach(el => {
          const code = el.textContent.trim();
          if (code && (code.split('\n').length >= 3 || code.length > 50)) {
            let language = 'text';

            if (code.startsWith('{') || code.startsWith('"mcpServers"')) {
              language = 'json';
            } else if (code.includes('pip ') || code.includes('python ') || code.includes('import ')) {
              language = 'python';
            } else if (code.includes('npm ') || code.includes('npx ') || code.includes('node ')) {
              language = 'bash';
            } else if (code.includes('docker ')) {
              language = 'bash';
            }

            if (!result.codeBlocks.find(b => b.code === code)) {
              result.codeBlocks.push({ language, code });
            }
          }
        });

        // 提取表格
        const tables = main.querySelectorAll('table');
        tables.forEach((table, index) => {
          const headers = [];
          const rows = [];

          const headerRow = table.querySelector('thead tr') || table.querySelector('tr');
          if (headerRow) {
            const headerCells = headerRow.querySelectorAll('th, td');
            headerCells.forEach(cell => headers.push(cell.textContent.trim()));
          }

          const bodyRows = table.querySelectorAll('tbody tr');
          const rowsToProcess = bodyRows.length > 0 ? bodyRows : table.querySelectorAll('tr');

          rowsToProcess.forEach((row, rowIndex) => {
            if (rowIndex === 0 && bodyRows.length === 0) return;

            const cells = row.querySelectorAll('td, th');
            if (cells.length > 0) {
              const rowData = {};
              cells.forEach((cell, cellIndex) => {
                const headerName = headers[cellIndex] || `column_${cellIndex}`;
                rowData[headerName] = cell.textContent.trim();
              });
              rows.push(rowData);
            }
          });

          if (rows.length > 0) {
            result.tables.push({ index, headers, rows });
          }
        });

        // 提取 MCP 相关链接
        const links = main.querySelectorAll('a[href*="/mcp"]');
        const seenLinks = new Set();
        links.forEach(link => {
          const href = link.href;
          const text = link.textContent.trim();
          if (text && !seenLinks.has(href)) {
            result.links.push({ text, href });
            seenLinks.add(href);
          }
        });

        return result;
      });

      // 在 evaluate 外部解析工具信息
      const tools = this.parseToolsFromText(rawData.rawContent);

      // 从原始内容提取安装和配置部分
      const installation = this.parseInstallation(rawData.rawContent);
      const configuration = this.parseConfiguration(rawData.rawContent);

      return {
        type: 'modelscope-mcp-server',
        url,
        serverPath,
        isServerDetail,
        title: rawData.title,
        description: rawData.description,
        serverInfo: rawData.serverInfo,
        tools,
        tags: rawData.tags,
        installation,
        configuration,
        codeBlocks: rawData.codeBlocks,
        tables: rawData.tables,
        links: rawData.links,
        rawContent: rawData.rawContent,
        suggestedFilename: this.generateFilename(url)
      };
    } catch (error) {
      console.error('Failed to parse ModelScope MCP page:', error.message);
      return {
        type: 'modelscope-mcp-server',
        url,
        serverPath: this.extractServerPath(url),
        isServerDetail: false,
        title: '',
        description: '',
        serverInfo: {},
        tools: [],
        tags: [],
        installation: '',
        configuration: '',
        codeBlocks: [],
        tables: [],
        links: [],
        rawContent: '',
        suggestedFilename: this.generateFilename(url)
      };
    }
  }

  /**
   * 从文本中解析工具信息
   * 支持多种格式:
   * 1. 主页面格式: 中文名称 tool_name (例如: 地理编码 map_geocode)
   * 2. /tools 页面格式: Tool_name 后跟描述 (例如: List_console_messages)
   * 3. 英文格式: tool_name - 描述
   */
  parseToolsFromText(text) {
    if (!text) return [];

    const tools = [];
    const lines = text.split('\n');
    let currentTool = null;
    let lastInputLine = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (!line) {
        lastInputLine = false;
        continue;
      }

      // 跳过标题行
      if (line === '工具' || line.match(/^Available\s*Tools$/i)) {
        continue;
      }

      // 格式1: 中文名称 + 工具英文名 (例如: 地理编码 map_geocode)
      const chineseToolMatch = line.match(/^([\u4e00-\u9fa5][\u4e00-\u9fa5\w\s]*?)\s+([a-z][a-z0-9_]*)$/);
      if (chineseToolMatch) {
        if (currentTool) {
          tools.push(currentTool);
        }
        currentTool = {
          name: chineseToolMatch[2],
          displayName: chineseToolMatch[1].trim(),
          description: '',
          inputs: [],
          outputs: []
        };
        lastInputLine = false;
        continue;
      }

      // 格式2: /tools 页面格式 - PascalCase 或大写开头的工具名 (例如: List_console_messages, Click, Fill_form)
      // 匹配: 单独一行，工具名后没有中文，下一行是描述
      const toolsPageMatch = line.match(/^([A-Z][a-zA-Z0-9_]*)$/);
      if (toolsPageMatch) {
        // 检查下一行是否是描述（有实际内容，不是另一个工具名）
        const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : '';
        if (nextLine && !nextLine.match(/^([A-Z][a-zA-Z0-9_]*)$/) && !nextLine.match(/^[\u4e00-\u9fa5]+\s+[a-z]/)) {
          if (currentTool) {
            tools.push(currentTool);
          }
          currentTool = {
            name: toolsPageMatch[1],
            displayName: toolsPageMatch[1],
            description: '',
            inputs: [],
            outputs: []
          };
          lastInputLine = false;
          continue;
        }
      }

      // 格式3: 纯英文名的工具格式: tool_name - 描述
      const englishToolMatch = line.match(/^([a-z][a-z0-9_]*)\s*[-–]\s*(.+)$/);
      if (englishToolMatch && !line.includes(':')) {
        if (currentTool) {
          tools.push(currentTool);
        }
        currentTool = {
          name: englishToolMatch[1],
          displayName: englishToolMatch[1],
          description: englishToolMatch[2],
          inputs: [],
          outputs: []
        };
        lastInputLine = false;
        continue;
      }

      // 检测描述行 - 为当前工具添加描述
      if (currentTool && !currentTool.description) {
        // 描述行：非特殊格式，长度适中
        if (!line.startsWith('输入') &&
            !line.startsWith('输出') &&
            !line.match(/^[A-Z][a-zA-Z0-9_]*$/) &&
            !line.match(/^[a-z_][a-z0-9_]*\s*[-–]/i) &&
            !line.match(/^[a-z_][a-z0-9_]*\s+[\u4e00-\u9fa5]/)) {
          // 描述通常是较长的句子
          if (line.length > 10 && line.length < 300) {
            currentTool.description = line;
          }
        }
      }

      // 检测输入参数: 输入: param_name 描述
      if (line.startsWith('输入:') || line.startsWith('输入：')) {
        const inputContent = line.replace(/^输入[:：]\s*/, '');
        const paramMatch = inputContent.match(/^(\w+)\s*(.*)$/);
        if (paramMatch && currentTool) {
          currentTool.inputs.push({
            name: paramMatch[1],
            description: paramMatch[2] || ''
          });
        }
        lastInputLine = true;
        continue;
      }

      // 检测输出: 输出: value1, value2
      if (line.startsWith('输出:') || line.startsWith('输出：')) {
        const outputContent = line.replace(/^输出[:：]\s*/, '');
        if (currentTool) {
          currentTool.outputs = outputContent.split(',').map(o => o.trim()).filter(o => o);
        }
        lastInputLine = false;
        continue;
      }

      // 续行的输入参数（在输入块内的参数定义）
      if (lastInputLine && currentTool) {
        const paramMatch = line.match(/^([a-z_][a-z0-9_]*)\s+(.+)$/i);
        if (paramMatch && paramMatch[2].match(/[\u4e00-\u9fa5]/)) {
          currentTool.inputs.push({
            name: paramMatch[1],
            description: paramMatch[2]
          });
        }
      }
    }

    if (currentTool) {
      tools.push(currentTool);
    }

    // 过滤掉无效的工具
    // 1. 排除常见非工具词和 UI 元素
    const nonToolWords = ['Local', 'Hosted', 'GitHub', 'GitLab', 'Gitee', 'Deployable', 'Discussions', 'Feedback', 'Tools', 'Service', 'Config', 'Setup', 'Install', 'Update', 'Version', 'License', 'Developer', 'Description', 'Collapse', 'Expand', 'Show', 'Hide', 'More', 'Less'];

    return tools.filter(t => {
      if (!t.name || t.name.length < 3) return false;

      // 排除非工具词
      if (nonToolWords.includes(t.name)) return false;

      // 工具名必须包含下划线，或者是纯大写首字母的驼峰式命名（如 Click, Drag, Fill）
      const hasUnderscore = t.name.includes('_');
      const isShortToolName = /^[A-Z][a-z]+$/.test(t.name); // 如 Click, Drag, Hover

      return hasUnderscore || isShortToolName;
    });
  }

  /**
   * 解析安装部分
   */
  parseInstallation(text) {
    if (!text) return '';

    const installMatch = text.match(/(?:开始|Getting Started|安装|Installation)[\s\S]*?(?=(?:配置|Configuration|Service|$))/i);
    return installMatch ? installMatch[0].trim() : '';
  }

  /**
   * 解析配置部分
   */
  parseConfiguration(text) {
    if (!text) return '';

    const configMatch = text.match(/(?:配置|Configuration)[\s\S]*?(?=(?:Service|授权|许可|反馈|更新|$))/i);
    return configMatch ? configMatch[0].trim() : '';
  }
}

export default ModelscopeMcpParser;
