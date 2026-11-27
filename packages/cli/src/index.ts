import { defineCommand, runMain } from "citty";
import { unknownArgProblem } from "./argv.js";
import { commands } from "./commands.js";
import { projectRoot } from "./project.js";
import { formatCliVersion } from "./version-report.js";
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

const argv = process.argv.slice(2);
const problem = await unknownArgProblem(argv);
if (problem) {
  process.stderr.write(`${problem}\n`);
  process.exit(2);
}

if (argv.some((arg) => arg === "--version" || arg === "-v")) {
  process.stdout.write(`${await formatCliVersion(projectRoot())}\n`);
  process.exit(0);
}

await runMain(main);
