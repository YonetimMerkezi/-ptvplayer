#!/usr/bin/env python3
"""Tema sayfasındaki kart görüntülerini üretir: uygulamanın GERÇEK ana ekranından, tema başına bir ekran görüntüsü.

Ne zaman çalıştırılır: ana ekran ya da bir temanın renkleri değiştiğinde (www/js/theme.js'e tema eklendiğinde de).
Çıktı: www/img/themes/<tema-kimliği>.webp  (tests/theme.test.js her temanın görüntüsü var mı diye bakar)

Gerekenler: python3 playwright (+ Chrome), Pillow. Betik www/ klasörünü ve mock/server.mjs'i kendisi başlatır.
Kullanım:  python3 scripts/theme-previews.py [tema-kimliği ...]   (kimlik verilmezse hepsi)
"""
import asyncio, json, os, re, subprocess, sys, time
from datetime import datetime
from io import BytesIO
from pathlib import Path
from playwright.async_api import async_playwright
from PIL import Image

KOK = Path(__file__).resolve().parent.parent
OUT = KOK / 'www' / 'img' / 'themes'
W, H, SCALE = 390, 640, 1.5   # telefon dikey ekranı; kart ~165 px genişliğinde gösterilir
CHROME = os.environ.get('CHROME', '/usr/bin/google-chrome')
HTTP_PORT, MOCK_PORT = 8765, 8099

SEED = """
try {
  localStorage.setItem('iptv.sources', JSON.stringify([{ id: 's1', type: 'm3u', name: 'Örnek liste', url: 'http://127.0.0.1:%d/list.m3u' }]));
  localStorage.setItem('iptv.active', JSON.stringify('s1'));
} catch (e) {}
""" % MOCK_PORT


def theme_ids():
    src = (KOK / 'www' / 'js' / 'theme.js').read_text(encoding='utf-8')
    block = src.split('export const THEMES = [')[1].split('];')[0]
    return re.findall(r"\{ id: '([a-z]+)'", block)


async def main(only):
    ids = only or theme_ids()
    OUT.mkdir(parents=True, exist_ok=True)
    procs = [
        subprocess.Popen([sys.executable, '-m', 'http.server', str(HTTP_PORT)], cwd=KOK / 'www', stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL),
        subprocess.Popen(['node', 'mock/server.mjs'], cwd=KOK, env={**os.environ, 'PORT': str(MOCK_PORT)}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL),
    ]
    time.sleep(2)
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
            ctx = await b.new_context(viewport={'width': W, 'height': H}, device_scale_factor=SCALE, locale='tr-TR', timezone_id='Europe/Istanbul')
            pg = await ctx.new_page()
            await pg.clock.set_fixed_time(datetime(2026, 11, 18, 20, 30))  # saat/tarih her üretimde aynı
            await pg.add_init_script(SEED)
            await pg.goto(f'http://127.0.0.1:{HTTP_PORT}/index.html')
            await pg.wait_for_timeout(6500)  # liste yüklensin, "yenilikler" penceresi çıksın
            for _ in range(4):
                c = pg.locator('.sheet-back [data-close]')
                if await c.count():
                    await c.first.click()
                    await pg.wait_for_timeout(300)
            for tid in ids:
                await pg.evaluate("(id) => import('./js/theme.js').then((m) => m.applyTheme(id))", tid)
                await pg.wait_for_timeout(500)
                png = await pg.screenshot()
                img = Image.open(BytesIO(png)).convert('RGB')
                img.save(OUT / f'{tid}.webp', 'WEBP', quality=78, method=6)
                print(tid, (OUT / f'{tid}.webp').stat().st_size // 1024, 'KB')
            await b.close()
    finally:
        for pr in procs:
            pr.terminate()


asyncio.run(main(sys.argv[1:]))
