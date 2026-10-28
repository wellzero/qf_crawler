/**
 * 表格数据提取器
 * 支持普通表格、分页表格和虚拟表格的提取
 */
class TableExtractor {
  constructor(options = {}) {
    this.supportPagination = options.supportPagination !== false;
    this.supportVirtual = options.supportVirtual !== false;
  }

  /**
   * 执行提取
   * @param {Object} context - 解析上下文 { page, url, options, data }
   * @returns {Promise<Object>} 提取的数据
   */
  async extract(context) {
    const { page, options } = context;
    const { onDataChunk } = options;
    
    const tables = await this.extractTablesWithPaginationAndVirtual(page, onDataChunk);

    return { tables };
  }

  async extractTablesWithPaginationAndVirtual(page, onDataChunk) {
    try {
      const tables = [];
      const tableElements = await page.locator('table').all();
      
      for (let tableIndex = 0; tableIndex < tableElements.length; tableIndex++) {
        const tableEl = tableElements[tableIndex];
        
        let isVirtual = false;
        if (this.supportVirtual) {
          isVirtual = await this.detectVirtualTable(page, tableEl);
        }
        
        if (isVirtual) {
          console.log(`  检测到虚拟表格 ${tableIndex + 1}，使用虚拟表格提取模式`);
          const virtualTableData = await this.extractVirtualTable(page, tableEl, tableIndex, onDataChunk);
          tables.push(virtualTableData);
        } else {
          const tableInfo = await this.extractSingleTable(tableEl, tableIndex);
          
          let paginationInfo = { hasPagination: false };
          if (this.supportPagination) {
            paginationInfo = await this.findPaginationControls(page, tableEl);
          }
          
          if (paginationInfo.hasPagination) {
            const paginatedTable = await this.extractPaginatedTable(page, tableEl, tableIndex, tableInfo, paginationInfo, onDataChunk);
            tables.push(paginatedTable);
          } else {
            tables.push(tableInfo);
            if (onDataChunk) {
              await onDataChunk({
                type: 'table',
                tableIndex,
                page: 1,
                headers: tableInfo.headers,
                rows: tableInfo.rows,
                isFirstPage: true,
                isLastPage: true,
                precedingContent: tableInfo.precedingContent,
                caption: tableInfo.caption
              });
            }
          }
        }
      }
      
      return tables;
    } catch (error) {
      console.error('Failed to extract tables:', error.message);
      return [];
    }
  }

  async extractSingleTable(tableEl, index) {
    return await tableEl.evaluate((table, idx) => {
      const headers = [];
      const headerCells = table.querySelectorAll('thead th, thead td');
      if (headerCells.length > 0) {
        headerCells.forEach(cell => headers.push(cell.textContent.trim()));
      } else {
        const firstRow = table.querySelector('tr');
        if (firstRow) {
          const cells = firstRow.querySelectorAll('th, td');
          cells.forEach(cell => headers.push(cell.textContent.trim()));
        }
      }

      const rows = [];
      const bodyRows = table.querySelectorAll('tbody tr');
      const rowsToProcess = bodyRows.length > 0 ? bodyRows : table.querySelectorAll('tr');

      rowsToProcess.forEach((row, rowIndex) => {
        if (rowIndex === 0 && bodyRows.length === 0 && headers.length > 0) return;
        const cells = Array.from(row.querySelectorAll('td, th'));
        if (cells.length > 0) {
          const rowData = cells.map(cell => cell.textContent.trim());
          rows.push(rowData);
        }
      });

      const precedingContent = [];
      let prevElement = table.previousElementSibling;
      let maxSearch = 5;

      while (prevElement && maxSearch > 0) {
        const tag = prevElement.tagName;
        const text = prevElement.textContent.trim();
        if (text && text.length > 0 && tag !== 'TABLE') {
          if (/^H[1-6]$/.test(tag)) {
            precedingContent.unshift({ type: 'heading', level: parseInt(tag[1]), content: text });
          } else if (tag === 'P' && text.length > 5) {
            precedingContent.unshift({ type: 'paragraph', content: text });
          } else if ((tag === 'DIV' || tag === 'SECTION') && text.length > 5 && text.length < 500) {
            const hasTable = prevElement.querySelector('table');
            if (!hasTable) precedingContent.unshift({ type: 'paragraph', content: text });
          }
        }
        prevElement = prevElement.previousElementSibling;
        maxSearch--;
      }

      return {
        index: idx,
        headers,
        rows,
        caption: table.querySelector('caption')?.textContent.trim() || '',
        precedingContent
      };
    }, index);
  }

  async findPaginationControls(page, tableEl) {
    try {
      return await page.evaluate(() => {
        const selectors = [
          '.pagination', '.pager', '[class*="pagination"]', '[class*="pager"]',
          'nav[aria-label*="pagination"]', '.page-navigation', '[class*="page-nav"]',
          'ul[class*="page"]', 'div[class*="page"]'
        ];
        
        let paginationEl = null;
        for (const selector of selectors) {
          paginationEl = document.querySelector(selector);
          if (paginationEl) break;
        }
        
        if (!paginationEl) return { hasPagination: false };
        
        let nextButton = null;
        const allButtons = paginationEl.querySelectorAll('button, a, li');
        for (const btn of allButtons) {
          const text = btn.textContent.trim();
          if (text === '下一页' || text === 'Next' || text === '›' || text === '>' || text === '》') {
            nextButton = btn;
            break;
          }
        }
        
        if (!nextButton) {
          const nextElements = paginationEl.querySelectorAll('.next, [class*="next"], [aria-label*="next"]');
          if (nextElements.length > 0) nextButton = nextElements[0];
        }
        
        let totalPages = null;
        const pageText = paginationEl.textContent;
        const pageMatch = pageText.match(/共\s*(\d+)\s*页|total\s*(\d+)\s*pages?/i);
        if (pageMatch) totalPages = parseInt(pageMatch[1] || pageMatch[2]);
        
        return {
          hasPagination: !!nextButton,
          totalPages,
          nextButtonSelector: nextButton ? nextButton.className : null
        };
      });
    } catch (error) {
      return { hasPagination: false };
    }
  }

  async clickNextPage(page, paginationInfo) {
    try {
      const nextButtonSelectors = [
        'text="下一页"', 'text="Next"', 'text="›"', 'text=">"',
        '.next:not(.disabled)', '[class*="next"]:not(.disabled)',
        '[aria-label*="next"]:not([disabled])', 'button[class*="next"]:not([disabled])',
        'a[class*="next"]:not(.disabled)', 'li:has-text("›")', 'li:has-text(">")'
      ];
      
      for (const selector of nextButtonSelectors) {
        try {
          const button = page.locator(selector).first();
          const count = await button.count();
          if (count > 0) {
            const isDisabled = await button.evaluate(el => {
              return el.disabled || el.classList.contains('disabled') || 
                     el.getAttribute('aria-disabled') === 'true' ||
                     el.style.pointerEvents === 'none';
            });
            if (!isDisabled) {
              await button.click();
              return true;
            }
          }
        } catch (e) {
          continue;
        }
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  compareHeaders(headers1, headers2) {
    if (headers1.length !== headers2.length) return false;
    for (let i = 0; i < headers1.length; i++) {
      if (headers1[i] !== headers2[i]) return false;
    }
    return true;
  }

  async extractPaginatedTable(page, tableEl, tableIndex, tableInfo, paginationInfo, onDataChunk) {
    const allRows = [...tableInfo.rows];
    let currentPage = 1;
    const maxPages = paginationInfo.totalPages || 100;
    
    if (onDataChunk) {
      await onDataChunk({
        type: 'table', tableIndex, page: currentPage, headers: tableInfo.headers,
        rows: tableInfo.rows, isFirstPage: true, isLastPage: false,
        precedingContent: tableInfo.precedingContent, caption: tableInfo.caption
      });
    }
    
    while (currentPage < maxPages) {
      const hasNextPage = await this.clickNextPage(page, paginationInfo);
      if (!hasNextPage) break;
      
      currentPage++;
      await page.waitForTimeout(300);
      
      const currentTableEl = (await page.locator('table').all())[tableIndex];
      const currentPageData = await this.extractSingleTable(currentTableEl, tableIndex);
      
      if (this.compareHeaders(tableInfo.headers, currentPageData.headers)) {
        allRows.push(...currentPageData.rows);
        if (onDataChunk) {
          await onDataChunk({
            type: 'table', tableIndex, page: currentPage, headers: currentPageData.headers,
            rows: currentPageData.rows, isFirstPage: false, isLastPage: false
          });
        }
      } else {
        break;
      }
      await page.waitForTimeout(150);
    }
    
    if (onDataChunk) {
      await onDataChunk({
        type: 'table', tableIndex, page: currentPage, headers: tableInfo.headers,
        rows: [], isFirstPage: false, isLastPage: true
      });
    }
    
    return {
      index: tableIndex, headers: tableInfo.headers, rows: allRows,
      caption: tableInfo.caption, precedingContent: tableInfo.precedingContent,
      totalPages: currentPage
    };
  }

  async detectVirtualTable(page, tableEl) {
    try {
      return await tableEl.evaluate((table) => {
        const indicators = {
          hasDataId: false, hasAriaRowIndex: false, hasVirtualClass: false,
          hasScrollParent: false, rowCountLow: false
        };
        
        const rows = table.querySelectorAll('tr');
        if (rows.length > 0) {
          const firstRow = rows[0];
          indicators.hasDataId = !!firstRow.getAttribute('data-id') || 
                                 !!firstRow.getAttribute('data-key') ||
                                 !!firstRow.getAttribute('data-row-key');
          indicators.hasAriaRowIndex = !!firstRow.getAttribute('aria-rowindex');
        }
        
        const virtualClasses = ['virtual', 'virtualized', 'react-window', 'react-virtualized'];
        const tableClasses = table.className.toLowerCase();
        indicators.hasVirtualClass = virtualClasses.some(cls => tableClasses.includes(cls));
        
        let parent = table.parentElement;
        let depth = 0;
        while (parent && depth < 5) {
          const style = window.getComputedStyle(parent);
          const overflow = style.overflow + style.overflowY;
          if (overflow.includes('auto') || overflow.includes('scroll')) {
            if (parent.scrollHeight > parent.clientHeight) {
              indicators.hasScrollParent = true;
              break;
            }
          }
          parent = parent.parentElement;
          depth++;
        }
        
        const bodyRows = table.querySelectorAll('tbody tr');
        indicators.rowCountLow = bodyRows.length > 0 && bodyRows.length < 50;
        
        return indicators.hasDataId || indicators.hasAriaRowIndex || 
               indicators.hasVirtualClass || (indicators.hasScrollParent && indicators.rowCountLow);
      });
    } catch (error) {
      return false;
    }
  }

  async extractVirtualTable(page, tableEl, tableIndex, onDataChunk) {
    try {
      const headers = await tableEl.evaluate((table) => {
        const headerCells = table.querySelectorAll('thead th, thead td');
        if (headerCells.length > 0) return Array.from(headerCells).map(cell => cell.textContent.trim());
        const firstRow = table.querySelector('tr');
        if (firstRow) return Array.from(firstRow.querySelectorAll('th, td')).map(cell => cell.textContent.trim());
        return [];
      });
      
      const scrollContainer = await this.findTableScrollContainer(page, tableEl);
      const recordsMap = new Map();
      let noNewRecords = 0;
      let scrollPosition = 0;
      const scrollStep = 300;
      const maxNoNewCount = 5;
      const maxScrolls = 200;
      let scrollCount = 0;
      
      while (noNewRecords < maxNoNewCount && scrollCount < maxScrolls) {
        const currentRows = await tableEl.evaluate((table) => {
          const bodyRows = table.querySelectorAll('tbody tr');
          const rowsToProcess = bodyRows.length > 0 ? bodyRows : table.querySelectorAll('tr');
          const result = [];
          
          rowsToProcess.forEach((row, index) => {
            if (row.querySelector('th') && !row.querySelector('td')) return;
            
            let rowKey = row.getAttribute('data-id') || row.getAttribute('data-key') ||
                         row.getAttribute('data-row-key') || row.getAttribute('aria-rowindex');
            
            if (!rowKey) {
              const firstCell = row.querySelector('td');
              if (firstCell) rowKey = firstCell.textContent.trim();
            }
            if (!rowKey) rowKey = `row_${index}`;
            
            const cells = Array.from(row.querySelectorAll('td, th')).map(cell => cell.textContent.trim());
            if (cells.length > 0) result.push({ key: rowKey, cells });
          });
          return result;
        });
        
        let newCount = 0;
        for (const row of currentRows) {
          if (!recordsMap.has(row.key)) {
            recordsMap.set(row.key, row.cells);
            newCount++;
          }
        }
        
        if (newCount === 0) noNewRecords++;
        else noNewRecords = 0;
        
        scrollPosition += scrollStep;
        
        if (scrollContainer) {
          await page.evaluate((pos) => {
            const container = document.querySelector('[class*="scroll"], [class*="table"], [style*="overflow"]');
            if (container) container.scrollTop = pos;
          }, scrollPosition);
        } else {
          await tableEl.evaluate((table, pos) => {
            let scrollTarget = table;
            let parent = table.parentElement;
            let depth = 0;
            while (parent && depth < 5) {
              const style = window.getComputedStyle(parent);
              const overflow = style.overflow + style.overflowY;
              if ((overflow.includes('auto') || overflow.includes('scroll')) && 
                  parent.scrollHeight > parent.clientHeight) {
                scrollTarget = parent;
                break;
              }
              parent = parent.parentElement;
              depth++;
            }
            scrollTarget.scrollTop = pos;
          }, scrollPosition);
        }
        
        await page.waitForTimeout(300);
        scrollCount++;
        
        const isAtBottom = await this.checkScrollAtBottom(page, tableEl);
        if (isAtBottom && noNewRecords > 0) break;
      }
      
      const allRows = Array.from(recordsMap.values());
      
      if (onDataChunk) {
        await onDataChunk({
          type: 'table', tableIndex, page: 1, headers, rows: allRows,
          isFirstPage: true, isLastPage: true, isVirtual: true, totalRows: allRows.length
        });
      }
      
      return {
        index: tableIndex, headers, rows: allRows, caption: '',
        isVirtual: true, totalRows: allRows.length
      };
    } catch (error) {
      return await this.extractSingleTable(tableEl, tableIndex);
    }
  }

  async findTableScrollContainer(page, tableEl) {
    try {
      return await tableEl.evaluate((table) => {
        let parent = table.parentElement;
        let depth = 0;
        while (parent && depth < 5) {
          const style = window.getComputedStyle(parent);
          const overflow = style.overflow + style.overflowY;
          if ((overflow.includes('auto') || overflow.includes('scroll')) && 
              parent.scrollHeight > parent.clientHeight) {
            return true;
          }
          parent = parent.parentElement;
          depth++;
        }
        return false;
      });
    } catch (error) {
      return false;
    }
  }

  async checkScrollAtBottom(page, tableEl) {
    try {
      return await tableEl.evaluate((table) => {
        let scrollTarget = table;
        let parent = table.parentElement;
        let depth = 0;
        while (parent && depth < 5) {
          const style = window.getComputedStyle(parent);
          const overflow = style.overflow + style.overflowY;
          if ((overflow.includes('auto') || overflow.includes('scroll')) && 
              parent.scrollHeight > parent.clientHeight) {
            scrollTarget = parent;
            break;
          }
          parent = parent.parentElement;
          depth++;
        }
        return scrollTarget.scrollTop + scrollTarget.clientHeight >= scrollTarget.scrollHeight - 5;
      });
    } catch (error) {
      return false;
    }
  }
}

export default TableExtractor;
