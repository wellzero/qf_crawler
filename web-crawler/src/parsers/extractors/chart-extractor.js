import fs from 'fs';
import path from 'path';

/**
 * 图表数据提取器
 * 支持提取 Canvas/SVG 截图，以及运行时 ECharts/Highcharts 数据
 */
class ChartExtractor {
  /**
   * 执行提取
   * @param {Object} context - 解析上下文 { page, url, options, data }
   * @returns {Promise<Object>} 提取的数据
   */
  async extract(context) {
    const { page, options } = context;
    const { filepath, pagesDir } = options;

    const charts = await this.extractAndSaveCharts(page, filepath, pagesDir);
    const chartData = await this.extractChartData(page);

    return {
      charts,
      chartData
    };
  }

  async extractAndSaveCharts(page, filepath, pagesDir) {
    const charts = [];
    if (!filepath || !pagesDir) {
      return charts;
    }
    
    try {
      await page.waitForTimeout(2000); // 等待图表渲染完成
      
      const baseFilename = path.basename(filepath, '.md');
      const chartsDir = path.join(pagesDir, baseFilename);
      
      if (!fs.existsSync(chartsDir)) {
        fs.mkdirSync(chartsDir, { recursive: true });
      }
      
      // 查找所有Canvas元素
      const canvases = await page.locator('canvas').all();
      for (let i = 0; i < canvases.length; i++) {
        try {
          const canvas = canvases[i];
          const isVisible = await canvas.isVisible();
          if (!isVisible) continue;
          
          const box = await canvas.boundingBox();
          if (!box || box.width < 10 || box.height < 10) continue;
          
          const chartFilename = `canvas_${i + 1}.png`;
          const chartPath = path.join(chartsDir, chartFilename);
          
          await canvas.screenshot({ path: chartPath });
          
          charts.push({
            type: 'canvas',
            index: i + 1,
            filename: `${baseFilename}/${chartFilename}`,
            width: Math.round(box.width),
            height: Math.round(box.height)
          });
        } catch (error) {
          // ignore
        }
      }
      
      // 查找所有SVG元素
      const svgs = await page.locator('svg').all();
      for (let i = 0; i < svgs.length; i++) {
        try {
          const svg = svgs[i];
          const isVisible = await svg.isVisible();
          if (!isVisible) continue;
          
          const box = await svg.boundingBox();
          if (!box || box.width < 10 || box.height < 10) continue;
          
          const chartFilename = `svg_${i + 1}.png`;
          const chartPath = path.join(chartsDir, chartFilename);
          
          await svg.screenshot({ path: chartPath });
          
          charts.push({
            type: 'svg',
            index: i + 1,
            filename: `${baseFilename}/${chartFilename}`,
            width: Math.round(box.width),
            height: Math.round(box.height)
          });
        } catch (error) {
          // ignore
        }
      }
      
      return charts;
    } catch (error) {
      console.error('Failed to extract and save charts:', error.message);
      return charts;
    }
  }

  async extractChartData(page) {
    try {
      return await page.evaluate(() => {
        const data = [];
        
        // 1. ECharts
        if (window.echarts) {
          try {
            const echartsElements = document.querySelectorAll('[_echarts_instance_]');
            echartsElements.forEach((el, index) => {
              try {
                const instance = window.echarts.getInstanceByDom(el);
                if (instance) {
                  const option = instance.getOption();
                  if (option) {
                    data.push({
                      type: 'echarts',
                      index: index + 1,
                      title: option.title ? option.title[0]?.text || '' : '',
                      series: option.series || [],
                      xAxis: option.xAxis || [],
                      yAxis: option.yAxis || [],
                      legend: option.legend || {},
                      tooltip: option.tooltip || {}
                    });
                  }
                }
              } catch (e) { }
            });
          } catch (e) { }
        }
        
        // 2. Highcharts
        if (window.Highcharts && window.Highcharts.charts) {
          try {
            window.Highcharts.charts.forEach((chart, index) => {
              if (chart) {
                try {
                  data.push({
                    type: 'highcharts',
                    index: index + 1,
                    title: chart.title ? chart.title.textStr : '',
                    series: chart.series.map(s => ({
                      name: s.name,
                      type: s.type,
                      data: s.data.map(p => {
                        if (p && typeof p === 'object') return { x: p.x, y: p.y, name: p.name };
                        return p;
                      })
                    })),
                    xAxis: chart.xAxis ? chart.xAxis.map(x => ({ categories: x.categories, type: x.type })) : [],
                    yAxis: chart.yAxis ? chart.yAxis.map(y => ({ title: y.axisTitle ? y.axisTitle.textStr : '', type: y.type })) : []
                  });
                } catch (e) { }
              }
            });
          } catch (e) { }
        }
        
        // 3. Chart.js
        if (window.Chart && window.Chart.instances) {
          try {
            Object.values(window.Chart.instances).forEach((chart, index) => {
              if (chart && chart.config) {
                try {
                  data.push({
                    type: 'chartjs',
                    index: index + 1,
                    chartType: chart.config.type,
                    data: chart.config.data,
                    options: chart.config.options
                  });
                } catch (e) { }
              }
            });
          } catch (e) { }
        }
        
        return data;
      });
    } catch (error) {
      console.error('Error extracting chart data:', error.message);
      return [];
    }
  }
}

export default ChartExtractor;
