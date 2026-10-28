/**
 * 无限滚动交互器
 * 负责自动向下滚动页面，触发懒加载内容，直到到底部或达到最大次数
 */
class ScrollHandler {
  constructor(options = {}) {
    this.maxScrolls = options.maxScrolls || 30;
    this.scrollTimeout = options.scrollTimeout || 60000;
  }

  /**
   * 执行交互
   * @param {Object} context - 解析上下文 { page, url, options, data }
   */
  async execute(context) {
    const { page } = context;
    await this.handleInfiniteScrollEnhanced(page);
  }

  async handleInfiniteScrollEnhanced(page) {
    try {
      console.log('  处理无限滚动...');
      
      const scrollContainer = await this.findScrollContainer(page);
      
      const startTime = Date.now();
      let scrollCount = 0;
      let previousHash = '';
      let noChangeCount = 0;
      
      while (scrollCount < this.maxScrolls && noChangeCount < 3) {
        if (Date.now() - startTime > this.scrollTimeout) {
          console.log('    滚动超时');
          break;
        }
        
        const loadMoreClicked = await this.clickLoadMoreButton(page);
        if (loadMoreClicked) {
          await page.waitForTimeout(1500);
        }
        
        if (scrollContainer) {
          await page.evaluate(() => {
            const container = document.querySelector('[class*="scroll"], [class*="list"], [style*="overflow"]');
            if (container) {
              container.scrollTop = container.scrollHeight;
            }
          });
        } else {
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        }
        
        scrollCount++;
        await page.waitForTimeout(2000);
        
        const currentHash = await page.evaluate(() => {
          const content = document.body.innerText;
          return content.length + '_' + content.slice(-200);
        });
        
        if (currentHash === previousHash) {
          noChangeCount++;
        } else {
          noChangeCount = 0;
          previousHash = currentHash;
        }
        
        const hasNoMore = await page.evaluate(() => {
          const noMoreTexts = ['没有更多', 'no more', '已经到底', '暂无更多', '全部加载完成', 'end of list', '到底了'];
          const bodyText = document.body.textContent.toLowerCase();
          return noMoreTexts.some(text => bodyText.includes(text.toLowerCase()));
        });
        
        if (hasNoMore) {
          console.log('    检测到"没有更多"提示');
          break;
        }
      }
      
      if (scrollCount > 0) {
        console.log(`    ✓ 滚动了 ${scrollCount} 次`);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(1000);
      }
      
    } catch (error) {
      console.error('Error handling infinite scroll:', error.message);
    }
  }

  async findScrollContainer(page) {
    try {
      return await page.evaluate(() => {
        const selectors = [
          '[class*="scroll-container"]', '[class*="list-container"]', '[class*="table-container"]',
          '[style*="overflow: auto"]', '[style*="overflow: scroll"]',
          '[style*="overflow-y: auto"]', '[style*="overflow-y: scroll"]'
        ];
        
        for (const selector of selectors) {
          const el = document.querySelector(selector);
          if (el && el.scrollHeight > el.clientHeight) {
            return true;
          }
        }
        return false;
      });
    } catch (error) {
      return false;
    }
  }

  async clickLoadMoreButton(page) {
    try {
      const buttonTexts = ['加载更多', '查看更多', 'Load More', 'Show More', '更多'];
      
      for (const text of buttonTexts) {
        try {
          const button = page.locator(`button:has-text("${text}"), a:has-text("${text}")`).first();
          const count = await button.count();
          
          if (count > 0) {
            const isVisible = await button.isVisible();
            if (isVisible) {
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
}

export default ScrollHandler;
