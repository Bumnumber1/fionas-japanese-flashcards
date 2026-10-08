// Optional, isolated handoff for original games embedded by the garden.
(() => {
  'use strict';
  const params = new URLSearchParams(location.search);
  if (params.get('garden') !== '1') return;
  document.documentElement.classList.add('garden-embed');
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet'; stylesheet.href = 'garden-embed.css'; document.head.append(stylesheet);
  try {
    const ids = JSON.parse(decodeURIComponent(location.hash.slice(1)));
    if (!Array.isArray(ids) || ids.length > 500 || ids.some(id => typeof id !== 'string')) throw new Error('Invalid selection');
    const valid = new Set(Object.values(Year1Review.catalog).flat().map(item => item.id));
    const selected = ids.filter(id => valid.has(id));
    const material = GardenMaterial.build(selected);
    window.GardenSession = { ...material, game:params.get('game'), close:()=>parent.postMessage({type:'garden-close'}, '*') };
  } catch {
    // Fail closed: malformed or missing handoffs must never load the ordinary word pool.
    window.GardenSession = { ...GardenMaterial.build([]), game:null, close:()=>parent.postMessage({type:'garden-close'}, '*') };
  }
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); GardenSession.close(); }
  });
})();
