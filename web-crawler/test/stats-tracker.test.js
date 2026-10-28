import { jest } from '@jest/globals';
import StatsTracker from '../src/stats-tracker.js';

describe('StatsTracker', () => {
  let tracker;

  beforeEach(() => {
    tracker = new StatsTracker();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('初始化统计数据应为默认值', () => {
    expect(tracker.getStats()).toEqual({
      totalUrls: 0,
      crawledUrls: 0,
      failedUrls: 0,
      newLinksFound: 0,
      filesGenerated: 0,
      startTime: null,
      endTime: null,
      duration: 0
    });
  });

  test('start 和 end 应记录时间并按秒计算 duration', () => {
    const nowSpy = jest.spyOn(Date, 'now')
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(9650);

    tracker.start();
    tracker.end();

    const stats = tracker.getStats();
    expect(nowSpy).toHaveBeenCalledTimes(2);
    expect(stats.startTime).toBe(1000);
    expect(stats.endTime).toBe(9650);
    expect(stats.duration).toBe(8);
  });

  test('各计数方法应正确累加', () => {
    tracker.setTotalUrls(10);
    tracker.incrementCrawled();
    tracker.incrementCrawled();
    tracker.incrementFailed();
    tracker.addNewLinks(3);
    tracker.addNewLinks(2);
    tracker.incrementFilesGenerated();

    expect(tracker.getStats()).toMatchObject({
      totalUrls: 10,
      crawledUrls: 2,
      failedUrls: 1,
      newLinksFound: 5,
      filesGenerated: 1
    });
  });

  test('generateReport 在 totalUrls>0 时应包含正确成功率', () => {
    tracker.setTotalUrls(8);
    tracker.incrementCrawled();
    tracker.incrementCrawled();
    tracker.incrementFailed();
    tracker.addNewLinks(5);
    tracker.incrementFilesGenerated();
    tracker.stats.duration = 12;

    const report = tracker.generateReport();

    expect(report).toContain('Total URLs: 8');
    expect(report).toContain('Successfully Crawled: 2');
    expect(report).toContain('Failed: 1');
    expect(report).toContain('Success Rate: 25.0%');
    expect(report).toContain('New Links Discovered: 5');
    expect(report).toContain('Files Generated: 1');
    expect(report).toContain('Duration: 12 seconds');
  });

  test('generateReport 在 totalUrls=0 时成功率应为 0%', () => {
    const report = tracker.generateReport();
    expect(report).toContain('Success Rate: 0%');
  });

  test('reset 应恢复到初始状态', () => {
    tracker.setTotalUrls(5);
    tracker.incrementCrawled();
    tracker.incrementFailed();
    tracker.addNewLinks(9);
    tracker.incrementFilesGenerated();
    tracker.stats.startTime = 100;
    tracker.stats.endTime = 300;
    tracker.stats.duration = 2;

    tracker.reset();

    expect(tracker.getStats()).toEqual({
      totalUrls: 0,
      crawledUrls: 0,
      failedUrls: 0,
      newLinksFound: 0,
      filesGenerated: 0,
      startTime: null,
      endTime: null,
      duration: 0
    });
  });
});
