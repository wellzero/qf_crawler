import fs from 'fs';
import { isValidUrl } from './url-utils.js';

/**
 * Link Manager - 负责管理URL列表的读取、写入、去重和状态跟踪
 */
class LinkManager {
  constructor() {
    this.links = [];
    this.linkIndex = new Map();
  }

  rebuildIndex() {
    this.linkIndex = new Map();
    this.links.forEach((link, index) => {
      this.linkIndex.set(link.url, index);
    });
  }

  /**
   * 从文件加载链接列表
   * @param {string} filePath - links.txt路径
   * @returns {Link[]} 链接对象数组
   */
  loadLinks(filePath) {
    // 如果文件不存在，返回空数组
    if (!fs.existsSync(filePath)) {
      this.links = [];
      this.rebuildIndex();
      return this.links;
    }

    try {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const lines = fileContent.split('\n').filter(line => line.trim() !== '');
      
      this.links = lines.map(line => {
        try {
          // 尝试解析JSON格式的链接对象
          return JSON.parse(line);
        } catch (e) {
          // 如果不是JSON，则作为简单URL处理
          return {
            url: line.trim(),
            status: 'unfetched',
            addedAt: Date.now(),
            fetchedAt: null,
            retryCount: 0,
            error: null
          };
        }
      });

      this.rebuildIndex();

      return this.links;
    } catch (error) {
      throw new Error(`读取链接文件失败: ${error.message}`);
    }
  }

  /**
   * 保存链接列表到文件
   * @param {string} filePath - links.txt路径
   * @param {Link[]} links - 链接对象数组
   */
  saveLinks(filePath, links) {
    try {
      // 将每个链接对象转换为JSON字符串，每行一个
      const content = links.map(link => JSON.stringify(link)).join('\n');
      fs.writeFileSync(filePath, content, 'utf-8');
    } catch (error) {
      throw new Error(`保存链接文件失败: ${error.message}`);
    }
  }

  /**
   * 添加新链接
   * @param {string} url - URL字符串
   * @param {string} status - 状态：unfetched/fetching/fetched/failed
   */
  addLink(url, status = 'unfetched') {
    // 验证URL的有效性
    if (!isValidUrl(url)) {
      console.warn(`Skipped invalid URL when adding: ${url}`);
      return;
    }

    const hasHashRoute = /#\/[^/]+(?:\/|$)/.test(url);
    const urlKey = hasHashRoute ? url : url.split('#')[0];

    // 检查链接是否已存在
    if (this.linkIndex.has(urlKey)) {
      return; // 已存在，不添加
    }

    const newLink = {
      url: urlKey,
      status,
      addedAt: Date.now(),
      fetchedAt: null,
      retryCount: 0,
      error: null
    };

    this.links.push(newLink);
    this.linkIndex.set(urlKey, this.links.length - 1);
  }

  /**
   * 更新链接状态
   * @param {string} url - URL字符串
   * @param {string} status - 新状态
   * @param {string} error - 错误信息（可选）
   */
  updateLinkStatus(url, status, error = null) {
    const hasHashRoute = /#\/[^/]+(?:\/|$)/.test(url);
    const urlKey = hasHashRoute ? url : url.split('#')[0];

    const linkIndex = this.linkIndex.get(urlKey);
    const link = linkIndex !== undefined ? this.links[linkIndex] : null;
    if (link) {
      link.status = status;
      if (status === 'fetched') {
        link.fetchedAt = Date.now();
      }

      // 非失败状态下，清理历史错误信息，避免重试成功后仍显示旧错误
      if (status !== 'failed' && !error) {
        link.error = null;
      }

      if (error) {
        link.error = error;
      }
    }
  }

  /**
   * 获取待爬取的链接
   * @returns {Link[]} 状态为unfetched的链接
   */
  getUnfetchedLinks() {
    return this.links.filter(link => link.status === 'unfetched');
  }

  /**
   * 增加重试次数
   * @param {string} url - URL字符串
   * @returns {number} 当前重试次数
   */
  incrementRetryCount(url) {
    const hasHashRoute = /#\/[^/]+(?:\/|$)/.test(url);
    const urlKey = hasHashRoute ? url : url.split('#')[0];

    const linkIndex = this.linkIndex.get(urlKey);
    const link = linkIndex !== undefined ? this.links[linkIndex] : null;
    if (link) {
      link.retryCount++;
      return link.retryCount;
    }
    return 0;
  }

  /**
   * 去重和排序
   */
  deduplicateAndSort() {
    // 使用Map去重，保留第一次出现的链接
    const uniqueLinksMap = new Map();
    for (const link of this.links) {
      if (!uniqueLinksMap.has(link.url)) {
        uniqueLinksMap.set(link.url, link);
      }
    }

    // 转换回数组并按URL排序
    this.links = Array.from(uniqueLinksMap.values()).sort((a, b) => {
      return a.url.localeCompare(b.url);
    });
    this.rebuildIndex();
  }
}

export default LinkManager;
