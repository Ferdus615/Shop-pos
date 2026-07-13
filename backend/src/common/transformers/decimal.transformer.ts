import { ValueTransformer } from 'typeorm';

/**
 * Postgres returns numeric/decimal columns as strings. This transformer keeps
 * money values as plain JS numbers on the entity side.
 */
export class ColumnNumericTransformer implements ValueTransformer {
  to(value?: number | null): number | null | undefined {
    return value;
  }

  from(value?: string | null): number | null {
    if (value === null || value === undefined) {
      return null;
    }
    return parseFloat(value);
  }
}

export const decimalTransformer = new ColumnNumericTransformer();
