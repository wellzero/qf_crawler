/**
 * MCP 文档统一格式转换器
 * 将各 MCP 解析器的不同输出格式统一为标准格式
 */

/**
 * 统一的 MCP 文档输出格式
 */
const UNIFIED_MCP_SCHEMA = {
  // 必需字段
  type: '',           // 文档类型
  url: '',            // 源 URL
  title: '',          // 标题
  description: '',    // 描述
  suggestedFilename: '',

  // MCP 核心信息
  mcp: {
    serverId: '',     // 服务器/工具 ID
    provider: '',     // 提供者
    category: '',     // 分类
    version: ''       // 版本
  },

  // 统计数据
  stats: {
    users: '',        // 开通用户数
    calls: '',        // 调用次数
    avgTime: '',      // 平均执行时间
    toolCount: ''     // 工具数量
  },

  // 工具列表
  tools: [],          // [{name, displayName, description, inputs, outputs}]

  // 标签
  tags: [],

  // 安装与配置
  installation: '',
  configuration: '',

  // 服务介绍
  serviceIntro: [],

  // 代码示例
  codeExamples: [],

  // 其他信息
  serverInfo: {},     // 服务器详细信息
  notes: [],          // 注意事项
  relatedLinks: [],   // 相关链接

  // 原始内容
  rawContent: '',
  markdownContent: '',

  // 扩展
  _extra: {}
};

/**
 * 字段映射规则
 */
const MCP_FIELD_MAPPINGS = {
  serverId: ['toolId', 'serverId', 'serverPath', 'id'],
  provider: ['provider', 'sourceName', 'author'],
  category: ['category', 'classification', 'bizType'],
  users: ['users', 'activateUserCount', 'userCount'],
  calls: ['calls', 'callTotalCount', 'totalCalls'],
  avgTime: ['avgTime', 'averageTime', 'executionTime'],
  toolCount: ['toolCount', 'toolCount', 'totalTools'],
  tools: ['tools', 'toolList', 'functions'],
  tags: ['tags', 'categories'],
  installation: ['installation', 'installGuide'],
  configuration: ['configuration', 'configGuide'],
  serviceIntro: ['serviceIntro', 'introduction', 'serviceIntroduction'],
  codeExamples: ['codeExamples', 'codeBlocks', 'examples'],
  rawContent: ['rawContent', 'bodyText', 'content'],
  serverInfo: ['serverInfo', 'metadata']
};

/**
 * 从对象中按字段名数组依次查找值
 */
function findValue(obj, fieldNames) {
  for (const name of fieldNames) {
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
 * 统一工具格式
 */
function normalizeTools(tools) {
  if (!Array.isArray(tools) || tools.length === 0) {
    return [];
  }

  return tools.map(tool => {
    if (typeof tool === 'string') {
      return { name: tool, displayName: '', description: '', inputs: [], outputs: [] };
    }

    return {
      name: tool.name || tool.toolName || tool.functionName || '',
      displayName: tool.displayName || tool.title || tool.chineseName || '',
      description: tool.description || tool.desc || '',
      inputs: normalizeInputs(tool.inputs || tool.parameters || tool.inputParams || []),
      outputs: tool.outputs || tool.outputParams || []
    };
  }).filter(t => t.name);
}

/**
 * 从 metadata.apiEndpoints 中恢复工具列表（tokenflux-mcp 等场景）
 */
function normalizeToolsFromApiEndpoints(apiEndpoints) {
  if (!Array.isArray(apiEndpoints) || apiEndpoints.length === 0) {
    return [];
  }

  return apiEndpoints.map((endpoint) => {
    const method = endpoint.method ? ` [${endpoint.method}]` : '';
    const endpointUrl = endpoint.endpoint ? `\nEndpoint: ${endpoint.endpoint}` : '';
    const baseDescription = endpoint.description || '';

    return {
      name: endpoint.name || endpoint.fullName || '',
      displayName: endpoint.fullName || '',
      description: `${baseDescription}${method}${endpointUrl}`.trim(),
      inputs: normalizeInputs(endpoint.parameters || []),
      outputs: Array.isArray(endpoint.responseFields) ? endpoint.responseFields : []
    };
  }).filter(t => t.name);
}

/**
 * 统一输入参数格式
 */
function normalizeInputs(inputs) {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    return [];
  }

  return inputs.map(input => {
    if (typeof input === 'string') {
      return { name: input, type: '', required: false, description: '' };
    }

    return {
      name: input.name || input.paramName || '',
      type: input.type || input.dataType || 'string',
      required: input.required === true || input.required === 'true' || input.required === '是',
      description: input.description || input.desc || '',
      default: input.default || input.defaultValue || ''
    };
  });
}

/**
 * 统一统计数据格式
 */
function normalizeStats(data) {
  const stats = {};

  // 从 stats 对象中提取
  if (data.stats && typeof data.stats === 'object') {
    stats.users = data.stats.users || data.stats.userCount || '';
    stats.calls = data.stats.calls || data.stats.callCount || '';
    stats.avgTime = data.stats.avgTime || data.stats.averageTime || '';
    stats.toolCount = data.stats.toolCount || data.stats.toolNum || '';
  }

  // 从顶层字段提取
  if (!stats.users) {
    const users = findValue(data, MCP_FIELD_MAPPINGS.users);
    if (users) stats.users = String(users);
  }
  if (!stats.calls) {
    const calls = findValue(data, MCP_FIELD_MAPPINGS.calls);
    if (calls) stats.calls = String(calls);
  }
  if (!stats.avgTime) {
    const avgTime = findValue(data, MCP_FIELD_MAPPINGS.avgTime);
    if (avgTime) stats.avgTime = String(avgTime);
  }
  if (!stats.toolCount) {
    const toolCount = findValue(data, MCP_FIELD_MAPPINGS.toolCount);
    if (toolCount) stats.toolCount = String(toolCount);
  }

  return stats;
}

/**
 * 统一代码示例格式
 */
function normalizeCodeExamples(examples) {
  if (!Array.isArray(examples) || examples.length === 0) {
    return [];
  }

  return examples.map(ex => {
    if (typeof ex === 'string') {
      return { language: detectLanguage(ex), code: ex };
    }

    return {
      language: ex.language || ex.lang || detectLanguage(ex.code || ''),
      code: ex.code || ex.content || ''
    };
  }).filter(ex => ex.code && ex.code.length > 5);
}

/**
 * 检测代码语言
 */
function detectLanguage(code) {
  if (!code) return 'text';
  if (code.includes('npm ') || code.includes('npx ') || code.includes('yarn ')) return 'bash';
  if (code.includes('pip ') || code.includes('python ')) return 'bash';
  if (code.trim().startsWith('{') || code.trim().startsWith('[')) return 'json';
  if (code.includes('def ') || code.includes('import ')) return 'python';
  if (code.includes('const ') || code.includes('function ') || code.includes('=>')) return 'javascript';
  return 'text';
}

/**
 * 提取扩展字段
 */
function extractExtraFields(data) {
  const standardFields = new Set([
    'type', 'url', 'title', 'description', 'suggestedFilename',
    'toolId', 'serverId', 'provider', 'category', 'version',
    'stats', 'users', 'calls', 'avgTime', 'toolCount',
    'tools', 'toolList', 'tags', 'categories',
    'installation', 'configuration', 'serviceIntro',
    'codeExamples', 'codeBlocks', 'examples',
    'serverInfo', 'notes', 'relatedLinks',
    'rawContent', 'bodyText', 'markdownContent',
    'detailLinks', 'totalTools', 'isServerDetail',
    'serverPath', 'links'
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
 * 将 MCP 解析器输出统一为标准格式
 */
export function formatMcpDoc(rawData) {
  if (!rawData || typeof rawData !== 'object') {
    return { ...UNIFIED_MCP_SCHEMA };
  }

  // 提取核心字段
  const serverId = findValue(rawData, MCP_FIELD_MAPPINGS.serverId) || '';
  const provider = findValue(rawData, MCP_FIELD_MAPPINGS.provider) || '';
  const category = findValue(rawData, MCP_FIELD_MAPPINGS.category) || '';
  const tools = findValue(rawData, MCP_FIELD_MAPPINGS.tools) || [];
  const tags = findValue(rawData, MCP_FIELD_MAPPINGS.tags) || [];
  const installation = findValue(rawData, MCP_FIELD_MAPPINGS.installation) || '';
  const configuration = findValue(rawData, MCP_FIELD_MAPPINGS.configuration) || '';
  const serviceIntro = findValue(rawData, MCP_FIELD_MAPPINGS.serviceIntro) || [];
  const codeExamples = findValue(rawData, MCP_FIELD_MAPPINGS.codeExamples) || [];
  const rawContent = findValue(rawData, MCP_FIELD_MAPPINGS.rawContent) || '';
  const serverInfo = findValue(rawData, MCP_FIELD_MAPPINGS.serverInfo) || {};
  const metadata = rawData.metadata && typeof rawData.metadata === 'object' ? rawData.metadata : {};

  // 兼容 tokenflux-mcp：优先使用原 tools，否则回退到 metadata.apiEndpoints
  let normalizedTools = normalizeTools(tools);
  if (normalizedTools.length === 0 && Array.isArray(metadata.apiEndpoints)) {
    normalizedTools = normalizeToolsFromApiEndpoints(metadata.apiEndpoints);
  }

  const mergedServerInfo = {
    ...(typeof serverInfo === 'object' ? serverInfo : {}),
    ...(metadata.securitySchemes ? { securitySchemes: metadata.securitySchemes } : {}),
    ...(metadata.version ? { version: metadata.version } : {}),
    ...(metadata.mcpId ? { mcpId: metadata.mcpId } : {})
  };

  // 构建统一格式对象
  const result = {
    // 必需字段
    type: rawData.type || '',
    url: rawData.url || '',
    title: rawData.title || '',
    description: rawData.description || '',
    suggestedFilename: rawData.suggestedFilename || '',

    // MCP 核心信息
    mcp: {
      serverId,
      provider: provider || metadata.provider || '',
      category,
      version: rawData.version || mergedServerInfo.version || ''
    },

    // 统计数据
    stats: normalizeStats(rawData),

    // 工具列表
    tools: normalizedTools,

    // 标签
    tags: Array.isArray(tags) ? tags : [],

    // 安装与配置
    installation,
    configuration,

    // 服务介绍
    serviceIntro: Array.isArray(serviceIntro) ? serviceIntro : [serviceIntro].filter(Boolean),

    // 代码示例
    codeExamples: normalizeCodeExamples(codeExamples),

    // 其他信息
    serverInfo: mergedServerInfo,
    notes: rawData.notes || [],
    relatedLinks: rawData.relatedLinks || rawData.links || [],

    // 原始内容
    rawContent,
    markdownContent: rawData.markdownContent || '',

    // 扩展字段
    _extra: extractExtraFields(rawData)
  };

  return result;
}

/**
 * 批量格式化
 */
export function formatMcpDocs(docs) {
  if (!Array.isArray(docs)) return [];
  return docs.map(formatMcpDoc);
}

export default {
  formatMcpDoc,
  formatMcpDocs,
  UNIFIED_MCP_SCHEMA
};
