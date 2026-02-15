/**
 * @file CronBuilder.jsx
 * @description Visual cron expression builder - no syntax knowledge needed!
 *
 * Converts user-friendly options into cron expressions.
 */

import React, { useState } from 'react';
import { Clock, Calendar } from 'lucide-react';

export default function CronBuilder({ value, onChange }) {
  const [scheduleType, setScheduleType] = useState('simple');
  const [simpleSchedule, setSimpleSchedule] = useState({
    frequency: 'hourly',
    interval: 1,
    time: '09:00',
    day: 'monday',
  });

  const frequencies = [
    { value: 'minute', label: 'Every X minutes', cron: (interval) => `*/${interval} * * * *` },
    { value: 'hourly', label: 'Every hour', cron: () => '0 * * * *' },
    { value: 'daily', label: 'Daily at', cron: (time) => `${time.split(':')[1]} ${time.split(':')[0]} * * *` },
    { value: 'weekly', label: 'Weekly on', cron: (time, day) => {
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const dayNum = days.indexOf(day.toLowerCase());
      return `${time.split(':')[1]} ${time.split(':')[0]} * * ${dayNum}`;
    }},
    { value: 'monthly', label: 'Monthly on day', cron: (time, day) => `${time.split(':')[1]} ${time.split(':')[0]} ${day} * *` },
  ];

  const handleSimpleChange = (field, value) => {
    const updated = { ...simpleSchedule, [field]: value };
    setSimpleSchedule(updated);

    // Generate cron expression
    const freq = frequencies.find(f => f.value === updated.frequency);
    let cronExpr = '';

    switch (updated.frequency) {
      case 'minute':
        cronExpr = `*/${updated.interval} * * * *`;
        break;
      case 'hourly':
        cronExpr = '0 * * * *';
        break;
      case 'daily':
        cronExpr = freq.cron(updated.time);
        break;
      case 'weekly':
        cronExpr = freq.cron(updated.time, updated.day);
        break;
      case 'monthly':
        cronExpr = freq.cron(updated.time, updated.interval);
        break;
    }

    onChange(cronExpr);
  };

  return (
    <div className="space-y-4">
      {/* Schedule Type Toggle */}
      <div className="flex gap-2 p-1 bg-bg-elevated rounded-lg">
        <button
          onClick={() => setScheduleType('simple')}
          className={`flex-1 px-4 py-2 rounded text-sm font-medium transition-colors ${
            scheduleType === 'simple'
              ? 'bg-accent-primary text-bg-primary'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          <Clock size={14} className="inline mr-2" />
          Simple
        </button>
        <button
          onClick={() => setScheduleType('advanced')}
          className={`flex-1 px-4 py-2 rounded text-sm font-medium transition-colors ${
            scheduleType === 'advanced'
              ? 'bg-accent-primary text-bg-primary'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          <Calendar size={14} className="inline mr-2" />
          Advanced
        </button>
      </div>

      {scheduleType === 'simple' ? (
        /* Simple Schedule Builder */
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Frequency
            </label>
            <select
              value={simpleSchedule.frequency}
              onChange={(e) => handleSimpleChange('frequency', e.target.value)}
              className="w-full px-3 py-2 bg-bg-elevated border border-border rounded-lg text-sm text-text-primary"
            >
              {frequencies.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>

          {simpleSchedule.frequency === 'minute' && (
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Every X minutes
              </label>
              <input
                type="number"
                min="1"
                max="59"
                value={simpleSchedule.interval}
                onChange={(e) => handleSimpleChange('interval', parseInt(e.target.value))}
                className="w-full px-3 py-2 bg-bg-elevated border border-border rounded-lg text-sm text-text-primary"
              />
            </div>
          )}

          {(simpleSchedule.frequency === 'daily' || simpleSchedule.frequency === 'weekly' || simpleSchedule.frequency === 'monthly') && (
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Time
              </label>
              <input
                type="time"
                value={simpleSchedule.time}
                onChange={(e) => handleSimpleChange('time', e.target.value)}
                className="w-full px-3 py-2 bg-bg-elevated border border-border rounded-lg text-sm text-text-primary"
              />
            </div>
          )}

          {simpleSchedule.frequency === 'weekly' && (
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Day of Week
              </label>
              <select
                value={simpleSchedule.day}
                onChange={(e) => handleSimpleChange('day', e.target.value)}
                className="w-full px-3 py-2 bg-bg-elevated border border-border rounded-lg text-sm text-text-primary"
              >
                <option value="monday">Monday</option>
                <option value="tuesday">Tuesday</option>
                <option value="wednesday">Wednesday</option>
                <option value="thursday">Thursday</option>
                <option value="friday">Friday</option>
                <option value="saturday">Saturday</option>
                <option value="sunday">Sunday</option>
              </select>
            </div>
          )}

          {simpleSchedule.frequency === 'monthly' && (
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Day of Month
              </label>
              <input
                type="number"
                min="1"
                max="31"
                value={simpleSchedule.interval}
                onChange={(e) => handleSimpleChange('interval', parseInt(e.target.value))}
                className="w-full px-3 py-2 bg-bg-elevated border border-border rounded-lg text-sm text-text-primary"
              />
            </div>
          )}

          <div className="p-3 bg-bg-elevated rounded-lg border border-border">
            <div className="text-xs text-text-muted mb-1">Generated Expression:</div>
            <div className="font-mono text-sm text-accent-primary">{value || '* * * * *'}</div>
          </div>
        </div>
      ) : (
        /* Advanced - Manual Cron Expression */
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">
            Cron Expression (5-field)
          </label>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="0 9 * * 1-5"
            className="w-full px-3 py-2 bg-bg-elevated border border-border rounded-lg text-sm font-mono text-text-primary"
          />
          <p className="text-xs text-text-muted mt-2">
            Format: <code>minute hour day month day-of-week</code>
            <br />
            Example: <code>0 9 * * 1-5</code> = Every weekday at 9:00 AM
          </p>
        </div>
      )}
    </div>
  );
}
