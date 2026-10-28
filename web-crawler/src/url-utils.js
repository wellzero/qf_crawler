/**
 * URL工具函数模块
 * 提供URL转换、过滤和模式匹配功能
 */

/**
 * 验证URL是否有效（检查查询参数值）
 * @param {string} url - 要验证的URL
 * @returns {boolean} URL是否有效
 */
function isValidUrl(url) {
  try {
    // 过滤掉空链接、javascript: 链接
    if (!url || typeof url !== 'string') return false;
    if (url.startsWith('javascript:')) return false;
    if (url === '#' || url === '') return false;

    const urlObj = new URL(url);

    for (const [key, value] of urlObj.searchParams.entries()) {
      if (value === 'undefined' || value === 'null') {
        return false;
      }
      if (typeof value === 'string' && value.trim() === '') {
        return false;
      }
    }

    return true;
  } catch (error) {
    // URL格式无效
    return false;
  }
}

/**
 * 常见广告/追踪域名列表
 */
const AD_DOMAINS = [
  // 广告联盟
  'googlesyndication.com',
  'doubleclick.net',
  'googleadservices.com',
  'googleads.com',
  'adclick.g.doubleclick.net',

  // 国内广告平台
  'web-cps.gamersky.com',  // 游民星空CPS广告
  'ad.toutiao.com',
  'ad.oceanengine.com',
  'e.qq.com',
  'pos.baidu.com',
  'cpro.baidu.com',
  'hm.baidu.com',
  'eclick.baidu.com',
  'adsame.com',
  'tanx.com',
  'mmstat.com',
  'atm.youku.com',
  'adsmogo.com',
  'ads.mopub.com',

  // 联盟推广
  'union.jd.com',
  'cps.360buy.com',
  'affiliates.alibaba.com',

  // 追踪/统计
  'beacon.tingyun.com',
  'track.uc.cn',
  'stat.m.jd.com',
  'tvc.home.news.cn',
];

/**
 * 检查URL是否为广告/追踪链接
 * @param {string} url - 要检查的URL
 * @returns {boolean} 是否为广告链接
 */
function isAdUrl(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();

    // 检查是否匹配广告域名
    for (const adDomain of AD_DOMAINS) {
      if (hostname === adDomain || hostname.endsWith('.' + adDomain)) {
        return true;
      }
    }

    // 检查URL路径中的广告标识
    const adPathPatterns = [
      /\/ad\//i,
      /\/ads\//i,
      /\/adclick/i,
      /\/adserver/i,
      /\/affiliate/i,
      /\/tracking/i,
      /\/track\//i,
      /\/click\//i,
      /\/banner/i,
      /\/promo\//i,
    ];

    for (const pattern of adPathPatterns) {
      if (pattern.test(urlObj.pathname)) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * 将相对URL转换为绝对URL
 * @param {string} url - 相对或绝对URL
 * @param {string} baseUrl - 基础URL
 * @returns {string} 绝对URL
 */
function toAbsoluteUrl(url, baseUrl) {
  try {
    // 如果url已经是绝对URL，直接返回
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    
    // 使用URL构造函数处理相对URL
    const absoluteUrl = new URL(url, baseUrl);
    return absoluteUrl.href;
  } catch (error) {
    // 如果转换失败，返回原URL
    return url;
  }
}

/**
 * 检查URL是否匹配给定的模式
 * @param {string} url - 要检查的URL
 * @param {string} pattern - 正则表达式模式字符串
 * @returns {boolean} 是否匹配
 */
function matchesPattern(url, pattern) {
  try {
    const regex = new RegExp(pattern);
    return regex.test(url);
  } catch (error) {
    // 如果正则表达式无效，返回false
    return false;
  }
}

/**
 * 根据规则过滤URL列表
 * @param {string[]} urls - URL数组
 * @param {Object} urlRules - 过滤规则 {include: string[], exclude: string[]}
 * @returns {string[]} 过滤后的URL数组
 */
function filterLinks(urls, urlRules) {
  if (!urls || !Array.isArray(urls)) {
    return [];
  }

  const { include = [], exclude = [] } = urlRules || {};

  return urls.filter(url => {
    // 首先验证URL的有效性
    if (!isValidUrl(url)) {
      return false;
    }

    // 过滤广告链接
    if (isAdUrl(url)) {
      return false;
    }

    // 如果没有include规则，默认包含所有URL
    const matchesInclude = include.length === 0 ||
      include.some(pattern => matchesPattern(url, pattern));

    // 检查是否匹配任何exclude规则
    const matchesExclude = exclude.length > 0 &&
      exclude.some(pattern => matchesPattern(url, pattern));

    // 必须匹配include且不匹配exclude
    return matchesInclude && !matchesExclude;
  });
}

export { toAbsoluteUrl, matchesPattern, filterLinks, isValidUrl, isAdUrl, AD_DOMAINS };
