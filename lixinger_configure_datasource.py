#!/usr/bin/env python3
"""
configure_datasource.py - Configure datasource reference files for specific stocks

Usage: python configure_datasource.py <exchange> <stock_code> <stock_name> [code_id] [output_dir]

Configure datasource reference files for specific stock analysis.

Arguments:
    exchange      Exchange code: sh, sz, bj, hk, us, nasdaq, nyse
    stock_code    Stock code (e.g., 600519, 000858, INTC, NVDA)
    stock_name    Stock Chinese name (e.g., 贵州茅台, 英特尔)
    code_id       For US stocks: code_id from parser (e.g., 5086300, 104581000)
                  For CN/HK stocks: optional (calculated from code)
    output_dir    Optional output directory

Example:
    # Chinese stock
    python configure_datasource.py sh 600519 贵州茅台

    # US stock (with code_id)
    python configure_datasource.py nasdaq NVDA 英伟达 104581000
    python configure_datasource.py nasdaq INTC 英特尔 5086300

Output:
    Generates datasource_config.json with configured URLs and settings for the specified stock.
    For US stocks, URLs use code_id instead of short_code.

URL Format:
    CN/HK: https://www.lixinger.com/analytics/company/detail/{exchange}/{code}/{short_code}/...
            HK {code} is zero-padded to 5 digits (9633 → hk/09633/9633)
    US:     https://www.lixinger.com/analytics/company/detail/{exchange}/{code}/{code_id}/...
"""

import json
import sys
import os
from pathlib import Path
from datetime import datetime, timezone


def show_help():
    """Display help information."""
    print("""
Usage: python configure_datasource.py <exchange> <stock_code> <stock_name> [code_id] [output_dir]

Arguments:
    exchange      Exchange code: sh, sz, bj, hk, us, nasdaq, nyse
    stock_code    Stock code (e.g., 600519, INTC, NVDA)
    stock_name    Stock Chinese name (e.g., 贵州茅台, 英特尔)
    code_id       For US stocks: code_id from parser (e.g., 5086300, 104581000)
                  For CN/HK stocks: optional (calculated from code)
    output_dir    Optional output directory

Example:
    python configure_datasource.py sh 600519 贵州茅台
    python configure_datasource.py nasdaq NVDA 英伟达 104581000

URL Format:
    CN/HK: https://www.lixinger.com/analytics/company/detail/{exchange}/{code}/{short_code}/...
            HK {code} is zero-padded to 5 digits (9633 → hk/09633/9633)
    US:     https://www.lixinger.com/analytics/company/detail/{exchange}/{code}/{code_id}/...
""")
    sys.exit(0)


def validate_inputs(exchange, stock_code, stock_name):
    """Validate input parameters."""
    valid_exchanges = ['sh', 'sz', 'bj', 'hk', 'us', 'nasdaq', 'nyse', 'nasdaqglobal', 'nasdaqgm', 'nasdaqcm', 'nasdaqgs']
    
    if exchange not in valid_exchanges:
        print(f"Error: Invalid exchange '{exchange}'. Must be one of: {', '.join(valid_exchanges)}", file=sys.stderr)
        sys.exit(1)
    
    if not stock_code:
        print("Error: stock_code cannot be empty", file=sys.stderr)
        sys.exit(1)
    
    if not stock_name:
        print("Error: stock_name cannot be empty", file=sys.stderr)
        sys.exit(1)


def get_url_code(exchange, stock_code):
    """
    Determine the {code} segment used in Lixinger URLs.

    - HK: zero-padded to 5 digits (9633 → 09633). Lixinger requires
      hk/09633/9633 — an unpadded code (hk/9633/9633) makes the data API
      return 404 while the crawler still exits 0, leaving URL-only stub files.
    - All other markets: code as given.
    """
    if exchange == 'hk' and stock_code.isdigit():
        return str(int(stock_code)).zfill(5)
    return stock_code


def get_short_code(exchange, stock_code):
    """
    Determine short_code based on exchange.
    
    - SH and BJ: short_code same as code
    - SZ and HK: drop leading zeros
    - US markets (nasdaq, nyse, etc.): same as code (but URLs use code_id)
    """
    if exchange in ['sh', 'bj', 'us', 'nasdaq', 'nyse', 'nasdaqglobal', 'nasdaqgm', 'nasdaqcm', 'nasdaqgs']:
        return stock_code
    elif exchange in ['sz', 'hk']:
        # Remove leading zeros
        return str(int(stock_code))
    else:
        return stock_code


def get_url_code_id(exchange, stock_code, code_id=None):
    """
    Determine the code_id to use in URLs.
    
    For US stocks: use code_id from parser (e.g., 5086300, 104581000)
    For CN/HK stocks: use short_code (calculated from code)
    
    Examples:
    - US: nasdaq/NVDA/104581000 (uses code_id from parser)
    - US: nasdaq/INTC/5086300 (uses code_id from parser)
    - SH: sh/600519/600519 (uses short_code)
    - SZ: sz/000858/858 (uses short_code)
    """
    us_exchanges = ['us', 'nasdaq', 'nyse', 'nasdaqglobal', 'nasdaqgm', 'nasdaqcm', 'nasdaqgs']
    
    if exchange in us_exchanges:
        # For US stocks, use code_id from parser
        if code_id is None:
            raise ValueError(f"code_id is required for US stocks (exchange: {exchange})")
        return code_id
    else:
        # For CN/HK stocks, use short_code
        return get_short_code(exchange, stock_code)


def clean_url(url):
    """Fix double slashes in URL path (e.g., lixinger.com//analytics -> lixinger.com/analytics)."""
    # Only fix // in the path portion, not in https://
    parts = url.split('://', 1)
    if len(parts) == 2:
        parts[1] = parts[1].replace('//', '/')
    return '://'.join(parts)


def generate_urls(template, exchange, code, url_code_id, endpoints):
    """
    Generate URLs for given endpoints.
    
    Args:
        template: URL template with {market}, {code}, {short_code} placeholders
        exchange: Market code (sh, sz, bj, hk, us)
        code: Full stock code
        url_code_id: code_id to use in URL (code_id for US, short_code for CN/HK)
        endpoints: List of URL path endpoints to append
    
    Returns:
        List of full URLs
    """
    base_url = clean_url(template.format(market=exchange, code=code, short_code=url_code_id))
    urls = []
    
    for endpoint in endpoints:
        if endpoint:
            url = clean_url(f"{base_url}/{endpoint}")
        else:
            url = base_url
        urls.append(url)
    
    return urls


def load_reference_files(reference_dir):
    """Load reference JSON files."""
    finance_path = reference_dir / 'lixinger-finance.json'
    fundamental_path = reference_dir / 'lixinger-foundmental.json'
    
    if not finance_path.exists():
        print(f"Error: {finance_path} not found", file=sys.stderr)
        sys.exit(1)
    
    if not fundamental_path.exists():
        print(f"Error: {fundamental_path} not found", file=sys.stderr)
        sys.exit(1)
    
    with open(finance_path, 'r', encoding='utf-8') as f:
        finance_ref = json.load(f)
    
    with open(fundamental_path, 'r', encoding='utf-8') as f:
        fundamental_ref = json.load(f)
    
    return finance_ref, fundamental_ref


def configure_datasource(exchange, stock_code, stock_name, output_dir, code_id=None):
    """
    Configure datasource for a specific stock.
    
    Args:
        exchange: Exchange code
        stock_code: Stock code
        stock_name: Stock Chinese name
        output_dir: Output directory for reports
        code_id: For US stocks, code_id from parser (e.g., 5086300)
    """
    short_code = get_short_code(exchange, stock_code)
    url_code_id = get_url_code_id(exchange, stock_code, code_id)
    # HK: canonicalize the code itself to 5 digits (9633 → 09633) so URLs,
    # include-regexes and the stock block all use the padded form.
    stock_code = get_url_code(exchange, stock_code)
    
    print(f"Configuring datasource for: {stock_name} ({exchange}/{stock_code})")
    print(f"Short code: {short_code}")
    if code_id:
        print(f"Code ID (for URLs): {code_id}")
    
    # Create output directory
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    # Get script directory
    script_dir = Path(__file__).resolve().parent  # templates + config live next to this script
    reference_dir = script_dir / 'reference'
    
    # Load reference files
    finance_ref, fundamental_ref = load_reference_files(reference_dir)
    
    # Define endpoints
    finance_endpoints = [
        'bs', 'ps', 'cfs', 'is', 'm', 'operation-revenue-constitution'
    ]
    
    fundamental_endpoints = [
        '',  # Base URL
        'fundamental/valuation',
        'fundamental/valuation/primary',
        'fundamental/valuation/other',
        'fundamental/valuation/band',
        'fundamental/custom-chart',
        'fundamental/safety',
        'fundamental/profit',
        'fundamental/growth',
        'fundamental/cashflow',
        'fundamental/operation-capability',
        'fundamental/costs',
        'fundamental/per-capita',
        'fundamental/asset',
        'fundamental/debt',
        'fundamental/surplus-reinvestment-rate',
        'fundamental/peg',
        'fundamental/dcf'
    ]
    
    # Generate configured URLs (use url_code_id for US stocks, short_code for CN/HK)
    finance_urls = generate_urls(
        finance_ref['urlTemplate'],
        exchange,
        stock_code,
        url_code_id,  # Use code_id for US, short_code for CN/HK
        finance_endpoints
    )
    
    fundamental_urls = generate_urls(
        fundamental_ref['urlTemplate'],
        exchange,
        stock_code,
        url_code_id,  # Use code_id for US, short_code for CN/HK
        fundamental_endpoints
    )
    
    # Build finance config
    finance_config = {
        'name': 'lixinger-finance',
        'stock': {
            'exchange': exchange,
            'code': stock_code,
            'short_code': short_code,
            'code_id': code_id if code_id else short_code,  # Store code_id for US stocks
            'name': stock_name
        },
        'urlTemplate': finance_ref['urlTemplate'],
        'marketFormats': finance_ref['marketFormats'],
        'seedUrls': finance_urls,
        'urlRules': {
            'include': [
                f".*lixinger\\.com/analytics/company/detail/{exchange}/{stock_code}/{url_code_id}/(bs|ps|cfs|is|m|operation-revenue-constitution).*"
            ],
            'exclude': finance_ref['urlRules']['exclude']
        },
        'login': finance_ref['login'],
        'crawler': finance_ref['crawler'],
        'output': {
            'directory': str(output_dir),
            'format': finance_ref['output']['format'],
            'savePages': finance_ref['output']['savePages']
        }
    }
    
    # Build fundamental config
    fundamental_config = {
        'name': 'lixinger-fundmental',
        'stock': {
            'exchange': exchange,
            'code': stock_code,
            'short_code': short_code,
            'code_id': code_id if code_id else short_code,  # Store code_id for US stocks
            'name': stock_name
        },
        'urlTemplate': fundamental_ref['urlTemplate'],
        'marketFormats': fundamental_ref['marketFormats'],
        'seedUrls': fundamental_urls,
        'urlRules': {
            'include': [
                f".*lixinger\\.com/analytics/company/detail/{exchange}/{stock_code}/{url_code_id}/fundamental/.*"
            ],
            'exclude': fundamental_ref['urlRules']['exclude']
        },
        'login': fundamental_ref['login'],
        'crawler': fundamental_ref['crawler'],
        'output': {
            'directory': str(output_dir),
            'format': fundamental_ref['output']['format'],
            'savePages': fundamental_ref['output']['savePages']
        }
    }
    
    # Build combined config
    config = {
        'meta': {
            'version': '1.0',
            'generated_at': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
            'stock': {
                'exchange': exchange,
                'code': stock_code,
                'short_code': short_code,
                'code_id': code_id if code_id else short_code,
                'name': stock_name
            }
        },
        'finance': finance_config,
        'fundamental': fundamental_config
    }
    
    # Write main config file
    config_path = script_dir / 'config' / 'datasource_config.json'
    config_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(config_path, 'w', encoding='utf-8') as f:
        json.dump(config, f, indent=2, ensure_ascii=False)
    
    print(f"✓ Configuration written to: {config_path}")
    
    # Write configured files to output directory (these are what the crawler reads)
    with open(output_path / 'lixinger-finance.json', 'w', encoding='utf-8') as f:
        json.dump(finance_config, f, indent=2, ensure_ascii=False)
    
    with open(output_path / 'lixinger-foundmental.json', 'w', encoding='utf-8') as f:
        json.dump(fundamental_config, f, indent=2, ensure_ascii=False)
    
    # Print summary
    print(f"\n📊 Configuration Summary:")
    print(f"  Exchange: {exchange}")
    print(f"  Stock Code: {stock_code}")
    print(f"  Short Code: {short_code}")
    print(f"  URL Code ID: {url_code_id}")
    if code_id:
        print(f"  Parser Code ID: {code_id} (for US stocks)")
    print(f"  Stock Name: {stock_name}")
    print(f"  Output Directory: {output_dir}")
    print(f"  Finance URLs: {len(finance_config['seedUrls'])}")
    print(f"  Fundamental URLs: {len(fundamental_config['seedUrls'])}")
    
    # Print sample URLs
    print(f"\nSample URLs:")
    if finance_urls:
        print(f"  Finance: {finance_urls[0]}")
    if fundamental_urls:
        print(f"  Fundamental: {fundamental_urls[0]}")
    
    return config


def main():
    """Main entry point."""
    # Check for help flag
    if len(sys.argv) > 1 and sys.argv[1] in ['-h', '--help']:
        show_help()
    
    # Check required arguments
    if len(sys.argv) < 4:
        print("Error: Missing required arguments", file=sys.stderr)
        show_help()
        sys.exit(1)
    
    exchange = sys.argv[1]
    stock_code = sys.argv[2]
    stock_name = sys.argv[3]
    
    # Parse optional code_id and output_dir
    # code_id is only for US stocks (numeric like 5086300, 104581000)
    # For CN/HK stocks, arg[4] is output_dir (starts with / or contains path separator)
    us_exchanges = ['us', 'nasdaq', 'nyse', 'nasdaqglobal', 'nasdaqgm', 'nasdaqcm', 'nasdaqgs']
    
    code_id = None
    output_dir = None
    
    if len(sys.argv) > 4:
        arg4 = sys.argv[4]
        if exchange in us_exchanges and arg4.isdigit():
            # US stock: arg4 is code_id
            code_id = arg4
            output_dir = sys.argv[5] if len(sys.argv) > 5 else None
        else:
            # CN/HK stock or explicit output_dir: arg4 is output_dir
            output_dir = arg4
    
    # Set default output directory
    if output_dir is None:
        output_dir = os.path.join(os.environ.get("IVI_REPORT_BASE", os.path.join(os.getcwd(), "report")), "analysis", exchange, f"{stock_code}_{stock_name}", "datasource")
    
    # Validate inputs
    validate_inputs(exchange, stock_code, stock_name)
    
    # Run configuration
    try:
        config = configure_datasource(exchange, stock_code, stock_name, output_dir, code_id)
        print(f"\n✓ Configuration complete!")
        print(f"  Config file: {Path(__file__).parent / 'config' / 'datasource_config.json'}")
        print(f"  Reference files copied to: {output_dir}")
        return 0
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return 1


if __name__ == '__main__':
    sys.exit(main())