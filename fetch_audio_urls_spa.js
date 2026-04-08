/**
 * fetch_audio_urls_spa.js
 * Fetches Spanish + English audio URLs for all Oaks talks from the church API
 * Run: node fetch_audio_urls_spa.js
 */
const fs = require('fs');
const path = require('path');

const TALKS_FILE = path.join(__dirname, 'talks_data', 'oaks_talks.js');
const OUT_FILE = path.join(__dirname, 'talks_data', 'oaks_audio_urls.js');

// Load talk data
const window = {};
eval(fs.readFileSync(TALKS_FILE, 'utf-8'));
const talks = window._oaksTalksData;
console.log('Total talks:', talks.length);

const API_BASE = 'https://www.churchofjesuschrist.org/study/api/v3/language-pages/type/content';

async function fetchAudioUrl(talkUri, lang) {
  const url = `${API_BASE}?uri=${encodeURIComponent(talkUri)}&lang=${lang}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const str = JSON.stringify(data);
    const audioMatch = str.match(/"audio"\s*:\s*\[([^\]]*)\]/);
    if (audioMatch) {
      const mediaMatch = audioMatch[1].match(/"mediaUrl"\s*:\s*"([^"]+)"/);
      if (mediaMatch) return mediaMatch[1];
    }
    return null;
  } catch (e) {
    console.error('  Error fetching', talkUri, lang, e.message);
    return null;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const audioMap = {};
  let spaCount = 0, engCount = 0;

  for (let i = 0; i < talks.length; i++) {
    const talk = talks[i];
    const uri = talk.uri.replace('/study', '');
    console.log(`[${i + 1}/${talks.length}] ${talk.id} ...`);

    // Fetch Spanish audio
    const spaUrl = await fetchAudioUrl(uri, 'spa');
    // Fetch English audio
    const engUrl = await fetchAudioUrl(uri, 'eng');

    if (spaUrl || engUrl) {
      audioMap[talk.id] = {};
      if (spaUrl) { audioMap[talk.id].spa = spaUrl; spaCount++; }
      if (engUrl) { audioMap[talk.id].eng = engUrl; engCount++; }
      console.log(`  spa: ${spaUrl ? 'YES' : 'no'} | eng: ${engUrl ? 'YES' : 'no'}`);
    } else {
      console.log('  no audio found');
    }

    // Rate limit: 200ms between requests
    await sleep(200);
  }

  console.log(`\nResults: ${spaCount} Spanish, ${engCount} English audio URLs`);

  const output = 'window._oaksAudioUrls = ' + JSON.stringify(audioMap, null, 2) + ';\n';
  fs.writeFileSync(OUT_FILE, output, 'utf-8');
  console.log('Written to', OUT_FILE);
}

main().catch(console.error);
