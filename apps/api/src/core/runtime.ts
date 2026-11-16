/** Settings and callbacks provided by whoever hosts the core (Node server or browser demo). */
export const config = {
  /** demo installation: show demo logins, demo data */
  demo: true,
  /** confirmation emails are actually sent */
  emailEnabled: false,
  /** how many days of departures are generated ahead */
  scheduleDays: 60,
};
export function setConfig(c: Partial<typeof config>) { Object.assign(config, c); }

export const hooks: {
  bookingCreated?: (code: string) => void;
  bookingCancelled?: (code: string) => void;
} = {};
