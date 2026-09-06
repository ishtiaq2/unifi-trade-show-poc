const grpc = require("@grpc/grpc-js");
const { loadDeviceProto } = require("./grpc-simulator");

const target = process.argv[2] || "localhost:4005";
const deviceProto = loadDeviceProto();
const client = new deviceProto.DeviceService(target, grpc.credentials.createInsecure());

client.getHealth({}, (err, res) => {
  if (err) return console.error("getHealth error:", err.message);
  console.log("health:", res);
  client.getDiagnostics({}, (err2, res2) => {
    if (err2) return console.error("getDiagnostics error:", err2.message);
    console.log("diagnostics:", res2);
    process.exit(0);
  });
});
