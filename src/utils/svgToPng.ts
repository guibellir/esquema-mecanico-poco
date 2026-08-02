/**
 * Rasteriza um SVG do DOM para PNG (data URL).
 * Cores/fundos ficam fiéis à tela — ideal para impressão/PDF.
 */
export async function svgElementToPngDataUrl(
  svgEl: SVGElement,
  scale = 2
): Promise<string> {
  const svg = svgEl as SVGSVGElement;
  const serializer = new XMLSerializer();
  let source = serializer.serializeToString(svg);

  if (!source.includes('xmlns=')) {
    source = source.replace(
      /<svg\b/,
      '<svg xmlns="http://www.w3.org/2000/svg"'
    );
  }
  // xlink legado (se houver)
  if (!source.includes('xmlns:xlink') && source.includes('xlink:')) {
    source = source.replace(
      /<svg\b/,
      '<svg xmlns:xlink="http://www.w3.org/1999/xlink"'
    );
  }

  const vb = svg.viewBox?.baseVal;
  const w = Math.max(1, vb?.width || svg.clientWidth || 1040);
  const h = Math.max(1, vb?.height || svg.clientHeight || 1200);

  // Garante width/height explícitos no SVG (alguns browsers precisam)
  if (!/width=/.test(source.slice(0, 200))) {
    source = source.replace(/<svg\b/, `<svg width="${w}" height="${h}"`);
  }
  if (!/height=/.test(source.slice(0, 280))) {
    source = source.replace(/<svg\b/, `<svg height="${h}"`);
  }

  const blob = new Blob([source], {
    type: 'image/svg+xml;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);

  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D indisponível');

    // fundo igual ao wrap da tela
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL('image/png', 1);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error('Falha ao rasterizar SVG para impressão'));
    img.src = src;
  });
}
