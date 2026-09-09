// The exact pattern from clientFactory.ts, stripped to its essence.

class Greeter {
  constructor() {
    console.log("[Greeter constructor running]");
  }
  greet(name: string) {
    return `hello, ${name}`;
  }
}

// This line runs ONCE — the moment this file is first loaded by Node,
// not when anyone calls a function in it. This is line 1 of the file's
// own execution, same as any other top-level statement.
const singleton = new Greeter();

// This function does NOT create a Greeter. It doesn't receive one as a
// parameter either. It just references `singleton` — the same way it
// could reference any other variable declared above it in the file.
// This is called a "closure": every function remembers the scope it was
// defined in.
export function useSingleton(name: string) {
  return singleton.greet(name);
}

console.log("--- file finished loading, now calling the function ---");
console.log(useSingleton("Alice"));
console.log(useSingleton("Bob"));
console.log(useSingleton("Carol"));
