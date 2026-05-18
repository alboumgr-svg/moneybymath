import os
import math
import datetime
import pandas as pd
import numpy as np
from flask import Flask, jsonify, render_template, request, send_from_directory, make_response
from flask_cors import CORS
from flask_talisman import Talisman
import requests
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

# Allow requests from your site. In production replace "*" with your domain,
# e.g. CORS(app, origins=["https://moneybymath.com"])
CORS(app, origins=["https://moneybymath.com"])

# Initialize Talisman
# We configure the CSP to allow Google Ads, fonts, and inline styles (which your setup relies on)
csp = {
    'default-src': ["'self'"],

    'script-src': [
        "'self'",
        "'unsafe-inline'",
        "https://*.googlesyndication.com",
        "https://*.googleadservices.com",
        "https://*.google.com",
        "https://*.gstatic.com",
        "https://*.adtrafficquality.google",
        "https://cdnjs.cloudflare.com",
        "https://moneybymath.disqus.com",
        "https://disqus.com",
    ],

    'style-src': [
        "'self'",
        "'unsafe-inline'",
        "https://fonts.googleapis.com",
    ],

    'font-src': [
        "'self'",
        "https://fonts.gstatic.com",
    ],

    'img-src': [
        "'self'",
        "data:",
        "https://*.googlesyndication.com",
        "https://*.googleusercontent.com",
        "https://*.adtrafficquality.google",
        "https://*.gstatic.com",
        "https://*.disqus.com",
        "https://*.disquscdn.com",
    ],

    'frame-src': [
        "'self'",
        "https://*.doubleclick.net",
        "https://*.googlesyndication.com",
        "https://*.google.com",
        "https://*.adtrafficquality.google",
        "https://disqus.com",            
        "https://*.disqus.com",              
    ],

    'connect-src': [
        "'self'",
        "https://*.google.com",
        "https://*.doubleclick.net",
        "https://*.googlesyndication.com",
        "https://*.adtrafficquality.google",
        "https://cdnjs.cloudflare.com",
        "https://csi.gstatic.com",
    ],

    # Add Trusted Types directives
    'require-trusted-types-for': ["'script'"],
}

Talisman(app, 
    content_security_policy=csp, 
    force_https=True,
    strict_transport_security=True,
    strict_transport_security_preload=True,
    strict_transport_security_max_age=31536000, # 1 year
    strict_transport_security_include_subdomains=True
)
CORS(app, origins=["https://moneybymath.com"])

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/stock-analysis")
def stock_analysis():
    return render_template("stock-analysis.html")

@app.route("/afford-house")
def afford_house():
    return render_template("afford-house.html")

@app.route("/options-wheel")
def options_wheel():
    return render_template("options-wheel.html")

@app.route("/coast-fire")
def coast_fire():
    return render_template("coast-fire.html")

@app.route("/rent-vs-buy")
def rent_vs_buy():
    return render_template("rent-vs-buy.html")

@app.route("/compound-interest")
def compound_interest():
    return render_template("compound-interest.html")

@app.route("/drip")
def drip():
    return render_template("drip.html")

@app.route("/debt-payoff")
def debt_payoff():
    return render_template("debt-payoff.html")

@app.route("/retirement")
def retirement():
    return render_template("retirement.html")

@app.route("/car-cost")
def car_cost():
    return render_template("car-cost.html")

@app.route("/kids-future")
def kids_future():
    return render_template("kids-future.html")

@app.route("/loan-from-401k")
def loan_from_401k():
    return render_template("loan-from-401k.html")

@app.route("/federal-tax")
def federal_tax():
    return render_template("federal-tax.html")

@app.route("/mortgage-calculator")
def mortgage_calculator():
    return render_template("mortgage-calculator.html")

@app.route("/budget")
def budget():
    return render_template("budget.html")

@app.route("/financial-health-check")
def healthCheck():
    return render_template("financial-health-check.html")

@app.route("/newsletter")
def newsletter():
    return render_template("newsletter.html", article=LATEST_ARTICLE)

@app.route("/ads.txt")
def ads():
    return send_from_directory(app.root_path, "ads.txt", mimetype="text/plain")

@app.route("/sitemap.xml")
def sitemap():
    # List of all your static calculator endpoints
    pages = [
        "/", "/stock-analysis", "/afford-house", "/options-wheel", 
        "/coast-fire", "/rent-vs-buy", "/compound-interest", "/drip", 
        "/debt-payoff", "/retirement", "/car-cost", "/kids-future", 
        "/loan-from-401k", "/federal-tax", "/mortgage-calculator", 
        "/budget", "/financial-health-check", "/newsletter"
    ]
    
    xml = ['<?xml version="1.0" encoding="UTF-8"?>']
    xml.append('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    
    for page in pages:
        xml.append('  <url>')
        xml.append(f'    <loc>https://moneybymath.com{page}</loc>')
        xml.append('    <changefreq>weekly</changefreq>')
        # Give slightly higher priority to the index and core tools
        priority = "1.0" if page == "/" else "0.8"
        xml.append(f'    <priority>{priority}</priority>')
        xml.append('  </url>')
        
    xml.append('</urlset>')
    
    response = make_response('\n'.join(xml))
    response.headers["Content-Type"] = "application/xml"
    return response

@app.after_request
def add_security_headers(response):
    # Prevents other domains from opening your site in a popup and retaining a window reference
    response.headers['Cross-Origin-Opener-Policy'] = 'same-origin'
    
    # Protects against cross-origin leaks. 
    # NOTE: If Google Ads break, change 'credentialless' to 'unsafe-none' or remove this header.
    response.headers['Cross-Origin-Embedder-Policy'] = 'credentialless'
    
    return response

# ── Edit this every week ──────────────────────────────────────────────────────
LATEST_ARTICLE = {
    "title": "5 Mistakes to Avoid When Starting the Wheel Strategy",
    "date": "Apr 8, 2026",
    "read_time": "5 min read",
    "intro": "When I first started running the wheel strategy, I made several costly mistakes that ate into my returns. After two years of consistent execution, I've identified the five most common pitfalls that beginners face - and how to avoid them.",
    "sections": [
        {
            "heading": "1. Choosing High IV Stocks Without Understanding Why",
            "body": "Yes, high implied volatility means juicy premiums. But there's usually a reason a stock has elevated IV - it's risky. I learned this the hard way with a biotech stock that tanked 40% overnight on failed trial results. Now I only wheel stocks I'd be genuinely happy to own long-term."
        },
        {
            "heading": "2. Not Leaving Room for the Unexpected",
            "body": "Using all your capital on a single position leaves zero flexibility. When a better opportunity arose, I couldn't take advantage because I was fully deployed. Keep at least 20-30% in cash reserves to handle assignments and capitalize on volatility spikes."
        },
        {
            "heading": "3. Going Too Far Out of the Money on Puts",
            "body": "Selling puts at super low strikes feels safe, but the premiums are tiny and your return on capital suffers. I found the sweet spot is typically 5-10% below current price - enough premium to make it worthwhile, while staying within range of quality stocks I want to own."
        },
        {
            "heading": "4. Panicking and Closing Early",
            "body": "When a trade goes against you, the temptation to close early and take the loss is strong. But remember, the wheel strategy assumes you'll sometimes get assigned - that's not failure, that's the system working. Unless the fundamental thesis has changed, let the strategy play out."
        },
        {
            "heading": "5. Ignoring Earnings and Ex-Dividend Dates",
            "body": "Selling options right before earnings is essentially gambling. The IV crush after earnings can work in your favor if you're selling, but the risk of a gap move isn't worth it. Similarly, be aware of ex-dividend dates that might trigger early assignment on short calls."
        },
    ],
    "closing": "The wheel strategy is powerful, but it requires discipline and patience. Avoid these five mistakes and you'll be well on your way to consistent options income."
}

# ─────────────────────────────────────────────────────────────────────────────
#  Shared helpers
# ─────────────────────────────────────────────────────────────────────────────

def safe(val):
    """Return val if it's a finite number, else None."""
    try:
        v = float(val)
        return v if math.isfinite(v) else None
    except (TypeError, ValueError):
        return None


def ema(series, period):
    """Exponential moving average."""
    return series.ewm(span=period, adjust=False).mean()

# ─────────────────────────────────────────────────────────────────────────────
#  Mortgage Rate Getter
# ─────────────────────────────────────────────────────────────────────────────

FRED_API_KEY = os.getenv("FRED_API_KEY")

_cached_rate = None
_cached_time = None

def get_latest_mortgage_rate():
    global _cached_rate, _cached_time

    if _cached_rate is not None and _cached_time is not None:
        elapsed = (datetime.datetime.now() - _cached_time).total_seconds()
        if elapsed < 86400:
            return _cached_rate

    try:
        url = f"https://api.stlouisfed.org/fred/series/observations?series_id=MORTGAGE30US&api_key={FRED_API_KEY}&file_type=json&sort_order=desc&limit=5"
        
        res = requests.get(url, timeout=5)
        res.raise_for_status()
        data = res.json()

        observations = data.get("observations", [])

        # Find first valid numeric value
        rate = None
        for obs in observations:
            val = obs.get("value", "")
            try:
                rate = float(val)
                break
            except:
                continue

        if rate is None:
            return _cached_rate

        _cached_rate = rate
        _cached_time = datetime.datetime.now()

        return rate

    except Exception as e:
        #print("Mortgage rate fetch error:", e)
        return _cached_rate

@app.route("/api/mortgage-rate")
def mortgage_rate():
    rate = get_latest_mortgage_rate()

    if rate is None:
        return jsonify({
            "rate": 6.5,   # fallback
            "fallback": True
        })

    return jsonify({
        "rate": round(rate, 2),
        "fallback": False
    })

# ─────────────────────────────────────────────────────────────────────────────
#  Health check
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/health")
def health():
    return jsonify({"status": "ok"})

# ─────────────────────────────────────────────────────────────────────────────
#  Privacy Policy Page
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/privacy")
def privacy():
    return render_template("privacy.html")

# ─────────────────────────────────────────────────────────────────────────────
#  Context Processors
# ─────────────────────────────────────────────────────────────────────────────
SEO_DATA = {
    "/": {
        "title": "MoneyByMath - New Age Financial Tools",
        "desc": "Free financial calculators and tools for the new age - Coast FIRE, Renting vs Buying, and more."
    },
    "/options-wheel": {
        "title": "Options Wheel Strategy Calculator | MoneyByMath",
        "desc": "Master the covered call and cash-secured put strategy with interactive premium modeling tools."
    },
    "/coast-fire": {
        "title": "Coast FIRE Calculator | MoneyByMath",
        "desc": "Calculate when you can stop saving and let your current investments compound to retirement."
    },
    "/stock-analysis": {
        "title": "Stock Analysis & Valuation Tool | MoneyByMath",
        "desc": "Analyze stock metrics, compound growth scenarios, and fundamental asset valuation metrics cleanly."
    },
    "/afford-house": {
        "title": "Home Affordability Calculator | MoneyByMath",
        "desc": "Determine how much house you can safely afford based on income, debt, down payments, and rates."
    },
    "/rent-vs-buy": {
        "title": "Rent vs Buy a House Calculator | MoneyByMath",
        "desc": "Compare the long-term net worth impact of renting vs buying a home, factoring in opportunity costs."
    },
    "/compound-interest": {
        "title": "Compound Interest Calculator | MoneyByMath",
        "desc": "Visualize investment growth models with dynamic compounding timelines, contributions, and inflation."
    },
    "/drip": {
        "title": "DRIP Calculator (Dividend Reinvestment) | MoneyByMath",
        "desc": "Model the wealth acceleration of Dividend Reinvestment Plans using custom yields and growth rates."
    },
    "/debt-payoff": {
        "title": "Debt Payoff Calculator (Snowball & Avalanche) | MoneyByMath",
        "desc": "Compare structural debt payoff methods to map out your absolute fastest mathematical path to zero."
    },
    "/retirement": {
        "title": "Retirement & Financial Independence Calculator | MoneyByMath",
        "desc": "Project your financial freedom timeline, total nest egg target, and safe withdrawal rate boundaries."
    },
    "/car-cost": {
        "title": "True Cost of Car Ownership Calculator | MoneyByMath",
        "desc": "Calculate the hidden lifecycle cost of owning a vehicle, including depreciation and interest math."
    },
    "/kids-future": {
        "title": "Child's Financial Future & College Calculator | MoneyByMath",
        "desc": "Plan custodial accounts, 529 plans, and long-term generational compound growth goals for minors."
    },
    "/loan-from-401k": {
        "title": "401(k) Loan Modeling Calculator | MoneyByMath",
        "desc": "Evaluate the exact opportunity costs and interest mechanics of borrowing money out of your 401(k)."
    },
    "/federal-tax": {
        "title": "Federal Income Tax Calculator | MoneyByMath",
        "desc": "Estimate your take-home pay, effective tax rates, and marginal bracket breakdowns using modern IRS limits."
    },
    "/mortgage-calculator": {
        "title": "Advanced Mortgage & Amortization Calculator | MoneyByMath",
        "desc": "Generate custom amortization schedules and interest payment calculations with real mortgage baselines."
    },
    "/budget": {
        "title": "Data-Driven Budget Planning Tool | MoneyByMath",
        "desc": "Optimize cash flow with allocations like the 50/30/20 rule to actively maximize your personal savings rate."
    },
    "/financial-health-check": {
        "title": "Financial Health & Net Worth Audit | MoneyByMath",
        "desc": "Run a comprehensive technical checkup on your savings rate, emergency runway, and debt ratios."
    },
    "/newsletter": {
        "title": "MoneyByMath Newsletter & Financial Insights",
        "desc": "Deep dives into quantitative finance concepts, strategic options writing, and microeconomic indicators."
    },
    "/privacy": {
        "title": "Privacy Policy | MoneyByMath",
        "desc": "Review how we safeguard your information. MoneyByMath operates purely client-side and retains zero PII."
    }
}

@app.context_processor
def inject_global_template_data():
    # 1. Determine if ads/analytics are active globally
    is_prod = os.environ.get("SHOW_ADS", "false").lower() == "true"
    
    # 2. Extract current request endpoint safely to fall back to root configuration if mismatched
    path = request.path
    seo = SEO_DATA.get(path, SEO_DATA["/"])
    
    # 3. Formulate the dynamic target canonical URL
    current_url = f"https://moneybymath.com{path if path != '/' else ''}"
    
    # Returns everything required by base.html in a single pass
    return dict(
        IS_PROD=is_prod,
        SEO_TITLE=seo["title"],
        SEO_DESC=seo["desc"],
        CURRENT_URL=current_url
    )

# ─────────────────────────────────────────────────────────────────────────────
#  MAIN FUNCITON
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True, ssl_context='adhoc')