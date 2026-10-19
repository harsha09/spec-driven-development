let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  raw += chunk;
});
process.stdin.on("end", () => {
  const input = JSON.parse(raw);
  const prompt = typeof input.prompt === "string" ? input.prompt : "";
  const label = /^(Job|Description|Task|Kind|Section|Decision|Check ids|Section text|Cite|Draft|Gaps):/;
  const block = (name) => {
    const lines = prompt.split(/\r?\n/);
    const start = lines.findIndex((line) => line === name);
    if (start < 0) return [];
    const out = [];
    for (const line of lines.slice(start + 1)) {
      if (label.test(line)) break;
      if (line.trim().length > 0) out.push(line);
    }
    return out;
  };
  let result;
  if (prompt.includes("changed must list every gap cite.")) {
    const changed = block("Gaps:")
      .filter((line) => line.includes(":"))
      .map((line) => line.slice(0, line.indexOf(":")));
    const text = "Revised draft.";
    result = {
      text,
      changed,
      action: {
        name: "write_file",
        words: "Write the draft.",
        inputs: { path: "notes/draft.md", contents: text },
      },
    };
  } else if (prompt.includes("Draft:") && prompt.includes("Cite:")) {
    const cite = block("Check ids:")[0] ?? "";
    result = {
      text: "Checked the draft.",
      gaps: [{ cite, text: "The draft misses this check." }],
    };
  } else {
    result = { text: "Draft from the local example." };
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
});
