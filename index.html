"""
Colliers PropCMA — PDF Report Generator
Generates a Track Record-style CMA PDF from JSON property data.
Usage: python3 generate_cma.py <data.json> <output.pdf>

data.json format:
{
  "report_title": "Comparable Market Analysis",
  "generated": "23 June 2026",
  "subject_address": "14 Leeds Street, Hornby",
  "subject_sqm": 1200,
  "indicated_value": 3408000,
  "adjusted_psm": 2840,
  "adjustments": {"size": 0, "age": 2, "location": -1},
  "gmaps_key": "AIza...",   // optional — for Street View thumbnails
  "stats": {
    "count": 5,
    "median_psm": 2840,
    "psm_min": 2200,
    "psm_max": 3500,
    "median_price": 3200000,
    "avg_sqm": 1150,
    "price_min": 1800000,
    "price_max": 5200000
  },
  "properties": [
    {
      "address": "14 Leeds St, Hornby",
      "sale_date": "Mar 2024",
      "category": "Industrial",
      "lease_or_sale": "Sale",
      "sqm": 1820,
      "price_per_sqm": 2308,
      "sale_price": 4200000,
      "broker": "Will Franks; Mike Lough",
      "initial_yield": 5.4,
      "annual_rent": 226800
    }
  ]
}
"""

import sys, json, io, os, urllib.request, urllib.parse
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white, black
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from PIL import Image

# ── Brand colours ─────────────────────────────────────────────
NAVY   = HexColor('#003865')
BLUE   = HexColor('#0E7AC4')
LGREY  = HexColor('#F2F5F8')
MGREY  = HexColor('#D6E4EF')
DGREY  = HexColor('#6B7A8D')
WHITE  = white
BLACK  = black
YELLOW = HexColor('#F5D000')
CYAN   = HexColor('#00C4D4')
RED    = HexColor('#E8002D')
CARD_BG= HexColor('#F7FAFE')

W, H = A4  # 595.27 x 841.89 pts

LOGO_COVER = '/home/claude/colliers_logo_cover.jpg'
LOGO_SMALL = '/home/claude/colliers_logo_small.jpg'

# ── Helpers ───────────────────────────────────────────────────
def fmt_price(n):
    if n is None: return '—'
    if n >= 1_000_000: return f'${n/1_000_000:.2f}M'.rstrip('0').rstrip('.')+'M' if n%1_000_000 else f'${int(n//1_000_000)}M'
    if n >= 1_000: return f'${int(round(n/1000))}k'
    return f'${int(n):,}'

def fmt_num(n):
    if n is None: return '—'
    return f'{int(round(n)):,}'

def fmt_psm(n):
    if n is None: return '—'
    return f'${int(round(n)):,}'

def draw_logo_strip(c, x, y, w, h_strip):
    """Draw the Colliers logo box with spectrum stripes."""
    # Blue box
    c.setFillColor(BLUE)
    c.roundRect(x, y, w, h_strip, 3, fill=1, stroke=0)
    # Spectrum stripe bar underneath — 3 equal segments
    stripe_h = 3
    stripe_y = y - stripe_h
    sw = w / 3
    for i, col in enumerate([YELLOW, CYAN, RED]):
        c.setFillColor(col)
        c.rect(x + i*sw, stripe_y, sw, stripe_h, fill=1, stroke=0)

def draw_colliers_text(c, x, cy, size=11, color=WHITE):
    """Draw 'Colliers' wordmark text centred on cy."""
    c.setFont('Helvetica-Bold', size)
    c.setFillColor(color)
    c.drawCentredString(x, cy - size*0.35, 'Colliers')

def footer(c, page_num, total_pages):
    """Draw the navy footer bar with Colliers mark."""
    fh = 22
    fy = 0
    c.setFillColor(NAVY)
    c.rect(0, fy, W, fh, fill=1, stroke=0)
    # Logo mark
    lw, lh = 38, 13
    lx, ly = 12, fy + (fh-lh)/2
    draw_logo_strip(c, lx, ly + 3, lw, lh)
    draw_colliers_text(c, lx + lw/2, ly + 3 + lh/2, size=7)
    # colliers.co.nz
    c.setFont('Helvetica', 7)
    c.setFillColor(HexColor('#B8D9F0'))
    c.drawString(lx + lw + 6, fy + 8, 'colliers.co.nz')
    # Confidential
    c.drawCentredString(W/2, fy + 8, 'Confidential — for client use only')
    # Page number
    c.drawRightString(W - 14, fy + 8, f'Page {page_num} of {total_pages}')

def header_bar(c, title=''):
    """Top navy band for inner pages."""
    bh = 36
    c.setFillColor(NAVY)
    c.rect(0, H - bh, W, bh, fill=1, stroke=0)
    # Small logo
    lw, lh = 44, 14
    lx, ly = 14, H - bh + (bh-lh-3)/2
    draw_logo_strip(c, lx, ly + 3, lw, lh)
    draw_colliers_text(c, lx + lw/2, ly + 3 + lh/2, size=8)
    # Page title
    if title:
        c.setFont('Helvetica', 8)
        c.setFillColor(HexColor('#93C5E8'))
        c.drawString(lx + lw + 8, H - bh + bh/2 - 3, title)

def fetch_streetview(address, api_key, size='200x130'):
    """Download a Street View Static thumbnail. Returns PIL Image or None."""
    if not api_key or not address:
        return None
    try:
        q = urllib.parse.quote(address)
        url = f'https://maps.googleapis.com/maps/api/streetview?size={size}&fov=80&location={q}&key={api_key}'
        with urllib.request.urlopen(url, timeout=5) as r:
            data = r.read()
        img = Image.open(io.BytesIO(data)).convert('RGB')
        # Check it's not a grey 'no image' response (very low variance)
        import statistics
        pixels = list(img.getdata())
        reds = [p[0] for p in pixels[::10]]
        if len(reds) > 10 and statistics.stdev(reds) < 8:
            return None  # Probably the grey placeholder
        return img
    except Exception:
        return None

def pil_to_rl(pil_img):
    """Convert PIL image to ReportLab ImageReader."""
    buf = io.BytesIO()
    pil_img.save(buf, 'JPEG', quality=82)
    buf.seek(0)
    return ImageReader(buf)

def draw_stat_box(c, x, y, w, h, label, value, sub=''):
    """Draw a single stat card."""
    c.setFillColor(CARD_BG)
    c.roundRect(x, y, w, h, 4, fill=1, stroke=0)
    c.setStrokeColor(MGREY)
    c.setLineWidth(0.5)
    c.roundRect(x, y, w, h, 4, fill=0, stroke=1)
    # Left accent bar
    c.setFillColor(BLUE)
    c.rect(x, y, 3, h, fill=1, stroke=0)
    # Label
    c.setFont('Helvetica', 7)
    c.setFillColor(DGREY)
    c.drawString(x + 9, y + h - 13, label.upper())
    # Value
    c.setFont('Helvetica-Bold', 14)
    c.setFillColor(NAVY)
    c.drawString(x + 9, y + h - 28, value)
    if sub:
        c.setFont('Helvetica', 7)
        c.setFillColor(DGREY)
        c.drawString(x + 9, y + 7, sub)

def draw_property_card(c, x, y, cw, ch, prop, api_key):
    """Draw a single property card (photo + details)."""
    img_h = ch * 0.52
    # Card background
    c.setFillColor(WHITE)
    c.roundRect(x, y, cw, ch, 4, fill=1, stroke=0)
    c.setStrokeColor(MGREY)
    c.setLineWidth(0.5)
    c.roundRect(x, y, cw, ch, 4, fill=0, stroke=1)

    # Photo area
    photo_y = y + ch - img_h
    c.setFillColor(LGREY)
    c.roundRect(x, photo_y, cw, img_h, 4, fill=1, stroke=0)
    # Clip image to top of card (rounded corner only at top)
    c.rect(x, photo_y, cw, img_h - 4, fill=1, stroke=0)

    # Try Street View
    sv = fetch_streetview(prop.get('address', ''), api_key)
    if sv:
        # Crop to card proportions
        tw, th = sv.size
        target_ratio = cw / img_h
        if tw / th > target_ratio:
            new_w = int(th * target_ratio)
            left = (tw - new_w) // 2
            sv = sv.crop((left, 0, left + new_w, th))
        else:
            new_h = int(tw / target_ratio)
            top = (th - new_h) // 3  # crop from top-third for best framing
            sv = sv.crop((0, top, tw, top + new_h))
        rl_img = pil_to_rl(sv)
        c.drawImage(rl_img, x, photo_y, width=cw, height=img_h,
                    preserveAspectRatio=False, mask='auto')
    else:
        # Placeholder with map pin icon
        c.setFont('Helvetica', 20)
        c.setFillColor(MGREY)
        c.drawCentredString(x + cw/2, photo_y + img_h/2 - 8, '📍')
        c.setFont('Helvetica', 7)
        c.setFillColor(DGREY)
        c.drawCentredString(x + cw/2, photo_y + img_h/2 - 22, 'No image available')

    # Category pill
    cat = prop.get('category', '')
    if cat:
        pill_w = len(cat) * 5.2 + 10
        pill_x = x + cw - pill_w - 5
        pill_y = photo_y + img_h - 16
        c.setFillColor(NAVY)
        c.roundRect(pill_x, pill_y, pill_w, 12, 3, fill=1, stroke=0)
        c.setFont('Helvetica-Bold', 6.5)
        c.setFillColor(WHITE)
        c.drawCentredString(pill_x + pill_w/2, pill_y + 3.5, cat.upper())

    # L/S badge
    ls = prop.get('lease_or_sale', '')
    if ls:
        ls_col = HexColor('#166534') if ls == 'Sale' else HexColor('#854d0e')
        ls_bg  = HexColor('#dcfce7') if ls == 'Sale' else HexColor('#fef9c3')
        lw2 = len(ls) * 5.5 + 10
        c.setFillColor(ls_bg)
        c.roundRect(x + 5, photo_y + img_h - 16, lw2, 12, 3, fill=1, stroke=0)
        c.setFont('Helvetica-Bold', 6.5)
        c.setFillColor(ls_col)
        c.drawCentredString(x + 5 + lw2/2, photo_y + img_h - 12.5, ls)

    # Text area
    text_y = y + ch - img_h - 4
    pad = 7

    # Address
    addr = prop.get('address', '—')
    max_chars = int(cw / 4.2)
    if len(addr) > max_chars:
        # split at comma or truncate
        parts = addr.split(',')
        line1 = parts[0].strip()
        line2 = ','.join(parts[1:]).strip() if len(parts) > 1 else ''
    else:
        line1 = addr
        line2 = ''

    c.setFont('Helvetica-Bold', 7.5)
    c.setFillColor(NAVY)
    c.drawString(x + pad, text_y - 10, line1)
    if line2:
        c.setFont('Helvetica', 6.5)
        c.setFillColor(DGREY)
        c.drawString(x + pad, text_y - 20, line2)
        text_y -= 10

    # Divider
    c.setStrokeColor(MGREY)
    c.setLineWidth(0.4)
    c.line(x + pad, text_y - 26, x + cw - pad, text_y - 26)

    # Price (large)
    price = prop.get('sale_price')
    c.setFont('Helvetica-Bold', 11)
    c.setFillColor(NAVY)
    c.drawString(x + pad, text_y - 40, fmt_price(price))

    # Key metrics row
    metrics_y = text_y - 52
    sqm = prop.get('sqm')
    psm = prop.get('price_per_sqm')
    yield_ = prop.get('initial_yield')
    date = prop.get('sale_date', '')

    items = []
    if sqm: items.append(('SQM', fmt_num(sqm)))
    if psm:  items.append(('$/m²', fmt_psm(psm)))
    if yield_: items.append(('Yield', f'{yield_:.1f}%'))

    col_w = (cw - pad*2) / max(len(items), 1) if items else cw
    for i, (lbl, val) in enumerate(items[:3]):
        mx = x + pad + i * col_w
        c.setFont('Helvetica', 5.5)
        c.setFillColor(DGREY)
        c.drawString(mx, metrics_y, lbl.upper())
        c.setFont('Helvetica-Bold', 7)
        c.setFillColor(NAVY)
        c.drawString(mx, metrics_y - 9, val)

    # Date + broker at bottom
    bottom_y = y + 6
    c.setFont('Helvetica', 6)
    c.setFillColor(DGREY)
    broker = prop.get('broker', '')
    if broker and len(broker) > 28:
        broker = broker[:26] + '…'
    info = f'{date}' + (f'  ·  {broker}' if broker else '')
    c.drawString(x + pad, bottom_y, info)


# ── Main report builder ───────────────────────────────────────

def build_report(data, output_path):
    props = data.get('properties', [])
    stats = data.get('stats', {})
    api_key = data.get('gmaps_key', '')
    title = data.get('report_title', 'Comparable Market Analysis')
    gen_date = data.get('generated', '')
    subject = data.get('subject_address', '')
    subject_sqm = data.get('subject_sqm')
    indicated = data.get('indicated_value')
    adj_psm = data.get('adjusted_psm')

    # Count pages: 1 cover + 1 summary + N grid pages (3 cols x 2 rows = 6 per page)
    per_page = 6
    grid_pages = max(1, -(-len(props) // per_page))  # ceiling div
    total_pages = 2 + grid_pages

    c = canvas.Canvas(output_path, pagesize=A4)
    c.setTitle(title)
    c.setAuthor('Colliers Christchurch')

    # ── PAGE 1: COVER ─────────────────────────────────────────
    # Full navy left panel
    panel_w = W * 0.52
    c.setFillColor(NAVY)
    c.rect(0, 0, panel_w, H, fill=1, stroke=0)

    # Spectrum stripe accent at bottom of panel
    stripe_h = 8
    sw = panel_w / 3
    for i, col in enumerate([YELLOW, CYAN, RED]):
        c.setFillColor(col)
        c.rect(i * sw, 0, sw, stripe_h, fill=1, stroke=0)

    # Colliers logo on cover
    logo_w, logo_h = 120, 68
    logo_x = 30
    logo_y = H - 100
    if os.path.exists(LOGO_COVER):
        c.drawImage(LOGO_COVER, logo_x, logo_y, width=logo_w, height=logo_h,
                    preserveAspectRatio=True, mask='auto')

    # Cover title
    c.setFillColor(WHITE)
    c.setFont('Helvetica-Bold', 32)
    c.drawString(30, H - 220, 'Comparable')
    c.setFont('Helvetica', 32)
    c.drawString(30, H - 258, 'Market Analysis')

    # Thin rule
    c.setStrokeColor(BLUE)
    c.setLineWidth(1.5)
    c.line(30, H - 278, panel_w - 30, H - 278)

    # Subtitle
    c.setFont('Helvetica-Bold', 9)
    c.setFillColor(WHITE)
    c.drawString(30, H - 298, gen_date)
    c.setFont('Helvetica', 9)
    c.setFillColor(HexColor('#93C5E8'))
    c.drawString(30, H - 312, 'Christchurch, New Zealand')

    # Subject property block
    if subject:
        box_y = H - 420
        c.setFillColor(HexColor('#0A4A7A'))
        c.roundRect(20, box_y, panel_w - 40, 80, 4, fill=1, stroke=0)
        c.setFont('Helvetica', 7)
        c.setFillColor(HexColor('#93C5E8'))
        c.drawString(30, box_y + 65, 'SUBJECT PROPERTY')
        c.setFont('Helvetica-Bold', 9)
        c.setFillColor(WHITE)
        # Wrap address
        words = subject.split()
        line, lines = '', []
        for w in words:
            test = line + ' ' + w if line else w
            if len(test) * 5.5 < panel_w - 60:
                line = test
            else:
                lines.append(line); line = w
        if line: lines.append(line)
        for i, l in enumerate(lines[:2]):
            c.drawString(30, box_y + 50 - i*14, l)
        if subject_sqm:
            c.setFont('Helvetica', 8)
            c.setFillColor(HexColor('#93C5E8'))
            c.drawString(30, box_y + 10, f'{fmt_num(subject_sqm)} m²  floor area')

    # Indicated value block
    if indicated:
        iv_y = H - 540
        c.setFillColor(BLUE)
        c.roundRect(20, iv_y, panel_w - 40, 80, 4, fill=1, stroke=0)
        c.setFont('Helvetica', 7)
        c.setFillColor(HexColor('#B8D9F0'))
        c.drawString(30, iv_y + 65, 'INDICATED VALUE')
        c.setFont('Helvetica-Bold', 20)
        c.setFillColor(WHITE)
        c.drawString(30, iv_y + 38, fmt_price(indicated))
        if adj_psm:
            c.setFont('Helvetica', 8)
            c.setFillColor(HexColor('#B8D9F0'))
            c.drawString(30, iv_y + 20, f'at {fmt_psm(adj_psm)}/m²')
        if subject_sqm:
            c.setFont('Helvetica', 7)
            c.drawString(30, iv_y + 8, f'× {fmt_num(subject_sqm)} m²  subject area')

    # Stats on cover
    n = stats.get('count', len(props))
    c.setFont('Helvetica', 8)
    c.setFillColor(HexColor('#B8D9F0'))
    c.drawString(30, 120, f'{n} comparable {"sale" if n == 1 else "sales"} analysed')

    # Right panel — abstract photo background feel
    c.setFillColor(HexColor('#E8F2FA'))
    c.rect(panel_w, 0, W - panel_w, H, fill=1, stroke=0)

    # Large stat on right panel
    right_cx = panel_w + (W - panel_w) / 2
    c.setFillColor(BLUE)
    c.setFont('Helvetica-Bold', 38)
    med_psm = stats.get('median_psm')
    if med_psm:
        c.drawCentredString(right_cx, H/2 + 40, fmt_psm(med_psm))
        c.setFont('Helvetica', 12)
        c.setFillColor(DGREY)
        c.drawCentredString(right_cx, H/2 + 18, 'Median $/m²')

    c.setFillColor(NAVY)
    c.setFont('Helvetica-Bold', 24)
    if n:
        c.drawCentredString(right_cx, H/2 - 30, str(n))
        c.setFont('Helvetica', 10)
        c.setFillColor(DGREY)
        c.drawCentredString(right_cx, H/2 - 50, 'Comparable sales')

    # Footer on cover
    footer(c, 1, total_pages)
    c.showPage()

    # ── PAGE 2: MARKET SUMMARY ────────────────────────────────
    header_bar(c, 'Market Summary')

    # Page title
    c.setFont('Helvetica-Bold', 18)
    c.setFillColor(NAVY)
    c.drawString(20, H - 65, 'Market Summary')
    c.setFont('Helvetica', 8)
    c.setFillColor(DGREY)
    c.drawString(20, H - 80, f'{n} comparable properties  ·  {gen_date}')

    # Thin rule
    c.setStrokeColor(BLUE)
    c.setLineWidth(1.5)
    c.line(20, H - 88, W - 20, H - 88)

    # STAT CARDS — two rows of 3
    stat_data = [
        ('Comparables', str(n), ''),
        ('Median $/m²', fmt_psm(stats.get('median_psm')), ''),
        ('$/m² Range', f'{fmt_psm(stats.get("psm_min"))} – {fmt_psm(stats.get("psm_max"))}', ''),
        ('Median Price', fmt_price(stats.get('median_price')), ''),
        ('Avg Floor Area', f'{fmt_num(stats.get("avg_sqm"))} m²', ''),
        ('Price Range', f'{fmt_price(stats.get("price_min"))} – {fmt_price(stats.get("price_max"))}', ''),
    ]
    card_margin = 20
    card_gap = 8
    cols = 3
    card_w = (W - card_margin*2 - card_gap*(cols-1)) / cols
    card_h = 52
    row1_y = H - 160
    row2_y = row1_y - card_h - card_gap

    for i, (lbl, val, sub) in enumerate(stat_data):
        col = i % cols
        row = i // cols
        cx = card_margin + col * (card_w + card_gap)
        cy = row1_y - row * (card_h + card_gap)
        draw_stat_box(c, cx, cy, card_w, card_h, lbl, val, sub)

    # Indicated value band
    iv_y = row2_y - 70
    c.setFillColor(NAVY)
    c.roundRect(20, iv_y, W - 40, 52, 4, fill=1, stroke=0)
    c.setFont('Helvetica', 7)
    c.setFillColor(HexColor('#93C5E8'))
    c.drawString(30, iv_y + 40, 'INDICATED VALUE — SUBJECT PROPERTY')
    c.setFont('Helvetica-Bold', 18)
    c.setFillColor(WHITE)
    c.drawString(30, iv_y + 16, fmt_price(indicated) if indicated else '—')
    if adj_psm and subject_sqm:
        c.setFont('Helvetica', 9)
        c.setFillColor(HexColor('#B8D9F0'))
        c.drawString(120, iv_y + 20, f'at {fmt_psm(adj_psm)}/m²  ×  {fmt_num(subject_sqm)} m²  subject area')
    if subject:
        c.setFont('Helvetica', 8)
        c.setFillColor(HexColor('#93C5E8'))
        c.drawRightString(W - 30, iv_y + 20, subject)

    # Adjustments table
    adjs = data.get('adjustments', {})
    if adjs:
        adj_y = iv_y - 30
        c.setFont('Helvetica-Bold', 9)
        c.setFillColor(NAVY)
        c.drawString(20, adj_y, 'Valuation Adjustments')
        c.setStrokeColor(BLUE)
        c.setLineWidth(1.5)
        c.line(20, adj_y - 5, W - 20, adj_y - 5)

        base_psm = stats.get('median_psm', 0)
        row_y = adj_y - 22
        row_h = 22
        labels = {'size': 'Size adjustment', 'age': 'Age / condition', 'location': 'Location / zoning'}
        running = base_psm

        # Header
        for col_x, col_lbl in [(20,'Factor'),(200,'Base'),(310,'Adjustment'),(420,'Adjusted $/m²')]:
            c.setFont('Helvetica-Bold', 7)
            c.setFillColor(DGREY)
            c.drawString(col_x, row_y + 6, col_lbl.upper())
        row_y -= row_h

        # Base row
        c.setFillColor(LGREY)
        c.rect(20, row_y, W-40, row_h, fill=1, stroke=0)
        c.setFont('Helvetica-Bold', 8)
        c.setFillColor(NAVY)
        c.drawString(25, row_y + 7, 'Base $/m²')
        c.drawString(200, row_y + 7, fmt_psm(base_psm))
        c.drawString(310, row_y + 7, '—')
        c.drawString(420, row_y + 7, fmt_psm(base_psm))
        row_y -= row_h

        for key, lbl in labels.items():
            pct = adjs.get(key, 0)
            running = running * (1 + pct/100)
            c.setFont('Helvetica', 8)
            c.setFillColor(NAVY)
            c.drawString(25, row_y + 7, lbl)
            c.drawString(200, row_y + 7, '—')
            pct_str = f'+{pct:.1f}%' if pct >= 0 else f'{pct:.1f}%'
            c.setFillColor(HexColor('#166534') if pct > 0 else HexColor('#991b1b') if pct < 0 else DGREY)
            c.drawString(310, row_y + 7, pct_str)
            c.setFillColor(NAVY)
            c.drawString(420, row_y + 7, fmt_psm(running))
            c.setStrokeColor(MGREY)
            c.setLineWidth(0.3)
            c.line(20, row_y, W-20, row_y)
            row_y -= row_h

    # Disclaimer
    c.setFont('Helvetica', 6)
    c.setFillColor(DGREY)
    disc = ('The opinions, estimates and information given herein are made by Colliers in their best judgement. '
            'This is not intended to substitute for individual professional advice. Sourced from available market data, approximate only. $NZD.')
    c.drawString(20, 30, disc[:110])
    c.drawString(20, 22, disc[110:])

    footer(c, 2, total_pages)
    c.showPage()

    # ── PAGES 3+: PROPERTY GRID ──────────────────────────────
    cols = 3
    rows = 2
    per_page = cols * rows
    gm = 16   # grid margin
    gap = 8   # gap between cards
    header_h = 52
    footer_h = 24
    available_h = H - header_h - footer_h - gm*2
    available_w = W - gm*2
    card_w = (available_w - gap*(cols-1)) / cols
    card_h = (available_h - gap*(rows-1)) / rows

    for pg_idx in range(grid_pages):
        page_num = pg_idx + 3
        page_props = props[pg_idx * per_page : (pg_idx+1) * per_page]

        header_bar(c, f'Comparable Sales — page {pg_idx + 1}')

        # Section label
        c.setFont('Helvetica-Bold', 14)
        c.setFillColor(NAVY)
        c.drawString(gm, H - header_h - 18, 'Comparable Sales')
        c.setStrokeColor(BLUE)
        c.setLineWidth(1.5)
        c.line(gm, H - header_h - 24, W - gm, H - header_h - 24)

        grid_top = H - header_h - 34

        for i, prop in enumerate(page_props):
            col = i % cols
            row = i // cols
            cx = gm + col * (card_w + gap)
            cy = grid_top - (row + 1) * card_h - row * gap
            draw_property_card(c, cx, cy, card_w, card_h, prop, api_key)

        footer(c, page_num, total_pages)
        c.showPage()

    c.save()
    print(f'✓ Report saved: {output_path}')


# ── CLI entry point ───────────────────────────────────────────
if __name__ == '__main__':
    if len(sys.argv) < 3:
        print('Usage: python3 generate_cma.py <data.json> <output.pdf>')
        sys.exit(1)
    with open(sys.argv[1]) as f:
        data = json.load(f)
    build_report(data, sys.argv[2])
