"""Bounded simplified-transmon calculations. No real-device prediction."""
import os
os.environ.setdefault('MPLBACKEND', 'Agg')

from time import perf_counter
import numpy as np
import scqubits as scq
from pydantic import BaseModel, ConfigDict, Field, model_validator

DISPERSION_RESOLUTION_KHZ = 0.001  # proposed 1 Hz reporting/selection floor


class Request(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)


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

    @model_validator(mode='after')
    def ordered_bounds(self):
        for lo, hi in [('ratio_min','ratio_max'), ('ej_min_ghz','ej_max_ghz'), ('ec_min_ghz','ec_max_ghz')]:
            if getattr(self, lo) >= getattr(self, hi):
                raise ValueError(f'{lo} must be smaller than {hi}')
        return self


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
        'model': 'isolated-transmon', 'model_version': 'v1',
        'ncut': req.ncut, 'charge_response': curve,
        'dispersion_resolution_khz': DISPERSION_RESOLUTION_KHZ,
        'elapsed_ms': (perf_counter()-start)*1000,
    })
    return result


def search(req: SearchRequest):
    start = perf_counter()
    candidates = []
    for ratio in np.linspace(req.ratio_min, req.ratio_max, req.points):
        e = levels(float(ratio), 1, 0, req.ncut)
        ec = req.target_ghz / float(e[1]-e[0])
        ej = float(ratio)*ec
        p = metrics(ej, ec, 0, req.ncut)
        p['ratio'] = float(ratio)
        margins = {
            'charge_budget_khz': req.max_dispersion_khz - p['dispersion_upper_khz'],
            'anharmonicity_floor_mhz': p['anharmonicity_mhz'] - req.min_anharmonicity_mhz,
            'ej_lower_ghz': ej - req.ej_min_ghz,
            'ej_upper_ghz': req.ej_max_ghz - ej,
            'ec_lower_ghz': ec - req.ec_min_ghz,
            'ec_upper_ghz': req.ec_max_ghz - ec,
        }
        violations = [k for k,v in margins.items() if v < 0]
        if 0 <= margins['charge_budget_khz'] < DISPERSION_RESOLUTION_KHZ:
            violations.append('charge_budget_numerical_buffer')
        if p['alpha_mhz'] >= 0:
            violations.append('requires_negative_anharmonicity')
        if abs(p['f01_ghz']-req.target_ghz) > 1e-9:
            violations.append('frequency_lock_numerical_error')
        p.update({'margins': margins, 'violations': violations, 'feasible': not violations})
        candidates.append(p)
    feasible = [p for p in candidates if p['feasible']]
    selected = max(feasible, key=lambda p:p['anharmonicity_mhz']) if feasible else None
    return {
        'model': 'isolated-transmon', 'model_version': 'v1',
        'status': 'feasible' if selected else 'infeasible',
        'request': req.model_dump(), 'selected': selected,
        'candidates': candidates, 'evaluated_count': len(candidates),
        'feasible_count': len(feasible),
        'selection_rule': 'maximum negative-anharmonicity magnitude among feasible evaluated ratios',
        'optimality_scope': 'evaluated grid only',
        'dispersion_resolution_khz': DISPERSION_RESOLUTION_KHZ,
        'elapsed_ms': (perf_counter()-start)*1000,
    }
