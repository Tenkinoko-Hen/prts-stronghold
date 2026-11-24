// 青逝痕 Tenkinoko 制作
const reportWidth = 1160;

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
    // 一般战报按两倍分辨率导出；特别长的对局等比缩放整张图，不裁尾部。
    const scale = Math.min(2, 16384 / height, Math.sqrt(24_000_000 / (reportWidth * height)));
    const widthPx = Math.max(1, Math.floor(reportWidth * scale)), heightPx = Math.ceil(height * scale);
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', String(widthPx));
    svg.setAttribute('height', String(heightPx));
    svg.setAttribute('viewBox', `0 0 ${reportWidth} ${height}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    const style = svg.appendChild(document.createElementNS(ns, 'style'));
    style.textContent = Array.from(doc.styleSheets[0].cssRules, rule => {
      if (rule.type !== CSSRule.MEDIA_RULE) return rule.cssText;
      const media = rule as CSSMediaRule;
      return doc.defaultView!.matchMedia(media.conditionText).matches
        ? Array.from(media.cssRules, item => item.cssText).join('\n') : '';
    }).join('\n');
    const content = svg.appendChild(document.createElementNS(ns, 'foreignObject'));
    content.setAttribute('width', String(reportWidth));
    content.setAttribute('height', String(height));
    content.append(doc.body.cloneNode(true));

    const image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = widthPx;
    canvas.height = heightPx;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('图片画布不可用');
    ctx.drawImage(image, 0, 0);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('PNG 编码失败')), 'image/png'));
  } finally {
    frame.remove();
  }
}
