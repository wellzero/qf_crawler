# Market URL Format Rules for Lixinger

## URL Template
```
https://www.lixinger.com//analytics/company/detail/{market}/{code}/{short_code}
```

## Market Formats

| Market | Example | Rule |
|--------|---------|------|
| HK | hk/00700/700 | code zero-padded to 5 digits; short_code drops leading zeros (9633 → hk/09633/9633) |
| CN SZ | sz/000858/858 | short_code drops leading zeros |
| CN SH | sh/600519/600519 | short_code same as code |
| CN BJ | bj/920111/920111 | short_code same as code |
| US | UNKNOWN | market and short_code must be searched at lixinger.com |

## Usage

Replace `{market}`, `{code}`, and `{short_code}` based on the exchange:
- SH/BJ stocks: short_code = code (full code)
- SZ stocks: short_code = code without leading zeros
- HK stocks: code = zero-padded to 5 digits (9633 → 09633), short_code =
  code without leading zeros (9633)
- US stocks: Must search lixinger.com to find market and short_code

## ⚠️ HK padding failure mode

An unpadded HK code (`hk/9633/9633`) makes the Lixinger data API return 404
while the crawler still exits 0 — parsers then write URL-only stub files and
the datasource verdict reads SUCCESS with no real data. The workflow script
normalizes HK codes automatically (`normalize_hk_code`); if a crawl produces
stub files, check the URL code segment first.
