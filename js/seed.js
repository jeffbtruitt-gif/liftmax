// Fixed starter program. The 5 days and their 5 exercises each can't be added or deleted.
// Each entry: [exercise name, starting variation (equipment)]. The first-listed Focus is marked.

export const SEED_DAYS = [
  {
    number: 1, name: 'Legs', subtitle: 'Quads, hamstrings, glutes, calves', focus: 'Barbell Squat',
    exercises: [
      ['Barbell Squat', 'Barbell'],
      ['Deadlift', 'Barbell'],
      ['Bulgarian Split Squat', 'Dumbbell'],
      ['Seated Leg Curl', 'Machine'],
      ['Standing Calf Raise', 'Machine'],
    ],
  },
  {
    number: 2, name: 'Chest, Back & Arms', subtitle: 'Chest, lats, biceps, triceps', focus: 'Barbell Bench Press',
    exercises: [
      ['Barbell Bench Press', 'Barbell'],
      ['Seated Cable Row', 'Cable'],
      ['Lat Pulldown', 'Cable'],
      ['Dumbbell Bicep Curl', 'Dumbbell'],
      ['Cable Tricep Pushdown', 'Cable'],
    ],
  },
  {
    number: 3, name: 'Glutes, Hamstrings & Core', subtitle: 'Glutes, hamstrings, lower back, abs', focus: 'Hip Thrust Machine',
    exercises: [
      ['Hip Thrust Machine', 'Machine'],
      ['Single-Leg Romanian Deadlift', 'Dumbbell'],
      ['Back Extension', 'Bodyweight'],
      ['Hanging Knee Raises', 'Bodyweight'],
      ['Cable Woodchoppers', 'Cable'],
    ],
  },
  {
    number: 4, name: 'Shoulders, Chest & Back', subtitle: 'Delts, upper chest, upper back', focus: 'Dumbbell Shoulder Press',
    exercises: [
      ['Dumbbell Shoulder Press', 'Dumbbell'],
      ['Incline Dumbbell Bench Press', 'Dumbbell'],
      ['Chest-Supported Row', 'Machine'],
      ['Face Pulls', 'Cable'],
      ['Reverse Pec Deck', 'Machine'],
    ],
  },
  {
    number: 5, name: 'Arms & Core', subtitle: 'Biceps, triceps, abs', focus: 'EZ-Bar Preacher Curls',
    exercises: [
      ['Dumbbell Hammer Curls', 'Dumbbell'],
      ['EZ-Bar Preacher Curls', 'EZ-Bar'],
      ['Overhead Cable Tricep Extension', 'Cable'],
      ['Assisted Dips', 'Machine'],
      ['Cable Crunch', 'Cable'],
    ],
  },
];

export const SEED_EXTRAS = [
  {
    name: 'Leg accessories',
    exercises: [
      ['Hip Abductor Machine', 'Machine'],
      ['Leg Extension Machine', 'Machine'],
      ['Lying Leg Curl', 'Machine'],
    ],
  },
  {
    name: 'Chest & shoulder accessories',
    exercises: [
      ['Cable Chest Fly', 'Cable'],
      ['Dumbbell Lateral Raise', 'Dumbbell'],
    ],
  },
  {
    name: 'Back & core accessories',
    exercises: [
      ["Farmer's Carries", 'Dumbbell'],
    ],
  },
];

// Starting variation name for a new extra exercise, guessed from its name.
export function guessEquipment(name) {
  const n = name.toLowerCase();
  const rules = [
    [/ez[- ]?bar/, 'EZ-Bar'],
    [/smith/, 'Smith machine'],
    [/barbell/, 'Barbell'],
    [/dumbbell|\bdb\b/, 'Dumbbell'],
    [/kettlebell|\bkb\b/, 'Kettlebell'],
    [/cable|pulldown|pushdown|face pull/, 'Cable'],
    [/machine|pec deck|press machine/, 'Machine'],
    [/band/, 'Band'],
  ];
  for (const [re, label] of rules) if (re.test(n)) return label;
  return 'Standard';
}
