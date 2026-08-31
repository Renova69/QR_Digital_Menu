// GSM-7 extension characters consume two septets. Any other character uses
// UCS-2, where a concatenated SMS carries 67 UTF-16 code units per segment.
// This is an estimate until the provider reports the actual segment count.
const GSM_7_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\u001bÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM_7_EXTENSION = '^{}\\[~]|€';

const GSM_7_BASIC_SET = new Set(GSM_7_BASIC);
const GSM_7_EXTENSION_SET = new Set(GSM_7_EXTENSION);

export type SmsSegmentEstimate = {
  encoding: 'GSM_7' | 'UCS_2';
  segments: number;
  units: number;
};

export function estimateSmsSegments(text: string): SmsSegmentEstimate {
  let septets = 0;
  let gsm7 = true;
  for (const character of text) {
    if (GSM_7_BASIC_SET.has(character)) septets += 1;
    else if (GSM_7_EXTENSION_SET.has(character)) septets += 2;
    else {
      gsm7 = false;
      break;
    }
  }

  if (gsm7) {
    return {
      encoding: 'GSM_7',
      units: septets,
      segments: Math.max(1, Math.ceil(septets / (septets <= 160 ? 160 : 153))),
    };
  }

  const codeUnits = text.length;
  return {
    encoding: 'UCS_2',
    units: codeUnits,
    segments: Math.max(1, Math.ceil(codeUnits / (codeUnits <= 70 ? 70 : 67))),
  };
}
