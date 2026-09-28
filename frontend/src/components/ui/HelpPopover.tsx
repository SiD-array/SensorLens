import React, { useState, useRef, useEffect } from 'react';
import { HelpCircle, X, Sparkles } from 'lucide-react';

export type HelpTopicKey = 'pearson' | 'fastdtw' | 'baseline_corridor' | 'progress_normalization';

interface HelpTopicContent {
  title: string;
  tagline: string;
  explanation: string;
  analogy: string;
  keyTakeaway: string;
  formula?: string;
}

export const HELP_TOPICS: Record<HelpTopicKey, HelpTopicContent> = {
  pearson: {
    title: 'Pearson Correlation (r)',
    tagline: 'Linear Shape Synchronization',
    explanation: 'Evaluates whether two sensor signals rise, crest, and decline at the exact same timestamps. A value near +1.0 means perfect simultaneous movement, while 0 indicates no relationship.',
    analogy: 'Synchronized swimmers executing identical movements in the exact same second.',
    keyTakeaway: 'Best for detecting instantaneous phase alignment and synchronized sensor firing.',
    formula: 'r = Σ((x - x̄)(y - ȳ)) / (σ_x · σ_y)'
  },
  fastdtw: {
    title: 'FastDTW (Dynamic Time Warping)',
    tagline: 'Elastic Temporal Pattern Matching',
    explanation: 'Measures wave pattern similarity even when one run started earlier, operated slower, or experienced operational latency. It warps the time axis non-linearly to find optimal path alignment.',
    analogy: 'Recognizing the same song whether sung fast or slow.',
    keyTakeaway: 'Prevents false alarms caused by cycle start latency or variable motor ramp-up speeds.'
  },
  baseline_corridor: {
    title: 'Baseline Envelope (μ ± kσ)',
    tagline: 'Statistical Tolerance Corridor',
    explanation: 'Constructed from golden reference runs. μ(t) represents the mean baseline curve at each timestep, while σ(t) is standard deviation. Setting k=3 captures 99.73% of normal variation under a Gaussian distribution.',
    analogy: 'A highway lane with rumble strips: staying inside is nominal, drifting outside triggers an anomaly flag.',
    keyTakeaway: 'Any sample crossing outside the shaded corridor is counted as an anomaly violation.',
    formula: 'Corridor(t) = μ(t) ± k · σ(t)'
  },
  progress_normalization: {
    title: 'Progress Normalization (0–100%)',
    tagline: 'Uniform Cycle Scale Warping',
    explanation: 'Transforms varying operational durations (e.g. 42 minutes vs 48 minutes) onto a standardized 0% to 100% normalized progress index, enabling apples-to-apples visual comparison across runs.',
    analogy: 'Comparing marathon runners by % of the race completed rather than current clock time.',
    keyTakeaway: 'Enables baseline envelopes to compare long washing or spin cycles against shorter runs.'
  }
};

interface HelpPopoverProps {
  topic: HelpTopicKey;
  className?: string;
}

export const HelpPopover: React.FC<HelpPopoverProps> = ({ topic, className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const data = HELP_TOPICS[topic];

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        popoverRef.current && 
        !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  if (!data) return null;

  return (
    <div style={{ position: 'relative', display: 'inline-flex', verticalAlign: 'middle' }} className={className}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="ui-icon-btn ui-icon-btn-xs"
        style={{ color: isOpen ? 'var(--accent-cyan)' : 'var(--text-muted)' }}
        aria-label={`Learn about ${data.title}`}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        title={`What is ${data.title}?`}
      >
        <HelpCircle size={14} />
      </button>

      {isOpen && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label={data.title}
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 8px)',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 320,
            maxWidth: '90vw',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color-hover)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-xl)',
            padding: 'var(--space-3) var(--space-4)',
            zIndex: 'var(--z-popover)',
            animation: 'ui-scale-up var(--duration-fast) var(--ease-spring)',
            color: 'var(--text-primary)',
            fontSize: 'var(--text-xs)',
            lineHeight: 'var(--leading-normal)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
            <div>
              <div style={{ fontWeight: 'var(--weight-bold)', color: '#fff', fontSize: 'var(--text-sm)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Sparkles size={14} style={{ color: 'var(--accent-cyan)' }} />
                <span>{data.title}</span>
              </div>
              <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--accent-cyan)', fontWeight: 'var(--weight-medium)' }}>
                {data.tagline}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="ui-icon-btn ui-icon-btn-xs"
              aria-label="Close"
              style={{ color: 'var(--text-muted)' }}
            >
              <X size={12} />
            </button>
          </div>

          <p style={{ margin: '0 0 8px', color: 'var(--text-secondary)' }}>
            {data.explanation}
          </p>

          <div style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '6px 8px', borderRadius: 'var(--radius-sm)', marginBottom: 8, borderLeft: '2px solid var(--accent-cyan)' }}>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Analogy: </span>
            <span style={{ color: 'var(--text-secondary)' }}>{data.analogy}</span>
          </div>

          {data.formula && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, background: 'rgba(0, 0, 0, 0.4)', padding: '4px 8px', borderRadius: 'var(--radius-xs)', marginBottom: 8, color: 'var(--accent-cyan)' }}>
              {data.formula}
            </div>
          )}

          <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
            💡 <span style={{ color: 'var(--text-secondary)' }}>{data.keyTakeaway}</span>
          </div>
        </div>
      )}
    </div>
  );
};
