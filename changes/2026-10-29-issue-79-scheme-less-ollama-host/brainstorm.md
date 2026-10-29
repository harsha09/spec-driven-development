# Brainstorm

> **Issue 79 scheme-less Ollama host** · approaches compared before design. Not a final design, and not an acceptance.

The issue already names two options. This stage records that comparison. The prefix is the one this change builds.

## A. Prefix `http://` inside `chatUrl`

When `new URL` would throw, try once more with `http://` in front. `http://` and `https://` stay as written. `decide.ts` and the ask text stay.

Chosen. `127.0.0.1:11434` and `localhost:11434` become a chat URL. A value that still does not parse stays on the ask path.

## B. A distinct error when the variable is set and is not a URL

The person can tell a typo from an unset variable. That message has to leave the shared missing path in `decide.ts` and the one human string in `routeRole`.

Not this change. The issue allows it. The prefix is the smaller option and matches the host Ollama itself accepts.

## C. A default host and port

Fill in `127.0.0.1:11434` when the variable is missing.

Rejected. A missing variable must still ask the human and write no row.
