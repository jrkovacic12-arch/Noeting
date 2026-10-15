"""Render the supplied SVG symbol without changing the original vector art.

Requires Inkscape and Pillow for asset authoring, not at app runtime.
"""
from pathlib import Path
import subprocess
import os
from PIL import Image

root = Path(__file__).resolve().parents[1]
source = root / 'assets/brand/source/noeting-symbol.svg'
output = root / 'assets/brand/generated'
scratch = root / 'work/brand'
output.mkdir(parents=True, exist_ok=True)
scratch.mkdir(parents=True, exist_ok=True)
render = scratch / 'symbol.png'
authoring_env = {**os.environ, 'XDG_CONFIG_HOME': str(scratch / 'config'), 'XDG_CACHE_HOME': str(scratch / 'cache')}
subprocess.run(['inkscape', str(source), '--export-type=png',
                '--export-width=1024', '--export-height=1024',
                '--export-filename=' + str(render)], check=True, env=authoring_env)
symbol = Image.open(render).convert('RGBA')
# Keep the complete symbol (including its dot) inside Android's adaptive mask.
foreground = Image.new('RGBA', (1024, 1024))
foreground.alpha_composite(symbol.resize((704, 704), Image.Resampling.LANCZOS), (160, 160))
foreground.save(output / 'android-foreground.png')
icon = Image.new('RGBA', (1024, 1024), '#F6F7F2')
icon.alpha_composite(foreground)
icon.convert('RGB').save(output / 'icon.png')
monochrome = Image.new('RGBA', foreground.size, 'white')
monochrome.putalpha(foreground.getchannel('A'))
monochrome.save(output / 'android-monochrome.png')
for density in [1, 2, 3]:
    suffix = '' if density == 1 else f'@{density}x'
    symbol.resize((36 * density, 36 * density), Image.Resampling.LANCZOS).save(output / f'symbol{suffix}.png')
icon.resize((96, 96), Image.Resampling.LANCZOS).save(output / 'favicon.png')
