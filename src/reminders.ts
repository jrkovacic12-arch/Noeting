export function parseLocalPinTime(date: string, time: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) throw new Error('Use YYYY-MM-DD and 24-hour HH:mm.');
  const [year,month,day] = date.split('-').map(Number), [hour,minute] = time.split(':').map(Number);
  const value = new Date(year,month-1,day,hour,minute,0,0);
  if (value.getFullYear()!==year || value.getMonth()!==month-1 || value.getDate()!==day || value.getHours()!==hour || value.getMinutes()!==minute) throw new Error('Choose a valid local date and time.');
  if (value.getTime() <= Date.now()) throw new Error('Choose a future pin time.');
  return value.toISOString();
}

export function localPinFields(iso?: string | null) {
  const value = iso ? new Date(iso) : new Date(Date.now()+60*60*1000);
  const pad = (n:number)=>String(n).padStart(2,'0');
  return {date:`${value.getFullYear()}-${pad(value.getMonth()+1)}-${pad(value.getDate())}`,time:`${pad(value.getHours())}:${pad(value.getMinutes())}`};
}
