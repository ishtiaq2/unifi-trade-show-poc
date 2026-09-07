const path = require("path");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
// FIXED: matches the server's keepCase:false
const pkg = protoLoader.loadSync(path.join(__dirname, "snake_case.proto"), {
  keepCase: false, longs: String, enums: String, defaults: true, oneofs: true,
});
const proto = grpc.loadPackageDefinition(pkg).pitfall;
const client = new proto.SnakeService("localhost:50052", grpc.credentials.createInsecure());
client.getThing({}, (err, res) => {
  console.log("res.hardwareVersion ->", res.hardwareVersion);
  process.exit(0);
});
