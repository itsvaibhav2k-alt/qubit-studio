import numpy as np
import pytest
from fastapi.testclient import TestClient
from engine import DeviceRequest, SearchRequest, evaluate, search
from api import app


def test_official_reference():
    out = evaluate(DeviceRequest(ej_ghz=30, ec_ghz=1.2, ng=0.3, ncut=31))
    assert np.allclose(out['raw_levels_ghz'][:3], [-21.82665096, -6.16372350, 8.01931750], atol=1e-6, rtol=0)
    assert out['alpha_mhz'] < 0
    assert out['f01_ghz'] > out['f12_ghz'] > 0
    assert out['alpha_mhz'] == pytest.approx((out['f12_ghz'] - out['f01_ghz']) * 1000)


def test_frequency_lock_and_selection():
    req = SearchRequest(points=101)
    out = search(req)
    eligible = [p for p in out['candidates'] if p['feasible']]
    assert eligible
    assert out['selected']['anharmonicity_mhz'] == max(p['anharmonicity_mhz'] for p in eligible)
    for p in out['candidates']:
        assert p['f01_ghz'] == pytest.approx(req.target_ghz, abs=1e-9)
        assert p['ej_ghz'] / p['ec_ghz'] == pytest.approx(p['ratio'])


def test_stricter_requirement_and_infeasibility():
    loose = search(SearchRequest(points=101, max_dispersion_khz=10))
    tight = search(SearchRequest(points=101, max_dispersion_khz=1))
    assert {p['ratio'] for p in tight['candidates'] if p['feasible']} <= {p['ratio'] for p in loose['candidates'] if p['feasible']}
    if tight['selected']:
        assert tight['selected']['anharmonicity_mhz'] <= loose['selected']['anharmonicity_mhz']
    impossible = search(SearchRequest(points=51, min_anharmonicity_mhz=2000))
    assert impossible['status'] == 'infeasible'
    assert impossible['selected'] is None
    assert all(p['violations'] for p in impossible['candidates'])


def test_cutoff_and_charge_shortcut():
    a = evaluate(DeviceRequest(ej_ghz=15, ec_ghz=0.3, ncut=30))
    b = evaluate(DeviceRequest(ej_ghz=15, ec_ghz=0.3, ncut=40))
    assert a['f01_ghz'] == pytest.approx(b['f01_ghz'], abs=1e-7)
    assert a['alpha_mhz'] == pytest.approx(b['alpha_mhz'], abs=1e-4)
    f = [v['f01_ghz'] for v in a['charge_response']]
    assert a['dispersion_khz'] == pytest.approx((max(f)-min(f))*1e6, abs=0.001)


def test_http_contract_and_invalid_inputs():
    with TestClient(app) as c:
        assert c.get('/health').json()['status'] == 'ok'
        res = c.post('/evaluate', json={'ej_ghz':15,'ec_ghz':0.3})
        assert res.status_code == 200
        assert len(res.json()['charge_response']) == 101
        res = c.post('/search', json={'points':51})
        assert res.status_code == 200
        assert res.json()['selected'] is not None
        for payload in [{'ec_ghz':0}, {'ej_ghz':-1}, {'ncut':10000}, {'ej_ghz':'NaN'}, {'fake':1}]:
            assert c.post('/evaluate', json=payload).status_code == 422
        for payload in [{'points':100000}, {'target_ghz':0}, {'ratio_min':80,'ratio_max':20}, {'ej_min_ghz':40,'ej_max_ghz':5}]:
            assert c.post('/search', json=payload).status_code == 422
