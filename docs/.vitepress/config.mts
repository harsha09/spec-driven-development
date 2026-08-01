import { defineConfig } from "vitepress";

/**
 * Project site on GitHub Pages:
 *   https://harsha09.github.io/spec-driven-development/
 */
const base = process.env.DOCS_BASE || "/spec-driven-development/";
const siteOrigin = "https://harsha09.github.io";
const siteUrl = `${siteOrigin}/spec-driven-development`;
const siteName = "sdd — Structured Vibe Coding";
const defaultDescription =
  "Local Spec-Driven Development CLI for AI coding agents. Keep decisions in git — from a one-line hotfix to a new product or enterprise ARB. No IDE extension required.";

/** Ensure sitemap locs include the GitHub Pages project base path. */
function withProjectBase(url: string): string {
  try {
    const parsed = new URL(url, siteOrigin);
    let path = parsed.pathname;
    if (!path.startsWith("/spec-driven-development")) {
      path =
        path === "/" || path === ""
          ? "/spec-driven-development/"
          : `/spec-driven-development${path.startsWith("/") ? path : `/${path}`}`;
    }
    if (!path.endsWith("/") && !/\.[a-z0-9]+$/i.test(path)) {
      path += "/";
    }
    return `${siteOrigin}${path}`;
  } catch {
    return url;
  }
}

export default defineConfig({
  title: siteName,
  titleTemplate: ":title · sdd",
  description: defaultDescription,
  base,
  cleanUrls: true,
  lastUpdated: true,
  ignoreDeadLinks: "localhostLinks",
  lang: "en-US",
  appearance: true,

  // Discoverable by search engines (emitted as sitemap.xml)
  sitemap: {
    hostname: siteOrigin,
    transformItems(items) {
      return items.map((item) => ({
        ...item,
        url: withProjectBase(item.url),
      }));
    },
  },

  head: [
    ["meta", { name: "theme-color", content: "#0f172a" }],
    ["meta", { name: "author", content: "Structured Vibe Coding" }],
    [
      "meta",
      {
        name: "keywords",
        content:
          "sdd, spec-driven development, structured vibe coding, AI coding agent, local SDD, CLI, greenfield, Copilot, Claude Code, Grok, Ollama",
      },
    ],
    ["meta", { name: "robots", content: "index, follow" }],
    ["link", { rel: "canonical", href: `${siteUrl}/` }],

    // Open Graph
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:site_name", content: siteName }],
    ["meta", { property: "og:locale", content: "en_US" }],
    ["meta", { property: "og:url", content: `${siteUrl}/` }],
    ["meta", { property: "og:title", content: siteName }],
    ["meta", { property: "og:description", content: defaultDescription }],

    // Twitter
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
    ["meta", { name: "twitter:title", content: siteName }],
    ["meta", { name: "twitter:description", content: defaultDescription }],

    // JSON-LD: SoftwareApplication + WebSite
    [
      "script",
      { type: "application/ld+json" },
      JSON.stringify({
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "WebSite",
            name: siteName,
            url: siteUrl,
            description: defaultDescription,
            inLanguage: "en-US",
          },
          {
            "@type": "SoftwareApplication",
            name: "sdd",
            alternateName: ["Structured Vibe Coding", "spec-driven-development"],
            applicationCategory: "DeveloperApplication",
            operatingSystem: "macOS, Linux, Windows",
            description: defaultDescription,
            url: siteUrl,
            downloadUrl: "https://www.npmjs.com/package/@structured-vibe-coding/cli",
            softwareVersion: "0.13",
            license: "https://opensource.org/licenses/MIT",
            offers: {
              "@type": "Offer",
              price: "0",
              priceCurrency: "USD",
            },
            author: {
              "@type": "Organization",
              name: "Structured Vibe Coding",
              url: "https://github.com/harsha09/spec-driven-development",
            },
          },
        ],
      }),
    ],
  ],

  transformPageData(pageData) {
    const path = pageData.relativePath.replace(/(^|\/)index\.md$/, "$1").replace(/\.md$/, "");
    const urlPath = path === "" || path === "index" ? "/" : `/${path}/`;
    const pageUrl = `${siteUrl}${urlPath === "/" ? "/" : urlPath}`;
    const title = pageData.title
      ? `${pageData.title} · sdd`
      : siteName;
    const description =
      pageData.description || pageData.frontmatter?.description || defaultDescription;

    pageData.frontmatter.head ??= [];
    pageData.frontmatter.head.push(
      ["meta", { property: "og:title", content: title }],
      ["meta", { property: "og:description", content: description }],
      ["meta", { property: "og:url", content: pageUrl }],
      ["meta", { name: "twitter:title", content: title }],
      ["meta", { name: "twitter:description", content: description }],
      ["link", { rel: "canonical", href: pageUrl }],
    );
  },

  themeConfig: {
    siteTitle: "sdd",
    nav: [
      { text: "Get started", link: "/tutorials/first-change" },
      { text: "What is sdd", link: "/concepts/what-is-sdd" },
      {
        text: "Paths",
        items: [
          { text: "New product (greenfield)", link: "/guides/greenfield" },
          { text: "Simple feature", link: "/guides/simple-feature" },
          { text: "Enterprise / ARB", link: "/guides/enterprise" },
          { text: "Everyday loop", link: "/guides/everyday-loop" },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "Workflows", link: "/reference/workflows" },
          { text: "AI agents", link: "/reference/agents" },
          { text: "CLI commands", link: "/reference/cli" },
          { text: "Project layout", link: "/reference/layout" },
        ],
      },
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
          { text: "Your first change (10 min)", link: "/tutorials/first-change" },
          { text: "What is sdd?", link: "/concepts/what-is-sdd" },
          { text: "Why sdd exists", link: "/concepts/why-sdd" },
          { text: "What you can achieve", link: "/concepts/what-you-can-achieve" },
        ],
      },
      {
        text: "Paths",
        items: [
          { text: "New product (greenfield)", link: "/guides/greenfield" },
          { text: "Simple feature", link: "/guides/simple-feature" },
          { text: "Enterprise / ARB", link: "/guides/enterprise" },
          { text: "Everyday loop", link: "/guides/everyday-loop" },
        ],
      },
      {
        text: "Concepts",
        items: [
          { text: "Change packs & memory", link: "/concepts/change-packs" },
          { text: "Agents vs IDEs", link: "/concepts/agents-vs-ides" },
        ],
      },
      {
        text: "How to",
        items: [
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
        text: "Maintainers",
        items: [
          { text: "Scenario evaluation", link: "/scenarios/evaluation" },
          { text: "CI / CD", link: "/maintainers/ci-cd" },
        ],
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
      options: {
        detailedView: true,
      },
    },

    editLink: {
      pattern:
        "https://github.com/harsha09/spec-driven-development/edit/main/docs/:path",
      text: "Edit this page",
    },

    footer: {
      message: "MIT Licensed · Local Spec-Driven Development",
      copyright: "sdd — Structured Vibe Coding",
    },

    outline: { level: [2, 3] },
  },
});
