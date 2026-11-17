#!/usr/bin/env python3
"""Check that a mascot SVG follows the peekaboo parts contract.

Usage: python3 check_mascot_svg.py mascot.svg [--width 80 --height 100] [--no-keepsake]

Checks: parseable XML, a viewBox whose aspect ratio matches width:height, the pb-* parts the CSS animates, no scripts,
external references or raster images, and that the keepsake reaches the top of the drawing (it is what stays above the edge).
Exit code 0 when everything passes, 1 otherwise.
"""
import argparse
import re
import sys
import xml.etree.ElementTree as ET

NUMBER = re.compile(r"-?\d*\.?\d+(?:e-?\d+)?", re.I)


def local(tag):
    return tag.rsplit("}", 1)[-1]


def classes(element):
    return set((element.get("class") or "").split())


ARITY = {"m": 2, "l": 2, "h": 1, "v": 1, "c": 6, "s": 4, "q": 4, "t": 2, "a": 7, "z": 0}


def path_ys(d):
    """Y values of every end and control point in a path; control points make this a safe outer bound."""
    ys, x, y, start = [], 0.0, 0.0, (0.0, 0.0)
    for command, body in re.findall(r"([MLHVCSQTAZmlhvcsqtaz])([^MLHVCSQTAZmlhvcsqtaz]*)", d):
        values = [float(v) for v in NUMBER.findall(body)]
        kind, relative = command.lower(), command.islower()
        if kind == "z":
            x, y = start
            continue
        size = ARITY[kind]
        for index in range(0, len(values) - size + 1, size):
            chunk = values[index:index + size]
            if kind == "h":
                x = x + chunk[0] if relative else chunk[0]
            elif kind == "v":
                y = y + chunk[0] if relative else chunk[0]
                ys.append(y)
            elif kind == "a":
                x, y = (x + chunk[5], y + chunk[6]) if relative else (chunk[5], chunk[6])
                ys.extend([y - chunk[1], y])
            else:
                for px, py in zip(chunk[0::2], chunk[1::2]):
                    ys.append(y + py if relative else py)
                x, y = (x + chunk[-2], y + chunk[-1]) if relative else (chunk[-2], chunk[-1])
                ys.append(y)
            if kind == "m" and index == 0:
                start = (x, y)
            if kind == "m":
                kind = "l"
    return ys


def topmost_y(element):
    """Rough smallest y used by an element (path coordinates are approximated by absolute numbers)."""
    tag = local(element.tag)
    try:
        if tag in ("circle", "ellipse"):
            radius = float(element.get("r") or element.get("ry") or 0)
            return float(element.get("cy", 0)) - radius
        if tag == "rect":
            return float(element.get("y", 0))
        if tag in ("polygon", "polyline"):
            values = [float(v) for v in NUMBER.findall(element.get("points", ""))]
            return min(values[1::2]) if values else None
        if tag == "path":
            ys = path_ys(element.get("d", ""))
            return min(ys) if ys else None
    except ValueError:
        return None
    return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("svg")
    parser.add_argument("--width", type=float, default=80)
    parser.add_argument("--height", type=float, default=100)
    parser.add_argument("--no-keepsake", action="store_true", help="the mascot leaves nothing above the edge")
    args = parser.parse_args()

    errors, warnings = [], []
    try:
        root = ET.parse(args.svg).getroot()
    except (ET.ParseError, OSError) as error:
        print(f"FAIL cannot read SVG: {error}")
        return 1
    if local(root.tag) != "svg":
        errors.append("root element is not <svg>")

    view_box = [float(v) for v in NUMBER.findall(root.get("viewBox", ""))]
    if len(view_box) != 4:
        errors.append("missing or invalid viewBox (expected 'minX minY width height')")
    else:
        ratio, expected = view_box[2] / view_box[3], args.width / args.height
        if abs(ratio - expected) > 0.02:
            errors.append(f"viewBox ratio {ratio:.3f} differs from width:height {expected:.3f}; the figure would be letterboxed")

    elements = list(root.iter())
    found = {name: [e for e in elements if name in classes(e)] for name in ("pb-face", "pb-eyes", "pb-pupils", "pb-keepsake")}
    for name in ("pb-eyes", "pb-pupils"):
        if not found[name]:
            errors.append(f"no element with class {name} (needed for {'blinking' if name == 'pb-eyes' else 'looking around'})")
    if not found["pb-face"]:
        warnings.append("no pb-face group; the face will not shift when looking left/right")
    if found["pb-pupils"] and found["pb-eyes"] and not any(
        p in set(e.iter()) for e in found["pb-eyes"] for p in found["pb-pupils"]
    ):
        warnings.append("pb-pupils is outside pb-eyes; pupils will stay open while the eyes blink")

    for element in elements:
        tag = local(element.tag)
        if tag in ("script", "foreignObject", "image"):
            errors.append(f"<{tag}> is not allowed; keep the mascot pure vector and inert")
        for key, value in element.attrib.items():
            if local(key).startswith("on"):
                errors.append(f"event handler attribute {local(key)} is not allowed")
            if local(key) == "href" and not value.startswith("#"):
                errors.append(f"external reference {value!r} is not allowed")

    if not args.no_keepsake:
        if not found["pb-keepsake"]:
            errors.append("no element with class pb-keepsake (the part left above the edge); pass --no-keepsake if intended")
        elif len(view_box) == 4:
            tops = [y for e in elements if (y := topmost_y(e)) is not None]
            keep = [y for k in found["pb-keepsake"] for e in k.iter() if (y := topmost_y(e)) is not None]
            if tops and keep and min(keep) > min(tops) + view_box[3] * 0.06:
                warnings.append("pb-keepsake does not seem to reach the top of the drawing; only the top ~14% stays visible")

    for message in errors:
        print(f"FAIL {message}")
    for message in warnings:
        print(f"WARN {message}")
    if not errors:
        print("OK mascot SVG follows the peekaboo parts contract")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
