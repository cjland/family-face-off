"""
Turns raw README screenshots (from tests/e2e/docs-screens.spec.ts) into small WebP images
for docs/images, plus a hero image of the TV with two phones in front of it.

    python3 scripts/docs-images.py /tmp/docs-raw docs/images

Needs Pillow (pip install pillow).
"""

import os
import sys

from PIL import Image, ImageDraw, ImageFilter

SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)

# Screens that go in the README, and the width each is saved at.
TV_WIDTH = 1280
PHONE_WIDTH = 360
HOST_WIDTH = 1100

SKIP = {"phone-countdown"}  # too brief to catch reliably from a phone


def load(name):
    return Image.open(os.path.join(SRC, name + ".png")).convert("RGB")


def save(im, name, quality=82):
    im.save(os.path.join(OUT, name + ".webp"), "WEBP", quality=quality, method=6)


def fit_width(im, width):
    if im.width <= width:
        return im
    return im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)


def trim_host(im):
    """Host pages are a centered column on a wide window: keep just the content."""
    left, right = 124, im.width - 124
    return im.crop((left, 0, right, im.height))


for file in sorted(os.listdir(SRC)):
    if not file.endswith(".png"):
        continue
    name = file[:-4]
    if name in SKIP:
        continue
    im = load(name)
    if name.startswith("phone-"):
        im = fit_width(im, PHONE_WIDTH)
    elif name.startswith("host-"):
        # The setup page now fills the window; the game console is still a centered column.
        im = fit_width(im if name == "host-dashboard" else trim_host(im), HOST_WIDTH)
    else:
        im = fit_width(im, TV_WIDTH)
    save(im, name)


def rounded(im, radius):
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, im.width - 1, im.height - 1), radius, fill=255)
    out = Image.new("RGBA", im.size)
    out.paste(im, (0, 0), mask)
    return out


def phone_frame(screen, width):
    """A simple dark phone bezel around a screenshot."""
    screen = fit_width(screen, width)
    bezel = 14
    body = Image.new("RGBA", (screen.width + bezel * 2, screen.height + bezel * 2), (0, 0, 0, 0))
    ImageDraw.Draw(body).rounded_rectangle((0, 0, body.width - 1, body.height - 1), 46, fill=(18, 16, 28, 255))
    body.alpha_composite(rounded(screen.convert("RGBA"), 34), (bezel, bezel))
    return body


def shadow(layer, blur=22, offset=(0, 14), opacity=150):
    sh = Image.new("RGBA", (layer.width + blur * 4, layer.height + blur * 4), (0, 0, 0, 0))
    alpha = layer.split()[3].point(lambda a: opacity if a > 0 else 0)
    sh.paste((0, 0, 0, 255), (blur * 2 + offset[0], blur * 2 + offset[1]), alpha)
    return sh.filter(ImageFilter.GaussianBlur(blur))


# Hero: the TV question screen with two phones in front.
W, H = 1600, 900
hero = Image.new("RGBA", (W, H), (20, 12, 48, 255))
grad = ImageDraw.Draw(hero)
for y in range(H):
    t = y / H
    grad.line([(0, y), (W, y)], fill=(int(32 + 20 * t), int(18 + 6 * t), int(80 - 20 * t), 255))

tv = fit_width(load("tv-question"), 1100)
tv_layer = rounded(tv.convert("RGBA"), 18)
frame = Image.new("RGBA", (tv_layer.width + 24, tv_layer.height + 24), (0, 0, 0, 0))
ImageDraw.Draw(frame).rounded_rectangle((0, 0, frame.width - 1, frame.height - 1), 26, fill=(10, 10, 16, 255))
frame.alpha_composite(tv_layer, (12, 12))
tx, ty = 56, 110
hero.alpha_composite(shadow(frame), (tx - 44, ty - 44))
hero.alpha_composite(frame, (tx, ty))

for i, (name, x, y) in enumerate([("phone-question", 1070, 170), ("phone-locked", 1330, 250)]):
    ph = phone_frame(load(name), 228)
    hero.alpha_composite(shadow(ph), (x - 44, y - 44))
    hero.alpha_composite(ph, (x, y))

save(hero.convert("RGB"), "hero", quality=85)

# The TV's "How to play" walkthrough uses some of these same screens.
HOWTO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "howto")
if os.path.isdir(HOWTO):
    for f in os.listdir(HOWTO):
        src = os.path.join(OUT, f)
        if os.path.exists(src):
            with open(src, "rb") as a, open(os.path.join(HOWTO, f), "wb") as b:
                b.write(a.read())

print("wrote", len(os.listdir(OUT)), "images to", OUT)
