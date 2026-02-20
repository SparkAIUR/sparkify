export enum ExitCode {
  Success = 0,
  GeneralFailure = 1,
  InvalidConfig = 2,
  InvalidDocsJson = 3,
  InvalidOpenApi = 4,
  BuildFailure = 5
}

export class SparkifyError extends Error {
  public readonly code: ExitCode;

  constructor(message: string, code: ExitCode = ExitCode.GeneralFailure) {
    super(message);
    this.name = "SparkifyError";
    this.code = code;
  }
}

export function toExitCode(error: unknown): ExitCode {
  if (error instanceof SparkifyError) {
    return error.code;
  }

  return ExitCode.GeneralFailure;
}
