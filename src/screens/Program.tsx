import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { repo } from '../data';
import { today } from '../data/dates';
import type { ClientTask } from '../data/types';
import { t } from '../i18n';
import { Card, ProgressBar, ScreenHeader, SwitchRow, useDatePicker } from '../ui/components';
import { pretty, taskEmoji, taskTag, taskTitle } from '../ui/format';
import { Icon } from '../ui/icons';
import { goBack, paths } from '../ui/router';
import { setSetting, useSetting } from '../ui/settings';

/** Done first (keeping the user's order inside each group), or simply the user's order. */
const displayOrder = (tasks: ClientTask[], doneFirst: boolean) =>
  doneFirst ? [...tasks].sort((a, b) => Number(b.done) - Number(a.done) || a.position - b.position) : tasks;

export function ProgramScreen({ clientId }: { clientId: number }) {
  const client = useLiveQuery(() => repo.getClient(clientId), [clientId]);
  const dbTasks = useLiveQuery(() => repo.tasksFor(clientId), [clientId]);
  const doneFirst = useSetting('tasksDoneFirst');

  // Local copy that moves live while dragging; saved to the database when the finger lifts.
  const [display, setDisplay] = useState<ClientTask[]>([]);
  const [drag, setDrag] = useState<{ id: number; offset: number } | null>(null);
  const rows = useRef(new Map<number, HTMLDivElement>());
  const dragState = useRef<{ id: number; startY: number; shift: number; list: ClientTask[] } | null>(null);
  const [dateFor, setDateFor] = useState<ClientTask | null>(null);
  const datePicker = useDatePicker((date) => dateFor && repo.setTaskDate(dateFor, date));

  useEffect(() => {
    repo.ensureTasks(clientId);
  }, [clientId]);

  useEffect(() => {
    if (dbTasks && !dragState.current) setDisplay(displayOrder(dbTasks, doneFirst));
  }, [dbTasks, doneFirst]);

  const tasks = dbTasks ?? [];
  const doneCount = tasks.filter((x) => x.done).length;
  const progress = tasks.length ? doneCount / tasks.length : 0;

  // ---- Drag to reorder (by the ≡ handle) ----
  function onDragStart(e: ReactPointerEvent, task: ClientTask) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragState.current = { id: task.id!, startY: e.clientY, shift: 0, list: display };
    setDrag({ id: task.id!, offset: 0 });
  }

  function onDragMove(e: ReactPointerEvent) {
    const s = dragState.current;
    if (!s) return;
    let offset = e.clientY - s.startY - s.shift;
    let list = s.list;
    const i = list.findIndex((x) => x.id === s.id);
    // Swap with a neighbour once the item has moved past half of it.
    const neighbour = offset > 0 ? list[i + 1] : list[i - 1];
    const h = neighbour ? rows.current.get(neighbour.id!)?.offsetHeight ?? 0 : 0;
    if (neighbour && h && Math.abs(offset) > h / 2) {
      const j = offset > 0 ? i + 1 : i - 1;
      list = [...list];
      [list[i], list[j]] = [list[j], list[i]];
      const moved = offset > 0 ? h : -h;
      s.shift += moved;
      offset -= moved;
      s.list = list;
      setDisplay(list);
    }
    setDrag({ id: s.id, offset });
  }

  function onDragEnd() {
    const s = dragState.current;
    if (!s) return;
    dragState.current = null;
    setDrag(null);
    repo.saveTaskOrder(s.list);
  }

  return (
    <div className="screen">
      <ScreenHeader title={t('follow_program')} subtitle={client?.name} onBack={() => goBack(paths.client(clientId))} />
      <div className="screen__content">
        <Card padding={18}>
          <div className="row align-end">
            <span className="display-sm">{doneCount}</span>
            <span className="title-lg muted grow">&nbsp;/ {tasks.length}</span>
            <span className="title-lg primary">{Math.round(progress * 100)}%</span>
          </div>
          <div className="mt-10">
            <ProgressBar progress={progress} />
          </div>
          <div className="text-sm muted mt-8">{t('program_done', doneCount, tasks.length)}</div>
        </Card>

        <div className="mt-10">
          <SwitchRow text={t('done_first')} checked={doneFirst} onChange={(v) => setSetting('tasksDoneFirst', v)} supporting={t('done_first_hint')} />
          <div className="text-sm muted hint">{t('drag_hint')}</div>
        </div>

        <div className="task-list">
          {display.map((task) => {
            const offset = drag && drag.id === task.id ? drag.offset : null;
            const dragging = offset != null;
            return (
              <div
                key={task.id}
                ref={(el) => (el ? rows.current.set(task.id!, el) : rows.current.delete(task.id!))}
                className={`task-row-wrap${dragging ? ' is-dragging' : ''}`}
                style={dragging ? { transform: `translateY(${offset}px) scale(1.03)` } : undefined}
              >
                <Card padding={10} onClick={() => repo.setTaskDone(task, !task.done)} className={dragging ? 'card--highlight' : undefined}>
                  <div className="row">
                    <span
                      className="drag-handle"
                      aria-label={t('drag_handle')}
                      onPointerDown={(e) => onDragStart(e, task)}
                      onPointerMove={onDragMove}
                      onPointerUp={onDragEnd}
                      onPointerCancel={onDragEnd}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Icon name="menu" />
                    </span>
                    <div className={`emoji-tile emoji-tile--sm ${task.done ? 'emoji-tile--tertiary' : ''}`}>{taskEmoji[task.kind]}</div>
                    <div className="grow min0">
                      <div className="title-sm clamp-2">{taskTitle(task)}</div>
                      {task.done && task.doneDate ? (
                        <button
                          type="button"
                          className="link-text tertiary text-sm"
                          aria-label={t('change_date')}
                          onClick={(e) => {
                            e.stopPropagation();
                            setDateFor(task);
                            datePicker.open(task.doneDate ?? today());
                          }}
                        >
                          {`${taskTag(task.kind)} · ${t('task_done_on', pretty(task.doneDate))}`}
                        </button>
                      ) : (
                        <div className="text-sm muted">{`${taskTag(task.kind)} · ${t('task_not_done')}`}</div>
                      )}
                    </div>
                    <span className={`check-circle${task.done ? ' is-done' : ''}`} aria-hidden="true">
                      {task.done && <Icon name="check" size={20} />}
                    </span>
                  </div>
                </Card>
              </div>
            );
          })}
        </div>
      </div>
      {datePicker.element}
    </div>
  );
}
