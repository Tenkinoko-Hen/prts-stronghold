// 青逝痕 Tenkinoko 制作
const reportWidth = 1160;
const FALLBACK_SCALES = [1.25, 1, 0.75, 0.5];
const INVALID_XML_10_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

/** Remove characters forbidden in XML 1.0 (e.g. control chars in player nicknames) so SVG image decoding succeeds. */
export function sanitizeSvgXml(xml: string): string {
  return xml.replace(INVALID_XML_10_CHARS, '');
}

/** Encode arbitrary UTF-8 string to base64 safely in chunks without call-stack overflow. */
export function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const chunks: string[] = [];
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + step)));
  }
  return btoa(chunks.join(''));
}

/** Compute descending export scale candidates capped by canvas pixel limits, with downscale fallbacks. */
export function computeExportScales(width: number, height: number): number[] {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return [1, 0.75, 0.5];
  }
  const primary = Math.min(2, 12000 / height, Math.sqrt(20_000_000 / (width * height)));
  const candidates = [primary, ...FALLBACK_SCALES.filter(scale => scale <= primary)];
  const deduped: number[] = [];
  for (const scale of candidates) {
    if (scale > 0 && Number.isFinite(scale) && !deduped.some(existing => Math.abs(existing - scale) < 1e-6)) {
      deduped.push(scale);
    }
  }
  deduped.sort((a, b) => b - a);
  return deduped.length ? deduped : [1];
}

function extractDocumentCss(doc: Document): string {
  const parts: string[] = [];
  try {
    for (const sheet of Array.from(doc.styleSheets)) {
      try {
        for (const rule of Array.from(sheet.cssRules)) {
          if (rule.type !== CSSRule.MEDIA_RULE) {
            parts.push(rule.cssText);
          } else {
            const media = rule as CSSMediaRule;
            if (doc.defaultView?.matchMedia(media.conditionText).matches) {
              parts.push(Array.from(media.cssRules, item => item.cssText).join('\n'));
            }
          }
        }
      } catch {
        const raw = (sheet.ownerNode as Node | null)?.textContent;
        if (raw) parts.push(raw);
      }
    }
  } catch {
    // Ignore restricted styleSheets access and fall back to inline <style> tags below.
  }
  const joined = parts.filter(Boolean).join('\n').trim();
  if (joined) return joined;
  return Array.from(doc.querySelectorAll('style'), el => el.textContent ?? '')
    .filter(Boolean)
    .join('\n');
}

async function decodeSvgToPngBlob(src: string, widthPx: number, heightPx: number): Promise<Blob> {
  const image = new Image();
  image.src = src;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = widthPx;
  canvas.height = heightPx;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('图片画布不可用');
  ctx.drawImage(image, 0, 0, widthPx, heightPx);
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('PNG 编码失败'))), 'image/png'),
  );
}

async function renderSvgAtScale(svg: SVGSVGElement, widthPx: number, heightPx: number): Promise<Blob> {
  svg.setAttribute('width', String(widthPx));
  svg.setAttribute('height', String(heightPx));
  const svgXml = sanitizeSvgXml(new XMLSerializer().serializeToString(svg));
  // Chromium treats blob: SVG with <foreignObject> as cross-origin and taints the canvas on toBlob().
  // A base64 data: URL keeps the canvas untainted and is far more compact than encodeURIComponent for UTF-8 + sprites.
  try {
    return await decodeSvgToPngBlob(
      `data:image/svg+xml;base64,${utf8ToBase64(svgXml)}`,
      widthPx,
      heightPx,
    );
  } catch (base64Err) {
    try {
      return await decodeSvgToPngBlob(
        `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgXml)}`,
        widthPx,
        heightPx,
      );
    } catch {
      throw base64Err;
    }
  }
}

export async function renderBattleReportPng(html: string): Promise<Blob> {
  // 用导出文档自己的布局测量全高，不受预览窗口大小和滚动位置影响。
  const frame = document.createElement('iframe');
  frame.style.cssText = `position:fixed;left:0;top:0;width:${reportWidth}px;max-width:none;height:1px;border:0;visibility:hidden;pointer-events:none`;
  frame.setAttribute('sandbox', 'allow-same-origin');
  frame.setAttribute('scrolling', 'no');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  const ready = new Promise<void>((resolve, reject) => {
    frame.onload = () => resolve();
    frame.onerror = () => reject(new Error('战报排版失败'));
  });
  frame.srcdoc = html;
  document.body.append(frame);
  try {
    await ready;
    const doc = frame.contentDocument;
    const main = doc?.querySelector('main');
    if (!doc || !main) throw new Error('没有可导出的战报');
    await doc.fonts.ready;
    const height = Math.ceil(main.getBoundingClientRect().height);
    if (!height) throw new Error('战报没有可见内容');
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${reportWidth} ${height}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    const style = svg.appendChild(document.createElementNS(ns, 'style'));
    style.textContent = extractDocumentCss(doc);
    const content = svg.appendChild(document.createElementNS(ns, 'foreignObject'));
    content.setAttribute('width', String(reportWidth));
    content.setAttribute('height', String(height));
    content.append(doc.body.cloneNode(true));

    const scales = computeExportScales(reportWidth, height);
    let lastError: unknown;
    for (const scale of scales) {
      const widthPx = Math.max(1, Math.floor(reportWidth * scale));
      const heightPx = Math.ceil(height * scale);
      try {
        return await renderSvgAtScale(svg, widthPx, heightPx);
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError instanceof Error ? lastError : new Error('战报长图生成失败');
  } finally {
    frame.remove();
  }
}
