"""Render the prototype's pin silhouette as transparent native density assets.

Run with Pillow installed; Pillow is only an asset-authoring tool, not an app dependency.
"""
from pathlib import Path
from PIL import Image, ImageDraw

destination = Path(__file__).resolve().parents[1] / 'assets' / 'icons'
destination.mkdir(parents=True, exist_ok=True)
scale = 12
points = [(8, 3), (16, 3), (15, 9), (18, 13), (6, 13), (9, 9), (8, 3)]
for active, color in [(False, '#65766E'), (True, '#28644F')]:
    image = Image.new('RGBA', (24 * scale, 24 * scale))
    draw = ImageDraw.Draw(image)
    path = [(x * scale, y * scale) for x, y in points]
    if active:
        draw.polygon(path, fill=color)
    draw.line(path, fill=color, width=round(1.5 * scale), joint='curve')
    draw.line([(12 * scale, 13 * scale), (12 * scale, 21 * scale)], fill=color, width=round(1.5 * scale))
    draw.ellipse((11.25 * scale, 20.25 * scale, 12.75 * scale, 21.75 * scale), fill=color)
    image = image.rotate(-35, resample=Image.Resampling.BICUBIC)
    for density in [1, 2, 3]:
        suffix = '' if density == 1 else f'@{density}x'
        name = 'pin-active' if active else 'pin'
        image.resize((24 * density, 24 * density), Image.Resampling.LANCZOS).save(destination / f'{name}{suffix}.png')
