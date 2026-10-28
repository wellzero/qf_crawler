/**
 * API 文档统一格式转换器
 * 将各解析器的不同输出格式统一为标准格式
 */

/**
 * 统一的 API 文档输出格式
 */
const UNIFIED_SCHEMA = {
  // 必需字段
  type: '',           // 文档类型
  url: '',            // 源 URL
  title: '',          // 标题
  description: '',    // 描述
  suggestedFilename: '',

  // API 核心
  api: {
    method: '',       // HTTP 方法: GET/POST/PUT/DELETE/PATCH
    endpoint: '',     // 端点路径
    baseUrl: ''       // 基础 URL
  },

  // 参数
  parameters: [],     // [{name, type, required, description}]

  // 响应
  responseFields: [], // [{name, type, description}]

  // 示例
  codeExamples: [],   // [{language, code}]

  // 内容
  markdownContent: '',
  rawContent: '',

  // 扩展（保留原解析器特有字段）
  _extra: {}
};

/**
 * 字段映射规则
 * 统一字段名 -> 各解析器可能的字段名数组（按优先级）
 */
const FIELD_MAPPINGS = {
  method: ['method', 'requestMethod', 'httpMethod'],
  endpoint: ['endpoint', 'apiPath'],
  parameters: ['parameters', 'inputParams', 'requestParams'],
  responseFields: ['responseFields', 'responseAttributes', 'outputParams'],
  codeExamples: ['codeExamples', 'examples'],
  rawContent: ['rawContent'],
  markdownContent: ['markdownContent']
};

/**
 * 从对象中按字段名数组依次查找值
 * @param {Object} obj - 源对象
 * @param {string[]} fieldNames - 字段名数组（按优先级）
 * @returns {*} 找到的值或 undefined
 */
function findValue(obj, fieldNames) {
  for (const name of fieldNames) {
    // 支持嵌套路径，如 'routeInfo.path'
    if (name.includes('.')) {
      const parts = name.split('.');
      let value = obj;
      for (const part of parts) {
        if (value && typeof value === 'object' && part in value) {
          value = value[part];
        } else {
          value = undefined;
          break;
        }
      }
      if (value !== undefined && value !== null && value !== '') {
        return value;
      }
    } else if (obj && typeof obj === 'object' && name in obj) {
      const value = obj[name];
      if (value !== undefined && value !== null && value !== '') {
        return value;
      }
    }
  }
  return undefined;
}

/**
 * 统一参数格式
 * @param {Array} params - 原始参数数组
 * @returns {Array} 统一格式的参数数组
 */
function normalizeParameters(params) {
  if (!Array.isArray(params) || params.length === 0) {
    return [];
  }

  return params.map(p => {
    // 处理不同格式的参数
    if (typeof p === 'string') {
      return { name: p, type: '', required: false, description: '' };
    }

    return {
      name: p.name || p.paramName || p.key || '',
      type: p.type || p.dataType || '',
      required: p.required === true || p.required === 'true' || p.required === '是',
      description: p.description || p.desc || '',
      default: p.default || p.defaultValue || '',
      options: p.options || ''
    };
  }).filter(p => p.name);
}

/**
 * 统一响应字段格式
 * @param {Array} fields - 原始字段数组
 * @returns {Array} 统一格式的字段数组
 */
function normalizeResponseFields(fields) {
  if (!Array.isArray(fields) || fields.length === 0) {
    return [];
  }

  return fields.map(f => {
    if (typeof f === 'string') {
      return { name: f, type: '', description: '' };
    }

    return {
      name: f.name || f.fieldName || f.key || '',
      type: f.type || f.dataType || '',
      description: f.description || f.desc || ''
    };
  }).filter(f => f.name);
}

/**
 * 统一代码示例格式
 * @param {Array} examples - 原始示例数组
 * @param {Object} rawData - 原始数据（用于提取 curlExample/jsonExample）
 * @returns {Array} 统一格式的示例数组
 */
function normalizeCodeExamples(examples, rawData = {}) {
  const result = [];

  // 处理标准的 examples/codeExamples 数组
  if (Array.isArray(examples)) {
    for (const ex of examples) {
      if (typeof ex === 'string') {
        // 纯字符串，尝试检测语言
        result.push({
          language: detectLanguage(ex),
          code: ex
        });
      } else if (ex && typeof ex === 'object') {
        result.push({
          language: ex.language || ex.lang || detectLanguage(ex.code || ''),
          code: ex.code || ex.content || ''
        });
      }
    }
  }

  // 处理 curlExample（如 eulerpool, finnhub）
  if (rawData.curlExample && typeof rawData.curlExample === 'string') {
    result.push({
      language: 'bash',
      code: rawData.curlExample
    });
  }

  // 处理 jsonExample（如 eulerpool, finnhub）
  if (rawData.jsonExample && typeof rawData.jsonExample === 'string') {
    result.push({
      language: 'json',
      code: rawData.jsonExample
    });
  }

  // 去重
  const seen = new Set();
  return result.filter(ex => {
    const key = `${ex.language}:${ex.code?.substring(0, 50)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return ex.code && ex.code.length > 10;
  });
}

/**
 * 检测代码语言
 * @param {string} code - 代码内容
 * @returns {string} 语言名称
 */
function detectLanguage(code) {
  if (!code) return 'text';
  if (code.includes('curl ') || code.startsWith('GET ') || code.startsWith('POST ')) return 'bash';
  if (code.trim().startsWith('{') || code.trim().startsWith('[')) return 'json';
  if (code.includes('import ') && (code.includes('requests') || code.includes('urllib'))) return 'python';
  if (code.includes('const ') || code.includes('fetch(') || code.includes('axios')) return 'javascript';
  if (code.includes('<?php')) return 'php';
  return 'text';
}

/**
 * 提取扩展字段（非统一字段的原始数据）
 * @param {Object} data - 原始数据
 * @returns {Object} 扩展字段
 */
function extractExtraFields(data) {
  const standardFields = new Set([
    'type', 'url', 'title', 'description', 'suggestedFilename',
    'method', 'requestMethod', 'httpMethod',
    'endpoint', 'apiPath', 'baseUrl',
    'parameters', 'inputParams', 'requestParams',
    'responseFields', 'responseAttributes', 'outputParams', 'responses',
    'codeExamples', 'examples', 'curlExample', 'jsonExample',
    'markdownContent', 'rawContent', 'mainContent',
    'sections', 'tables', 'headings', 'paragraphs', 'lists'
  ]);

  const extra = {};
  for (const [key, value] of Object.entries(data)) {
    if (!standardFields.has(key) && value !== undefined && value !== null && value !== '') {
      extra[key] = value;
    }
  }
  return extra;
}

/**
 * 将解析器输出统一为标准格式
 * @param {Object} rawData - 解析器原始输出
 * @returns {Object} 统一格式的文档对象
 */
export function formatApiDoc(rawData) {
  if (!rawData || typeof rawData !== 'object') {
    return { ...UNIFIED_SCHEMA };
  }

  // 提取核心字段
  const method = findValue(rawData, FIELD_MAPPINGS.method) || '';
  const endpoint = findValue(rawData, FIELD_MAPPINGS.endpoint) || '';
  const parameters = findValue(rawData, FIELD_MAPPINGS.parameters) || [];
  const responseFields = findValue(rawData, FIELD_MAPPINGS.responseFields) || [];
  const codeExamples = findValue(rawData, FIELD_MAPPINGS.codeExamples) || [];
  const rawContent = findValue(rawData, FIELD_MAPPINGS.rawContent) || '';
  const markdownContent = findValue(rawData, FIELD_MAPPINGS.markdownContent) || '';

  // 构建统一格式对象
  const result = {
    // 必需字段
    type: rawData.type || '',
    url: rawData.url || '',
    title: rawData.title || '',
    description: rawData.description || '',
    suggestedFilename: rawData.suggestedFilename || '',

    // API 核心
    api: {
      method: method.toUpperCase(),
      endpoint: endpoint,
      baseUrl: rawData.baseUrl || ''
    },

    // 参数（统一格式）
    parameters: normalizeParameters(parameters),

    // 响应字段（统一格式）
    responseFields: normalizeResponseFields(responseFields),

    // 代码示例（统一格式）
    codeExamples: normalizeCodeExamples(codeExamples, rawData),

    // 内容
    markdownContent: markdownContent || generateMarkdownFromRaw(rawContent, rawData),
    rawContent: rawContent,

    // 扩展字段
    _extra: extractExtraFields(rawData)
  };

  // 处理 responses 字段（如果有）
  if (rawData.responses && Array.isArray(rawData.responses)) {
    result.responses = rawData.responses.map(r => ({
      statusCode: r.code || r.statusCode || r.status || '',
      description: r.description || ''
    }));
  }

  return result;
}

/**
 * 从原始内容生成 Markdown
 * @param {string} rawContent - 原始文本内容
 * @param {Object} data - 原始数据对象
 * @returns {string} Markdown 内容
 */
function generateMarkdownFromRaw(rawContent, data) {
  if (!rawContent && !data) return '';

  const lines = [];

  // 标题
  if (data.title) {
    lines.push(`# ${data.title}`, '');
  }

  // 描述
  if (data.description) {
    lines.push(data.description, '');
  }

  // API 端点信息
  const method = findValue(data, FIELD_MAPPINGS.method) || '';
  const endpoint = findValue(data, FIELD_MAPPINGS.endpoint) || '';

  if (method || endpoint) {
    lines.push('## API 端点', '');
    if (method) lines.push(`**Method:** \`${method.toUpperCase()}\``);
    if (endpoint) lines.push(`**Endpoint:** \`${endpoint}\``);
    lines.push('');
  }

  // 如果有原始内容，追加
  if (rawContent && rawContent.length > 100) {
    // 清理并截取有效内容
    const cleanedContent = rawContent
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .substring(0, 5000);
    lines.push(cleanedContent);
  }

  return lines.join('\n');
}

/**
 * 批量格式化
 * @param {Object[]} docs - 文档数组
 * @returns {Object[]} 统一格式的文档数组
 */
export function formatApiDocs(docs) {
  if (!Array.isArray(docs)) return [];
  return docs.map(formatApiDoc);
}

export default {
  formatApiDoc,
  formatApiDocs,
  UNIFIED_SCHEMA
};