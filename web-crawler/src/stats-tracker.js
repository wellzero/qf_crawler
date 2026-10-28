/**
 * Stats Tracker - 负责统计数据收集和报告生成
 */
class StatsTracker {
  constructor() {
    this.stats = {
      totalUrls: 0,
      crawledUrls: 0,
      failedUrls: 0,
      newLinksFound: 0,
      filesGenerated: 0,
      startTime: null,
      endTime: null,
      duration: 0
    };
  }

  /**
   * 开始统计
   */
  start() {
    this.stats.startTime = Date.now();
  }

  /**
   * 结束统计
   */
  end() {
    this.stats.endTime = Date.now();
    this.stats.duration = Math.floor((this.stats.endTime - this.stats.startTime) / 1000);
  }

  /**
   * 设置总URL数
   * @param {number} count - 总数
   */
  setTotalUrls(count) {
    this.stats.totalUrls = count;
  }

  /**
   * 增加已爬取URL计数
   */
  incrementCrawled() {
    this.stats.crawledUrls++;
  }

  /**
   * 增加失败URL计数
   */
  incrementFailed() {
    this.stats.failedUrls++;
  }

  /**
   * 增加新发现链接计数
   * @param {number} count - 新链接数量
   */
  addNewLinks(count) {
    this.stats.newLinksFound += count;
  }

  /**
   * 增加生成文件计数
   */
  incrementFilesGenerated() {
    this.stats.filesGenerated++;
  }

  /**
   * 获取当前统计数据
   * @returns {Object} 统计数据
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * 生成统计报告
   * @returns {string} 格式化的统计报告
   */
  generateReport() {
    const stats = this.getStats();
    const successRate = stats.totalUrls > 0 
      ? ((stats.crawledUrls / stats.totalUrls) * 100).toFixed(1)
      : 0;

    const report = [
      '\n' + '='.repeat(50),
      'Crawler Statistics',
      '='.repeat(50),
      `Total URLs: ${stats.totalUrls}`,
      `Successfully Crawled: ${stats.crawledUrls}`,
      `Failed: ${stats.failedUrls}`,
      `Success Rate: ${successRate}%`,
      `New Links Discovered: ${stats.newLinksFound}`,
      `Files Generated: ${stats.filesGenerated}`,
      `Duration: ${stats.duration} seconds`,
      '='.repeat(50) + '\n'
    ];

    return report.join('\n');
  }

  /**
   * 重置统计数据
   */
  reset() {
    this.stats = {
      totalUrls: 0,
      crawledUrls: 0,
      failedUrls: 0,
      newLinksFound: 0,
      filesGenerated: 0,
      startTime: null,
      endTime: null,
      duration: 0
    };
  }
}

export default StatsTracker;
