// Neon HTTP driver, tagged-template SQL, no ORM. Server-side only.
import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

let _sql: NeonQueryFunction<false, false> | null = null;

function client(): NeonQueryFunction<false, false> {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    _sql = neon(url); // lazy: keeps `next build` working without env
  }
  return _sql;
}

/** Tagged template: sql`select * from repos where id = ${id}` */
export const sql = ((strings: TemplateStringsArray, ...values: unknown[]) =>
  client()(strings, ...values)) as NeonQueryFunction<false, false>;

export function dbConfigured(): boolean {
  return !!process.env.DATABASE_URL;
}
