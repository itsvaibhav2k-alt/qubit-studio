"""Local frontend integration API. Not production hardened/deployed."""
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from engine import (
    DeviceRequest,
    MaterialScenarioRequest,
    SearchRequest,
    StressRequest,
    TunableDeviceRequest,
    evaluate,
    evaluate_tunable,
    material_scenario,
    search,
    stress_test,
)

app = FastAPI(title='Qubit Studio simulation', version='0.1.0')
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get('CORS_ORIGINS','http://localhost:3000,http://127.0.0.1:3000').split(','),
    allow_methods=['GET','POST'], allow_headers=['Content-Type'],
)

@app.get('/health')
def health():
    return {'status':'ok', 'model':'isolated-transmon', 'version':'0.1.0'}

@app.post('/evaluate')
def evaluate_device(request: DeviceRequest):
    return evaluate(request)

@app.post('/search')
def search_devices(request: SearchRequest):
    return search(request)


@app.post('/material-scenario')
def compare_material_scenario(request: MaterialScenarioRequest):
    return material_scenario(request)


@app.post('/stress')
def stress_device(request: StressRequest):
    return stress_test(request)


@app.post('/evaluate-tunable')
def evaluate_tunable_device(request: TunableDeviceRequest):
    return evaluate_tunable(request)
