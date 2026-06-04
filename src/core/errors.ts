export class TestPilotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TestPilotError";
  }
}
