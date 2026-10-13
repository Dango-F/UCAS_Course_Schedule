"""Render the launch composition from the two existing brand marks (no redraw).

Run with Python + Pillow on Windows. An optional --ucas-logo imports the official
horizontal blue logo once; subsequent renders use the checked-in source copy.
"""
from pathlib import Path
import argparse
import shutil
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
DESIGN = ROOT / 'design' / 'launch'
WEB = ROOT / 'src' / 'static' / 'splash'
NATIVE = ROOT / 'unpackage' / 'res' / 'splash'
BG = '#F6F8FC'
SCALE = 3
HERO_WIDTH = 220
HERO_HEIGHT = 172
HERO_TOP = .18
ICON_SIZE = 80
FOOTER_WIDTH = 128
FOOTER_HEIGHT = 48


def font(size, bold=False):
    return ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc' if bold else 'C:/Windows/Fonts/msyh.ttc', round(size * SCALE))


def centered_text(image, text, center_y, size, color, spacing=0, bold=False):
    draw = ImageDraw.Draw(image)
    face = font(size, bold)
    widths = [draw.textlength(c, font=face) for c in text]
    x = (image.width - sum(widths) - spacing * SCALE * (len(text) - 1)) / 2
    for char, width in zip(text, widths):
        draw.text((x, center_y * SCALE), char, fill=color, font=face, anchor='lm')
        x += width + spacing * SCALE


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--ucas-logo', type=Path)
    args = parser.parse_args()
    for directory in (DESIGN, WEB, NATIVE):
        directory.mkdir(parents=True, exist_ok=True)
    source = DESIGN / 'ucas-horizontal-blue.png'
    if args.ucas_logo:
        shutil.copyfile(args.ucas_logo, source)
    school = Image.open(source).convert('RGBA')
    # Remove only transparent outside margins; preserve official colors/proportions.
    school = school.crop(school.getbbox())
    # Use the launcher icon master, including its original pale-blue gradient.
    # Preserve the full square and glyph placement; round only its outer corners.
    app_icon = Image.open(ROOT / 'src/static/app-icon-1024.png').convert('RGBA')
    icon = app_icon.resize((ICON_SIZE * SCALE, ICON_SIZE * SCALE), Image.Resampling.LANCZOS)
    mask = Image.new('L', icon.size)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, icon.width - 1, icon.height - 1), radius=18 * SCALE, fill=255)
    icon.putalpha(mask)
    hero = Image.new('RGBA', (HERO_WIDTH * SCALE, HERO_HEIGHT * SCALE))
    hero.alpha_composite(icon, ((HERO_WIDTH - ICON_SIZE) * SCALE // 2, 8 * SCALE))
    centered_text(hero, '湖畔课表', 116, 20, '#203047', spacing=3)
    centered_text(hero, '让时间，清晰一点。', 148, 11, '#7D8FA3', spacing=1)
    hero.save(WEB / 'launch-hero.png', optimize=True)

    footer = Image.new('RGBA', (FOOTER_WIDTH * SCALE, FOOTER_HEIGHT * SCALE))
    width = 120 * SCALE
    height = round(width * school.height / school.width)
    footer.alpha_composite(school.resize((width, height), Image.Resampling.LANCZOS), ((footer.width - width) // 2, 0))
    centered_text(footer, '非官方课表应用', 40, 9, '#8999A9', spacing=.5)
    footer.save(WEB / 'launch-school.png', optimize=True)

    # A phone-sized design preview uses the same art, dimensions and positions
    # as the Vue composition; it is not a screenshot from an installed APK.
    preview = Image.new('RGBA', (390 * SCALE, 844 * SCALE), BG)
    preview.alpha_composite(hero, ((preview.width - hero.width) // 2, round(max(32, 844 * HERO_TOP) * SCALE)))
    preview.alpha_composite(footer, ((preview.width - footer.width) // 2, round((844 - 844 * .08 - FOOTER_HEIGHT) * SCALE)))
    preview.convert('RGB').resize((390, 844), Image.Resampling.LANCZOS).save(DESIGN / 'launch-preview.png', optimize=True)

    # Native splash and WebView have different insets and layout algorithms.
    # Only hand off the shared background; show both marks once in the WebView.
    # Baking marks into a stretched nine-patch cannot match percentage CSS
    # positions on every screen and made the marks jump during the handoff.
    for density, width, height in [('hdpi', 480, 762), ('xhdpi', 720, 1242), ('xxhdpi', 1080, 1882)]:
        canvas = Image.new('RGBA', (width, height), BG)
        patch = Image.new('RGBA', (width + 2, height + 2))
        patch.alpha_composite(canvas, (1, 1))
        edge = ImageDraw.Draw(patch)
        ink = (0, 0, 0, 255)
        edge.line((1, 0, width, 0), fill=ink)
        edge.line((0, 1, 0, height), fill=ink)
        edge.line((1, height + 1, width, height + 1), fill=ink)
        edge.line((width + 1, 1, width + 1, height), fill=ink)
        patch.save(NATIVE / f'lakeside-{density}.9.png', optimize=True)
    print('Rendered launch art and three native nine-patch images.')


if __name__ == '__main__':
    main()
