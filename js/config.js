// App-wide settings. Change these instead of editing app code.
export const CONFIG = {
  // Where data lives: 'local' (this device, works offline) or 'supabase'.
  backend: 'supabase',

  // Filled in when you switch backend to 'supabase'. See README.md.
  // Publishable key: safe to ship in the browser. Row Level Security limits every
  // signed-in user to their own rows in the lm_* tables.
  supabase: {
    url: 'https://kdelwwnpuuvgnamumhec.supabase.co',
    anonKey: 'sb_publishable_nlCjk_1qJDnnh4YHF2YwEw_RK2FiOlV',
  },

  // Passcode stub — only used with backend 'local' (cloud mode uses a real sign-in). When enabled, a passcode screen guards the app.
  // This is a convenience lock, not real security — the code ships to the browser.
  passcodeEnabled: false,
  passcode: '1234',
};
