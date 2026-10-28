#!/usr/bin/env node

import path from 'path';
import TemplateCrawlPipeline from './template-crawl-pipeline.js';

function printHelp() {
  console.log(`
Template Crawl Pipeline

Usage:
  node src/template-pipeline-cli.js <site-url> [output-dir]

Example:
  node src/template-pipeline-cli.js https://example.com ./output/example
`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  const [siteUrl, outputDir] = args;
  const pipeline = new TemplateCrawlPipeline();

  const result = await pipeline.run({
    siteUrl,
    outputDir: outputDir ? path.resolve(process.cwd(), outputDir) : undefined
  });

  console.log('\nPipeline completed:');
  console.log(JSON.stringify(result, null, 2));
}

main().catch(error => {
  console.error('Pipeline failed:', error.message);
  process.exit(1);
});
