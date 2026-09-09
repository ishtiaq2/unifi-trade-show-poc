class Greeter {
  constructor() { console.log("[Greeter constructor running — only on first import]"); }
  greet(name: string) { return `hello, ${name}`; }
}
const singleton = new Greeter();
export function useSingleton(name: string) { return singleton.greet(name); }
