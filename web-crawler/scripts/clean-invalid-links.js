#!/usr/bin/env node

/**
 * 清理无效链接脚本
 * 删除包含 undefined、null 或空值参数的URL
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 验证URL是否有效
 */
function isValidUrl(url) {
  try {
    const urlObj = new URL(url);
    
    // 检查所有查询参数的值
    for (const [key, value] of urlObj.searchParams.entries()) {
      if (value === 'undefined' || value === 'null' || value.trim() === '') {
        return false;
      }
    }
    
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * 清理指定项目的无效链接
 */
function cleanInvalidLinks(projectName) {
  const linksFile = path.join(__dirname, '..', 'output', projectName, 'links.txt');
  
  if (!fs.existsSync(linksFile)) {
    console.log(`❌ 链接文件不存在: ${linksFile}`);
    return;
  }
  
  console.log(`\n📂 处理项目: ${projectName}`);
  console.log(`📄 链接文件: ${linksFile}\n`);
  
  // 读取所有链接
  const content = fs.readFileSync(linksFile, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  
  console.log(`📊 总链接数: ${lines.length}`);
  
  // 过滤无效链接
  const validLines = [];
  const invalidLinks = [];
  
  lines.forEach(line => {
    try {
      const link = JSON.parse(line);
      
      if (isValidUrl(link.url)) {
        validLines.push(line);
      } else {
        invalidLinks.push(link.url);
        console.log(`❌ 删除无效URL: ${link.url}`);
      }
    } catch (error) {
      console.log(`⚠️  跳过无法解析的行: ${line.substring(0, 50)}...`);
    }
  });
  
  // 保存清理后的链接
  if (invalidLinks.length > 0) {
    fs.writeFileSync(linksFile, validLines.join('\n') + '\n', 'utf-8');
    
    console.log(`\n✅ 清理完成！`);
    console.log(`📊 删除了 ${invalidLinks.length} 个无效链接`);
    console.log(`📊 保留了 ${validLines.length} 个有效链接`);
    
    // 显示被删除的链接
    console.log(`\n🗑️  被删除的链接:`);
    invalidLinks.forEach(url => {
      console.log(`   - ${url}`);
    });
  } else {
    console.log(`\n✅ 没有发现无效链接！`);
  }
}

/**
 * 删除无效的markdown文件
 */
function cleanInvalidMarkdownFiles(projectName) {
  const pagesDir = path.join(__dirname, '..', 'output', projectName, 'pages');
  
  if (!fs.existsSync(pagesDir)) {
    console.log(`\n❌ 页面目录不存在: ${pagesDir}`);
    return;
  }
  
  console.log(`\n📂 检查markdown文件...`);
  
  const files = fs.readdirSync(pagesDir);
  const mdFiles = files.filter(f => f.endsWith('.md'));
  
  let deletedCount = 0;
  
  mdFiles.forEach(file => {
    const filePath = path.join(pagesDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // 检查文件内容中是否包含 undefined URL
    if (content.includes('api-key=macro/undefined') || 
        content.includes('api-key=undefined') ||
        content.includes('undefined')) {
      
      // 提取URL进行验证
      const urlMatch = content.match(/https?:\/\/[^\s\n]+/);
      if (urlMatch && !isValidUrl(urlMatch[0])) {
        console.log(`🗑️  删除文件: ${file}`);
        fs.unlinkSync(filePath);
        deletedCount++;
      }
    }
  });
  
  if (deletedCount > 0) {
    console.log(`\n✅ 删除了 ${deletedCount} 个无效的markdown文件`);
  } else {
    console.log(`\n✅ 没有发现需要删除的markdown文件`);
  }
}

// 主程序
function main() {
  const projectName = process.argv[2] || 'lixinger-crawler';
  
  console.log('🧹 清理无效链接脚本');
  console.log('='.repeat(50));
  
  // 清理links.txt中的无效链接
  cleanInvalidLinks(projectName);
  
  // 清理无效的markdown文件
  cleanInvalidMarkdownFiles(projectName);
  
  console.log('\n' + '='.repeat(50));
  console.log('✅ 清理完成！');
}

main();
