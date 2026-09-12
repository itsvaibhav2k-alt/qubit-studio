'use client';

import katex from 'katex';
import 'katex/dist/katex.min.css';

const UNICODE_TO_TEX: Array<[RegExp, string]> = [
  [/EJ\s*\/\s*EC/g, '$E_J/E_C$'],
  [/E_J\/E_C/g, '$E_J/E_C$'],
  [/E_J/g, '$E_J$'],
  [/E_C/g, '$E_C$'],
  [/\bEJ\b/g, '$E_J$'],
  [/\bEC\b/g, '$E_C$'],
  [/f₀₁/g, '$f_{01}$'],
  [/f₁₂/g, '$f_{12}$'],
  [/\bf01\b/g, '$f_{01}$'],
  [/\bf12\b/g, '$f_{12}$'],
  [/n_g/g, '$n_g$'],
  [/\bncut\b/g, '$n_{\\mathrm{cut}}$'],
  [/\bng\b/g, '$n_g$'],
  [/Φ\/Φ₀/g, '$\\Phi/\\Phi_0$'],
  [/\|0⟩/g, '$|0\\rangle$'],
  [/\|1⟩/g, '$|1\\rangle$'],
  [/\|2⟩/g, '$|2\\rangle$'],
  [/α/g, '$\\alpha$'],
  [/δf₀₁/g, '$\\delta f_{01}$'],
  [/√\(8 EJ EC\) − EC/g, '$\\sqrt{8 E_J E_C}-E_C$'],
  [/√\(8 E_J E_C\) − E_C/g, '$\\sqrt{8 E_J E_C}-E_C$'],
];

const VALUE_WITH_UNIT = /([<>≤±~]?\s*[+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?(?:\s*[–-]\s*[+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?)?)\s*(fF\/µm²|A\/cm²|GHz|MHz|kHz|nA|fF|µs|µm²|µm|°C|%)/gi;

function valueWithUnitToTex(value: string, unit: string): string {
  const number = value.trim()
    .replace(/^±/, '\\pm ')
    .replace(/^≤/, '\\le ')
    .replace(/^</, '\\lt ')
    .replace(/^>/, '\\gt ')
    .replace(/^~/, '\\sim ')
    .replace(/(-?\d+(?:\.\d+)?)e([+-]?\d+)/gi, '$1\\times 10^{$2}')
    .replace(/[–-](?=[+-]?\d)/g, '\\text{–}');
  const texUnit: Record<string, string> = {
    'fF/µm²': '\\mathrm{fF}/\\mu\\mathrm{m}^{2}',
    'A/cm²': '\\mathrm{A}/\\mathrm{cm}^{2}',
    'µm²': '\\mu\\mathrm{m}^{2}',
    'µs': '\\mu\\mathrm{s}',
    'µm': '\\mu\\mathrm{m}',
    '°C': '{}^\\circ\\mathrm{C}',
    '%': '\\%',
  };
  return `$${number}\\,${texUnit[unit] ?? `\\mathrm{${unit}}`}$`;
}

function withTex(text: string): string {
  let next = text;
  for (const [pattern, tex] of UNICODE_TO_TEX) next = next.split(/(\$[^$\n]+\$)/g).map((part, index) => index % 2 ? part : part.replace(pattern, tex)).join('');
  next = next.split(/(\$[^$\n]+\$)/g).map((part, index) => index % 2 ? part : part.replace(VALUE_WITH_UNIT, (_, value: string, unit: string) => valueWithUnitToTex(value, unit))).join('');
  return next;
}

function renderChunk(chunk: string, display: boolean): string {
  try {
    return katex.renderToString(chunk, { displayMode: display, throwOnError: false, trust: false, strict: false });
  } catch {
    return chunk.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
  }
}

export default function MathText({
  text,
  math,
  block = false,
  className = '',
  label,
}: {
  text?: string;
  math?: string;
  block?: boolean;
  className?: string;
  label?: string;
}) {
  if (math !== undefined) {
    const html = renderChunk(math, block);
    const Tag = block ? 'div' : 'span';
    return (
      <Tag
        className={`math-text myla-math${block ? ' math-block myla-math-block' : ''}${className ? ` ${className}` : ''}`}
        aria-label={label}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  const source = withTex(text ?? '');
  const parts = source.split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+\$|\\\([\s\S]+?\\\))/g);
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith('$$') && part.endsWith('$$')) {
          return (
            <span
              key={index}
              className="myla-math myla-math-block"
              dangerouslySetInnerHTML={{ __html: renderChunk(part.slice(2, -2), true) }}
            />
          );
        }
        if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
          return (
            <span
              key={index}
              className="myla-math"
              dangerouslySetInnerHTML={{ __html: renderChunk(part.slice(1, -1), false) }}
            />
          );
        }
        if (part.startsWith('\\(') && part.endsWith('\\)')) {
          return (
            <span
              key={index}
              className="myla-math"
              dangerouslySetInnerHTML={{ __html: renderChunk(part.slice(2, -2), false) }}
            />
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </>
  );
}
