import { useSingleton } from "./shared-module";
console.log("[caller-A] importing shared-module...");
console.log("[caller-A]", useSingleton("from A"));
