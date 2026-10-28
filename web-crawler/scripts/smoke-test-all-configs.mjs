import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const rootDir = path.resolve(process.cwd());
const configDir = path.join(rootDir, 'config');
const tempDir = path.join(rootDir, '.tmp-smoke-configs');
const outputRoot = path.join(rootDir, 'output', 'smoke-all-configs');
const timeoutSeconds = Number(process.env.SMOKE_TIMEOUT_SECONDS || 45);

fs.mkdirSync(tempDir, { recursive: true });
fs.mkdirSync(outputRoot, { recursive: true });

const configFiles = fs
  .readdirSync(configDir)
  .filter((f) => f.endsWith('.json'))
  .sort();

const results = [];

for (const file of configFiles) {
  const configPath = path.join(configDir, file);
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const name = path.basename(file, '.json');
  const smokeOutputDir = `./output/smoke-all-configs/${name}`;

  config.name = `${config.name || name}-smoke`;
  config.output = config.output || {};
  config.output.directory = smokeOutputDir;
  config.crawler = {
    headless: true,
    timeout: Math.min(config?.crawler?.timeout || 30000, 30000),
    waitBetweenRequests: 0,
    maxRetries: 1,
    ignoreHTTPSErrors: true
  };

  const smokeConfigPath = path.join(tempDir, `${name}.json`);
  fs.writeFileSync(smokeConfigPath, JSON.stringify(config, null, 2));

  const cmd = `timeout ${timeoutSeconds}s node src/index.js ${smokeConfigPath}`;
  const startedAt = Date.now();
  const run = spawnSync('bash', ['-lc', cmd], {
    cwd: rootDir,
    encoding: 'utf-8',
    maxBuffer: 1024 * 1024 * 20
  });
  const durationSec = ((Date.now() - startedAt) / 1000).toFixed(1);

  const configOutputDir = path.join(outputRoot, name);
  const mdFiles = [];
  if (fs.existsSync(configOutputDir)) {
    const stack = [configOutputDir];
    while (stack.length > 0) {
      const current = stack.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) stack.push(fullPath);
        if (entry.isFile() && entry.name.endsWith('.md')) mdFiles.push(fullPath);
      }
    }
  }

  let markdownCheck = 'no_markdown';
  if (mdFiles.length > 0) {
    const sample = fs.readFileSync(mdFiles[0], 'utf-8');
    markdownCheck = /(^#\s)|(^##\s)|(^\|.+\|$)/m.test(sample) ? 'looks_like_markdown' : 'plain_text_only';
  }

  const timedOut = run.status === 124;
  const success = run.status === 0;

  results.push({
    config: file,
    exitCode: run.status,
    timedOut,
    success,
    durationSec,
    markdownFiles: mdFiles.length,
    markdownCheck,
    stdoutTail: (run.stdout || '').split('\n').slice(-12).join('\n'),
    stderrTail: (run.stderr || '').split('\n').slice(-12).join('\n')
  });

  console.log(`[${file}] exit=${run.status} timeout=${timedOut} md=${mdFiles.length} check=${markdownCheck} duration=${durationSec}s`);
}

const summaryPath = path.join(outputRoot, 'smoke-summary.json');
fs.writeFileSync(summaryPath, JSON.stringify({ timeoutSeconds, results }, null, 2));
console.log(`\nSummary saved to: ${summaryPath}`);
