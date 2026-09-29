const STATE_CODES: Record<string, string> = {
  'andhra pradesh': 'AP',
  telangana: 'TS',
  karnataka: 'KA',
  'tamil nadu': 'TN',
  kerala: 'KL',
  maharashtra: 'MH',
  odisha: 'OD',
  'uttar pradesh': 'UP',
  'madhya pradesh': 'MP',
  gujarat: 'GJ',
  rajasthan: 'RJ',
  'west bengal': 'WB',
  bihar: 'BR',
  punjab: 'PB',
  haryana: 'HR',
  delhi: 'DL',
};

export const stateCode = (state: string) =>
  STATE_CODES[state.trim().toLowerCase()] ?? state.trim().slice(0, 2).toUpperCase();

/** "Tanuku, AP" */
export const locality = (a: { villageTown: string; state: string }) =>
  [a.villageTown, a.state && stateCode(a.state)].filter(Boolean).join(', ');
