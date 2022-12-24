---
id: text-block
title: Text blocks
---

Use text blocks to include Markdown or unformatted text as a block, useful for README content and other exposition.

## Usage

```yaml
layout:
  row:
    title: 'Introduction'
    description: 'Each box can have a title and description'
    type: text
    props:
      file: 'README.md'
```

- The file content will be parsed as Markdown and displayed in the box.
- Row height will auto-fit to match the length of the text for long text blocks.
