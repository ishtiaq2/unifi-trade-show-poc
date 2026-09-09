## Build and start rest
cd monitoring-service
podman-compose up --build

curl -s -X DELETE localhost:3000/devices/<id-from-step-2> -w " -> %{http_code}\n"
# Expect 204

curl -s -o /dev/null -w "after delete -> %{http_code}\n" localhost:3000/devices/<same-id>
# Expect 404

#### Watch the logs in another terminal while you run these — you should see one 
- structured JSON line per registration/removal, not per request:
* podman logs -f monitoring-service_rest_1
