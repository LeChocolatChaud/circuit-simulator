import type { ComponentKind } from '../model/types';
export function Symbol({ kind }: { kind: ComponentKind }) {
  if (kind === 'opamp')
    return (
      <g>
        <path d="M-48-23H-30M-48 23H-30M32 0H48M0 18V40" />
        <path d="M-30-40L34 0-30 40Z" className="symbol-fill" />
        <path d="M-23-22h12m-6-6v12m-6 30h12" />
      </g>
    );
  return (
    <g>
      <path d="M-48 0H-29M29 0H48" />
      {kind === 'resistor' && (
        <path d="M-29 0l6-10 9 20 9-20 9 20 9-20 9 20 7-10" />
      )}
      {kind === 'capacitor' && (
        <>
          <path d="M-29 0H-7M7 0H29M-7-21V21M7-21V21" />
        </>
      )}
      {kind === 'inductor' && (
        <path d="M-29 0c0-23 15-23 15 0c0-23 15-23 15 0c0-23 15-23 15 0c0-23 13-23 13 0" />
      )}
      {(kind === 'voltage_source' || kind === 'current_source') && (
        <circle r="29" className="symbol-fill" />
      )}
      {['vcvs', 'vccs', 'ccvs', 'cccs'].includes(kind) && (
        <path d="M-29 0L0-29 29 0 0 29Z" className="symbol-fill" />
      )}
      {['voltage_source', 'vcvs', 'ccvs'].includes(kind) && (
        <path d="M-18 0h12m-6-6v12M8 0h12" />
      )}
      {['current_source', 'vccs', 'cccs'].includes(kind) && (
        <path d="M-15 0H15M6-7l9 7-9 7" />
      )}
    </g>
  );
}
