declare module 'react-katex' {
  import { ComponentType } from 'react';
  
  export interface InlineMathProps {
    math: string;
  }
  
  export interface BlockMathProps {
    math: string;
  }
  
  export const InlineMath: ComponentType<InlineMathProps>;
  export const BlockMath: ComponentType<BlockMathProps>;
}

