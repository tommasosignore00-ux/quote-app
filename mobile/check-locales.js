const fs = require('fs');

const ref = JSON.parse(fs.readFileSync('locales/it.json','utf8'));

function getKeys(obj, prefix) {
  prefix = prefix || '';
  let keys = [];
  for (const k of Object.keys(obj)) {
    const full = prefix ? prefix+'.'+k : k;
    if (typeof obj[k] === 'object' && obj[k] !== null) {
      keys = keys.concat(getKeys(obj[k], full));
    } else {
      keys.push(full);
    }
  }
  return keys;
}

const refKeys = getKeys(ref).sort();
console.log('Reference (it.json) keys: ' + refKeys.length);
console.log(refKeys.join('\n'));
console.log('\n---\n');

const files = fs.readdirSync('locales').filter(function(f) { return f.endsWith('.json') && f !== 'it.json'; });
files.sort().forEach(function(f) {
  const data = JSON.parse(fs.readFileSync('locales/'+f, 'utf8'));
  const keys = getKeys(data).sort();
  const missing = refKeys.filter(function(k) { return keys.indexOf(k) === -1; });
  const extra = keys.filter(function(k) { return refKeys.indexOf(k) === -1; });
  if (missing.length > 0 || extra.length > 0) {
    console.log(f + ':');
    if (missing.length > 0) console.log('  MISSING: ' + missing.join(', '));
    if (extra.length > 0) console.log('  EXTRA: ' + extra.join(', '));
  }
});
console.log('\nDone.');
