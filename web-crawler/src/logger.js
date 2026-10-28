import fs from 'fs';
import path from 'path';

/**
 * Logger - 负责日志记录和输出
 */
class Logger {
  constructor(logDir = './logs', logLevel = 'INFO') {
    this.logDir = logDir;
    this.logFile = null;
    this.logLevel = logLevel;
    this.logLevels = {
      DEBUG: 0,
      INFO: 1,
      WARN: 2,
      ERROR: 3,
      SUCCESS: 1
    };
    // 统计信息
    this.stats = {
      invalidUrlsSkipped: 0,
      totalUrlsProcessed: 0,
      pagesSucceeded: 0,
      pagesFailed: 0
    };
    this.initLogFile();
  }

  /**
   * 设置日志级别
   * @param {string} level - 日志级别 (DEBUG, INFO, WARN, ERROR)
   */
  setLogLevel(level) {
    if (this.logLevels.hasOwnProperty(level)) {
      this.logLevel = level;
    }
  }

  /**
   * 检查是否应该输出日志
   * @param {string} level - 日志级别
   * @returns {boolean}
   */
  shouldLog(level) {
    const currentLevel = this.logLevels[this.logLevel] || 1;
    const messageLevel = this.logLevels[level] || 1;
    return messageLevel >= currentLevel;
  }

  /**
   * 获取北京时间字符串（UTC+8）
   * @param {Date} date - 日期对象
   * @returns {string} 格式化的北京时间字符串
   */
  getBeijingTime(date = new Date()) {
    const beijingTime = new Date(date.getTime() + (8 * 60 * 60 * 1000));
    const year = beijingTime.getFullYear();
    const month = String(beijingTime.getMonth() + 1).padStart(2, '0');
    const day = String(beijingTime.getDate()).padStart(2, '0');
    const hours = String(beijingTime.getHours()).padStart(2, '0');
    const minutes = String(beijingTime.getMinutes()).padStart(2, '0');
    const seconds = String(beijingTime.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  /**
   * 获取用于文件名的北京时间字符串
   * @param {Date} date - 日期对象
   * @returns {string} 格式化的文件名时间字符串
   */
  getBeijingTimeForFilename(date = new Date()) {
    const beijingTime = new Date(date.getTime() + (8 * 60 * 60 * 1000));
    const year = beijingTime.getFullYear();
    const month = String(beijingTime.getMonth() + 1).padStart(2, '0');
    const day = String(beijingTime.getDate()).padStart(2, '0');
    const hours = String(beijingTime.getHours()).padStart(2, '0');
    const minutes = String(beijingTime.getMinutes()).padStart(2, '0');
    const seconds = String(beijingTime.getSeconds()).padStart(2, '0');
    return `${year}${month}${day}-${hours}${minutes}${seconds}`;
  }

  /**
   * 初始化日志文件
   */
  initLogFile() {
    try {
      // 确保日志目录存在
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }

      // 生成日志文件名（带北京时间戳）
      this.timestamp = this.getBeijingTimeForFilename();
      this.logFile = path.join(this.logDir, `crawler-${this.timestamp}.log`);

      // 创建日志文件（使用北京时间）
      const beijingTime = this.getBeijingTime();
      fs.writeFileSync(this.logFile, `Crawler Log - ${beijingTime} (Beijing Time)\n\n`, 'utf-8');
    } catch (error) {
      console.error('Failed to initialize log file:', error.message);
    }
  }

  /**
   * 获取当前日志的时间戳
   * @returns {string} 时间戳字符串
   */
  getTimestamp() {
    return this.timestamp;
  }

  /**
   * 记录调试日志
   * @param {string} message - 日志消息
   */
  debug(message) {
    this.log('DEBUG', message, '\x1b[90m'); // Gray
  }

  /**
   * 记录信息日志
   * @param {string} message - 日志消息
   */
  info(message) {
    this.log('INFO', message, '\x1b[36m'); // Cyan
  }

  /**
   * 记录警告日志
   * @param {string} message - 日志消息
   */
  warn(message) {
    this.log('WARN', message, '\x1b[33m'); // Yellow
  }

  /**
   * 记录错误日志
   * @param {string} message - 日志消息
   * @param {Error} [error] - 错误对象
   */
  error(message, error = null) {
    const fullMessage = error ? `${message}: ${error.message}` : message;
    this.log('ERROR', fullMessage, '\x1b[31m'); // Red
  }

  /**
   * 记录成功日志
   * @param {string} message - 日志消息
   */
  success(message) {
    this.log('SUCCESS', message, '\x1b[32m'); // Green
  }

  /**
   * 记录日志
   * @param {string} level - 日志级别
   * @param {string} message - 日志消息
   * @param {string} color - 控制台颜色代码
   */
  log(level, message, color = '') {
    // 检查是否应该输出此级别的日志
    if (!this.shouldLog(level)) {
      // 即使不输出到控制台，也写入文件
      const timestamp = this.getBeijingTime();
      const logEntry = `[${timestamp}] [${level}] ${message}`;
      this.writeToFile(logEntry);
      return;
    }

    const timestamp = this.getBeijingTime();
    const logEntry = `[${timestamp}] [${level}] ${message}`;

    // 控制台输出（带颜色）
    console.log(`${color}${logEntry}\x1b[0m`);

    // 文件输出（无颜色）
    this.writeToFile(logEntry);
  }

  /**
   * 写入日志文件
   * @param {string} entry - 日志条目
   */
  writeToFile(entry) {
    if (this.logFile) {
      try {
        fs.appendFileSync(this.logFile, entry + '\n', 'utf-8');
      } catch (error) {
        console.error('Failed to write to log file:', error.message);
      }
    }
  }

  /**
   * 记录进度
   * @param {number} current - 当前进度
   * @param {number} total - 总数
   * @param {string} [message] - 附加消息
   */
  progress(current, total, message = '') {
    const percentage = ((current / total) * 100).toFixed(1);
    const progressMsg = `Progress: ${current}/${total} (${percentage}%)${message ? ' - ' + message : ''}`;
    this.info(progressMsg);
  }

  /**
   * 记录URL处理状态
   * @param {string} url - URL
   * @param {string} status - 状态（success/failed/skipped）
   * @param {string} [details] - 详细信息
   */
  logUrlStatus(url, status, details = '') {
    const statusColors = {
      success: '\x1b[32m',  // Green
      failed: '\x1b[31m',   // Red
      skipped: '\x1b[33m'   // Yellow
    };

    const color = statusColors[status] || '';
    const message = `URL [${status.toUpperCase()}]: ${url}${details ? ' - ' + details : ''}`;
    
    const timestamp = this.getBeijingTime();
    const logEntry = `[${timestamp}] ${message}`;

    console.log(`${color}${logEntry}\x1b[0m`);
    this.writeToFile(logEntry);
  }

  /**
   * 记录发现的新链接
   * @param {number} count - 新链接数量
   * @param {string[]} [links] - 链接列表（可选）
   */
  logNewLinks(count, links = []) {
    this.info(`Discovered ${count} new link(s)`);
    if (links.length > 0 && links.length <= 10) {
      links.forEach(link => {
        this.writeToFile(`  - ${link}`);
      });
    }
  }

  /**
   * 记录页面解析结果摘要
   * @param {string} url - URL
   * @param {Object} summary - 解析结果摘要
   */
  logParseSummary(url, summary) {
    const message = `Parsed ${url}: ${summary.tables || 0} table(s), ${summary.codeBlocks || 0} code block(s), ${summary.tabContents || 0} tab(s)`;
    this.info(message);
  }

  /**
   * 记录无效URL被跳过
   * @param {string} url - 无效的URL
   * @param {string} reason - 跳过原因
   */
  logInvalidUrl(url, reason = 'Invalid parameter value') {
    this.stats.invalidUrlsSkipped++;
    this.warn(`Skipped invalid URL: ${url} (${reason})`);
  }

  /**
   * 获取统计信息
   * @returns {Object} 统计对象
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * 打印统计报告
   */
  printStats() {
    this.info('\n=== Crawler Statistics ===');
    this.info(`Total URLs processed: ${this.stats.totalUrlsProcessed}`);
    this.info(`Pages succeeded: ${this.stats.pagesSucceeded}`);
    this.info(`Pages failed: ${this.stats.pagesFailed}`);
    this.info(`Invalid URLs skipped: ${this.stats.invalidUrlsSkipped}`);
    this.info('=========================\n');
  }

  /**
   * 获取日志文件路径
   * @returns {string} 日志文件路径
   */
  getLogFile() {
    return this.logFile;
  }
}

export default Logger;
