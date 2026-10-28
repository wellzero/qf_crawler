import { URL } from 'url';

const INVALID_PROTOCOLS = new Set(['javascript:', 'mailto:', 'tel:', 'data:']);

export function normalizeHref(href) {
  if (typeof href !== 'string') {
    return null;
  }

  const trimmed = href.trim();
  if (!trimmed) {
    return null;
  }

  const lowerHref = trimmed.toLowerCase();
  for (const protocol of INVALID_PROTOCOLS) {
    if (lowerHref.startsWith(protocol)) {
      return null;
    }
  }

  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  return trimmed;
}

export function extractAnchorLinks(html = '') {
  const anchorRegex = /<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>(.*?)<\/a>/gis;
  const stripTagRegex = /<[^>]+>/g;
  const links = [];

  let match;
  while ((match = anchorRegex.exec(html)) !== null) {
    const href = (match[2] || '').trim();
    if (!href) {
      continue;
    }

    const title = (match[3] || '').replace(stripTagRegex, ' ').replace(/\s+/g, ' ').trim();
    links.push({ href, title });
  }

  return links;
}

export function resolveToAbsoluteUrl(href, baseUrl) {
  const normalizedHref = normalizeHref(href);
  if (!normalizedHref) {
    return null;
  }

  try {
    return new URL(normalizedHref, baseUrl).toString();
  } catch {
    return null;
  }
}

export function sanitizeHostToName(hostname) {
  return hostname
    .toLowerCase()
    .replace(/^www\./, '')
    .replace(/[^a-z0-9.-]/g, '-')
    .replace(/\.+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function extractWebsiteEntries(links = [], baseUrl = 'https://www.hao123.com/') {
  const unique = new Map();

  for (const link of links) {
    const absoluteUrl = resolveToAbsoluteUrl(link?.href, baseUrl);
    if (!absoluteUrl) {
      continue;
    }

    try {
      const parsed = new URL(absoluteUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        continue;
      }

      const hostname = parsed.hostname.toLowerCase();
      if (!hostname || hostname.includes('hao123.com')) {
        continue;
      }

      if (!unique.has(hostname)) {
        unique.set(hostname, {
          host: hostname,
          url: `${parsed.protocol}//${parsed.host}/`,
          title: (link?.title || '').trim() || hostname
        });
      }
    } catch {
      // Ignore invalid URLs
    }
  }

  return Array.from(unique.values()).sort((a, b) => a.host.localeCompare(b.host));
}

export function collectInternalHao123Links(links = [], baseUrl = 'https://www.hao123.com/') {
  const internal = new Set();

  for (const link of links) {
    const absoluteUrl = resolveToAbsoluteUrl(link?.href, baseUrl);
    if (!absoluteUrl) {
      continue;
    }

    try {
      const parsed = new URL(absoluteUrl);
      const hostname = parsed.hostname.toLowerCase();
      if (!hostname.includes('hao123.com')) {
        continue;
      }

      parsed.hash = '';
      internal.add(parsed.toString());
    } catch {
      // Ignore invalid URLs
    }
  }

  return Array.from(internal);
}

export function buildSiteConfig(entry) {
  const name = sanitizeHostToName(entry.host);

  return {
    name: `hao123-${name}`,
    seedUrls: [entry.url],
    urlRules: {
      include: [`^https?://([a-z0-9-]+\\.)*${entry.host.replace(/\./g, '\\.')}(/.*)?$`],
      exclude: [
        '.*\\.(jpg|jpeg|png|gif|svg|webp|ico|pdf|zip|rar|7z)$',
        '.*(logout|signout|register|signup).*'
      ]
    },
    login: {
      required: false,
      username: '',
      password: '',
      loginUrl: ''
    },
    crawler: {
      headless: true,
      timeout: 30000,
      waitBetweenRequests: 300,
      maxRetries: 2,
      batchSize: 10
    },
    output: {
      directory: './output',
      format: 'markdown',
      storage: {
        type: 'file'
      }
    },
    metadata: {
      source: 'hao123.com',
      title: entry.title
    }
  };
}
