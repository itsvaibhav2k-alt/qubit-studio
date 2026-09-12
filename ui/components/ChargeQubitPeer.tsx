'use client';

import { useEffect, useState } from 'react';
import { DASH, dispersionDisplay, num } from '@/lib/format';
import { PARAMS } from '@/lib/params';
import type { DeviceParams, DeviceResult } from '@/lib/types';

interface ChargeQubitPeerProps {
  params: DeviceParams;
  result: DeviceResult;
  enabled: boolean;
}

/**
 * Second solver call at EJ = EC (ratio 1), same ng and ncut.
 * Shows why transmons exist: same charging energy, wildly different charge noise.
 */
export default function ChargeQubitPeer({ params, result, enabled }: ChargeQubitPeerProps) {
  const [peer, setPeer] = useState<DeviceResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ejPeer = Math.min(Math.max(params.ec_ghz, PARAMS.ej_ghz.min), PARAMS.ej_ghz.max);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch('/api/evaluate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ej_ghz: ejPeer,
            ec_ghz: params.ec_ghz,
            ng: params.ng,
            ncut: params.ncut,
          }),
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          if (!response.ok) throw new Error(`Compare solve failed (HTTP ${response.status}).`);
          setPeer((await response.json()) as DeviceResult);
          setError(null);
        }
      } catch (reason) {
        if (controller.signal.aborted) return;
        setPeer(null);
        setError(reason instanceof Error ? reason.message : String(reason));
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [enabled, ejPeer, params.ec_ghz, params.ng, params.ncut]);

  const thisDisp = dispersionDisplay(result);
  const peerDisp = dispersionDisplay(peer);

  return (
    <div className="physics-compare" data-tour="charge-peer">
      <h4>Same E_C, charge-qubit E_J</h4>
      <p className="cap">
        Extra solver run at E_J = E_C (ratio 1). Same charging energy, no extra invention — the quietness of a
        transmon is the point.
      </p>
      {error && <p className="empty">{error}</p>}
      <div className="compare-row">
        <span />
        <strong>This chip</strong>
        <strong>Charge qubit</strong>
        <span>E_J / E_C</span>
        <span>{num(result.ratio, 1)}</span>
        <span>{peer ? num(peer.ratio, 1) : DASH}</span>
        <span>f01</span>
        <span>{num(result.f01_ghz, 3)} GHz</span>
        <span>{peer ? `${num(peer.f01_ghz, 3)} GHz` : DASH}</span>
        <span>Charge wiggle</span>
        <span>{thisDisp.text}</span>
        <span>{peer ? peerDisp.text : DASH}</span>
      </div>
    </div>
  );
}
