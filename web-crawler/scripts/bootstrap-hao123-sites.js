#!/usr/bin/env node
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  extractAnchorLinks,
  extractWebsiteEntries,
  buildSiteConfig
} from '../src/hao123-site-bootstrap.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const HAO123_URL = 'https://www.hao123.com/';
const MAX_DEPTH = 3;
const CONFIG_OUTPUT_DIR = join(__dirname, '../config/hao123-sites');

async function main() {
  console.log('🚀 Starting hao123 sites config generator...\n');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    // Step 1: Get all websites from hao123
    console.log('📋 Fetching all websites from hao123.com...');
    await page.goto(HAO123_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    
    const html = await page.content();
    const links = extractAnchorLinks(html);
    const websites = extractWebsiteEntries(links, HAO123_URL);
    
    console.log(`✅ Found ${websites.length} unique websites\n`);
    
    // Create output directory
    mkdirSync(CONFIG_OUTPUT_DIR, { recursive: true });
    
    // Step 2: Generate config for each website
    const configs = [];
    
    for (let i = 0; i < websites.length; i++) {
      const site = websites[i];
      console.log(`[${i + 1}/${websites.length}] Generating config for: ${site.title} (${site.host})`);
      
      try {
        // Build config
        const config = buildSiteConfig(site);
        config.crawler.maxDepth = MAX_DEPTH;
        
        configs.push({
          site: site.host,
          config
        });
        
        // Save individual config file
        const configPath = join(CONFIG_OUTPUT_DIR, `${config.name}.json`);
        writeFileSync(configPath, JSON.stringify(config, null, 2));
        console.log(`  ✅ Saved: ${configPath}`);
        
      } catch (error) {
        console.error(`  ❌ Failed to generate config for ${site.host}:`, error.message);
      }
    }
    
    // Step 3: Create master config file
    const masterConfig = {
      version: '1.0.0',
      generated: new Date().toISOString(),
      source: 'hao123.com',
      totalSites: configs.length,
      maxDepth: MAX_DEPTH,
      sites: configs.map(c => ({
        name: c.config.name,
        host: c.site,
        title: c.config.metadata.title,
        configFile: `${c.config.name}.json`
      }))
    };
    
    const masterPath = join(CONFIG_OUTPUT_DIR, 'master-config.json');
    writeFileSync(masterPath, JSON.stringify(masterConfig, null, 2));
    
    console.log(`\n${'='.repeat(60)}`);
    console.log('✅ Config generation completed!');
    console.log('='.repeat(60));
    console.log(`📊 Summary:`);
    console.log(`   - Total sites: ${configs.length}`);
    console.log(`   - Max crawl depth: ${MAX_DEPTH} layers`);
    console.log(`   - Config directory: ${CONFIG_OUTPUT_DIR}`);
    console.log(`   - Master config: ${masterPath}`);
    console.log(`\n💡 Next steps:`);
    console.log(`   1. Test single site: npm run crawl config/hao123-sites/hao123-example-com.json`);
    console.log(`   2. Test all sites: npm run test:all-hao123`);
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('❌ Config generation failed:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
