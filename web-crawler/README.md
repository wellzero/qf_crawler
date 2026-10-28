# Stock Website Crawler

A configurable, modular web crawler designed for stock data websites (e.g., 东方财富, 雪球, 理杏仁). Built with Node.js and Playwright, it supports automatic login, link discovery, page parsing, and Markdown output generation.

## Features

- **Configurable Crawling**: Define crawling rules via JSON configuration files
- **Automatic Login**: Handles authentication for protected content
- **Link Discovery**: Automatically finds and follows links matching URL rules
- **Smart URL Prioritization**: Prioritizes URLs with numeric segments, clean URLs, and shorter URLs
- **Page Parsing**: Extracts tables, code blocks, and structured content
- **API Data Extraction**: Automatically intercepts and extracts data from API responses (for chart/graph data)
- **Pagination Support**: Automatically detects and crawls paginated tables
- **Tab & Dropdown Extraction**: Intelligently extracts content from tabs and dropdowns with deduplication
- **Date Filter Handling**: Automatically detects and processes date range filters with intelligent retry
- **Streaming Write**: Writes data as it's extracted to avoid memory issues
- **Markdown Output**: Saves parsed content in readable Markdown format
- **Error Handling**: Graceful error recovery with retry logic
- **Progress Tracking**: Real-time progress logging and statistics
- **Resumable**: Supports resuming from where it left off using links.txt

## Project Structure

```
stock-crawler/
├── src/                    # Source code modules
│   ├── index.js           # CLI entry point
│   ├── crawler-main.js    # Main controller
│   ├── config-manager.js  # Configuration management
│   ├── link-manager.js    # URL list management
│   ├── browser-manager.js # Browser automation
│   ├── login-handler.js   # Login detection and handling
│   ├── link-finder.js     # Link discovery
│   ├── page-parser.js     # Page content parsing
│   ├── markdown-generator.js # Markdown generation
│   ├── logger.js          # Logging utilities
│   ├── stats-tracker.js   # Statistics tracking
│   ├── application/       # Application orchestration services
│   ├── domain/            # Domain models and state machine
│   ├── infrastructure/    # Infrastructure adapters
│   └── url-utils.js       # URL utilities
├── config/                # Configuration files
│   ├── example.json       # Example configuration
│   └── lixinger.json      # Lixinger website configuration
├── output/                # Crawled content output (Markdown files)
├── test/                  # Unit and property-based tests
├── logs/                  # Log files
├── links.txt              # URL list (pending/crawled/failed)
├── package.json           # Project dependencies
└── README.md              # This file
```

## Installation

```bash
cd stock-crawler
npm install
```

## Documentation

- [并行开发10模块迭代计划](doc/PARALLEL_WORKSTREAMS_10_MODULES.md)
- [架构评估与升级路线图](doc/ARCHITECTURE_REVIEW_AND_ROADMAP.md)
- [API 文档全量抓取与本地存储优化指南](doc/API_DOC_CRAWL_OPTIMIZATION_GUIDE.md)

## Dependencies

- **playwright**: Browser automation for crawling dynamic websites
- **fast-check**: Property-based testing framework (dev)
- **jest**: Unit testing framework (dev)

## Usage

### Basic Usage

有两种方式运行爬虫：

**方式 1: 使用 npm（推荐）**
```bash
npm run crawl config/lixinger.json
```

**方式 2: 直接使用 node**
```bash
node src/index.js config/lixinger.json
```

**注意**: 如果使用 `npm start`，需要添加 `--` 来传递参数：
```bash
npm start -- config/lixinger.json
```

### 查看帮助

```bash
node src/index.js --help
```

### 启用调试模式

```bash
DEBUG=1 node src/index.js config/lixinger.json
```

### Configuration File Format

Create a JSON configuration file with the following structure:

```json
{
  "name": "my-crawler",
  "seedUrls": [
    "https://example.com/start"
  ],
  "urlRules": {
    "include": [".*example\\.com.*"],
    "exclude": [".*login.*", ".*logout.*"]
  },
  "login": {
    "required": false,
    "username": "",
    "password": "",
    "loginUrl": ""
  },
  "linkDiscovery": {
    "prioritizedPatterns": [
      {
        "selector": "a[href*=\"api-key=\"]",
        "requiredQueryParams": ["api-key"],
        "pathIncludes": ["/open/api/doc"]
      }
    ]
  },
  "crawler": {
    "headless": true,
    "timeout": 30000,
    "waitBetweenRequests": 500,
    "maxRetries": 3,
    "fetchMethod": "playwright"
  },
  "output": {
    "directory": "./output",
    "format": "markdown",
    "storage": {
      "type": "file",
      "lancedb": {
        "uri": "lancedb",
        "table": "pages"
      }
    }
  }
}
```

### Configuration Options

#### seedUrls
Array of starting URLs for the crawler.

#### urlRules
- **include**: Array of regex patterns. URLs matching any pattern will be crawled.
- **exclude**: Array of regex patterns. URLs matching any pattern will be skipped.

#### login
- **required**: Whether login is needed (true/false)
- **username**: Login username (phone number, email, or username)
- **password**: Login password
- **loginUrl**: URL of the login page

#### linkDiscovery (optional)
- **prioritizedPatterns**: Rules for prioritized link extraction before generic `<a href>` discovery.
  - **selector**: CSS selector used to find candidate links.
  - **requiredQueryParams**: Query params that must exist and be valid (not empty/`undefined`/`null`).
  - **pathIncludes**: URL substrings that must match.
- **Backward compatibility**: If `linkDiscovery.prioritizedPatterns` is not configured, crawler keeps legacy default behavior for API-doc links (`a[href*="api-key="]` + `/open/api/doc`).

#### crawler
- **headless**: Run browser in headless mode (true/false)
- **timeout**: Page load timeout in milliseconds
- **waitBetweenRequests**: Delay between requests in milliseconds
- **maxRetries**: Maximum retry attempts for failed requests
- **fetchMethod**: Method to fetch pages. Use "playwright" (default) for rendering full JS or "request" for fast direct HTTP requests.

#### output
- **directory**: Output directory for Markdown files
- **format**: Output format (currently only "markdown" supported)
- **storage.type**: Storage backend (`file` or `lancedb`)
- **storage.lancedb.uri**: LanceDB directory relative to project directory (used when `type=lancedb`)
- **storage.lancedb.table**: LanceDB table name for page content

### Example: Crawling Lixinger API Documentation

1. Copy the example configuration:
```bash
cp config/lixinger.json config/my-lixinger.json
```

2. Edit `config/my-lixinger.json` and add your credentials:
```json
{
  "login": {
    "required": true,
    "username": "",
    "password": "",
    "loginUrl": "https://www.lixinger.com/login"
  }
}
```

3. Run the crawler:
```bash
npm run crawl config/my-lixinger.json
```



### 抓取 hao123 全量导航并批量生成配置

默认会从 `https://www.hao123.com/` 出发，递归抓取站内导航页（可通过 `--max-pages` 控制上限），并提取所有外部站点：

```bash
npm run crawl:hao123 -- --max-pages 300
```

如果当前环境无法访问外网，可使用本地镜像目录测试同样流程：

```bash
npm run crawl:hao123 -- --mirror-dir test/fixtures/hao123-mirror --max-pages 50
npm run test:hao123-configs
```

运行后会生成：

- `output/hao123/sites.json`：抓取到的站点明细（去重）
- `output/hao123/all-sites.txt`：站点 URL 列表
- `output/hao123/crawled-pages.txt`：已抓取的 hao123 页面列表
- `configure/*.json`：每个网站一个独立配置

### 批量处理

爬虫支持批量处理模式。在配置文件中设置 `batchSize`：

```json
{
  "crawler": {
    "batchSize": 20
  }
}
```

每次运行只处理指定数量的链接，运行完成后可以再次运行继续处理剩余链接。

### Resuming Crawls

The crawler automatically saves progress to `output/<project-name>/links.txt`. Each link has a status:
- `unfetched`: Not yet crawled
- `fetching`: Currently being crawled
- `fetched`: Successfully crawled
- `failed`: Failed after max retries

If interrupted, simply run the same command again to resume from where it left off. The crawler will only process `unfetched` links.

### URL Prioritization

When selecting URLs to crawl, the crawler automatically prioritizes them in the following order:

1. **Seed URLs**: Always processed first in each batch
2. **URLs with Numeric Path Segments**: URLs containing pure numeric segments in the path (e.g., `/123`, `/2024/`) are prioritized as they typically represent important data pages (IDs, years, etc.)
3. **Clean URLs**: URLs without query parameters (`?`, `&`, `=`) are prioritized
4. **Shorter URLs**: Among URLs of the same type, shorter ones are processed first

This ensures that important data pages are crawled first, followed by main pages and navigation pages, before detail pages with parameters.

Example priority order:
```
Priority 1 - Numeric segments:
  1. https://example.com/user/123           (numeric segment, shortest)
  2. https://example.com/2024/report        (numeric segment, longer)
  3. https://example.com/product/12345      (numeric segment, longer)

Priority 2 - No parameters:
  4. https://example.com/                   (no params, shortest)
  5. https://example.com/about              (no params, short)
  6. https://example.com/products/list      (no params, longer)

Priority 3 - Has parameters:
  7. https://example.com/product?id=1       (has params, short)
  8. https://example.com/product?id=1&cat=2 (has params, longer)
```

### Output

Crawled pages are saved in a project-specific directory structure:
```
output/
└── <project-name>/
    ├── pages-YYYYMMDD-HHmmss/  # Markdown files for each page (timestamped)
    ├── logs/                    # Log files
    │   └── crawler-YYYYMMDD-HHmmss.log
    └── links.txt                # URL list with status
```

**Note**: The `pages` directory includes a timestamp suffix (e.g., `pages-20260226-153523`) that matches the corresponding log file name. This makes it easy to correlate crawled pages with their execution logs for debugging and tracking purposes.

Each Markdown file contains:
- Page title
- Source URL (always included)
- Brief description (if available)
- Request URL and method (for API documentation)
- Parameters table (if available)
- API examples (if available)
- Response data table (if available)

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test -- config-manager.test.js
```

### Test Coverage

The project includes both unit tests and property-based tests:
- **Unit Tests**: Test specific examples and edge cases
- **Property Tests**: Verify universal properties across all inputs

For large-scale validation workflows, see `doc/SYSTEMATIC_TEST_PLAN.md`.

## Development

### Module Overview

- **ConfigManager**: Loads and validates configuration files
- **LinkManager**: Manages URL lists with status tracking (pending/crawled/failed)
- **BrowserManager**: Handles Playwright browser lifecycle
- **LoginHandler**: Detects and handles login pages
- **LinkFinder**: Discovers links on pages
- **PageParser**: Extracts structured content from pages
- **MarkdownGenerator**: Converts parsed content to Markdown
- **Logger**: Provides logging with different levels
- **StatsTracker**: Tracks crawling statistics
- **CrawlerMain**: Orchestrates all modules

### Adding New Features

1. Create a new module in `src/`
2. Add unit tests in `test/`
3. Update `crawler-main.js` to integrate the module
4. Update this README

## Troubleshooting

### Browser Launch Fails

If Playwright fails to launch the browser:
```bash
npx playwright install
```

### Login Fails

- Verify credentials in configuration file
- Try running with `headless: false` to see what's happening
- Check if the website has CAPTCHA or other anti-bot measures

### No Links Found

- Check URL rules (include/exclude patterns)
- Verify the seed URLs are accessible
- Try running with `headless: false` to inspect the page

### Memory Issues

For large crawls, consider:
- Reducing `waitBetweenRequests` to speed up crawling
- Running in headless mode
- Crawling in smaller batches

## License

MIT

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Add tests for new features
4. Submit a pull request

## Support

For issues and questions, please open an issue on the project repository.



LIXINGER_USERNAME=13311390323 LIXINGER_PASSWORD=***REDACTED*** \
node /Users/fengzhi/Downloads/git/testlixingren/skills/lixinger-screener/request/fetch-lixinger-screener.js \
  --simple-input-file /Users/fengzhi/Downloads/git/testlixingren/output/playwright/lixinger-screener/simple-input-template.cn.json \
  --catalog-file /Users/fengzhi/Downloads/git/testlixingren/output/playwright/lixinger-screener/condition-catalog.cn.json \
  --output csv
