const fs = require('fs');
const path = require('path');
const dir = 'C:/JapaneseLessons/ocean_images';

if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

function svg(content) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400">\n${content}\n</svg>`;
}

function bubbles(count = 8, xMin = 50, xMax = 550, yMin = 50, yMax = 350) {
  let s = '';
  for (let i = 0; i < count; i++) {
    const x = xMin + Math.random() * (xMax - xMin);
    const y = yMin + Math.random() * (yMax - yMin);
    const r = 2 + Math.random() * 6;
    const op = 0.2 + Math.random() * 0.4;
    s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="white" opacity="${op.toFixed(2)}"/>\n`;
  }
  return s;
}

function glowFilter(id = 'glow', blur = 4, color = 'white') {
  return `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%">
  <feGaussianBlur in="SourceGraphic" stdDeviation="${blur}" result="blur"/>
  <feFlood flood-color="${color}" flood-opacity="0.6" result="color"/>
  <feComposite in="color" in2="blur" operator="in" result="shadow"/>
  <feMerge><feMergeNode in="shadow"/><feMergeNode in="SourceGraphic"/></feMerge>
</filter>`;
}

function lightRays(x = 300, startY = 0) {
  let s = '';
  for (let i = 0; i < 5; i++) {
    const x1 = x - 80 + i * 40;
    const x2 = x1 - 30 + Math.random() * 20;
    const x3 = x1 + 20 + Math.random() * 30;
    s += `<polygon points="${x1},${startY} ${x2},400 ${x3},400" fill="url(#lightRayGrad)" opacity="${0.08 + Math.random() * 0.1}"/>\n`;
  }
  return `<defs><linearGradient id="lightRayGrad" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0%" stop-color="#ffffcc" stop-opacity="0.5"/>
  <stop offset="100%" stop-color="#ffffcc" stop-opacity="0"/>
</linearGradient></defs>\n` + s;
}

function sandFloor(y = 340, color1 = '#c2a366', color2 = '#8b7355') {
  return `<defs><linearGradient id="sandGrad" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0%" stop-color="${color1}"/>
  <stop offset="100%" stop-color="${color2}"/>
</linearGradient></defs>
<path d="M0,${y} Q75,${y - 10} 150,${y + 5} Q250,${y + 10} 350,${y - 5} Q450,${y + 8} 550,${y} L600,${y} L600,400 L0,400 Z" fill="url(#sandGrad)"/>`;
}

function smallFish(x, y, size = 10, color = '#ffaa44', flip = false) {
  const d = flip ? -1 : 1;
  return `<g transform="translate(${x},${y}) scale(${d * size / 10},${size / 10})">
  <path d="M0,0 Q5,-4 12,0 Q5,4 0,0 Z" fill="${color}" opacity="0.85"/>
  <path d="M-4,0 L-7,-3 L-7,3 Z" fill="${color}" opacity="0.7"/>
  <circle cx="9" cy="-1" r="0.8" fill="#111"/>
</g>`;
}

function schoolOfFish(cx, cy, count = 6, color = '#66ccff', size = 8) {
  let s = '';
  for (let i = 0; i < count; i++) {
    const x = cx + (Math.random() - 0.5) * 60;
    const y = cy + (Math.random() - 0.5) * 30;
    const sz = size + (Math.random() - 0.5) * 4;
    s += smallFish(x, y, sz, color, Math.random() > 0.5);
  }
  return s;
}

function seagrass(x, y, count = 3, color = '#2d7a3a') {
  let s = '';
  for (let i = 0; i < count; i++) {
    const offset = (i - count / 2) * 8;
    const h = 30 + Math.random() * 40;
    const sway = 5 + Math.random() * 10;
    s += `<path d="M${x + offset},${y} Q${x + offset + sway},${y - h / 2} ${x + offset - sway / 2},${y - h}" stroke="${color}" stroke-width="2.5" fill="none" opacity="0.7"/>`;
  }
  return s;
}

function coralBranch(x, y, height = 50, color = '#ff6688') {
  const w = height * 0.4;
  return `<g>
  <path d="M${x},${y} Q${x - w / 2},${y - height * 0.3} ${x - w},${y - height * 0.7} Q${x - w * 0.8},${y - height} ${x - w * 0.6},${y - height}" stroke="${color}" stroke-width="3" fill="none" opacity="0.8"/>
  <path d="M${x},${y} Q${x + w * 0.3},${y - height * 0.4} ${x + w * 0.5},${y - height * 0.8}" stroke="${color}" stroke-width="2.5" fill="none" opacity="0.8"/>
  <path d="M${x},${y} Q${x},${y - height * 0.5} ${x + w * 0.2},${y - height * 0.9}" stroke="${color}" stroke-width="2" fill="none" opacity="0.7"/>
  <circle cx="${x - w * 0.6}" cy="${y - height}" r="3" fill="${color}" opacity="0.6"/>
  <circle cx="${x + w * 0.5}" cy="${y - height * 0.8}" r="2.5" fill="${color}" opacity="0.6"/>
  <circle cx="${x + w * 0.2}" cy="${y - height * 0.9}" r="2" fill="${color}" opacity="0.5"/>
</g>`;
}

function waterGradBg(id = 'waterBg', c1 = '#001830', c2 = '#003355', c3 = '#005577') {
  return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0%" stop-color="${c3}" stop-opacity="0.3"/>
  <stop offset="50%" stop-color="${c2}" stop-opacity="0.5"/>
  <stop offset="100%" stop-color="${c1}" stop-opacity="0.7"/>
</linearGradient></defs>
<rect x="0" y="0" width="600" height="400" fill="url(#${id})" opacity="0.6"/>`;
}

// ===== GENERATE ALL 60 SVGs =====

// 1. coral_reef.svg
fs.writeFileSync(path.join(dir, 'coral_reef.svg'), svg(`
<defs>
  <linearGradient id="bg1" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#006699" stop-opacity="0.4"/>
    <stop offset="100%" stop-color="#001133" stop-opacity="0.7"/>
  </linearGradient>
  <linearGradient id="sand1" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#c2a366"/>
    <stop offset="100%" stop-color="#8b7355"/>
  </linearGradient>
  ${glowFilter('coralGlow', 3, '#ff6688')}
  <radialGradient id="sunlight1" cx="50%" cy="0%" r="60%">
    <stop offset="0%" stop-color="#ffffcc" stop-opacity="0.15"/>
    <stop offset="100%" stop-color="#003366" stop-opacity="0"/>
  </radialGradient>
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg1)"/>
<rect x="0" y="0" width="600" height="200" fill="url(#sunlight1)"/>
<path d="M0,340 Q100,330 200,345 Q350,335 500,340 Q550,338 600,342 L600,400 L0,400 Z" fill="url(#sand1)"/>
<path d="M0,350 Q80,340 160,350 Q300,345 440,355 Q520,348 600,352 L600,400 L0,400 Z" fill="#7a6545" opacity="0.5"/>
${coralBranch(80, 340, 70, '#ff5577')}
${coralBranch(150, 345, 55, '#ff8844')}
${coralBranch(220, 338, 80, '#cc44aa')}
${coralBranch(350, 342, 65, '#ff6688')}
${coralBranch(430, 340, 50, '#ff9955')}
${coralBranch(510, 345, 60, '#ee55cc')}
<ellipse cx="280" cy="350" rx="30" ry="12" fill="#ff7766" opacity="0.5" filter="url(#coralGlow)"/>
<ellipse cx="400" cy="355" rx="25" ry="10" fill="#cc55aa" opacity="0.5" filter="url(#coralGlow)"/>
<ellipse cx="130" cy="360" rx="20" ry="8" fill="#ff9944" opacity="0.4"/>
${smallFish(100, 150, 10, '#ffcc44')}
${smallFish(140, 170, 8, '#44ccff')}
${smallFish(450, 120, 12, '#ffaa33')}
${smallFish(480, 140, 9, '#66eeff')}
${smallFish(300, 200, 11, '#ff8866')}
${smallFish(320, 180, 7, '#44ddaa', true)}
${smallFish(200, 250, 10, '#ffbb55', true)}
${bubbles(12, 60, 550, 80, 330)}
<polygon points="295,0 270,140 320,140" fill="#ffffcc" opacity="0.06"/>
<polygon points="380,0 360,160 400,160" fill="#ffffcc" opacity="0.05"/>
<polygon points="200,0 185,120 215,120" fill="#ffffcc" opacity="0.04"/>
${seagrass(50, 345, 3, '#226633')}
${seagrass(480, 348, 2, '#338844')}
${seagrass(560, 342, 4, '#2a7a3a')}
`));

// 2. shipwreck.svg
fs.writeFileSync(path.join(dir, 'shipwreck.svg'), svg(`
<defs>
  <linearGradient id="bg2" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#003355" stop-opacity="0.3"/>
    <stop offset="100%" stop-color="#001122" stop-opacity="0.8"/>
  </linearGradient>
  <linearGradient id="hull" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#5a3a22"/>
    <stop offset="100%" stop-color="#3a2211"/>
  </linearGradient>
  ${glowFilter('wreckGlow', 2, '#446688')}
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg2)"/>
${sandFloor(350)}
<g transform="translate(150,180) rotate(-12)">
  <path d="M0,100 Q50,120 200,120 Q250,110 280,80 L260,80 Q240,100 200,110 Q80,110 20,95 Z" fill="url(#hull)" stroke="#3a2211" stroke-width="1"/>
  <rect x="60" y="50" width="6" height="70" fill="#4a2a12" transform="rotate(-5,63,85)"/>
  <rect x="160" y="20" width="5" height="100" fill="#4a2a12"/>
  <line x1="160" y1="30" x2="210" y2="45" stroke="#4a2a12" stroke-width="2"/>
  <path d="M162,25 Q185,20 200,40 L162,55 Z" fill="#554433" opacity="0.4"/>
  <path d="M162,55 Q175,50 185,60 L162,70 Z" fill="#554433" opacity="0.3"/>
  <circle cx="100" cy="85" r="8" fill="none" stroke="#5a3a22" stroke-width="2" opacity="0.7"/>
  <circle cx="140" cy="90" r="7" fill="none" stroke="#5a3a22" stroke-width="2" opacity="0.6"/>
  <circle cx="200" cy="85" r="6" fill="none" stroke="#5a3a22" stroke-width="2" opacity="0.5"/>
</g>
<circle cx="320" cy="280" r="18" fill="none" stroke="#6a4a2a" stroke-width="3" opacity="0.6"/>
<line x1="320" y1="262" x2="320" y2="298" stroke="#6a4a2a" stroke-width="2" opacity="0.5"/>
<line x1="302" y1="280" x2="338" y2="280" stroke="#6a4a2a" stroke-width="2" opacity="0.5"/>
<circle cx="180" cy="310" r="3" fill="#667755" opacity="0.5"/>
<circle cx="220" cy="305" r="2" fill="#667755" opacity="0.4"/>
<circle cx="250" cy="320" r="4" fill="#557744" opacity="0.4"/>
<circle cx="350" cy="315" r="3" fill="#668855" opacity="0.5"/>
${smallFish(400, 150, 10, '#77aacc')}
${smallFish(430, 170, 8, '#88bbdd')}
${smallFish(100, 120, 9, '#669999', true)}
${bubbles(10, 100, 400, 100, 300)}
<polygon points="300,0 280,180 320,180" fill="#aaccee" opacity="0.04"/>
<polygon points="400,0 385,150 415,150" fill="#aaccee" opacity="0.03"/>
${seagrass(420, 350, 3, '#334a22')}
${seagrass(500, 355, 2, '#2a4020')}
`));

// 3. temple_ruins.svg
fs.writeFileSync(path.join(dir, 'temple_ruins.svg'), svg(`
<defs>
  <linearGradient id="bg3" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#003344" stop-opacity="0.3"/>
    <stop offset="100%" stop-color="#001520" stop-opacity="0.8"/>
  </linearGradient>
  <radialGradient id="templeGlow" cx="50%" cy="60%" r="40%">
    <stop offset="0%" stop-color="#ffcc44" stop-opacity="0.25"/>
    <stop offset="100%" stop-color="#ffcc44" stop-opacity="0"/>
  </radialGradient>
  ${glowFilter('goldGlow', 5, '#ffcc44')}
  <linearGradient id="stone" x1="0" y1="0" x2="0.1" y2="1">
    <stop offset="0%" stop-color="#778877"/>
    <stop offset="50%" stop-color="#667766"/>
    <stop offset="100%" stop-color="#556655"/>
  </linearGradient>
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg3)"/>
<rect x="0" y="0" width="600" height="400" fill="url(#templeGlow)"/>
${sandFloor(355, '#7a8877', '#556655')}
<rect x="120" y="160" width="22" height="195" fill="url(#stone)" rx="2"/>
<rect x="200" y="140" width="22" height="215" fill="url(#stone)" rx="2"/>
<rect x="380" y="150" width="22" height="205" fill="url(#stone)" rx="2"/>
<rect x="460" y="170" width="22" height="185" fill="url(#stone)" rx="2"/>
<rect x="105" y="150" width="130" height="15" fill="#889988" rx="2"/>
<rect x="365" y="140" width="130" height="15" fill="#889988" rx="2"/>
<path d="M105,150 L170,110 L235,150 Z" fill="#889988" opacity="0.8"/>
<path d="M365,140 L430,100 L495,140 Z" fill="#889988" opacity="0.7"/>
<rect x="155" y="280" width="40" height="75" fill="#445544" opacity="0.6" rx="1"/>
<rect x="155" y="280" width="40" height="5" fill="#556655"/>
<rect x="405" y="290" width="35" height="65" fill="#445544" opacity="0.5" rx="1"/>
<circle cx="300" cy="280" r="25" fill="#ffcc44" opacity="0.15" filter="url(#goldGlow)"/>
<circle cx="300" cy="280" r="12" fill="#ffcc44" opacity="0.1"/>
<path d="M140,200 Q145,180 160,200" stroke="#3a6633" stroke-width="1.5" fill="none" opacity="0.6"/>
<path d="M130,220 Q138,200 148,225" stroke="#3a7733" stroke-width="1.5" fill="none" opacity="0.5"/>
<path d="M460,210 Q468,190 475,215" stroke="#3a6633" stroke-width="1.5" fill="none" opacity="0.5"/>
<path d="M385,200 Q392,180 400,205" stroke="#3a7733" stroke-width="1.5" fill="none" opacity="0.4"/>
<line x1="150" y1="175" x2="150" y2="280" stroke="#556655" stroke-width="1" stroke-dasharray="3,5" opacity="0.3"/>
<line x1="230" y1="155" x2="230" y2="280" stroke="#556655" stroke-width="1" stroke-dasharray="3,5" opacity="0.3"/>
${smallFish(320, 200, 8, '#ccaa44')}
${smallFish(280, 220, 7, '#bbaa55', true)}
${bubbles(8, 100, 500, 100, 300)}
`));

// 4. sunken_village.svg
fs.writeFileSync(path.join(dir, 'sunken_village.svg'), svg(`
<defs>
  <linearGradient id="bg4" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#004466" stop-opacity="0.3"/>
    <stop offset="100%" stop-color="#001828" stop-opacity="0.8"/>
  </linearGradient>
  ${glowFilter('houseGlow', 2, '#557799')}
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg4)"/>
${sandFloor(340)}
<g opacity="0.7">
  <rect x="70" y="260" width="70" height="80" fill="#445566" rx="2"/>
  <polygon points="65,260 105,230 145,260" fill="#556677"/>
  <rect x="90" y="280" width="15" height="20" fill="#223344"/>
  <rect x="115" y="270" width="12" height="15" fill="#223344"/>
</g>
<g opacity="0.65">
  <rect x="200" y="250" width="80" height="90" fill="#445566" rx="2"/>
  <polygon points="195,250 240,215 285,250" fill="#556677"/>
  <rect x="210" y="275" width="18" height="25" fill="#223344"/>
  <rect x="250" y="265" width="14" height="16" fill="#223344"/>
</g>
<g opacity="0.6">
  <rect x="350" y="265" width="65" height="75" fill="#445566" rx="2"/>
  <polygon points="345,265 382,235 420,265" fill="#556677"/>
  <rect x="365" y="285" width="15" height="20" fill="#223344"/>
  <rect x="395" y="278" width="10" height="12" fill="#223344"/>
</g>
<g opacity="0.55">
  <rect x="470" y="270" width="60" height="70" fill="#445566" rx="2"/>
  <polygon points="465,270 500,242 535,270" fill="#556677"/>
  <rect x="485" y="290" width="14" height="18" fill="#223344"/>
</g>
<path d="M70,340 L200,340" stroke="#6a5a44" stroke-width="2" opacity="0.3"/>
<path d="M280,340 L350,340" stroke="#6a5a44" stroke-width="2" opacity="0.3"/>
${smallFish(100, 285, 7, '#77aacc')}
${smallFish(230, 278, 6, '#88bbdd', true)}
${smallFish(380, 290, 5, '#66aacc')}
${schoolOfFish(300, 150, 8, '#77ccee', 7)}
${seagrass(160, 340, 2, '#336633')}
${seagrass(320, 340, 3, '#2a5a2a')}
${seagrass(450, 340, 2, '#2d6d2d')}
${bubbles(10, 50, 550, 100, 320)}
<polygon points="300,0 280,160 320,160" fill="#aaccee" opacity="0.04"/>
<polygon points="150,0 135,120 165,120" fill="#aaccee" opacity="0.03"/>
`));

// 5. underwater_volcano.svg
fs.writeFileSync(path.join(dir, 'underwater_volcano.svg'), svg(`
<defs>
  <linearGradient id="bg5" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#111" stop-opacity="0.5"/>
    <stop offset="100%" stop-color="#220800" stop-opacity="0.9"/>
  </linearGradient>
  <radialGradient id="lavaGlow" cx="50%" cy="70%" r="35%">
    <stop offset="0%" stop-color="#ff4400" stop-opacity="0.5"/>
    <stop offset="50%" stop-color="#ff2200" stop-opacity="0.2"/>
    <stop offset="100%" stop-color="#ff0000" stop-opacity="0"/>
  </radialGradient>
  ${glowFilter('fireGlow', 6, '#ff4400')}
  <linearGradient id="rockDark" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#333"/>
    <stop offset="100%" stop-color="#1a1a1a"/>
  </linearGradient>
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg5)"/>
<rect x="0" y="0" width="600" height="400" fill="url(#lavaGlow)"/>
<path d="M150,400 L250,180 Q270,160 300,150 Q330,160 350,180 L450,400 Z" fill="url(#rockDark)"/>
<path d="M180,400 L260,220 Q280,200 300,195 Q320,200 340,220 L420,400 Z" fill="#2a2a2a" opacity="0.5"/>
<path d="M270,200 Q285,190 300,188 Q315,190 330,200 L320,220 Q300,210 280,220 Z" fill="#441100" opacity="0.7"/>
<line x1="280" y1="250" x2="275" y2="300" stroke="#ff3300" stroke-width="2" opacity="0.7" filter="url(#fireGlow)"/>
<line x1="300" y1="230" x2="305" y2="310" stroke="#ff4400" stroke-width="2.5" opacity="0.6" filter="url(#fireGlow)"/>
<line x1="320" y1="245" x2="325" y2="290" stroke="#ff2200" stroke-width="2" opacity="0.7" filter="url(#fireGlow)"/>
<line x1="290" y1="270" x2="280" y2="350" stroke="#cc2200" stroke-width="1.5" opacity="0.5"/>
<line x1="310" y1="260" x2="320" y2="340" stroke="#cc2200" stroke-width="1.5" opacity="0.5"/>
<circle cx="300" cy="175" r="8" fill="#ff6600" opacity="0.3" filter="url(#fireGlow)"/>
<circle cx="295" cy="160" r="4" fill="#ff8800" opacity="0.25"/>
<circle cx="305" cy="150" r="3" fill="#ffaa00" opacity="0.2"/>
${bubbles(15, 260, 340, 100, 180)}
<circle cx="290" cy="130" r="5" fill="white" opacity="0.15"/>
<circle cx="310" cy="120" r="4" fill="white" opacity="0.12"/>
<circle cx="300" cy="105" r="3" fill="white" opacity="0.1"/>
<circle cx="285" cy="95" r="4" fill="white" opacity="0.08"/>
<circle cx="305" cy="80" r="3" fill="white" opacity="0.06"/>
<ellipse cx="160" cy="380" rx="40" ry="15" fill="#2a2a2a"/>
<ellipse cx="450" cy="385" rx="35" ry="12" fill="#2a2a2a"/>
<path d="M0,380 Q100,370 200,385 Q350,375 500,380 Q550,378 600,382 L600,400 L0,400 Z" fill="#1a1a1a" opacity="0.7"/>
`));

// 6. whale.svg
fs.writeFileSync(path.join(dir, 'whale.svg'), svg(`
<defs>
  <linearGradient id="bg6" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#1a5577" stop-opacity="0.3"/>
    <stop offset="100%" stop-color="#0a2233" stop-opacity="0.7"/>
  </linearGradient>
  <linearGradient id="whaleSkin" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#334466"/>
    <stop offset="100%" stop-color="#1a2a44"/>
  </linearGradient>
  ${glowFilter('whaleGlow', 3, '#5588aa')}
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg6)"/>
${lightRays(300, 0)}
<g transform="translate(100,140)">
  <path d="M50,80 Q0,60 20,40 Q60,10 150,5 Q280,0 350,30 Q400,50 380,80 Q350,110 280,120 Q150,130 80,110 Q50,100 50,80 Z" fill="url(#whaleSkin)" filter="url(#whaleGlow)"/>
  <path d="M60,50 Q40,30 50,15 Q70,20 80,35 Z" fill="#2a3a55" opacity="0.8"/>
  <circle cx="100" cy="55" r="5" fill="#224466"/>
  <circle cx="102" cy="54" r="2" fill="#112233"/>
  <path d="M380,60 Q420,30 440,20 L430,55 Q410,70 380,80 Z" fill="#2a3a55" opacity="0.9"/>
  <path d="M380,80 Q420,100 440,110 L430,75 Q410,65 380,60 Z" fill="#2a3a55" opacity="0.8"/>
  <path d="M150,95 L155,115 M180,100 L182,118 M210,102 L211,119 M240,100 L240,117 M270,95 L268,112" stroke="#3a4a66" stroke-width="1.5" opacity="0.4"/>
  <path d="M120,75 Q200,90 300,85" stroke="#445577" stroke-width="1" fill="none" opacity="0.3"/>
</g>
${schoolOfFish(300, 330, 10, '#77aacc', 6)}
${smallFish(500, 280, 5, '#88bbdd')}
${smallFish(480, 300, 4, '#77aacc', true)}
${bubbles(8, 150, 500, 50, 200)}
`));

// 7. the_abyss.svg
fs.writeFileSync(path.join(dir, 'the_abyss.svg'), svg(`
<defs>
  <linearGradient id="bg7" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#0a1520" stop-opacity="0.5"/>
    <stop offset="100%" stop-color="#000005" stop-opacity="0.95"/>
  </linearGradient>
  <radialGradient id="abyssGlow" cx="50%" cy="100%" r="25%">
    <stop offset="0%" stop-color="#2244aa" stop-opacity="0.3"/>
    <stop offset="100%" stop-color="#000011" stop-opacity="0"/>
  </radialGradient>
  ${glowFilter('deepGlow', 8, '#2244aa')}
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg7)"/>
<path d="M0,50 Q50,60 100,80 Q200,140 250,250 Q270,320 290,380 L300,400 L310,380 Q330,320 350,250 Q400,140 500,80 Q550,60 600,50 L600,400 L0,400 Z" fill="#080810" opacity="0.8"/>
<path d="M100,80 Q120,90 140,110 Q180,160 210,240 L220,270" stroke="#1a2a44" stroke-width="2" fill="none" opacity="0.5"/>
<path d="M500,80 Q480,90 460,110 Q420,160 390,240 L380,270" stroke="#1a2a44" stroke-width="2" fill="none" opacity="0.5"/>
<ellipse cx="140" cy="120" rx="15" ry="8" fill="#1a2233" opacity="0.6"/>
<ellipse cx="460" cy="115" rx="12" ry="6" fill="#1a2233" opacity="0.5"/>
<ellipse cx="200" cy="200" rx="10" ry="5" fill="#112233" opacity="0.4"/>
<ellipse cx="400" cy="195" rx="8" ry="4" fill="#112233" opacity="0.4"/>
<rect x="0" y="0" width="600" height="400" fill="url(#abyssGlow)"/>
<circle cx="300" cy="385" r="6" fill="#3355cc" opacity="0.15" filter="url(#deepGlow)"/>
<circle cx="290" cy="370" r="3" fill="#4466dd" opacity="0.1"/>
<circle cx="312" cy="375" r="2" fill="#3355cc" opacity="0.08"/>
<circle cx="280" cy="350" r="1.5" fill="#5577ee" opacity="0.06"/>
<circle cx="320" cy="355" r="1.5" fill="#5577ee" opacity="0.06"/>
${bubbles(5, 270, 330, 300, 390)}
`));

// 8. bioluminescent.svg
fs.writeFileSync(path.join(dir, 'bioluminescent.svg'), svg(`
<defs>
  <linearGradient id="bg8" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#050520" stop-opacity="0.7"/>
    <stop offset="100%" stop-color="#000010" stop-opacity="0.95"/>
  </linearGradient>
  ${glowFilter('bioGlow', 5, '#00ffaa')}
  ${glowFilter('bioGlow2', 4, '#8844ff')}
  ${glowFilter('bioGlow3', 6, '#0088ff')}
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg8)"/>
${(() => {
  let s = '';
  const colors = ['#00ffaa', '#44ff88', '#8844ff', '#aa66ff', '#0088ff', '#00ccff', '#ff44aa', '#ffaa00'];
  for (let i = 0; i < 50; i++) {
    const x = 20 + Math.random() * 560;
    const y = 20 + Math.random() * 360;
    const r = 1 + Math.random() * 4;
    const c = colors[Math.floor(Math.random() * colors.length)];
    const f = i % 3 === 0 ? 'bioGlow' : i % 3 === 1 ? 'bioGlow2' : 'bioGlow3';
    const op = 0.3 + Math.random() * 0.5;
    s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${c}" opacity="${op.toFixed(2)}" filter="url(#${f})"/>`;
  }
  return s;
})()}
<circle cx="150" cy="200" r="12" fill="#00ffaa" opacity="0.15" filter="url(#bioGlow)"/>
<circle cx="400" cy="150" r="15" fill="#8844ff" opacity="0.12" filter="url(#bioGlow2)"/>
<circle cx="300" cy="300" r="10" fill="#0088ff" opacity="0.15" filter="url(#bioGlow3)"/>
<circle cx="500" cy="250" r="8" fill="#ff44aa" opacity="0.1" filter="url(#bioGlow)"/>
<path d="M100,380 Q120,360 140,370 Q160,350 180,365 Q200,345 220,360" stroke="#00aa66" stroke-width="1.5" fill="none" opacity="0.2"/>
<path d="M350,390 Q380,370 410,380 Q440,360 470,375" stroke="#6644aa" stroke-width="1.5" fill="none" opacity="0.2"/>
`));

// 9. sea_turtle.svg
fs.writeFileSync(path.join(dir, 'sea_turtle.svg'), svg(`
<defs>
  <linearGradient id="bg9" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#1a6688" stop-opacity="0.3"/>
    <stop offset="100%" stop-color="#0a3344" stop-opacity="0.7"/>
  </linearGradient>
  <radialGradient id="shellGrad" cx="45%" cy="45%" r="50%">
    <stop offset="0%" stop-color="#558844"/>
    <stop offset="50%" stop-color="#446633"/>
    <stop offset="100%" stop-color="#334422"/>
  </radialGradient>
  ${glowFilter('turtleGlow', 2, '#88aa66')}
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg9)"/>
${lightRays(350, 0)}
<g transform="translate(180,130)">
  <ellipse cx="120" cy="80" rx="90" ry="55" fill="url(#shellGrad)" filter="url(#turtleGlow)"/>
  <path d="M40,70 Q20,50 5,35 L10,40 Q25,55 40,75 Z" fill="#557744" opacity="0.8"/>
  <path d="M40,90 Q15,110 0,130 L5,125 Q20,105 42,88 Z" fill="#557744" opacity="0.8"/>
  <path d="M200,70 Q220,50 235,35 L230,40 Q215,55 200,75 Z" fill="#557744" opacity="0.8"/>
  <path d="M200,90 Q225,110 240,130 L235,125 Q220,105 198,88 Z" fill="#557744" opacity="0.8"/>
  <path d="M210,80 Q240,78 260,70 Q250,75 240,80 Q255,82 260,90 L240,85 Q225,83 210,80 Z" fill="#557744" opacity="0.8"/>
  <circle cx="250" cy="75" r="4" fill="#333"/>
  <circle cx="251" cy="74" r="1.5" fill="#111"/>
  <line x1="80" y1="55" x2="120" y2="55" stroke="#446633" stroke-width="1" opacity="0.5"/>
  <line x1="70" y1="70" x2="170" y2="70" stroke="#446633" stroke-width="1" opacity="0.5"/>
  <line x1="70" y1="85" x2="170" y2="85" stroke="#446633" stroke-width="1" opacity="0.5"/>
  <line x1="75" y1="100" x2="165" y2="100" stroke="#446633" stroke-width="1" opacity="0.5"/>
  <line x1="90" y1="45" x2="90" y2="115" stroke="#446633" stroke-width="1" opacity="0.4"/>
  <line x1="120" y1="30" x2="120" y2="128" stroke="#446633" stroke-width="1" opacity="0.4"/>
  <line x1="150" y1="40" x2="150" y2="120" stroke="#446633" stroke-width="1" opacity="0.4"/>
</g>
${seagrass(80, 370, 4, '#338844')}
${seagrass(200, 375, 3, '#2a7a3a')}
${seagrass(350, 370, 5, '#338844')}
${seagrass(500, 375, 3, '#2d7d3d')}
${sandFloor(365)}
${bubbles(8, 300, 500, 100, 250)}
`));

// 10. lost_anchor.svg
fs.writeFileSync(path.join(dir, 'lost_anchor.svg'), svg(`
<defs>
  <linearGradient id="bg10" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#003355" stop-opacity="0.3"/>
    <stop offset="100%" stop-color="#001525" stop-opacity="0.8"/>
  </linearGradient>
  <linearGradient id="ironGrad" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#556666"/>
    <stop offset="100%" stop-color="#334444"/>
  </linearGradient>
  ${glowFilter('anchorGlow', 2, '#667788')}
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg10)"/>
${sandFloor(340)}
<g transform="translate(220,80)" filter="url(#anchorGlow)">
  <circle cx="80" cy="15" r="18" fill="none" stroke="url(#ironGrad)" stroke-width="8"/>
  <rect x="74" y="30" width="12" height="180" fill="url(#ironGrad)" rx="3"/>
  <rect x="30" y="100" width="100" height="10" fill="url(#ironGrad)" rx="3"/>
  <path d="M30,105 Q10,140 30,200 L50,200 Q35,150 40,110 Z" fill="url(#ironGrad)"/>
  <path d="M130,105 Q150,140 130,200 L110,200 Q125,150 120,110 Z" fill="url(#ironGrad)"/>
  <polygon points="80,205 70,230 90,230" fill="url(#ironGrad)"/>
</g>
<g opacity="0.5">
  <ellipse cx="250" cy="90" rx="5" ry="3" fill="#556666" transform="rotate(30,250,90)"/>
  <ellipse cx="245" cy="82" rx="5" ry="3" fill="#556666" transform="rotate(20,245,82)"/>
  <ellipse cx="255" cy="75" rx="5" ry="3" fill="#556666" transform="rotate(40,255,75)"/>
  <ellipse cx="248" cy="68" rx="5" ry="3" fill="#556666" transform="rotate(15,248,68)"/>
  <ellipse cx="258" cy="60" rx="5" ry="3" fill="#556666" transform="rotate(35,258,60)"/>
</g>
<circle cx="280" cy="280" r="4" fill="#668855" opacity="0.5"/>
<circle cx="340" cy="290" r="5" fill="#667755" opacity="0.4"/>
<circle cx="260" cy="310" r="3" fill="#557744" opacity="0.4"/>
${coralBranch(380, 340, 40, '#ff6677')}
${coralBranch(440, 345, 35, '#cc5588')}
${seagrass(120, 345, 3, '#336633')}
${seagrass(500, 340, 2, '#2d6d2d')}
${smallFish(450, 150, 9, '#77aacc')}
${smallFish(480, 170, 7, '#88bbdd', true)}
${bubbles(10, 200, 400, 50, 300)}
`));

// 11. stone_guardians.svg
fs.writeFileSync(path.join(dir, 'stone_guardians.svg'), svg(`
<defs>
  <linearGradient id="bg11" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#223344" stop-opacity="0.4"/>
    <stop offset="100%" stop-color="#0a1520" stop-opacity="0.85"/>
  </linearGradient>
  <linearGradient id="stoneG" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#778877"/>
    <stop offset="50%" stop-color="#667766"/>
    <stop offset="100%" stop-color="#556655"/>
  </linearGradient>
  ${glowFilter('stoneGlow', 3, '#88aa88')}
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg11)"/>
${sandFloor(355, '#6a7a66', '#4a5a44')}
<g transform="translate(80,120)">
  <path d="M20,235 L20,50 Q20,10 50,5 Q80,0 80,50 L80,235 Z" fill="url(#stoneG)" filter="url(#stoneGlow)"/>
  <ellipse cx="38" cy="60" rx="8" ry="5" fill="#445544" opacity="0.6"/>
  <ellipse cx="62" cy="60" rx="8" ry="5" fill="#445544" opacity="0.6"/>
  <path d="M35,85 Q50,95 65,85" stroke="#445544" stroke-width="2" fill="none" opacity="0.5"/>
  <rect x="30" y="100" width="40" height="3" fill="#556655" opacity="0.4"/>
</g>
<g transform="translate(240,100)">
  <path d="M20,255 L20,60 Q20,10 55,5 Q90,0 90,60 L90,255 Z" fill="url(#stoneG)" filter="url(#stoneGlow)"/>
  <ellipse cx="42" cy="70" rx="10" ry="6" fill="#445544" opacity="0.6"/>
  <ellipse cx="68" cy="70" rx="10" ry="6" fill="#445544" opacity="0.6"/>
  <path d="M38,100 Q55,112 72,100" stroke="#445544" stroke-width="2.5" fill="none" opacity="0.5"/>
  <rect x="32" y="115" width="46" height="3" fill="#556655" opacity="0.4"/>
</g>
<g transform="translate(430,130)">
  <path d="M15,225 L15,45 Q15,8 42,4 Q70,0 70,45 L70,225 Z" fill="url(#stoneG)" filter="url(#stoneGlow)"/>
  <ellipse cx="32" cy="55" rx="7" ry="4" fill="#445544" opacity="0.6"/>
  <ellipse cx="53" cy="55" rx="7" ry="4" fill="#445544" opacity="0.6"/>
  <path d="M30,78 Q42,87 55,78" stroke="#445544" stroke-width="2" fill="none" opacity="0.5"/>
</g>
${coralBranch(130, 355, 25, '#ff6677')}
${coralBranch(380, 355, 30, '#cc5588')}
${seagrass(200, 355, 2, '#336633')}
${seagrass(520, 355, 3, '#2d7d2d')}
${smallFish(300, 80, 8, '#77aacc')}
${bubbles(8, 80, 520, 80, 300)}
`));

// 12. jellyfish_ballet.svg
fs.writeFileSync(path.join(dir, 'jellyfish_ballet.svg'), svg(`
<defs>
  <linearGradient id="bg12" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#1a2244" stop-opacity="0.3"/>
    <stop offset="100%" stop-color="#0a1020" stop-opacity="0.8"/>
  </linearGradient>
  ${glowFilter('jellyGlow', 6, '#aa66ff')}
  ${glowFilter('jellyGlow2', 5, '#ff66aa')}
  <radialGradient id="jelly1" cx="50%" cy="30%" r="60%">
    <stop offset="0%" stop-color="#cc88ff" stop-opacity="0.6"/>
    <stop offset="100%" stop-color="#6633aa" stop-opacity="0.2"/>
  </radialGradient>
  <radialGradient id="jelly2" cx="50%" cy="30%" r="60%">
    <stop offset="0%" stop-color="#ff88cc" stop-opacity="0.5"/>
    <stop offset="100%" stop-color="#aa3366" stop-opacity="0.2"/>
  </radialGradient>
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg12)"/>
<g filter="url(#jellyGlow)">
  <ellipse cx="150" cy="120" rx="40" ry="25" fill="url(#jelly1)"/>
  <path d="M115,125 Q120,180 110,220" stroke="#aa66ff" stroke-width="1.5" fill="none" opacity="0.5"/>
  <path d="M130,130 Q125,190 120,240" stroke="#bb77ff" stroke-width="1" fill="none" opacity="0.4"/>
  <path d="M150,135 Q148,200 145,250" stroke="#aa66ff" stroke-width="1.5" fill="none" opacity="0.5"/>
  <path d="M170,130 Q175,190 180,240" stroke="#bb77ff" stroke-width="1" fill="none" opacity="0.4"/>
  <path d="M185,125 Q190,175 195,210" stroke="#aa66ff" stroke-width="1.5" fill="none" opacity="0.4"/>
</g>
<g filter="url(#jellyGlow2)">
  <ellipse cx="350" cy="80" rx="35" ry="22" fill="url(#jelly2)"/>
  <path d="M320,85 Q315,140 310,180" stroke="#ff66aa" stroke-width="1.5" fill="none" opacity="0.5"/>
  <path d="M340,90 Q338,150 335,200" stroke="#ff77bb" stroke-width="1" fill="none" opacity="0.4"/>
  <path d="M360,90 Q362,150 365,200" stroke="#ff66aa" stroke-width="1.5" fill="none" opacity="0.5"/>
  <path d="M380,85 Q385,130 390,170" stroke="#ff77bb" stroke-width="1" fill="none" opacity="0.4"/>
</g>
<g filter="url(#jellyGlow)">
  <ellipse cx="480" cy="180" rx="30" ry="18" fill="url(#jelly1)" opacity="0.7"/>
  <path d="M455,185 Q450,230 445,260" stroke="#aa66ff" stroke-width="1" fill="none" opacity="0.4"/>
  <path d="M475,190 Q473,240 470,280" stroke="#bb77ff" stroke-width="1" fill="none" opacity="0.35"/>
  <path d="M495,190 Q498,240 500,275" stroke="#aa66ff" stroke-width="1" fill="none" opacity="0.4"/>
  <path d="M510,185 Q515,225 520,255" stroke="#bb77ff" stroke-width="1" fill="none" opacity="0.3"/>
</g>
<g filter="url(#jellyGlow2)">
  <ellipse cx="80" cy="260" rx="25" ry="15" fill="url(#jelly2)" opacity="0.6"/>
  <path d="M60,265 Q55,300 50,330" stroke="#ff66aa" stroke-width="1" fill="none" opacity="0.4"/>
  <path d="M75,270 Q73,310 70,345" stroke="#ff77bb" stroke-width="1" fill="none" opacity="0.35"/>
  <path d="M90,270 Q93,310 95,340" stroke="#ff66aa" stroke-width="1" fill="none" opacity="0.4"/>
  <path d="M100,265 Q105,295 110,320" stroke="#ff77bb" stroke-width="1" fill="none" opacity="0.3"/>
</g>
<g filter="url(#jellyGlow)">
  <ellipse cx="280" cy="240" rx="22" ry="13" fill="url(#jelly1)" opacity="0.5"/>
  <path d="M262,245 Q258,280 255,310" stroke="#aa66ff" stroke-width="1" fill="none" opacity="0.3"/>
  <path d="M278,250 Q276,290 274,330" stroke="#bb77ff" stroke-width="1" fill="none" opacity="0.25"/>
  <path d="M295,248 Q298,285 300,320" stroke="#aa66ff" stroke-width="1" fill="none" opacity="0.3"/>
</g>
${bubbles(6, 50, 550, 50, 350)}
`));

// 13. cargo_wreck.svg
fs.writeFileSync(path.join(dir, 'cargo_wreck.svg'), svg(`
<defs>
  <linearGradient id="bg13" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#003355" stop-opacity="0.3"/>
    <stop offset="100%" stop-color="#001122" stop-opacity="0.8"/>
  </linearGradient>
  <linearGradient id="crateGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#6a5a3a"/>
    <stop offset="100%" stop-color="#4a3a22"/>
  </linearGradient>
  ${glowFilter('cargoGlow', 2, '#667788')}
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg13)"/>
${sandFloor(340)}
<g>
  <rect x="80" y="280" width="50" height="55" fill="url(#crateGrad)" rx="2"/>
  <line x1="80" y1="307" x2="130" y2="307" stroke="#5a4a2a" stroke-width="1"/>
  <line x1="105" y1="280" x2="105" y2="335" stroke="#5a4a2a" stroke-width="1"/>
</g>
<g transform="rotate(-15,200,300)">
  <rect x="170" y="285" width="45" height="50" fill="url(#crateGrad)" rx="2" opacity="0.8"/>
  <line x1="170" y1="310" x2="215" y2="310" stroke="#5a4a2a" stroke-width="1" opacity="0.7"/>
  <line x1="192" y1="285" x2="192" y2="335" stroke="#5a4a2a" stroke-width="1" opacity="0.7"/>
</g>
<rect x="300" y="290" width="55" height="48" fill="url(#crateGrad)" rx="2" opacity="0.7"/>
<line x1="300" y1="314" x2="355" y2="314" stroke="#5a4a2a" stroke-width="1" opacity="0.6"/>
<ellipse cx="420" cy="320" rx="22" ry="28" fill="#5a4a3a" stroke="#4a3a22" stroke-width="1.5" opacity="0.7"/>
<line x1="420" y1="292" x2="420" y2="348" stroke="#4a3a22" stroke-width="1.5" opacity="0.5"/>
<ellipse cx="500" cy="310" rx="20" ry="25" fill="#5a4a3a" stroke="#4a3a22" stroke-width="1.5" opacity="0.6" transform="rotate(25,500,310)"/>
<circle cx="150" cy="350" r="6" fill="#ccaa44" opacity="0.4"/>
<circle cx="260" cy="345" r="5" fill="#ccaa44" opacity="0.35"/>
<circle cx="370" cy="348" r="4" fill="#ccaa44" opacity="0.3"/>
${smallFish(250, 150, 9, '#77aacc')}
${smallFish(280, 170, 7, '#88bbdd', true)}
${schoolOfFish(450, 120, 5, '#77ccee', 6)}
${seagrass(40, 345, 3, '#336633')}
${seagrass(550, 340, 2, '#2d6d2d')}
${bubbles(8, 80, 520, 100, 300)}
`));

// 14. reef_shark.svg
fs.writeFileSync(path.join(dir, 'reef_shark.svg'), svg(`
<defs>
  <linearGradient id="bg14" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#115577" stop-opacity="0.3"/>
    <stop offset="100%" stop-color="#0a2233" stop-opacity="0.7"/>
  </linearGradient>
  <linearGradient id="sharkGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#556677"/>
    <stop offset="40%" stop-color="#445566"/>
    <stop offset="60%" stop-color="#aabbcc"/>
    <stop offset="100%" stop-color="#ccddee"/>
  </linearGradient>
  ${glowFilter('sharkGlow', 2, '#778899')}
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg14)"/>
${lightRays(250, 0)}
<g transform="translate(80,150)" filter="url(#sharkGlow)">
  <path d="M0,40 Q30,25 80,15 Q150,5 250,10 Q350,15 400,30 Q420,35 400,45 Q350,55 250,55 Q150,60 80,50 Q30,48 0,40 Z" fill="url(#sharkGrad)"/>
  <path d="M180,10 L195,-25 L210,10" fill="#556677" opacity="0.9"/>
  <path d="M400,35 L440,20 L445,40 Z" fill="#556677" opacity="0.8"/>
  <path d="M400,40 L440,55 L445,35 Z" fill="#556677" opacity="0.7"/>
  <path d="M280,50 L310,70 L320,48" fill="#667788" opacity="0.6"/>
  <circle cx="60" cy="33" r="4" fill="#223344"/>
  <circle cx="61" cy="32" r="1.5" fill="#111"/>
  <path d="M10,38 Q20,35 30,38 Q20,42 10,38 Z" fill="#334455" opacity="0.6"/>
  <path d="M20,40 L-5,35 L-5,45 Z" fill="#445566"/>
</g>
${schoolOfFish(300, 90, 8, '#77ccee', 7)}
${schoolOfFish(450, 300, 6, '#88bbdd', 6)}
${smallFish(100, 320, 8, '#66aacc', true)}
${smallFish(520, 100, 7, '#77aacc')}
${bubbles(6, 100, 500, 50, 300)}
`));

// 15. hydrothermal_vent.svg
fs.writeFileSync(path.join(dir, 'hydrothermal_vent.svg'), svg(`
<defs>
  <linearGradient id="bg15" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#0a0a15" stop-opacity="0.6"/>
    <stop offset="100%" stop-color="#050508" stop-opacity="0.95"/>
  </linearGradient>
  <linearGradient id="smokeGrad" x1="0" y1="1" x2="0" y2="0">
    <stop offset="0%" stop-color="#888" stop-opacity="0.5"/>
    <stop offset="100%" stop-color="#888" stop-opacity="0"/>
  </linearGradient>
  ${glowFilter('ventGlow', 4, '#ff8844')}
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg15)"/>
<path d="M0,360 Q150,350 300,355 Q450,350 600,360 L600,400 L0,400 Z" fill="#1a1a1a"/>
<path d="M220,360 L260,280 Q280,260 300,255 Q320,260 340,280 L380,360 Z" fill="#2a2a2a"/>
<path d="M245,330 L270,290 Q285,275 300,270 Q315,275 330,290 L355,330 Z" fill="#333" opacity="0.7"/>
<path d="M270,290 Q285,280 300,275 Q315,280 330,290" stroke="#ff4400" stroke-width="2" fill="none" opacity="0.7" filter="url(#ventGlow)"/>
<path d="M280,310 Q290,300 300,295 Q310,300 320,310" stroke="#ff6600" stroke-width="1.5" fill="none" opacity="0.5"/>
<ellipse cx="300" cy="200" rx="25" ry="60" fill="url(#smokeGrad)" opacity="0.4"/>
<ellipse cx="290" cy="160" rx="20" ry="50" fill="url(#smokeGrad)" opacity="0.3"/>
<ellipse cx="310" cy="130" rx="18" ry="45" fill="url(#smokeGrad)" opacity="0.2"/>
<ellipse cx="295" cy="90" rx="15" ry="35" fill="url(#smokeGrad)" opacity="0.15"/>
<g opacity="0.4">
  <ellipse cx="150" cy="340" rx="5" ry="3" fill="#ddd" opacity="0.5"/>
  <path d="M148,340 L145,335 M152,340 L155,334" stroke="#ddd" stroke-width="0.5" opacity="0.4"/>
  <ellipse cx="420" cy="350" rx="4" ry="2.5" fill="#ddd" opacity="0.4"/>
  <path d="M418,350 L416,345 M422,350 L424,344" stroke="#ddd" stroke-width="0.5" opacity="0.3"/>
  <ellipse cx="350" cy="345" rx="3" ry="2" fill="#ddd" opacity="0.3"/>
  <ellipse cx="200" cy="355" rx="4" ry="2" fill="#ddd" opacity="0.3"/>
</g>
${bubbles(12, 270, 330, 100, 260)}
<circle cx="300" cy="260" r="3" fill="#ff6600" opacity="0.3" filter="url(#ventGlow)"/>
<circle cx="295" cy="245" r="2" fill="#ff8800" opacity="0.2"/>
`));

// 16. octopus_garden.svg
fs.writeFileSync(path.join(dir, 'octopus_garden.svg'), svg(`
<defs>
  <linearGradient id="bg16" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#1a3355" stop-opacity="0.3"/>
    <stop offset="100%" stop-color="#0a1525" stop-opacity="0.8"/>
  </linearGradient>
  <radialGradient id="octoGrad" cx="50%" cy="40%" r="50%">
    <stop offset="0%" stop-color="#cc4466"/>
    <stop offset="100%" stop-color="#882244"/>
  </radialGradient>
  ${glowFilter('octoGlow', 3, '#cc4466')}
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg16)"/>
${sandFloor(350)}
<g transform="translate(220,150)">
  <ellipse cx="80" cy="30" rx="50" ry="35" fill="url(#octoGrad)" filter="url(#octoGlow)"/>
  <circle cx="60" cy="22" r="10" fill="#dd5577" opacity="0.8"/>
  <circle cx="100" cy="22" r="10" fill="#dd5577" opacity="0.8"/>
  <circle cx="60" cy="20" r="5" fill="#fff" opacity="0.8"/>
  <circle cx="100" cy="20" r="5" fill="#fff" opacity="0.8"/>
  <circle cx="62" cy="19" r="3" fill="#111"/>
  <circle cx="102" cy="19" r="3" fill="#111"/>
  <path d="M30,55 Q10,100 -10,150 Q-15,170 0,180" stroke="#aa3355" stroke-width="5" fill="none" stroke-linecap="round"/>
  <path d="M45,60 Q30,110 20,160 Q15,185 30,195" stroke="#aa3355" stroke-width="5" fill="none" stroke-linecap="round"/>
  <path d="M65,65 Q55,120 50,170 Q48,195 60,200" stroke="#aa3355" stroke-width="5" fill="none" stroke-linecap="round"/>
  <path d="M95,65 Q100,120 105,170 Q108,195 100,200" stroke="#aa3355" stroke-width="5" fill="none" stroke-linecap="round"/>
  <path d="M115,60 Q130,110 140,160 Q145,185 130,195" stroke="#aa3355" stroke-width="5" fill="none" stroke-linecap="round"/>
  <path d="M130,55 Q150,100 170,150 Q175,170 160,180" stroke="#aa3355" stroke-width="5" fill="none" stroke-linecap="round"/>
  ${[0,1,2,3,4,5].map(i => {
    let s = '';
    for (let j = 0; j < 4; j++) {
      s += `<circle cx="${-10 + i * 30 + j * 5}" cy="${120 + j * 20}" r="2" fill="#dd6688" opacity="0.3"/>`;
    }
    return s;
  }).join('')}
</g>
<path d="M80,330 Q85,310 95,330 Q100,310 110,330" fill="#ccaa88" opacity="0.5"/>
<path d="M450,325 Q458,300 470,320 Q478,298 490,320" fill="#ccaa88" opacity="0.5"/>
<ellipse cx="130" cy="340" rx="12" ry="8" fill="#ddccaa" opacity="0.4"/>
<rect x="490" y="310" width="25" height="30" fill="#887766" opacity="0.4" rx="2"/>
<rect x="520" y="320" width="20" height="25" fill="#776655" opacity="0.3" rx="2"/>
${seagrass(40, 350, 3, '#336633')}
${seagrass(550, 350, 2, '#2d6d2d')}
${bubbles(8, 250, 380, 100, 250)}
`));

// 17. ghost_ship.svg
fs.writeFileSync(path.join(dir, 'ghost_ship.svg'), svg(`
<defs>
  <linearGradient id="bg17" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#0a2233" stop-opacity="0.4"/>
    <stop offset="100%" stop-color="#051015" stop-opacity="0.9"/>
  </linearGradient>
  <radialGradient id="ghostGlow" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="#33ff88" stop-opacity="0.2"/>
    <stop offset="100%" stop-color="#33ff88" stop-opacity="0"/>
  </radialGradient>
  ${glowFilter('greenGlow', 6, '#33ff88')}
  <linearGradient id="ghostHull" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#2a3a2a"/>
    <stop offset="100%" stop-color="#1a2a1a"/>
  </linearGradient>
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg17)"/>
<rect x="100" y="50" width="400" height="300" fill="url(#ghostGlow)"/>
<g transform="translate(100,100)" filter="url(#greenGlow)" opacity="0.8">
  <path d="M0,180 Q20,200 80,210 Q200,220 350,210 Q430,200 450,180 L440,160 Q400,170 350,175 Q200,180 80,175 Q30,170 10,160 Z" fill="url(#ghostHull)"/>
  <rect x="180" y="50" width="8" height="160" fill="#2a3a2a"/>
  <rect x="320" y="80" width="6" height="130" fill="#2a3a2a"/>
  <path d="M188,60 Q250,40 300,55 L320,80 L188,80 Z" fill="#1a3a1a" opacity="0.5"/>
  <path d="M188,80 Q230,70 260,85 L260,130 L188,130 Z" fill="#1a3a1a" opacity="0.4"/>
  <path d="M188,60 Q250,40 300,55" stroke="#33ff88" stroke-width="0.5" fill="none" opacity="0.3"/>
  <line x1="180" y1="55" x2="180" y2="30" stroke="#2a3a2a" stroke-width="3"/>
  <rect x="120" y="150" width="25" height="20" fill="#33ff88" opacity="0.08"/>
  <rect x="200" y="140" width="20" height="18" fill="#33ff88" opacity="0.06"/>
  <rect x="280" y="145" width="22" height="20" fill="#33ff88" opacity="0.07"/>
  <circle cx="350" cy="160" r="10" fill="none" stroke="#2a3a2a" stroke-width="2" opacity="0.5"/>
</g>
<circle cx="300" cy="250" r="3" fill="#33ff88" opacity="0.15"/>
<circle cx="250" cy="270" r="2" fill="#33ff88" opacity="0.1"/>
<circle cx="350" cy="260" r="2.5" fill="#33ff88" opacity="0.12"/>
${bubbles(8, 150, 450, 80, 250)}
${smallFish(80, 320, 7, '#445544', true)}
${smallFish(520, 300, 6, '#445544')}
`));

// 18. mermaid_ruins.svg
fs.writeFileSync(path.join(dir, 'mermaid_ruins.svg'), svg(`
<defs>
  <linearGradient id="bg18" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#1a2255" stop-opacity="0.3"/>
    <stop offset="100%" stop-color="#0a1030" stop-opacity="0.8"/>
  </linearGradient>
  <radialGradient id="mermaidGlow" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="#ff88cc" stop-opacity="0.15"/>
    <stop offset="50%" stop-color="#8888ff" stop-opacity="0.1"/>
    <stop offset="100%" stop-color="#8888ff" stop-opacity="0"/>
  </radialGradient>
  ${glowFilter('pinkGlow', 5, '#ff88cc')}
  ${glowFilter('blueGlow', 4, '#8888ff')}
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg18)"/>
<rect x="0" y="0" width="600" height="400" fill="url(#mermaidGlow)"/>
${sandFloor(360, '#8a7a88', '#5a4a58')}
<path d="M150,360 L150,150 Q150,130 180,130 Q210,130 250,130 Q280,130 280,150 L280,360" fill="none" stroke="#778899" stroke-width="4"/>
<path d="M150,130 Q215,100 280,130" fill="none" stroke="#778899" stroke-width="4"/>
<path d="M350,360 L350,170 Q350,150 380,150 Q410,150 440,150 Q470,150 470,170 L470,360" fill="none" stroke="#778899" stroke-width="4" opacity="0.8"/>
<path d="M350,150 Q410,120 470,150" fill="none" stroke="#778899" stroke-width="4" opacity="0.8"/>
<g transform="translate(80,180)">
  <rect x="0" y="0" width="15" height="180" fill="#667788" rx="2" opacity="0.6"/>
  <path d="M-5,0 Q7,20 20,0" fill="#778899" opacity="0.4"/>
</g>
<g transform="translate(500,200)">
  <rect x="0" y="0" width="15" height="160" fill="#667788" rx="2" opacity="0.6"/>
  <path d="M-5,0 Q7,20 20,0" fill="#778899" opacity="0.4"/>
</g>
<g transform="translate(240,250)" opacity="0.6">
  <path d="M0,110 L0,0 Q0,-30 30,-40 Q60,-30 60,0 L60,110" fill="none" stroke="#889" stroke-width="3"/>
  <ellipse cx="30" cy="80" rx="15" ry="20" fill="#ff88cc" opacity="0.1" filter="url(#pinkGlow)"/>
</g>
<path d="M290,300 Q300,260 310,280 Q320,260 330,290 Q340,270 350,300" fill="none" stroke="#88aacc" stroke-width="2" opacity="0.3" filter="url(#blueGlow)"/>
<circle cx="300" cy="200" r="20" fill="#ff88cc" opacity="0.06" filter="url(#pinkGlow)"/>
<circle cx="420" cy="250" r="15" fill="#8888ff" opacity="0.06" filter="url(#blueGlow)"/>
${smallFish(200, 200, 7, '#cc88ff')}
${smallFish(400, 180, 6, '#ff88cc', true)}
${bubbles(8, 100, 500, 100, 300)}
`));

// 19. kelp_forest.svg
fs.writeFileSync(path.join(dir, 'kelp_forest.svg'), svg(`
<defs>
  <linearGradient id="bg19" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#225533" stop-opacity="0.2"/>
    <stop offset="50%" stop-color="#113322" stop-opacity="0.5"/>
    <stop offset="100%" stop-color="#0a1a10" stop-opacity="0.8"/>
  </linearGradient>
  <linearGradient id="kelpGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#44aa44" stop-opacity="0.6"/>
    <stop offset="100%" stop-color="#226622" stop-opacity="0.8"/>
  </linearGradient>
  ${glowFilter('kelpGlow', 2, '#44aa44')}
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg19)"/>
<polygon points="200,0 180,200 220,200" fill="#ffffcc" opacity="0.04"/>
<polygon points="350,0 335,180 365,180" fill="#ffffcc" opacity="0.03"/>
<polygon points="480,0 465,150 495,150" fill="#ffffcc" opacity="0.03"/>
${[40, 100, 170, 250, 320, 400, 470, 540].map((x, i) => {
  const h = 250 + Math.random() * 120;
  const sway = 15 + Math.random() * 20;
  const w = 6 + Math.random() * 4;
  const op = 0.5 + Math.random() * 0.3;
  return `<path d="M${x},400 Q${x + sway},${400 - h / 3} ${x - sway / 2},${400 - h * 0.6} Q${x + sway * 0.8},${400 - h * 0.8} ${x + sway * 0.3},${400 - h}" stroke="#3a8833" stroke-width="${w}" fill="none" opacity="${op}" stroke-linecap="round"/>
  <ellipse cx="${x + sway * 0.3}" cy="${400 - h}" rx="${w * 1.5}" ry="${w}" fill="#44aa33" opacity="${op * 0.7}"/>
  <ellipse cx="${x - sway / 2}" cy="${400 - h * 0.6}" rx="${w * 1.2}" ry="${w * 0.8}" fill="#338822" opacity="${op * 0.5}"/>`;
}).join('\n')}
${[70, 140, 210, 290, 360, 440, 510].map((x, i) => {
  const h = 150 + Math.random() * 100;
  const sway = 10 + Math.random() * 15;
  return `<path d="M${x},400 Q${x - sway},${400 - h / 2} ${x + sway * 0.5},${400 - h}" stroke="#2a6622" stroke-width="4" fill="none" opacity="0.4" stroke-linecap="round"/>`;
}).join('\n')}
${smallFish(180, 250, 8, '#77aacc')}
${smallFish(350, 200, 7, '#88bbdd', true)}
${smallFish(450, 300, 6, '#66aacc')}
${smallFish(120, 150, 9, '#77ccaa', true)}
${bubbles(10, 50, 550, 50, 350)}
`));

// 20. pirate_battle.svg
fs.writeFileSync(path.join(dir, 'pirate_battle.svg'), svg(`
<defs>
  <linearGradient id="bg20" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#003355" stop-opacity="0.3"/>
    <stop offset="100%" stop-color="#001525" stop-opacity="0.8"/>
  </linearGradient>
  <linearGradient id="metalGrad" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%" stop-color="#aabbcc"/>
    <stop offset="50%" stop-color="#889999"/>
    <stop offset="100%" stop-color="#667788"/>
  </linearGradient>
  ${glowFilter('metalGlow', 2, '#aabbcc')}
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg20)"/>
${sandFloor(350)}
<g transform="translate(100,180) rotate(-30)" opacity="0.7">
  <rect x="0" y="-3" width="120" height="6" fill="url(#metalGrad)" rx="1"/>
  <path d="M120,-8 L135,0 L120,8 Z" fill="#aabbcc"/>
  <rect x="-15" y="-10" width="15" height="20" fill="#665544" rx="2"/>
  <line x1="-8" y1="-10" x2="-8" y2="10" stroke="#554433" stroke-width="1"/>
</g>
<g transform="translate(350,200) rotate(20)" opacity="0.65">
  <rect x="0" y="-3" width="110" height="6" fill="url(#metalGrad)" rx="1"/>
  <path d="M110,-8 L125,0 L110,8 Z" fill="#aabbcc"/>
  <rect x="-15" y="-10" width="15" height="20" fill="#665544" rx="2"/>
</g>
<circle cx="200" cy="310" r="22" fill="none" stroke="#889999" stroke-width="3" opacity="0.5"/>
<line x1="200" y1="288" x2="200" y2="332" stroke="#889999" stroke-width="2" opacity="0.4"/>
<line x1="178" y1="310" x2="222" y2="310" stroke="#889999" stroke-width="2" opacity="0.4"/>
<circle cx="420" cy="300" r="18" fill="none" stroke="#889999" stroke-width="2.5" opacity="0.4"/>
<circle cx="80" cy="340" r="8" fill="#333" opacity="0.5"/>
<circle cx="300" cy="350" r="9" fill="#333" opacity="0.45"/>
<circle cx="500" cy="335" r="7" fill="#333" opacity="0.4"/>
<circle cx="160" cy="345" r="6" fill="#333" opacity="0.35"/>
<circle cx="450" cy="345" r="7" fill="#333" opacity="0.4"/>
${smallFish(300, 100, 8, '#77aacc')}
${smallFish(330, 120, 6, '#88bbdd', true)}
${bubbles(8, 80, 520, 80, 300)}
${seagrass(550, 350, 2, '#336633')}
`));

// 21. atlantean_gateway.svg
fs.writeFileSync(path.join(dir, 'atlantean_gateway.svg'), svg(`
<defs>
  <linearGradient id="bg21" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#112244" stop-opacity="0.3"/>
    <stop offset="100%" stop-color="#081122" stop-opacity="0.85"/>
  </linearGradient>
  <radialGradient id="gateGlow" cx="50%" cy="50%" r="35%">
    <stop offset="0%" stop-color="#ffcc44" stop-opacity="0.3"/>
    <stop offset="100%" stop-color="#ffcc44" stop-opacity="0"/>
  </radialGradient>
  ${glowFilter('goldGlow2', 6, '#ffcc44')}
  <linearGradient id="stoneArch" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#889988"/>
    <stop offset="100%" stop-color="#556655"/>
  </linearGradient>
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg21)"/>
<rect x="100" y="50" width="400" height="300" fill="url(#gateGlow)"/>
${sandFloor(370, '#6a7a66', '#4a5a44')}
<rect x="170" y="80" width="35" height="290" fill="url(#stoneArch)" rx="3"/>
<rect x="395" y="80" width="35" height="290" fill="url(#stoneArch)" rx="3"/>
<path d="M170,80 Q300,10 430,80" fill="url(#stoneArch)" stroke="#667766" stroke-width="2"/>
<path d="M190,95 Q300,35 410,95" fill="#445544" opacity="0.5"/>
<g transform="translate(300,60)" filter="url(#goldGlow2)">
  <line x1="0" y1="-15" x2="0" y2="25" stroke="#ffcc44" stroke-width="3" opacity="0.7"/>
  <line x1="-6" y1="25" x2="0" y2="35" stroke="#ffcc44" stroke-width="2" opacity="0.6"/>
  <line x1="6" y1="25" x2="0" y2="35" stroke="#ffcc44" stroke-width="2" opacity="0.6"/>
  <line x1="-8" y1="0" x2="8" y2="0" stroke="#ffcc44" stroke-width="2" opacity="0.6"/>
</g>
<rect x="180" y="130" width="10" height="3" fill="#667766" opacity="0.5"/>
<rect x="180" y="180" width="10" height="3" fill="#667766" opacity="0.5"/>
<rect x="180" y="230" width="10" height="3" fill="#667766" opacity="0.5"/>
<rect x="410" y="130" width="10" height="3" fill="#667766" opacity="0.5"/>
<rect x="410" y="180" width="10" height="3" fill="#667766" opacity="0.5"/>
<rect x="410" y="230" width="10" height="3" fill="#667766" opacity="0.5"/>
<circle cx="300" cy="200" r="40" fill="#ffcc44" opacity="0.05" filter="url(#goldGlow2)"/>
<circle cx="300" cy="200" r="20" fill="#ffcc44" opacity="0.08"/>
${smallFish(300, 200, 8, '#ccaa44')}
${smallFish(270, 220, 6, '#bbaa55', true)}
${bubbles(8, 150, 450, 80, 300)}
${seagrass(100, 370, 3, '#336633')}
${seagrass(500, 370, 3, '#2d6d2d')}
`));

// 22. pufferfish_cove.svg
fs.writeFileSync(path.join(dir, 'pufferfish_cove.svg'), svg(`
<defs>
  <linearGradient id="bg22" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#0a5577" stop-opacity="0.3"/>
    <stop offset="100%" stop-color="#0a2233" stop-opacity="0.7"/>
  </linearGradient>
  <radialGradient id="pufferGrad" cx="50%" cy="45%" r="50%">
    <stop offset="0%" stop-color="#ddcc55"/>
    <stop offset="100%" stop-color="#aa8833"/>
  </radialGradient>
  ${glowFilter('pufferGlow', 2, '#ddcc55')}
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg22)"/>
${sandFloor(350)}
<g transform="translate(200,150)" filter="url(#pufferGlow)">
  <circle cx="0" cy="0" r="40" fill="url(#pufferGrad)"/>
  ${(() => {
    let s = '';
    for (let a = 0; a < 360; a += 25) {
      const rad = a * Math.PI / 180;
      const x1 = Math.cos(rad) * 38;
      const y1 = Math.sin(rad) * 38;
      const x2 = Math.cos(rad) * 48;
      const y2 = Math.sin(rad) * 48;
      s += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#aa8833" stroke-width="1.5" opacity="0.6"/>`;
    }
    return s;
  })()}
  <circle cx="-12" cy="-10" r="6" fill="white" opacity="0.8"/>
  <circle cx="12" cy="-10" r="6" fill="white" opacity="0.8"/>
  <circle cx="-10" cy="-10" r="3" fill="#111"/>
  <circle cx="14" cy="-10" r="3" fill="#111"/>
  <ellipse cx="0" cy="5" rx="5" ry="3" fill="#885522" opacity="0.5"/>
  <path d="M30,5 Q40,0 35,-10" fill="#ddcc55" opacity="0.6"/>
</g>
<g transform="translate(420,200)" filter="url(#pufferGlow)">
  <circle cx="0" cy="0" r="28" fill="url(#pufferGrad)" opacity="0.8"/>
  ${(() => {
    let s = '';
    for (let a = 0; a < 360; a += 30) {
      const rad = a * Math.PI / 180;
      const x1 = Math.cos(rad) * 26;
      const y1 = Math.sin(rad) * 26;
      const x2 = Math.cos(rad) * 34;
      const y2 = Math.sin(rad) * 34;
      s += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#aa8833" stroke-width="1.2" opacity="0.5"/>`;
    }
    return s;
  })()}
  <circle cx="-8" cy="-7" r="4" fill="white" opacity="0.7"/>
  <circle cx="8" cy="-7" r="4" fill="white" opacity="0.7"/>
  <circle cx="-7" cy="-7" r="2" fill="#111"/>
  <circle cx="9" cy="-7" r="2" fill="#111"/>
</g>
<circle cx="100" cy="330" r="18" fill="#ff6677" opacity="0.4"/>
<circle cx="105" cy="325" r="15" fill="#ff7788" opacity="0.3"/>
${(() => {
  let s = '';
  for (let a = 0; a < 360; a += 40) {
    const rad = a * Math.PI / 180;
    s += `<circle cx="${100 + Math.cos(rad) * 20}" cy="${330 + Math.sin(rad) * 12}" r="3" fill="#ff8899" opacity="0.3"/>`;
  }
  return s;
})()}
<circle cx="500" cy="310" r="15" fill="#ff9966" opacity="0.35"/>
<circle cx="503" cy="306" r="12" fill="#ffaa77" opacity="0.25"/>
${seagrass(50, 350, 3, '#338844')}
${seagrass(300, 350, 2, '#2d7d3d')}
${bubbles(10, 150, 500, 80, 300)}
`));

// 23. navigator_cache.svg
fs.writeFileSync(path.join(dir, 'navigator_cache.svg'), svg(`
<defs>
  <linearGradient id="bg23" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#003355" stop-opacity="0.3"/>
    <stop offset="100%" stop-color="#001525" stop-opacity="0.8"/>
  </linearGradient>
  <linearGradient id="chestGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#6a4422"/>
    <stop offset="100%" stop-color="#4a2a11"/>
  </linearGradient>
  ${glowFilter('compassGlow', 3, '#ffcc44')}
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg23)"/>
${sandFloor(340)}
<g transform="translate(200,250)">
  <rect x="0" y="0" width="100" height="60" fill="url(#chestGrad)" rx="3"/>
  <rect x="-5" y="-5" width="110" height="10" fill="#7a5533" rx="2"/>
  <rect x="0" y="25" width="100" height="3" fill="#5a3a1a" opacity="0.5"/>
  <circle cx="50" cy="35" r="5" fill="#ccaa44" opacity="0.7"/>
  <rect x="5" y="55" width="90" height="5" fill="#5a3a1a" rx="1"/>
</g>
<g transform="translate(400,220)">
  <circle cx="0" cy="0" r="45" fill="none" stroke="#ccaa44" stroke-width="2" opacity="0.6" filter="url(#compassGlow)"/>
  <circle cx="0" cy="0" r="40" fill="none" stroke="#ccaa44" stroke-width="1" opacity="0.4"/>
  <line x1="0" y1="-35" x2="0" y2="35" stroke="#ccaa44" stroke-width="1" opacity="0.5"/>
  <line x1="-35" y1="0" x2="35" y2="0" stroke="#ccaa44" stroke-width="1" opacity="0.5"/>
  <polygon points="0,-30 -5,-5 0,-10 5,-5" fill="#cc3333" opacity="0.7"/>
  <polygon points="0,30 -5,5 0,10 5,5" fill="#cccccc" opacity="0.5"/>
  <circle cx="0" cy="0" r="4" fill="#ccaa44" opacity="0.6"/>
  <text x="0" y="-32" text-anchor="middle" fill="#ccaa44" font-size="8" opacity="0.5">N</text>
  <text x="0" y="40" text-anchor="middle" fill="#ccaa44" font-size="8" opacity="0.5">S</text>
</g>
<g transform="translate(100,280) rotate(-5)" opacity="0.6">
  <rect x="0" y="0" width="60" height="45" fill="#c2a366" rx="2"/>
  <path d="M10,10 L30,20 L50,10 M15,25 L35,35" stroke="#8a7345" stroke-width="1" fill="none" opacity="0.5"/>
  <circle cx="45" cy="35" r="3" fill="#cc3333" opacity="0.5"/>
</g>
${smallFish(350, 130, 8, '#77aacc')}
${smallFish(150, 150, 7, '#88bbdd', true)}
${bubbles(8, 100, 500, 80, 280)}
${seagrass(40, 345, 2, '#336633')}
${seagrass(550, 340, 3, '#2d6d2d')}
`));

// 24. deep_cold.svg
fs.writeFileSync(path.join(dir, 'deep_cold.svg'), svg(`
<defs>
  <linearGradient id="bg24" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#0a1525" stop-opacity="0.5"/>
    <stop offset="100%" stop-color="#030810" stop-opacity="0.95"/>
  </linearGradient>
  ${glowFilter('iceGlow', 4, '#88ccff')}
  <linearGradient id="iceGrad" x1="0" y1="0" x2="0.5" y2="1">
    <stop offset="0%" stop-color="#aaddff" stop-opacity="0.6"/>
    <stop offset="100%" stop-color="#6699cc" stop-opacity="0.3"/>
  </linearGradient>
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg24)"/>
<g opacity="0.7">
  <path d="M200,160 Q190,140 200,110 Q210,80 220,90 L230,160 Z" fill="url(#iceGrad)" filter="url(#iceGlow)"/>
  <path d="M230,140 Q225,120 235,95 Q245,75 250,85 L255,140 Z" fill="url(#iceGrad)" filter="url(#iceGlow)"/>
  <path d="M400,180 Q395,160 405,130 Q415,105 422,115 L425,180 Z" fill="url(#iceGrad)" filter="url(#iceGlow)"/>
  <path d="M430,160 Q422,140 430,115 Q440,95 448,105 L450,160 Z" fill="url(#iceGrad)" filter="url(#iceGlow)"/>
  <path d="M80,120 Q75,100 82,75 L95,120 Z" fill="url(#iceGrad)" filter="url(#iceGlow)" opacity="0.5"/>
  <path d="M520,140 Q518,120 525,100 L535,140 Z" fill="url(#iceGrad)" filter="url(#iceGlow)" opacity="0.5"/>
</g>
<g transform="translate(130,250)">
  <ellipse cx="0" cy="0" rx="30" ry="20" fill="#222" opacity="0.8"/>
  <circle cx="-10" cy="-5" r="8" fill="#113344" opacity="0.8"/>
  <circle cx="10" cy="-5" r="8" fill="#113344" opacity="0.8"/>
  <circle cx="-10" cy="-6" r="4" fill="#88ccff" opacity="0.6"/>
  <circle cx="10" cy="-6" r="4" fill="#88ccff" opacity="0.6"/>
  <circle cx="-9" cy="-7" r="2" fill="#fff" opacity="0.4"/>
  <circle cx="11" cy="-7" r="2" fill="#fff" opacity="0.4"/>
  <ellipse cx="0" cy="8" rx="4" ry="2" fill="#334" opacity="0.5"/>
</g>
<g transform="translate(400,290)">
  <ellipse cx="0" cy="0" rx="25" ry="17" fill="#222" opacity="0.7"/>
  <circle cx="-8" cy="-4" r="7" fill="#113344" opacity="0.8"/>
  <circle cx="8" cy="-4" r="7" fill="#113344" opacity="0.8"/>
  <circle cx="-8" cy="-5" r="3.5" fill="#88ccff" opacity="0.6"/>
  <circle cx="8" cy="-5" r="3.5" fill="#88ccff" opacity="0.6"/>
  <circle cx="-7" cy="-6" r="1.5" fill="#fff" opacity="0.4"/>
  <circle cx="9" cy="-6" r="1.5" fill="#fff" opacity="0.4"/>
</g>
<path d="M0,380 Q150,370 300,380 Q450,370 600,380 L600,400 L0,400 Z" fill="#111522" opacity="0.5"/>
${bubbles(6, 100, 500, 100, 350)}
`));

// 25. singing_shells.svg
fs.writeFileSync(path.join(dir, 'singing_shells.svg'), svg(`
<defs>
  <linearGradient id="bg25" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#1a3366" stop-opacity="0.3"/>
    <stop offset="100%" stop-color="#0a1530" stop-opacity="0.8"/>
  </linearGradient>
  ${glowFilter('shellGlow', 4, '#ffaacc')}
  <radialGradient id="shellRad" cx="30%" cy="30%" r="70%">
    <stop offset="0%" stop-color="#ffccdd"/>
    <stop offset="100%" stop-color="#cc8899"/>
  </radialGradient>
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg25)"/>
${sandFloor(360)}
${[0, 1, 2, 3, 4, 5, 6, 7].map(i => {
  const angle = i * Math.PI / 4;
  const cx = 300 + Math.cos(angle) * 100;
  const cy = 220 + Math.sin(angle) * 80;
  const rot = (i * 45);
  return `<g transform="translate(${cx.toFixed(0)},${cy.toFixed(0)}) rotate(${rot})" filter="url(#shellGlow)">
  <path d="M0,0 Q-8,-15 0,-25 Q8,-15 0,0 Z" fill="url(#shellRad)" opacity="0.7"/>
  <path d="M0,0 Q-3,-10 0,-20" stroke="#cc8899" stroke-width="0.5" fill="none" opacity="0.5"/>
  <path d="M0,0 Q3,-10 0,-20" stroke="#cc8899" stroke-width="0.5" fill="none" opacity="0.5"/>
</g>`;
}).join('\n')}
<g opacity="0.5" filter="url(#shellGlow)">
  <path d="M250,130 Q245,120 248,112 Q255,115 250,130 Z" fill="#ffaacc" opacity="0.6"/>
  <path d="M248,112 L245,105 Q250,100 255,105 Z" fill="#ffaacc" opacity="0.4"/>
  <path d="M350,150 Q348,140 355,135 Q360,140 350,150 Z" fill="#ffaacc" opacity="0.6"/>
  <path d="M355,135 L352,128 Q358,125 362,130 Z" fill="#ffaacc" opacity="0.4"/>
  <path d="M300,100 Q295,90 300,82 Q305,90 300,100 Z" fill="#ffaacc" opacity="0.5"/>
  <path d="M300,82 L297,75 Q303,72 306,77 Z" fill="#ffaacc" opacity="0.3"/>
</g>
<circle cx="300" cy="220" r="15" fill="#ffaacc" opacity="0.08" filter="url(#shellGlow)"/>
<circle cx="300" cy="220" r="30" fill="#ffaacc" opacity="0.04"/>
${smallFish(100, 150, 8, '#77aacc')}
${smallFish(500, 180, 7, '#88bbdd', true)}
${bubbles(8, 100, 500, 80, 300)}
`));

// 26. dolphin_pod.svg
fs.writeFileSync(path.join(dir, 'dolphin_pod.svg'), svg(`
<defs>
  <linearGradient id="bg26" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#2277aa" stop-opacity="0.2"/>
    <stop offset="100%" stop-color="#0a3355" stop-opacity="0.6"/>
  </linearGradient>
  <linearGradient id="dolphinGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#556688"/>
    <stop offset="60%" stop-color="#778899"/>
    <stop offset="100%" stop-color="#aabbcc"/>
  </linearGradient>
  ${glowFilter('sparkle', 3, '#ffffff')}
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg26)"/>
${lightRays(300, 0)}
<g transform="translate(100,120) rotate(-20)">
  <path d="M0,15 Q20,5 60,0 Q100,-5 130,5 Q140,10 130,15 Q100,25 60,25 Q20,22 0,15 Z" fill="url(#dolphinGrad)"/>
  <path d="M80,-5 L90,-20 L100,-3" fill="#556688"/>
  <path d="M130,10 L150,5 L145,18 Z" fill="#556688" opacity="0.8"/>
  <circle cx="25" cy="12" r="2.5" fill="#223"/>
</g>
<g transform="translate(250,80) rotate(-15)">
  <path d="M0,15 Q20,5 60,0 Q100,-5 130,5 Q140,10 130,15 Q100,25 60,25 Q20,22 0,15 Z" fill="url(#dolphinGrad)"/>
  <path d="M80,-5 L90,-20 L100,-3" fill="#556688"/>
  <path d="M130,10 L150,5 L145,18 Z" fill="#556688" opacity="0.8"/>
  <circle cx="25" cy="12" r="2.5" fill="#223"/>
</g>
<g transform="translate(400,150) rotate(-10)">
  <path d="M0,12 Q15,4 45,0 Q75,-4 100,4 Q108,7 100,12 Q75,20 45,20 Q15,18 0,12 Z" fill="url(#dolphinGrad)" opacity="0.8"/>
  <path d="M60,-4 L68,-16 L76,-2" fill="#556688" opacity="0.8"/>
  <path d="M100,8 L115,4 L112,14 Z" fill="#556688" opacity="0.7"/>
  <circle cx="18" cy="9" r="2" fill="#223"/>
</g>
<g transform="translate(180,200) rotate(-5)">
  <path d="M0,10 Q12,3 36,0 Q60,-3 80,3 Q86,6 80,10 Q60,16 36,16 Q12,14 0,10 Z" fill="url(#dolphinGrad)" opacity="0.7"/>
  <path d="M48,-3 L54,-13 L60,-1" fill="#556688" opacity="0.7"/>
  <circle cx="14" cy="7" r="1.5" fill="#223"/>
</g>
${(() => {
  let s = '';
  const sparkles = [[150,100],[280,70],[420,140],[200,180],[350,110],[500,100]];
  sparkles.forEach(([x,y]) => {
    s += `<circle cx="${x}" cy="${y}" r="1.5" fill="white" opacity="0.5" filter="url(#sparkle)"/>`;
  });
  return s;
})()}
${bubbles(10, 80, 520, 50, 250)}
`));

// 27. sunken_train.svg
fs.writeFileSync(path.join(dir, 'sunken_train.svg'), svg(`
<defs>
  <linearGradient id="bg27" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#003355" stop-opacity="0.3"/>
    <stop offset="100%" stop-color="#001122" stop-opacity="0.8"/>
  </linearGradient>
  <linearGradient id="trainGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#4a3a2a"/>
    <stop offset="100%" stop-color="#2a1a0a"/>
  </linearGradient>
  ${glowFilter('trainGlow', 2, '#667788')}
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg27)"/>
${sandFloor(340)}
<g transform="translate(100,220)" filter="url(#trainGlow)">
  <rect x="0" y="20" width="180" height="90" fill="url(#trainGrad)" rx="5"/>
  <rect x="-30" y="0" width="70" height="110" fill="url(#trainGrad)" rx="8"/>
  <rect x="-30" y="0" width="70" height="30" fill="#3a2a1a" rx="8"/>
  <rect x="-15" y="-30" width="15" height="35" fill="#4a3a2a" rx="2"/>
  ${coralBranch(-8, -30, 25, '#ff6677')}
  <circle cx="20" cy="110" r="18" fill="#333" stroke="#444" stroke-width="3"/>
  <circle cx="20" cy="110" r="8" fill="#222"/>
  <circle cx="80" cy="110" r="18" fill="#333" stroke="#444" stroke-width="3"/>
  <circle cx="80" cy="110" r="8" fill="#222"/>
  <circle cx="140" cy="110" r="18" fill="#333" stroke="#444" stroke-width="3"/>
  <circle cx="140" cy="110" r="8" fill="#222"/>
  <rect x="20" y="40" width="25" height="20" fill="#334" opacity="0.5" rx="1"/>
  <rect x="60" y="40" width="25" height="20" fill="#334" opacity="0.4" rx="1"/>
  <rect x="100" y="40" width="25" height="20" fill="#334" opacity="0.45" rx="1"/>
  <rect x="140" y="40" width="25" height="20" fill="#334" opacity="0.35" rx="1"/>
  <circle cx="-15" cy="55" r="8" fill="#223" opacity="0.6"/>
  <line x1="0" y1="115" x2="180" y2="115" stroke="#444" stroke-width="2" opacity="0.5"/>
</g>
${seagrass(400, 345, 3, '#336633')}
${seagrass(500, 340, 4, '#2d6d2d')}
${smallFish(380, 150, 8, '#77aacc')}
${smallFish(450, 180, 7, '#88bbdd', true)}
${bubbles(10, 80, 350, 100, 280)}
`));

// 28. crystal_cave.svg
fs.writeFileSync(path.join(dir, 'crystal_cave.svg'), svg(`
<defs>
  <linearGradient id="bg28" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#0a0a20" stop-opacity="0.6"/>
    <stop offset="100%" stop-color="#050510" stop-opacity="0.95"/>
  </linearGradient>
  ${glowFilter('crystalGlow', 6, '#8844ff')}
  ${glowFilter('crystalGlow2', 5, '#4488ff')}
  <linearGradient id="crystalPurple" x1="0" y1="0" x2="0.5" y2="1">
    <stop offset="0%" stop-color="#cc88ff" stop-opacity="0.7"/>
    <stop offset="100%" stop-color="#6622aa" stop-opacity="0.5"/>
  </linearGradient>
  <linearGradient id="crystalBlue" x1="0" y1="0" x2="0.5" y2="1">
    <stop offset="0%" stop-color="#88ccff" stop-opacity="0.7"/>
    <stop offset="100%" stop-color="#2266aa" stop-opacity="0.5"/>
  </linearGradient>
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg28)"/>
<path d="M0,100 Q100,80 200,120 Q250,150 300,200 Q350,250 300,350 L300,400 L0,400 Z" fill="#111" opacity="0.7"/>
<path d="M600,100 Q500,80 400,120 Q350,150 300,200 Q250,250 300,350 L300,400 L600,400 Z" fill="#111" opacity="0.7"/>
<path d="M150,100 Q200,80 250,120 Q280,160 300,200" stroke="#222" stroke-width="3" fill="none"/>
<path d="M450,100 Q400,80 350,120 Q320,160 300,200" stroke="#222" stroke-width="3" fill="none"/>
<g filter="url(#crystalGlow)">
  <polygon points="120,300 130,220 140,300" fill="url(#crystalPurple)"/>
  <polygon points="150,310 165,240 175,310" fill="url(#crystalPurple)" opacity="0.8"/>
  <polygon points="180,300 188,250 198,300" fill="url(#crystalBlue)"/>
  <polygon points="400,290 412,210 422,290" fill="url(#crystalPurple)"/>
  <polygon points="430,300 440,245 450,300" fill="url(#crystalBlue)" opacity="0.8"/>
  <polygon points="460,310 468,260 478,310" fill="url(#crystalPurple)" opacity="0.7"/>
</g>
<g filter="url(#crystalGlow2)">
  <polygon points="230,350 240,290 248,350" fill="url(#crystalBlue)" opacity="0.6"/>
  <polygon points="350,340 358,280 368,340" fill="url(#crystalBlue)" opacity="0.6"/>
  <polygon points="280,370 290,320 300,370" fill="url(#crystalPurple)" opacity="0.5"/>
  <polygon points="310,365 318,310 328,365" fill="url(#crystalBlue)" opacity="0.5"/>
</g>
<circle cx="300" cy="200" r="30" fill="#8844ff" opacity="0.06" filter="url(#crystalGlow)"/>
<circle cx="300" cy="200" r="15" fill="#4488ff" opacity="0.08"/>
${bubbles(6, 200, 400, 150, 350)}
`));

// 29. giant_clam.svg
fs.writeFileSync(path.join(dir, 'giant_clam.svg'), svg(`
<defs>
  <linearGradient id="bg29" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#0a5577" stop-opacity="0.3"/>
    <stop offset="100%" stop-color="#0a2233" stop-opacity="0.7"/>
  </linearGradient>
  <radialGradient id="pearlGlow" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="#ffffff" stop-opacity="0.8"/>
    <stop offset="50%" stop-color="#ffeeff" stop-opacity="0.4"/>
    <stop offset="100%" stop-color="#ffccff" stop-opacity="0"/>
  </radialGradient>
  ${glowFilter('pearlG', 8, '#ffffff')}
  <linearGradient id="clamGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#cc99aa"/>
    <stop offset="100%" stop-color="#886677"/>
  </linearGradient>
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg29)"/>
${sandFloor(340)}
<g transform="translate(150,170)">
  <path d="M0,180 Q30,130 60,100 Q120,60 180,80 Q240,100 270,130 Q300,180 300,180 Z" fill="url(#clamGrad)" opacity="0.8"/>
  <path d="M0,180 Q30,130 60,100" stroke="#aa7788" stroke-width="1.5" fill="none" opacity="0.5"/>
  <path d="M40,180 Q65,140 90,110" stroke="#aa7788" stroke-width="1.5" fill="none" opacity="0.45"/>
  <path d="M80,180 Q100,150 120,120" stroke="#aa7788" stroke-width="1.5" fill="none" opacity="0.4"/>
  <path d="M120,180 Q135,150 150,125" stroke="#aa7788" stroke-width="1.5" fill="none" opacity="0.4"/>
  <path d="M160,180 Q170,155 180,135" stroke="#aa7788" stroke-width="1.5" fill="none" opacity="0.4"/>
  <path d="M200,180 Q210,160 220,140" stroke="#aa7788" stroke-width="1.5" fill="none" opacity="0.45"/>
  <path d="M240,180 Q250,160 260,145" stroke="#aa7788" stroke-width="1.5" fill="none" opacity="0.5"/>
  <path d="M0,180 Q50,200 100,210 Q150,215 200,210 Q250,200 300,180" fill="url(#clamGrad)" opacity="0.7"/>
  <path d="M0,180 Q50,200 100,210" stroke="#aa7788" stroke-width="1" fill="none" opacity="0.4"/>
  <path d="M60,185 Q100,205 140,210" stroke="#aa7788" stroke-width="1" fill="none" opacity="0.35"/>
  <path d="M120,185 Q160,205 200,210" stroke="#aa7788" stroke-width="1" fill="none" opacity="0.35"/>
  <path d="M180,185 Q220,200 260,195" stroke="#aa7788" stroke-width="1" fill="none" opacity="0.4"/>
  <circle cx="150" cy="175" r="20" fill="url(#pearlGlow)" filter="url(#pearlG)"/>
  <circle cx="145" cy="170" r="5" fill="white" opacity="0.6"/>
</g>
${seagrass(60, 345, 3, '#338844')}
${seagrass(500, 345, 4, '#2d7d3d')}
${smallFish(100, 100, 9, '#77aacc')}
${smallFish(500, 120, 8, '#88bbdd', true)}
${bubbles(8, 100, 500, 60, 280)}
`));

// 30. submarine_wreck.svg
fs.writeFileSync(path.join(dir, 'submarine_wreck.svg'), svg(`
<defs>
  <linearGradient id="bg30" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#0a1a2a" stop-opacity="0.4"/>
    <stop offset="100%" stop-color="#050a10" stop-opacity="0.9"/>
  </linearGradient>
  <linearGradient id="subGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#556666"/>
    <stop offset="100%" stop-color="#334444"/>
  </linearGradient>
  ${glowFilter('subGlow', 3, '#ffaa44')}
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg30)"/>
${sandFloor(350)}
<g transform="translate(40,200)">
  <ellipse cx="120" cy="50" rx="120" ry="40" fill="url(#subGrad)"/>
  <ellipse cx="0" cy="50" rx="20" ry="30" fill="#445555"/>
  <rect x="80" y="15" width="10" height="30" fill="#445555" rx="2"/>
  <rect x="60" y="10" width="50" height="8" fill="#445555" rx="2"/>
  <circle cx="50" cy="40" r="8" fill="#334" opacity="0.6"/>
  <circle cx="90" cy="38" r="7" fill="#334" opacity="0.5"/>
  <circle cx="130" cy="38" r="7" fill="#334" opacity="0.5"/>
  <path d="M200,30 L230,20 L228,40 Z" fill="#445555" opacity="0.7"/>
  <path d="M200,70 L230,80 L228,60 Z" fill="#445555" opacity="0.6"/>
</g>
<g transform="translate(350,220)">
  <ellipse cx="100" cy="40" rx="100" ry="35" fill="url(#subGrad)" opacity="0.8"/>
  <ellipse cx="200" cy="40" rx="18" ry="25" fill="#445555" opacity="0.8"/>
  <circle cx="60" cy="30" r="6" fill="#334" opacity="0.5"/>
  <circle cx="100" cy="28" r="6" fill="#334" opacity="0.45"/>
  <circle cx="140" cy="30" r="6" fill="#334" opacity="0.4"/>
</g>
<path d="M260,240 Q280,250 290,260 Q310,280 320,260 Q330,240 350,230" stroke="#556666" stroke-width="2" fill="none" opacity="0.3" stroke-dasharray="4,3"/>
<circle cx="280" cy="250" r="5" fill="#ffaa44" opacity="0.3" filter="url(#subGlow)"/>
<circle cx="310" cy="260" r="4" fill="#ffaa44" opacity="0.2" filter="url(#subGlow)"/>
<circle cx="295" cy="240" r="3" fill="#ffaa44" opacity="0.15"/>
${smallFish(300, 130, 8, '#77aacc')}
${smallFish(500, 150, 7, '#88bbdd', true)}
${bubbles(10, 100, 500, 100, 300)}
${seagrass(550, 350, 2, '#336633')}
`));

// 31. treasure_minor.svg
fs.writeFileSync(path.join(dir, 'treasure_minor.svg'), svg(`
<defs>
  <linearGradient id="bg31" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#003355" stop-opacity="0.3"/>
    <stop offset="100%" stop-color="#001525" stop-opacity="0.8"/>
  </linearGradient>
  ${glowFilter('coinGlow', 3, '#ffcc44')}
  <radialGradient id="potGrad" cx="50%" cy="40%" r="60%">
    <stop offset="0%" stop-color="#aa7744"/>
    <stop offset="100%" stop-color="#664422"/>
  </radialGradient>
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg31)"/>
${sandFloor(340)}
<g transform="translate(220,200)">
  <path d="M0,120 Q-10,60 10,20 Q30,0 80,0 Q130,0 150,20 Q170,60 160,120 Z" fill="url(#potGrad)"/>
  <ellipse cx="80" cy="10" rx="60" ry="12" fill="#bb8855" opacity="0.6"/>
  <path d="M60,50 L80,80 L100,50" stroke="#553311" stroke-width="2" fill="none" opacity="0.4"/>
  <line x1="80" y1="80" x2="80" y2="120" stroke="#553311" stroke-width="1.5" fill="none" opacity="0.3"/>
</g>
${(() => {
  let s = '';
  const coins = [[380,300],[395,310],[370,315],[410,305],[385,325],[400,320],[365,330],[420,315],[350,325],[390,335]];
  coins.forEach(([x,y], i) => {
    const r = 6 + Math.random() * 3;
    s += `<circle cx="${x}" cy="${y}" r="${r.toFixed(1)}" fill="#ffcc44" opacity="${0.5 + Math.random() * 0.3}" filter="url(#coinGlow)"/>`;
    s += `<circle cx="${x-1}" cy="${y-1}" r="${(r*0.4).toFixed(1)}" fill="#ffee88" opacity="0.3"/>`;
  });
  return s;
})()}
<path d="M350,300 Q340,280 360,260" stroke="#664422" stroke-width="3" fill="none" opacity="0.5"/>
${smallFish(150, 150, 8, '#77aacc')}
${smallFish(480, 180, 7, '#88bbdd', true)}
${seagrass(80, 345, 3, '#336633')}
${seagrass(530, 340, 2, '#2d6d2d')}
${bubbles(8, 100, 500, 80, 300)}
`));

// 32. treasure_minor2.svg
fs.writeFileSync(path.join(dir, 'treasure_minor2.svg'), svg(`
<defs>
  <linearGradient id="bg32" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#003355" stop-opacity="0.3"/>
    <stop offset="100%" stop-color="#001525" stop-opacity="0.8"/>
  </linearGradient>
  <linearGradient id="smallChest" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#7a5533"/>
    <stop offset="100%" stop-color="#4a2a11"/>
  </linearGradient>
  ${glowFilter('gemGlow', 3, '#ffcc44')}
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg32)"/>
${sandFloor(340)}
<g transform="translate(230,260)">
  <rect x="0" y="0" width="80" height="50" fill="url(#smallChest)" rx="3"/>
  <path d="M0,0 Q40,-15 80,0" fill="#8a6533" stroke="#5a3a1a" stroke-width="1"/>
  <rect x="0" y="22" width="80" height="3" fill="#5a3a1a" opacity="0.5"/>
  <circle cx="40" cy="30" r="4" fill="#ccaa44" opacity="0.7"/>
  <rect x="3" y="45" width="74" height="5" fill="#5a3a1a" rx="1"/>
</g>
${(() => {
  let s = '';
  const coins = [[320,300],[340,310],[350,295],[360,308],[335,320],[355,318]];
  coins.forEach(([x,y]) => {
    s += `<circle cx="${x}" cy="${y}" r="${5 + Math.random() * 2}" fill="#ffcc44" opacity="${0.4 + Math.random() * 0.3}" filter="url(#gemGlow)"/>`;
  });
  const gems = [[375,300,'#44ff88'],[385,310,'#ff4466'],[370,315,'#4488ff']];
  gems.forEach(([x,y,c]) => {
    s += `<polygon points="${x},${y-5} ${x+4},${y} ${x},${y+5} ${x-4},${y}" fill="${c}" opacity="0.6" filter="url(#gemGlow)"/>`;
  });
  return s;
})()}
${smallFish(120, 160, 8, '#77aacc')}
${smallFish(480, 140, 7, '#88bbdd', true)}
${seagrass(70, 345, 3, '#336633')}
${seagrass(540, 340, 2, '#2d6d2d')}
${bubbles(8, 100, 500, 80, 300)}
`));

// 33. treasure_major.svg
fs.writeFileSync(path.join(dir, 'treasure_major.svg'), svg(`
<defs>
  <linearGradient id="bg33" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#1a3355" stop-opacity="0.3"/>
    <stop offset="100%" stop-color="#0a1525" stop-opacity="0.8"/>
  </linearGradient>
  <linearGradient id="ornateChest" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#8a6533"/>
    <stop offset="100%" stop-color="#5a3511"/>
  </linearGradient>
  <radialGradient id="treasureGlow33" cx="50%" cy="30%" r="60%">
    <stop offset="0%" stop-color="#ffcc44" stop-opacity="0.3"/>
    <stop offset="100%" stop-color="#ffcc44" stop-opacity="0"/>
  </radialGradient>
  ${glowFilter('tGlow', 5, '#ffcc44')}
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg33)"/>
<rect x="100" y="100" width="400" height="250" fill="url(#treasureGlow33)"/>
${sandFloor(340)}
<g transform="translate(180,210)">
  <rect x="0" y="30" width="140" height="80" fill="url(#ornateChest)" rx="4"/>
  <path d="M0,30 Q70,-10 140,30" fill="#9a7543" stroke="#6a4522" stroke-width="1.5"/>
  <rect x="0" y="55" width="140" height="3" fill="#6a4522" opacity="0.5"/>
  <rect x="0" y="80" width="140" height="3" fill="#6a4522" opacity="0.5"/>
  <circle cx="70" cy="65" r="6" fill="#ccaa44" opacity="0.8"/>
  <rect x="10" y="105" width="120" height="5" fill="#6a4522" rx="1"/>
  <rect x="5" y="32" width="4" height="50" fill="#ccaa44" opacity="0.5" rx="1"/>
  <rect x="131" y="32" width="4" height="50" fill="#ccaa44" opacity="0.5" rx="1"/>
</g>
${(() => {
  let s = '';
  for (let i = 0; i < 15; i++) {
    const x = 190 + Math.random() * 160;
    const y = 200 + Math.random() * 30;
    const colors = ['#ff4466', '#44ff88', '#4488ff', '#ffcc44', '#ff88cc', '#88ffff'];
    const c = colors[Math.floor(Math.random() * colors.length)];
    if (Math.random() > 0.5) {
      s += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${3 + Math.random() * 3}" fill="#ffcc44" opacity="${0.5 + Math.random() * 0.3}" filter="url(#tGlow)"/>`;
    } else {
      s += `<polygon points="${x},${y-4} ${x+3},${y} ${x},${y+4} ${x-3},${y}" fill="${c}" opacity="0.6" filter="url(#tGlow)"/>`;
    }
  }
  return s;
})()}
<circle cx="300" cy="200" r="30" fill="#ffcc44" opacity="0.05" filter="url(#tGlow)"/>
${smallFish(100, 130, 9, '#ccaa44')}
${smallFish(500, 150, 8, '#bbaa55', true)}
${bubbles(8, 150, 450, 80, 250)}
`));

// 34. treasure_major2.svg
fs.writeFileSync(path.join(dir, 'treasure_major2.svg'), svg(`
<defs>
  <linearGradient id="bg34" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#1a2255" stop-opacity="0.3"/>
    <stop offset="100%" stop-color="#0a1030" stop-opacity="0.8"/>
  </linearGradient>
  ${glowFilter('goldG34', 4, '#ffcc44')}
  ${glowFilter('gemG34', 3, '#ff4466')}
  <linearGradient id="chaliceGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#ddbb55"/>
    <stop offset="100%" stop-color="#aa8833"/>
  </linearGradient>
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg34)"/>
${sandFloor(340)}
<g transform="translate(200,180)" filter="url(#goldG34)">
  <path d="M30,0 Q0,20 10,80 L15,130 L85,130 L90,80 Q100,20 70,0 Z" fill="url(#chaliceGrad)"/>
  <ellipse cx="50" cy="5" rx="25" ry="8" fill="#eedd77" opacity="0.6"/>
  <rect x="35" y="125" width="30" height="8" fill="#ccaa44" rx="2"/>
  <ellipse cx="50" cy="138" rx="25" ry="6" fill="#ccaa44" opacity="0.7"/>
  <circle cx="50" cy="60" r="8" fill="#ff4466" opacity="0.6" filter="url(#gemG34)"/>
</g>
<g transform="translate(350,220)">
  <path d="M0,20 Q30,0 80,5 Q110,15 120,30 Q115,45 80,50 Q30,55 0,40 Z" fill="#ccaa44" opacity="0.5" filter="url(#goldG34)"/>
  <circle cx="20" cy="25" r="5" fill="#ff4466" opacity="0.5"/>
  <circle cx="50" cy="20" r="4" fill="#44ff88" opacity="0.5"/>
  <circle cx="80" cy="28" r="5" fill="#4488ff" opacity="0.5"/>
  <circle cx="100" cy="22" r="3" fill="#ff88cc" opacity="0.5"/>
  <path d="M30,35 Q60,42 90,35" stroke="#bb8833" stroke-width="1" fill="none" opacity="0.5"/>
</g>
<circle cx="420" cy="300" r="6" fill="#ffcc44" opacity="0.4" filter="url(#goldG34)"/>
<circle cx="440" cy="310" r="5" fill="#ffcc44" opacity="0.35"/>
<polygon points="150,300 155,290 160,300 155,310" fill="#44ff88" opacity="0.4" filter="url(#gemG34)"/>
${smallFish(120, 130, 8, '#ccaa44')}
${smallFish(500, 150, 7, '#bbaa55', true)}
${seagrass(80, 345, 2, '#336633')}
${bubbles(8, 100, 500, 80, 280)}
`));

// 35. treasure_grand.svg
fs.writeFileSync(path.join(dir, 'treasure_grand.svg'), svg(`
<defs>
  <linearGradient id="bg35" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#1a2244" stop-opacity="0.2"/>
    <stop offset="100%" stop-color="#0a1030" stop-opacity="0.7"/>
  </linearGradient>
  <radialGradient id="grandGlow" cx="50%" cy="50%" r="40%">
    <stop offset="0%" stop-color="#ffcc44" stop-opacity="0.4"/>
    <stop offset="50%" stop-color="#ffaa22" stop-opacity="0.15"/>
    <stop offset="100%" stop-color="#ffaa22" stop-opacity="0"/>
  </radialGradient>
  ${glowFilter('crownGlow', 8, '#ffcc44')}
  ${glowFilter('megaGem', 6, '#ff2244')}
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg35)"/>
<rect x="0" y="0" width="600" height="400" fill="url(#grandGlow)"/>
${sandFloor(350)}
<g transform="translate(210,160)" filter="url(#crownGlow)">
  <path d="M0,100 L0,40 L30,70 L60,20 L90,70 L120,40 L150,70 L180,30 L180,100 Z" fill="#ddaa33" stroke="#bb8822" stroke-width="2"/>
  <rect x="0" y="95" width="180" height="12" fill="#ccaa33" rx="2"/>
  <circle cx="30" cy="75" r="5" fill="#ff2244" opacity="0.7"/>
  <circle cx="90" cy="55" r="8" fill="#ff2244" opacity="0.8" filter="url(#megaGem)"/>
  <circle cx="150" cy="75" r="5" fill="#4488ff" opacity="0.7"/>
  <circle cx="60" cy="85" r="4" fill="#44ff88" opacity="0.6"/>
  <circle cx="120" cy="85" r="4" fill="#ff88cc" opacity="0.6"/>
</g>
${(() => {
  let s = '';
  for (let i = 0; i < 8; i++) {
    const angle = -Math.PI / 2 + (i / 7) * Math.PI;
    const len = 60 + i * 10;
    const x1 = 300;
    const y1 = 210;
    const x2 = 300 + Math.cos(angle) * len;
    const y2 = 210 + Math.sin(angle) * len * 0.6;
    s += `<line x1="${x1}" y1="${y1}" x2="${x2.toFixed(0)}" y2="${y2.toFixed(0)}" stroke="#ffcc44" stroke-width="1" opacity="${0.05 + Math.random() * 0.08}"/>`;
  }
  return s;
})()}
<circle cx="300" cy="210" r="50" fill="#ffcc44" opacity="0.03"/>
${smallFish(80, 130, 8, '#ccaa44')}
${smallFish(520, 120, 7, '#bbaa55', true)}
${bubbles(8, 100, 500, 60, 250)}
`));

// 36. treasure_grand_alt.svg
fs.writeFileSync(path.join(dir, 'treasure_grand_alt.svg'), svg(`
<defs>
  <linearGradient id="bg36" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#112244" stop-opacity="0.3"/>
    <stop offset="100%" stop-color="#081122" stop-opacity="0.85"/>
  </linearGradient>
  <radialGradient id="altarGlow" cx="50%" cy="50%" r="40%">
    <stop offset="0%" stop-color="#8844ff" stop-opacity="0.3"/>
    <stop offset="100%" stop-color="#8844ff" stop-opacity="0"/>
  </radialGradient>
  ${glowFilter('tridentGlow', 5, '#ccaa44')}
  ${glowFilter('runeGlow', 4, '#8844ff')}
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg36)"/>
<rect x="100" y="50" width="400" height="300" fill="url(#altarGlow)"/>
${sandFloor(360, '#6a6a77', '#4a4a55')}
<g transform="translate(250,340)">
  <rect x="0" y="-20" width="100" height="20" fill="#667" rx="2"/>
  <rect x="-10" y="-30" width="120" height="12" fill="#778" rx="2"/>
  <rect x="-20" y="-38" width="140" height="10" fill="#889" rx="2"/>
</g>
<g transform="translate(300,100)" filter="url(#tridentGlow)">
  <rect x="-4" y="0" width="8" height="200" fill="#ccaa44" rx="2"/>
  <path d="M-4,0 L-30,-50 L-25,-45 L-4,-5 Z" fill="#ccaa44"/>
  <path d="M4,0 L30,-50 L25,-45 L4,-5 Z" fill="#ccaa44"/>
  <path d="M0,-5 L0,-55" stroke="#ccaa44" stroke-width="4" stroke-linecap="round"/>
  <circle cx="0" cy="70" r="12" fill="#8844ff" opacity="0.6" filter="url(#runeGlow)"/>
  <circle cx="0" cy="70" r="6" fill="#aa66ff" opacity="0.4"/>
</g>
${[0,1,2,3,4,5].map(i => {
  const angle = i * Math.PI / 3;
  const x = 300 + Math.cos(angle) * 120;
  const y = 250 + Math.sin(angle) * 80;
  return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="15" fill="none" stroke="#8844ff" stroke-width="1" opacity="0.3" filter="url(#runeGlow)"/>
  <circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="3" fill="#8844ff" opacity="0.2"/>`;
}).join('\n')}
${smallFish(100, 150, 7, '#8877cc')}
${bubbles(6, 200, 400, 80, 280)}
`));

// 37. shark_attack.svg
fs.writeFileSync(path.join(dir, 'shark_attack.svg'), svg(`
<defs>
  <linearGradient id="bg37" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#1a2233" stop-opacity="0.4"/>
    <stop offset="100%" stop-color="#0a1015" stop-opacity="0.9"/>
  </linearGradient>
  <linearGradient id="sharkBody37" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#445566"/>
    <stop offset="60%" stop-color="#667788"/>
    <stop offset="100%" stop-color="#99aabb"/>
  </linearGradient>
  ${glowFilter('dangerGlow', 4, '#ff3344')}
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg37)"/>
<g transform="translate(50,100)">
  <path d="M0,80 Q40,50 100,30 Q200,10 350,30 Q450,50 500,100 Q480,140 400,150 Q300,160 200,150 Q100,140 50,120 Q20,110 0,80 Z" fill="url(#sharkBody37)"/>
  <path d="M0,80 Q-20,70 -40,50 L-10,60 Q5,70 0,80 Z" fill="#556677"/>
  <path d="M220,10 L240,-30 L260,15" fill="#445566"/>
  <path d="M450,80 L500,55 L495,95 Z" fill="#445566" opacity="0.8"/>
  <path d="M450,110 L500,135 L495,100 Z" fill="#556677" opacity="0.7"/>
  <circle cx="60" cy="70" r="8" fill="#cc2233" opacity="0.7"/>
  <circle cx="62" cy="68" r="3" fill="#111"/>
  <path d="M-40,50 Q-20,55 0,70" fill="none" stroke="#667788" stroke-width="1" opacity="0.5"/>
  <g>
    <path d="M-35,65 L-28,55 L-21,65 L-14,55 L-7,65 L0,55 L7,65 L14,55 L21,65 L28,55 L35,65" fill="none" stroke="#ddd" stroke-width="1.5" opacity="0.8" transform="translate(-5,72) rotate(-5)"/>
    <path d="M-35,75 L-28,85 L-21,75 L-14,85 L-7,75 L0,85 L7,75 L14,85 L21,75 L28,85 L35,75" fill="none" stroke="#ddd" stroke-width="1.5" opacity="0.8" transform="translate(-5,80) rotate(-5)"/>
  </g>
</g>
<circle cx="100" cy="200" r="4" fill="#ff3344" opacity="0.15" filter="url(#dangerGlow)"/>
<circle cx="500" cy="150" r="3" fill="#ff3344" opacity="0.1"/>
${bubbles(6, 50, 550, 50, 300)}
`));

// 38. shark_circling.svg
fs.writeFileSync(path.join(dir, 'shark_circling.svg'), svg(`
<defs>
  <linearGradient id="bg38" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#112233" stop-opacity="0.4"/>
    <stop offset="100%" stop-color="#081018" stop-opacity="0.85"/>
  </linearGradient>
  <linearGradient id="shark38" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#445566"/>
    <stop offset="100%" stop-color="#778899"/>
  </linearGradient>
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg38)"/>
${lightRays(300, 0)}
<g transform="translate(300,200)">
  <circle cx="0" cy="0" r="100" fill="none" stroke="#445566" stroke-width="0.5" opacity="0.1" stroke-dasharray="5,5"/>
</g>
<g transform="translate(180,120) rotate(-20)">
  <path d="M0,10 Q10,4 30,0 Q50,-3 70,2 Q78,5 70,8 Q50,14 30,14 Q10,12 0,10 Z" fill="url(#shark38)"/>
  <path d="M40,-3 L45,-15 L50,-1" fill="#445566"/>
  <path d="M70,5 L82,2 L80,10 Z" fill="#445566" opacity="0.7"/>
  <circle cx="12" cy="7" r="2" fill="#223"/>
</g>
<g transform="translate(350,280) rotate(160)">
  <path d="M0,10 Q10,4 30,0 Q50,-3 70,2 Q78,5 70,8 Q50,14 30,14 Q10,12 0,10 Z" fill="url(#shark38)" opacity="0.9"/>
  <path d="M40,-3 L45,-15 L50,-1" fill="#445566"/>
  <path d="M70,5 L82,2 L80,10 Z" fill="#445566" opacity="0.7"/>
  <circle cx="12" cy="7" r="2" fill="#223"/>
</g>
<g transform="translate(380,150) rotate(80)">
  <path d="M0,8 Q8,3 24,0 Q40,-2 56,2 Q62,4 56,7 Q40,11 24,11 Q8,10 0,8 Z" fill="url(#shark38)" opacity="0.7"/>
  <path d="M32,-2 L36,-12 L40,-1" fill="#445566" opacity="0.7"/>
  <path d="M56,4 L65,2 L64,8 Z" fill="#445566" opacity="0.6"/>
  <circle cx="10" cy="6" r="1.5" fill="#223"/>
</g>
${bubbles(8, 100, 500, 80, 320)}
`));

// 39. jellyfish_swarm.svg
fs.writeFileSync(path.join(dir, 'jellyfish_swarm.svg'), svg(`
<defs>
  <linearGradient id="bg39" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#220a0a" stop-opacity="0.5"/>
    <stop offset="100%" stop-color="#110505" stop-opacity="0.9"/>
  </linearGradient>
  ${glowFilter('swarmGlow', 4, '#ff4444')}
  <radialGradient id="jellyRed" cx="50%" cy="30%" r="60%">
    <stop offset="0%" stop-color="#ff6644" stop-opacity="0.6"/>
    <stop offset="100%" stop-color="#cc3322" stop-opacity="0.3"/>
  </radialGradient>
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg39)"/>
${(() => {
  let s = '';
  const positions = [[80,60,20],[180,100,15],[300,50,22],[420,80,18],[530,110,16],[140,180,14],[260,160,20],[380,170,17],[500,200,13],[60,260,15],[200,280,12],[340,250,18],[460,270,14],[560,300,11],[130,340,13],[300,330,16],[440,340,12]];
  positions.forEach(([x,y,r]) => {
    s += `<g filter="url(#swarmGlow)">
    <ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r*0.6}" fill="url(#jellyRed)"/>
    <path d="M${x-r*0.7},${y+r*0.5} Q${x-r*0.5},${y+r*2} ${x-r*0.8},${y+r*3}" stroke="#ff4422" stroke-width="1" fill="none" opacity="0.4"/>
    <path d="M${x},${y+r*0.5} Q${x+2},${y+r*2.5} ${x-2},${y+r*3.5}" stroke="#ff5533" stroke-width="1" fill="none" opacity="0.35"/>
    <path d="M${x+r*0.7},${y+r*0.5} Q${x+r*0.5},${y+r*2} ${x+r*0.8},${y+r*3}" stroke="#ff4422" stroke-width="1" fill="none" opacity="0.4"/>
  </g>`;
  });
  return s;
})()}
<line x1="200" y1="150" x2="220" y2="165" stroke="#ffff44" stroke-width="1" opacity="0.3"/>
<line x1="400" y1="200" x2="385" y2="215" stroke="#ffff44" stroke-width="1" opacity="0.25"/>
`));

// 40. jellyfish_giant.svg
fs.writeFileSync(path.join(dir, 'jellyfish_giant.svg'), svg(`
<defs>
  <linearGradient id="bg40" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#0a1a33" stop-opacity="0.4"/>
    <stop offset="100%" stop-color="#050a15" stop-opacity="0.9"/>
  </linearGradient>
  <radialGradient id="giantJelly" cx="50%" cy="30%" r="55%">
    <stop offset="0%" stop-color="#ff88aa" stop-opacity="0.6"/>
    <stop offset="50%" stop-color="#cc4477" stop-opacity="0.4"/>
    <stop offset="100%" stop-color="#882244" stop-opacity="0.2"/>
  </radialGradient>
  ${glowFilter('giantGlow', 8, '#ff88aa')}
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg40)"/>
<g filter="url(#giantGlow)">
  <ellipse cx="300" cy="100" rx="140" ry="70" fill="url(#giantJelly)"/>
  <ellipse cx="300" cy="90" rx="100" ry="40" fill="#ff99bb" opacity="0.15"/>
  <path d="M170,120 Q160,130 165,140 Q170,150 175,140 Q180,130 170,120 Z" fill="#cc4477" opacity="0.3"/>
  <path d="M430,120 Q440,130 435,140 Q430,150 425,140 Q420,130 430,120 Z" fill="#cc4477" opacity="0.3"/>
</g>
${(() => {
  let s = '';
  for (let i = 0; i < 12; i++) {
    const x = 200 + i * 18;
    const sway1 = (Math.random() - 0.5) * 30;
    const sway2 = (Math.random() - 0.5) * 40;
    const sway3 = (Math.random() - 0.5) * 50;
    const len = 150 + Math.random() * 150;
    s += `<path d="M${x},140 Q${x + sway1},${140 + len/3} ${x + sway2},${140 + len*2/3} Q${x + sway3},${140 + len*0.9} ${x + sway2},${140 + len}" stroke="#cc5577" stroke-width="${1 + Math.random()}" fill="none" opacity="${0.2 + Math.random() * 0.3}"/>`;
  }
  return s;
})()}
${(() => {
  let s = '';
  for (let i = 0; i < 6; i++) {
    const x = 220 + i * 30;
    const sway = (Math.random() - 0.5) * 60;
    s += `<path d="M${x},150 Q${x + sway},250 ${x - sway},400" stroke="#ff88aa" stroke-width="2" fill="none" opacity="0.15"/>`;
  }
  return s;
})()}
${smallFish(80, 300, 7, '#446688')}
${smallFish(520, 280, 6, '#557799', true)}
${bubbles(6, 200, 400, 50, 150)}
`));

// 41. sea_serpent.svg
fs.writeFileSync(path.join(dir, 'sea_serpent.svg'), svg(`
<defs>
  <linearGradient id="bg41" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#0a1a2a" stop-opacity="0.4"/>
    <stop offset="100%" stop-color="#050a12" stop-opacity="0.9"/>
  </linearGradient>
  <linearGradient id="serpentGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#226644"/>
    <stop offset="100%" stop-color="#114422"/>
  </linearGradient>
  ${glowFilter('eyeGlow', 5, '#ffcc00')}
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg41)"/>
<path d="M50,200 Q100,100 180,150 Q260,200 300,120 Q340,40 400,100 Q460,160 520,80 Q560,30 580,60" stroke="url(#serpentGrad)" stroke-width="25" fill="none" stroke-linecap="round" opacity="0.8"/>
<path d="M50,200 Q100,100 180,150 Q260,200 300,120 Q340,40 400,100 Q460,160 520,80 Q560,30 580,60" stroke="#338855" stroke-width="18" fill="none" stroke-linecap="round" opacity="0.4"/>
<g transform="translate(50,200)">
  <ellipse cx="-15" cy="0" rx="20" ry="14" fill="#226644"/>
  <circle cx="-22" cy="-5" r="5" fill="#ffcc00" opacity="0.8" filter="url(#eyeGlow)"/>
  <circle cx="-22" cy="-5" r="2.5" fill="#111"/>
  <circle cx="-22" cy="5" r="5" fill="#ffcc00" opacity="0.8" filter="url(#eyeGlow)"/>
  <circle cx="-22" cy="5" r="2.5" fill="#111"/>
  <path d="M-35,0 L-45,-5 L-45,5 Z" fill="#226644" opacity="0.7"/>
</g>
${(() => {
  let s = '';
  const finPositions = [[180,150],[300,120],[400,100],[520,80]];
  finPositions.forEach(([x,y]) => {
    s += `<path d="M${x},${y-10} L${x+10},${y-30} L${x+15},${y-8}" fill="#338855" opacity="0.5"/>`;
  });
  return s;
})()}
${smallFish(200, 300, 7, '#557799')}
${smallFish(400, 280, 6, '#668888', true)}
${bubbles(8, 50, 550, 50, 350)}
`));

// 42. sea_serpent_coil.svg
fs.writeFileSync(path.join(dir, 'sea_serpent_coil.svg'), svg(`
<defs>
  <linearGradient id="bg42" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#0a1a2a" stop-opacity="0.4"/>
    <stop offset="100%" stop-color="#050a12" stop-opacity="0.9"/>
  </linearGradient>
  ${glowFilter('coilEye', 4, '#ffcc00')}
  <linearGradient id="colGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#778888"/>
    <stop offset="100%" stop-color="#556666"/>
  </linearGradient>
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg42)"/>
${sandFloor(370, '#5a6a66', '#3a4a44')}
<rect x="250" y="120" width="30" height="250" fill="url(#colGrad)" rx="3"/>
<rect x="320" y="140" width="30" height="230" fill="url(#colGrad)" rx="3" opacity="0.8"/>
<path d="M200,320 Q230,280 265,300 Q300,320 280,260 Q260,200 265,180 Q270,160 280,180 Q310,260 350,220 Q380,180 350,150 Q320,130 310,160 Q300,200 330,240 Q360,280 400,260 Q440,240 420,200" stroke="#226644" stroke-width="22" fill="none" stroke-linecap="round" opacity="0.8"/>
<path d="M200,320 Q230,280 265,300 Q300,320 280,260 Q260,200 265,180 Q270,160 280,180 Q310,260 350,220 Q380,180 350,150 Q320,130 310,160 Q300,200 330,240 Q360,280 400,260 Q440,240 420,200" stroke="#338855" stroke-width="15" fill="none" stroke-linecap="round" opacity="0.3"/>
<g transform="translate(200,320)">
  <ellipse cx="-12" cy="0" rx="16" ry="12" fill="#226644"/>
  <circle cx="-18" cy="-4" r="4" fill="#ffcc00" opacity="0.8" filter="url(#coilEye)"/>
  <circle cx="-18" cy="-4" r="2" fill="#111"/>
</g>
<path d="M420,200 L435,195 Q445,198 440,205 L425,202" fill="#226644" opacity="0.6"/>
${bubbles(8, 150, 450, 80, 300)}
`));

// 43. whirlpool.svg
fs.writeFileSync(path.join(dir, 'whirlpool.svg'), svg(`
<defs>
  <linearGradient id="bg43" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#1a3355" stop-opacity="0.3"/>
    <stop offset="100%" stop-color="#0a1525" stop-opacity="0.8"/>
  </linearGradient>
  <radialGradient id="whirlGrad" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="#001133" stop-opacity="0.8"/>
    <stop offset="50%" stop-color="#003366" stop-opacity="0.4"/>
    <stop offset="100%" stop-color="#005599" stop-opacity="0.1"/>
  </radialGradient>
  ${glowFilter('whirlGlow', 3, '#4488cc')}
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg43)"/>
<circle cx="300" cy="200" r="180" fill="url(#whirlGrad)"/>
${(() => {
  let s = '';
  for (let i = 0; i < 5; i++) {
    const r = 30 + i * 35;
    s += `<circle cx="300" cy="200" r="${r}" fill="none" stroke="#4488cc" stroke-width="${2 - i * 0.3}" opacity="${0.4 - i * 0.06}" stroke-dasharray="${5 + i * 3},${3 + i * 2}"/>`;
  }
  return s;
})()}
<path d="M300,200 ${(() => {
  let p = '';
  for (let a = 0; a < 720; a += 10) {
    const r = a / 720 * 150;
    const rad = a * Math.PI / 180;
    const x = 300 + Math.cos(rad) * r;
    const y = 200 + Math.sin(rad) * r * 0.7;
    p += (a === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1) + ' ';
  }
  return p;
})()} " fill="none" stroke="#3377bb" stroke-width="1.5" opacity="0.3"/>
<circle cx="120" cy="120" r="5" fill="#8a6a44" opacity="0.4"/>
<circle cx="450" cy="100" r="4" fill="#666" opacity="0.35"/>
<rect x="160" y="300" width="12" height="8" fill="#6a5a3a" opacity="0.3" transform="rotate(15,166,304)"/>
<circle cx="400" cy="280" r="3" fill="#555" opacity="0.3"/>
${smallFish(150, 150, 7, '#77aacc')}
${bubbles(6, 100, 500, 50, 350)}
`));

// 44. whirlpool_glow.svg
fs.writeFileSync(path.join(dir, 'whirlpool_glow.svg'), svg(`
<defs>
  <linearGradient id="bg44" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#0a1525" stop-opacity="0.5"/>
    <stop offset="100%" stop-color="#050a10" stop-opacity="0.95"/>
  </linearGradient>
  <radialGradient id="whirlGlow44" cx="50%" cy="50%" r="40%">
    <stop offset="0%" stop-color="#33ff88" stop-opacity="0.3"/>
    <stop offset="30%" stop-color="#8844ff" stop-opacity="0.2"/>
    <stop offset="100%" stop-color="#8844ff" stop-opacity="0"/>
  </radialGradient>
  ${glowFilter('mysticGlow', 6, '#33ff88')}
  ${glowFilter('purpleGlow', 5, '#8844ff')}
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg44)"/>
<rect x="0" y="0" width="600" height="400" fill="url(#whirlGlow44)"/>
<path d="M300,200 ${(() => {
  let p = '';
  for (let a = 0; a < 1080; a += 8) {
    const r = a / 1080 * 170;
    const rad = a * Math.PI / 180;
    const x = 300 + Math.cos(rad) * r;
    const y = 200 + Math.sin(rad) * r * 0.65;
    p += (a === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1) + ' ';
  }
  return p;
})()} " fill="none" stroke="#8844ff" stroke-width="1.5" opacity="0.25" filter="url(#purpleGlow)"/>
<circle cx="300" cy="200" r="15" fill="#33ff88" opacity="0.2" filter="url(#mysticGlow)"/>
<circle cx="300" cy="200" r="6" fill="#33ff88" opacity="0.3"/>
${[0,1,2,3,4,5].map(i => {
  const angle = i * Math.PI / 3;
  const r = 50 + i * 15;
  const x = 300 + Math.cos(angle) * r;
  const y = 200 + Math.sin(angle) * r * 0.65;
  return `<text x="${x.toFixed(0)}" y="${y.toFixed(0)}" text-anchor="middle" fill="#8844ff" font-size="10" opacity="0.3" filter="url(#purpleGlow)">&#x2B24;</text>`;
}).join('\n')}
${bubbles(6, 150, 450, 80, 320)}
`));

// 45. shield_pickup.svg
fs.writeFileSync(path.join(dir, 'shield_pickup.svg'), svg(`
<defs>
  <linearGradient id="bg45" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#003355" stop-opacity="0.3"/>
    <stop offset="100%" stop-color="#001525" stop-opacity="0.8"/>
  </linearGradient>
  <radialGradient id="shieldGlow45" cx="50%" cy="40%" r="50%">
    <stop offset="0%" stop-color="#44aaff" stop-opacity="0.4"/>
    <stop offset="100%" stop-color="#44aaff" stop-opacity="0"/>
  </radialGradient>
  ${glowFilter('sGlow', 6, '#44aaff')}
  <linearGradient id="shieldGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#4488cc"/>
    <stop offset="100%" stop-color="#2255aa"/>
  </linearGradient>
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg45)"/>
${sandFloor(360)}
<g transform="translate(300,180)" filter="url(#sGlow)">
  <path d="M0,-70 Q-50,-60 -60,-20 Q-65,30 -40,60 Q-20,85 0,95 Q20,85 40,60 Q65,30 60,-20 Q50,-60 0,-70 Z" fill="url(#shieldGrad)" opacity="0.8" stroke="#66bbff" stroke-width="2"/>
  <path d="M0,-50 Q-30,-42 -38,-12 Q-42,20 -25,42 Q-12,58 0,65 Q12,58 25,42 Q42,20 38,-12 Q30,-42 0,-50 Z" fill="none" stroke="#88ccff" stroke-width="1.5" opacity="0.5"/>
  <line x1="0" y1="-50" x2="0" y2="65" stroke="#88ccff" stroke-width="1" opacity="0.3"/>
  <line x1="-38" y1="-12" x2="38" y2="-12" stroke="#88ccff" stroke-width="1" opacity="0.3"/>
</g>
<circle cx="300" cy="180" r="60" fill="url(#shieldGlow45)" opacity="0.5"/>
${(() => {
  let s = '';
  for (let i = 0; i < 8; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 70 + Math.random() * 30;
    const x = 300 + Math.cos(angle) * dist;
    const y = 180 + Math.sin(angle) * dist;
    s += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${1 + Math.random() * 2}" fill="#88ccff" opacity="${0.3 + Math.random() * 0.4}" filter="url(#sGlow)"/>`;
  }
  return s;
})()}
<rect x="100" y="300" width="40" height="60" fill="#667" rx="2" opacity="0.4"/>
<rect x="460" y="310" width="35" height="50" fill="#667" rx="2" opacity="0.35"/>
${bubbles(6, 100, 500, 80, 300)}
`));

// 46. shield_active.svg
fs.writeFileSync(path.join(dir, 'shield_active.svg'), svg(`
<defs>
  <linearGradient id="bg46" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#0a2244" stop-opacity="0.4"/>
    <stop offset="100%" stop-color="#051122" stop-opacity="0.85"/>
  </linearGradient>
  <radialGradient id="bubbleShield" cx="50%" cy="50%" r="50%">
    <stop offset="85%" stop-color="#44aaff" stop-opacity="0"/>
    <stop offset="90%" stop-color="#44aaff" stop-opacity="0.2"/>
    <stop offset="95%" stop-color="#88ccff" stop-opacity="0.3"/>
    <stop offset="100%" stop-color="#44aaff" stop-opacity="0.1"/>
  </radialGradient>
  ${glowFilter('shieldBubble', 4, '#44aaff')}
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg46)"/>
<circle cx="300" cy="200" r="80" fill="url(#bubbleShield)" filter="url(#shieldBubble)"/>
<circle cx="300" cy="200" r="80" fill="none" stroke="#44aaff" stroke-width="2" opacity="0.5"/>
<g transform="translate(300,200)">
  <ellipse cx="0" cy="5" rx="10" ry="18" fill="#224466"/>
  <circle cx="0" cy="-15" r="8" fill="#335577"/>
  <line x1="-12" y1="-5" x2="-20" y2="5" stroke="#224466" stroke-width="3" stroke-linecap="round"/>
  <line x1="12" y1="-5" x2="20" y2="5" stroke="#224466" stroke-width="3" stroke-linecap="round"/>
  <line x1="-4" y1="22" x2="-8" y2="35" stroke="#224466" stroke-width="3" stroke-linecap="round"/>
  <line x1="4" y1="22" x2="8" y2="35" stroke="#224466" stroke-width="3" stroke-linecap="round"/>
  <circle cx="0" cy="-13" r="4" fill="#88ccff" opacity="0.5"/>
</g>
<g transform="translate(420,160) rotate(30)" opacity="0.6">
  <path d="M0,8 Q8,3 24,0 Q40,-2 56,2 Q62,4 56,7 Q40,11 24,11 Q8,10 0,8 Z" fill="#556"/>
  <path d="M0,5 L-10,2 L-10,12 Z" fill="#556"/>
</g>
<line x1="378" y1="170" x2="370" y2="165" stroke="#44aaff" stroke-width="2" opacity="0.4"/>
<circle cx="375" cy="168" r="4" fill="#44aaff" opacity="0.2"/>
${bubbles(8, 100, 500, 80, 320)}
`));

// 47. sonar_pickup.svg
fs.writeFileSync(path.join(dir, 'sonar_pickup.svg'), svg(`
<defs>
  <linearGradient id="bg47" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#003355" stop-opacity="0.3"/>
    <stop offset="100%" stop-color="#001525" stop-opacity="0.8"/>
  </linearGradient>
  ${glowFilter('sonarGlow', 4, '#44ffaa')}
  <linearGradient id="deviceGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#557766"/>
    <stop offset="100%" stop-color="#334444"/>
  </linearGradient>
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg47)"/>
${sandFloor(340)}
<ellipse cx="300" cy="330" rx="50" ry="20" fill="#5a6a5a" opacity="0.5"/>
<g transform="translate(260,240)" filter="url(#sonarGlow)">
  <rect x="0" y="0" width="80" height="60" fill="url(#deviceGrad)" rx="5" stroke="#66aa88" stroke-width="1"/>
  <rect x="10" y="8" width="60" height="35" fill="#112" rx="3"/>
  <circle cx="40" cy="25" r="12" fill="none" stroke="#44ffaa" stroke-width="1" opacity="0.6"/>
  <circle cx="40" cy="25" r="6" fill="none" stroke="#44ffaa" stroke-width="0.5" opacity="0.4"/>
  <circle cx="40" cy="25" r="2" fill="#44ffaa" opacity="0.5"/>
  <line x1="40" y1="25" x2="50" y2="18" stroke="#44ffaa" stroke-width="1" opacity="0.5"/>
  <circle cx="20" cy="50" r="3" fill="#44ffaa" opacity="0.3"/>
  <circle cx="40" cy="52" r="2" fill="#ff4444" opacity="0.3"/>
  <circle cx="60" cy="50" r="3" fill="#44ffaa" opacity="0.3"/>
  <rect x="35" y="-8" width="10" height="10" fill="#446655" rx="1"/>
  <line x1="40" y1="-8" x2="40" y2="-18" stroke="#446655" stroke-width="2"/>
</g>
${smallFish(120, 160, 8, '#77aacc')}
${smallFish(480, 140, 7, '#88bbdd', true)}
${seagrass(80, 345, 3, '#336633')}
${seagrass(500, 340, 2, '#2d6d2d')}
${bubbles(8, 100, 500, 80, 300)}
`));

// 48. sonar_active.svg
fs.writeFileSync(path.join(dir, 'sonar_active.svg'), svg(`
<defs>
  <linearGradient id="bg48" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#003344" stop-opacity="0.3"/>
    <stop offset="100%" stop-color="#001520" stop-opacity="0.85"/>
  </linearGradient>
  ${glowFilter('sonarActive', 4, '#44ffaa')}
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg48)"/>
<circle cx="300" cy="200" r="50" fill="none" stroke="#44ffaa" stroke-width="2" opacity="0.5" filter="url(#sonarActive)"/>
<circle cx="300" cy="200" r="100" fill="none" stroke="#44ffaa" stroke-width="1.5" opacity="0.35" filter="url(#sonarActive)"/>
<circle cx="300" cy="200" r="150" fill="none" stroke="#44ffaa" stroke-width="1" opacity="0.2" filter="url(#sonarActive)"/>
<circle cx="300" cy="200" r="200" fill="none" stroke="#44ffaa" stroke-width="0.8" opacity="0.1"/>
<circle cx="300" cy="200" r="5" fill="#44ffaa" opacity="0.6" filter="url(#sonarActive)"/>
<g opacity="0.5">
  <path d="M150,280 Q160,270 175,275 Q180,280 170,285 Q155,285 150,280 Z" fill="#44ffaa" opacity="0.4" filter="url(#sonarActive)"/>
  <path d="M420,150 Q435,140 450,148 L445,155 Q430,150 420,155 Z" fill="#44ffaa" opacity="0.35" filter="url(#sonarActive)"/>
  <rect x="180" y="130" width="25" height="18" fill="#44ffaa" opacity="0.25" rx="2" filter="url(#sonarActive)"/>
  <circle cx="440" cy="280" r="12" fill="#44ffaa" opacity="0.2" filter="url(#sonarActive)"/>
</g>
<circle cx="300" cy="200" r="4" fill="#fff" opacity="0.3"/>
${bubbles(6, 100, 500, 80, 320)}
`));

// 49. diving_bell.svg
fs.writeFileSync(path.join(dir, 'diving_bell.svg'), svg(`
<defs>
  <linearGradient id="bg49" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#1a3355" stop-opacity="0.2"/>
    <stop offset="100%" stop-color="#0a1525" stop-opacity="0.7"/>
  </linearGradient>
  <radialGradient id="bellGlow" cx="50%" cy="60%" r="40%">
    <stop offset="0%" stop-color="#ffcc44" stop-opacity="0.3"/>
    <stop offset="100%" stop-color="#ffcc44" stop-opacity="0"/>
  </radialGradient>
  ${glowFilter('warmGlow', 5, '#ffcc44')}
  <linearGradient id="bellGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#aa8844"/>
    <stop offset="100%" stop-color="#775522"/>
  </linearGradient>
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg49)"/>
<rect x="100" y="50" width="400" height="300" fill="url(#bellGlow)"/>
${lightRays(300, 0)}
<g transform="translate(220,80)">
  <path d="M80,0 Q120,0 140,20 Q160,50 160,100 Q160,160 160,200 L0,200 Q0,160 0,100 Q0,50 20,20 Q40,0 80,0 Z" fill="url(#bellGrad)" filter="url(#warmGlow)" opacity="0.8"/>
  <path d="M80,0 Q100,0 115,10 Q130,25 135,50 Q138,80 138,100" stroke="#ccaa55" stroke-width="1.5" fill="none" opacity="0.3"/>
  <rect x="0" y="195" width="160" height="8" fill="#996633" rx="2"/>
  <circle cx="80" cy="20" r="6" fill="#ccaa55" opacity="0.5"/>
  <line x1="80" y1="14" x2="80" y2="-10" stroke="#aa8844" stroke-width="3"/>
  <ellipse cx="80" cy="-12" rx="5" ry="3" fill="#aa8844"/>
  <line x1="80" y1="-15" x2="80" y2="-40" stroke="#887755" stroke-width="2" stroke-dasharray="6,4"/>
  <rect x="20" y="100" width="30" height="25" fill="#ffcc44" opacity="0.1" rx="2"/>
  <rect x="65" y="100" width="30" height="25" fill="#ffcc44" opacity="0.08" rx="2"/>
  <rect x="110" y="100" width="30" height="25" fill="#ffcc44" opacity="0.1" rx="2"/>
</g>
${bubbles(12, 250, 380, 280, 390)}
${smallFish(100, 250, 8, '#77aacc')}
${smallFish(500, 200, 7, '#88bbdd', true)}
`));

// 50. diver_descend.svg
fs.writeFileSync(path.join(dir, 'diver_descend.svg'), svg(`
<defs>
  <linearGradient id="bg50" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#2277aa" stop-opacity="0.15"/>
    <stop offset="50%" stop-color="#0a4466" stop-opacity="0.5"/>
    <stop offset="100%" stop-color="#051a2a" stop-opacity="0.8"/>
  </linearGradient>
  ${glowFilter('diverLight', 3, '#ffffcc')}
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg50)"/>
${lightRays(300, 0)}
<g transform="translate(280,160)">
  <ellipse cx="0" cy="5" rx="10" ry="20" fill="#224466"/>
  <circle cx="0" cy="-18" r="10" fill="#335577"/>
  <circle cx="0" cy="-16" r="5" fill="#88ccff" opacity="0.4"/>
  <line x1="-12" y1="-2" x2="-22" y2="12" stroke="#224466" stroke-width="4" stroke-linecap="round"/>
  <line x1="12" y1="-2" x2="22" y2="12" stroke="#224466" stroke-width="4" stroke-linecap="round"/>
  <line x1="-4" y1="24" x2="-10" y2="40" stroke="#224466" stroke-width="4" stroke-linecap="round"/>
  <line x1="4" y1="24" x2="10" y2="40" stroke="#224466" stroke-width="4" stroke-linecap="round"/>
  <ellipse cx="-12" cy="42" rx="5" ry="2" fill="#113355"/>
  <ellipse cx="12" cy="42" rx="5" ry="2" fill="#113355"/>
  <rect x="5" y="-5" width="12" height="20" fill="#445566" rx="2" opacity="0.6"/>
</g>
${bubbles(15, 260, 310, 50, 170)}
<polygon points="300,0 270,140 330,140" fill="#ffffcc" opacity="0.06"/>
<polygon points="250,0 225,100 275,100" fill="#ffffcc" opacity="0.04"/>
<polygon points="350,0 330,120 370,120" fill="#ffffcc" opacity="0.05"/>
`));

// 51. diver_swim.svg
fs.writeFileSync(path.join(dir, 'diver_swim.svg'), svg(`
<defs>
  <linearGradient id="bg51" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#0a4466" stop-opacity="0.3"/>
    <stop offset="100%" stop-color="#051a2a" stop-opacity="0.8"/>
  </linearGradient>
  ${glowFilter('flashlight', 5, '#ffffcc')}
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg51)"/>
<g transform="translate(200,200)">
  <ellipse cx="0" cy="0" rx="20" ry="10" fill="#224466"/>
  <circle cx="-20" cy="-5" r="10" fill="#335577"/>
  <circle cx="-18" cy="-6" r="5" fill="#88ccff" opacity="0.4"/>
  <line x1="15" y1="-8" x2="30" y2="-18" stroke="#224466" stroke-width="3.5" stroke-linecap="round"/>
  <line x1="15" y1="8" x2="30" y2="18" stroke="#224466" stroke-width="3.5" stroke-linecap="round"/>
  <line x1="-10" y1="8" x2="-15" y2="18" stroke="#224466" stroke-width="3.5" stroke-linecap="round"/>
  <line x1="-15" y1="18" x2="-25" y2="18" stroke="#113355" stroke-width="3" stroke-linecap="round"/>
  <line x1="10" y1="8" x2="15" y2="18" stroke="#224466" stroke-width="3.5" stroke-linecap="round"/>
  <line x1="15" y1="18" x2="25" y2="18" stroke="#113355" stroke-width="3" stroke-linecap="round"/>
</g>
<polygon points="180,195 50,150 50,240" fill="#ffffcc" opacity="0.06" filter="url(#flashlight)"/>
<polygon points="180,195 60,160 60,230" fill="#ffffcc" opacity="0.04"/>
${smallFish(100, 180, 9, '#77aacc')}
${smallFish(120, 200, 7, '#88bbdd', true)}
${smallFish(90, 210, 8, '#66aacc')}
${bubbles(8, 220, 350, 160, 220)}
`));

// 52. diver_victory.svg
fs.writeFileSync(path.join(dir, 'diver_victory.svg'), svg(`
<defs>
  <linearGradient id="bg52" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#1a5588" stop-opacity="0.2"/>
    <stop offset="100%" stop-color="#0a2a44" stop-opacity="0.6"/>
  </linearGradient>
  <radialGradient id="victoryGlow" cx="50%" cy="40%" r="40%">
    <stop offset="0%" stop-color="#ffcc44" stop-opacity="0.3"/>
    <stop offset="100%" stop-color="#ffcc44" stop-opacity="0"/>
  </radialGradient>
  ${glowFilter('sparkleV', 3, '#ffcc44')}
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg52)"/>
<rect x="0" y="0" width="600" height="400" fill="url(#victoryGlow)"/>
${lightRays(300, 0)}
<g transform="translate(280,180)">
  <ellipse cx="0" cy="20" rx="12" ry="22" fill="#224466"/>
  <circle cx="0" cy="-5" r="11" fill="#335577"/>
  <circle cx="0" cy="-3" r="5.5" fill="#88ccff" opacity="0.4"/>
  <line x1="-14" y1="10" x2="-28" y2="-15" stroke="#224466" stroke-width="4" stroke-linecap="round"/>
  <line x1="14" y1="10" x2="28" y2="-15" stroke="#224466" stroke-width="4" stroke-linecap="round"/>
  <line x1="-5" y1="40" x2="-12" y2="58" stroke="#224466" stroke-width="4" stroke-linecap="round"/>
  <line x1="5" y1="40" x2="12" y2="58" stroke="#224466" stroke-width="4" stroke-linecap="round"/>
  <rect x="-12" y="-35" width="24" height="18" fill="#8a6533" rx="2"/>
  <rect x="-14" y="-38" width="28" height="5" fill="#9a7543" rx="1"/>
  <circle cx="-5" cy="-28" r="2" fill="#ffcc44" opacity="0.6"/>
  <circle cx="5" cy="-26" r="2" fill="#ff4466" opacity="0.5"/>
</g>
${(() => {
  let s = '';
  for (let i = 0; i < 12; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 40 + Math.random() * 80;
    const x = 280 + Math.cos(angle) * dist;
    const y = 170 + Math.sin(angle) * dist;
    s += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${1 + Math.random() * 2}" fill="#ffcc44" opacity="${0.3 + Math.random() * 0.4}" filter="url(#sparkleV)"/>`;
  }
  return s;
})()}
${smallFish(100, 200, 9, '#77aacc')}
${smallFish(130, 220, 7, '#88bbdd', true)}
${smallFish(450, 180, 8, '#66aacc')}
${smallFish(470, 200, 6, '#77bbdd', true)}
${bubbles(8, 200, 380, 100, 250)}
`));

// 53. game_start.svg
fs.writeFileSync(path.join(dir, 'game_start.svg'), svg(`
<defs>
  <linearGradient id="sky53" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#ffaa44" stop-opacity="0.3"/>
    <stop offset="40%" stop-color="#ff8844" stop-opacity="0.2"/>
    <stop offset="60%" stop-color="#2288aa" stop-opacity="0.3"/>
    <stop offset="100%" stop-color="#003355" stop-opacity="0.8"/>
  </linearGradient>
  <radialGradient id="sun53" cx="70%" cy="15%" r="20%">
    <stop offset="0%" stop-color="#ffee88" stop-opacity="0.5"/>
    <stop offset="100%" stop-color="#ffee88" stop-opacity="0"/>
  </radialGradient>
  ${glowFilter('sunGlow', 8, '#ffee88')}
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#sky53)"/>
<rect x="0" y="0" width="600" height="200" fill="url(#sun53)"/>
<circle cx="480" cy="50" r="25" fill="#ffee88" opacity="0.4" filter="url(#sunGlow)"/>
<circle cx="480" cy="50" r="12" fill="#ffee88" opacity="0.3"/>
${(() => {
  let s = '';
  for (let i = 0; i < 6; i++) {
    const angle = i * Math.PI / 3;
    s += `<line x1="${480 + Math.cos(angle) * 30}" y1="${50 + Math.sin(angle) * 30}" x2="${480 + Math.cos(angle) * 55}" y2="${50 + Math.sin(angle) * 55}" stroke="#ffee88" stroke-width="1.5" opacity="0.15"/>`;
  }
  return s;
})()}
<path d="M0,160 Q150,155 300,158 Q450,155 600,160 L600,165 Q450,162 300,165 Q150,162 0,165 Z" fill="#4499bb" opacity="0.4"/>
<g transform="translate(250,130)">
  <path d="M0,20 Q10,25 40,28 Q70,25 100,20 L95,15 Q70,18 40,20 Q10,18 5,15 Z" fill="#5a3a1a"/>
  <rect x="45" y="-20" width="3" height="40" fill="#4a2a12"/>
  <path d="M48,-20 L48,-10 L70,-15 Z" fill="#cc3333" opacity="0.6"/>
</g>
<path d="M0,170 Q150,165 300,168 Q450,165 600,170 L600,400 L0,400 Z" fill="#003355" opacity="0.5"/>
<path d="M0,180 Q100,185 200,178 Q400,185 600,180 L600,400 L0,400 Z" fill="#002244" opacity="0.3"/>
${bubbles(6, 100, 500, 200, 380)}
`));

// 54. game_over.svg
fs.writeFileSync(path.join(dir, 'game_over.svg'), svg(`
<defs>
  <linearGradient id="bg54" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#1a3355" stop-opacity="0.2"/>
    <stop offset="50%" stop-color="#0a1525" stop-opacity="0.6"/>
    <stop offset="100%" stop-color="#050a10" stop-opacity="0.95"/>
  </linearGradient>
  <radialGradient id="dimLight" cx="50%" cy="20%" r="30%">
    <stop offset="0%" stop-color="#aaccee" stop-opacity="0.15"/>
    <stop offset="100%" stop-color="#aaccee" stop-opacity="0"/>
  </radialGradient>
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg54)"/>
<rect x="0" y="0" width="600" height="200" fill="url(#dimLight)"/>
<g transform="translate(280,120)" opacity="0.6">
  <ellipse cx="0" cy="5" rx="10" ry="18" fill="#335577"/>
  <circle cx="0" cy="-15" r="8" fill="#446688"/>
  <line x1="-12" y1="0" x2="-20" y2="-12" stroke="#335577" stroke-width="3" stroke-linecap="round"/>
  <line x1="12" y1="0" x2="20" y2="-12" stroke="#335577" stroke-width="3" stroke-linecap="round"/>
  <line x1="-4" y1="22" x2="-6" y2="35" stroke="#335577" stroke-width="3" stroke-linecap="round"/>
  <line x1="4" y1="22" x2="6" y2="35" stroke="#335577" stroke-width="3" stroke-linecap="round"/>
</g>
${bubbles(10, 260, 310, 50, 130)}
<polygon points="300,0 285,100 315,100" fill="#aaccee" opacity="0.03"/>
<g opacity="0.4">
  <path d="M150,350 Q160,340 180,335 Q195,340 200,350 Q195,355 180,355 Q160,355 150,350 Z" fill="#334"/>
  <path d="M400,370 Q410,362 425,358 Q438,362 442,370 Q438,375 425,375 Q410,375 400,370 Z" fill="#334"/>
  <path d="M280,380 Q290,372 305,368 Q318,372 322,380 Q318,385 305,385 Q290,385 280,380 Z" fill="#334"/>
</g>
`));

// 55. victory_surface.svg
fs.writeFileSync(path.join(dir, 'victory_surface.svg'), svg(`
<defs>
  <linearGradient id="sunset55" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#ff6633" stop-opacity="0.3"/>
    <stop offset="20%" stop-color="#ff8844" stop-opacity="0.25"/>
    <stop offset="40%" stop-color="#ffcc66" stop-opacity="0.2"/>
    <stop offset="60%" stop-color="#44aacc" stop-opacity="0.3"/>
    <stop offset="100%" stop-color="#003355" stop-opacity="0.6"/>
  </linearGradient>
  <radialGradient id="sunV" cx="50%" cy="25%" r="25%">
    <stop offset="0%" stop-color="#ffee88" stop-opacity="0.5"/>
    <stop offset="100%" stop-color="#ffee88" stop-opacity="0"/>
  </radialGradient>
  ${glowFilter('victoryG', 5, '#ffcc44')}
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#sunset55)"/>
<rect x="0" y="0" width="600" height="200" fill="url(#sunV)"/>
<circle cx="300" cy="80" r="30" fill="#ffee88" opacity="0.3" filter="url(#victoryG)"/>
<path d="M0,180 Q80,175 160,180 Q240,185 320,178 Q400,182 480,178 Q540,175 600,180 L600,190 Q540,185 480,188 Q400,192 320,188 Q240,195 160,190 Q80,185 0,190 Z" fill="#88ccdd" opacity="0.3"/>
<g transform="translate(250,210)">
  <rect x="0" y="0" width="60" height="40" fill="#8a6533" rx="3"/>
  <path d="M0,0 Q30,-12 60,0" fill="#9a7543" stroke="#6a4522" stroke-width="1"/>
  <circle cx="30" cy="20" r="4" fill="#ccaa44" opacity="0.7"/>
  <circle cx="15" cy="10" r="3" fill="#ffcc44" opacity="0.4" filter="url(#victoryG)"/>
  <circle cx="45" cy="10" r="2.5" fill="#ff4466" opacity="0.4"/>
</g>
<g transform="translate(100,120) rotate(-15)">
  <path d="M0,10 Q10,4 30,0 Q50,-3 70,3 Q75,5 70,8 Q50,13 30,13 Q10,11 0,10 Z" fill="#668899" opacity="0.5"/>
  <path d="M70,6 L85,2 L83,12 Z" fill="#668899" opacity="0.4"/>
</g>
<g transform="translate(420,140) rotate(10)">
  <path d="M0,10 Q10,4 30,0 Q50,-3 70,3 Q75,5 70,8 Q50,13 30,13 Q10,11 0,10 Z" fill="#668899" opacity="0.5"/>
  <path d="M70,6 L85,2 L83,12 Z" fill="#668899" opacity="0.4"/>
</g>
<path d="M0,195 Q150,190 300,195 Q450,190 600,195 L600,400 L0,400 Z" fill="#003355" opacity="0.4"/>
${bubbles(6, 200, 400, 220, 380)}
`));

// 56. danger_nearby.svg
fs.writeFileSync(path.join(dir, 'danger_nearby.svg'), svg(`
<defs>
  <linearGradient id="bg56" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#1a1515" stop-opacity="0.5"/>
    <stop offset="100%" stop-color="#0a0505" stop-opacity="0.9"/>
  </linearGradient>
  <radialGradient id="dangerRad" cx="40%" cy="50%" r="40%">
    <stop offset="0%" stop-color="#ff0000" stop-opacity="0.08"/>
    <stop offset="100%" stop-color="#ff0000" stop-opacity="0"/>
  </radialGradient>
  ${glowFilter('redGlow', 5, '#ff3344')}
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg56)"/>
<rect x="0" y="0" width="600" height="400" fill="url(#dangerRad)"/>
<path d="M50,100 Q100,80 200,120 Q250,150 300,200 Q350,260 380,300 Q400,340 420,380 L380,400 Q360,360 340,320 Q310,270 260,220 Q200,170 150,150 Q80,130 30,150 Z" fill="#111" opacity="0.7"/>
<path d="M70,120 Q110,100 180,130 Q230,160 270,210 Q310,270 340,330" stroke="#1a1a1a" stroke-width="3" fill="none" opacity="0.4"/>
<circle cx="120" cy="130" r="6" fill="#ff3344" opacity="0.15" filter="url(#redGlow)"/>
<circle cx="140" cy="125" r="6" fill="#ff3344" opacity="0.15" filter="url(#redGlow)"/>
<path d="M0,380 Q200,370 400,380 Q500,375 600,380 L600,400 L0,400 Z" fill="#111" opacity="0.4"/>
${bubbles(5, 300, 550, 100, 350)}
`));

// 57. shield_block.svg
fs.writeFileSync(path.join(dir, 'shield_block.svg'), svg(`
<defs>
  <linearGradient id="bg57" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#0a2244" stop-opacity="0.4"/>
    <stop offset="100%" stop-color="#051122" stop-opacity="0.85"/>
  </linearGradient>
  <radialGradient id="flashRad" cx="50%" cy="50%" r="30%">
    <stop offset="0%" stop-color="#ffffff" stop-opacity="0.4"/>
    <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
  </radialGradient>
  ${glowFilter('flashGlow', 8, '#ffffff')}
  ${glowFilter('shardGlow', 3, '#44aaff')}
</defs>
<rect x="0" y="0" width="600" height="400" fill="url(#bg57)"/>
<circle cx="300" cy="200" r="100" fill="url(#flashRad)"/>
${(() => {
  let s = '';
  for (let i = 0; i < 10; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 50 + Math.random() * 80;
    const x = 300 + Math.cos(angle) * dist;
    const y = 200 + Math.sin(angle) * dist;
    const rot = Math.random() * 360;
    const size = 5 + Math.random() * 12;
    s += `<polygon points="${x},${y-size} ${x+size*0.4},${y} ${x},${y+size*0.3} ${x-size*0.4},${y}" fill="#44aaff" opacity="${0.3 + Math.random() * 0.4}" transform="rotate(${rot.toFixed(0)},${x.toFixed(0)},${y.toFixed(0)})" filter="url(#shardGlow)"/>`;
  }
  return s;
})()}
<circle cx="300" cy="200" r="20" fill="white" opacity="0.15" filter="url(#flashGlow)"/>
<g transform="translate(420,160) rotate(150)" opacity="0.6">
  <path d="M0,10 Q10,4 30,0 Q50,-3 70,3 Q75,5 70,8 Q50,13 30,13 Q10,11 0,10 Z" fill="#556677"/>
  <path d="M0,7 L-10,4 L-10,12 Z" fill="#556677"/>
  <circle cx="58" cy="5" r="2" fill="#223"/>
</g>
${bubbles(6, 150, 450, 80, 320)}
`));

// 58. map_overview.svg
fs.writeFileSync(path.join(dir, 'map_overview.svg'), svg(`
<defs>
  <linearGradient id="parchment" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#d4b882"/>
    <stop offset="100%" stop-color="#b89a62"/>
  </linearGradient>
  ${glowFilter('mapGlow', 2, '#aa7744')}
</defs>
<rect x="40" y="30" width="520" height="340" fill="url(#parchment)" rx="8" opacity="0.8"/>
<rect x="40" y="30" width="520" height="340" fill="none" stroke="#8a6a3a" stroke-width="3" rx="8" opacity="0.6"/>
<rect x="50" y="40" width="500" height="320" fill="none" stroke="#8a6a3a" stroke-width="1" rx="5" opacity="0.3"/>
<g opacity="0.5">
  <circle cx="480" cy="80" r="30" fill="none" stroke="#8a6a3a" stroke-width="1.5"/>
  <circle cx="480" cy="80" r="25" fill="none" stroke="#8a6a3a" stroke-width="0.5"/>
  <line x1="480" y1="48" x2="480" y2="112" stroke="#8a6a3a" stroke-width="1"/>
  <line x1="448" y1="80" x2="512" y2="80" stroke="#8a6a3a" stroke-width="1"/>
  <polygon points="480,50 477,58 483,58" fill="#cc3333" opacity="0.7"/>
  <text x="480" y="46" text-anchor="middle" fill="#8a6a3a" font-size="8">N</text>
  <text x="480" y="118" text-anchor="middle" fill="#8a6a3a" font-size="8">S</text>
  <text x="444" y="83" text-anchor="middle" fill="#8a6a3a" font-size="8">W</text>
  <text x="516" y="83" text-anchor="middle" fill="#8a6a3a" font-size="8">E</text>
</g>
<path d="M100,150 Q150,120 200,140 Q250,160 300,130 Q350,100 400,120" stroke="#8a6a3a" stroke-width="1.5" fill="none" stroke-dasharray="5,4" opacity="0.5"/>
<path d="M300,130 Q320,180 350,220 Q380,260 420,280" stroke="#8a6a3a" stroke-width="1.5" fill="none" stroke-dasharray="5,4" opacity="0.5"/>
<g font-size="14" fill="#cc3333" opacity="0.7">
  <text x="100" y="155" text-anchor="middle">X</text>
  <text x="300" y="135" text-anchor="middle">X</text>
  <text x="420" y="285" text-anchor="middle">X</text>
</g>
<path d="M80,280 Q85,275 90,278 Q95,273 100,278" stroke="#4477aa" stroke-width="1" fill="none" opacity="0.4"/>
<path d="M150,300 Q155,295 160,298 Q165,293 170,298" stroke="#4477aa" stroke-width="1" fill="none" opacity="0.4"/>
<g transform="translate(200,250)" opacity="0.35">
  <path d="M0,5 Q5,0 10,5 Q5,8 0,5 Z" fill="#8a6a3a"/>
  <path d="M-3,5 L-5,3 L-5,7 Z" fill="#8a6a3a"/>
</g>
<g transform="translate(350,180)" opacity="0.3">
  <path d="M0,5 Q5,0 10,5 Q5,8 0,5 Z" fill="#8a6a3a"/>
  <path d="M-3,5 L-5,3 L-5,7 Z" fill="#8a6a3a"/>
</g>
<ellipse cx="150" cy="200" rx="15" ry="10" fill="#4477aa" opacity="0.15"/>
<ellipse cx="380" cy="160" rx="20" ry="12" fill="#4477aa" opacity="0.1"/>
`));

// 59. compass_rose.svg
fs.writeFileSync(path.join(dir, 'compass_rose.svg'), svg(`
<defs>
  <radialGradient id="compassBg" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="#d4b882" stop-opacity="0.8"/>
    <stop offset="100%" stop-color="#b89a62" stop-opacity="0.6"/>
  </radialGradient>
  ${glowFilter('compassG', 3, '#ccaa44')}
  <linearGradient id="needleN" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#cc3333"/>
    <stop offset="100%" stop-color="#882222"/>
  </linearGradient>
  <linearGradient id="needleS" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#cccccc"/>
    <stop offset="100%" stop-color="#888888"/>
  </linearGradient>
</defs>
<circle cx="300" cy="200" r="175" fill="url(#compassBg)" stroke="#8a6a3a" stroke-width="3"/>
<circle cx="300" cy="200" r="165" fill="none" stroke="#8a6a3a" stroke-width="1.5" opacity="0.5"/>
<circle cx="300" cy="200" r="155" fill="none" stroke="#8a6a3a" stroke-width="0.5" opacity="0.3"/>
${(() => {
  let s = '';
  for (let i = 0; i < 32; i++) {
    const angle = i * Math.PI / 16;
    const len = i % 4 === 0 ? 12 : i % 2 === 0 ? 8 : 4;
    const x1 = 300 + Math.cos(angle) * 155;
    const y1 = 200 + Math.sin(angle) * 155;
    const x2 = 300 + Math.cos(angle) * (155 + len);
    const y2 = 200 + Math.sin(angle) * (155 + len);
    s += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#8a6a3a" stroke-width="${i % 4 === 0 ? 2 : 1}" opacity="0.6"/>`;
  }
  return s;
})()}
<g filter="url(#compassG)">
  <polygon points="300,60 290,195 300,185 310,195" fill="url(#needleN)"/>
  <polygon points="300,340 290,205 300,215 310,205" fill="url(#needleS)"/>
  <polygon points="160,200 295,190 305,200 295,210" fill="url(#needleS)" opacity="0.7"/>
  <polygon points="440,200 305,190 295,200 305,210" fill="url(#needleS)" opacity="0.7"/>
</g>
<circle cx="300" cy="200" r="8" fill="#ccaa44" stroke="#8a6a3a" stroke-width="1.5"/>
<g font-weight="bold" fill="#5a3a1a">
  <text x="300" y="48" text-anchor="middle" font-size="18">N</text>
  <text x="300" y="365" text-anchor="middle" font-size="18">S</text>
  <text x="145" y="206" text-anchor="middle" font-size="18">W</text>
  <text x="455" y="206" text-anchor="middle" font-size="18">E</text>
  <text x="200" y="98" text-anchor="middle" font-size="11" opacity="0.6">NW</text>
  <text x="400" y="98" text-anchor="middle" font-size="11" opacity="0.6">NE</text>
  <text x="200" y="318" text-anchor="middle" font-size="11" opacity="0.6">SW</text>
  <text x="400" y="318" text-anchor="middle" font-size="11" opacity="0.6">SE</text>
</g>
<circle cx="300" cy="200" r="3" fill="#5a3a1a"/>
`));

// 60. depth_meter.svg
fs.writeFileSync(path.join(dir, 'depth_meter.svg'), svg(`
<defs>
  <radialGradient id="gaugeBg" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="#2a2a2a"/>
    <stop offset="80%" stop-color="#1a1a1a"/>
    <stop offset="100%" stop-color="#111"/>
  </radialGradient>
  <linearGradient id="brassRing" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#ccaa55"/>
    <stop offset="50%" stop-color="#aa8833"/>
    <stop offset="100%" stop-color="#ccaa55"/>
  </linearGradient>
  ${glowFilter('gaugeGlow', 3, '#ffcc44')}
  ${glowFilter('needleGlow', 2, '#ff3333')}
</defs>
<circle cx="300" cy="200" r="170" fill="url(#brassRing)"/>
<circle cx="300" cy="200" r="160" fill="url(#gaugeBg)"/>
<circle cx="300" cy="200" r="155" fill="none" stroke="#aa8833" stroke-width="1" opacity="0.5"/>
${(() => {
  let s = '';
  for (let i = 0; i <= 20; i++) {
    const angle = -Math.PI * 0.75 + (i / 20) * Math.PI * 1.5;
    const len = i % 5 === 0 ? 15 : i % 2 === 0 ? 10 : 6;
    const x1 = 300 + Math.cos(angle) * 140;
    const y1 = 200 + Math.sin(angle) * 140;
    const x2 = 300 + Math.cos(angle) * (140 - len);
    const y2 = 200 + Math.sin(angle) * (140 - len);
    s += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#ccaa55" stroke-width="${i % 5 === 0 ? 2.5 : 1}" opacity="0.7"/>`;
    if (i % 5 === 0) {
      const tx = 300 + Math.cos(angle) * 118;
      const ty = 200 + Math.sin(angle) * 118;
      s += `<text x="${tx.toFixed(1)}" y="${(ty + 4).toFixed(1)}" text-anchor="middle" fill="#ccaa55" font-size="12" opacity="0.7">${i * 50}</text>`;
    }
  }
  return s;
})()}
<g transform="translate(300,200) rotate(45)" filter="url(#needleGlow)">
  <polygon points="0,-100 -4,10 0,15 4,10" fill="#cc3333"/>
  <polygon points="0,25 -3,10 0,15 3,10" fill="#888"/>
</g>
<circle cx="300" cy="200" r="10" fill="#aa8833" stroke="#886622" stroke-width="2"/>
<circle cx="300" cy="200" r="4" fill="#ccaa55"/>
<text x="300" y="270" text-anchor="middle" fill="#ccaa55" font-size="10" opacity="0.6">DEPTH (m)</text>
<circle cx="300" cy="290" r="3" fill="#33cc33" opacity="0.5" filter="url(#gaugeGlow)"/>
<rect x="260" y="300" width="80" height="15" fill="#1a1a1a" stroke="#aa8833" stroke-width="0.5" rx="2" opacity="0.6"/>
<text x="300" y="311" text-anchor="middle" fill="#33cc33" font-size="9" opacity="0.5">ACTIVE</text>
`));

console.log('All 60 SVG files generated in', dir);
