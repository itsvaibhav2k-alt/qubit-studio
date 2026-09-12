# Browser regression for Design mode. Run against a built UI on :3101 proxied to the updated backend:
#   uv venv pw && uv pip install --python pw/bin/python playwright && pw/bin/python -m playwright install chromium
#   QUBIT_API_URL=http://127.0.0.1:8002 npm start -- -p 3101   (backend from feat/design-search on 8002)
#   pw/bin/python ui/qa-design.playwright.py
"""Browser QA for Qubit Studio Design mode against http://localhost:3101 (backend :8002)."""
import re
import sys
from playwright.sync_api import sync_playwright, expect

URL = 'http://localhost:3101/'
SHOTS = '/tmp/qubit-qa-shots'
import os
os.makedirs(SHOTS, exist_ok=True)

results = []


def check(name, ok, evidence=''):
    results.append((name, bool(ok), evidence))
    print(('PASS ' if ok else 'FAIL ') + name + (f'  — {evidence}' if evidence else ''))


def body(pg):
    # innerText applies CSS text-transform; compare case-insensitively.
    return pg.locator('body').inner_text().lower()


def readout(pg, key):
    return pg.locator('.tradeoff-readout div', has_text=key).first.inner_text().lower()


def tile(pg, label):
    return pg.locator('.metric', has_text=label).first


def wait_search(pg, timeout=15000):
    pg.wait_for_function(
        "() => /evaluated designs qualify|No evaluated design meets/.test(document.body.innerText)",
        timeout=timeout,
    )
    pg.wait_for_timeout(600)


def wait_live(pg):
    pg.wait_for_function("() => document.querySelector('.badge.live') !== null", timeout=10000)
    pg.wait_for_timeout(200)


def select_part(pg, name):
    pg.locator('.tree-row', has_text=name).first.click()


with sync_playwright() as p:
    browser = p.chromium.launch()
    pg = browser.new_page(viewport={'width': 1440, 'height': 900})
    pg.goto(URL, wait_until='networkidle')
    wait_live(pg)

    # ---------- 1. Design first screen ----------
    pg.get_by_role('button', name='Design', exact=True).click()
    t = body(pg)
    check('1a stage label', 'working design — no candidates generated yet' in t)
    check('1b requirements defaults', all(x in t for x in ['target frequency', 'max charge variation', 'min separation', 'find designs', 'not searched yet.']))
    check('1c metric strip still working device', '5.6826 GHz' in tile(pg, 'Transition frequency').inner_text())
    check('1d no lock text before search', 'locked' not in t, f"count={t.lower().count('locked')}")
    check('1e trade-off empty state', 'set requirements, then find designs.' in t)
    select_part(pg, 'Josephson junction')
    insp = pg.locator('.pane-inspector').inner_text()
    check('1f EJ read-only with working note', 'Working device value' in insp and pg.locator('.pane-inspector .num.readout').count() == 1 and pg.locator('.pane-inspector input[type=range]#p-ej_ghz').count() == 0)
    check('1g no lock text after selecting junction', 'locked' not in body(pg))
    pg.screenshot(path=f'{SHOTS}/1-design-first.png')

    # ---------- 2. Find designs, lock, path, rejection ----------
    pg.get_by_role('button', name='Find designs').click()
    wait_search(pg)
    wait_live(pg)
    t = body(pg)
    check('2a collapsed summary + Edit + status', '5.000 ghz · ≤ 10.000 khz · ≥ 200 mhz' in t and pg.get_by_role('button', name='Edit').count() == 1 and 'of 401 evaluated designs qualify.' in t)
    ins = readout(pg, 'Inspected:')
    check('2b inspected read-out', re.search(r'ratio [\d.]+ · a 302\.4 mhz · 9\.992 khz · qualifies', ins) is not None, ins)
    check('2c f01 locked badge', '5.0000 GHz' in tile(pg, 'Transition frequency').inner_text() and 'locked' in tile(pg, 'Transition frequency').inner_text())
    check('2d separation tile', '+302.4 MHz' in tile(pg, 'Separation').inner_text())
    check('2e stage label', re.search(r'inspecting candidate \d+/401 · f01 locked at 5\.000 ghz', t) is not None)
    check('2f plot lines + ring + label', pg.locator('.tradeoff svg line[stroke-dasharray="3 3"]').count() == 2 and pg.locator('.tradeoff svg circle[r="6"]').count() == 1 and pg.locator('.tradeoff svg text', has_text='inspected').count() == 1)
    insp = pg.locator('.pane-inspector').inner_text()
    check('2g inspector lock note + design path', 'Set by the frequency lock' in insp and pg.locator('#design-path').count() == 1)
    ej_before = pg.locator('.pane-inspector .num.readout').first.inner_text()
    f01_before = tile(pg, 'Transition frequency').locator('.v').inner_text()
    path = pg.locator('#design-path')
    for _ in range(3):
        path.press('ArrowRight')
    wait_live(pg)
    ej_after = pg.locator('.pane-inspector .num.readout').first.inner_text()
    f01_after = tile(pg, 'Transition frequency').locator('.v').inner_text()
    select_part(pg, 'Shunt capacitor pads')
    ec_after = pg.locator('.pane-inspector .num.readout').first.inner_text()
    check('2h design path moves EJ, f01 stays', ej_before != ej_after and f01_before == f01_after == '5.0000 GHz', f'EJ {ej_before}->{ej_after}, EC now {ec_after}, f01 {f01_after}')
    # schematic lock label
    pg.get_by_role('button', name='Split').click()
    check('2i schematic lock label', pg.locator('.schematic text', has_text='f01 locked').count() == 1)
    pg.get_by_role('button', name='3D', exact=True).click()
    # click a rejected hollow point right of the limit
    svg = pg.locator('.tradeoff svg')
    hollow = pg.locator('.tradeoff svg circle[fill="none"][r="2.5"]')
    limit_x = float(pg.locator('.tradeoff svg line[stroke-dasharray="3 3"]').first.get_attribute('x1'))
    box = svg.bounding_box()
    k = box['width'] / 360
    target = None
    for i in range(hollow.count()):
        cx = float(hollow.nth(i).get_attribute('cx'))
        if cx > limit_x + 20:
            target = (cx, float(hollow.nth(i).get_attribute('cy')))
            break
    pg.mouse.click(box['x'] + target[0] * k, box['y'] + target[1] * k)
    pg.wait_for_timeout(300)
    ins = readout(pg, 'Inspected:')
    apply_btn = pg.get_by_role('button', name='Apply qualifying design')
    check('2j rejected point inspectable', 'rejected:' in ins and pg.get_by_role('button', name='Back to recommended').count() == 1 and apply_btn.is_disabled(), ins)
    pg.get_by_role('button', name='Back to recommended').click()
    wait_live(pg)
    check('2k back to recommended re-enables apply', apply_btn.is_enabled() and 'qualifies' in readout(pg, 'Inspected:'))
    pg.screenshot(path=f'{SHOTS}/2-searched.png')

    # ---------- 3. Pin + tighten ----------
    pg.get_by_role('button', name='Pin baseline').click()
    pg.wait_for_timeout(300)
    check('3a baseline pinned strip', pg.locator('.comparison').count() == 1 and 'recommended under 5.000 GHz · ≤ 10.000 kHz · ≥ 200 MHz' in pg.locator('.comparison').inner_text())
    pg.get_by_role('button', name='Edit').click()
    pg.locator('#spec-max_dispersion_khz ~ input.num, input[aria-label="Max charge variation exact value"]').first.fill('1')
    pg.wait_for_timeout(300)
    t = body(pg)
    check('3b changed-not-searched state', 'requirements changed — results below are for 5.000 ghz · ≤ 10.000 khz · ≥ 200 mhz' in t and pg.locator('.tradeoff.stale').count() == 1 and pg.get_by_role('button', name='Pin baseline').is_disabled() and apply_btn.is_disabled())
    pg.get_by_role('button', name='Find designs').click()
    wait_search(pg)
    wait_live(pg)
    pg.wait_for_function("() => /qualifies now|fails now/.test(document.body.innerText)", timeout=15000)
    t = body(pg)
    cmp = pg.locator('.comparison').inner_text()
    check('3c 149 qualify, A 261.6', '149 of 401 evaluated designs qualify.' in t and 'a 261.6 mhz · 0.962 khz · qualifies' in readout(pg, 'Inspected:'))
    check('3d baseline fails now', 'fails now: charge variation above the limit' in cmp, cmp.replace('\n', ' | '))
    check('3e cost of tightening', 'COST OF TIGHTENING' in cmp.upper() and '40.8' in cmp and 'ΔA -40.8 MHz' in cmp)
    check('3f baseline diamond on plot', pg.locator('.tradeoff svg polygon[stroke-dasharray="2 2"]').count() == 1)
    pg.screenshot(path=f'{SHOTS}/3-tightened.png')

    # ---------- 4. Infeasible ----------
    pg.get_by_role('button', name='Edit').click()
    pg.locator('input[aria-label="Min separation exact value"]').fill('300')
    pg.get_by_role('button', name='Find designs').click()
    wait_search(pg)
    pg.wait_for_timeout(800)
    t = body(pg)
    cmp = pg.locator('.comparison').inner_text()
    check('4a infeasible status', 'no evaluated design meets these requirements. 401 evaluated.' in t)
    check('4b requirements stay expanded', pg.get_by_role('button', name='Edit').count() == 0 and pg.locator('input[aria-label="Min separation exact value"]').count() == 1)
    check('4c no filled points, recommended none', pg.locator('.tradeoff svg circle[fill="var(--text-2)"]').count() == 0 and 'none — no evaluated design meets these requirements.' in readout(pg, 'Recommended:'))
    check('4d comparison kind infeasible', 'NO QUALIFYING DESIGN' in cmp.upper(), cmp.replace('\n', ' | '))
    check('4e apply disabled', apply_btn.is_disabled())
    check('4f metric tiles show no candidate numbers', '—' in tile(pg, 'Transition frequency').inner_text() or 'locked' not in tile(pg, 'Transition frequency').inner_text())
    pg.screenshot(path=f'{SHOTS}/4-infeasible.png')

    # ---------- 5. Apply + Explore round-trip ----------
    pg.locator('input[aria-label="Min separation exact value"]').fill('200')
    pg.get_by_role('button', name='Find designs').click()
    wait_search(pg)
    wait_live(pg)
    apply_btn.click()
    pg.wait_for_timeout(400)
    ap = readout(pg, 'Applied to device:')
    check('5a applied read-out + glyph', re.search(r'ratio [\d.]+', ap) is not None and pg.locator('.tradeoff svg rect[width="10"]').count() == 1, ap)
    pg.get_by_role('button', name='Explore', exact=True).click()
    wait_live(pg)
    select_part(pg, 'Josephson junction')
    ej_field = pg.locator('input[aria-label="Tunnelling strength exact value"]')
    t = body(pg)
    check('5b explore shows applied device', ej_field.count() == 1 and ej_field.input_value() != '15.00' and '5.0000 GHz' in tile(pg, 'Transition frequency').inner_text() and 'charge response' in t and 'locked' not in t, f'EJ {ej_field.input_value()}')
    pg.locator('#p-ej_ghz').press('ArrowRight')
    wait_live(pg)
    pg.get_by_role('button', name='Design', exact=True).click()
    pg.wait_for_timeout(400)
    t = body(pg)
    check('5c applied derived: none after divergence', 'applied to device: none' in readout(pg, 'Applied to device:').replace('\n', ' ') and 'of 401 evaluated designs qualify.' in t)
    pg.screenshot(path=f'{SHOTS}/5-roundtrip.png')

    # ---------- 6. Explore regression (fresh load) ----------
    pg.goto(URL, wait_until='networkidle')
    wait_live(pg)
    select_part(pg, 'Josephson junction')
    check('6a tree select cross-highlights', pg.locator('.badge-row .badge', has_text='Josephson junction').count() == 1 and 'selected: josephson junction' in body(pg))
    pg.get_by_role('button', name='Split').click()
    pg.locator('.schematic [aria-label="Shunt capacitor pads"]').dispatch_event('click')
    check('6b schematic select', 'selected: shunt capacitor pads' in body(pg) and pg.locator('.tree-row[aria-selected="true"]', has_text='Shunt').count() == 1)
    select_part(pg, 'Josephson junction')
    f01_0 = tile(pg, 'Transition frequency').locator('.v').inner_text()
    pg.locator('#p-ej_ghz').focus()
    pg.keyboard.press('ArrowRight')
    pg.keyboard.press('ArrowRight')
    saw_updating = pg.locator('.badge.stale').count() == 1
    f01_during = tile(pg, 'Transition frequency').locator('.v').inner_text()
    wait_live(pg)
    f01_1 = tile(pg, 'Transition frequency').locator('.v').inner_text()
    check('6c updating keeps previous numbers', saw_updating and f01_during == f01_0 and f01_1 != f01_0, f'{f01_0} -> {f01_1}')
    pg.get_by_role('button', name='Pin baseline').click()
    pg.wait_for_timeout(200)
    check('6d pin shows baseline pill', pg.locator('.pane-dock .pill', has_text='baseline:').count() == 1)
    pg.get_by_role('button', name='Clear').click()
    check('6e clear', pg.locator('.pane-dock .pill', has_text='baseline:').count() == 0)
    pg.get_by_role('button', name='Reset parameters').click()
    wait_live(pg)
    check('6f reset parameters', ej_field.input_value() == '15.00')
    pg.get_by_role('button', name=re.compile('^Charts')).click()
    check('6g charts collapse', pg.locator('.dock-lower').count() == 0)
    pg.get_by_role('button', name=re.compile('^Charts')).click()

    # ---------- 7. Keyboard + narrow ----------
    pg.get_by_role('button', name='Design', exact=True).click()
    pg.get_by_role('button', name='Find designs').click()
    wait_search(pg)
    wait_live(pg)
    pg.locator('.tradeoff svg').focus()
    ratios = [re.search(r'ratio ([\d.]+)', readout(pg, 'Inspected:')).group(1)]
    for key in ['ArrowRight', 'ArrowRight', 'ArrowLeft']:
        pg.keyboard.press(key)
        pg.wait_for_timeout(250)
        ratios.append(re.search(r'ratio ([\d.]+)', readout(pg, 'Inspected:')).group(1))
    r = [float(x) for x in ratios]
    check('7a keyboard walks ratio order', r[1] > r[0] and r[2] > r[1] and r[3] < r[2], ' -> '.join(ratios))
    pg.set_viewport_size({'width': 390, 'height': 844})
    pg.wait_for_timeout(400)
    sw = pg.evaluate('document.documentElement.scrollWidth')
    pg.get_by_role('button', name='Edit').click()
    btn = pg.get_by_role('button', name='Find designs')
    btn.scroll_into_view_if_needed()
    bb = btn.bounding_box()
    hit = pg.evaluate('([x,y]) => { const e = document.elementFromPoint(x,y); return e && e.closest("button") && e.closest("button").innerText; }', [bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2])
    check('7b narrow width', sw == 390 and hit == 'Find designs', f'scrollWidth={sw}, hit={hit}')
    pg.screenshot(path=f'{SHOTS}/7-narrow.png', full_page=True)

    browser.close()

fails = [r for r in results if not r[1]]
print(f'\n{len(results) - len(fails)}/{len(results)} passed')
sys.exit(1 if fails else 0)
