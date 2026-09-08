/**
 * The Portuguese reader page, from the Spanish one.
 *
 * Same engine, different data. Only three kinds of thing change: BOOK_DATA's
 * display names, the interface strings, and the landing covers. Everything
 * else — the renderer, the view modes, the lazy book loader, the search — is
 * shared code that does not know or care which language it is showing.
 *
 * Usage: node tools/build_page.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(process.env.HOME, 'Desktop', 'Spanish BOM Interlinear', 'index.html');
const OUT = path.join(ROOT, 'index.html');
const BOOKS = JSON.parse(fs.readFileSync(path.join(__dirname, 'books_pt.json'), 'utf8'));

let s = fs.readFileSync(SRC, 'utf8');
const before = s.length;

/* 1. BOOK_DATA display names, by gridId — the one field that is language-specific.
      nameEn stays: renderVerseSet keys the English column off it. */
let renamed = 0;
/* The entries are column-aligned with variable padding, so the pattern has to
   tolerate runs of whitespace — matching a single space silently skipped the
   14 padded Book of Mormon rows and left them in Spanish. */
const SHORT = { dc: 'DeC' };          // the nav wants the abbreviation, not "Doutrina e Convênios"
s = s.replace(/\{\s*prefix:\s*'([^']+)',\s*name:\s*'([^']*)',\s*nameEn:\s*'([^']*)',\s*count:\s*(\d+),\s*volume:\s*'([^']*)',\s*gridId:\s*'([^']+)'\s*\}/g,
  (m, prefix, nameEs, nameEn, count, volume, gridId) => {
    const b = BOOKS.find(x => x.gridId === gridId);
    if (!b) return m;
    renamed++;
    const nm = (SHORT[gridId] || b.namePor).replace(/'/g, "\\'");
    return `{ prefix: '${prefix}', name: '${nm}', nameEn: '${nameEn}', count: ${count}, volume: '${volume}', gridId: '${gridId}' }`;
  });

/* 2. Interface strings. */
const STRINGS = [
  ['Las Escrituras', 'As Escrituras'],
  ['Spanish Interlinear Edition', 'Portuguese Interlinear Edition'],
  /* the markup is `Contenido&nbsp;&#9662;` and `aria-label="Contenido"`, not
     `>Contenido<` — matching on the tag boundary missed every one of them */
  ['aria-label="Contenido"', 'aria-label="Conteúdo"'],
  ['aria-label="Abrir el contenido">Contenido', 'aria-label="Abrir o conteúdo">Conteúdo'],
  ['Interlineal Español-Inglés', 'Interlinear Português-Inglês'],
  ['>Tamaño<', '>Tamanho<'],
  ["'Sección '", "'Seção '"],
  ['Volver a ', 'Voltar a '],
  ['title="Cerrar" aria-label="Cerrar"', 'title="Fechar" aria-label="Fechar"'],
  ['Capítulo siguiente', 'Capítulo seguinte'],
  ['>Interlineal<', '>Interlinear<'],
  ['>Español<', '>Português<'],
  ['Buscar en español o inglés...', 'Buscar em português ou inglês...'],
  ['Search Spanish or English', 'Search Portuguese or English'],
  ['Modo de lectura', 'Modo de leitura'],
  ['Tamaño del texto', 'Tamanho do texto'],
  ['Escribe una nota…', 'Escreva uma nota…'],
  ['No se encontraron', 'Nenhum resultado para'],
  ['Este es un proyecto independiente y no está afiliado, respaldado ni asociado con La Iglesia de Jesucristo de los Santos de los Últimos Días.',
   'Este é um projeto independente e não é afiliado, patrocinado nem associado a A Igreja de Jesus Cristo dos Santos dos Últimos Dias.'],
  ['— Spanish Interlinear', '— Portuguese Interlinear'],
];
let swapped = 0;
for (const [a, b] of STRINGS) {
  const n = s.split(a).length - 1;
  if (n) { s = s.split(a).join(b); swapped += n; }
}

/* 3. The landing covers. */
const COVERS = [
  ['Antiguo<br>Testamento', 'Antigo<br>Testamento'], ['Antiguo Testamento', 'Antigo Testamento'],
  ['Nuevo<br>Testamento', 'Novo<br>Testamento'],     ['Nuevo Testamento', 'Novo Testamento'],
  ['El Libro<br>de Mormón', 'O Livro<br>de Mórmon'], ['El Libro de Mormón', 'O Livro de Mórmon'],
  ['Doctrina<br>y Convenios', 'Doutrina<br>e Convênios'], ['Doctrina y Convenios', 'Doutrina e Convênios'],
  ['La Perla<br>de Gran Precio', 'Pérola de<br>Grande Valor'], ['La Perla de Gran Precio', 'Pérola de Grande Valor'],
];
let covers = 0;
for (const [a, b] of COVERS) { const n = s.split(a).length - 1; if (n) { s = s.split(a).join(b); covers += n; } }

/* 4. The document language, on the <html> tag ONLY. Matching a bare
      lang="es" also hit data-lang="es" on the language pills and rewrote the
      Spanish button into a second Portuguese one. */
s = s.replace(/<html([^>]*)\slang="es"/, '<html$1 lang="pt"');

/* 5. The language pills, replaced whole rather than patched. On this page
      Português is the edition you are in and Espanhol is the way out. */
s = s.replace(/<div class="lang-options"[\s\S]*?<\/div>/,
`<div class="lang-options" role="group" aria-labelledby="lang-choice-label">
        <button type="button" class="lang-btn" data-lang="pt" aria-current="true" onclick="setEditionLanguage('pt')">
          <span>Português<span class="lang-btn-sub">Portuguese</span></span>
        </button>
        <button type="button" class="lang-btn" data-lang="es" aria-current="false" onclick="setEditionLanguage('es')">
          <span>Espanhol<span class="lang-btn-sub">Spanish</span></span>
        </button>
      </div>`);

fs.writeFileSync(OUT, s);
console.log(`index.html written  (${before.toLocaleString()} -> ${s.length.toLocaleString()} bytes)`);
console.log(`  BOOK_DATA names rewritten : ${renamed}`);
console.log(`  interface strings swapped : ${swapped}`);
console.log(`  cover strings swapped     : ${covers}`);
