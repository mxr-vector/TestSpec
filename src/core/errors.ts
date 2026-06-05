export class TestSpecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TestSpecError";
  }
}
