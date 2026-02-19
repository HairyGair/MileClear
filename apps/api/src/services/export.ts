// PDF/CSV generation for tax reports

export async function generateSelfAssessmentPdf(
  _userId: string,
  _taxYear: string
): Promise<Buffer> {
  // TODO: generate HMRC-compliant PDF
  throw new Error("Not implemented");
}

export async function generateTripsCsv(
  _userId: string,
  _from: Date,
  _to: Date
): Promise<string> {
  // TODO: generate CSV export
  throw new Error("Not implemented");
}
