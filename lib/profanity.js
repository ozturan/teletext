const filter = require('leo-profanity');
filter.loadDictionary('en');
filter.add([
  'nazi', 'hitler', 'rape', 'molest', 'pedo', 'pedophile',
  'kike', 'spic', 'chink', 'wetback', 'beaner', 'gook',
  'tranny', 'dyke', 'coon', 'raghead', 'towelhead',
  'tard', 'retarded', 'jizz', 'skank',
  'cum', 'deepthroat', 'blowjob', 'handjob', 'hentai',
  'porn', 'pornography', 'xxx', 'onlyfans',
  'kill yourself', 'kys', 'suicide', 'self-harm',
  'nigger', 'nigga', 'niggers', 'n1gger', 'n1gga',
  'faggot', 'faggots', 'fag', 'fags',
]);

function containsRestrictedWord(text) {
  if (!text) return false;
  try {
    const clean = text.replace(/[\u200B-\u200F\u2028-\u202F\u2060-\u206F\uFEFF\u00AD]/g, '');
    if (filter.check(clean)) return true;
    const noSpaces = clean.replace(/[\s_.,\-]+/g, '');
    if (noSpaces !== clean && filter.check(noSpaces)) return true;
    const normalized = clean.replace(/[@4]/g,'a').replace(/[0]/g,'o').replace(/[1!|]/g,'i').replace(/[3]/g,'e').replace(/[5$]/g,'s');
    if (normalized !== clean && filter.check(normalized)) return true;
    if (/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(clean)) return true;
    if (/\b\d{3}[\-\.]\d{3}[\-\.]\d{4}\b/.test(clean)) return true;
    if (/\b\d{3}[\s\-]\d{2}[\s\-]\d{4}\b/.test(clean)) return true;
  } catch {}
  return false;
}

module.exports = containsRestrictedWord;
