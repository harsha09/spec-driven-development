import { defineCommand, runMain } from "citty";
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

await runMain(main);
