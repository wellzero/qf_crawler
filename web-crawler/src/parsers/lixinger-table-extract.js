/**
 * lixinger-table-extract.js — 理杏仁表格 DOM 提取 (含层级表头展开)
 *
 * 财报页面 (bs/ps/cfs) 的 thead 是三级层级结构:
 *   年 (colspan=季度数×3) → 季度 (colspan=3) → 原值/同比/环比
 * 指标列 rowspan=3, 指标名单元格在 tbody 里 rowspan=2 (当期/单季两行共享)。
 * 简单拼接 thead 单元格会得到错位/错列的扁平表头, 这里做标准
 * rowspan/colspan 网格展开, 再把每列的层级文本拼成规范列名:
 *   ['默认单位: 亿元','2026','Q2','原值'] → 指标, 口径, 2026Q2_原值, ...
 *
 * extractTablesHierarchical 必须是**自包含**函数 (不引用模块外符号),
 * 供 page.evaluate(extractTablesHierarchical) 序列化后在浏览器侧执行。
 */

/**
 * 在浏览器上下文执行: 提取页面全部表格, 展开层级表头与 tbody rowspan。
 * 返回 [{ index, headers, rows, caption }] — 与原内联提取器同构。
 */
export function extractTablesHierarchical() {
  // 将带 rowspan/colspan 的单元格序列展开为矩形网格
  function expandGrid(trs) {
    const grid = [];
    const carry = {}; // col -> { text, left } rowspanned 单元格的跨行延续
    let ncols = 0;
    trs.forEach((tr, r) => {
      const row = [];
      let c = 0;
      const cells = Array.from(tr.querySelectorAll('th, td'));
      for (const cell of cells) {
        while (carry[c] && carry[c].left > 0) { row[c] = carry[c].text; carry[c].left--; c++; }
        const text = (cell.textContent || '').trim();
        const cs = parseInt(cell.getAttribute('colspan') || '1', 10);
        const rs = parseInt(cell.getAttribute('rowspan') || '1', 10);
        for (let k = 0; k < cs; k++) {
          row[c] = text;
          if (rs > 1) carry[c] = { text, left: rs - 1 };
          c++;
        }
      }
      while (carry[c] && carry[c].left > 0) { row[c] = carry[c].text; carry[c].left--; c++; }
      grid.push(row);
      ncols = Math.max(ncols, c);
    });
    return { grid, ncols };
  }

  // 每列把各层表头文本拼成列名: 年+季度无缝拼接 (2026+Q2 → 2026Q2), 其余用 _
  function joinLevels(levels) {
    let h = '';
    for (const lev of levels) {
      if (!lev) continue;
      if (!h) h = lev;
      else if (/^\d{4}$/.test(h) && /^Q[1-4]$/.test(lev)) h += lev;
      else h += '_' + lev;
    }
    return h;
  }

  const results = [];
  const tables = document.querySelectorAll('table');
  tables.forEach((table, idx) => {
    const theadTrs = Array.from(table.querySelectorAll('thead tr'));
    let headers = [];
    let bodyTrs;
    if (theadTrs.length > 0) {
      const { grid, ncols } = expandGrid(theadTrs);
      for (let c = 0; c < ncols; c++) {
        const levels = [];
        for (let r = 0; r < grid.length; r++) {
          const t = grid[r][c];
          if (t && levels[levels.length - 1] !== t) levels.push(t);
        }
        headers.push(joinLevels(levels));
      }
      bodyTrs = Array.from(table.querySelectorAll('tbody tr'));
    } else {
      // 无 thead: 首行当表头 (与原提取器一致)
      const allTrs = Array.from(table.querySelectorAll('tr'));
      if (allTrs.length > 0) {
        allTrs[0].querySelectorAll('th, td').forEach(cell => headers.push((cell.textContent || '').trim()));
        bodyTrs = allTrs.slice(1);
      } else {
        bodyTrs = [];
      }
    }

    // 财报表 (含 原值/同比/环比 层级列) 的首列规范化为 指标;
    // 季报表前两列同为单位标签 (colspan=2), 第二列是 当期/单季 标记, 命名 口径
    if (headers.some(h => /^\d{4}(Q[1-4])?_/.test(h)) && headers.length > 1) {
      if (headers[0].includes('默认单位') || headers[0].includes('单位')) headers[0] = '指标';
      if (headers[1] === headers[0] || headers[1].includes('默认单位')) headers[1] = '口径';
    }

    const { grid: rowGrid } = expandGrid(bodyTrs);
    const rows = rowGrid
      .map(r => r.map(v => v ?? ''))
      .filter(r => r.some(v => v !== ''));

    if (headers.length > 0 || rows.length > 0) {
      results.push({ index: idx, headers, rows, caption: '' });
    }
  });
  return results;
}
