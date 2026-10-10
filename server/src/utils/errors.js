export class AppError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export function assert(condition, message, status = 400) { if (!condition) throw new AppError(message, status); }
export const cents = (value) => Math.round(Number(value) * 100);
export const money = (value) => Math.round(value) / 100;
export const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guatemala' });
