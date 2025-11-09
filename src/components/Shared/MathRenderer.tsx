import React from 'react';
import { InlineMath, BlockMath } from 'react-katex';
import 'katex/dist/katex.min.css';

interface MathRendererProps {
  content: string;
  className?: string;
}

/**
 * MathRenderer component that renders text with LaTeX math equations
 * Supports both inline math \(...\) and block math \[...\]
 */
export function MathRenderer({ content, className = '' }: MathRendererProps) {
  // Normalize whitespace in content first (remove extra line breaks in math)
  const normalizedContent = content.replace(/\n\s*\n/g, '\n');
  
  // Split content by LaTeX delimiters
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  // Pattern to match both inline \(...\) and block \[...\] math
  // Updated to handle multi-line math and normalize whitespace
  const mathPattern = /(\\(?:\[|\())([\s\S]*?)(\\(?:\)|\]))/g;
  let match;

  while ((match = mathPattern.exec(normalizedContent)) !== null) {
    const [fullMatch, openDelimiter, mathContent, closeDelimiter] = match;
    const matchStart = match.index;
    const matchEnd = matchStart + fullMatch.length;

    // Add text before the math
    if (matchStart > lastIndex) {
      parts.push(
        <span key={key++}>
          {normalizedContent.substring(lastIndex, matchStart)}
        </span>
      );
    }

    // Clean up math content: remove line breaks and normalize whitespace
    const cleanedMath = mathContent.replace(/\s+/g, ' ').trim();

    // Add the math content
    const isBlock = openDelimiter === '\\[' && closeDelimiter === '\\]';
    if (isBlock) {
      parts.push(
        <BlockMath key={key++} math={cleanedMath} />
      );
    } else {
      parts.push(
        <InlineMath key={key++} math={cleanedMath} />
      );
    }

    lastIndex = matchEnd;
  }

  // Add remaining text after the last match
  if (lastIndex < normalizedContent.length) {
    parts.push(
      <span key={key++}>
        {normalizedContent.substring(lastIndex)}
      </span>
    );
  }

  // If no math found, just return the content as-is
  if (parts.length === 0) {
    return <span className={className}>{normalizedContent}</span>;
  }

  return <span className={className}>{parts}</span>;
}

export default MathRenderer;

