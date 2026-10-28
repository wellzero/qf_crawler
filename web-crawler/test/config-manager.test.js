import ConfigManager from '../src/config-manager.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fc from 'fast-check';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('ConfigManager', () => {
  let configManager;
  const testConfigDir = path.join(__dirname, 'test-configs');

  beforeAll(() => {
    // 创建测试配置目录
    if (!fs.existsSync(testConfigDir)) {
      fs.mkdirSync(testConfigDir, { recursive: true });
    }
  });

  beforeEach(() => {
    configManager = new ConfigManager();
  });

  afterAll(() => {
    // 清理测试配置目录
    if (fs.existsSync(testConfigDir)) {
      fs.rmSync(testConfigDir, { recursive: true, force: true });
    }
  });

  describe('loadConfig', () => {
    test('应该成功加载有效的配置文件', () => {
      const validConfig = {
        name: 'test-crawler',
        seedUrls: ['https://example.com'],
        urlRules: {
          include: ['.*'],
          exclude: []
        },
        crawler: {
          headless: true,
          timeout: 30000,
          waitBetweenRequests: 500,
          maxRetries: 3
        },
        output: {
          directory: './output',
          format: 'markdown'
        }
      };

      const configPath = path.join(testConfigDir, 'valid-config.json');
      fs.writeFileSync(configPath, JSON.stringify(validConfig, null, 2));

      const loadedConfig = configManager.loadConfig(configPath);
      expect(loadedConfig).toEqual(validConfig);
    });

    test('当配置文件不存在时应该抛出错误', () => {
      const nonExistentPath = path.join(testConfigDir, 'non-existent.json');
      
      expect(() => {
        configManager.loadConfig(nonExistentPath);
      }).toThrow('配置文件不存在');
    });

    test('当配置文件JSON格式错误时应该抛出错误', () => {
      const invalidJsonPath = path.join(testConfigDir, 'invalid-json.json');
      fs.writeFileSync(invalidJsonPath, '{ invalid json }');

      expect(() => {
        configManager.loadConfig(invalidJsonPath);
      }).toThrow('配置文件JSON格式错误');
    });

    test('当配置文件缺少必需字段时应该抛出错误', () => {
      const incompleteConfig = {
        name: 'test-crawler',
        seedUrls: ['https://example.com']
        // 缺少其他必需字段
      };

      const configPath = path.join(testConfigDir, 'incomplete-config.json');
      fs.writeFileSync(configPath, JSON.stringify(incompleteConfig));

      expect(() => {
        configManager.loadConfig(configPath);
      }).toThrow('配置缺少必需字段');
    });
  });

  describe('validateConfig', () => {
    test('应该验证有效的配置对象', () => {
      const validConfig = {
        name: 'test-crawler',
        seedUrls: ['https://example.com'],
        urlRules: {
          include: ['.*'],
          exclude: []
        },
        crawler: {
          headless: true,
          timeout: 30000,
          waitBetweenRequests: 500,
          maxRetries: 3
        },
        output: {
          directory: './output',
          format: 'markdown'
        }
      };

      expect(configManager.validateConfig(validConfig)).toBe(true);
    });

    test('当缺少name字段时应该抛出错误', () => {
      const config = {
        seedUrls: ['https://example.com'],
        urlRules: { include: [], exclude: [] },
        crawler: { headless: true, timeout: 30000, waitBetweenRequests: 500, maxRetries: 3 },
        output: { directory: './output', format: 'markdown' }
      };

      expect(() => {
        configManager.validateConfig(config);
      }).toThrow('配置缺少必需字段: name');
    });

    test('当seedUrls不是数组时应该抛出错误', () => {
      const config = {
        name: 'test',
        seedUrls: 'not-an-array',
        urlRules: { include: [], exclude: [] },
        crawler: { headless: true, timeout: 30000, waitBetweenRequests: 500, maxRetries: 3 },
        output: { directory: './output', format: 'markdown' }
      };

      expect(() => {
        configManager.validateConfig(config);
      }).toThrow('配置字段 seedUrls 必须是数组类型');
    });

    test('当seedUrls为空数组时应该抛出错误', () => {
      const config = {
        name: 'test',
        seedUrls: [],
        urlRules: { include: [], exclude: [] },
        crawler: { headless: true, timeout: 30000, waitBetweenRequests: 500, maxRetries: 3 },
        output: { directory: './output', format: 'markdown' }
      };

      expect(() => {
        configManager.validateConfig(config);
      }).toThrow('配置字段 seedUrls 不能为空数组');
    });

    test('当urlRules缺少include字段时应该抛出错误', () => {
      const config = {
        name: 'test',
        seedUrls: ['https://example.com'],
        urlRules: { exclude: [] },
        crawler: { headless: true, timeout: 30000, waitBetweenRequests: 500, maxRetries: 3 },
        output: { directory: './output', format: 'markdown' }
      };

      expect(() => {
        configManager.validateConfig(config);
      }).toThrow('配置字段 urlRules.include 必须存在且为数组类型');
    });

    test('当crawler缺少必需字段时应该抛出错误', () => {
      const config = {
        name: 'test',
        seedUrls: ['https://example.com'],
        urlRules: { include: [], exclude: [] },
        crawler: { headless: true }, // 缺少其他字段
        output: { directory: './output', format: 'markdown' }
      };

      expect(() => {
        configManager.validateConfig(config);
      }).toThrow('配置字段 crawler.timeout 必须存在');
    });

    test('当output缺少directory字段时应该抛出错误', () => {
      const config = {
        name: 'test',
        seedUrls: ['https://example.com'],
        urlRules: { include: [], exclude: [] },
        crawler: { headless: true, timeout: 30000, waitBetweenRequests: 500, maxRetries: 3 },
        output: { format: 'markdown' }
      };

      expect(() => {
        configManager.validateConfig(config);
      }).toThrow('配置字段 output.directory 必须存在');
    });

    test('当output.storage.type非法时应该抛出错误', () => {
      const config = {
        name: 'test',
        seedUrls: ['https://example.com'],
        urlRules: { include: [], exclude: [] },
        crawler: { headless: true, timeout: 30000, waitBetweenRequests: 500, maxRetries: 3 },
        output: {
          directory: './output',
          format: 'markdown',
          storage: { type: 'invalid-type' }
        }
      };

      expect(() => {
        configManager.validateConfig(config);
      }).toThrow('配置字段 output.storage.type 必须是 file 或 lancedb');
    });


    test('当llmExtraction.enabled不是布尔值时应该抛出错误', () => {
      const config = {
        name: 'test',
        seedUrls: ['https://example.com'],
        urlRules: { include: [], exclude: [] },
        crawler: { headless: true, timeout: 30000, waitBetweenRequests: 500, maxRetries: 3 },
        output: { directory: './output', format: 'markdown' },
        llmExtraction: { enabled: 'yes' }
      };

      expect(() => {
        configManager.validateConfig(config);
      }).toThrow('配置字段 llmExtraction.enabled 必须是布尔类型');
    });

    test('当llmExtraction.maxRecords不是正整数时应该抛出错误', () => {
      const config = {
        name: 'test',
        seedUrls: ['https://example.com'],
        urlRules: { include: [], exclude: [] },
        crawler: { headless: true, timeout: 30000, waitBetweenRequests: 500, maxRetries: 3 },
        output: { directory: './output', format: 'markdown' },
        llmExtraction: { enabled: true, maxRecords: 0 }
      };

      expect(() => {
        configManager.validateConfig(config);
      }).toThrow('配置字段 llmExtraction.maxRecords 必须是正整数');
    });

    test('当llmExtraction配置有效时应该通过校验', () => {
      const config = {
        name: 'test',
        seedUrls: ['https://example.com'],
        urlRules: { include: [], exclude: [] },
        crawler: { headless: true, timeout: 30000, waitBetweenRequests: 500, maxRetries: 3 },
        output: { directory: './output', format: 'markdown' },
        llmExtraction: {
          enabled: true,
          endpoint: 'https://api.openai.com/v1/chat/completions',
          model: 'gpt-4o-mini',
          maxRecords: 100
        }
      };

      expect(configManager.validateConfig(config)).toBe(true);
    });


    test('当parser.urlPatternOverrides有效时应该通过校验', () => {
      const config = {
        name: 'test',
        seedUrls: ['https://example.com'],
        urlRules: { include: [], exclude: [] },
        crawler: { headless: true, timeout: 30000, waitBetweenRequests: 500, maxRetries: 3 },
        output: { directory: './output', format: 'markdown' },
        parser: {
          mode: 'auto',
          urlPatternOverrides: [
            { pattern: '.*/open/api/doc.*', parser: 'ApiDocParser' }
          ]
        }
      };

      expect(configManager.validateConfig(config)).toBe(true);
    });

    test('当parser.urlPatternOverrides.pattern无效正则时应该抛出错误', () => {
      const config = {
        name: 'test',
        seedUrls: ['https://example.com'],
        urlRules: { include: [], exclude: [] },
        crawler: { headless: true, timeout: 30000, waitBetweenRequests: 500, maxRetries: 3 },
        output: { directory: './output', format: 'markdown' },
        parser: {
          urlPatternOverrides: [
            { pattern: '*invalid-regex', parser: 'ApiDocParser' }
          ]
        }
      };

      expect(() => {
        configManager.validateConfig(config);
      }).toThrow('配置字段 parser.urlPatternOverrides[0].pattern 不是有效正则');
    });

    test('当parser.urlPatternOverrides.parser缺失时应该抛出错误', () => {
      const config = {
        name: 'test',
        seedUrls: ['https://example.com'],
        urlRules: { include: [], exclude: [] },
        crawler: { headless: true, timeout: 30000, waitBetweenRequests: 500, maxRetries: 3 },
        output: { directory: './output', format: 'markdown' },
        parser: {
          urlPatternOverrides: [
            { pattern: '.*/docs/.*' }
          ]
        }
      };

      expect(() => {
        configManager.validateConfig(config);
      }).toThrow('配置字段 parser.urlPatternOverrides[0].parser 必须是非空字符串');
    });


    test('当output.storage.type为lancedb时应该允许通过校验', () => {
      const config = {
        name: 'test',
        seedUrls: ['https://example.com'],
        urlRules: { include: [], exclude: [] },
        crawler: { headless: true, timeout: 30000, waitBetweenRequests: 500, maxRetries: 3 },
        output: {
          directory: './output',
          format: 'markdown',
          storage: {
            type: 'lancedb',
            lancedb: {
              uri: 'lancedb',
              table: 'pages'
            }
          }
        }
      };

      expect(configManager.validateConfig(config)).toBe(true);
    });
  });

  describe('Property-Based Tests', () => {
    /**
     * **Property 1: 配置文件解析完整性**
     * **Validates: Requirements 1.1**
     * 
     * For any valid configuration file, parsing the configuration should return 
     * a Config object that contains all required fields (name, seedUrls, urlRules, 
     * crawler, output)
     */
    test('Property 1: 配置文件解析完整性 - 任何有效配置都应包含所有必需字段', () => {
      // 定义配置生成器
      const validConfigArbitrary = fc.record({
        name: fc.string({ minLength: 1 }),
        seedUrls: fc.array(fc.webUrl(), { minLength: 1, maxLength: 5 }),
        urlRules: fc.record({
          include: fc.array(fc.string(), { maxLength: 3 }),
          exclude: fc.array(fc.string(), { maxLength: 3 })
        }),
        login: fc.record({
          required: fc.boolean(),
          username: fc.string(),
          password: fc.string(),
          loginUrl: fc.oneof(fc.constant(''), fc.webUrl())
        }),
        crawler: fc.record({
          headless: fc.boolean(),
          timeout: fc.integer({ min: 1000, max: 60000 }),
          waitBetweenRequests: fc.integer({ min: 0, max: 5000 }),
          maxRetries: fc.integer({ min: 0, max: 10 })
        }),
        output: fc.record({
          directory: fc.constantFrom('./output', './data', './results'),
          format: fc.constantFrom('markdown', 'json', 'html')
        })
      });

      fc.assert(
        fc.property(validConfigArbitrary, (config) => {
          // 将配置写入临时文件
          const tempConfigPath = path.join(testConfigDir, `temp-${Date.now()}-${Math.random()}.json`);
          fs.writeFileSync(tempConfigPath, JSON.stringify(config, null, 2));

          try {
            // 加载配置
            const loadedConfig = configManager.loadConfig(tempConfigPath);

            // 验证所有必需字段都存在
            expect(loadedConfig).toHaveProperty('name');
            expect(loadedConfig).toHaveProperty('seedUrls');
            expect(loadedConfig).toHaveProperty('urlRules');
            expect(loadedConfig).toHaveProperty('crawler');
            expect(loadedConfig).toHaveProperty('output');

            // 验证字段类型正确
            expect(typeof loadedConfig.name).toBe('string');
            expect(Array.isArray(loadedConfig.seedUrls)).toBe(true);
            expect(typeof loadedConfig.urlRules).toBe('object');
            expect(typeof loadedConfig.crawler).toBe('object');
            expect(typeof loadedConfig.output).toBe('object');

            // 验证嵌套字段
            expect(loadedConfig.urlRules).toHaveProperty('include');
            expect(loadedConfig.urlRules).toHaveProperty('exclude');
            expect(Array.isArray(loadedConfig.urlRules.include)).toBe(true);
            expect(Array.isArray(loadedConfig.urlRules.exclude)).toBe(true);

            expect(loadedConfig.crawler).toHaveProperty('headless');
            expect(loadedConfig.crawler).toHaveProperty('timeout');
            expect(loadedConfig.crawler).toHaveProperty('waitBetweenRequests');
            expect(loadedConfig.crawler).toHaveProperty('maxRetries');

            expect(loadedConfig.output).toHaveProperty('directory');
            expect(loadedConfig.output).toHaveProperty('format');

            // 验证加载的配置与原始配置相等
            expect(loadedConfig).toEqual(config);
          } finally {
            // 清理临时文件
            if (fs.existsSync(tempConfigPath)) {
              fs.unlinkSync(tempConfigPath);
            }
          }
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Property 4: 无效配置错误处理**
     * **Validates: Requirements 1.5**
     * 
     * For any configuration file with missing required fields or invalid format, 
     * the Config Manager should return a descriptive error message indicating 
     * which field is invalid
     */
    test('Property 4: 无效配置错误处理 - 缺少必需字段应返回描述性错误', () => {
      // 定义一个基础有效配置
      const baseValidConfig = {
        name: 'test-crawler',
        seedUrls: ['https://example.com'],
        urlRules: {
          include: ['.*'],
          exclude: []
        },
        crawler: {
          headless: true,
          timeout: 30000,
          waitBetweenRequests: 500,
          maxRetries: 3
        },
        output: {
          directory: './output',
          format: 'markdown'
        }
      };

      // 定义所有必需字段的路径
      const requiredFieldPaths = [
        { path: 'name', errorPattern: /name/ },
        { path: 'seedUrls', errorPattern: /seedUrls/ },
        { path: 'urlRules', errorPattern: /urlRules/ },
        { path: 'urlRules.include', errorPattern: /urlRules\.include/ },
        { path: 'urlRules.exclude', errorPattern: /urlRules\.exclude/ },
        { path: 'crawler', errorPattern: /crawler/ },
        { path: 'crawler.headless', errorPattern: /crawler\.headless/ },
        { path: 'crawler.timeout', errorPattern: /crawler\.timeout/ },
        { path: 'crawler.waitBetweenRequests', errorPattern: /crawler\.waitBetweenRequests/ },
        { path: 'crawler.maxRetries', errorPattern: /crawler\.maxRetries/ },
        { path: 'output', errorPattern: /output/ },
        { path: 'output.directory', errorPattern: /output\.directory/ },
        { path: 'output.format', errorPattern: /output\.format/ }
      ];

      // 为每个必需字段生成缺少该字段的配置
      const invalidConfigArbitrary = fc.constantFrom(...requiredFieldPaths).map(fieldInfo => {
        const config = JSON.parse(JSON.stringify(baseValidConfig)); // 深拷贝
        
        // 删除指定字段
        const pathParts = fieldInfo.path.split('.');
        if (pathParts.length === 1) {
          delete config[pathParts[0]];
        } else if (pathParts.length === 2) {
          if (config[pathParts[0]]) {
            delete config[pathParts[0]][pathParts[1]];
          }
        }
        
        return { config, fieldInfo };
      });

      fc.assert(
        fc.property(invalidConfigArbitrary, ({ config, fieldInfo }) => {
          // 将无效配置写入临时文件
          const tempConfigPath = path.join(testConfigDir, `invalid-${Date.now()}-${Math.random()}.json`);
          fs.writeFileSync(tempConfigPath, JSON.stringify(config, null, 2));

          try {
            // 尝试加载配置，应该抛出错误
            expect(() => {
              configManager.loadConfig(tempConfigPath);
            }).toThrow(fieldInfo.errorPattern);
          } finally {
            // 清理临时文件
            if (fs.existsSync(tempConfigPath)) {
              fs.unlinkSync(tempConfigPath);
            }
          }
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Property 4: 无效配置错误处理 - 类型错误**
     * **Validates: Requirements 1.5**
     * 
     * For any configuration with invalid field types, the Config Manager should 
     * return a descriptive error message indicating the type mismatch
     */
    test('Property 4: 无效配置错误处理 - 字段类型错误应返回描述性错误', () => {
      // 定义类型错误的配置生成器
      const invalidTypeConfigArbitrary = fc.oneof(
        // seedUrls 不是数组
        fc.constant({
          config: {
            name: 'test',
            seedUrls: 'not-an-array',
            urlRules: { include: [], exclude: [] },
            crawler: { headless: true, timeout: 30000, waitBetweenRequests: 500, maxRetries: 3 },
            output: { directory: './output', format: 'markdown' }
          },
          errorPattern: /seedUrls.*数组/
        }),
        // urlRules 不是对象
        fc.constant({
          config: {
            name: 'test',
            seedUrls: ['https://example.com'],
            urlRules: 'not-an-object',
            crawler: { headless: true, timeout: 30000, waitBetweenRequests: 500, maxRetries: 3 },
            output: { directory: './output', format: 'markdown' }
          },
          errorPattern: /urlRules.*对象/
        }),
        // urlRules.include 不是数组
        fc.constant({
          config: {
            name: 'test',
            seedUrls: ['https://example.com'],
            urlRules: { include: 'not-an-array', exclude: [] },
            crawler: { headless: true, timeout: 30000, waitBetweenRequests: 500, maxRetries: 3 },
            output: { directory: './output', format: 'markdown' }
          },
          errorPattern: /urlRules\.include.*数组/
        }),
        // crawler 不是对象
        fc.constant({
          config: {
            name: 'test',
            seedUrls: ['https://example.com'],
            urlRules: { include: [], exclude: [] },
            crawler: 'not-an-object',
            output: { directory: './output', format: 'markdown' }
          },
          errorPattern: /crawler.*对象/
        }),
        // output 不是对象
        fc.constant({
          config: {
            name: 'test',
            seedUrls: ['https://example.com'],
            urlRules: { include: [], exclude: [] },
            crawler: { headless: true, timeout: 30000, waitBetweenRequests: 500, maxRetries: 3 },
            output: 'not-an-object'
          },
          errorPattern: /output.*对象/
        }),
        // name 不是字符串
        fc.constant({
          config: {
            name: 123,
            seedUrls: ['https://example.com'],
            urlRules: { include: [], exclude: [] },
            crawler: { headless: true, timeout: 30000, waitBetweenRequests: 500, maxRetries: 3 },
            output: { directory: './output', format: 'markdown' }
          },
          errorPattern: /name.*字符串/
        }),
        // seedUrls 是空数组
        fc.constant({
          config: {
            name: 'test',
            seedUrls: [],
            urlRules: { include: [], exclude: [] },
            crawler: { headless: true, timeout: 30000, waitBetweenRequests: 500, maxRetries: 3 },
            output: { directory: './output', format: 'markdown' }
          },
          errorPattern: /seedUrls.*空数组/
        })
      );

      fc.assert(
        fc.property(invalidTypeConfigArbitrary, ({ config, errorPattern }) => {
          // 将无效配置写入临时文件
          const tempConfigPath = path.join(testConfigDir, `type-error-${Date.now()}-${Math.random()}.json`);
          fs.writeFileSync(tempConfigPath, JSON.stringify(config, null, 2));

          try {
            // 尝试加载配置，应该抛出错误
            expect(() => {
              configManager.loadConfig(tempConfigPath);
            }).toThrow(errorPattern);
          } finally {
            // 清理临时文件
            if (fs.existsSync(tempConfigPath)) {
              fs.unlinkSync(tempConfigPath);
            }
          }
        }),
        { numRuns: 50 }
      );
    });

    /**
     * **Property 4: 无效配置错误处理 - JSON格式错误**
     * **Validates: Requirements 1.5**
     * 
     * For any file with invalid JSON format, the Config Manager should return 
     * a descriptive error message indicating JSON parsing failure
     */
    test('Property 4: 无效配置错误处理 - JSON格式错误应返回描述性错误', () => {
      // 生成各种无效的JSON字符串
      const invalidJsonArbitrary = fc.oneof(
        fc.constant('{ invalid json }'),
        fc.constant('{ "name": "test", }'), // 尾随逗号
        fc.constant('{ "name": "test"'), // 缺少闭合括号
        fc.constant('"name": "test" }'), // 缺少开放括号
        fc.constant('{ name: "test" }'), // 键没有引号
        fc.constant("{ 'name': 'test' }"), // 单引号
        fc.constant('undefined'),
        fc.constant('null'),
        fc.constant('')
      );

      fc.assert(
        fc.property(invalidJsonArbitrary, (invalidJson) => {
          // 将无效JSON写入临时文件
          const tempConfigPath = path.join(testConfigDir, `json-error-${Date.now()}-${Math.random()}.json`);
          fs.writeFileSync(tempConfigPath, invalidJson);

          try {
            // 尝试加载配置，应该抛出错误
            expect(() => {
              configManager.loadConfig(tempConfigPath);
            }).toThrow(/JSON格式错误|配置缺少必需字段|配置必须是有效的对象类型/);
          } finally {
            // 清理临时文件
            if (fs.existsSync(tempConfigPath)) {
              fs.unlinkSync(tempConfigPath);
            }
          }
        }),
        { numRuns: 50 }
      );
    });
  });
});
