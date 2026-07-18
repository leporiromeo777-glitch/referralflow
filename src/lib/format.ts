export function eta(dob?: string | Date | null): string {
  if (!dob) return '';
  const d = new Date(dob);
  const diff = Date.now() - d.getTime();
  const anni = Math.floor(diff / (365.25 * 24 * 3600 * 1000));
  return `${anni}`;
}

export function giorniDa(date: string | Date): number {
  const d = new Date(date);
  return Math.floor((Date.now() - d.getTime()) / (24 * 3600 * 1000));
}

export function dataOra(date?: string | Date | null): string {
  if (!date) return '';
  return new Date(date).toLocaleString('it-CH', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}
