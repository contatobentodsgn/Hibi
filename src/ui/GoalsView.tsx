 import React, { useState } from 'react';
 import type { Goal, StudyData } from '../domain/models';

 type GoalChanges = Partial<Omit<Goal, 'id'>>;
 type Props = {
   data: StudyData;
   onCreate: (title: string, target: number, unit?: string) => void;
   onProgress: (id: string, current: number) => void;
   onUpdate: (id: string, changes: GoalChanges) => void;
   onDelete: (id: string) => void;
 };

 type GoalDraft = { title: string; target: string; unit: string };
 const emptyDraft = (): GoalDraft => ({ title: '', target: '10', unit: '' });

 export function GoalsView({ data, onCreate, onProgress, onUpdate, onDelete }: Props) {
   const [creating, setCreating] = useState(true);
   const [newGoal, setNewGoal] = useState<GoalDraft>(emptyDraft);
   const [editingId, setEditingId] = useState<string | null>(null);
   const [editGoal, setEditGoal] = useState<GoalDraft>(emptyDraft);
   const [progressId, setProgressId] = useState<string | null>(null);
   const [progressValue, setProgressValue] = useState('');

   const submitNewGoal = (event: React.FormEvent<HTMLFormElement>) => {
     event.preventDefault();
     const title = newGoal.title.trim();
     const target = Number(newGoal.target);
     if (!title || !Number.isFinite(target) || target <= 0) return;
     onCreate(title, target, newGoal.unit.trim() || undefined);
     setNewGoal(emptyDraft());
     setCreating(false);
   };

   const startEditing = (goal: Goal) => {
     setEditingId(goal.id);
     setEditGoal({ title: goal.title, target: String(goal.target), unit: goal.unit ?? '' });
   };

   const submitEdit = (event: React.FormEvent<HTMLFormElement>, goal: Goal) => {
     event.preventDefault();
     const title = editGoal.title.trim();
     const target = Number(editGoal.target);
     if (!title || !Number.isFinite(target) || target <= 0) return;
     onUpdate(goal.id, { title, target, unit: editGoal.unit.trim() || undefined });
     setEditingId(null);
   };

   const submitProgress = (event: React.FormEvent<HTMLFormElement>, goal: Goal) => {
     event.preventDefault();
     const current = Number(progressValue);
     if (!Number.isFinite(current)) return;
     onProgress(goal.id, current);
     setProgressId(null);
   };

   return <div className="view goals-view">
     <div className="view-heading"><div><p className="eyebrow">DIRECTION LAYER</p><h1>Goals</h1><p className="muted">{data.goals.length} goals · make progress visible</p></div><button className="primary" onClick={() => { setCreating(!creating); setNewGoal(emptyDraft()); }}>{creating ? 'Cancel' : '+ New goal'}</button></div>
     {creating && <form className="quick-input" aria-label="Create goal" onSubmit={submitNewGoal}>
       <label htmlFor="new-goal-title">Goal title</label><input id="new-goal-title" aria-label="New goal title" value={newGoal.title} onChange={(event) => setNewGoal({ ...newGoal, title: event.target.value })} required autoFocus />
       <label htmlFor="new-goal-target">Target</label><input id="new-goal-target" name="target" type="number" min="0.01" step="any" value={newGoal.target} onChange={(event) => setNewGoal({ ...newGoal, target: event.target.value })} required />
       <label htmlFor="new-goal-unit">Unit</label><input id="new-goal-unit" value={newGoal.unit} onChange={(event) => setNewGoal({ ...newGoal, unit: event.target.value })} />
       <button className="primary" type="submit">Add goal</button>
     </form>}
     <section className="list-card">{data.goals.map((goal) => {
       const percent = Math.min(100, Math.round((goal.current / Math.max(goal.target, 1)) * 100));
       const completed = goal.status === 'completed' || goal.current >= goal.target;
       return <React.Fragment key={goal.id}>
         <div className="goal-row">
           {editingId === goal.id ? <form className="goal-copy" aria-label={`Edit ${goal.title}`} onSubmit={(event) => submitEdit(event, goal)}>
             <label htmlFor={`edit-goal-title-${goal.id}`}>Goal title</label><input id={`edit-goal-title-${goal.id}`} value={editGoal.title} onChange={(event) => setEditGoal({ ...editGoal, title: event.target.value })} required />
             <label htmlFor={`edit-goal-target-${goal.id}`}>Target</label><input id={`edit-goal-target-${goal.id}`} name="target" type="number" min="0.01" step="any" value={editGoal.target} onChange={(event) => setEditGoal({ ...editGoal, target: event.target.value })} required />
             <label htmlFor={`edit-goal-unit-${goal.id}`}>Unit</label><input id={`edit-goal-unit-${goal.id}`} value={editGoal.unit} onChange={(event) => setEditGoal({ ...editGoal, unit: event.target.value })} />
             <div className="heading-actions"><button className="primary" type="submit">Save</button><button className="outline" type="button" onClick={() => setEditingId(null)}>Cancel</button></div>
           </form> : <div className="goal-copy"><div className="goal-title"><strong>{goal.title}</strong>{completed && <span className="pill green">Complete</span>}</div><span>{goal.current} / {goal.target}{goal.unit ? ` ${goal.unit}` : ''}</span><div className="entity-progress"><span style={{ width: `${percent}%` }} /></div></div>}
           {editingId !== goal.id && <><button className="outline compact-action" aria-label={`Set progress for ${goal.title}`} onClick={() => { setProgressId(goal.id); setProgressValue(String(goal.current)); }}>Set progress</button><button className="primary compact-action" aria-label={`Advance ${goal.title}`} onClick={() => onProgress(goal.id, goal.current + 1)} disabled={completed}>+1</button><button className="icon-button" aria-label={`Edit ${goal.title}`} onClick={() => startEditing(goal)}>✎</button><button className="icon-button" aria-label={`Delete ${goal.title}`} onClick={() => onDelete(goal.id)}>×</button></>}
         </div>
         {progressId === goal.id && <form className="quick-input" aria-label={`Set progress for ${goal.title}`} onSubmit={(event) => submitProgress(event, goal)}><label htmlFor={`progress-${goal.id}`}>Current progress</label><input id={`progress-${goal.id}`} type="number" min="0" step="any" max={goal.target} value={progressValue} onChange={(event) => setProgressValue(event.target.value)} required /><button className="primary" type="submit">Save</button><button className="outline" type="button" onClick={() => setProgressId(null)}>Cancel</button></form>}
       </React.Fragment>;
     })}{!data.goals.length && <div className="empty-state"><strong>No goals yet</strong><span>Choose an outcome worth moving toward and track it here.</span></div>}</section>
   </div>;
}
