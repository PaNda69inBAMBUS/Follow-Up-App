import { useEffect, useRef, useState } from 'react';
import { repo } from '../data';
import { today, type LocalDate } from '../data/dates';
import { MEAL_TYPES, type Meal, type MealType, type NutritionPlan } from '../data/types';
import { t } from '../i18n';
import {
  AddButton,
  Card,
  CircleIconButton,
  ConfirmDialog,
  DateField,
  FieldLabel,
  HeaderTextAction,
  PrimaryButton,
  ScreenHeader,
  Sheet,
  SwitchRow,
  TextField,
  WeightResultChip,
} from '../ui/components';
import { fmt, mealEmoji, mealLabel, toDoubleLenient, toIntLenient } from '../ui/format';
import { Icon } from '../ui/icons';
import { goBack, paths } from '../ui/router';

const validNumber = (s: string) => !s.trim() || (toIntLenient(s) ?? -1) >= 0;
const text = (n: number | null) => (n != null ? String(n) : '');

/** Editable copy of a meal; fields are text so the user can type freely. */
interface MealDraft {
  key: number;
  type: MealType;
  time: string;
  foods: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
}

const order = (m: MealType) => MEAL_TYPES.indexOf(m);
const mealValid = (m: MealDraft) => [m.calories, m.protein, m.carbs, m.fat].every(validNumber);
const toMeal = (m: MealDraft): Meal => ({
  planId: 0,
  type: m.type,
  time: m.time.trim(),
  foods: m.foods.trim(),
  calories: toIntLenient(m.calories),
  proteinG: toIntLenient(m.protein),
  carbsG: toIntLenient(m.carbs),
  fatG: toIntLenient(m.fat),
  position: 0,
});

export function NutritionEditScreen({ clientId, planId }: { clientId: number; planId: number | null }) {
  const isNew = planId == null;
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [original, setOriginal] = useState<NutritionPlan | null>(null);
  const [clientName, setClientName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [addMenu, setAddMenu] = useState(false);

  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState<LocalDate>(today());
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [details, setDetails] = useState('');
  const [active, setActive] = useState(true);
  const [startWeight, setStartWeight] = useState('');
  const [endWeight, setEndWeight] = useState('');
  const [meals, setMeals] = useState<MealDraft[]>([]);
  const nextKey = useRef(0);

  useEffect(() => {
    (async () => {
      const client = await repo.getClient(clientId);
      if (!client) return goBack(paths.clients()); // stale link to a deleted client
      setClientName(client.name);
      if (planId == null) {
        // New plan: start from the client's most recent weight.
        const w = await repo.latestWeight(clientId);
        setStartWeight(w != null ? fmt(w) : '');
      } else {
        const p = await repo.getPlan(planId);
        if (p) {
          setOriginal(p);
          setTitle(p.title);
          setStartDate(p.startDate);
          setCalories(text(p.calories));
          setProtein(text(p.proteinG));
          setCarbs(text(p.carbsG));
          setFat(text(p.fatG));
          setDetails(p.details);
          setActive(p.active);
          setStartWeight(p.startWeight != null ? fmt(p.startWeight) : '');
          setEndWeight(p.endWeight != null ? fmt(p.endWeight) : '');
        }
        const stored = await repo.mealsForPlan(planId);
        setMeals(
          stored.map((m) => ({
            key: nextKey.current++,
            type: m.type,
            time: m.time,
            foods: m.foods,
            calories: text(m.calories),
            protein: text(m.proteinG),
            carbs: text(m.carbsG),
            fat: text(m.fatG),
          })),
        );
      }
      setLoaded(true);
    })();
  }, [clientId, planId]);

  // ---- Meals ----
  const blank = (type: MealType): MealDraft => ({ key: nextKey.current++, type, time: '', foods: '', calories: '', protein: '', carbs: '', fat: '' });

  /** Adds meals, keeping the list in day order (breakfast → evening snack). */
  const addMeals = (types: MealType[]) =>
    setMeals((list) => {
      let next = [...list];
      for (const type of types) {
        const index = next.reduce((last, m, i) => (order(m.type) <= order(type) ? i : last), -1) + 1;
        next = [...next.slice(0, index), blank(type), ...next.slice(index)];
      }
      return next;
    });
  const updateMeal = (key: number, change: Partial<MealDraft>) =>
    setMeals((list) => {
      const updated = list.map((m) => (m.key === key ? { ...m, ...change } : m));
      // A changed type moves the meal to its place in the day (stable for equal types).
      return change.type ? [...updated].sort((a, b) => order(a.type) - order(b.type)) : updated;
    });
  const removeMeal = (key: number) => setMeals((list) => list.filter((m) => m.key !== key));

  const asMeals = meals.map(toMeal);
  const anyMacros = asMeals.some((m) => m.calories != null || m.proteinG != null || m.carbsG != null || m.fatG != null);
  const sum = (f: (m: Meal) => number | null) => asMeals.reduce((s, m) => s + (f(m) ?? 0), 0);
  const totals = anyMacros
    ? { calories: sum((m) => m.calories), protein: sum((m) => m.proteinG), carbs: sum((m) => m.carbsG), fat: sum((m) => m.fatG) }
    : null;

  // ---- Validation ----
  const startWeightValid = !startWeight.trim() || toDoubleLenient(startWeight) != null;
  const endWeightValid = !endWeight.trim() || toDoubleLenient(endWeight) != null;
  const sw = toDoubleLenient(startWeight);
  const ew = toDoubleLenient(endWeight);
  const weightChange = sw != null && ew != null ? ew - sw : null;
  const p = toIntLenient(protein), c = toIntLenient(carbs), f = toIntLenient(fat);
  const macroCalories = p == null && c == null && f == null ? null : (p ?? 0) * 4 + (c ?? 0) * 4 + (f ?? 0) * 9;
  const canSave =
    !!title.trim() &&
    [calories, protein, carbs, fat].every(validNumber) &&
    startWeightValid &&
    endWeightValid &&
    meals.every(mealValid) &&
    !saving;

  const back = () => goBack(paths.client(clientId));

  async function save() {
    if (!canSave) return;
    setSaving(true);
    await repo.savePlan(
      {
        ...(original ?? {}),
        clientId,
        title: title.trim(),
        startDate,
        calories: toIntLenient(calories),
        proteinG: toIntLenient(protein),
        carbsG: toIntLenient(carbs),
        fatG: toIntLenient(fat),
        details: details.trim(),
        active,
        startWeight: sw,
        endWeight: ew,
      },
      asMeals,
    );
    back();
  }

  async function remove() {
    setConfirmDelete(false);
    if (original?.id != null) await repo.deletePlan(original.id);
    back();
  }

  return (
    <div className="screen">
      <ScreenHeader title={t(isNew ? 'new_nutrition_plan' : 'nutrition_plan')} subtitle={clientName || null} onBack={back} backIcon="close">
        {!isNew && <CircleIconButton icon="delete" label={t('delete_plan')} tone="danger" onClick={() => setConfirmDelete(true)} />}
        <HeaderTextAction text={t('save')} enabled={canSave} onClick={save} />
      </ScreenHeader>
      {loaded && (
        <form className="screen__content form" onSubmit={(e) => (e.preventDefault(), save())}>
          <TextField value={title} onChange={setTitle} label={t('plan_name')} placeholder={t('plan_name_hint')} />
          <DateField label={t('start_date')} value={startDate} onChange={setStartDate} />

          <FieldLabel text={t('meals')} />
          {meals.length === 0 && (
            <button type="button" className="full-day-btn" onClick={() => addMeals(['BREAKFAST', 'MORNING_SNACK', 'LUNCH', 'AFTERNOON_SNACK', 'DINNER'])}>
              <span className="full-day-btn__emoji">🍳🥗🍽️</span>
              <span className="grow">
                <span className="title-sm block">{t('add_full_day')}</span>
                <span className="text-sm block">{t('add_full_day_hint')}</span>
              </span>
              <Icon name="add" />
            </button>
          )}
          {meals.map((m) => (
            <MealEditor key={m.key} meal={m} onChange={(change) => updateMeal(m.key, change)} onRemove={() => removeMeal(m.key)} />
          ))}
          <AddButton text={t('add_meal')} onClick={() => setAddMenu(true)} />
          {totals && (
            <div className="totals-card">
              <div className="label-lg">{t('meals_total')}</div>
              <div className="title-sm">{t('meals_total_line', totals.calories, totals.protein, totals.carbs, totals.fat)}</div>
              <button
                type="button"
                className="text-btn text-btn--tertiary"
                onClick={() => {
                  setCalories(String(totals.calories));
                  setProtein(String(totals.protein));
                  setCarbs(String(totals.carbs));
                  setFat(String(totals.fat));
                }}
              >
                {t('use_as_targets')}
              </button>
            </div>
          )}

          <FieldLabel text={t('plan_weight_section')} />
          <div className="row row--fields">
            <TextField value={startWeight} onChange={setStartWeight} label={t('plan_start_weight')} kind="decimal" suffix={t('unit_kg')} error={!startWeightValid} />
            <TextField value={endWeight} onChange={setEndWeight} label={t('plan_end_weight')} kind="decimal" suffix={t('unit_kg')} error={!endWeightValid} />
          </div>
          {weightChange != null && (
            <div>
              <WeightResultChip change={weightChange} />
            </div>
          )}

          <FieldLabel text={t('daily_targets')} />
          <TextField
            value={calories}
            onChange={setCalories}
            label={t('calories')}
            kind="number"
            suffix={t('unit_kcal')}
            error={!validNumber(calories)}
            supporting={macroCalories != null ? t('macros_add_up', macroCalories) : null}
          />
          <div className="row row--fields">
            <TextField value={protein} onChange={setProtein} label={t('macro_protein')} kind="number" suffix={t('unit_g')} error={!validNumber(protein)} />
            <TextField value={carbs} onChange={setCarbs} label={t('macro_carbs')} kind="number" suffix={t('unit_g')} error={!validNumber(carbs)} />
            <TextField value={fat} onChange={setFat} label={t('macro_fat')} kind="number" suffix={t('unit_g')} error={!validNumber(fat)} />
          </div>

          <FieldLabel text={t('plan_notes')} />
          <TextField value={details} onChange={setDetails} label={t('plan_notes')} multiline minRows={3} placeholder={t('plan_notes_hint')} />
          <SwitchRow text={t('current_plan')} checked={active} onChange={setActive} supporting={t('current_plan_hint')} />
          <PrimaryButton text={t('save_plan')} onClick={save} enabled={canSave} />
        </form>
      )}

      {addMenu && (
        <Sheet onDismiss={() => setAddMenu(false)} label={t('add_meal')}>
          <h2 className="sheet__title">{t('add_meal')}</h2>
          <div className="stack-8">
            {MEAL_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                className="sheet-option"
                onClick={() => {
                  addMeals([type]);
                  setAddMenu(false);
                }}
              >
                <span className="sheet-option__emoji">{mealEmoji[type]}</span>
                {mealLabel(type)}
              </button>
            ))}
          </div>
        </Sheet>
      )}
      {confirmDelete && (
        <ConfirmDialog title={t('delete_plan_title')} text={t('delete_plan_text')} onConfirm={remove} onDismiss={() => setConfirmDelete(false)} />
      )}
    </div>
  );
}

function MealEditor({ meal, onChange, onRemove }: { meal: MealDraft; onChange: (c: Partial<MealDraft>) => void; onRemove: () => void }) {
  return (
    <Card padding={14}>
      <div className="row">
        <div className="emoji-tile">{mealEmoji[meal.type]}</div>
        {/* The phone's own picker changes the meal type. */}
        <label className="meal-type grow">
          <span className="title-md">{mealLabel(meal.type)}</span>
          <Icon name="dropDown" className="muted" />
          <select value={meal.type} aria-label={t('change_meal_type')} onChange={(e) => onChange({ type: e.target.value as MealType })}>
            {MEAL_TYPES.map((type) => (
              <option key={type} value={type}>
                {`${mealEmoji[type]}  ${mealLabel(type)}`}
              </option>
            ))}
          </select>
        </label>
        <CircleIconButton icon="delete" label={t('remove_meal')} tone="danger" size={40} onClick={onRemove} />
      </div>
      <div className="row row--fields mt-10 align-start">
        <TextField className="w-time" value={meal.time} onChange={(time) => onChange({ time })} label={t('meal_time')} placeholder={t('meal_time_hint')} inCard />
        <TextField
          value={meal.foods}
          onChange={(foods) => onChange({ foods })}
          label={t('meal_foods')}
          multiline
          minRows={2}
          placeholder={t('meal_foods_hint')}
          inCard
        />
      </div>
      <div className="row row--fields row--tight-fields mt-8">
        <TextField className="w-kcal" value={meal.calories} onChange={(calories) => onChange({ calories })} label={t('unit_kcal')} kind="number" error={!validNumber(meal.calories)} inCard />
        <TextField value={meal.protein} onChange={(protein) => onChange({ protein })} label={t('macro_p')} kind="number" error={!validNumber(meal.protein)} inCard />
        <TextField value={meal.carbs} onChange={(carbs) => onChange({ carbs })} label={t('macro_c')} kind="number" error={!validNumber(meal.carbs)} inCard />
        <TextField value={meal.fat} onChange={(fat) => onChange({ fat })} label={t('macro_f')} kind="number" error={!validNumber(meal.fat)} inCard />
      </div>
    </Card>
  );
}
