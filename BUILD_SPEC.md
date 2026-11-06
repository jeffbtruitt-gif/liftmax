# LiftMax — Build Spec for Claude Code

Build a mobile-first web app from this spec. The `design/` folder holds the five approved screens as HTML mockups (`.dc.html`). Match their layout, copy and colors. The sample weights and notes in them are placeholder data.

## Product in one line
LiftMax is a **reference board, not a log**. It shows where you are right now on every exercise and variation. It has no history, no charts and no progress tracking. It is for a single user.

## Brand
| Token | Hex | Use |
|---|---|---|
| Lift Orange | `#FF6A00` | Accent, Focus, primary buttons (button text `#0B0E12`) |
| Iron Black | `#0B0E12` | App background, input fields |
| Card | `#151A20` | Cards |
| Steel Gray | `#2B3440` | Borders, dividers |
| Concrete | `#D7D9DC` | Secondary text |
| Muted | `#9AA3AE` | Labels, captions |
| Chalk | `#F5F5F5` | Primary text |
| Focus tint | `#1A1410` bg / `#5A3418` border / `#FFB27A` text | Focus-day plan fields and Focus card |
| Danger | `#FF8A80` text / `#6B2A2A` border | Delete buttons |

- **Fonts:** Montserrat ExtraBold 800 for headings and the wordmark (the wordmark is "LIFT" in Chalk and "MAX" in Orange, italic), and Inter for everything else.
- **Shapes:** cards have a 16px radius and inputs a 12px radius.
- **Touch targets:** at least 44px.
- **Icons:** inline stroke SVGs. Don't use emoji.

## Navigation
The bottom tab bar has three tabs: **Days**, **Extras** and **Workouts**.

## Screens

### 1. Home / Days (`Main.dc.html`)
- Shows the 5 fixed program days. Each card shows the day number, the day name and "Focus: {exercise}".
- Below the days are two shortcut cards, one for Extras and one for Workouts.
- A settings button sits in the header.

### 2. Day (`Day.dc.html`)
- Shows the day's 5 fixed exercises.
- **Focus:** exactly one exercise per day is the Focus.
  - Its card has an orange border and a FOCUS chip.
  - It lists **all** of its variations with their weight × reps, with the main variation tagged MAIN.
  - It shows the main variation's focus-day plan.
- **Moving Focus:** every other exercise has a target button. Tapping it makes that exercise the Focus. This is saved per day.
- **Other exercise cards** show the exercise name plus the **main variation's** weight × reps in bold, with the variation name beside it. Tapping a card opens the Exercise screen.

### 3. Exercise (`Exercise.dc.html`)
- **Header:** the exercise name, a FOCUS chip if this exercise is today's Focus, and a **Form & tips** button. The button opens `https://www.google.com/search?q={exercise name} form tips` in a new tab.
- **Variations:** listed with the main variation first. Each variation card has:
  - its name, a MAIN tag if it is the main variation, and "Updated {date}" (the date the weight or reps last changed);
  - Weight and Reps fields: short free text such as "35 lbs" or "6", edited in place and autosaved;
  - a **Focus-day plan**: a 3-line text box with its own note per variation;
  - **Set as main** on variations that aren't main. Only one variation per exercise can be main, and it is the one shown on the Day screen.
  - a ⋯ menu with **Rename** and **Delete variation**. Delete asks for confirmation. If you delete the main variation, the next one becomes main.
- **Add variation** button.
- **General notes:** one notes box per exercise, autosaved.

### 4. Extras (`Extras.dc.html`)
- Accessory exercises kept separately from the 5 days, organized in named groups.
- Each row shows the exercise name and its main variation's weight × reps. Tapping a row opens the same Exercise screen, but without the Focus elements.
- Each row's ⋯ menu offers **Edit** (rename), **Move group** and **Delete**.
- The **+** button adds an extra exercise: you enter a name and pick a group or create one.
- **Groups:** groups can be added, renamed and deleted. You can only delete an empty group, or the app asks for confirmation and deletes its exercises too.

### 5. Workouts (`Log.dc.html`)
- Saved, repeatable workouts done outside the planned days. Each one has only a **title** and **notes**, with no date.
- The list shows the title and a 2-line preview of the notes. Tapping a workout opens the editor.
- In the editor you can edit the title and notes, save, or delete (with confirmation).
- The **+** button creates a new workout.

## Add / Edit / Delete rule (required)
Everything the user can add, they must also be able to edit and delete:

| Item | Add | Edit | Delete |
|---|---|---|---|
| Variation | Add variation | Rename; weight, reps, focus plan inline | ⋯ › Delete variation |
| Extra exercise | + on Extras | ⋯ › Edit, Move group | ⋯ › Delete |
| Extras group | + on Extras (new group) | Rename | Delete |
| Workout | + on Workouts | Open › edit › Save | Trash icon in editor |
| Notes (general, focus plan) | — | Inline | Clear text |

The 5 days and their 5 exercises each are **fixed seed data** and cannot be added or deleted. Their variations and notes are fully editable.

## Data model
```
Day            { id, number, name, focusExerciseId }
Exercise       { id, name, dayId | null, extrasGroupId | null, position, generalNotes, mainVariationId }
Variation      { id, exerciseId, name, weight (text), reps (text), focusPlan (text), position, updatedAt }
ExtrasGroup    { id, name, position }
Workout        { id, title, notes, position, updatedAt }
```
- Set `updatedAt` on a variation only when its weight or reps change.
- Keep all reads and writes behind one data-access module, such as `store.js` with functions like `getDays()` and `updateVariation()`. **The backend must be swappable.** Start with localStorage so the app works offline, and make it easy to switch the store to Supabase later.
- **Sign-in:** single user. Leave a simple passcode screen as a stub behind a flag for now.

## Seed data

**Day 1 – Legs:** Barbell Squat (Focus), Deadlift, Bulgarian Split Squat, Seated Leg Curl, Standing Calf Raise

**Day 2 – Chest, Back & Arms:** Barbell Bench Press (Focus), Seated Cable Row, Lat Pulldown, Dumbbell Bicep Curl, Cable Tricep Pushdown

**Day 3 – Glutes, Hamstrings & Core:** Hip Thrust Machine (Focus), Single-Leg Romanian Deadlift, Back Extension, Hanging Knee Raises, Cable Woodchoppers

**Day 4 – Shoulders, Chest & Back:** Dumbbell Shoulder Press (Focus), Incline Dumbbell Bench Press, Chest-Supported Row, Face Pulls, Reverse Pec Deck

**Day 5 – Arms & Core:** Dumbbell Hammer Curls, EZ-Bar Preacher Curls (Focus), Overhead Cable Tricep Extension, Assisted Dips, Cable Crunch

**Extras groups:**
- Leg accessories: Hip Abductor Machine, Leg Extension Machine, Lying Leg Curl
- Chest & shoulder accessories: Cable Chest Fly, Dumbbell Lateral Raise
- Back & core accessories: Farmer's Carries

Seed each exercise with one variation named after its equipment (Barbell, Dumbbell, Machine, Cable…), with empty weight and reps. Seed no workouts.

## Build notes
- **Layout:** design for a phone first (390px wide) and center the app at up to 480px wide on desktop.
- **Saving:** autosave edits when a field loses focus or 500ms after typing stops. There is no Save button except in the Workouts editor.
- **Accessibility:** use real `<button>`, `<a>` and `<label>`/`<input>` elements, and give icon-only buttons an `aria-label`.
