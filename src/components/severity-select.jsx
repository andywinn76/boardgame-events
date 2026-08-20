'use client';

import { useState } from 'react';

const severityStyle = {
  '1': { backgroundColor: '#dcfce7', color: '#166534' },
  '2': { backgroundColor: '#fef9c3', color: '#713f12' },
  '3': { backgroundColor: '#fee2e2', color: '#991b1b' },
};

export function SeveritySelect({ id = 'severity', name = 'severity', defaultValue = '', className }) {
  const [value, setValue] = useState(String(defaultValue ?? ''));

  return (
    <select
      id={id}
      name={name}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      className={className}
      style={severityStyle[value]}
    >
      <option value="">Not set</option>
      <option value="1" className="bg-green-100 text-green-800">Mild</option>
      <option value="2" className="bg-yellow-100 text-yellow-900">Medium</option>
      <option value="3" className="bg-red-100 text-red-800">Severe</option>
    </select>
  );
}
