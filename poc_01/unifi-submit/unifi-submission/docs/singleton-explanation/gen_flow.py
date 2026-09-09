import sys
sys.path.insert(0, "/home/claude/diagrams-src")
from seqgen import render

participants = ["Node", "clientFactory.ts", "restClient", "MonitoringService", "Device"]

steps = [
    {"type": "note", "at": "clientFactory.ts", "label": "PHASE 1 \u2014 module load, happens ONCE"},
    {"from": "Node", "to": "clientFactory.ts", "label": "first import (from ANY file)"},
    {"from": "clientFactory.ts", "to": "restClient", "label": "new RestDeviceClient()"},
    {"from": "restClient", "to": "clientFactory.ts", "label": "instance created", "type": "return"},
    {"type": "note", "at": "clientFactory.ts", "label": "module cached \u2014 future imports\\nreuse this, code above never re-runs"},

    {"type": "note", "at": "MonitoringService", "label": "PHASE 2 \u2014 request time, happens on EVERY registration"},
    {"from": "MonitoringService", "to": "clientFactory.ts", "label": "discoverProtocol(address)"},
    {"from": "clientFactory.ts", "to": "restClient", "label": "restClient.discoverCapabilities(address)"},
    {"type": "note", "at": "restClient", "label": "this is the SAME instance\\nbuilt back in Phase 1"},
    {"from": "restClient", "to": "Device", "label": "GET /health"},
    {"from": "Device", "to": "restClient", "label": "200 { protocol, capabilities }", "type": "return"},
    {"from": "restClient", "to": "clientFactory.ts", "label": "Capabilities", "type": "return"},
    {"from": "clientFactory.ts", "to": "MonitoringService", "label": "{ protocol: 'rest', capabilities }", "type": "return"},
]

svg = render(participants, steps, "restClient: built once (Phase 1), reused every request (Phase 2)", width=1180)
open("/home/claude/singleton-demo/flow-diagram.svg", "w").write(svg)
print("written")
