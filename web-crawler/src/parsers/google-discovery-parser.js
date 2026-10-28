import BaseParser from './base-parser.js';

/**
 * Google Discovery Parser - 解析 Google Discovery REST 文档（JSON）
 */
class GoogleDiscoveryParser extends BaseParser {
  matches(url) {
    return /^https?:\/\/financialservices\.googleapis\.com\/\$discovery\/rest\?version=v1/.test(url);
  }

  getPriority() {
    return 120;
  }

  async parse(page, url) {
    try {
      await this.expandInteractiveBlocks(page);

      const jsonText = await this.extractDiscoveryJsonText(page);
      const discovery = JSON.parse(jsonText);
      const methods = this.extractMethods(discovery);

      const resourcesCount = this.countNestedNodes(discovery.resources || {});
      const schemasCount = Object.keys(discovery.schemas || {}).length;
      const parametersCount = Object.keys(discovery.parameters || {}).length;

      return {
        type: 'google-discovery-doc',
        url,
        title: `${discovery.title || 'Google API'} Discovery (${discovery.version || 'unknown'})`,
        description: discovery.description || '',
        serviceName: discovery.name || '',
        canonicalName: discovery.canonicalName || '',
        version: discovery.version || '',
        ownerDomain: discovery.ownerDomain || '',
        ownerName: discovery.ownerName || '',
        rootUrl: discovery.rootUrl || '',
        servicePath: discovery.servicePath || '',
        baseUrl: discovery.baseUrl || '',
        basePath: discovery.basePath || '',
        mtlsRootUrl: discovery.mtlsRootUrl || '',
        batchPath: discovery.batchPath || '',
        revision: discovery.revision || '',
        discoveryVersion: discovery.discoveryVersion || '',
        protocol: discovery.protocol || '',
        documentationLink: discovery.documentationLink || '',
        resourcesCount,
        schemasCount,
        parametersCount,
        topLevelMethodCount: Object.keys(discovery.methods || {}).length,
        endpointCount: methods.length,
        authScopes: this.extractAuthScopes(discovery),
        features: {
          labels: discovery.labels || [],
          supportsMediaUpload: !!discovery.supportsMediaUpload,
          supportsSubscription: !!discovery.supportsSubscription,
          fullyEncodeReservedExpansion: !!discovery.fullyEncodeReservedExpansion,
          hasIcons: !!discovery.icons,
          hasEtag: !!discovery.etag,
          hasResources: !!discovery.resources,
          hasSchemas: !!discovery.schemas
        },
        entryPoints: {
          discoveryUrl: url,
          rootUrl: discovery.rootUrl || '',
          servicePath: discovery.servicePath || '',
          batchPath: discovery.batchPath || ''
        },
        urlRuleInterfaces: methods,
        // 保留完整 Discovery JSON，避免后续生成 Markdown 时出现文档内容缺失
        rawContent: jsonText
      };
    } catch (error) {
      console.error('Failed to parse Google Discovery doc:', error.message);
      return {
        type: 'google-discovery-doc',
        url,
        title: 'Google Discovery Document',
        description: '解析失败',
        entryPoints: {},
        urlRuleInterfaces: [],
        rawContent: ''
      };
    }
  }

  async expandInteractiveBlocks(page) {
    try {
      await page.evaluate(() => {
        document.querySelectorAll('details:not([open])').forEach((el) => el.setAttribute('open', ''));

        const collapsibles = Array.from(document.querySelectorAll('[aria-expanded="false"]'));
        collapsibles.forEach((el) => {
          if (typeof el.click === 'function') {
            try {
              el.click();
            } catch {
              // ignore single element error and continue
            }
          }
        });
      });
    } catch {
      // 页面不支持 evaluate 时忽略（例如某些错误页）
    }
  }

  async extractDiscoveryJsonText(page) {
    const rawText = await page.evaluate(() => {
      const pre = document.querySelector('pre');
      const script = document.querySelector('script[type="application/json"]');
      return pre?.innerText || pre?.textContent || script?.textContent || document.body?.innerText || '';
    });

    const trimmed = (rawText || '').trim();
    if (!trimmed) {
      throw new Error('Discovery document content is empty');
    }

    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      const candidate = trimmed.slice(firstBrace, lastBrace + 1);
      JSON.parse(candidate);
      return candidate;
    }

    JSON.parse(trimmed);
    return trimmed;
  }

  extractAuthScopes(discovery) {
    const oauth2Scopes = discovery?.auth?.oauth2?.scopes || {};
    return Object.entries(oauth2Scopes).map(([name, info]) => ({
      name,
      description: info?.description || ''
    }));
  }

  countNestedNodes(resourceMap) {
    if (!resourceMap || typeof resourceMap !== 'object') {
      return 0;
    }

    let count = 0;
    const walk = (node) => {
      if (!node || typeof node !== 'object') {
        return;
      }
      count += 1;
      if (node.resources) {
        Object.values(node.resources).forEach((child) => walk(child));
      }
    };

    Object.values(resourceMap).forEach((resource) => walk(resource));
    return count;
  }

  extractMethods(discovery) {
    const methods = [];

    const joinUrl = (rootUrl, servicePath, path) => {
      const root = (rootUrl || '').replace(/\/+$/, '');
      const service = (servicePath || '').replace(/^\/+/, '').replace(/\/+$/, '');
      const methodPath = (path || '').replace(/^\/+/, '');
      const mergedPath = [service, methodPath].filter(Boolean).join('/');
      return mergedPath ? `${root}/${mergedPath}` : root;
    };

    const addMethods = (methodMap = {}, resourcePath = []) => {
      for (const [methodName, methodDef] of Object.entries(methodMap)) {
        const parameterNames = Object.keys(methodDef.parameters || {});
        methods.push({
          resource: resourcePath.join('.') || 'root',
          methodName,
          id: methodDef.id || '',
          httpMethod: methodDef.httpMethod || '',
          path: methodDef.path || '',
          flatPath: methodDef.flatPath || '',
          fullUrlTemplate: joinUrl(discovery.rootUrl, discovery.servicePath, methodDef.path),
          requestRef: methodDef.request?.$ref || '',
          responseRef: methodDef.response?.$ref || '',
          supportsMediaDownload: !!methodDef.supportsMediaDownload,
          supportsMediaUpload: !!methodDef.supportsMediaUpload,
          supportsSubscription: !!methodDef.supportsSubscription,
          parameterNames,
          parameterCount: parameterNames.length,
          description: methodDef.description || ''
        });
      }
    };

    const walkResource = (resource, resourcePath = []) => {
      addMethods(resource.methods || {}, resourcePath);

      if (resource.resources) {
        for (const [subResourceName, subResourceDef] of Object.entries(resource.resources)) {
          walkResource(subResourceDef, [...resourcePath, subResourceName]);
        }
      }
    };

    addMethods(discovery.methods || {}, []);

    if (discovery.resources) {
      for (const [resourceName, resourceDef] of Object.entries(discovery.resources)) {
        walkResource(resourceDef, [resourceName]);
      }
    }

    return methods;
  }
}

export default GoogleDiscoveryParser;
