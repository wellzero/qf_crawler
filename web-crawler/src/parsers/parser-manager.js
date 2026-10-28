import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Parser Manager - 管理所有解析器，根据URL选择合适的解析器
 */
class ParserManager {
  constructor() {
    this.parsers = [];
    this.initialized = false;
    this.initPromise = null;
  }

  /**
   * 动态扫描并加载所有解析器
   */
  async init() {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        const files = fs.readdirSync(__dirname);
        const parserFiles = files.filter(file => 
          file.endsWith('-parser.js') && 
          file !== 'base-parser.js' && 
          file !== 'parser-manager.js'
        );

        for (const file of parserFiles) {
          try {
            const module = await import(`./${file}`);
            const ParserClass = module.default;
            if (ParserClass && typeof ParserClass === 'function') {
              this.register(new ParserClass());
            }
          } catch (e) {
            console.warn(`[ParserManager] Failed to load parser from ${file}:`, e.message);
          }
        }
        
        this.initialized = true;
      } catch (e) {
        console.error('[ParserManager] Error during initialization:', e.message);
      }
    })();

    return this.initPromise;
  }

  /**
   * 注册新的解析器
   * @param {BaseParser} parser - 解析器实例
   */
  register(parser) {
    this.parsers.push(parser);
    // 按优先级排序（高优先级在前）
    this.parsers.sort((a, b) => {
      const priorityA = typeof a.getPriority === 'function' ? a.getPriority() : 0;
      const priorityB = typeof b.getPriority === 'function' ? b.getPriority() : 0;
      return priorityB - priorityA;
    });
  }

  /**
   * 根据URL选择合适的解析器
   * @param {string} url - 页面URL
   * @returns {BaseParser} 匹配的解析器
   */
  async selectParser(url) {
    await this.init();
    for (const parser of this.parsers) {
      if (typeof parser.matches === 'function' && parser.matches(url)) {
        return parser;
      }
    }
    // 默认返回最后一个（GenericParser 的优先级为 0）
    return this.parsers.find(p => p.constructor.name === 'GenericParser') || this.parsers[this.parsers.length - 1];
  }

  /**
   * 异步选择解析器（支持内容特征检测）
   * 选择流程：
   * 1. 先尝试 URL 模式匹配
   * 2. 如果 URL 不匹配 GenericParser，尝试内容特征检测
   * 3. 最后用 GenericParser 兜底
   * @param {Page} page - Playwright页面对象
   * @param {string} url - 页面URL
   * @returns {Promise<BaseParser>} 匹配的解析器
   */
  async selectParserAsync(page, url) {
    await this.init();
    
    // 1. 先尝试 URL 匹配
    for (const parser of this.parsers) {
      if (typeof parser.matches === 'function' && parser.matches(url)) {
        // 如果是 GenericParser，继续尝试内容检测
        if (parser.constructor.name === 'GenericParser') {
          break;
        }
        return parser;
      }
    }

    // 2. URL 不匹配（会落入 GenericParser），尝试内容特征检测
    let bestParser = null;
    let bestScore = 0;
    const minScoreThreshold = 50; // 置信度阈值

    for (const parser of this.parsers) {
      // 跳过 GenericParser
      if (parser.constructor.name === 'GenericParser') continue;

      if (parser.detectByContent && typeof parser.detectByContent === 'function') {
        try {
          const score = await parser.detectByContent(page);
          if (score > bestScore && score >= minScoreThreshold) {
            bestScore = score;
            bestParser = parser;
          }
        } catch (error) {
          // 忽略检测错误
        }
      }
    }

    // 3. 返回最佳匹配或 GenericParser
    if (bestParser) {
      console.log(`[ParserManager] 内容检测匹配: ${bestParser.constructor.name} (置信度: ${bestScore})`);
      return bestParser;
    }

    return this.parsers.find(p => p.constructor.name === 'GenericParser') || this.parsers[this.parsers.length - 1];
  }

  /**
   * 解析页面
   * @param {Page} page - Playwright页面对象
   * @param {string} url - 页面URL
   * @param {Object} options - 解析选项
   * @returns {Promise<Object>} 解析后的页面数据
   */
  async parse(page, url, options = {}) {
    await this.init();
    const parser = await this.selectParserAsync(page, url);
    return await parser.parse(page, url, options);
  }
}

export default ParserManager;
