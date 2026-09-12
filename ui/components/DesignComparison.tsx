'use client';

import { COMPARISON_KIND_LABELS, requirementsSummary, violationList } from '@/lib/design-copy';
import { paramSummary, signed } from '@/lib/format';
import type {
  BaselineAssessment,
  BaselineAssessmentStatus,
  DesignComparison as Comparison,
  FrozenBaseline,
} from '@/lib/search-types';

export interface DesignComparisonProps {
  comparison: Comparison;
  baseline: FrozenBaseline;
  assessmentStatus: BaselineAssessmentStatus;
  assessment: BaselineAssessment | null;
  assessmentError: string | null;
  onRetryAssessment: () => void;
}

function provenance(baseline: FrozenBaseline): string {
  const source = baseline.source;
  if (!source) return 'pinned in Explore';
  const kind = source.kind === 'recommendation' ? 'recommended' : 'candidate';
  return `${kind} under ${requirementsSummary(source.requirements)}`;
}

interface EligibilityProps {
  status: BaselineAssessmentStatus;
  assessment: BaselineAssessment | null;
  error: string | null;
  onRetry: () => void;
}

/** Eligibility under the CURRENT requirements. Rendered from the assessment only; never inferred. */
function Eligibility({ status, assessment, error, onRetry }: EligibilityProps) {
  if (status === 'pending' || status === 'running') return <span className="pill">assessing…</span>;
  if (status === 'error') {
    return (
      <>
        <span className="pill no">assessment failed</span>
        {error && <span className="cmp-err">{error}</span>}
        <button type="button" className="btn" onClick={onRetry} title="Re-run the baseline assessment">
          Retry
        </button>
      </>
    );
  }
  if (status !== 'ready' || !assessment) return null;
  const { feasible, violations } = assessment.assessment;
  if (feasible) return <span className="pill ok">qualifies now</span>;
  return <span className="pill no">fails now: {violationList(violations)}</span>;
}

/** Baseline comparison strip. Shows the classification it is given; no logic of its own. */
export default function DesignComparison({
  comparison,
  baseline,
  assessmentStatus,
  assessment,
  assessmentError,
  onRetryAssessment,
}: DesignComparisonProps) {
  const eligibility = (
    <Eligibility status={assessmentStatus} assessment={assessment} error={assessmentError} onRetry={onRetryAssessment} />
  );
  return (
    <section className="comparison" aria-label="Baseline comparison">
      <div className="cmp-row">
        <span className="pill">Baseline</span>
        <span className="mono">{paramSummary(baseline.params)}</span>
        <span className="cmp-prov">{provenance(baseline)}</span>
      </div>
      {assessmentStatus !== 'absent' && <div className="cmp-row">{eligibility}</div>}
      <div className="cmp-row">
        <span className="cmp-kind">{COMPARISON_KIND_LABELS[comparison.kind]}</span>
        <span className="cmp-msg">{comparison.message}</span>
      </div>
      {(comparison.delta_anharmonicity_mhz !== null || comparison.delta_dispersion_khz !== null
        || comparison.changed_requirements.length > 0) && (
        <div className="cmp-row">
          {comparison.delta_anharmonicity_mhz !== null && (
            <span className="mono">ΔA {signed(comparison.delta_anharmonicity_mhz, 1)} MHz</span>
          )}
          {comparison.delta_dispersion_khz !== null && (
            <span className="mono">Δ charge variation {signed(comparison.delta_dispersion_khz, 3)} kHz</span>
          )}
          {comparison.changed_requirements.length > 0 && (
            <span className="cmp-changed">changed: {comparison.changed_requirements.join(', ')}</span>
          )}
        </div>
      )}
    </section>
  );
}
