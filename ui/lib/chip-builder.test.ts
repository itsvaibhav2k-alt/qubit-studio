import assert from 'node:assert/strict';
import test from 'node:test';
import { BUILDER_DESIGN_PRESETS, BUILDER_TEMPLATES, EMPTY_BUILDER_DESIGN, createBuilderPart, createPresetDesign, createStarterDesign, designToSvg, designWarnings, portPoint, replaceBuilderPart, replacementTemplatesForPart, snap, validBuilderDesign } from './chip-builder.ts';

test('chip builder snaps values and creates catalog parts', () => {
  assert.equal(snap(117, 10), 120);
  const part = createBuilderPart(BUILDER_TEMPLATES[0], 0);
  assert.equal(part.role, 'capacitor');
  assert.equal(part.custom, false);
});

test('rotated part ports follow the component', () => {
  const part = { ...createBuilderPart(BUILDER_TEMPLATES[0], 0), x: 100, y: 100, width: 40, rotation: 90 };
  const port = portPoint(part, 1);
  assert.ok(Math.abs(port.x - 100) < 1e-8);
  assert.ok(Math.abs(port.y - 120) < 1e-8);
});

test('builder validation, warnings and SVG export stay explicit', () => {
  assert.equal(validBuilderDesign(EMPTY_BUILDER_DESIGN), true);
  assert.ok(designWarnings(EMPTY_BUILDER_DESIGN).length >= 2);
  const svg = designToSvg({ ...EMPTY_BUILDER_DESIGN, name: '<chip>' });
  assert.match(svg, /^<svg/);
  assert.match(svg, /&lt;chip&gt;/);
});

test('starter layout is valid and immediately model-ready', () => {
  const starter = createStarterDesign();
  assert.equal(validBuilderDesign(starter), true);
  assert.ok(starter.parts.some(part => part.role === 'junction'));
  assert.ok(starter.parts.some(part => part.role === 'capacitor'));
  assert.equal(starter.connections.length, 2);
});

test('Myla replacements keep a piece in place and preserve compatible links', () => {
  const starter = createStarterDesign();
  const pad = starter.parts.find(part => part.id === 'starter-left-pad')!;
  assert.ok(replacementTemplatesForPart(pad).some(template => template.id === 'stepped-pad'));

  const replaced = replaceBuilderPart(starter, pad.id, 'stepped-pad');
  const nextPad = replaced.parts.find(part => part.id === pad.id)!;
  assert.equal(nextPad.templateId, 'stepped-pad');
  assert.equal(nextPad.x, pad.x);
  assert.equal(nextPad.y, pad.y);
  assert.equal(nextPad.rotation, pad.rotation);
  assert.equal(nextPad.areaUm2, pad.areaUm2);
  assert.equal(replaced.connections.length, starter.connections.length);
  assert.equal(validBuilderDesign(replaced), true);
});

test('pre-existing chip library designs contain valid reusable pieces', () => {
  assert.equal(BUILDER_DESIGN_PRESETS.length, 4);
  for (const preset of BUILDER_DESIGN_PRESETS) {
    const design = createPresetDesign(preset.id);
    assert.equal(validBuilderDesign(design), true, preset.name);
    assert.ok(design.parts.length >= 4, preset.name);
    assert.ok(design.parts.some(part => part.role === 'junction'), preset.name);
    assert.ok(design.parts.some(part => part.role === 'capacitor'), preset.name);
    for (const connection of design.connections) {
      const from = design.parts.find(part => part.id === connection.from.partId)!;
      const to = design.parts.find(part => part.id === connection.to.partId)!;
      assert.ok(connection.from.port < from.ports, `${preset.name} from port`);
      assert.ok(connection.to.port < to.ports, `${preset.name} to port`);
    }
  }
});
