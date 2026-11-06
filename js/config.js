// App-wide settings. Change these instead of editing app code.
export const CONFIG = {
  // Where data lives: 'local' (this device, works offline) or 'supabase'.
  backend: 'local',

  // Filled in when you switch backend to 'supabase'. See README.md.
  supabase: {
    url: '',
    anonKey: '',
  },

  // Sign-in stub. Single user: when enabled, a passcode screen guards the app.
  // This is a convenience lock, not real security — the code ships to the browser.
  passcodeEnabled: false,
  passcode: '1234',
};
