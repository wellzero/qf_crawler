#!/usr/bin/env node

import CrawlerMain from './crawler-main.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * CLI Entry Point for Stock Website Crawler
 */
async function main() {
  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    
    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
      printHelp();
      process.exit(0);
    }

    // Get config file path
    const configPath = args[0];
    
    if (!configPath) {
      console.error('Error: Configuration file path is required');
      printHelp();
      process.exit(1);
    }

    // Resolve config path
    const resolvedConfigPath = path.isAbsolute(configPath) 
      ? configPath 
      : path.resolve(process.cwd(), configPath);

    console.log('Stock Website Crawler');
    console.log('====================\n');
    console.log(`Configuration: ${resolvedConfigPath}\n`);

    // Initialize and start crawler
    const crawler = new CrawlerMain();
    await crawler.initialize(resolvedConfigPath);
    await crawler.start();

    console.log('\nCrawling completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\nFatal Error:', error.message);
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

/**
 * Print help message
 */
function printHelp() {
  console.log(`
Stock Website Crawler - A configurable web crawler for stock data websites

Usage:
  npm start <config-file>
  node src/index.js <config-file>

Arguments:
  <config-file>    Path to the configuration JSON file

Options:
  -h, --help       Show this help message

Examples:
  npm start config/lixinger.json
  node src/index.js config/example.json

Environment Variables:
  DEBUG=1          Enable debug mode with full stack traces

For more information, see README.md
  `);
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('\nUncaught Exception:', error.message);
  if (process.env.DEBUG) {
    console.error(error.stack);
  }
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\nUnhandled Promise Rejection:', reason);
  if (process.env.DEBUG) {
    console.error(promise);
  }
  process.exit(1);
});

// Run main function
main();
