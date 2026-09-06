const { createGrpcDevice } = require("../_shared/grpc-simulator");
const profile = require("./profile");

const server = createGrpcDevice(profile);
server.bindAsync(
  `0.0.0.0:${profile.port}`,
  require("@grpc/grpc-js").ServerCredentials.createInsecure(),
  (err) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log(`[${profile.name}] gRPC device simulator listening on :${profile.port}`);
  },
);
