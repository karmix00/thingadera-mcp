# Thingadera MCP

The right words for UI patterns, inside your AI tool.

Most back-and-forth with an AI builder is fixing things nobody named. Ask for "a loading state" and you get a spinner. Ask for "a skeleton screen shaped like the result cards" and you get it right the first time. This server gives your AI the names, the rules for when each pattern fits, and a way to do that prep before it writes any UI.

It's the same library and logic as [thingadera-f23e191e.base44.app](https://thingadera-f23e191e.base44.app): the full pattern library, the clashes between them, platform and audience rules, and the prep.

## Tools

| Tool | What it does |
| --- | --- |
| `find_ui_pattern` | "panel that slides up from the bottom" → **Bottom sheet**, a prompt line to build it, what it's confused with, what it clashes with, when it's overused |
| `check_pattern_combination` | `["toast", "inline validation"]` → breaks: a toast disappears before people can fix the error. Plus platform and audience cautions |
| `build_ui_prompt` | A few answers (what, platform, setting, tone, big decisions) → one precise prompt, with what's still undecided |
| `get_prep_options` | The valid answers for `build_ui_prompt`, so the AI can ask you a few quick questions |
| `check_prompt_for_vague_words` | "make it pop and modern" → why each phrase fails and specific words to use instead |
| `list_ui_patterns` | The whole library by category |

No account, no API key, nothing sent anywhere. It runs on your machine.

## Install

Requires Node 18 or newer.

**Claude Code**
```
claude mcp add thingadera -- npx -y thingadera-mcp
```

**Claude Desktop, Cursor, Windsurf, and others** — add this to the MCP config:
```json
{
  "mcpServers": {
    "thingadera": { "command": "npx", "args": ["-y", "thingadera-mcp"] }
  }
}
```

## Get the most out of it

AI tools decide on their own when to call a tool. To make sure yours does the prep first, add one line to your project rules (`CLAUDE.md`, `.cursorrules`, or similar):

```
Before building or changing UI, use the thingadera tools: name each pattern with find_ui_pattern, check the combination, and build from build_ui_prompt.
```

## Does it help?

We tested it blind. Four one-line UI requests were each built twice by the same AI model, once with no tools and once with Thingadera plus the rules line above, and a separate AI judged the drafts without knowing which was which. With Thingadera, three of four drafts came out better: the right overlay for each platform, real buttons and accessible controls, fewer emoji standing in for icons, and data that added up. The one loss (content hidden until you scroll) led to a fix in the build notes, and the rebuilt draft passed the automated checks.

Without the rules line, the model never called the tools. Add it.

Small sample, and AI judging AI. Treat it as a signal, not proof.

## Examples

> "Add a filter panel to my recipe results page, on phone and desktop. Make it pop."

With Thingadera the AI can look up that a filter panel on phones is usually a **bottom sheet** and on desktop a **drawer**, check that a bottom sheet clashes with a floating action button, and replace "make it pop" with something specific, like one accent color used only on the main button.

## License

MIT. Made by [Paavan Patel](https://x.com/paav_in140chr).
