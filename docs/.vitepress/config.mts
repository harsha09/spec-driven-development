import { defineConfig } from "vitepress";

/**
 * Project site on GitHub Pages:
 *   https://<user>.github.io/spec-driven-development/
 */
const base = process.env.DOCS_BASE || "/spec-driven-development/";

export default defineConfig({
  title: "Structured Vibe Coding",
  description:
    "Local Spec-Driven Development (sdd) — CLI process + AI agents for solo teams through enterprise.",
  base,
  cleanUrls: true,
  lastUpdated: true,
  ignoreDeadLinks: "localhostLinks",

  head: [
    ["meta", { name: "theme-color", content: "#0f172a" }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:title", content: "Structured Vibe Coding (sdd)" }],
    [
      "meta",
      {
        property: "og:description",
        content:
          "Local Spec-Driven Development for engineers and AI agents — hotfix to enterprise ARB.",
      },
    ],
  ],

  themeConfig: {
    siteTitle: "sdd",
    nav: [
      { text: "What is sdd", link: "/concepts/what-is-sdd" },
      { text: "Simple feature", link: "/guides/simple-feature" },
      { text: "Enterprise", link: "/guides/enterprise" },
      { text: "Workflows", link: "/reference/workflows" },
      { text: "Agents", link: "/reference/agents" },
      { text: "CLI", link: "/reference/cli" },
      {
        text: "GitHub",
        link: "https://github.com/harsha09/spec-driven-development",
      },
    ],

    sidebar: [
      {
        text: "Overview",
        items: [
          { text: "Home", link: "/" },
          { text: "What is sdd?", link: "/concepts/what-is-sdd" },
          { text: "What you can achieve", link: "/concepts/what-you-can-achieve" },
          { text: "Why sdd exists", link: "/concepts/why-sdd" },
          { text: "Change packs & memory", link: "/concepts/change-packs" },
          { text: "Agents vs IDEs", link: "/concepts/agents-vs-ides" },
        ],
      },
      {
        text: "How to",
        items: [
          { text: "First change (tutorial)", link: "/tutorials/first-change" },
          { text: "Simple feature", link: "/guides/simple-feature" },
          { text: "Enterprise path", link: "/guides/enterprise" },
          { text: "Everyday loop", link: "/guides/everyday-loop" },
          { text: "AI agents setup", link: "/guides/agents" },
          { text: "Refine a stage", link: "/guides/refine" },
          { text: "Code context (AST)", link: "/guides/code-context" },
          { text: "Customize workflows", link: "/guides/customize" },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "Built-in workflows", link: "/reference/workflows" },
          { text: "Available agents", link: "/reference/agents" },
          { text: "CLI commands", link: "/reference/cli" },
          { text: "Project layout", link: "/reference/layout" },
        ],
      },
      {
        text: "More",
        items: [
          { text: "Scenario evaluation", link: "/scenarios/evaluation" },
          { text: "CI / CD (maintainers)", link: "/maintainers/ci-cd" },
        ],
      },
    ],

    socialLinks: [
      {
        icon: "github",
        link: "https://github.com/harsha09/spec-driven-development",
      },
    ],

    search: { provider: "local" },

    editLink: {
      pattern:
        "https://github.com/harsha09/spec-driven-development/edit/main/docs/:path",
      text: "Edit this page",
    },

    footer: {
      message: "MIT Licensed · Local Spec-Driven Development",
      copyright: "Structured Vibe Coding (sdd)",
    },

    outline: { level: [2, 3] },
  },
});
