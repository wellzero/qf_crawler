/**
 * 点击展开交互器
 * 负责自动点击页面上的"更多"、"展开"、"查看全部"等按钮，以及展开折叠面板
 */
class ExpandHandler {
  /**
   * 执行交互
   * @param {Object} context - 解析上下文 { page, url, options, data }
   */
  async execute(context) {
    const { page } = context;
    await this.clickAllExpandButtons(page);
  }

  async clickAllExpandButtons(page) {
    try {
      let totalClicked = 0;

      // 1. 首先展开所有 <details> 元素
      console.log('  展开 details/summary 元素...');
      const detailsCount = await page.evaluate(() => {
        const detailsElements = document.querySelectorAll('details:not([open])');
        detailsElements.forEach(el => el.setAttribute('open', ''));
        return detailsElements.length;
      });
      if (detailsCount > 0) {
        console.log(`    ✓ 展开了 ${detailsCount} 个 details 元素`);
        totalClicked += detailsCount;
        await page.waitForTimeout(500);
      }

      // 2. 点击所有 aria-expanded="false" 的元素
      console.log('  查找 aria-expanded="false" 元素...');
      const ariaCollapsed = await page.locator('[aria-expanded="false"]').all();
      for (const el of ariaCollapsed) {
        try {
          if (await el.isVisible()) {
            await el.click();
            await page.waitForTimeout(300);
            totalClicked++;
          }
        } catch (e) {
          continue;
        }
      }
      if (ariaCollapsed.length > 0) {
        console.log(`    ✓ 点击了 ${ariaCollapsed.length} 个折叠元素`);
      }

      // 3. 点击所有带有折叠类名的元素
      console.log('  查找折叠组件 (accordion, collapse)...');
      const collapseSelectors = [
        '.accordion-header', '.accordion-toggle', '.collapse-header',
        '[data-toggle="collapse"]', '[data-bs-toggle="collapse"]',
        '.panel-heading', '.expandable-header'
      ];
      for (const selector of collapseSelectors) {
        try {
          const elements = await page.locator(selector).all();
          for (const el of elements) {
            try {
              if (await el.isVisible()) {
                await el.click();
                await page.waitForTimeout(300);
                totalClicked++;
              }
            } catch (e) {
              continue;
            }
          }
        } catch (e) {
          continue;
        }
      }

      // 4. 点击所有带有展开指示器的标题区域（箭头、+号等）
      console.log('  查找可展开的标题区域...');
      const expandableHeaders = await page.evaluate(() => {
        const headers = [];
        const indicators = document.querySelectorAll('[class*="expand"], [class*="collapse"], [class*="toggle"], [class*="chevron"], [class*="arrow"]');
        indicators.forEach(el => {
          let clickable = el.closest('button, [role="button"], [tabindex="0"], .header, .title, h1, h2, h3, h4, h5, h6');
          if (clickable && !clickable.hasAttribute('data-clicked')) {
            headers.push({
              selector: clickable.tagName + (clickable.className ? '.' + clickable.className.split(' ').join('.') : ''),
              text: clickable.textContent?.trim().slice(0, 50) || ''
            });
            clickable.setAttribute('data-clicked', 'true');
          }
        });
        return headers;
      });

      for (const header of expandableHeaders.slice(0, 20)) {
        try {
          if (header.text) {
            const el = page.locator(`text="${header.text}"`).first();
            if (await el.isVisible()) {
              await el.click();
              await page.waitForTimeout(300);
              totalClicked++;
            }
          }
        } catch (e) {
          continue;
        }
      }
      if (expandableHeaders.length > 0) {
        console.log(`    ✓ 尝试点击了 ${Math.min(expandableHeaders.length, 20)} 个可展开标题`);
      }

      // 5. 点击常规的"更多/展开"按钮
      const buttonTexts = [
        '更多', '展开', '查看全部', '加载更多', '全部', '历史', '明细', '详情', '说明', '继续阅读',
        'More', 'Expand', 'Show All', 'Load More', 'View All', 'Details', 'Read More'
      ];

      let clicked = true;
      let maxClicks = 10;

      console.log('  查找并点击展开按钮...');

      while (clicked && maxClicks > 0) {
        clicked = false;

        for (const text of buttonTexts) {
          try {
            const buttons = await page.locator(
              `button:has-text("${text}"), a:has-text("${text}"), [role="button"]:has-text("${text}"), [class*="more"]:has-text("${text}"), [class*="expand"]:has-text("${text}"), [class*="detail"]:has-text("${text}")`
            ).all();

            for (const button of buttons) {
              try {
                const isVisible = await button.isVisible();
                if (!isVisible) continue;

                const isDisabled = await button.evaluate(el => {
                  return el.disabled || el.classList.contains('disabled') ||
                         el.getAttribute('aria-disabled') === 'true' || el.style.display === 'none';
                });

                if (isDisabled) continue;

                await button.click();
                await page.waitForTimeout(800);

                clicked = true;
                totalClicked++;
                maxClicks--;

                console.log(`    ✓ 点击了"${text}"按钮 (${totalClicked})`);
                break;
              } catch (e) {
                continue;
              }
            }
            if (clicked) break;
          } catch (e) {
            continue;
          }
        }
      }

      if (totalClicked > 0) {
        console.log(`  ✓ 共展开/点击了 ${totalClicked} 个元素`);
        await page.waitForTimeout(2000);
      }

      return totalClicked;
    } catch (error) {
      console.error('Error clicking expand buttons:', error.message);
      return 0;
    }
  }
}

export default ExpandHandler;
