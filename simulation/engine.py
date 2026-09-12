"""Bounded simplified-transmon calculations. No real-device prediction."""
import os
os.environ.setdefault('MPLBACKEND', 'Agg')

from time import perf_counter
from collections import Counter
from hashlib import sha256
from math import isfinite, ulp
from typing import Literal
import numpy as np
import scqubits as scq
from pydantic import BaseModel, ConfigDict, Field, model_validator

DISPERSION_RESOLUTION_KHZ = 0.001  # proposed 1 Hz reporting/selection floor
FREQUENCY_TOLERANCE_GHZ = 1e-9
CHARGE_BUDGET_BUFFER_KHZ = 0.001
COMPARISON_RESOLUTION_MHZ = 1e-4
MODEL = 'isolated-transmon'
MODEL_VERSION = 'v1'


class Request(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False, strict=True)


class DeviceRequest(Request):
    ej_ghz: float = Field(default=15, ge=0.01, le=50)
    ec_ghz: float = Field(default=0.3, ge=0.01, le=2)
    ng: float = Field(default=0, ge=0, le=1)
    ncut: int = Field(default=30, ge=20, le=60)


class SearchRequest(Request):
    target_ghz: float = Field(default=5, ge=3, le=8)
    max_dispersion_khz: float = Field(default=10, ge=0.01, le=100000)
    min_anharmonicity_mhz: float = Field(default=200, ge=0, le=2000)
    ratio_min: float = Field(default=20, ge=20, le=120)
    ratio_max: float = Field(default=120, ge=20, le=120)
    ej_min_ghz: float = Field(default=5, ge=0.01, le=50)
    ej_max_ghz: float = Field(default=35, ge=0.01, le=50)
    ec_min_ghz: float = Field(default=0.15, ge=0.01, le=2)
    ec_max_ghz: float = Field(default=0.45, ge=0.01, le=2)
    points: int = Field(default=401, ge=21, le=1001)
    ncut: int = Field(default=30, ge=20, le=60)
    baseline: DeviceRequest | None = None

    @model_validator(mode='after')
    def ordered_bounds(self):
        for lo, hi in [('ratio_min','ratio_max'), ('ej_min_ghz','ej_max_ghz'), ('ec_min_ghz','ec_max_ghz')]:
            if getattr(self, lo) >= getattr(self, hi):
                raise ValueError(f'{lo} must be smaller than {hi}')
        return self


Violation = Literal[
    'charge_budget_khz', 'anharmonicity_floor_mhz',
    'ej_lower_ghz', 'ej_upper_ghz', 'ec_lower_ghz', 'ec_upper_ghz',
    'ratio_lower', 'ratio_upper', 'charge_budget_numerical_buffer',
    'requires_negative_anharmonicity', 'frequency_lock_numerical_error',
    'frequency_target_mismatch', 'design_reference_ng_mismatch',
]


class DeviceSummary(Request):
    ej_ghz: float
    ec_ghz: float
    ng: float
    ncut: int
    ratio: float
    raw_levels_ghz: list[float]
    levels_ghz: list[float]
    f01_ghz: float
    f12_ghz: float
    alpha_mhz: float
    anharmonicity_mhz: float
    dispersion_khz: float | None
    dispersion_status: Literal['resolved', 'below_reporting_floor']
    # Conservative selection value; not a certified numerical error bound.
    dispersion_upper_khz: float
    dispersion_resolution_khz: float
    model: str
    model_version: str


class ChargePoint(Request):
    ng: float
    f01_ghz: float


class DeviceResponse(DeviceSummary):
    charge_response: list[ChargePoint]
    elapsed_ms: float


class CandidateMargins(Request):
    charge_budget_khz: float
    anharmonicity_floor_mhz: float
    ej_lower_ghz: float
    ej_upper_ghz: float
    ec_lower_ghz: float
    ec_upper_ghz: float
    ratio_lower: float
    ratio_upper: float
    frequency_target_ghz: float


class SearchCandidate(DeviceSummary):
    candidate_id: str
    margins: CandidateMargins
    violations: list[Violation]
    feasible: bool


class BaselineAssessment(Request):
    params: DeviceRequest
    assessment: SearchCandidate


class RejectionCount(Request):
    reason: Violation
    count: int


class SelectionEvidence(Request):
    kind: Literal['higher_a_rejected', 'grid_boundary', 'evaluated_maximum', 'infeasible']
    higher_a_count: int
    higher_a_rejections: list[RejectionCount]
    selected_at_ratio_boundary: Literal['lower', 'upper'] | None


class SearchResponse(Request):
    model: str
    model_version: str
    status: Literal['feasible', 'infeasible']
    request: SearchRequest
    selected: SearchCandidate | None
    candidates: list[SearchCandidate]
    evaluated_count: int
    feasible_count: int
    selection_rule: str
    optimality_scope: Literal['evaluated grid only']
    dispersion_resolution_khz: float
    frequency_tolerance_ghz: float
    charge_budget_buffer_khz: float
    comparison_resolution_mhz: float
    baseline_evaluation: BaselineAssessment | None
    selection_evidence: SelectionEvidence
    elapsed_ms: float


def levels(ej, ec, ng=0, ncut=30, count=3):
    values = scq.Transmon(EJ=ej, EC=ec, ng=ng, ncut=ncut).eigenvals(evals_count=count)
    if not np.all(np.isfinite(values)):
        raise ArithmeticError('Non-finite eigenvalues; no valid result.')
    return values


def metrics(ej, ec, ng=0, ncut=30):
    e = levels(ej, ec, ng, ncut, count=4)
    e0 = levels(ej, ec, 0, ncut)
    eh = levels(ej, ec, 0.5, ncut)
    f01, f12 = float(e[1]-e[0]), float(e[2]-e[1])
    dispersion = abs(float((eh[1]-eh[0])-(e0[1]-e0[0]))) * 1e6
    resolved = dispersion >= DISPERSION_RESOLUTION_KHZ
    return {
        'ej_ghz': float(ej), 'ec_ghz': float(ec), 'ng': float(ng),
        'ncut': int(ncut), 'model': MODEL, 'model_version': MODEL_VERSION,
        'dispersion_resolution_khz': DISPERSION_RESOLUTION_KHZ,
        'ratio': float(ej/ec), 'raw_levels_ghz': e.tolist(),
        'levels_ghz': (e-e[0]).tolist(), 'f01_ghz': f01, 'f12_ghz': f12,
        'alpha_mhz': (f12-f01)*1000,
        'anharmonicity_mhz': (f01-f12)*1000,
        'dispersion_khz': dispersion if resolved else None,
        'dispersion_status': 'resolved' if resolved else 'below_reporting_floor',
        'dispersion_upper_khz': max(dispersion, DISPERSION_RESOLUTION_KHZ),
    }


def evaluate(req: DeviceRequest):
    start = perf_counter()
    result = metrics(req.ej_ghz, req.ec_ghz, req.ng, req.ncut)
    curve = []
    for ng in np.linspace(0, 1, 101):
        e = levels(req.ej_ghz, req.ec_ghz, float(ng), req.ncut)
        curve.append({'ng': float(ng), 'f01_ghz': float(e[1]-e[0])})
    result.update({
        'charge_response': curve,
        'elapsed_ms': (perf_counter()-start)*1000,
    })
    return result


def candidate_id(p):
    """Identify saved numerical device inputs without display rounding or requirements."""
    coordinates = [float(p[k]).hex() for k in ('ej_ghz', 'ec_ghz', 'ng')]
    payload = '|'.join([p['model'], p['model_version'], *coordinates, str(p['ncut'])])
    return sha256(payload.encode('ascii')).hexdigest()


def bound_margin(value, bound):
    """Normalize subtraction roundoff only, not a physical constraint tolerance."""
    difference = value - bound
    if abs(difference) <= 4 * max(ulp(value), ulp(bound)):
        return 0.0
    return difference


def score_candidate(p, req: SearchRequest, *, generated=False):
    """Assess existing metrics; never map a saved baseline onto a new target."""
    p = dict(p)
    margins = {
        'charge_budget_khz': req.max_dispersion_khz - p['dispersion_upper_khz'],
        'anharmonicity_floor_mhz': bound_margin(p['anharmonicity_mhz'], req.min_anharmonicity_mhz),
        'ej_lower_ghz': bound_margin(p['ej_ghz'], req.ej_min_ghz),
        'ej_upper_ghz': bound_margin(req.ej_max_ghz, p['ej_ghz']),
        'ec_lower_ghz': bound_margin(p['ec_ghz'], req.ec_min_ghz),
        'ec_upper_ghz': bound_margin(req.ec_max_ghz, p['ec_ghz']),
        'ratio_lower': bound_margin(p['ratio'], req.ratio_min),
        'ratio_upper': bound_margin(req.ratio_max, p['ratio']),
    }
    if not all(isfinite(v) for v in margins.values()):
        raise ArithmeticError('Non-finite constraint margin; no valid result.')
    violations = [k for k, v in margins.items() if v < 0]
    # Compare on the original budget scale to avoid subtractive cancellation
    # accidentally rejecting a candidate exactly at the documented 1 Hz guard.
    if margins['charge_budget_khz'] >= 0 and bound_margin(
        req.max_dispersion_khz,
        p['dispersion_upper_khz'] + CHARGE_BUDGET_BUFFER_KHZ,
    ) < 0:
        violations.append('charge_budget_numerical_buffer')
    if p['alpha_mhz'] >= 0:
        violations.append('requires_negative_anharmonicity')
    frequency_error = abs(p['f01_ghz'] - req.target_ghz)
    if not isfinite(frequency_error):
        raise ArithmeticError('Non-finite frequency; no valid result.')
    margins['frequency_target_ghz'] = min(
        bound_margin(p['f01_ghz'], req.target_ghz - FREQUENCY_TOLERANCE_GHZ),
        bound_margin(req.target_ghz + FREQUENCY_TOLERANCE_GHZ, p['f01_ghz']),
    )
    if margins['frequency_target_ghz'] < 0:
        violations.append('frequency_lock_numerical_error' if generated else 'frequency_target_mismatch')
    if p['ng'] != 0:
        violations.append('design_reference_ng_mismatch')
    p.update({'candidate_id': candidate_id(p), 'margins': margins,
              'violations': violations, 'feasible': not violations})
    return p


def selection_evidence(candidates, selected):
    if selected is None:
        return {'kind': 'infeasible', 'higher_a_count': 0,
                'higher_a_rejections': [], 'selected_at_ratio_boundary': None}
    higher = [p for p in candidates if p['anharmonicity_mhz'] > selected['anharmonicity_mhz']]
    counts = Counter(reason for p in higher for reason in p['violations'])
    boundary = ('lower' if selected['margins']['ratio_lower'] == 0 else
                'upper' if selected['margins']['ratio_upper'] == 0 else None)
    return {
        'kind': 'higher_a_rejected' if higher else 'grid_boundary' if boundary else 'evaluated_maximum',
        'higher_a_count': len(higher),
        'higher_a_rejections': [{'reason': reason, 'count': count} for reason, count in sorted(counts.items())],
        'selected_at_ratio_boundary': boundary,
    }


def search(req: SearchRequest):
    start = perf_counter()
    candidates = []
    seen_ids = set()
    for ratio in np.linspace(req.ratio_min, req.ratio_max, req.points):
        e = levels(float(ratio), 1, 0, req.ncut)
        gap = float(e[1]-e[0])
        if not isfinite(gap) or gap <= 0:
            raise ArithmeticError('Invalid frequency-map gap; no valid result.')
        ec = req.target_ghz / gap
        ej = float(ratio)*ec
        p = score_candidate(metrics(ej, ec, 0, req.ncut), req, generated=True)
        if 'frequency_lock_numerical_error' in p['violations']:
            raise ArithmeticError('Generated candidate failed its frequency lock.')
        # Very narrow legal intervals can repeat representable floats. One
        # physical/numerical input has one ID, regardless of grid multiplicity.
        if p['candidate_id'] in seen_ids:
            continue
        seen_ids.add(p['candidate_id'])
        candidates.append(p)
    feasible = [p for p in candidates if p['feasible']]
    selected = max(feasible, key=lambda p:p['anharmonicity_mhz']) if feasible else None
    baseline_evaluation = None
    if req.baseline is not None:
        b = req.baseline
        baseline_evaluation = {
            'params': b.model_dump(),
            'assessment': score_candidate(metrics(b.ej_ghz, b.ec_ghz, b.ng, b.ncut), req),
        }
    return {
        'model': MODEL, 'model_version': MODEL_VERSION,
        'status': 'feasible' if selected else 'infeasible',
        'request': req.model_dump(), 'selected': selected,
        'candidates': candidates, 'evaluated_count': len(candidates),
        'feasible_count': len(feasible),
        'selection_rule': 'maximum negative-anharmonicity magnitude among feasible evaluated ratios',
        'optimality_scope': 'evaluated grid only',
        'dispersion_resolution_khz': DISPERSION_RESOLUTION_KHZ,
        'frequency_tolerance_ghz': FREQUENCY_TOLERANCE_GHZ,
        'charge_budget_buffer_khz': CHARGE_BUDGET_BUFFER_KHZ,
        'comparison_resolution_mhz': COMPARISON_RESOLUTION_MHZ,
        'baseline_evaluation': baseline_evaluation,
        'selection_evidence': selection_evidence(candidates, selected),
        'elapsed_ms': (perf_counter()-start)*1000,
    }
