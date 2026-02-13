const { spawn } = require("child_process");
const path = require("path");

// Launch Electron with ELECTRON_RUN_AS_NODE removed to avoid run-as-node mode.
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const electronPath = path.join(__dirname, "..", "node_modules", "electron", "dist", "electron.exe");
const mainEntry = path.join(__dirname, "main.cjs");

const child = spawn(electronPath, [mainEntry], {
  stdio: "inherit",
  env,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
