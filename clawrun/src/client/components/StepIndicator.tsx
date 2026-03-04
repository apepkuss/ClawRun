import React from 'react';

interface StepDef {
  label: string;
}

interface Props {
  steps: readonly StepDef[];
  current: number;
  onStepClick?: (index: number) => void;
}

export function StepIndicator({ steps, current, onStepClick }: Props) {
  return (
    <div className="flex items-center mt-4">
      {steps.map((s, i) => (
        <React.Fragment key={i}>
          {i > 0 && (
            <div className={`flex-1 h-0.5 mx-2 ${i <= current ? 'bg-blue-400' : 'bg-gray-200'}`} />
          )}
          <button
            type="button"
            onClick={() => i < current && onStepClick?.(i)}
            disabled={i > current}
            className={`flex items-center gap-1.5 ${
              i <= current ? 'text-blue-600' : 'text-gray-400'
            } ${i < current ? 'cursor-pointer' : i === current ? 'cursor-default' : 'cursor-default'}`}
          >
            <span
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium border-2 ${
                i < current
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : i === current
                    ? 'border-blue-600 text-blue-600'
                    : 'border-gray-300 text-gray-400'
              }`}
            >
              {i < current ? '\u2713' : i + 1}
            </span>
            <span className="text-xs font-medium hidden sm:inline">{s.label}</span>
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}
