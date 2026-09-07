import sys
sys.path.insert(0, ".")
from seqgen import render

participants = ["Client", "HTTP", "Service", "Repository", "DeviceClient", "Device", "Postgres"]

steps = [
    {"from": "Client", "to": "HTTP", "label": "POST /devices  { name, address }"},
    {"from": "HTTP", "to": "Service", "label": "registerDevice(name, address)"},
    {"from": "Service", "to": "Repository", "label": "findByAddress(address)"},
    {"from": "Repository", "to": "Postgres", "label": "SELECT ... WHERE address = $1"},
    {"from": "Postgres", "to": "Repository", "label": "no existing row", "type": "return"},
    {"type": "note", "at": "Service", "label": "not a duplicate — proceed"},
    {"from": "Service", "to": "Repository", "label": "createDevice(name, address)"},
    {"from": "Repository", "to": "Postgres", "label": "INSERT INTO devices ..."},
    {"from": "Postgres", "to": "Repository", "label": "new device row", "type": "return"},
    {"from": "Service", "to": "DeviceClient", "label": "discoverProtocol(address)"},
    {"from": "DeviceClient", "to": "Device", "label": "GET /health   (try REST first)"},
    {"type": "note", "at": "Device", "label": "responds with its own\\ncapabilities + protocol"},
    {"from": "Device", "to": "DeviceClient", "label": "200  { protocol, capabilities }", "type": "return"},
    {"from": "Service", "to": "Repository", "label": "setCapabilities(id, protocol, caps)"},
    {"from": "Repository", "to": "Postgres", "label": "UPDATE devices SET protocol = ..."},
    {"from": "Service", "to": "HTTP", "label": "device (with protocol resolved)", "type": "return"},
    {"from": "HTTP", "to": "Client", "label": "201 Created", "type": "return"},
]

svg = render(participants, steps, "Device Registration + Capability Discovery  (POST /devices)", width=1180)
open("/home/claude/unifi-submission/docs/images/sequence-registration.svg", "w").write(svg)
print("written")
