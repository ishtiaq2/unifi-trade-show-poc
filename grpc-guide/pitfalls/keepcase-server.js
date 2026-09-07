const path = require("path");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const pkg = protoLoader.loadSync(path.join(__dirname, "snake_case.proto"), {
  keepCase: false, longs: String, enums: String, defaults: true, oneofs: true,
});
const proto = grpc.loadPackageDefinition(pkg).pitfall;

const server = new grpc.Server();
server.addService(proto.SnakeService.service, {
  getThing: (_call, cb) => cb(null, { hardwareVersion: "HW-1.0" }),
});
server.bindAsync("0.0.0.0:50052", grpc.ServerCredentials.createInsecure(), () => {
  console.log("keepcase demo server up");
});
