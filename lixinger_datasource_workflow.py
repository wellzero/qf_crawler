#!/usr/bin/env python3
"""
datasource_workflow.py - Main workflow script for datasource agent

Executes the complete data download pipeline:
1. Parse market/code/code_id using lixinger-mkt-id-parser.js
2. Configure datasource files using configure_datasource.py
3. Download data using crawler (node src/index.js)

Usage:
    python datasource_workflow.py <stock_code> <stock_name> [output_dir]

Example:
    python datasource_workflow.py INTC 英特尔
    python datasource_workflow.py 600519 贵州茅台 /custom/output/path
"""

import json
import subprocess
import sys
import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from datetime import datetime, timezone

# IVI plugin: configurable locations (see plugin README)
CRAWLER_DIR = os.environ.get("IVI_CRAWLER_DIR", "/home/quant_volumn/qf_crawler/web-crawler")
REPORT_BASE = os.environ.get("IVI_REPORT_BASE", os.path.join(os.getcwd(), "report"))


def show_help():
    """Display help information."""
    help_text = """
Usage: python datasource_workflow.py <stock_code> <stock_name> <exchange> [output_dir]

Download comprehensive financial data from Lixinger for a stock.

Arguments:
    stock_code   Stock code (e.g., INTC, 600519, 000858, 0700)
    stock_name   Stock Chinese or English name (e.g., 英特尔, 贵州茅台)
    exchange     Exchange code: sh, sz, bj, hk, us, nasdaq, nyse
    output_dir   Optional output directory (auto-detected if not provided)

Exchange Codes:
    sh    - Shanghai Stock Exchange (CN)
    sz    - Shenzhen Stock Exchange (CN)
    bj    - Beijing Stock Exchange (CN)
    hk    - Hong Kong Stock Exchange
    us/nasdaq/nyse - US markets (uses parser to detect market)

Workflow:
    - For US stocks: Parse market/code/code_id using lixinger-mkt-id-parser.js
    - For CN/HK stocks: Calculate market/code/code_id using exchange rules
    - Configure datasource files
    - Download fundamental and financial data

Examples:
    # US stock (uses parser)
    python datasource_workflow.py INTC 英特尔 nasdaq
    python datasource_workflow.py AAPL 苹果 us

    # Chinese stocks (no parser needed)
    python datasource_workflow.py 600519 贵州茅台 sh
    python datasource_workflow.py 000858 五粮液 sz
    python datasource_workflow.py 920111 北交所 bj

    # Hong Kong stock (no parser needed; code is auto-padded to 5 digits,
    # e.g. 9633 → 09633, so URLs use hk/09633/9633 and the output folder
    # is analysis/hk/09633_农夫山泉/)
    python datasource_workflow.py 9633 农夫山泉 hk
    python datasource_workflow.py 0700 腾讯 hk

    # Custom output
    python datasource_workflow.py INTC 英特尔 nasdaq /tmp/output

Output:
    Data saved to: $IVI_REPORT_BASE/analysis/{exchange}/{code}_{name}/datasource/ (default ./report/...)
"""
    print(help_text)
    sys.exit(0)


def parse_stock_info_us(stock_code):
    """
    Use lixinger-mkt-id-parser.js to get market, code, and code_id for US stocks.

    Args:
        stock_code: Stock code to search (e.g., INTC, AAPL, MSFT)

    Returns:
        dict with 'market', 'code', 'code_id', 'url' or None if failed
    """
    parser_path = os.path.join(CRAWLER_DIR, "src", "parsers", "lixinger-mkt-id-parser.js")
    crawler_dir = CRAWLER_DIR

    if not os.path.exists(parser_path):
        print(f"Error: Parser not found at {parser_path}", file=sys.stderr)
        return None

    print(f"[Step 1/4] Parsing US stock info for: {stock_code}")

    try:
        result = subprocess.run(
            ["node", parser_path, stock_code],
            cwd=crawler_dir,
            capture_output=True,
            text=True,
            timeout=60
        )

        if result.returncode != 0:
            print(f"Error: Parser failed with code {result.returncode}", file=sys.stderr)
            print(f"stderr: {result.stderr}", file=sys.stderr)
            return None

        # Extract JSON from output (parser outputs logs + JSON at end)
        output_lines = result.stdout.strip().split('\n')
        json_str = None
        for i, line in enumerate(output_lines):
            if line.strip().startswith('{'):
                # Find the closing brace
                json_str = '\n'.join(output_lines[i:])
                break

        if not json_str:
            print(f"Error: No JSON found in parser output", file=sys.stderr)
            print(f"Output: {result.stdout}", file=sys.stderr)
            return None

        # Parse JSON output
        stock_info = json.loads(json_str)

        print(f"  ✓ Market: {stock_info.get('market')}")
        print(f"  ✓ Code: {stock_info.get('code')}")
        print(f"  ✓ Code ID: {stock_info.get('code_id')}")

        return stock_info

    except subprocess.TimeoutExpired:
        print("Error: Parser timeout", file=sys.stderr)
        return None
    except json.JSONDecodeError as e:
        print(f"Error: Failed to parse parser output: {e}", file=sys.stderr)
        print(f"Output: {result.stdout}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return None


def normalize_hk_code(stock_code):
    """
    Zero-pad a numeric HK code to 5 digits, the format Lixinger requires
    in its URL code segment (9633 → 09633, 0700 → 00700).

    Lixinger URLs are {market}/{code}/{short_code}: for HK the {code} segment
    MUST be the 5-digit zero-padded form (hk/09633/9633). An unpadded code
    (hk/9633/9633) makes the data API return 404 while the crawler still
    exits 0 and parsers write URL-only stub files — a false SUCCESS.

    Non-numeric codes are returned unchanged.
    """
    if stock_code.isdigit():
        return str(int(stock_code)).zfill(5)
    return stock_code


def parse_stock_info_cn_hk(exchange, stock_code):
    """
    Generate market, code, and code_id for Chinese and HK stocks.

    Rules (per Lixinger format):
    - SH: short_code same as code, code_id = code (600519 → 600519/600519)
    - SZ: short_code drops leading zeros, code_id = short_code (000858 → 000858/858)
    - BJ: short_code same as code, code_id = code (920111 → 920111/920111)
    - HK: code zero-padded to 5 digits, short_code/code_id drop leading zeros
          (9633 → 09633/9633; 0700 → 00700/700)

    Args:
        exchange: Exchange code (sh, sz, bj, hk)
        stock_code: Stock code (e.g., 600519, 000858, 920111, 9633)

    Returns:
        dict with 'market', 'code', 'code_id', 'url'
    """
    print(f"[Step 1/4] Parsing CN/HK stock info for: {stock_code}")

    # Determine short_code and code_id based on exchange rules
    if exchange in ['sh', 'bj']:
        # SH and BJ: short_code = code_id = code (same)
        short_code = stock_code
        code_id = stock_code
    elif exchange in ['sz', 'hk']:
        if exchange == 'hk':
            # HK URLs need the 5-digit zero-padded code segment (hk/09633/9633)
            stock_code = normalize_hk_code(stock_code)
        # SZ and HK: short_code = code_id, drops leading zeros
        short_code = str(int(stock_code))
        code_id = short_code
    else:
        raise ValueError(f"Unsupported exchange: {exchange}")

    # Build URL: {market}/{code}/{code_id}
    url = f"https://www.lixinger.com/analytics/company/detail/{exchange}/{stock_code}/{code_id}"

    stock_info = {
        'market': exchange,
        'code': stock_code,
        'code_id': code_id,
        'url': url
    }

    print(f"  ✓ Market: {exchange}")
    print(f"  ✓ Code: {stock_code}")
    print(f"  ✓ Code ID: {code_id}")
    print(f"  ✓ URL: {url}")

    return stock_info


def configure_datasource(market, code, stock_name, output_dir, code_id=None):
    """
    Use lixinger_configure_datasource.py to generate config files.

    Args:
        market: Market code (nasdaq, nyse, sh, sz, etc.)
        code: Stock code
        stock_name: Stock name
        output_dir: Output directory
        code_id: For US stocks, code_id from parser (e.g., 5086300, 104581000)

    Returns:
        True if successful, False otherwise
    """
    config_script = str(Path(__file__).resolve().parent / "lixinger_configure_datasource.py")

    if not os.path.exists(config_script):
        print(f"Error: Config script not found at {config_script}", file=sys.stderr)
        return False

    print(f"[Step 2/4] Configuring datasource files")

    # Build command with optional code_id
    cmd = ["python3", config_script, market, code, stock_name]
    if code_id:
        cmd.append(code_id)
    cmd.append(output_dir)

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30
        )

        if result.returncode != 0:
            print(f"Error: Config script failed with code {result.returncode}", file=sys.stderr)
            print(f"stdout: {result.stdout}", file=sys.stderr)
            print(f"stderr: {result.stderr}", file=sys.stderr)
            return False

        print(f"  ✓ Configuration complete")
        return True

    except subprocess.TimeoutExpired:
        print("Error: Config script timeout", file=sys.stderr)
        return False
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return False


def set_profile_dir(config_path, profile_name):
    """
    Point a generated config at its own Chrome profile dir so concurrent
    crawler processes don't fight over the shared ./chrome_user_data lock.

    Profile dir: <CRAWLER_DIR>/chrome_user_data_<profile_name><suffix>, where
    suffix comes from LXG_PROFILE_SUFFIX (set by lxg_finance_download.py to
    give each parallel worker its own pair of profiles). Profiles persist
    across runs, so the login only happens on first use.
    """
    with open(config_path, 'r', encoding='utf-8') as f:
        cfg = json.load(f)
    suffix = os.environ.get("LXG_PROFILE_SUFFIX", "")
    profile_dir = os.path.join(CRAWLER_DIR, f"chrome_user_data_{profile_name}{suffix}")
    cfg.setdefault('crawler', {})['userDataDir'] = profile_dir
    with open(config_path, 'w', encoding='utf-8') as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)


def download_crawler_data(config_path, data_type):
    """
    Run crawler to download data using config file.

    Args:
        config_path: Path to config file (lixinger-foundmental.json or lixinger-finance.json)
        data_type: Type label for logging (e.g., "Fundamental", "Financial")

    Returns:
        True if successful, False otherwise
    """
    crawler_dir = CRAWLER_DIR
    crawler_script = "src/index.js"

    if not os.path.exists(os.path.join(crawler_dir, crawler_script)):
        print(f"Error: Crawler not found at {crawler_dir}/{crawler_script}", file=sys.stderr)
        return False

    print(f"[Step {data_type}] Downloading {data_type} data")

    try:
        result = subprocess.run(
            ["node", crawler_script, config_path],
            cwd=crawler_dir,
            capture_output=True,
            text=True,
            timeout=1800  # 30 min per part (fundamental has 17 pages; parallel runs are throttled by the server)
        )

        if result.returncode != 0:
            print(f"  ⚠ Crawler returned code {result.returncode}", file=sys.stderr)
            # Don't fail immediately - check output
            if "Error" in result.stdout or "Error" in result.stderr:
                print(f"  stderr: {result.stderr}", file=sys.stderr)
                return False
            # Some non-zero codes might be partial success
            return True

        print(f"  ✓ {data_type} data downloaded")
        return True

    except subprocess.TimeoutExpired:
        print(f"  ⚠ Crawler timeout for {data_type}", file=sys.stderr)
        return False
    except Exception as e:
        print(f"  ⚠ Error: {e}", file=sys.stderr)
        return False



def generate_metadata(output_dir, stock_info, results):
    """
    Generate metadata.json with download results.

    Args:
        output_dir: Output directory
        stock_info: dict with market, code, code_id, url
        results: dict with download results for each type
    """
    metadata = {
        "version": "1.0",
        "generated_at": datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
        "stock": {
            "market": stock_info.get('market'),
            "code": stock_info.get('code'),
            "code_id": stock_info.get('code_id'),
            "url": stock_info.get('url')
        },
        "downloads": {
            "fundamental": {
                "status": "success" if results.get('fundamental') else "failed",
                "config_path": os.path.join(output_dir, "lixinger-foundmental.json")
            },
            "finance": {
                "status": "success" if results.get('finance') else "failed",
                "config_path": os.path.join(output_dir, "lixinger-finance.json")
            }
        },
        "overall_status": "success" if all(results.values()) else "partial" if any(results.values()) else "failed"
    }

    metadata_path = os.path.join(output_dir, "metadata.json")
    with open(metadata_path, 'w', encoding='utf-8') as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)

    print(f"[Step 4/4] Generated metadata.json")


def main():
    """Main workflow execution."""
    # Check for help flag
    if len(sys.argv) > 1 and sys.argv[1] in ['-h', '--help']:
        show_help()

    # Check required arguments
    if len(sys.argv) < 4:
        print("Error: Missing required arguments", file=sys.stderr)
        show_help()
        sys.exit(1)

    stock_code = sys.argv[1]
    stock_name = sys.argv[2]
    exchange = sys.argv[3].lower()
    output_dir = sys.argv[4] if len(sys.argv) > 4 else None

    # Canonicalize the HK code to 5 digits up front so the output folder
    # ({code}_{name} → 09633_农夫山泉), skip-logic, configs and report all
    # agree with the Lixinger URL format (hk/09633/9633).
    if exchange == 'hk':
        stock_code = normalize_hk_code(stock_code)

    print("=" * 60)
    print("Lixinger Data Download Workflow")
    print("=" * 60)
    print(f"Stock: {stock_name} ({stock_code})")
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    # Define exchange lists early
    us_exchanges = ['us', 'nasdaq', 'nyse', 'nasdaqglobal', 'nasdaqgm', 'nasdaqcm', 'nasdaqgs']

    # Step 0: Check if datasource.md already exists (data previously downloaded)
    if output_dir is None:
        # Determine output_dir early for the check
        _market_guess = exchange
        if exchange in us_exchanges:
            _market_guess = 'us'  # will be refined later by parser
        output_dir = os.path.join(REPORT_BASE, "analysis", _market_guess, f"{stock_code}_{stock_name}", "datasource")

    datasource_report = os.path.join(os.path.dirname(output_dir), "datasource.md")
    if os.path.exists(datasource_report):
        with open(datasource_report, 'r', encoding='utf-8') as f:
            content = f.read()
        if 'Verdict: SUCCESS' in content or 'Verdict: PARTIAL' in content:
            print(f"✅ datasource.md exists with previous download (SUCCESS/PARTIAL). Skipping crawl.")
            print(f"Report: {datasource_report}")
            sys.exit(0)
        else:
            print(f"⚠️ datasource.md exists but status is not SUCCESS/PARTIAL. Re-downloading...")
    else:
        print(f"ℹ️ No datasource.md found. Proceeding with download...")

    # Reset output_dir since it was set early for the check
    output_dir = sys.argv[4] if len(sys.argv) > 4 else None

    # Step 1: Parse stock info
    # Determine if we need to use parser (US stocks) or calculate (CN/HK stocks)
    
    if exchange in us_exchanges:
        # US stock: use parser
        stock_info = parse_stock_info_us(stock_code)
    elif exchange in ['sh', 'sz', 'bj', 'hk']:
        # Chinese/HK stock: calculate without parser
        stock_info = parse_stock_info_cn_hk(exchange, stock_code)
    elif exchange is None:
        # No exchange provided - try parser first (might be US stock)
        print("[Warning] No exchange provided, assuming US stock and using parser")
        stock_info = parse_stock_info_us(stock_code)
        if stock_info:
            exchange = stock_info.get('market')
        else:
            print("\n❌ FAILED: Could not parse stock information")
            print("Verdict: FAILED")
            sys.exit(1)
    else:
        print(f"Error: Unsupported exchange '{exchange}'", file=sys.stderr)
        print("Verdict: FAILED")
        sys.exit(1)
    if not stock_info:
        print("\n❌ FAILED: Could not parse stock information")
        print("Verdict: FAILED")
        sys.exit(1)

    market = stock_info.get('market')
    code = stock_info.get('code')
    code_id = stock_info.get('code_id')

    # Determine output directory
    if output_dir is None:
        output_dir = os.path.join(REPORT_BASE, "analysis", market, f"{code}_{stock_name}", "datasource")

    # Create output directory
    os.makedirs(output_dir, exist_ok=True)
    print(f"  ✓ Output directory: {output_dir}\n")

    # Re-check datasource.md with resolved output_dir (handles US stock market from parser)
    datasource_report = os.path.join(os.path.dirname(output_dir), "datasource.md")
    if os.path.exists(datasource_report):
        with open(datasource_report, 'r', encoding='utf-8') as f:
            content = f.read()
        if 'Verdict: SUCCESS' in content or 'Verdict: PARTIAL' in content:
            print(f"✅ datasource.md exists with previous download. Skipping crawl.")
            sys.exit(0)

    # Step 2: Configure datasource files
    # Pass code_id for US stocks, None for CN/HK stocks
    code_id_param = code_id if market in ['us', 'nasdaq', 'nyse', 'nasdaqglobal', 'nasdaqgm', 'nasdaqcm', 'nasdaqgs'] else None
    config_ok = configure_datasource(market, code, stock_name, output_dir, code_id_param)
    if not config_ok:
        print("\n❌ FAILED: Could not configure datasource files")
        print("Verdict: FAILED")
        sys.exit(1)

    # Step 3: Download fundamental + financial data
    fundamental_config = os.path.join(output_dir, "lixinger-foundmental.json")
    finance_config = os.path.join(output_dir, "lixinger-finance.json")
    for cfg_path in (fundamental_config, finance_config):
        if not os.path.exists(cfg_path):
            print(f"\n❌ FAILED: Config file not found: {cfg_path}")
            print("Verdict: FAILED")
            sys.exit(1)

    # 两者写各自的 projectDir/state DB (<output_dir>/lixinger-foundmental 与
    # lixinger-finance), 文件无交集, 可并行; 只需各自独立的 Chrome profile。
    # 设 LXG_SERIAL=1 可退回串行 (如账号不允许并发会话)。
    set_profile_dir(fundamental_config, "foundmental")
    set_profile_dir(finance_config, "finance")

    if os.environ.get("LXG_SERIAL") == "1":
        fundamental_ok = download_crawler_data(fundamental_config, "3a/Fundamental")
        finance_ok = download_crawler_data(finance_config, "3b/Financial")
    else:
        with ThreadPoolExecutor(max_workers=2) as pool:
            fut_fundamental = pool.submit(download_crawler_data, fundamental_config, "3a/Fundamental")
            fut_finance = pool.submit(download_crawler_data, finance_config, "3b/Financial")
            fundamental_ok = fut_fundamental.result()
            finance_ok = fut_finance.result()

    # Step 4: Generate metadata
    results = {
        'fundamental': fundamental_ok,
        'finance': finance_ok
    }
    generate_metadata(output_dir, stock_info, results)

    # Write datasource.md report
    report_dir = os.path.dirname(output_dir)
    datasource_report = os.path.join(report_dir, "datasource.md")
    if all(results.values()):
        verdict = "SUCCESS"
    elif any(results.values()):
        verdict = "PARTIAL"
    else:
        verdict = "FAILED"

    report_content = f"""# Datasource Report - {stock_name} ({stock_code})

**Exchange:** {market}
**Code:** {code}
**Code ID:** {code_id}
**Date:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

## Status: {verdict}

## Download Results
- Fundamental data: {'✅ Success' if fundamental_ok else '❌ Failed'}
- Financial data: {'✅ Success' if finance_ok else '❌ Failed'}

## Data Locations
- `datasource/lixinger-finance/data/` (CSV)
- `datasource/lixinger-fundmental/data/` (CSV)

## Verdict: {verdict}
"""
    with open(datasource_report, 'w', encoding='utf-8') as f:
        f.write(report_content)
    print(f"  ✓ Written: {datasource_report}")

    # Final verdict
    print("=" * 60)
    if all(results.values()):
        print("✅ SUCCESS: All data downloaded successfully")
        print("Verdict: SUCCESS")
        print(f"\nData saved to: {output_dir}")
        sys.exit(0)
    elif any(results.values()):
        print("⚠️ PARTIAL: Some data downloaded successfully")
        print(f"  - Fundamental: {'✓' if fundamental_ok else '✗'}")
        print(f"  - Financial: {'✓' if finance_ok else '✗'}")
        print("Verdict: PARTIAL")
        print(f"\nData saved to: {output_dir}")
        sys.exit(0)
    else:
        print("❌ FAILED: Could not download any data")
        print("Verdict: FAILED")
        sys.exit(1)


if __name__ == '__main__':
    sys.exit(main())
