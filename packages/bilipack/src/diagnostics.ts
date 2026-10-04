export interface Diagnostic {
  field: string;
  code: string;
  message: string;
}

export class ValidationError extends Error {
  constructor(public readonly diagnostics: Diagnostic[]) {
    super(diagnostics.map((d) => `${d.field}: ${d.message}`).join('\n'));
    this.name = 'ValidationError';
  }
}
