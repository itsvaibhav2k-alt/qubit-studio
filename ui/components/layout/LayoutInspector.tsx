'use client';
import type { ComponentProps } from 'react';
import { ArrowLeft, Info, LockKeyhole, ScanSearch } from 'lucide-react';
import type Inspector from '@/components/Inspector';
import ParamField from '@/components/ParamField';
import DesignLab from '@/components/DesignLab';
import MaterialSensitivity from '@/components/MaterialSensitivity';
import { INSPECTIONS } from '@/lib/layout-inspection';
import { PARAMS } from '@/lib/params';
import { PART_BY_ID } from '@/lib/parts';
import { num } from '@/lib/format';
import type { DeviceParams } from '@/lib/types';

type Props = ComponentProps<typeof Inspector> & {
  readOnly: boolean;
  candidate: DeviceParams | null;
  candidateCurrent: boolean;
  inspecting: boolean;
  onInspect: () => void;
  solverOpen: boolean;
  onSolverOpen: (open: boolean) => void;
};
const copy = {
  board:{name:'Carrier board',id:'PCB',role:'The carrier supports the chip and its bond contacts. It adds no electrical input to this model.',label:''},
  package:{name:'Package & clamps',id:'PKG',role:'The machined frame and clamps hold the assembly. Use Exploded in the 3D pane to see the stack.',label:''},
  junction: { name:'Josephson junction', id:'JJ1', role:'Controls the nonlinearity of this simplified circuit.', label:'Josephson energy' },
  capacitor: { name:'Capacitor pads', id:'C1', role:'Sets the charging energy of this simplified circuit. Both pads share this parameter.', label:'Charging energy' },
  gate: { name:'Charge gate', id:'G1', role:'Sets the offset charge on the transmon island.', label:'Offset charge' },
  ground: { name:'Ground metal', id:'GND', role:'Surrounding metal with openings that expose the continuous substrate beneath. These are not holes through the chip.', label:'' },
  substrate: { name:'Substrate', id:'SUB', role:'The continuous base underneath the metal. Geometry and material appearance are illustrative.', label:'' },
};

export default function LayoutInspector(props: Props) {
  const { selected, params, result, readOnly, candidate, candidateCurrent, inspecting, onInspect, onChange, solverOpen, onSolverOpen }=props;
  const part = selected ? PART_BY_ID[selected] : null;
  const text = selected ? copy[selected] : null;
  const inspectedParams = readOnly && candidate ? candidate : params;
  return <div className="layout-inspector">
    <section className="layout-editor" aria-label="Selected component inspector">
      <div className="layout-component-id">{text?.id ?? 'SELECT A COMPONENT'}</div>
      <h1>{text?.name ?? 'Explore the chip'}</h1>
      <p className="layout-component-role">{text?.role ?? 'Select a component in the layout or circuit to inspect its model parameter.'}</p>
      {readOnly && <p className="layout-readonly"><LockKeyhole size={15}/>{candidate ? `${candidateCurrent?'Candidate':'Outdated candidate'} values · read only` : 'Applied device · read only in Design'}</p>}
      {part?.param && <div className="layout-primary-field"><ParamField key={`${part.param}-${readOnly?'design':'explore'}`} paramKey={part.param} value={inspectedParams[part.param]} onChange={onChange} disabled={readOnly} label={text?.label}/><div className="layout-field-bounds"><span>{PARAMS[part.param].min}</span><span>{PARAMS[part.param].max} {PARAMS[part.param].unit}</span></div></div>}
      {selected && <button className="btn primary layout-inspect-action" onClick={onInspect}>{inspecting?<ArrowLeft size={18}/>:<ScanSearch size={18}/>} {inspecting?'Return to full chip':INSPECTIONS[selected].action}</button>}
      {!part?.modeled && part && <p className="layout-context-note">Context only · no editable model input.</p>}
      <div className="layout-editor-footer"><span><Info size={14}/> Effective model parameters</span><details className="tech"><summary>More detail</summary><div className="body">
        {part?.param && <p>{PARAMS[part.param].meaning}</p>}
        <p>Geometry is illustrative. Editing energy values does not resize the pads or calculate a new capacitance from their shape.</p>
        {selected==='junction' && <p>The enlarged overlap identifies the weak link between the two electrodes. The junction detail is exaggerated for legibility.</p>}
        <p>EJ/h {num(inspectedParams.ej_ghz,2)} GHz · EC/h {num(inspectedParams.ec_ghz,3)} GHz · ng {num(inspectedParams.ng,3)}</p>
        <details className="tech"><summary>Materials & sensitivity</summary><MaterialSensitivity session={props.session} params={params} result={result} onApply={props.onApplyMaterialScenario} onMaterialsChange={props.onMaterialsChange} topMaterial={props.materials.topMaterial} baseMaterial={props.materials.baseMaterial}/></details>
        <div className="row-actions"><button className="btn" disabled={props.selectedTopics.size===0} onClick={props.onAskLlm}>Ask AI about selection ({props.selectedTopics.size})</button><button className="btn" disabled={props.selectedTopics.size===0} onClick={props.onClearTopics}>Clear AI selection</button></div>
      </div></details></div>
    </section>
    <details className="layout-solver tech" open={solverOpen} onToggle={event=>onSolverOpen(event.currentTarget.open)}>
      <summary>Solver settings</summary><div className="body"><ParamField paramKey="ncut" value={params.ncut} onChange={onChange} disabled={readOnly}/><p>{PARAMS.ncut.meaning}</p>{readOnly&&<p>Return to Explore to change numerical settings.</p>}</div>
    </details>
    {readOnly && <section className="layout-design-tools" aria-label="Existing Design workflow">
      {candidate && <p className="layout-candidate-scope">The inspector shows the {candidateCurrent?'current':'outdated'} recommendation. The chip and results remain the applied device until you choose “Use variables + materials”.</p>}
      <DesignLab session={props.session} params={params} goals={props.goals} onGoalsChange={props.onGoalsChange} onApply={props.onApplyMaterialScenario} onMaterialsChange={props.onMaterialsChange} currentMaterials={props.materials}/>
    </section>}
  </div>;
}
