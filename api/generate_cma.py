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

# Official Colliers logo (270x154 PNG, embedded so no external file is needed)
_LOGO_B64 = ('iVBORw0KGgoAAAANSUhEUgAAAQ4AAACaCAYAAABYMaZEAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAyZpVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADw/eHBhY2tldCBiZWdpbj0i77u/IiBpZD0iVzVNME1wQ2VoaUh6cmVTek5UY3prYzlkIj8+IDx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IkFkb2JlIFhNUCBDb3JlIDUuNi1jMTQ1IDc5LjE2MzQ5OSwgMjAxOC8wOC8xMy0xNjo0MDoyMiAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIiB4bWxuczp4bXBNTT0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21tLyIgeG1sbnM6c3RSZWY9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZVJlZiMiIHhtcDpDcmVhdG9yVG9vbD0iQWRvYmUgUGhvdG9zaG9wIENDIDIwMTkgKFdpbmRvd3MpIiB4bXBNTTpJbnN0YW5jZUlEPSJ4bXAuaWlkOkI4MzFBMDRERjlDMDExRTk4QkFCQzJCRDJFMDYxRjZEIiB4bXBNTTpEb2N1bWVudElEPSJ4bXAuZGlkOkI4MzFBMDRFRjlDMDExRTk4QkFCQzJCRDJFMDYxRjZEIj4gPHhtcE1NOkRlcml2ZWRGcm9tIHN0UmVmOmluc3RhbmNlSUQ9InhtcC5paWQ6QjgzMUEwNEJGOUMwMTFFOThCQUJDMkJEMkUwNjFGNkQiIHN0UmVmOmRvY3VtZW50SUQ9InhtcC5kaWQ6QjgzMUEwNENGOUMwMTFFOThCQUJDMkJEMkUwNjFGNkQiLz4gPC9yZGY6RGVzY3JpcHRpb24+IDwvcmRmOlJERj4gPC94OnhtcG1ldGE+IDw/eHBhY2tldCBlbmQ9InIiPz6IbN9NAAAnP0lEQVR42uxd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')
_LOGO_AR = 270 / 154  # width / height

def _logo_reader():
    import base64
    return ImageReader(io.BytesIO(base64.b64decode(_LOGO_B64)))

_LOGO_IMG = _logo_reader()

def draw_logo_img(c, x, y, h):
    """Draw the official Colliers logo at height h (width follows aspect ratio)."""
    w = h * _LOGO_AR
    c.drawImage(_LOGO_IMG, x, y, width=w, height=h, mask='auto')
    return w

# ── Helpers ───────────────────────────────────────────────────
def fmt_price(n):
    if n is None: return '—'
    if n >= 1_000_000:
        if n % 1_000_000 == 0:
            return f'${int(n // 1_000_000)}M'
        s = f'{n / 1_000_000:.2f}'.rstrip('0').rstrip('.')
        return f'${s}M'
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
    # Logo mark — official Colliers logo
    lh = 16
    lx, ly = 12, fy + (fh - lh) / 2
    lw = draw_logo_img(c, lx, ly, lh)
    # Licence line
    lic = 'South Island Commercial Limited - Licensed under the REAA 2008'
    c.setFillColor(HexColor('#B8D9F0'))
    c.setFont('Helvetica', 6.5)
    c.drawString(lx + lw + 6, fy + 8, lic)
    lic_end = lx + lw + 6 + c.stringWidth(lic, 'Helvetica', 6.5)
    # Page number
    c.setFont('Helvetica', 7)
    pg = f'Page {page_num} of {total_pages}'
    c.drawRightString(W - 14, fy + 8, pg)
    pg_start = W - 14 - c.stringWidth(pg, 'Helvetica', 7)
    # Confidential — centred in the remaining space
    c.drawCentredString((lic_end + pg_start) / 2, fy + 8, 'Confidential — for client use only')

def header_bar(c, title=''):
    """Top navy band for inner pages."""
    bh = 36
    c.setFillColor(NAVY)
    c.rect(0, H - bh, W, bh, fill=1, stroke=0)
    # Small logo — official Colliers logo
    lh = 26
    lx, ly = 14, H - bh + (bh - lh) / 2
    lw = draw_logo_img(c, lx, ly, lh)
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


# ── Comparable sales table (page 3+) ─────────────────────────
from datetime import datetime, timedelta

def fmt_full_date(s):
    """Format a sale date as 'Friday, 26 June 2026'. Falls back to raw string."""
    if not s: return '—'
    s = str(s).strip()
    for f in ('%d/%m/%Y', '%d-%m-%Y', '%d.%m.%Y', '%Y-%m-%d', '%d %b %Y', '%d %B %Y'):
        try:
            d = datetime.strptime(s, f)
            return d.strftime('%A, %-d %B %Y')
        except ValueError:
            pass
    for f in ('%b %Y', '%B %Y', '%m/%Y', '%m-%Y'):
        try:
            d = datetime.strptime(s, f)
            return d.strftime('%B %Y')
        except ValueError:
            pass
    return s

def _wrap(c, text, font, size, max_w, max_lines=2):
    """Word-wrap text to max_w points; returns list of lines (ellipsised)."""
    words = str(text).split()
    lines, line = [], ''
    for w in words:
        test = (line + ' ' + w).strip()
        if c.stringWidth(test, font, size) <= max_w:
            line = test
        else:
            if line: lines.append(line)
            line = w
    if line: lines.append(line)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        while lines[-1] and c.stringWidth(lines[-1] + '…', font, size) > max_w:
            lines[-1] = lines[-1][:-1]
        lines[-1] += '…'
    return lines or ['—']

# Table geometry — margins and column widths (photo, address, $/m², SQM, price, date, broker)
TBL_X = 20
TBL_COLS = [120, 112, 48, 52, 58, 95, 70]   # sums to 555 = A4 width - 2*20

def draw_table_header(c, y):
    """Bold navy column headers, per the layout document."""
    labels = ['', 'Address', '$/m²', 'Land SQM', 'Sale Price', 'Date Sold', 'Broker Name']
    c.setFont('Helvetica-Bold', 10)
    c.setFillColor(NAVY)
    x = TBL_X
    for w, lbl in zip(TBL_COLS, labels):
        if lbl:
            c.drawString(x + 4, y, lbl)
        x += w
    # rule under the header
    c.setStrokeColor(NAVY)
    c.setLineWidth(0.8)
    c.line(TBL_X, y - 5, TBL_X + sum(TBL_COLS), y - 5)

def draw_property_row(c, y, row_h, prop, api_key):
    """One table row: photo w/ badges, then detail columns. y = row bottom."""
    x = TBL_X
    pad = 4
    # ── Photo cell with category + sale badges ──
    ph_h = row_h - 10
    ph_w = TBL_COLS[0] - 8
    ph_y = y + 5
    c.setFillColor(LGREY)
    c.roundRect(x, ph_y, ph_w, ph_h, 3, fill=1, stroke=0)
    # Prefer an uploaded property photo; fall back to Street View
    sv = None
    b64p = prop.get('photo_b64')
    if b64p:
        try:
            import base64 as _b64
            sv = Image.open(io.BytesIO(_b64.b64decode(b64p))).convert('RGB')
        except Exception:
            sv = None
    if sv is None:
        sv = fetch_streetview(prop.get('address', ''), api_key, size='240x150')
    if sv:
        tw, th = sv.size
        target = ph_w / ph_h
        if tw / th > target:
            nw = int(th * target); left = (tw - nw) // 2
            sv = sv.crop((left, 0, left + nw, th))
        else:
            nh = int(tw / target); top = (th - nh) // 3
            sv = sv.crop((0, top, tw, top + nh))
        c.drawImage(pil_to_rl(sv), x, ph_y, width=ph_w, height=ph_h,
                    preserveAspectRatio=False, mask='auto')
    else:
        c.setFont('Helvetica', 6.5)
        c.setFillColor(DGREY)
        c.drawCentredString(x + ph_w/2, ph_y + ph_h/2 - 2, 'No image')
    # Category badge — navy pill, white text (top-left of photo)
    cat = (prop.get('category') or '').upper()
    bx = x + 3
    by = ph_y + ph_h - 14
    if cat:
        bw = c.stringWidth(cat, 'Helvetica-Bold', 6.5) + 10
        c.setFillColor(NAVY)
        c.roundRect(bx, by, bw, 11, 2.5, fill=1, stroke=0)
        c.setFont('Helvetica-Bold', 6.5)
        c.setFillColor(WHITE)
        c.drawCentredString(bx + bw/2, by + 3, cat)
        bx += bw + 3
    # Sale / Lease badge — green (sale) or amber (lease)
    ls = prop.get('lease_or_sale', '')
    if ls:
        ls_col = HexColor('#166534') if ls == 'Sale' else HexColor('#854d0e')
        ls_bg  = HexColor('#dcfce7') if ls == 'Sale' else HexColor('#fef9c3')
        bw = c.stringWidth(ls, 'Helvetica-Bold', 6.5) + 10
        c.setFillColor(ls_bg)
        c.roundRect(bx, by, bw, 11, 2.5, fill=1, stroke=0)
        c.setFont('Helvetica-Bold', 6.5)
        c.setFillColor(ls_col)
        c.drawCentredString(bx + bw/2, by + 3, ls)

    # ── Detail columns — navy text, vertically centred ──
    cy_mid = y + row_h / 2
    x = TBL_X + TBL_COLS[0]
    cells = [
        ('Helvetica', 8.5, _wrap(c, prop.get('address') or '—', 'Helvetica', 8.5, TBL_COLS[1] - pad*2)),
        ('Helvetica', 8.5, [fmt_psm(prop.get('price_per_sqm'))]),
        ('Helvetica', 8.5, [fmt_num(prop.get('sqm'))]),
        ('Helvetica', 8.5, [fmt_price(prop.get('sale_price'))]),
        ('Helvetica', 8.5, _wrap(c, fmt_full_date(prop.get('sale_date')), 'Helvetica', 8.5, TBL_COLS[5] - pad*2)),
        ('Helvetica', 8.5, _wrap(c, prop.get('broker') or '—', 'Helvetica', 8.5, TBL_COLS[6] - pad*2)),
    ]
    c.setFillColor(NAVY)
    for w, (font, size, lines) in zip(TBL_COLS[1:], cells):
        c.setFont(font, size)
        lh = size + 2.5
        block_h = lh * len(lines)
        ty = cy_mid + block_h/2 - size
        for ln in lines:
            c.drawString(x + pad, ty, ln)
            ty -= lh
        x += w
    # Row separator
    c.setStrokeColor(MGREY)
    c.setLineWidth(0.4)
    c.line(TBL_X, y, TBL_X + sum(TBL_COLS), y)


# ── Comparable sales card pages (Claude Design layout) ───────
ACCENT   = HexColor('#13233f')
INK_DARK = HexColor('#0d1830')
INK_BODY = HexColor('#1a2233')
INK_MID  = HexColor('#475066')
INK_SOFT = HexColor('#667085')
INK_FAINT= HexColor('#8a93a3')
CARD_BRD = HexColor('#dde1e8')
RULE_SOFT= HexColor('#eef0f3')

CARD_MX   = 42    # page side margin (56px design → pt)
CARD_TOP  = 39    # top padding
CARD_BOT  = 26    # bottom padding
CARD_GAP  = 16.5  # grid gap

def fmt_month_year(s):
    """Short 'Jun 2026' from a sale date in many possible formats.
    Falls back to a trimmed raw string (never a long overflowing one)."""
    if not s: return '—'
    s = str(s).strip()

    # Excel date serial (days since 1899-12-30). Legacy spreadsheet rows
    # store dates this way, e.g. 46223 -> 20 Jul 2026.
    if s.isdigit() and 4 <= len(s) <= 5:
        n = int(s)
        if 20000 <= n <= 80000:          # ~1954 to ~2119: a plausible date
            try:
                return (datetime(1899, 12, 30) + timedelta(days=n)).strftime('%b %Y')
            except (ValueError, OverflowError):
                pass

    fmts = (
        '%A, %B %d, %Y',   # Friday, June 26, 2026
        '%A %B %d, %Y', '%B %d, %Y', '%b %d, %Y',
        '%d/%m/%Y', '%d-%m-%Y', '%d.%m.%Y', '%Y-%m-%d',
        '%d %b %Y', '%d %B %Y', '%b %Y', '%B %Y',
        '%m/%Y', '%m-%Y', '%Y/%m/%d',
    )
    for f in fmts:
        try:
            return datetime.strptime(s, f).strftime('%b %Y')  # e.g. 'Jun 2026'
        except ValueError:
            pass
    # Last resort: try to pull a month name + year out of the string
    import re as _re
    m = _re.search(r'([A-Za-z]{3,9})\D+(\d{4})', s)
    if m:
        for f in ('%B', '%b'):
            try:
                mn = datetime.strptime(m.group(1)[:9], f)
                return f'{mn.strftime("%b")} {m.group(2)}'
            except ValueError:
                pass
    # Give up gracefully — return something short, not a long overflow.
    return s[:8]

def draw_sales_card(c, x, y, w, h, prop, api_key):
    """One comparable-sales card. (x,y) = bottom-left."""
    r = 4.5
    # Card border
    c.setStrokeColor(CARD_BRD)
    c.setLineWidth(0.8)
    c.setFillColor(WHITE)
    c.roundRect(x, y, w, h, r, fill=1, stroke=1)

    # ── Photo (16:9 across the top) ──
    ph_h = w * 9/16
    ph_y = y + h - ph_h
    img = None
    b64p = prop.get('photo_b64')
    if b64p:
        try:
            import base64 as _b64
            img = Image.open(io.BytesIO(_b64.b64decode(b64p))).convert('RGB')
        except Exception:
            img = None
    if img is None:
        img = fetch_streetview(prop.get('address',''), api_key, size='400x225')
    c.saveState()
    p = c.beginPath()
    p.rect(x+0.4, ph_y, w-0.8, ph_h-0.4)
    c.clipPath(p, stroke=0, fill=0)
    if img:
        tw, th = img.size
        target = w / ph_h
        if tw/th > target:
            nw = int(th*target); left=(tw-nw)//2; img = img.crop((left,0,left+nw,th))
        else:
            nh = int(tw/target); top=(th-nh)//3; img = img.crop((0,top,tw,top+nh))
        c.drawImage(pil_to_rl(img), x+0.4, ph_y, width=w-0.8, height=ph_h-0.4,
                    preserveAspectRatio=False, mask='auto')
    else:
        c.setFillColor(LGREY)
        c.rect(x+0.4, ph_y, w-0.8, ph_h-0.4, fill=1, stroke=0)
        c.setFont('Helvetica', 7)
        c.setFillColor(DGREY)
        c.drawCentredString(x+w/2, ph_y+ph_h/2-3, 'No image')
    c.restoreState()

    # Badge: CATEGORY · SALE
    cat = (prop.get('category') or '').upper()
    ls  = (prop.get('lease_or_sale') or '').upper()
    badge = ' · '.join([t for t in (cat, ls) if t])
    if badge:
        c.setFont('Helvetica-Bold', 7.5)
        bw = c.stringWidth(badge, 'Helvetica-Bold', 7.5) + 15
        bx, by = x+7.5, y+h-7.5-13
        c.setFillColor(ACCENT)
        c.roundRect(bx, by, bw, 13, 2.2, fill=1, stroke=0)
        c.setFillColor(WHITE)
        c.drawCentredString(bx+bw/2, by+3.8, badge)

    # ── Body ──
    pad = 12
    ty = ph_y - 16
    # Address
    c.setFillColor(INK_DARK)
    c.setFont('Helvetica-Bold', 11)
    addr = prop.get('address') or '—'
    while c.stringWidth(addr, 'Helvetica-Bold', 11) > w - pad*2 and len(addr) > 4:
        addr = addr[:-2].rstrip() + '…'
    c.drawString(x+pad, ty, addr)
    # Price row — with a "SALE PRICE" label above it
    ty -= 15
    c.setFont('Helvetica', 6.8)
    c.setFillColor(INK_FAINT)
    c.drawString(x+pad, ty, 'SALE PRICE')
    ty -= 20
    c.setFont('Helvetica-Bold', 18)
    c.setFillColor(INK_DARK)
    price = fmt_price(prop.get('sale_price'))
    c.drawString(x+pad, ty, price)
    psm = prop.get('price_per_sqm')
    if psm:
        c.setFont('Helvetica', 9)
        c.setFillColor(INK_SOFT)
        c.drawString(x+pad + c.stringWidth(price,'Helvetica-Bold',18) + 10, ty+1, f'{fmt_psm(psm)} /m²')
    # Stat row: Net yield | Floor area | Land area | Sale date
    ty -= 14
    stats = [
        ('NET YIELD',  f"{prop['initial_yield']:.1f}%" if prop.get('initial_yield') else '—', ''),
        ('FLOOR AREA', fmt_num(prop.get('land_area')) if prop.get('land_area') else '—', ' m²' if prop.get('land_area') else ''),
        ('LAND AREA',  fmt_num(prop.get('sqm')) if prop.get('sqm') else '—', ' m²' if prop.get('sqm') else ''),
        ('SALE DATE',  fmt_month_year(prop.get('sale_date')), ''),
    ]
    col_w = (w - pad*2) / 4
    for i, (lbl, val, suffix) in enumerate(stats):
        sx = x + pad + i*col_w
        c.setFont('Helvetica', 6.5)
        c.setFillColor(INK_FAINT)
        c.drawString(sx, ty, lbl)
        c.setFont('Helvetica-Bold', 8.5)
        c.setFillColor(INK_BODY)
        c.drawString(sx, ty-10, val)
        if suffix:
            c.setFont('Helvetica', 7)
            c.setFillColor(INK_MID)
            c.drawString(sx + c.stringWidth(val,'Helvetica-Bold',8.5)+1.5, ty-10, suffix)
    ty -= 22
    # Notes (only when present) — wrapped, clamped to fit the card
    notes = (prop.get('notes') or '').strip()
    if notes:
        c.setStrokeColor(RULE_SOFT)
        c.setLineWidth(0.6)
        c.line(x+pad, ty, x+w-pad, ty)
        ty -= 11
        max_lines = max(0, int((ty - (y+9)) / 10) + 1)
        lines = _wrap(c, notes, 'Helvetica', 8, w - pad*2, max_lines=max(1, max_lines))
        c.setFont('Helvetica', 8)
        c.setFillColor(INK_MID)
        for ln in lines:
            if ty < y + 8: break
            c.drawString(x+pad, ty, ln)
            ty -= 10

def draw_card_page_header(c, page_idx, total_grid_pages):
    # Use the same navy top bar as the other inner pages, then the
    # section title beneath it (no "page X of Y" label).
    header_bar(c, 'Comparable Sales')
    top_y = H - 36            # below the navy bar
    c.setFont('Helvetica-Bold', 21)
    c.setFillColor(INK_DARK)
    c.drawString(CARD_MX, top_y - 26, 'Comparable Sales')
    c.setStrokeColor(ACCENT)
    c.setLineWidth(1.5)
    c.line(CARD_MX, top_y - 37, W - CARD_MX, top_y - 37)
    return top_y - 37 - 19.5  # grid top

def draw_card_page_footer(c, page_num, total_pages):
    # Same navy footer bar as the other pages.
    footer(c, page_num, total_pages)


# ── Main report builder ───────────────────────────────────────

def build_report(data, output_path):
    props = data.get('properties', [])
    stats = data.get('stats', {})
    api_key = data.get('gmaps_key', '')
    title = data.get('report_title', 'Comparable Market Analysis')
    gen_date = data.get('generated', '')
    subject = data.get('subject_address', '')
    prepared_for = data.get('prepared_for', '')
    subject_sqm = data.get('subject_sqm')
    indicated = data.get('indicated_value')
    est_low  = data.get('estimated_low')
    est_high = data.get('estimated_high')
    if not (est_low and est_high) and indicated:
        est_low  = round(indicated * 0.95 / 1000) * 1000
        est_high = round(indicated * 1.05 / 1000) * 1000
    psm_low  = round(est_low  / subject_sqm) if (est_low  and subject_sqm) else None
    psm_high = round(est_high / subject_sqm) if (est_high and subject_sqm) else None
    adj_psm = data.get('adjusted_psm')

    # Count pages: 1 cover + 1 summary + N card pages (2x2 = 4 per page)
    per_page = 4
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
    else:
        draw_logo_img(c, logo_x, logo_y, logo_h)

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

    # Prepared for
    if prepared_for:
        c.setFont('Helvetica', 7)
        c.setFillColor(HexColor('#93C5E8'))
        c.drawString(30, H - 345, 'PREPARED FOR')
        c.setFont('Helvetica-Bold', 11)
        c.setFillColor(WHITE)
        c.drawString(30, H - 360, prepared_for)

    # Subject property block
    if subject:
        box_y = H - 475
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
            c.drawString(30, box_y + 10, f'{fmt_num(subject_sqm)} m²  land area')

    # Stats on cover
    n = stats.get('count', len(props))
    c.setFont('Helvetica', 8)
    c.setFillColor(HexColor('#B8D9F0'))
    c.drawString(30, 120, f'{n} comparable {"sale" if n == 1 else "sales"} analysed')

    # Right panel — abstract photo background feel
    c.setFillColor(HexColor('#E8F2FA'))
    c.rect(panel_w, 0, W - panel_w, H, fill=1, stroke=0)

    # Estimated value range — headline stat on the right panel
    right_cx = panel_w + (W - panel_w) / 2
    if est_low and est_high:
        c.setFont('Helvetica', 10)
        c.setFillColor(DGREY)
        c.drawCentredString(right_cx, H/2 + 62, 'ESTIMATED VALUE')
        c.setFillColor(BLUE)
        c.setFont('Helvetica-Bold', 24)
        c.drawCentredString(right_cx, H/2 + 28, f'{fmt_price(est_low)} – {fmt_price(est_high)}')
        c.setFont('Helvetica', 12)
        c.setFillColor(NAVY)
        basis = data.get('valuation_basis', 'psm')
        subj_rent = data.get('subject_rent')
        subj_yield = data.get('subject_yield')
        if basis == 'income' and subj_yield:
            # Income-based: show the yield the value is capitalised at.
            c.drawCentredString(right_cx, H/2 + 2, f'at {subj_yield:.2f}% net yield')
            if subj_rent:
                c.setFont('Helvetica', 10)
                c.setFillColor(DGREY)
                c.drawCentredString(right_cx, H/2 - 18, f'on {fmt_price(subj_rent)} annual rent  ·  income basis')
        else:
            if psm_low and psm_high:
                c.drawCentredString(right_cx, H/2 + 2, f'at {fmt_psm(psm_low)} – {fmt_psm(psm_high)} /m²')
            if subject_sqm:
                c.setFont('Helvetica', 10)
                c.setFillColor(DGREY)
                c.drawCentredString(right_cx, H/2 - 18, f'× {fmt_num(subject_sqm)} m²  subject land area')

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
        ('Avg Land Area', f'{fmt_num(stats.get("avg_sqm"))} m²', ''),
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
    c.drawString(30, iv_y + 40, 'ESTIMATED VALUE — SUBJECT PROPERTY')
    c.setFont('Helvetica-Bold', 18)
    c.setFillColor(WHITE)
    rng = f'{fmt_price(est_low)} – {fmt_price(est_high)}' if (est_low and est_high) else '—'
    c.drawString(30, iv_y + 16, rng)
    if psm_low and psm_high and subject_sqm:
        c.setFont('Helvetica', 9)
        c.setFillColor(HexColor('#B8D9F0'))
        c.drawString(30 + c.stringWidth(rng, 'Helvetica-Bold', 18) + 16, iv_y + 20,
                     f'at {fmt_psm(psm_low)} – {fmt_psm(psm_high)} /m²  ×  {fmt_num(subject_sqm)} m²  subject land area')
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
    c.drawString(20, 30 + 5*mm, disc[:110])
    c.drawString(20, 22 + 5*mm, disc[110:])

    footer(c, 2, total_pages)
    c.showPage()

    # ── PAGES 3+: COMPARABLE SALES CARDS (2x2 grid) ──────────
    for pg_idx in range(grid_pages):
        page_num = pg_idx + 3
        page_props = props[pg_idx * per_page : (pg_idx+1) * per_page]

        grid_top = draw_card_page_header(c, pg_idx, grid_pages)
        footer_top = CARD_BOT + 12 + 10   # footer rule + clearance

        card_w = (W - CARD_MX*2 - CARD_GAP) / 2
        card_h = (grid_top - footer_top - CARD_GAP) / 2

        for i, prop in enumerate(page_props):
            col = i % 2
            row = i // 2
            cx = CARD_MX + col * (card_w + CARD_GAP)
            cy = grid_top - (row + 1) * card_h - row * CARD_GAP
            draw_sales_card(c, cx, cy, card_w, card_h, prop, api_key)

        draw_card_page_footer(c, page_num, total_pages)
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
