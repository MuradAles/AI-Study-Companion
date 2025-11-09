import React from 'react';
import MathRenderer from './MathRenderer';
import './StepByStepRenderer.css';

interface StepByStepRendererProps {
  content: string;
  className?: string;
}

/**
 * StepByStepRenderer component that renders step-by-step explanations
 * Parses numbered steps with **bold** formatting
 */
export function StepByStepRenderer({ 
  content, 
  className = ''
}: StepByStepRendererProps) {

  // Parse content into steps
  // Look for patterns like: "1. **Step title**: description" or "**Step title**: description"
  const stepPattern = /(\d+\.\s*\*\*[^*]+\*\*[^\n]*|(?:\*\*[^*]+\*\*[^\n]*))/g;
  const steps: string[] = [];
  let lastIndex = 0;
  let match;

  // First, try to find numbered steps
  const numberedStepPattern = /(\d+\.\s*\*\*[^*]+\*\*[^\n]*(?:\n(?!\d+\.\s*\*\*)[^\n]*)*)/g;
  let numberedMatch;
  
  while ((numberedMatch = numberedStepPattern.exec(content)) !== null) {
    const stepText = numberedMatch[1].trim();
    if (stepText) {
      steps.push(stepText);
    }
  }

  // If no numbered steps found, try to find **bold** sections as steps
  if (steps.length === 0) {
    const boldStepPattern = /(\*\*[^*]+\*\*[^\n]*(?:\n(?!\*\*)[^\n]*)*)/g;
    let boldMatch;
    
    while ((boldMatch = boldStepPattern.exec(content)) !== null) {
      const stepText = boldMatch[1].trim();
      if (stepText) {
        steps.push(stepText);
      }
    }
  }

  // If still no steps found, check if content has numbered list format
  if (steps.length === 0) {
    const lines = content.split('\n').filter(line => line.trim());
    let currentStep = '';
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      // Check if line starts with number and period
      if (/^\d+\./.test(trimmedLine)) {
        if (currentStep) {
          steps.push(currentStep.trim());
        }
        currentStep = trimmedLine;
      } else if (currentStep && trimmedLine) {
        currentStep += '\n' + trimmedLine;
      } else if (!currentStep && trimmedLine) {
        // If no step started yet, treat as regular content
        currentStep = trimmedLine;
      }
    }
    
    if (currentStep) {
      steps.push(currentStep.trim());
    }
  }

  // If we found steps, render them all at once
  if (steps.length > 0) {
    return (
      <div className={`step-by-step-container ${className}`}>
        <div className="steps-list">
          {steps.map((step, index) => {
            const stepNumber = index + 1;
            // Extract bold text and regular text
            const boldMatch = step.match(/\*\*([^*]+)\*\*/);
            const boldText = boldMatch ? boldMatch[1] : null;
            let restOfStep = step.replace(/\*\*[^*]+\*\*/g, '').trim();
            
            // Remove numbered prefixes like "1. " or "2. " from the content
            restOfStep = restOfStep.replace(/^\d+\.\s*/, '').trim();
            
            // Remove leading colon and whitespace
            restOfStep = restOfStep.replace(/^:\s*/, '').trim();

            return (
              <div key={index} className="step-item">
                <div className="step-header">
                  <span className="step-number">{stepNumber}.</span>
                  {boldText && <strong className="step-title">{boldText}</strong>}
                </div>
                {restOfStep && (
                  <div className="step-content">
                    <MathRenderer content={restOfStep} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // If no steps found, just render as regular content with math support
  return (
    <div className={className}>
      <MathRenderer content={content} />
    </div>
  );
}

export default StepByStepRenderer;

