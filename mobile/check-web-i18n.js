const fs = require('fs');

// Dynamically load the web i18n to extract resources
const content = fs.readFileSync('../web/lib/i18n.ts', 'utf8');

// Extract the resources object - find all language blocks
const langPattern = /^\s{2}(\w{2}):\s*\{\s*\n\s*translation:\s*\{/gm;
const langs = [];
let m;
while ((m = langPattern.exec(content)) !== null) {
  langs.push(m[1]);
}

console.log('Languages found in web i18n: ' + langs.join(', ') + ' (' + langs.length + ')\n');

// For each language, extract the keys by finding section names and their keys
function extractSections(langCode) {
  // Find the translation block for this language
  const blockStart = content.indexOf(langCode + ': {\n    translation: {');
  if (blockStart === -1) {
    // Try inline format
    const altStart = content.indexOf(langCode + ':\n    {\n    translation: {');
    if (altStart === -1) return null;
  }
  
  // Find from translation: { to the closing },\n  },
  const start = content.indexOf('translation: {', blockStart);
  // Find the end - look for the closing of translation block
  let depth = 0;
  let end = -1;
  let inString = false;
  let escape = false;
  for (let i = start + 'translation: '.length; i < content.length; i++) {
    const c = content[i];
    if (escape) { escape = false; continue; }
    if (c === '\\') { escape = true; continue; }
    if (c === "'" && !inString) { inString = true; continue; }
    if (c === "'" && inString) { inString = false; continue; }
    if (inString) continue;
    if (c === '{') depth++;
    if (c === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  
  if (end === -1) return null;
  const block = content.substring(start, end + 1);
  
  // Extract section.key patterns
  const sections = {};
  // Match section: { key: 'value', ... }
  const sectionRegex = /(\w+):\s*\{([^}]+)\}/g;
  let sm;
  while ((sm = sectionRegex.exec(block)) !== null) {
    const sectionName = sm[1];
    if (sectionName === 'translation') continue;
    const body = sm[2];
    const keyRegex = /(\w+):\s*['"`]/g;
    let km;
    const keys = [];
    while ((km = keyRegex.exec(body)) !== null) {
      keys.push(sectionName + '.' + km[1]);
    }
    sections[sectionName] = keys;
  }
  
  return sections;
}

// Get IT as reference (most complete)
const itSections = extractSections('it');
const itKeys = [];
for (const s in itSections) {
  itKeys.push.apply(itKeys, itSections[s]);
}
itKeys.sort();
console.log('Reference (it) web keys: ' + itKeys.length);
console.log('Sections: ' + Object.keys(itSections).join(', ') + '\n');

// Check each language
let allGood = true;
for (const lang of langs) {
  if (lang === 'it') continue;
  const sections = extractSections(lang);
  if (!sections) {
    console.log(lang + ': COULD NOT PARSE');
    allGood = false;
    continue;
  }
  const keys = [];
  for (const s in sections) {
    keys.push.apply(keys, sections[s]);
  }
  keys.sort();
  
  const missing = itKeys.filter(function(k) { return keys.indexOf(k) === -1; });
  const extra = keys.filter(function(k) { return itKeys.indexOf(k) === -1; });
  
  const missingSections = Object.keys(itSections).filter(function(s) { return !sections[s] || sections[s].length === 0; });
  
  if (missing.length > 0 || missingSections.length > 0) {
    allGood = false;
    console.log(lang + ': ' + keys.length + ' keys');
    if (missingSections.length > 0) console.log('  MISSING SECTIONS: ' + missingSections.join(', '));
    if (missing.length > 0) console.log('  MISSING KEYS (' + missing.length + '): ' + missing.join(', '));
  } else {
    console.log(lang + ': OK (' + keys.length + ' keys)');
  }
}

console.log('\n' + (allGood ? 'ALL WEB TRANSLATIONS COMPLETE' : 'SOME WEB TRANSLATIONS HAVE ISSUES'));
