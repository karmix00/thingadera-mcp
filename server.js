#!/usr/bin/env node
// Thingadera MCP server: the right words for UI patterns, inside your AI tool.
'use strict';
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const core = require('./core');

const server = new McpServer({ name: 'thingadera', version: '0.1.0' });
const PLAT = z.array(z.enum(['web', 'ios', 'android', 'watch', 'tv'])).optional().describe('Where the UI runs. Rules out patterns that do not fit, e.g. hamburger menus on iPhone.');
const USE = z.enum(['any', 'education', 'finance', 'health', 'retail', 'older', 'kids', 'internal']).optional().describe('Who it is for. Marks patterns to avoid for that audience.');
const out = (o) => ({ content: [{ type: 'text', text: JSON.stringify(o, null, 2) }] });
// Optional local call log for testing: THINGADERA_LOG=/path/file.jsonl (off by default, never sent anywhere)
const LOG = process.env.THINGADERA_LOG;
const _reg = server.registerTool.bind(server);
server.registerTool = (name, cfg, fn) => _reg(name, cfg, async (a) => { if (LOG) { try { require('fs').appendFileSync(LOG, JSON.stringify({ t: Date.now(), tool: name, args: a }) + '\n'); } catch (e) {} } return fn(a); });

server.registerTool('find_ui_pattern', {
  title: 'Find a UI pattern by description',
  description: 'Turn a plain-language description of a UI element ("gray boxes while stuff loads", "panel that slides up from the bottom") into its standard name, a precise prompt line to build it, what it is often confused with, what it clashes with, and when it is overused. Call this whenever a request describes UI vaguely, BEFORE writing UI code, so you build the pattern the person actually means.',
  inputSchema: { description: z.string().min(2).describe('How the person described it, in their words.'), platforms: PLAT, use: USE },
}, async (a) => out(core.findPattern(a)));

server.registerTool('check_pattern_combination', {
  title: 'Check UI patterns for conflicts',
  description: 'Check a set of UI patterns for pairs that break or clash (e.g. toast + inline validation), patterns that do not fit the platform, and audience cautions. Returns ready-to-use prompt rules. Call this before building a screen that combines several patterns.',
  inputSchema: { patterns: z.array(z.string()).min(1).describe('Pattern names or ids, e.g. ["toast", "inline validation", "bottom sheet"].'), platforms: PLAT, use: USE },
}, async (a) => out(core.checkCombination(a)));

server.registerTool('get_prep_options', {
  title: 'Options for building a UI prompt',
  description: 'List the valid answers for build_ui_prompt: kinds of UI, starting points, platforms, audiences, input methods, settings, tones, and the big-piece decisions (navigation, how details open, loading, errors, style...) with their options. Use it to ask the person a few quick questions before building.',
  inputSchema: {},
}, async () => out(core.prepOptions()));

server.registerTool('build_ui_prompt', {
  title: 'Build one clear UI prompt (the prep)',
  description: 'Do the prep before building UI: from a few answers (what it is, platform, setting, tone, and the big decisions), produce one precise prompt that names the right patterns, rules out ones that do not fit, avoids common AI defaults, and lists what is still undecided. Use the returned "prompt" as your build instructions. If "undecided" is not empty, ask the person or decide deliberately.',
  inputSchema: {
    what: z.string().optional().describe('One sentence: what is being built, e.g. "a weekly meal planner for busy parents".'),
    kind: z.enum(['screen', 'flow', 'landing', 'dashboard', 'component', 'chat']).optional(),
    start: z.enum(['scratch', 'existing', 'redesign']).optional(),
    platforms: PLAT, use: USE,
    parity: z.enum(['same', 'native']).optional().describe('With several platforms: same patterns everywhere, or native on each.'),
    inputs: z.array(z.enum(['touch', 'pointer', 'keyboard', 'remote', 'voice', 'screenreader'])).optional(),
    settings: z.array(z.enum(['desk', 'go', 'glance', 'couch', 'bright'])).optional().describe('Where people use it: desk, on the go one-handed, in quick glances, relaxed on a couch, outdoors in bright light.'),
    density: z.enum(['compact', 'comfortable']).optional(),
    tone: z.enum(['playful', 'balanced', 'serious']).optional(),
    voice: z.enum(['quiet', 'expressive']).optional(),
    decisions: z.record(z.string()).optional().describe('Big pieces already decided, by key (see get_prep_options), e.g. {"nav":"tab-bar","detail":"bottom-sheet","loading":"skeleton"}.'),
    complaints: z.array(z.string()).optional().describe('Customer complaints or reviews, verbatim. They are matched to the UX problem behind them.'),
    existing: z.string().optional().describe('For existing products: what is already there (components, conventions).'),
    fixes: z.array(z.enum(['dated', 'cluttered', 'nav', 'generic', 'inconsistent', 'slow'])).optional().describe('For redesigns: what is not working.'),
    mustKeep: z.string().optional(),
  },
}, async (a) => out(core.buildPrompt(a)));

server.registerTool('check_prompt_for_vague_words', {
  title: 'Find vague words in a UI prompt',
  description: 'Find vague design words in a prompt ("make it pop", "modern", "clean", "user-friendly") that make AI fall back on generic defaults, with specific replacements for each. Call this on a UI request before building from it.',
  inputSchema: { text: z.string().min(3), platforms: PLAT, use: USE },
}, async (a) => out(core.checkPrompt(a)));

server.registerTool('list_ui_patterns', {
  title: 'List the pattern library',
  description: 'List all UI patterns Thingadera knows (id, name, category), optionally for one category.',
  inputSchema: { category: z.string().optional() },
}, async (a) => out({ categories: core.categories(), patterns: core.listPatterns(a) }));

(async () => {
  core.load(); // warm the page once so the first call is fast
  await server.connect(new StdioServerTransport());
})();
