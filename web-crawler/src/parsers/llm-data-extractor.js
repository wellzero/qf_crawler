/**
 * LLM Data Extractor - 使用大模型从页面解析结果中提取结构化数据
 */
class LLMDataExtractor {
  constructor(options = {}, logger = null) {
    this.options = options;
    this.logger = logger;
  }

  isEnabled() {
    return this.options.enabled === true;
  }

  async extract(pageData, context = {}) {
    if (!this.isEnabled()) {
      return null;
    }

    const apiKey = this.options.apiKey || process.env.LLM_API_KEY;
    if (!apiKey) {
      this.logger?.warn('LLM数据抽取已启用，但未配置 apiKey（llmExtraction.apiKey 或 LLM_API_KEY）');
      return null;
    }

    const endpoint = (this.options.endpoint || process.env.LLM_API_ENDPOINT || 'https://api.openai.com/v1/chat/completions').trim();
    const model = this.options.model || process.env.LLM_MODEL || 'gpt-4o-mini';
    const maxRecords = this.options.maxRecords || 50;
    const temperature = this.options.temperature ?? 0;

    const prompt = this.buildPrompt(pageData, context, maxRecords);
    const payload = {
      model,
      temperature,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: this.options.systemPrompt || '你是严谨的数据抽取器。只返回合法JSON，不要输出额外解释。'
        },
        {
          role: 'user',
          content: prompt
        }
      ]
    };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger?.warn(`LLM数据抽取失败: HTTP ${response.status} - ${errorText.slice(0, 300)}`);
        return null;
      }

      const result = await response.json();
      const content = result?.choices?.[0]?.message?.content;
      if (!content) {
        this.logger?.warn('LLM数据抽取失败: 响应中没有 content');
        return null;
      }

      const parsed = this.safeParseJson(content);
      if (!parsed || typeof parsed !== 'object') {
        this.logger?.warn('LLM数据抽取失败: content 不是有效JSON对象');
        return null;
      }

      return {
        model,
        endpoint,
        extractedAt: new Date().toISOString(),
        records: Array.isArray(parsed.records) ? parsed.records : [],
        schema: parsed.schema || {},
        notes: parsed.notes || ''
      };
    } catch (error) {
      this.logger?.warn(`LLM数据抽取请求异常: ${error.message}`);
      return null;
    }
  }

  buildPrompt(pageData, context, maxRecords) {
    const sampleTables = (pageData.tables || []).slice(0, 3).map(table => ({
      headers: table.headers || [],
      rows: (table.rows || []).slice(0, 20)
    }));

    const sampleChartData = (pageData.chartData || []).slice(0, 3);
    const sampleTabs = (pageData.tabsAndDropdowns || []).slice(0, 10).map(item => ({
      tab: item.tab,
      dropdown: item.dropdown,
      option: item.option,
      tables: (item.tables || []).length,
      paragraphs: (item.paragraphs || []).length
    }));

    const payload = {
      url: context.url || pageData.url,
      title: pageData.title,
      pageType: pageData.type,
      description: pageData.description,
      headings: (pageData.headings || []).map(h => h.text).slice(0, 30),
      sampleTables,
      sampleChartData,
      sampleTabs,
      instruction: this.options.userPrompt || '抽取可用于量化建模的结构化记录，优先保留时间、主体、指标、数值、维度字段。',
      outputFormat: {
        records: [
          {
            date: 'YYYY-MM-DD or null',
            entity_id: 'string',
            metric: 'string',
            value: 'number|string',
            unit: 'string|null',
            dimensions: {
              tab_type: 'string|null',
              filter_type: 'string|null',
              sort_field: 'string|null'
            },
            source: {
              page_url: 'string',
              source_section: 'table/chart/tab/dropdown/paragraph'
            }
          }
        ],
        schema: {
          fields: ['列出字段名及类型']
        },
        notes: '数据质量说明'
      },
      constraints: [
        `最多输出 ${maxRecords} 条 records`,
        '不要编造页面中不存在的数值',
        '返回必须是合法 JSON 对象'
      ]
    };

    return JSON.stringify(payload, null, 2);
  }

  safeParseJson(content) {
    try {
      return JSON.parse(content);
    } catch (error) {
      const fenced = content.match(/```json\s*([\s\S]*?)```/i) || content.match(/```\s*([\s\S]*?)```/i);
      if (fenced && fenced[1]) {
        try {
          return JSON.parse(fenced[1].trim());
        } catch (innerError) {
          return null;
        }
      }
      return null;
    }
  }
}

export default LLMDataExtractor;
