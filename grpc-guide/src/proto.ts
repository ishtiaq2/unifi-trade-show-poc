/**
 * Loads tutorial.proto at runtime, rather than generating .ts stubs
 * ahead of time with `protoc`. This is "dynamic loading" — the
 * TutorialService object below doesn't exist until this file runs.
 *
 * The alternative (code generation) produces real, importable TypeScript
 * types and is what you'd want for a large production system — see the
 * note at the bottom of README.md. Dynamic loading is faster to get
 * started with and is what this tutorial (and the actual device
 * simulators in ../devices) uses, so understanding it well is worth
 * doing before reaching for codegen.
 */
import path from "path";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";

const PROTO_PATH = path.join(__dirname, "..", "proto", "tutorial.proto");

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  // keepCase: false means proto's fieldName style maps directly to JS
  // camelCase (this .proto already uses camelCase, so this mostly
  // matters for fields written snake_case, which would otherwise arrive
  // as snake_case in JS too). Get client and server disagreeing on this
  // option and fields silently show up as `undefined` — no error, just
  // missing data. This is a real bug worth reproducing on purpose later
  // in this guide.
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const proto = grpc.loadPackageDefinition(packageDefinition) as any;

export const TutorialService = proto.tutorial.TutorialService;
export { grpc };
