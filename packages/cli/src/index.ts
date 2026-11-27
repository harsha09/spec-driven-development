import { defineCommand, runMain } from "citty";
import { unknownArgProblem } from "./argv.js";
import { commands } from "./commands.js";
import { SDD_VERSION } from "./version.js";

const main = defineCommand({
  meta: {
    name: "sdd",
    description:
      "Keep short plans next to your code. Process coach for you + your AI coding agent.",
    version: SDD_VERSION,
  },
  subCommands: commands,
});

const problem = await unknownArgProblem(process.argv.slice(2));
if (problem) {
  process.stderr.write(`${problem}\n`);
  process.exit(2);
}

// Handoff refresh runs while the change is being saved, before a command reads
// its own args. Record the flag here so that refresh does not walk the repo.
if (process.argv.includes("--no-agent")) {
  process.env.SDD_NO_AGENT = "1";
}

await runMain(main);
