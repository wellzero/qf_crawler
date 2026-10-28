/**
 * API 网络拦截器
 * 负责监听页面的网络请求，拦截包含数据的 JSON 响应
 */
class ApiInterceptor {
  constructor() {
    this.apiData = [];
  }

  /**
   * 预加载阶段注册拦截器
   */
  async beforeLoad(context) {
    const { page } = context;
    this.apiData = [];

    page.on('response', async (response) => {
      const responseUrl = response.url();
      const status = response.status();
      
      if ((responseUrl.includes('/api/') || responseUrl.includes('/data/') || responseUrl.includes('/query/')) && status === 200) {
        try {
          const contentType = response.headers()['content-type'] || '';
          
          if (contentType.includes('json')) {
            const data = await response.json();
            
            if (Array.isArray(data) && data.length > 0) {
              this.apiData.push({ url: responseUrl, data: data });
            } else if (data && typeof data === 'object') {
              for (const key of Object.keys(data)) {
                if (Array.isArray(data[key]) && data[key].length > 0) {
                  this.apiData.push({ url: responseUrl, data: data[key], field: key });
                }
              }
            }
          }
        } catch (e) {
          // ignore
        }
      }
    });
  }

  /**
   * 提取阶段返回收集到的数据
   */
  async extract(context) {
    const tables = [];
    const onDataChunk = context.options.onDataChunk;

    if (this.apiData.length > 0) {
      const apiTables = await this.convertAPIDataToTables(this.apiData, onDataChunk);
      tables.push(...apiTables);
    }

    return {
      apiDataCount: this.apiData.length,
      apiTables: tables
    };
  }

  async convertAPIDataToTables(apiDataList, onDataChunk) {
    const tables = [];
    
    for (const apiResponse of apiDataList) {
      try {
        const { url, data } = apiResponse;
        if (!Array.isArray(data) || data.length === 0) continue;
        
        const firstItem = data[0];
        const keys = Object.keys(firstItem);
        
        const flattenedData = data.map(item => {
          const flat = {};
          for (const key of keys) {
            const value = item[key];
            if (value && typeof value === 'object' && !Array.isArray(value)) {
              for (const subKey of Object.keys(value)) {
                const subValue = value[subKey];
                if (subValue && typeof subValue === 'object' && !Array.isArray(subValue)) {
                  for (const subSubKey of Object.keys(subValue)) {
                    flat[`${key}.${subKey}.${subSubKey}`] = subValue[subSubKey];
                  }
                } else {
                  flat[`${key}.${subKey}`] = subValue;
                }
              }
            } else {
              flat[key] = value;
            }
          }
          return flat;
        });
        
        const allKeys = new Set();
        flattenedData.forEach(item => Object.keys(item).forEach(key => allKeys.add(key)));
        const headers = Array.from(allKeys);
        
        const rows = flattenedData.map(item => {
          return headers.map(header => {
            const value = item[header];
            if (value === null || value === undefined) return '';
            if (typeof value === 'object') return JSON.stringify(value);
            return String(value);
          });
        });
        
        const table = {
          index: tables.length,
          headers,
          rows,
          caption: `API数据: ${url.split('/').pop()}`,
          source: 'api'
        };
        
        tables.push(table);
        
        if (onDataChunk) {
          await onDataChunk({
            type: 'table',
            tableIndex: tables.length - 1,
            page: 1,
            headers,
            rows,
            isFirstPage: true,
            isLastPage: true,
            source: 'api'
          });
        }
      } catch (error) {
        // ignore
      }
    }
    return tables;
  }
}

export default ApiInterceptor;
