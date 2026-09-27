import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readExecutionProfile } from "./execution-profile.mjs";

const [command, ...args] = process.argv.slice(2);
if (!["dev", "build"].includes(command)) throw new Error("Expected dev or build.");
const managedLinux = readExecutionProfile() === "managed-linux";

let linkBridge;
let stoppingLinkBridge = false;
if (!managedLinux && command === "dev") {
  const launchBridge = () => {
    linkBridge = spawn(process.execPath, [fileURLToPath(new URL("./media-link-bridge.mjs", import.meta.url))], {
      stdio: "inherit",
      windowsHide: true,
    });
    linkBridge.once("exit", code => {
      if (!stoppingLinkBridge && code !== 0) {
        console.warn("AnimeFace link bridge stopped unexpectedly; restarting…");
        setTimeout(launchBridge, 1_000);
      }
    });
  };
  launchBridge();
  const stopBridge = () => { stoppingLinkBridge = true; if (linkBridge && !linkBridge.killed) linkBridge.kill(); };
  process.once("exit", stopBridge);
  process.once("SIGINT", () => { stopBridge(); process.exit(130); });
  process.once("SIGTERM", () => { stopBridge(); process.exit(143); });
}

if (managedLinux && command === "build") {
  const result = spawnSync("bash", [
    fileURLToPath(new URL("./build-verified.sh", import.meta.url)), ...args,
  ], { stdio: "inherit" });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

// Import in this process so the preview owner retains its PID and signals.
const cli = new URL(managedLinux
  ? "../node_modules/vite/bin/vite.js"
  : "../node_modules/vinext/dist/cli.js", import.meta.url);
process.argv = [process.execPath, fileURLToPath(cli), command,
  ...(!managedLinux && command === "dev" ? ["--port", "5173"] : []), ...args];
await import(cli.href);
