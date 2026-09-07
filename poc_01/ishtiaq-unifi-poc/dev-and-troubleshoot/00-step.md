# Create and run and access each device individually
* cd devices
 
## 1.  Single Dockerfile: 
* Shared Container Image (or Monorepo Container) pattern
* All devices/microservices/scripts share the exact same runtime environment and dependencies.
* Base image and Runtime: Node.js 22 on a slim (minimal) Debian base 
* Run Express/gRPC-JS. 
### WORKDIR /app:
* Every subsequent COPY, RUN, and the eventual CMD execute relative to this path
* 
### npm ci (vs npm install) installs exactly what's in package-lock.json
* No CMD at the end: waiting to be told what to run
* No CMD at the end — that's deliberate here too, since the whole point is that 
- the command varies per container: 
- docker-compose.yml supplies it via each service's command: 
- node camera-rest/index.js, and with podman you supply it directly on
- podman run ... poc-devices node camera-rest/index.js.

## 2. Alternative to Single Dockerfile:
* A Dockerfile for each device
* Each Dockerfile ending with a specific command like 
- CMD ["npx", "ts-node", "camera-rest/index.ts"].

## 3. The "How" (Mechanics)
* FROM node:22-slim: Provides the base operating system and Node 22 runtime.
* When you run podman build, 
- the RUN npm ci command executes directly inside the /app directory. 
- This generates a single node_modules/ folder right at the root of /app.
- When COPY . . executes immediately after, 
- it drops all your device folders right next to it. 
- The internal filesystem of your resulting Docker image looks exactly like this:
- /app/
  ├── node_modules/         <-- The single, shared dependency pool
  ├── _shared/
  │   └── rest-simulator.ts
  ├── camera-rest/
  │   └── index.ts
  ├── switch-rest/
  │   └── index.ts
  └── package.json
* podman run:
- Every single container you launch from the unifi-devices image receives an 
- identical, complete copy of that exact directory tree. 
- Because you built one unified image (the blueprint), 
- Podman stamps out an exact clone of that internal filesystem for every new 
- container you create.
- The camera-rest container will have the switch-rest/ code inside it, 
- but it simply never executes it.
- The switch-rest container will have the camera-rest/ code inside it, 
- but ignores it.
- Every container has its own isolated access to the shared /app/node_modules/ folder.
- The unused files sit harmlessly inside each respective container. 
- Because Podman uses a layered filesystem, having the "extra" device folders 
- in every container does not waste any additional space on your host machine's 
- hard drive—all the running containers are just pointing back to the same 
- read-only underlying image layer.
