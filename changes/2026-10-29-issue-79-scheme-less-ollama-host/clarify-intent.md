# Clarify intent

> **Issue 79 scheme-less Ollama host** · proposals from the research assistant, product manager, product owner, and architect. Not an acceptance.

## Q1. Which of the two issue options?

Prefix `http://` when the value has no `http:` or `https:` start. The product manager found no open question. A distinct error would change the shared ask path.

## Q2. What stays on the ask path?

A missing variable, a blank variable, and a value that is still not a URL after the prefix. Exit stays 0. Fetch is not called. No decision row is written.
