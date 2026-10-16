// Zips kick-hd/ into dist/kick-pure-<version>.xpi (an .xpi is a zip with manifest.json at its root).
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const src = path.join(__dirname, "../kick-hd");
const { version } = JSON.parse(fs.readFileSync(path.join(src, "manifest.json"), "utf8"));
const out = path.join(__dirname, "../dist", `kick-pure-${version}.xpi`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.rmSync(out, { force: true });
// Windows: use System32's bsdtar, since Git Bash's GNU tar cannot write zips. macOS tar is bsdtar. Linux CI has zip.
if (process.platform === "win32") execFileSync(path.join(process.env.SystemRoot, "System32", "tar.exe"), ["-a", "-cf", out, "-C", src, ...fs.readdirSync(src)]);
else if (process.platform === "darwin") execFileSync("tar", ["-a", "-cf", out, "-C", src, ...fs.readdirSync(src)]);
else execFileSync("zip", ["-qr", out, ...fs.readdirSync(src)], { cwd: src });
console.log(out);
