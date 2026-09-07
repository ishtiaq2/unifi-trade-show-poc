"""
Minimal sequence-diagram-to-SVG generator. Purpose-built for these two
diagrams, not a general library — participants are evenly spaced
columns, steps are drawn top to bottom with automatically computed
vertical spacing, so arrows can't overlap or run off-canvas the way the
hand-coordinated version did.
"""

def render(participants, steps, title, width=980):
    n = len(participants)
    margin = 110
    usable = width - 2 * margin
    col_x = [margin + i * (usable / (n - 1)) for i in range(n)]
    col_of = {name: col_x[i] for i, name in enumerate(participants)}

    top = 70
    row_h = 52
    height = top + len(steps) * row_h + 60

    svg = [f'<svg viewBox="0 0 {width} {height}" xmlns="http://www.w3.org/2000/svg" '
           f'font-family="Helvetica, Arial, sans-serif">']
    svg.append(f'<rect width="{width}" height="{height}" fill="white"/>')
    svg.append('<defs>'
                '<marker id="a" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">'
                '<path d="M0,0 L8,3 L0,6 Z" fill="#2b6cb0"/></marker>'
                '<marker id="ar" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">'
                '<path d="M0,0 L8,3 L0,6 Z" fill="#718096"/></marker>'
                '</defs>')

    svg.append(f'<text x="{width/2}" y="30" text-anchor="middle" font-size="18" '
                f'font-weight="bold">{title}</text>')

    # lifelines
    bottom = top + len(steps) * row_h + 20
    for name in participants:
        x = col_of[name]
        svg.append(f'<rect x="{x-70}" y="45" width="140" height="30" rx="5" '
                    f'fill="#2d3748"/>')
        svg.append(f'<text x="{x}" y="65" text-anchor="middle" fill="white" '
                    f'font-size="12" font-weight="bold">{name}</text>')
        svg.append(f'<line x1="{x}" y1="75" x2="{x}" y2="{bottom}" '
                    f'stroke="#cbd5e0" stroke-width="1.5"/>')

    y = top + 40
    for step in steps:
        kind = step.get("type", "call")
        if kind == "note":
            x = col_of[step["at"]]
            text = step["label"]
            w = max(160, 8 * max(len(line) for line in text.split("\\n")))
            svg.append(f'<rect x="{x-w/2}" y="{y-16}" width="{w}" height="{14*len(text.split(chr(92)+chr(110)))+10}" '
                        f'fill="#fefcbf" stroke="#d69e2e" rx="3"/>')
            for i, line in enumerate(text.split("\\n")):
                svg.append(f'<text x="{x}" y="{y+i*14}" text-anchor="middle" '
                            f'font-size="11" font-style="italic">{line}</text>')
            y += 14 * len(text.split("\\n")) + 20
            continue

        x1, x2 = col_of[step["from"]], col_of[step["to"]]
        dashed = ' stroke-dasharray="6,3"' if kind == "return" else ""
        marker = "ar" if kind == "return" else "a"
        color = "#718096" if kind == "return" else "#2b6cb0"
        svg.append(f'<line x1="{x1}" y1="{y}" x2="{x2}" y2="{y}" '
                    f'stroke="{color}" stroke-width="1.8"{dashed} marker-end="url(#{marker})"/>')
        mid = (x1 + x2) / 2
        label = step["label"]
        anchor = "middle"
        lx = mid
        if abs(x1 - x2) < 5:  # self-call, offset label to the right
            svg.append(f'<path d="M {x1},{y} C {x1+70},{y-2} {x1+70},{y+18} {x1},{y+18}" '
                        f'fill="none" stroke="{color}" stroke-width="1.8" marker-end="url(#{marker})"/>')
            lx = x1 + 78
            anchor = "start"
            y += 10
        text_color = "#4a5568" if kind == "return" else "#1a202c"
        svg.append(f'<text x="{lx}" y="{y-6}" text-anchor="{anchor}" font-size="11.5" '
                    f'fill="{text_color}">{label}</text>')
        y += row_h

    svg.append('</svg>')
    return "\n".join(svg)
