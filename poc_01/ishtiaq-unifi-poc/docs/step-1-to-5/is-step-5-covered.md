# Do the following
cd devices
podman-compose down
podman-compose up -d --build

cd ../db
podman-compose down          # NOT down -v — keep your data
podman-compose up -d

cd ../monitoring-service
podman-compose down
podman-compose up --build -d
