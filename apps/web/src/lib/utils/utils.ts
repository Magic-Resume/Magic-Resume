import { MagicDebugger } from "./debuggger";
export { cn } from '@magic-resume/utils';
export { formatTime, formatRelativeTime } from '@magic-resume/utils';


// 简历快照
export function generateSnapshot(options?: {
  scale?: number;
  quality?: number;
  format?: 'png' | 'jpeg';
}): Promise<Blob | null> {
  const {
    scale = 0.5,
    quality = 0.7,
    format = 'jpeg'
  } = options || {};

  return new Promise(async (resolve) => {
    let clonedResume: HTMLElement | null = null;
    
    // Safety timeout: 10 seconds to generate snapshot
    const timeoutId = setTimeout(() => {
      MagicDebugger.error("Snapshot generation timed out after 10s");
      if (clonedResume && clonedResume.parentNode) {
        document.body.removeChild(clonedResume);
      }
      resolve(null);
    }, 10000);

    const cleanup = () => {
      clearTimeout(timeoutId);
      if (clonedResume && clonedResume.parentNode) {
        document.body.removeChild(clonedResume);
      }
    };

    try {
      const element = document.getElementById('resume-to-export');
      if (!element) {
        MagicDebugger.error("Snapshot failed: Preview element not found.");
        cleanup();
        resolve(null);
        return;
      }
      
      clonedResume = element.cloneNode(true) as HTMLElement;
      clonedResume.style.width = `${element.offsetWidth}px`;
      clonedResume.style.position = 'absolute';
      clonedResume.style.left = '-9999px';
      clonedResume.style.top = '0px';
      document.body.appendChild(clonedResume);

      const elements = [clonedResume, ...Array.from(clonedResume.getElementsByTagName('*')) as HTMLElement[]];
      
      elements.forEach(el => {
        const style = window.getComputedStyle(el);
        const colorProps = ['color', 'background-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'];
        const oklchRegex = /oklch\(([^)]+)\)/;
        
        colorProps.forEach(prop => {
          const value = style.getPropertyValue(prop);
          const match = value.match(oklchRegex);
          if (match) {
            try {
              const [l, c, h] = match[1].split(' ').map(s => parseFloat(s.replace('%', '')));
              const [r, g, b] = oklchToRgb(l, c, h);
              el.style.setProperty(prop, `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`, 'important');
            } catch (e) {
              MagicDebugger.warn(`Could not convert oklch color: ${match[0]}`, e);
            }
          }
        });
      });

      const images = Array.from(clonedResume.getElementsByTagName('img'));
      const imageLoadPromises = images.map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise((res, rej) => {
          img.onload = res;
          img.onerror = rej;
          // Single image timeout
          setTimeout(res, 3000);
        });
      });
      await Promise.all(imageLoadPromises);

      // Lazily import html2canvas so this heavy, browser-only library stays out
      // of the @/lib/utils barrel's eager init graph (it is only needed here).
      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(clonedResume, {
        scale: scale,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });
      
      canvas.toBlob((blob) => {
        cleanup();
        resolve(blob);
      }, `image/${format}`, quality);
    } catch (error) {
      MagicDebugger.error("Error generating snapshot:", error);
      cleanup();
      resolve(null);
    }
  });
};

// 这里原本有一张 `EXPORT_PRESETS` 导出质量预设表（高/标准/压缩/预览），全仓没有任何
// 引用点——PDF 导出走的是 react-pdf 那条路，从没读过它。四条中文 description 因此也从没
// 被渲染过。删掉：留着只会让下一个人以为导出质量是可配的。

// 颜色解析
function oklchToRgb(l: number, c: number, h: number){
  const a = c * Math.cos(h * Math.PI / 180);
  const b = c * Math.sin(h * Math.PI / 180);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;

  const L = l_ * l_ * l_;
  const M = m_ * m_ * m_;
  const S = s_ * s_ * s_;

  let r = 4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S;
  let g = -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S;
  let bl = -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S;

  r = Math.max(0, Math.min(1, r));
  g = Math.max(0, Math.min(1, g));
  bl = Math.max(0, Math.min(1, bl));

  return [r * 255, g * 255, bl * 255];
}


/**
 * 客户端安全的时间生成函数
 * 在服务器端返回null，在客户端返回实际时间
 * 避免hydration错误
 */
export function getClientSafeTimestamp(): string | null {
  if (typeof window === 'undefined') {
    return null; // 服务器端返回null
  }
  return new Date().toISOString(); // 客户端返回实际时间
}

/**
 * 获取当前年份，客户端安全
 */
export function getClientSafeYear(): number {
  if (typeof window === 'undefined') {
    return 2025; // 服务器端返回默认年份
  }
  return new Date().getFullYear(); // 客户端返回实际年份
}
