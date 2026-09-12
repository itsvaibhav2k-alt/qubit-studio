import katex from 'katex';

interface MathTextProps {
  math: string;
  block?: boolean;
  className?: string;
  label?: string;
}

/** Accessible KaTeX output for equations and values with units. */
export default function MathText({ math, block = false, className = '', label }: MathTextProps) {
  const html = katex.renderToString(math, {
    displayMode: block,
    output: 'htmlAndMathml',
    strict: false,
    throwOnError: false,
  });
  const Tag = block ? 'div' : 'span';

  return (
    <Tag
      className={`math-text${block ? ' math-block' : ''}${className ? ` ${className}` : ''}`}
      aria-label={label}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
