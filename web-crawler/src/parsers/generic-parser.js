import BaseParser from './base-parser.js';
import TextExtractor from './extractors/text-extractor.js';
import MediaExtractor from './extractors/media-extractor.js';
import TableExtractor from './extractors/table-extractor.js';
import ChartExtractor from './extractors/chart-extractor.js';
import ExpandHandler from './interactors/expand-handler.js';
import ScrollHandler from './interactors/scroll-handler.js';
import ApiInterceptor from './interceptors/api-interceptor.js';
import FeatureDetector from './detectors/feature-detector.js';

/**
 * Generic Parser - 通用页面解析器
 * 作为 fallback，匹配所有页面。通过组装各种 Extractor 和 Interactor 实现能力。
 */
class GenericParser extends BaseParser {
  constructor() {
    super();
    
    // 网络拦截 (提取 API 数据)
    const apiInterceptor = new ApiInterceptor();
    this.apiInterceptor = apiInterceptor; // 保存引用用于 beforeLoad 钩子
    this.useExtractor(apiInterceptor);

    // 交互行为
    this.useInteractor(new ExpandHandler());
    this.useInteractor(new ScrollHandler({ maxScrolls: 30 }));

    // 数据提取
    this.useExtractor(new TextExtractor());
    this.useExtractor(new MediaExtractor());
    this.useExtractor(new TableExtractor({ supportPagination: true, supportVirtual: true }));
    this.useExtractor(new ChartExtractor());
    this.useExtractor(new FeatureDetector());
  }

  /**
   * 匹配所有页面
   */
  matches(url) {
    return true;
  }

  /**
   * 获取优先级（最低）
   */
  getPriority() {
    return 0;
  }

  /**
   * 在加载内容前挂载拦截器
   */
  async beforeLoad(context) {
    await this.apiInterceptor.beforeLoad(context);
  }

  /**
   * 提取完成后的数据格式化
   */
  async afterExtract(context) {
    const data = context.data;
    const url = context.url;

    // 整合 API 表格和 DOM 表格
    let finalTables = data.tables || [];
    if (data.apiTables && data.apiTables.length > 0) {
      // 避免重复添加 (apiTables 已经在 ApiInterceptor 中处理过了)
      // 但我们需要将它合并到最终的 tables 数组中
      finalTables = [...finalTables, ...data.apiTables];
    }

    return {
      type: 'generic',
      subtype: data.pageFeatures?.suggestedType || 'unknown',
      url,
      title: data.title || '',
      description: data.description || '',
      headings: data.headings || [],
      mainContent: data.mainContent || [],
      paragraphs: data.paragraphs || [],
      lists: data.lists || [],
      tables: finalTables,
      codeBlocks: data.codeBlocks || [],
      images: data.images || [],
      charts: data.charts || [],
      chartData: data.chartData || [],
      blockquotes: data.blockquotes || [],
      definitionLists: data.definitionLists || [],
      horizontalRules: data.horizontalRules || 0,
      videos: data.videos || [],
      audios: data.audios || [],
      apiData: data.apiDataCount || 0,
      pageFeatures: data.pageFeatures || { suggestedType: 'unknown', confidence: 0, signals: [] },
      
      // 以下字段保留为空，为了向后兼容旧的测试用例和代码
      tabsAndDropdowns: [],
      dateFilters: []
    };
  }
}

export default GenericParser;
