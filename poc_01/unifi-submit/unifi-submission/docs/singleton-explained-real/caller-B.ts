import { useSingleton } from "./shared-module";
console.log("[caller-B] importing shared-module...");
console.log("[caller-B]", useSingleton("from B"));
