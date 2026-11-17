#!/usr/bin/env python3
"""Check that a reference image can be used to design a peekaboo mascot.

Only the technical side is checked here (file type, size, dimensions). Whether the subject is eligible (consent,
content, copyright) is a judgment call; see references/from-image.md.

Usage: check_reference_image.py path/to/image [--max-mb 20] [--min-side 128]
Exit code 0 when there is no FAIL.
"""
import argparse
import os
import struct
import sys


def png_size(data):
    if data[:8] == b"\x89PNG\r\n\x1a\n" and data[12:16] == b"IHDR":
        return struct.unpack(">II", data[16:24])
    return None


def gif_size(data):
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return struct.unpack("<HH", data[6:10])
    return None


def webp_size(data):
    if data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        return None
    chunk = data[12:16]
    if chunk == b"VP8 " and len(data) >= 30:
        w, h = struct.unpack("<HH", data[26:30])
        return w & 0x3FFF, h & 0x3FFF
    if chunk == b"VP8L" and len(data) >= 25:
        b = data[21:25]
        w = 1 + (((b[1] & 0x3F) << 8) | b[0])
        h = 1 + (((b[3] & 0x0F) << 10) | (b[2] << 2) | ((b[1] & 0xC0) >> 6))
        return w, h
    if chunk == b"VP8X" and len(data) >= 30:
        w = 1 + int.from_bytes(data[24:27], "little")
        h = 1 + int.from_bytes(data[27:30], "little")
        return w, h
    return None


def jpeg_size(data):
    if data[:2] != b"\xff\xd8":
        return None
    i = 2
    while i + 9 < len(data):
        if data[i] != 0xFF:
            i += 1
            continue
        marker = data[i + 1]
        if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7:
            i += 2
            continue
        length = struct.unpack(">H", data[i + 2:i + 4])[0]
        if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
            h, w = struct.unpack(">HH", data[i + 5:i + 9])
            return w, h
        i += 2 + length
    return None


READERS = {"PNG": png_size, "JPEG": jpeg_size, "GIF": gif_size, "WebP": webp_size}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("image")
    parser.add_argument("--max-mb", type=float, default=20)
    parser.add_argument("--min-side", type=int, default=128)
    args = parser.parse_args()

    results = []
    if not os.path.isfile(args.image):
        print(f"FAIL file not found: {args.image}")
        return 1
    with open(args.image, "rb") as f:
        data = f.read()

    size_mb = len(data) / 1_048_576
    results.append(("FAIL" if size_mb > args.max_mb else "OK", f"file size {size_mb:.1f} MB (max {args.max_mb:g} MB)"))

    kind, dims = None, None
    for name, reader in READERS.items():
        try:
            dims = reader(data)
        except (struct.error, IndexError):
            dims = None
        if dims:
            kind = name
            break
    if not kind:
        head = data[:200].lstrip().lower()
        if head.startswith(b"<svg") or head.startswith(b"<?xml"):
            results.append(("WARN", "SVG reference: read it as an image or as text, but never paste it into the mascot; draw new art"))
        else:
            results.append(("FAIL", "unsupported format: use PNG, JPEG, WebP or GIF (ask for a screenshot of anything else)"))
    else:
        w, h = dims
        results.append(("OK", f"{kind} {w} x {h} px"))
        short = min(w, h)
        if short < args.min_side:
            results.append(("FAIL", f"too small: short side {short} px < {args.min_side} px, details will be guesses"))
        elif short < 256:
            results.append(("WARN", f"small: short side {short} px; ask for a larger image if features are unclear"))
        if max(w, h) > 6 * short:
            results.append(("WARN", "very narrow image; the subject may be cropped"))
        if kind == "GIF":
            results.append(("WARN", "GIF: only the first frame is used"))

    for level, message in results:
        print(f"{level} {message}")
    failed = any(level == "FAIL" for level, _ in results)
    print("FAIL image cannot be used as is" if failed else "OK image is technically usable; now check eligibility")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
