import fs from 'fs/promises';
import path from 'path';
import { chromium } from 'playwright';
import { createRequire } from 'module';
import { TemplateGenerator } from '../../skills/html-template-generator/main.js';

const require = createRequire(import.meta.url);
const URLClusterer = require('../../skills/url-pattern-analyzer/lib/url-clusterer');
const ReportGenerator = require('../../skills/url-pattern-analyzer/lib/report-generator');

const DEFAULT_CATEGORIES = {
  api: ['api', 'open', 'doc', 'docs', 'swagger'],
  report: ['report', 'announcement', 'notice', 'research', 'news'],
  listing: ['list', 'search', 'catalog', 'market'],
  detail: ['detail', 'profile', 'overview', 'view'],
  data: ['table', 'fundamental', 'financial', 'indicator', 'chart']
};

export function classifyPattern(pattern, customCategories = DEFAULT_CATEGORIES) {
  const haystack = `${pattern.name} ${pattern.pathTemplate} ${pattern.description || ''}`.toLowerCase();

  for (const [category, keywords] of Object.entries(customCategories)) {
    if (keywords.some(keyword => haystack.includes(keyword.toLowerCase()))) {
      return category;
    }
  }

  return 'general';
}

function toSafeName(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'pattern';
}

export default class TemplateCrawlPipeline {
  constructor(options = {}) {
    this.options = {
      minDepth: 3,
      maxDepth: 5,
      pageLimit: 400,
      maxLinksPerPage: 120,
      navigationTimeout: 15000,
      minGroupSize: 3,
      sampleCount: 5,
      ...options
    };
  }

  async run({ siteUrl, outputDir, browser = {} }) {
    if (!siteUrl) {
      throw new Error('siteUrl is required');
    }

    const targetDir = outputDir || path.resolve(process.cwd(), 'output', toSafeName(siteUrl));
    const artifactsDir = path.resolve(targetDir, 'template-pipeline');
    await fs.mkdir(artifactsDir, { recursive: true });

    const crawlResult = await this.discoverSiteLinks(siteUrl, browser);
    const linksFile = path.resolve(artifactsDir, 'links.txt');
    await this.writeLinksFile(crawlResult.records, linksFile);

    const patternsReport = await this.generateUrlPatterns(crawlResult.records.map(item => item.url));
    const patternsFile = path.resolve(artifactsDir, 'url-patterns.json');
    await fs.writeFile(patternsFile, JSON.stringify(patternsReport, null, 2), 'utf-8');

    const classifiedPatterns = patternsReport.patterns.map(pattern => ({
      ...pattern,
      category: classifyPattern(pattern)
    }));

    const classifiedFile = path.resolve(artifactsDir, 'classified-patterns.json');
    await fs.writeFile(
      classifiedFile,
      JSON.stringify({ ...patternsReport, patterns: classifiedPatterns }, null, 2),
      'utf-8'
    );

    const generatedTemplates = await this.generateTemplatesFromPatterns(
      classifiedPatterns,
      patternsFile,
      path.resolve(artifactsDir, 'templates')
    );

    return {
      siteUrl,
      discovered: crawlResult.records.length,
      linksFile,
      patternsFile,
      classifiedFile,
      generatedTemplates,
      crawlStats: crawlResult.stats
    };
  }

  async discoverSiteLinks(siteUrl, browserConfig = {}) {
    const browser = await chromium.launch({
      headless: browserConfig.headless ?? true
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    const visited = new Set();
    const records = [];
    const queue = [{ url: siteUrl, depth: 0 }];
    const startHost = new URL(siteUrl).host;

    try {
      while (queue.length > 0 && visited.size < this.options.pageLimit) {
        const { url, depth } = queue.shift();
        if (visited.has(url) || depth > this.options.maxDepth) {
          continue;
        }

        visited.add(url);

        try {
          await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: this.options.navigationTimeout
          });

          const title = await page.title();
          const links = await page.$$eval('a[href]', anchors => anchors.map(a => a.href));

          if (depth >= this.options.minDepth && depth <= this.options.maxDepth) {
            records.push({
              url,
              depth,
              title,
              status: 'unfetched',
              addedAt: Date.now()
            });
          }

          const nextLinks = links
            .map(link => link.split('#')[0])
            .filter(Boolean)
            .filter(link => link.startsWith('http'))
            .filter(link => {
              try {
                return new URL(link).host === startHost;
              } catch {
                return false;
              }
            })
            .slice(0, this.options.maxLinksPerPage);

          for (const nextUrl of nextLinks) {
            if (!visited.has(nextUrl)) {
              queue.push({ url: nextUrl, depth: depth + 1 });
            }
          }
        } catch {
          // 页面失败不打断全局流程
        }
      }
    } finally {
      await context.close();
      await browser.close();
    }

    const deduped = Array.from(new Map(records.map(item => [item.url, item])).values());

    return {
      records: deduped,
      stats: {
        crawledPages: visited.size,
        collectedUrls: deduped.length,
        minDepth: this.options.minDepth,
        maxDepth: this.options.maxDepth
      }
    };
  }

  async writeLinksFile(records, outputPath) {
    const content = records
      .map(record => JSON.stringify({
        url: record.url,
        status: 'unfetched',
        addedAt: record.addedAt,
        fetchedAt: null,
        retryCount: 0,
        error: null,
        depth: record.depth,
        title: record.title
      }))
      .join('\n');

    await fs.writeFile(outputPath, content, 'utf-8');
  }

  async generateUrlPatterns(urls) {
    const clusterer = new URLClusterer();
    const reportGenerator = new ReportGenerator();

    const clusters = clusterer
      .clusterURLs(urls)
      .filter(group => group.length >= this.options.minGroupSize);

    return reportGenerator.generateJSONReport(clusters, {
      sampleCount: this.options.sampleCount
    });
  }

  async generateTemplatesFromPatterns(patterns, patternsFile, templatesDir) {
    await fs.mkdir(templatesDir, { recursive: true });
    const results = [];

    for (const pattern of patterns) {
      const templateName = pattern.name;
      const outputFile = path.resolve(templatesDir, `${toSafeName(templateName)}.json`);
      const generator = new TemplateGenerator({
        browser: {
          headless: true,
          timeout: this.options.navigationTimeout
        },
        fetching: {
          maxSamples: 3
        }
      });

      try {
        await generator.generate(templateName, patternsFile, outputFile);
        results.push({ templateName, outputFile, status: 'generated', category: pattern.category });
      } catch (error) {
        results.push({ templateName, status: 'failed', error: error.message, category: pattern.category });
      }
    }

    return results;
  }
}
