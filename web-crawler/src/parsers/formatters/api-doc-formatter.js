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

  // 请求
  requestHeaders: [],   // [{name, type, required, description}]
  parameters: [],       // [{name, type, required, default, description}]
  requestBody: {},      // {description, schema, example}

  // 响应
  responseStatuses: [], // [{code, description}]
  responseFields: [],   // [{name, type, description}]

  // 示例
  requestExamples: [],  // [{language, code}]
  responseExamples: [], // [{language, code}]
  codeExamples: [],     // [{language, code}]

  // 其他信息
  authentication: '',   // 认证方式说明
  rateLimit: '',        // 速率限制说明
  errors: [],           // [{code, description, solution}]

  // 附加
  notes: [],            // [{type, content}]
  relatedLinks: [],     // [{title, url}]
  changelog: [],        // [{version, date, changes}]

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
  parameters: ['parameters', 'inputParams', 'requestParams', 'params'],
  responseFields: ['responseFields', 'responseAttributes', 'outputParams', 'responses', 'returns', 'attributes'],
  codeExamples: ['codeExamples', 'examples', 'signature'],
  rawContent: ['rawContent'],
  markdownContent: ['markdownContent'],
  requestHeaders: ['requestHeaders', 'headers'],
  requestBody: ['requestBody', 'body'],
  responseStatuses: ['responseStatuses', 'statusCodes'],
  requestExamples: ['requestExamples', 'requestExample'],
  responseExamples: ['responseExamples', 'responseExample'],
  authentication: ['authentication', 'auth', 'authMethod'],
  rateLimit: ['rateLimit', 'rateLimits', 'rate'],
  errors: ['errors', 'errorCodes'],
  notes: ['notes', 'warnings', 'importantNotes'],
  relatedLinks: ['relatedLinks', 'related', 'links', 'seeAlso'],
  changelog: ['changelog', 'versionHistory', 'versions']
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
 * 统一请求头格式
 * @param {Array} headers - 原始请求头数组
 * @returns {Array} 统一格式的请求头数组
 */
function normalizeRequestHeaders(headers) {
  if (!Array.isArray(headers) || headers.length === 0) {
    return [];
  }

  return headers.map(h => {
    if (typeof h === 'string') {
      return { name: h, type: '', required: false, description: '' };
    }

    return {
      name: h.name || h.headerName || h.key || '',
      type: h.type || h.dataType || 'string',
      required: h.required === true || h.required === 'true' || h.required === '是',
      description: h.description || h.desc || ''
    };
  }).filter(h => h.name);
}

/**
 * 统一请求体格式
 * @param {Object} body - 原始请求体
 * @returns {Object} 统一格式的请求体
 */
function normalizeRequestBody(body) {
  if (!body || typeof body !== 'object') {
    return {};
  }

  return {
    description: body.description || body.desc || '',
    schema: body.schema || body.type || '',
    example: body.example || body.sample || ''
  };
}

/**
 * 统一响应状态格式
 * @param {Array} statuses - 原始状态数组
 * @returns {Array} 统一格式的状态数组
 */
function normalizeResponseStatuses(statuses) {
  if (!Array.isArray(statuses) || statuses.length === 0) {
    return [];
  }

  return statuses.map(s => {
    if (typeof s === 'string') {
      return { code: s, description: '' };
    }

    return {
      code: s.code || s.statusCode || s.status || '',
      description: s.description || s.desc || s.message || ''
    };
  }).filter(s => s.code);
}

/**
 * 统一错误格式
 * @param {Array} errors - 原始错误数组
 * @returns {Array} 统一格式的错误数组
 */
function normalizeErrors(errors) {
  if (!Array.isArray(errors) || errors.length === 0) {
    return [];
  }

  return errors.map(e => {
    if (typeof e === 'string') {
      return { code: '', description: e, solution: '' };
    }

    return {
      code: e.code || e.errorCode || '',
      description: e.description || e.desc || e.message || '',
      solution: e.solution || e.resolution || ''
    };
  });
}

/**
 * 统一注意事项格式
 * @param {Array} notes - 原始注意事项数组
 * @returns {Array} 统一格式的注意事项数组
 */
function normalizeNotes(notes) {
  if (!Array.isArray(notes) || notes.length === 0) {
    return [];
  }

  return notes.map(n => {
    if (typeof n === 'string') {
      return { type: 'info', content: n };
    }

    return {
      type: n.type || n.level || 'info',
      content: n.content || n.text || n.message || ''
    };
  }).filter(n => n.content);
}

/**
 * 统一相关链接格式
 * @param {Array} links - 原始链接数组
 * @returns {Array} 统一格式的链接数组
 */
function normalizeRelatedLinks(links) {
  if (!Array.isArray(links) || links.length === 0) {
    return [];
  }

  return links.map(l => {
    if (typeof l === 'string') {
      return { title: l, url: l };
    }

    return {
      title: l.title || l.name || l.text || '',
      url: l.url || l.href || l.link || ''
    };
  }).filter(l => l.url);
}

/**
 * 统一更新日志格式
 * @param {Array} changelog - 原始更新日志数组
 * @returns {Array} 统一格式的更新日志数组
 */
function normalizeChangelog(changelog) {
  if (!Array.isArray(changelog) || changelog.length === 0) {
    return [];
  }

  return changelog.map(c => {
    if (typeof c === 'string') {
      return { version: '', date: '', changes: c };
    }

    return {
      version: c.version || c.ver || '',
      date: c.date || c.updatedAt || '',
      changes: c.changes || c.description || c.desc || ''
    };
  });
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
    'parameters', 'inputParams', 'requestParams', 'params',
    'responseFields', 'responseAttributes', 'outputParams', 'responses', 'returns', 'attributes',
    'codeExamples', 'examples', 'curlExample', 'jsonExample', 'signature',
    'requestHeaders', 'headers',
    'requestBody', 'body',
    'responseStatuses', 'statusCodes',
    'requestExamples', 'requestExample',
    'responseExamples', 'responseExample',
    'authentication', 'auth', 'authMethod',
    'rateLimit', 'rateLimits', 'rate',
    'errors', 'errorCodes',
    'notes', 'warnings', 'importantNotes',
    'relatedLinks', 'related', 'links', 'seeAlso',
    'changelog', 'versionHistory', 'versions',
    'markdownContent', 'rawContent', 'mainContent',
    'sections', 'tables', 'headings', 'paragraphs', 'lists',
    'apiName', 'pageType', 'isClassPage', 'apiMembers', 'skipDefaultMarkdownOutput'
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
  const endpointFromList = Array.isArray(rawData.endpoints) && rawData.endpoints.length > 0
    ? (rawData.endpoints[0].url || rawData.endpoints[0])
    : '';
  const parameters = findValue(rawData, FIELD_MAPPINGS.parameters) || [];
  const responseFields = findValue(rawData, FIELD_MAPPINGS.responseFields) || [];
  const codeExamples = findValue(rawData, FIELD_MAPPINGS.codeExamples) || [];
  const rawContent = findValue(rawData, FIELD_MAPPINGS.rawContent) || '';
  const markdownContent = findValue(rawData, FIELD_MAPPINGS.markdownContent) || '';

  // 提取新增字段
  const requestHeaders = findValue(rawData, FIELD_MAPPINGS.requestHeaders) || [];
  const requestBody = findValue(rawData, FIELD_MAPPINGS.requestBody) || {};
  const responseStatuses = findValue(rawData, FIELD_MAPPINGS.responseStatuses) || [];
  const requestExamples = findValue(rawData, FIELD_MAPPINGS.requestExamples) || [];
  const responseExamples = findValue(rawData, FIELD_MAPPINGS.responseExamples) || [];
  const authentication = findValue(rawData, FIELD_MAPPINGS.authentication) || '';
  const rateLimit = findValue(rawData, FIELD_MAPPINGS.rateLimit) || '';
  const errors = findValue(rawData, FIELD_MAPPINGS.errors) || [];
  const notes = findValue(rawData, FIELD_MAPPINGS.notes) || [];
  const relatedLinks = findValue(rawData, FIELD_MAPPINGS.relatedLinks) || [];
  const changelog = findValue(rawData, FIELD_MAPPINGS.changelog) || [];

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
      endpoint: endpoint || endpointFromList,
      baseUrl: rawData.baseUrl || ''
    },

    // 请求
    requestHeaders: normalizeRequestHeaders(requestHeaders),
    parameters: normalizeParameters(parameters),
    requestBody: normalizeRequestBody(requestBody),

    // 响应
    responseStatuses: normalizeResponseStatuses(responseStatuses),
    responseFields: normalizeResponseFields(responseFields),

    // 示例
    requestExamples: normalizeCodeExamples(requestExamples, {}),
    responseExamples: normalizeCodeExamples(responseExamples, {}),
    codeExamples: normalizeCodeExamples(codeExamples, rawData),

    // 其他信息
    authentication: authentication,
    rateLimit: rateLimit,
    errors: normalizeErrors(errors),

    // 附加
    notes: normalizeNotes(notes),
    relatedLinks: normalizeRelatedLinks(relatedLinks),
    changelog: normalizeChangelog(changelog),

    // 内容
    markdownContent: markdownContent || generateMarkdownFromRaw(rawContent, rawData),
    rawContent: rawContent,

    // 扩展字段
    _extra: extractExtraFields(rawData)
  };

  // 处理 responses 字段（如果有）
  if (rawData.responses && Array.isArray(rawData.responses)) {
    result.responseStatuses = normalizeResponseStatuses(rawData.responses.map(r => ({
      code: r.code || r.statusCode || r.status || '',
      description: r.description || ''
    })));
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
  const endpointFromList = Array.isArray(data.endpoints) && data.endpoints.length > 0
    ? (data.endpoints[0].url || data.endpoints[0])
    : '';

  if (method || endpoint || endpointFromList) {
    lines.push('## API 端点', '');
    if (method) lines.push(`**Method:** \`${method.toUpperCase()}\``);
    if (endpoint || endpointFromList) lines.push(`**Endpoint:** \`${endpoint || endpointFromList}\``);
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