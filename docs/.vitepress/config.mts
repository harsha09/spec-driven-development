import { defineConfig } from "vitepress";

/**
 * Project site on GitHub Pages:
 *   https://<user>.github.io/spec-driven-development/
 * Set base to '/' only for a custom domain or user/org site.
 */
const base = process.env.DOCS_BASE || "/spec-driven-development/";

export default defineConfig({
  title: "Structured Vibe Coding",
  description:
    "Local-first Spec-Driven Development (sdd) — process CLI + your AI coding agent. Spec Kit–style, no IDE extension required.",
  base,
  cleanUrls: true,
  lastUpdated: true,
  ignoreDeadLinks: true,

  head: [
    ["meta", { name: "theme-color", content: "#0f172a" }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:title", content: "Structured Vibe Coding (sdd)" }],
    [
      "meta",
      {
        property: "og:description",
        content:
          "Flexible, local-first Spec-Driven Development for engineers and AI agents.",
      },
    ],
  ],

  themeConfig: {
    logo: undefined,
    siteTitle: "sdd",
    nav: [
      { text: "Home", link: "/" },
      { text: "Tutorial", link: "/tutorials/first-change" },
      { text: "Guides", link: "/guides/agents" },
      { text: "Reference", link: "/reference/cli" },
      { text: "Concepts", link: "/concepts/why-sdd" },
      {
        text: "GitHub",
        link: "https://github.com/harsha09/spec-driven-development",
      },
    ],

    sidebar: [
      {
        text: "Start here",
        items: [
          { text: "Home", link: "/" },
          { text: "How we write docs", link: "/how-we-write" },
          { text: "Tutorial: first change", link: "/tutorials/first-change" },
        ],
      },
      {
        text: "Guides (how-to)",
        items: [
          { text: "AI agents (init + hosts)", link: "/guides/agents" },
          { text: "Refine a stage", link: "/guides/refine" },
          { text: "Code context (AST)", link: "/guides/code-context" },
          { text: "Everyday loop", link: "/guides/everyday-loop" },
          { text: "Customize workflows", link: "/guides/customize" },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "CLI commands", link: "/reference/cli" },
          { text: "Project layout", link: "/reference/layout" },
        ],
      },
      {
        text: "Concepts (why)",
        items: [
          { text: "Why sdd exists", link: "/concepts/why-sdd" },
          { text: "Change packs & memory", link: "/concepts/change-packs" },
          { text: "Agents vs IDEs", link: "/concepts/agents-vs-ides" },
        ],
      },
      {
        text: "Scenarios",
        items: [{ text: "Scenario evaluation", link: "/scenarios/evaluation" }],
      },
      {
        text: "Maintainers",
        items: [{ text: "CI / CD", link: "/maintainers/ci-cd" }],
      },
    ],

    socialLinks: [
      {
        icon: "github",
        link: "https://github.com/harsha09/spec-driven-development",
      },
    ],

    search: {
      provider: "local",
    },

    editLink: {
      pattern:
        "https://github.com/harsha09/spec-driven-development/edit/main/docs/:path",
      text: "Edit this page",
    },

    footer: {
      message: "MIT Licensed · Local-first Spec-Driven Development",
      copyright: "Structured Vibe Coding (sdd)",
    },

    outline: {
      level: [2, 3],
    },
  },
});
