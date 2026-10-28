import ChartExtractor from '../src/parsers/extractors/chart-extractor.js';

describe('ChartExtractor', () => {
  let extractor;

  beforeEach(() => {
    extractor = new ChartExtractor();
  });

  describe('extract', () => {
    test('should extract charts and chart data', async () => {
      const mockPage = {
        waitForTimeout: async () => {},
        evaluate: async () => [
          { type: 'echarts', index: 1, title: 'Chart 1', series: [] }
        ]
      };

      const context = {
        page: mockPage,
        options: { filepath: '/path/to/file.md', pagesDir: '/pages' }
      };

      const result = await extractor.extract(context);

      expect(result.charts).toBeDefined();
      expect(result.chartData).toBeDefined();
    });

    test('should return empty arrays when no filepath/pagesDir', async () => {
      const mockPage = {
        waitForTimeout: async () => {},
        evaluate: async () => []
      };

      const context = {
        page: mockPage,
        options: {}
      };

      const result = await extractor.extract(context);

      expect(result.charts).toEqual([]);
      expect(result.chartData).toEqual([]);
    });
  });

  describe('extractAndSaveCharts', () => {
    test('should return empty array when no filepath/pagesDir', async () => {
      const mockPage = {
        waitForTimeout: async () => {}
      };

      const result = await extractor.extractAndSaveCharts(mockPage, null, null);
      expect(result).toEqual([]);
    });

    test('should handle errors gracefully', async () => {
      const mockPage = {
        waitForTimeout: async () => { throw new Error('timeout'); }
      };

      const result = await extractor.extractAndSaveCharts(mockPage, '/path/file.md', '/pages');
      expect(result).toEqual([]);
    });
  });

  describe('extractChartData', () => {
    test('should extract ECharts data', async () => {
      const mockPage = {
        evaluate: async () => [
          {
            type: 'echarts',
            index: 1,
            title: 'Price Chart',
            series: [{ name: 'Price', data: [100, 200] }],
            xAxis: [],
            yAxis: []
          }
        ]
      };

      const result = await extractor.extractChartData(mockPage);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('echarts');
    });

    test('should extract Highcharts data', async () => {
      const mockPage = {
        evaluate: async () => [
          {
            type: 'highcharts',
            index: 1,
            title: 'Volume Chart',
            series: [{ name: 'Volume', data: [1000, 2000] }]
          }
        ]
      };

      const result = await extractor.extractChartData(mockPage);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('highcharts');
    });

    test('should extract Chart.js data', async () => {
      const mockPage = {
        evaluate: async () => [
          {
            type: 'chartjs',
            index: 1,
            chartType: 'line',
            data: { labels: ['A', 'B'], datasets: [] }
          }
        ]
      };

      const result = await extractor.extractChartData(mockPage);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('chartjs');
    });

    test('should return empty array on errors', async () => {
      const mockPage = {
        evaluate: async () => { throw new Error('evaluate error'); }
      };

      const result = await extractor.extractChartData(mockPage);
      expect(result).toEqual([]);
    });
  });
});