// Thingadera core: runs the same logic as the website, from the same file (site.html),
// so the MCP and the site never disagree. The page loads once in a headless DOM.
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const SITE = 'https://thingadera-f23e191e.base44.app';
let W = null;

function load() {
  if (W) return W;
  const html = fs.readFileSync(path.join(__dirname, 'site.html'), 'utf8');
  const vc = new VirtualConsole(); // keep the page's console off stdout (stdout is the MCP channel)
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://thingadera.local/', virtualConsole: vc,
    beforeParse(win) {
      win.scrollTo = () => {};
      win.matchMedia = win.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
      win.fetch = () => Promise.resolve({ ok: false, json: async () => ({}) });
    },
  });
  W = dom.window;
  return W;
}
const ev = (src) => load().eval(src);
const J = (v) => JSON.stringify(v);

// ---- context (platform + audience) ----
function platformIds() { return ev("PLATFORMS.filter(p=>p.id!=='any').map(p=>p.id)"); }
function useIds() { return ev("USES.map(u=>u.id)"); }
function setContext(platforms = [], use = 'any', parity = 'native') {
  const ok = new Set(platformIds());
  const pl = (platforms || []).filter((p) => ok.has(p));
  ev(`plats=${J(pl)}; parity=${J(parity === 'same' ? 'same' : 'native')}; useCase=${J(useIds().includes(use) ? use : 'any')};`);
}

function termCard(id) {
  return ev(`(()=>{ const t=BY_ID[${J(id)}]; if(!t) return null;
    const cl=clashesFor(t.id).map(c=>({with:BY_ID[c.other].term, id:c.other, level:c.lvl==='hard'?'breaks':'clashes', why:c.why, fix:c.fix}));
    const o=(typeof OVER!=='undefined'&&OVER[t.id])||null; const na=naFor(t); const uf=useFor(t);
    return {id:t.id, term:t.term, category:t.cat, alsoCalled:t.aka, definition:t.def,
      promptLine:snippetFor(t),
      notToBeConfusedWith:t.not.map(n=>({id:n[0], term:n[1], difference:n[2]})),
      clashesWith:cl,
      overuse:o?{limit:o.limit, signOfOveruse:o.sign, why:o.why, reachForInstead:(o.instead||[]).map(([i,w])=>({id:i, term:(BY_ID[i]||{}).term, when:w}))}:null,
      platformNote:na||null, audienceNote:uf&&uf.lvl!=='good'?{level:uf.lvl, why:uf.why}:null,
      isAiDefaultToAvoid:!!t.slop };
  })()`);
}

// ---- tools ----
function findPattern({ description, platforms, use }) {
  setContext(platforms, use);
  // "make it pop", "modern", "clean" describe a feeling, not a pattern: send those to the vague-word check instead of guessing
  const vague = ev(`deslopFindings(${J(description)}).map(v=>v.k)`);
  const rest = vague.reduce((s, k) => s.replace(new RegExp(k.replace(/[-\s]+/g, '[-\\s]*'), 'ig'), ' '), description).replace(/\b(make|it|and|look|feel|more|very|the|a|an)\b/gi, ' ').trim();
  if (vague.length && rest.length < 4) {
    const v = checkPrompt({ text: description, platforms, use });
    return { found: false, message: `“${description}” describes a feeling, not a UI pattern. Replace it with specific choices.`, vagueWords: v.vagueWords };
  }
  const hits = ev(`score(${J(description)}).slice(0,3).map(r=>({id:r.t.id, score:Math.round(r.s*10)/10}))`);
  if (!hits.length) return { found: false, message: `No pattern in the library matches “${description}”. Try other words, or describe what it looks like and when it appears.`, browse: SITE + '/#all' };
  const best = hits[0], strong = best.score >= 4;
  return {
    found: true,
    confidence: strong ? 'good match' : 'weak match: check the alternatives',
    best: { ...termCard(best.id), page: `${SITE}/#${best.id}` },
    alternatives: hits.slice(1).map((h) => { const t = termCard(h.id); return { id: t.id, term: t.term, definition: t.definition, page: `${SITE}/#${t.id}` }; }),
  };
}

function resolveIds(names) {
  const ids = [], unknown = [];
  for (const n of names || []) {
    const id = ev(`(()=>{ const t=BY_ID[${J(n)}]||findTerm(${J(n)}); return t?t.id:null; })()`);
    if (id && !ids.includes(id)) ids.push(id); else if (!id) unknown.push(n);
  }
  return { ids, unknown };
}

function checkCombination({ patterns, platforms, use }) {
  setContext(platforms, use);
  const { ids, unknown } = resolveIds(patterns);
  ev(`combo=${J(ids)};`);
  const r = ev(`(()=>{ const r=comboReport(); const n=id=>BY_ID[id].term;
    return {patterns:combo.map(n),
      breaks:r.hard.map(c=>({a:n(c[0]), b:n(c[1]), why:c[3], fix:c[4]})),
      clashes:r.soft.map(c=>({a:n(c[0]), b:n(c[1]), why:c[3], fix:c[4]})),
      wrongForPlatform:r.plat.map(t=>({pattern:t.term, why:naFor(t)})),
      avoidForAudience:r.uAvoid.map(t=>({pattern:t.term, why:useFor(t).why})),
      careForAudience:r.uCare.map(t=>({pattern:t.term, why:useFor(t).why})),
      cautions:r.warns.map(t=>({pattern:t.term, note:t.warn})),
      promptRules:comboRules()}; })()`);
  ev('combo=[];');
  return { ...r, unknownNames: unknown, verdict: r.breaks.length ? 'Some of these break each other. Fix those before building.' : r.clashes.length || r.wrongForPlatform.length || r.avoidForAudience.length ? 'Workable, with the cautions listed.' : 'No known conflicts.' };
}

const KIND_IDS = ['screen', 'flow', 'landing', 'dashboard', 'component', 'chat'];
function prepOptions() {
  return ev(`({kinds:KINDS, starts:STARTS, platforms:PLATFORMS.filter(p=>p.id!=='any').map(p=>[p.id,p.label]), uses:USES.filter(u=>u.id!=='any').map(u=>[u.id,u.label]),
    inputs:INPUTS, settings:ENVS, densities:DENS, tones:MOODS, voices:VOICES, fixes:FIXES,
    decisions:DECISIONS.map(d=>({key:d.key, label:d.label, forKinds:d.kinds||'all', options:d.opts.filter(id=>BY_ID[id]).map(id=>[id,BY_ID[id].term])}))})`);
}

function buildPrompt(a) {
  setContext(a.platforms, a.use, a.parity);
  const brief = {
    step: 0, what: a.what || '', kind: KIND_IDS.includes(a.kind) ? a.kind : '', start: ['scratch', 'existing', 'redesign'].includes(a.start) ? a.start : '',
    voice_in: (a.complaints || []).join('\n'), details: {}, env: a.settings || [], allow: [], have: a.existing || '', fix: a.fixes || [], keep: a.mustKeep || '',
    picks: {}, input: a.inputs || [], density: a.density || '', mood: a.tone || '', voice: a.voice || '', swaps: {}, removed: [], sel: null,
  };
  ev(`brief=Object.assign(brief, ${J(brief)}); combo=[];`);
  // decisions: accept ids or names for each decision key, only options valid for that decision
  const picks = {}, rejected = [];
  for (const [k, v] of Object.entries(a.decisions || {})) {
    const id = ev(`(()=>{ const d=decisionsFor().find(d=>d.key===${J(k)}); if(!d) return null; const t=BY_ID[${J(v)}]||findTerm(${J(v)}); return t&&d.opts.includes(t.id)?t.id:null; })()`);
    if (id) picks[k] = id; else rejected.push(`${k}: ${v}`);
  }
  ev(`brief.picks=${J(picks)}; brief.step=STEPS_FN().length;`);
  const out = ev(`(()=>{ const r=briefResult(); const n=id=>BY_ID[id].term;
    const open=decisionsFor().filter(d=>!brief.picks[d.key]).map(d=>({key:d.key, question:d.label, options:d.opts.filter(id=>BY_ID[id]&&!naFor(BY_ID[id])).map(id=>({id, term:n(id)}))})).filter(d=>d.options.length);
    return {prompt:fullPrompt(), patternsNamed:r.good.map(n), avoid:r.avoid.map(([id,why])=>({pattern:n(id), why})), aiDefaultsToAvoid:r.slop.map(n),
      undecided:brief.start==='existing'?[]:open, complaintsMatched:voiceMatches().map(m=>({problem:m.sy.issue, fix:m.sy.fix, quotes:m.hits}))}; })()`);
  return { ...out, rejectedDecisions: rejected, note: out.undecided.length ? 'Some big pieces are still undecided. Ask the user, then call build_prompt again with decisions, or let the AI decide.' : undefined };
}

function checkPrompt({ text, platforms, use }) {
  setContext(platforms, use);
  const found = ev(`deslopFindings(${J(text)}).map(v=>({phrase:v.k, why:v.why, sayInstead:v.opts.map(([w,id])=>({words:w, pattern:(BY_ID[id]||{}).term||null}))}))`);
  return { vagueWords: found, aiDefaultsToAvoid: ev('SLOP_IDS().map(id=>BY_ID[id].term)'), verdict: found.length ? `Found ${found.length} vague phrase${found.length > 1 ? 's' : ''}. Replace each with one of the specific options.` : 'No known vague phrases. Check that each part of the UI is named with a real pattern.' };
}

function listPatterns({ category } = {}) {
  return ev(`TERMS.filter(t=>!${J(category || '')}||t.cat.toLowerCase()===${J((category || '').toLowerCase())}).map(t=>({id:t.id, term:t.term, category:t.cat}))`);
}
function categories() { return ev('CATS'); }

module.exports = { load, findPattern, checkCombination, buildPrompt, checkPrompt, prepOptions, listPatterns, categories, termCard, platformIds, useIds, SITE };
