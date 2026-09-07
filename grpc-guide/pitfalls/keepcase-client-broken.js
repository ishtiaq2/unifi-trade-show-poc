const path = require("path");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
// MISMATCH: client uses keepCase:true, server used keepCase:false
const pkg = protoLoader.loadSync(path.join(__dirname, "snake_case.proto"), {
  keepCase: true, longs: String, enums: String, defaults: true, oneofs: true,
});
const proto = grpc.loadPackageDefinition(pkg).pitfall;
const client = new proto.SnakeService("localhost:50052", grpc.credentials.createInsecure());
client.getThing({}, (err, res) => {
  console.log("Raw response object:", res);
  console.log("res.hardwareVersion  ->", res.hardwareVersion);
  console.log("res.hardware_version ->", res.hardware_version);
  process.exit(0);
});
