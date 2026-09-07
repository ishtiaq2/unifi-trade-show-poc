# Diagram sources

Regenerate any diagram after a design change:

```bash
# Graphviz diagrams (architecture, data model, deployment)
dot -Tsvg architecture.dot -o ../architecture.svg
dot -Tsvg data-model.dot -o ../data-model.svg
dot -Tsvg deployment.dot -o ../deployment.svg

# Sequence diagrams (hand-built SVG generator, no browser dependency)
python3 gen_registration.py
python3 gen_poll.py
```

`state-machine.svg` has no source file here — Graphviz's automatic
layout produced overlapping labels for it twice (once with the default
layout engine, once with manual `neato` positioning), so it was
hand-written directly as SVG instead. Edit `../state-machine.svg` in a
text editor if it needs to change; the arrow/label coordinates are
plain numbers near the top of the file.
