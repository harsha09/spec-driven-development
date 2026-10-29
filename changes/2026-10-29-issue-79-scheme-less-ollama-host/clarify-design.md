# Clarify design

> **Issue 79 scheme-less Ollama host** · architect seams checked against the reading. Not an acceptance.

The change is `chatUrl`. `decide.ts` and `routeRole` stay. A scheme-less host is called over `http`. A value that still does not parse returns `called: false`.
