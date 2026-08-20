'use client';

import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { updateConsideration, deleteConsideration } from '@/app/settings/actions';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const VISIBILITY_LABEL = {
  private: 'Private: just me',
  hosts_only: 'Hosts only',
  attendees: 'Attendees of shared events',
  public: 'Public',
};

const KIND_LABEL = {
  vision: 'Vision',
  hearing: 'Hearing',
  mobility: 'Mobility',
  allergy: 'Allergy',
  dietary: 'Dietary',
  sensory: 'Sensory',
  other: 'Other',
};

const SEVERITY = {
  1: { label: 'Mild', className: 'border-green-300 bg-green-100 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-300' },
  2: { label: 'Medium', className: 'border-yellow-300 bg-yellow-100 text-yellow-900 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-300' },
  3: { label: 'Severe', className: 'border-red-300 bg-red-100 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-300' },
};

const selectClass =
  'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30';

const iconButtonClass =
  'inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const severitySelectStyle = {
  '1': { backgroundColor: '#dcfce7', color: '#166534' },
  '2': { backgroundColor: '#fef9c3', color: '#713f12' },
  '3': { backgroundColor: '#fee2e2', color: '#991b1b' },
};

export function ConsiderationCard({ consideration }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    kind: consideration.kind,
    severity: consideration.severity == null ? '' : String(consideration.severity),
    label: consideration.label,
    details: consideration.details || '',
    visibility: consideration.visibility,
  });

  const changed =
    draft.kind !== consideration.kind ||
    draft.severity !== (consideration.severity == null ? '' : String(consideration.severity)) ||
    draft.label !== consideration.label ||
    draft.details !== (consideration.details || '') ||
    draft.visibility !== consideration.visibility;

  function toggleEditing() {
    if (!editing) {
      setDraft({
        kind: consideration.kind,
        severity: consideration.severity == null ? '' : String(consideration.severity),
        label: consideration.label,
        details: consideration.details || '',
        visibility: consideration.visibility,
      });
    }
    setEditing((value) => !value);
  }

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-foreground">{consideration.label}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary">{KIND_LABEL[consideration.kind] || consideration.kind}</Badge>
              <Badge variant="outline">{VISIBILITY_LABEL[consideration.visibility]}</Badge>
              {consideration.severity && (
                <Badge variant="outline" className={SEVERITY[consideration.severity].className}>
                  {SEVERITY[consideration.severity].label}
                </Badge>
              )}
            </div>
            {consideration.details && <p className="mt-1.5 text-sm text-muted-foreground">{consideration.details}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              aria-label={`Edit ${consideration.label}`}
              title="Edit consideration"
              aria-expanded={editing}
              className={iconButtonClass}
              onClick={toggleEditing}
            >
              <Pencil className="size-4" />
            </button>
            <form action={deleteConsideration}>
              <input type="hidden" name="id" value={consideration.id} />
              <button
                type="submit"
                aria-label={`Delete ${consideration.label}`}
                title="Delete consideration"
                className={`${iconButtonClass} hover:text-destructive`}
              >
                <Trash2 className="size-4" />
              </button>
            </form>
          </div>
        </div>

        {editing && (
          <form action={updateConsideration} className="space-y-4 border-t border-border pt-4">
            <input type="hidden" name="id" value={consideration.id} />
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor={`kind-${consideration.id}`}>Kind</Label>
                <select
                  id={`kind-${consideration.id}`}
                  name="kind"
                  value={draft.kind}
                  onChange={(event) => setDraft((value) => ({ ...value, kind: event.target.value }))}
                  className={selectClass}
                >
                  <option value="vision">Vision</option>
                  <option value="hearing">Hearing</option>
                  <option value="mobility">Mobility</option>
                  <option value="allergy">Allergy</option>
                  <option value="dietary">Dietary</option>
                  <option value="sensory">Sensory</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`severity-${consideration.id}`}>Severity</Label>
                <select
                  id={`severity-${consideration.id}`}
                  name="severity"
                  value={draft.severity}
                  onChange={(event) => setDraft((value) => ({ ...value, severity: event.target.value }))}
                  className={selectClass}
                  style={severitySelectStyle[draft.severity]}
                >
                  <option value="">Not set</option>
                  <option value="1" className="bg-green-100 text-green-800">Mild</option>
                  <option value="2" className="bg-yellow-100 text-yellow-900">Medium</option>
                  <option value="3" className="bg-red-100 text-red-800">Severe</option>
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`label-${consideration.id}`}>Label</Label>
              <Input
                id={`label-${consideration.id}`}
                name="label"
                required
                value={draft.label}
                onChange={(event) => setDraft((value) => ({ ...value, label: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`details-${consideration.id}`}>Details</Label>
              <Input
                id={`details-${consideration.id}`}
                name="details"
                value={draft.details}
                onChange={(event) => setDraft((value) => ({ ...value, details: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`visibility-${consideration.id}`}>Visibility</Label>
              <select
                id={`visibility-${consideration.id}`}
                name="visibility"
                value={draft.visibility}
                onChange={(event) => setDraft((value) => ({ ...value, visibility: event.target.value }))}
                className={selectClass}
              >
                <option value="private">Private: just me</option>
                <option value="hosts_only">Hosts only</option>
                <option value="attendees">Attendees of shared events</option>
                <option value="public">Public</option>
              </select>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={!changed}>Save changes</Button>
              <Button type="button" variant="ghost" disabled={!changed} onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
