# Clarify intent

> **Issue 78 long model names** · proposals from the product manager, product owner, and architect. Not an acceptance.

## Q1. Which field is exempt?

The `model` key only. The 32-character rule stays on every other string.

## Q2. What stays rejected inside that field?

PEM (`-----BEGIN`) and a no-whitespace `name=value` assignment. The error sentence stays `models.yaml has a secret value.` The value is not printed.
