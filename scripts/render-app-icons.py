from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageOps


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "src" / "static"
SIZE = 1024
SUPERSAMPLE = 4
BRAND_BLUE = "#527DA8"


def cubic(p0, p1, p2, p3, steps=96):
    points = []
    for index in range(steps + 1):
        t = index / steps
        u = 1 - t
        points.append(
            (
                u**3 * p0[0] + 3 * u**2 * t * p1[0] + 3 * u * t**2 * p2[0] + t**3 * p3[0],
                u**3 * p0[1] + 3 * u**2 * t * p1[1] + 3 * u * t**2 * p2[1] + t**3 * p3[1],
            )
        )
    return points


def logo_paths():
    mountains = [(3, 10), (8, 5), (13, 10), (16, 7), (21, 12)]
    first_wave = cubic((3, 15), (6, 12), (9, 18), (12, 15))
    first_wave += cubic((12, 15), (15, 12), (18, 18), (21, 15))[1:]
    second_wave = cubic((5, 19), (8, 17), (10, 21), (13, 19))
    second_wave += cubic((13, 19), (16, 17), (17, 21), (19, 19))[1:]
    return mountains, first_wave, second_wave


def render_mark(offset: float, scale: float, stroke: float) -> Image.Image:
    canvas_size = SIZE * SUPERSAMPLE
    image = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    width = round(stroke * scale * SUPERSAMPLE)

    def transform(points):
        return [
            ((offset + x * scale) * SUPERSAMPLE, (offset + y * scale) * SUPERSAMPLE)
            for x, y in points
        ]

    for path in logo_paths():
        points = transform(path)
        radius = width / 2
        for start, end in zip(points, points[1:]):
            draw.line((start, end), fill=BRAND_BLUE, width=width)
        for x, y in points:
            draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=BRAND_BLUE)

    return image.resize((SIZE, SIZE), Image.Resampling.LANCZOS)


def gradient_background() -> Image.Image:
    gradient = Image.linear_gradient("L").resize((SIZE, SIZE))
    return ImageOps.colorize(gradient, black="#F8FBFD", white="#E8F1F7").convert("RGBA")


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)

    transparent_logo = render_mark(offset=96, scale=34.6666667, stroke=1.65)
    transparent_logo.save(
        OUTPUT / "lakeside-logo-1024.png",
        format="PNG",
        optimize=True,
        compress_level=9,
    )

    app_icon = gradient_background()
    app_icon.alpha_composite(render_mark(offset=128, scale=32, stroke=1.85))
    app_icon.convert("RGB").save(
        OUTPUT / "app-icon-1024.png",
        format="PNG",
        optimize=True,
        compress_level=9,
    )


if __name__ == "__main__":
    main()
