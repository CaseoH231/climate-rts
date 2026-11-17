// Built-in coloured, labelled diagrams. Each diagram is drawn on a 640 x 360 canvas.
// labels: [text, colour, pointX, pointY, labelX, labelY, what it does]

function lbl([t, c, px, py, lx, ly], i) {
  const right = lx >= px;
  return `<g class="lb" data-i="${i}"><line x1="${px}" y1="${py}" x2="${lx}" y2="${ly}" stroke="${c}" stroke-width="2"/>` +
    `<circle cx="${px}" cy="${py}" r="4.5" fill="${c}" stroke="#fff" stroke-width="1.5"/>` +
    `<text x="${right ? lx + 6 : lx - 6}" y="${ly + 5}" text-anchor="${right ? 'start' : 'end'}" fill="${c}">${t}</text></g>`;
}

const range = (a, b, s) => { const r = []; for (let x = a; x <= b; x += s) r.push(x); return r; };

// ---------- organelle drawings ----------

const nucleusArt = () => {
  const pores = [10, 80, 150, 215, 280, 330].map((a) =>
    `<rect x="-5" y="-124" width="10" height="20" fill="#eff6ff" transform="translate(320 180) rotate(${a})"/>`).join('');
  return `<circle cx="320" cy="180" r="118" fill="#bfdbfe" stroke="#1e40af" stroke-width="5"/>
  <circle cx="320" cy="180" r="106" fill="#dbeafe" stroke="#1e40af" stroke-width="3"/>${pores}
  <g fill="none" stroke="#db2777" stroke-width="3.5" stroke-linecap="round">
    <path d="M245 140 q20 -25 40 0 t40 0"/><path d="M235 215 q15 20 35 0 t35 0 t30 0"/>
    <path d="M300 255 q20 -20 40 0 t30 5"/><path d="M370 125 q15 20 30 0"/><path d="M385 220 q10 -18 22 0"/></g>
  <circle cx="335" cy="180" r="32" fill="#7c3aed"/>`;
};

const mitoArt = () => {
  let cristae = '';
  [200, 240, 280, 320, 360, 400, 440].forEach((x, i) => {
    const e = 74 * Math.sqrt(1 - ((x - 320) / 150) ** 2);
    const y1 = i % 2 ? 180 + e : 180 - e, y2 = i % 2 ? y1 - 50 : y1 + 50;
    cristae += `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="#c2410c" stroke-width="13" stroke-linecap="round"/>` +
      `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2 + (i % 2 ? 4 : -4)}" stroke="#fdba74" stroke-width="5" stroke-linecap="round"/>`;
  });
  return `<ellipse cx="320" cy="180" rx="165" ry="88" fill="#fdba74" stroke="#9a3412" stroke-width="5"/>
  <ellipse cx="320" cy="180" rx="150" ry="74" fill="#ffedd5" stroke="#c2410c" stroke-width="4"/>${cristae}
  <circle cx="255" cy="180" r="10" fill="none" stroke="#db2777" stroke-width="3"/>
  <circle cx="345" cy="176" r="3.5" fill="#6d28d9"/><circle cx="420" cy="184" r="3.5" fill="#6d28d9"/><circle cx="300" cy="186" r="3.5" fill="#6d28d9"/>`;
};

const chloroArt = () => {
  const stacks = [[220, 180], [300, 140], [330, 225], [420, 175]];
  const discs = stacks.map(([cx, cy]) => range(0, 4, 1).map((i) =>
    `<rect x="${cx - 24}" y="${cy - 25 + i * 10}" width="48" height="9" rx="4" fill="#16a34a" stroke="#14532d"/>`).join('')).join('');
  return `<ellipse cx="320" cy="180" rx="175" ry="95" fill="#86efac" stroke="#14532d" stroke-width="5"/>
  <ellipse cx="320" cy="180" rx="163" ry="84" fill="#dcfce7" stroke="#166534" stroke-width="3"/>
  <g stroke="#15803d" stroke-width="4"><line x1="220" y1="180" x2="300" y2="140"/><line x1="300" y1="140" x2="420" y2="175"/>
  <line x1="220" y1="180" x2="330" y2="225"/><line x1="330" y1="225" x2="420" y2="175"/></g>${discs}
  <ellipse cx="385" cy="240" rx="24" ry="12" fill="#fffbeb" stroke="#a16207" stroke-width="2"/>`;
};

const riboArt = () => `<ellipse cx="320" cy="145" rx="115" ry="72" fill="#a78bfa" stroke="#5b21b6" stroke-width="4"/>
  <ellipse cx="320" cy="250" rx="95" ry="40" fill="#ddd6fe" stroke="#6d28d9" stroke-width="4"/>
  <path d="M110 215 q20 -10 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t20 0" fill="none" stroke="#db2777" stroke-width="5"/>
  ${[[330, 68, '#f59e0b'], [345, 55, '#10b981'], [362, 47, '#3b82f6'], [380, 43, '#ef4444'], [398, 46, '#f59e0b'], [414, 38, '#10b981'], [430, 30, '#3b82f6']]
    .map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="8" fill="${c}" stroke="#fff" stroke-width="1.5"/>`).join('')}
  <text x="320" y="348" text-anchor="middle" class="note">Real size: about 20–30 nm – only visible with an electron microscope</text>`;

const membraneArt = () => {
  let lipids = '';
  range(40, 600, 22).filter((x) => x < 275 || x > 365).forEach((x) => {
    lipids += `<g stroke="#ca8a04" stroke-width="3"><line x1="${x - 3}" y1="122" x2="${x - 4}" y2="172"/><line x1="${x + 3}" y1="122" x2="${x + 4}" y2="172"/>
    <line x1="${x - 3}" y1="238" x2="${x - 4}" y2="188"/><line x1="${x + 3}" y1="238" x2="${x + 4}" y2="188"/></g>
    <circle cx="${x}" cy="115" r="9" fill="#f87171" stroke="#b91c1c" stroke-width="2"/><circle cx="${x}" cy="245" r="9" fill="#f87171" stroke="#b91c1c" stroke-width="2"/>`;
  });
  return `<rect x="0" y="0" width="640" height="104" fill="#e0f2fe"/><rect x="0" y="256" width="640" height="104" fill="#fef9c3"/>
  <text x="14" y="24" class="note" text-anchor="start">Outside the cell</text><text x="14" y="350" class="note" text-anchor="start">Inside the cell (cytoplasm)</text>
  ${lipids}<rect x="288" y="88" width="64" height="184" rx="22" fill="#34d399" stroke="#047857" stroke-width="4"/>
  <rect x="313" y="84" width="14" height="192" fill="#ecfeff"/>
  <circle cx="320" cy="60" r="7" fill="#2563eb"/><circle cx="320" cy="150" r="7" fill="#2563eb"/><circle cx="320" cy="215" r="7" fill="#2563eb"/>`;
};

const wallArt = () => `<rect x="150" y="40" width="340" height="280" rx="26" fill="#a3e635" stroke="#4d7c0f" stroke-width="3"/>
  ${[7, 14, 20].map((d) => `<rect x="${150 + d}" y="${40 + d}" width="${340 - 2 * d}" height="${280 - 2 * d}" rx="${24 - d / 2}" fill="none" stroke="#4d7c0f" stroke-width="1.5" stroke-dasharray="14 6"/>`).join('')}
  <rect x="180" y="70" width="280" height="220" rx="12" fill="#fef9c3" stroke="#2563eb" stroke-width="3"/>
  <ellipse cx="330" cy="185" rx="92" ry="62" fill="#bae6fd" stroke="#0369a1" stroke-width="2"/>
  <circle cx="220" cy="112" r="24" fill="#93c5fd" stroke="#1e40af" stroke-width="2"/>
  ${[[215, 258], [430, 100], [435, 268]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="17" ry="9" fill="#22c55e" stroke="#14532d"/>`).join('')}`;

const vacuoleArt = () => `<rect x="150" y="40" width="340" height="280" rx="26" fill="#a3e635" stroke="#4d7c0f" stroke-width="3"/>
  <rect x="176" y="66" width="288" height="228" rx="12" fill="#fef9c3" stroke="#2563eb" stroke-width="3"/>
  <rect x="215" y="92" width="232" height="176" rx="40" fill="#7dd3fc" stroke="#0369a1" stroke-width="5"/>
  ${[[260, 130], [300, 200], [350, 150], [400, 220], [380, 120], [270, 240], [330, 245], [420, 170]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.5" fill="#0369a1"/>`).join('')}
  <circle cx="196" cy="112" r="15" fill="#93c5fd" stroke="#1e40af" stroke-width="2"/>
  <ellipse cx="196" cy="210" rx="7" ry="15" fill="#22c55e" stroke="#14532d"/>
  <ellipse cx="330" cy="79" rx="16" ry="7" fill="#22c55e" stroke="#14532d"/><ellipse cx="330" cy="281" rx="16" ry="7" fill="#22c55e" stroke="#14532d"/>`;

const BLOB = 'M190 90 C 260 30, 420 40, 470 110 C 520 180, 480 290, 380 310 C 280 330, 170 300, 160 220 C 150 160, 160 110, 190 90 Z';
const cytoArt = () => `<path d="${BLOB}" fill="#fef3c7" stroke="#2563eb" stroke-width="5"/>
  <circle cx="290" cy="170" r="42" fill="#93c5fd" stroke="#1e40af" stroke-width="3"/><circle cx="298" cy="175" r="12" fill="#7c3aed"/>
  ${[[400, 120, 25], [420, 240, -20], [230, 262, 10]].map(([x, y, r]) => `<ellipse cx="${x}" cy="${y}" rx="24" ry="12" transform="rotate(${r} ${x} ${y})" fill="#fdba74" stroke="#9a3412" stroke-width="2"/>`).join('')}
  ${[[250, 120], [220, 160], [340, 110], [370, 200], [450, 180], [300, 280], [360, 270], [200, 210]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.5" fill="#6d28d9"/>`).join('')}`;

const erArt = () => {
  let rough = '';
  [[195, 95], [205, 135], [195, 175], [205, 215]].forEach(([x, y]) => {
    rough += `<rect x="${x}" y="${y}" width="135" height="24" rx="12" fill="#fbcfe8" stroke="#be185d" stroke-width="3"/>`;
    range(x + 10, x + 128, 13).forEach((dx) => { rough += `<circle cx="${dx}" cy="${y - 2}" r="3.5" fill="#6d28d9"/><circle cx="${dx}" cy="${y + 26}" r="3.5" fill="#6d28d9"/>`; });
  });
  const tubes = ['M370 110 C 400 80, 430 140, 460 110 S 510 90, 520 130', 'M375 175 C 410 150, 440 200, 480 170 S 520 190, 515 230', 'M380 260 C 420 235, 440 285, 500 262'];
  return `<circle cx="60" cy="180" r="110" fill="#bfdbfe" stroke="#1e40af" stroke-width="4"/>${rough}
  ${tubes.map((d) => `<path d="${d}" fill="none" stroke="#db2777" stroke-width="18" stroke-linecap="round"/><path d="${d}" fill="none" stroke="#fbcfe8" stroke-width="10" stroke-linecap="round"/>`).join('')}`;
};

const golgiArt = () => {
  let sacs = '';
  range(0, 4, 1).forEach((i) => {
    const d = `M ${225 + i * 6} ${105 + i * 32} Q 320 ${150 + i * 32} ${415 - i * 6} ${105 + i * 32}`;
    sacs += `<path d="${d}" fill="none" stroke="#d97706" stroke-width="22" stroke-linecap="round"/><path d="${d}" fill="none" stroke="#fde68a" stroke-width="11" stroke-linecap="round"/>`;
  });
  const ves = [[450, 100], [470, 140], [445, 245], [480, 272], [200, 272], [182, 240], [168, 300]];
  return sacs + ves.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="11" fill="#fde68a" stroke="#d97706" stroke-width="3"/><circle cx="${x}" cy="${y}" r="3" fill="#7c3aed"/>`).join('');
};

const lysoArt = () => {
  const enz = [[250, 130], [380, 120], [400, 220], [240, 240], [330, 270], [360, 160], [280, 110], [420, 170], [220, 190]];
  return `<circle cx="320" cy="180" r="110" fill="#fecdd3" stroke="#be123c" stroke-width="6"/>
  <ellipse cx="305" cy="195" rx="44" ry="24" fill="#fed7aa" stroke="#9a3412" stroke-width="3" stroke-dasharray="7 5"/>
  <path d="M280 192 l14 -8 l12 10 l14 -9" fill="none" stroke="#9a3412" stroke-width="3"/>
  ${enz.map(([x, y]) => `<path d="M${x} ${y} L${x + 8} ${y - 5} A9 9 0 1 0 ${x + 8} ${y + 5} Z" fill="#e11d48"/>`).join('')}`;
};

const bacteriumArt = () => `<rect x="130" y="90" width="380" height="180" rx="90" fill="#fde68a" stroke="#92400e" stroke-width="5"/>
  <rect x="140" y="100" width="360" height="160" rx="80" fill="#fef9c3" stroke="#2563eb" stroke-width="3"/>
  <path d="M250 150 C 300 110, 380 130, 360 170 S 260 230, 280 190 S 350 150, 400 200 S 300 250, 250 210 Z" fill="none" stroke="#db2777" stroke-width="3.5"/>
  ${[[444, 140], [452, 218], [200, 220]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="13" fill="none" stroke="#7c3aed" stroke-width="4.5"/>`).join('')}
  ${[[200, 170], [230, 130], [300, 240], [410, 120], [420, 245], [180, 200], [330, 120]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.5" fill="#6d28d9"/>`).join('')}
  <path d="M510 180 c 25 -30 45 30 70 0 s 40 30 55 0" fill="none" stroke="#92400e" stroke-width="4"/>`;

export const DIAGRAMS = {
  nucleus: { name: 'Nucleus', color: '#1e40af', art: nucleusArt, labels: [
    ['Nuclear envelope', '#1e40af', 417, 112, 475, 60, 'Double membrane that surrounds the nucleus'],
    ['Nuclear pore', '#0f766e', 431, 160, 475, 170, 'Holes that let mRNA leave the nucleus'],
    ['Nucleolus', '#7c3aed', 350, 200, 475, 280, 'Dense area that makes ribosomes'],
    ['Chromatin (DNA)', '#db2777', 250, 135, 165, 100, 'DNA wound around proteins; coils up into chromosomes when the cell divides'],
    ['Nucleoplasm', '#2563eb', 270, 260, 165, 280, 'Jelly-like fluid inside the nucleus'] ] },
  mitochondria: { name: 'Mitochondrion', color: '#c2410c', art: mitoArt, labels: [
    ['Outer membrane', '#9a3412', 190, 126, 165, 60, 'Smooth outer layer'],
    ['Inner membrane', '#c2410c', 180, 207, 165, 270, 'Folded membrane where most respiration reactions happen'],
    ['Cristae', '#b45309', 360, 140, 475, 70, 'Folds of the inner membrane – give a large surface area'],
    ['Matrix', '#ea580c', 300, 180, 515, 200, 'Fluid inside – contains enzymes for respiration'],
    ['Own DNA (loop)', '#db2777', 250, 180, 165, 175, 'Mitochondria have their own small loop of DNA'] ] },
  chloroplast: { name: 'Chloroplast', color: '#15803d', art: chloroArt, labels: [
    ['Double membrane', '#14532d', 320, 85, 475, 40, 'Outer and inner membrane'],
    ['Granum', '#15803d', 300, 118, 165, 60, 'A stack of thylakoids'],
    ['Thylakoid', '#16a34a', 196, 180, 128, 180, 'Flat disc containing chlorophyll – absorbs light'],
    ['Stroma', '#4d7c0f', 260, 235, 165, 275, 'Fluid where glucose is made'],
    ['Lamella', '#15803d', 360, 157, 520, 125, 'Links one granum to another'],
    ['Starch grain', '#a16207', 385, 240, 505, 285, 'Stored starch made from glucose'] ] },
  ribosome: { name: 'Ribosome', color: '#6d28d9', art: riboArt, labels: [
    ['Large subunit', '#5b21b6', 260, 130, 165, 110, 'Joins amino acids together'],
    ['Small subunit', '#6d28d9', 300, 262, 165, 290, 'Holds the mRNA in place'],
    ['mRNA', '#db2777', 450, 215, 475, 250, 'Copy of a gene – read 3 bases (a codon) at a time'],
    ['Protein chain', '#b45309', 398, 46, 475, 90, 'Amino acids joined in the order the mRNA codes for'] ] },
  membrane: { name: 'Cell membrane', color: '#b91c1c', art: membraneArt, labels: [
    ['Phospholipid head', '#b91c1c', 128, 115, 140, 55, 'Water-loving (hydrophilic) – faces outwards'],
    ['Fatty acid tails', '#a16207', 172, 150, 180, 300, 'Water-hating (hydrophobic) – face inwards'],
    ['Channel protein', '#047857', 350, 140, 420, 55, 'Lets particular molecules pass through'],
    ['Phospholipid bilayer', '#7c2d12', 560, 180, 520, 300, 'Two layers of phospholipids'] ] },
  wall: { name: 'Cell wall', color: '#4d7c0f', art: wallArt, labels: [
    ['Cell wall', '#4d7c0f', 163, 150, 135, 110, 'Strong layer outside the membrane'],
    ['Cellulose fibres', '#3f6212', 167, 260, 135, 285, 'Tough fibres that make the wall strong'],
    ['Cell membrane', '#2563eb', 460, 200, 505, 225, 'Sits just inside the wall'],
    ['Cytoplasm', '#ca8a04', 440, 180, 505, 165, 'Fluid inside the membrane'],
    ['Vacuole', '#0369a1', 360, 210, 505, 300, 'Pushes against the wall to keep the cell firm'] ] },
  vacuole: { name: 'Permanent vacuole', color: '#0369a1', art: vacuoleArt, labels: [
    ['Tonoplast', '#0369a1', 447, 150, 505, 115, 'The membrane around the vacuole'],
    ['Cell sap', '#0284c7', 330, 190, 505, 200, 'Water with dissolved sugars and salts'],
    ['Cytoplasm', '#ca8a04', 455, 250, 505, 285, 'Squashed into a thin layer at the edge'],
    ['Nucleus', '#1e40af', 196, 112, 135, 80, 'Pushed to the side by the vacuole'],
    ['Cell wall', '#4d7c0f', 163, 220, 135, 245, 'Vacuole presses against it so the cell is turgid'] ] },
  cytoplasm: { name: 'Cytoplasm', color: '#b45309', art: cytoArt, labels: [
    ['Cytoplasm', '#b45309', 350, 240, 505, 300, 'Jelly-like fluid where most reactions happen'],
    ['Cell membrane', '#2563eb', 470, 110, 505, 65, 'Surrounds the cytoplasm'],
    ['Nucleus', '#1e40af', 262, 160, 135, 150, 'Sits in the cytoplasm'],
    ['Mitochondrion', '#9a3412', 214, 260, 135, 280, 'Suspended in the cytoplasm'],
    ['Ribosomes', '#6d28d9', 250, 120, 135, 70, 'Free ribosomes float in the cytoplasm'] ] },
  er: { name: 'Endoplasmic reticulum', color: '#be185d', art: erArt, labels: [
    ['Rough ER', '#be185d', 240, 95, 220, 40, 'Covered in ribosomes – makes and transports proteins'],
    ['Ribosomes', '#6d28d9', 296, 241, 300, 315, 'Make proteins on the surface of the rough ER'],
    ['Smooth ER', '#db2777', 460, 110, 530, 50, 'No ribosomes – makes lipids (fats)'],
    ['Nucleus', '#1e40af', 110, 260, 130, 325, 'The ER membrane joins onto the nuclear envelope'] ] },
  golgi: { name: 'Golgi apparatus', color: '#d97706', art: golgiArt, labels: [
    ['Cisternae', '#b45309', 320, 128, 330, 40, 'Stack of flattened membrane sacs'],
    ['Vesicle (out)', '#c2410c', 480, 272, 505, 315, 'Carries finished proteins to the membrane'],
    ['Vesicle (in)', '#b45309', 182, 240, 135, 200, 'Brings proteins from the rough ER'] ] },
  lysosome: { name: 'Lysosome', color: '#be123c', art: lysoArt, labels: [
    ['Membrane', '#be123c', 398, 102, 505, 70, 'Keeps the enzymes away from the rest of the cell'],
    ['Digestive enzymes', '#e11d48', 250, 130, 170, 70, 'Break down molecules'],
    ['Old organelle', '#9a3412', 268, 200, 135, 270, 'Worn-out part being broken down and recycled'] ] },
  plasmid: { name: 'Bacterium with plasmids', color: '#7c3aed', art: bacteriumArt, labels: [
    ['Plasmid', '#7c3aed', 444, 127, 470, 45, 'Small ring of DNA with extra genes'],
    ['Chromosomal DNA', '#db2777', 360, 170, 330, 330, 'One big loop of DNA, loose in the cytoplasm (no nucleus)'],
    ['Cell wall', '#92400e', 230, 90, 170, 40, 'Supports the cell (not made of cellulose)'],
    ['Cell membrane', '#2563eb', 300, 100, 330, 40, 'Controls what enters and leaves'],
    ['Flagellum', '#92400e', 535, 175, 545, 300, 'Whip-like tail that spins to move the cell'],
    ['Ribosomes', '#6d28d9', 180, 200, 135, 260, 'Smaller (70S) ribosomes make proteins'] ] },
};

export function diagramSVG(key, { labels = true } = {}) {
  const d = DIAGRAMS[key];
  if (!d) return '';
  return `<svg class="dg" viewBox="0 0 640 360" role="img" aria-label="Labelled diagram of ${d.name}">${d.art()}${labels ? d.labels.map(lbl).join('') : ''}</svg>`;
}

// Words in a note title that point at a built-in diagram (used when pasting notes).
export const DIAGRAM_WORDS = [
  [/nucle(us|i)\b/i, 'nucleus'], [/mitochond/i, 'mitochondria'], [/chloroplast/i, 'chloroplast'], [/ribosom/i, 'ribosome'],
  [/(cell|plasma|surface) membrane/i, 'membrane'], [/cell wall/i, 'wall'], [/vacuole/i, 'vacuole'], [/cytoplasm/i, 'cytoplasm'],
  [/endoplasmic|\b[rs]?er\b/i, 'er'], [/golgi/i, 'golgi'], [/lysosom/i, 'lysosome'], [/plasmid/i, 'plasmid'],
];

// ---------- whole-cell explorers (click a part to open its notes) ----------

const part = (k, name, svg) => `<g class="part" data-k="${k}" tabindex="0"><title>${name}</title>${svg}</g>`;
const dots = (pts, c = '#6d28d9') => pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4" fill="${c}"/>`).join('');
const mito = (x, y, r) => `<ellipse cx="${x}" cy="${y}" rx="26" ry="13" transform="rotate(${r} ${x} ${y})" fill="#fdba74" stroke="#9a3412" stroke-width="2.5"/><path d="M${x - 14} ${y} q4 -8 8 0 t8 0 t8 0" transform="rotate(${r} ${x} ${y})" fill="none" stroke="#9a3412" stroke-width="2"/>`;

export const CELLS = {
  animal: { name: 'Animal cell', svg: () => `
    ${part('cytoplasm', 'Cytoplasm', `<path d="${BLOB}" fill="#fef3c7"/>`)}
    ${part('er', 'Rough ER', `<path d="M240 125 q-25 45 0 95 M252 118 q-25 52 0 108" fill="none" stroke="#db2777" stroke-width="7" stroke-linecap="round"/>${dots([[230, 140], [226, 175], [231, 205], [244, 120]])}`)}
    ${part('nucleus', 'Nucleus', `<circle cx="300" cy="170" r="44" fill="#93c5fd" stroke="#1e40af" stroke-width="4"/><circle cx="308" cy="176" r="13" fill="#7c3aed"/>`)}
    ${part('mitochondria', 'Mitochondria', mito(405, 120, 25) + mito(425, 240, -20) + mito(240, 265, 10))}
    ${part('golgi', 'Golgi apparatus', `<path d="M360 200 q25 18 50 0 M362 214 q23 16 46 0 M366 228 q19 13 38 0" fill="none" stroke="#d97706" stroke-width="7" stroke-linecap="round"/>`)}
    ${part('lysosome', 'Lysosome', `<circle cx="350" cy="275" r="13" fill="#fecdd3" stroke="#be123c" stroke-width="3"/>`)}
    ${part('ribosome', 'Ribosomes', dots([[340, 105], [455, 175], [300, 290], [200, 200], [380, 165], [195, 150]]))}
    ${part('membrane', 'Cell membrane', `<path d="${BLOB}" fill="none" stroke="transparent" stroke-width="22"/><path d="${BLOB}" fill="none" stroke="#2563eb" stroke-width="6"/>`)}` },
  plant: { name: 'Plant cell', svg: () => `
    ${part('wall', 'Cell wall', `<rect x="140" y="30" width="360" height="300" rx="20" fill="#a3e635" stroke="#4d7c0f" stroke-width="3"/>`)}
    ${part('cytoplasm', 'Cytoplasm', `<rect x="160" y="50" width="320" height="260" rx="12" fill="#fef9c3"/>`)}
    ${part('membrane', 'Cell membrane', `<rect x="160" y="50" width="320" height="260" rx="12" fill="none" stroke="transparent" stroke-width="14"/><rect x="160" y="50" width="320" height="260" rx="12" fill="none" stroke="#2563eb" stroke-width="4"/>`)}
    ${part('vacuole', 'Permanent vacuole', `<rect x="225" y="95" width="200" height="170" rx="40" fill="#7dd3fc" stroke="#0369a1" stroke-width="4"/>`)}
    ${part('nucleus', 'Nucleus', `<circle cx="195" cy="90" r="24" fill="#93c5fd" stroke="#1e40af" stroke-width="3"/><circle cx="199" cy="93" r="8" fill="#7c3aed"/>`)}
    ${part('chloroplast', 'Chloroplasts', [[195, 180], [195, 260], [320, 75], [455, 140], [455, 240], [330, 287]].map(([x, y]) =>
      `<ellipse cx="${x}" cy="${y}" rx="${x < 200 || x > 450 ? 11 : 24}" ry="${x < 200 || x > 450 ? 22 : 11}" fill="#22c55e" stroke="#14532d" stroke-width="2"/>`).join(''))}
    ${part('mitochondria', 'Mitochondria', mito(400, 72, 0) + mito(250, 290, 0))}
    ${part('ribosome', 'Ribosomes', dots([[175, 130], [455, 90], [460, 285], [270, 72], [175, 295]]))}` },
  bacteria: { name: 'Bacterial cell', svg: () => `
    ${part('wall', 'Cell wall', `<rect x="130" y="90" width="380" height="180" rx="90" fill="#fde68a" stroke="#92400e" stroke-width="5"/>`)}
    ${part('cytoplasm', 'Cytoplasm', `<rect x="142" y="102" width="356" height="156" rx="78" fill="#fef9c3"/>`)}
    ${part('membrane', 'Cell membrane', `<rect x="142" y="102" width="356" height="156" rx="78" fill="none" stroke="transparent" stroke-width="12"/><rect x="142" y="102" width="356" height="156" rx="78" fill="none" stroke="#2563eb" stroke-width="3"/>`)}
    ${part('dna', 'Chromosomal DNA', `<path d="M250 150 C 300 110, 380 130, 360 170 S 260 230, 280 190 S 350 150, 400 200 S 300 250, 250 210 Z" fill="none" stroke="transparent" stroke-width="14"/><path d="M250 150 C 300 110, 380 130, 360 170 S 260 230, 280 190 S 350 150, 400 200 S 300 250, 250 210 Z" fill="none" stroke="#db2777" stroke-width="4"/>`)}
    ${part('plasmid', 'Plasmids', [[444, 140], [452, 218], [200, 220]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="13" fill="#fef9c3" stroke="#7c3aed" stroke-width="5"/>`).join(''))}
    ${part('ribosome', 'Ribosomes', dots([[200, 170], [230, 130], [300, 240], [410, 120], [420, 245], [180, 200], [330, 120]]))}
    ${part('flagellum', 'Flagellum', `<path d="M510 180 c 25 -30 45 30 70 0 s 40 30 55 0" fill="none" stroke="transparent" stroke-width="16"/><path d="M510 180 c 25 -30 45 30 70 0 s 40 30 55 0" fill="none" stroke="#92400e" stroke-width="5"/>`)}` },
};

export function cellSVG(kind) {
  return `<svg class="cell" viewBox="0 0 640 360" role="img" aria-label="${CELLS[kind].name} – click a part">${CELLS[kind].svg()}</svg>`;
}
